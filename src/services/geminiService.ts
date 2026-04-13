import { GoogleGenAI, Type } from "@google/genai";
import { PDFDocument } from "pdf-lib";
import { Question, ErrorAnalysis } from "../types";

// ============================================================
// MODEL CONFIGURATION
// - gemini-2.5-pro  : Số hóa đề từ PDF (cần Vision + reasoning sâu)
// - gemini-2.5-flash: Số hóa DOCX (text input) / Phân tích câu trả lời
// ============================================================
const MODELS = {
  DIGITIZE: "gemini-2.5-flash",  // ── COST FIX: Flash only (Pro đắt 17x, chất lượng Flash đã đủ)
  ANALYZE:  "gemini-2.5-flash",
} as const;

// ~20K chars ≈ 10-15 câu/chunk — tránh overload API với đề lớn (100+ câu)
const MAX_CHUNK_SIZE = 20_000;
const MAX_CONCURRENCY = 1; // Tối đa 1 chunk song song — giảm áp lực API / chống Rate Limit 429

const getAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not defined. Please check your environment settings.");
  }
  return new GoogleGenAI({ apiKey });
};

// ============================================================
// ANALYZE ANSWER — dùng Flash cho tốc độ
// ============================================================
export async function analyzeAnswer(
  question: Question,
  studentAnswer: any,
  isCorrect: boolean
): Promise<{ analysis: ErrorAnalysis; feedback: string }> {
  const ai = getAI();

  const prompt = `
Bạn là Chuyên gia Sư phạm Vật lý cấp cao của dự án PHYS-9+.
Nhiệm vụ: Phân tích CỰC KỲ CHÍNH XÁC câu trả lời của học sinh và phân loại sai lầm.

=== DỮ LIỆU CÂU HỎI ===
Phần: ${question.part} (${question.part === 1 ? 'Trắc nghiệm 4 lựa chọn' : question.part === 2 ? 'Đúng/Sai 4 ý' : 'Trả lời ngắn'})
Chủ đề: ${question.topic}
Mức độ: ${question.level}
Nội dung: ${question.content}
Đáp án đúng: ${JSON.stringify(question.correctAnswer)}
Lời giải: ${question.explanation}

=== CÂU TRẢ LỜI HỌC SINH ===
${JSON.stringify(studentAnswer)}
Kết quả: ${isCorrect ? "✓ ĐÚNG" : "✗ SAI"}

=== YÊU CẦU PHÂN TÍCH ===
1. PHÂN LOẠI LỖI (bắt buộc nếu sai):
   - "Lỗi hiểu sai bản chất": Nhầm lẫn khái niệm, định luật vật lý.
   - "Lỗi kỹ năng": Biết lý thuyết nhưng không biết cách vận dụng.
   - "Lỗi kỹ thuật": Tính toán sai, dùng sai đơn vị.

2. PHẢN HỒI theo cấu trúc: [Đúng/Sai] → [Bản chất Vật lý cốt lõi] → [Lời khuyên chiến thuật].

3. CHUẨN CHƯƠNG TRÌNH: Chỉ dùng kiến thức Vật lý THPT - GDPT 2018.
  `.trim();

  try {
    const response = await ai.models.generateContent({
      model: MODELS.ANALYZE,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                reason: { type: Type.STRING },
                advice: { type: Type.STRING }
              },
              required: ["type", "reason", "advice"]
            },
            feedback: { type: Type.STRING }
          },
          required: ["analysis", "feedback"]
        }
      }
    });

    const rawText = response.text || "{}";
    const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      analysis: {
        type: "Lỗi kỹ thuật",
        reason: "Không thể kết nối với AI lúc này.",
        advice: "Hãy kiểm tra lại kết nối mạng hoặc API Key."
      },
      feedback: isCorrect ? "[Đúng] → Bạn đã làm tốt!" : "[Sai] → Hãy kiểm tra lại kiến thức cơ bản."
    };
  }
}

// ============================================================
// DIAGNOSE FULL EXAM — Phân tích tổng thể một lần
// ============================================================

// ── COST FIX: Cache diagnosis results to avoid re-calling AI ──
function getDiagnosisCache(key: string) {
  try {
    const cached = sessionStorage.getItem(`phy8_diag_${key}`);
    if (cached) return JSON.parse(cached);
  } catch { /* empty */ }
  return null;
}

function setDiagnosisCache(key: string, data: any) {
  try {
    sessionStorage.setItem(`phy8_diag_${key}`, JSON.stringify(data));
  } catch { /* full storage */ }
}

// ── COST FIX: Strip HTML & truncate to reduce token count ──
function compressForPrompt(text: string, maxLen = 200): string {
  return (text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen);
}

export async function diagnoseUserExam(
  incorrectRecords: { question: Question, studentAnswer: any, isCorrect: boolean }[],
  skippedRecords: { question: Question, studentAnswer: any, isCorrect: boolean }[] = []
): Promise<{ 
  feedback: string;
  redZones: string[];
  remedialMatrix: { topic: string; count: number }[];
  behavioralAnalysis: { carelessCount: number; fundamentalCount: number; skippedCount: number };
}> {

  if (incorrectRecords.length === 0 && skippedRecords.length === 0) {
    return {
      feedback: "Tuyệt vời! Bạn không sai câu nào và không bỏ trống câu nào. Không phát hiện lỗ hổng.",
      redZones: [],
      remedialMatrix: [],
      behavioralAnalysis: { carelessCount: 0, fundamentalCount: 0, skippedCount: 0 }
    };
  }

  // ── COST FIX: Check cache first ──
  const cacheKey = incorrectRecords.map(r => `${r.question.id}_${JSON.stringify(r.studentAnswer)}`).join('|')
    + '||' + skippedRecords.length;
  const cached = getDiagnosisCache(cacheKey);
  if (cached) {
    console.info('[Diagnosis] Cache hit — skipping AI call');
    return cached;
  }

  const ai = getAI();

  // ── COST FIX: Compressed prompt — strip HTML, truncate content, no explanation → saves ~40% tokens ──
  const prompt = `
Bạn là Chuyên gia Sư phạm Vật lý cấp cao của dự án PHYS-9+.
Học sinh vừa hoàn thành một bài test, kết quả như sau:
- Câu LÀM SAI (Incorrect): ${incorrectRecords.length}
- Câu BỎ TRỐNG (Skipped): ${skippedRecords.length}

=== DANH SÁCH CÂU SAI ===
${incorrectRecords.length > 0 ? incorrectRecords.map((r, i) => `#${i + 1}: [${r.question.topic}|${r.question.level}] ${compressForPrompt(r.question.content)} → Đúng: ${JSON.stringify(r.question.correctAnswer)} | HS: ${JSON.stringify(r.studentAnswer)}`).join("\n") : "Không có câu nào làm sai."}

=== YÊU CẦU PHÂN TÍCH CHUẨN ĐOÁN ===
Dựa vào chuẩn kiến thức GDPT 2018 môn Vật lý:
1. Đánh giá tổng quan về các lỗ hổng kiến thức chính (redZones). Liệt kê cụ thể tên các chủ đề nhỏ bị rỗng. Dựa chủ yếu vào phần CÂU SAI.
2. Viết Phản hồi (feedback) bằng Markdown để học sinh.
${skippedRecords.length > 0 ? `   - [QUAN TRỌNG] Học sinh đã bỏ trống ${skippedRecords.length} câu! Hãy BẮT BUỘC đưa ra lời khuyên khắt khe về Chiến thuật quản lý thời gian, yêu cầu tuyệt đối không được bỏ trống vì thi trắc nghiệm không trừ điểm sai.` : ''}
   - Tập trung kê đơn để lấp lỗ hổng cho các câu 'Làm sai'.
3. Đếm số lỗi "careless" (ẩu, tính sai) và "fundamental" (sai bản chất vật lý) TỪ CÁC CÂU LÀM SAI.
4. TẠO MA TRẬN KHẮC PHỤC (remedialMatrix): Tính toán phân bổ ĐÚNG 28 câu hỏi ưu tiên tập trung dồn dập vào chính các chủ đề (topic) mà học sinh làm sai ở trên. Ví dụ: Nếu sai nhiều ở "Động lực học", hãy phân cho nó 15 câu, các chủ đề khác bù vào sao cho tổng số đúng bằng 28. Trả về mảng các object { topic: string, count: number } với tổng count phải BẰNG CHÍNH XÁC 28.

Trả về ĐÚNG định dạng JSON Schema yêu cầu.
  `.trim();

  try {
    const response = await ai.models.generateContent({
      model: MODELS.ANALYZE,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            redZones: { type: Type.ARRAY, items: { type: Type.STRING } },
            feedback: { type: Type.STRING },
            remedialMatrix: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  topic: { type: Type.STRING }, 
                  count: { type: Type.INTEGER } 
                },
                required: ["topic", "count"]
              } 
            },
            behavioralAnalysis: {
              type: Type.OBJECT,
              properties: {
                carelessCount: { type: Type.INTEGER },
                fundamentalCount: { type: Type.INTEGER }
              },
              required: ["carelessCount", "fundamentalCount"]
            }
          },
          required: ["redZones", "feedback", "remedialMatrix", "behavioralAnalysis"]
        }
      }
    });

    const rawText = response.text || "{}";
    const cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);
    
    // Đảm bảo có skippedCount trong kết quả trả về
    if (!result.behavioralAnalysis.skippedCount) {
      result.behavioralAnalysis.skippedCount = skippedRecords.length;
    }
    
    // ── COST FIX: Cache result for this session ──
    setDiagnosisCache(cacheKey, result);

    return result;
  } catch (error) {
    console.error("Gemini Batch Diagnosis Error:", error);
    return {
      feedback: "Không thể phân tích dữ liệu lúc này do lỗi hệ thống.",
      redZones: [],
      remedialMatrix: [],
      behavioralAnalysis: { carelessCount: 0, fundamentalCount: incorrectRecords.length, skippedCount: skippedRecords.length }
    };
  }
}

// ============================================================
// CÂY KIẾN THỨC VẬT LÝ THPT (GDPT 2018)
// ============================================================
const PHYSICS_KNOWLEDGE_TREE = `
=== CÂY KIẾN THỨC VẬT LÝ THPT (GDPT 2018) ===

【Khối 10】
Mở đầu
Động học: Mô tả chuyển động | Chuyển động biến đổi
Động lực học: Ba định luật Newton về chuyển động | Một số lực trong thực tiễn | Cân bằng lực, moment lực | Khối lượng riêng, áp suất chất lỏng
Công, năng lượng, công suất: Công và năng lượng | Động năng và thế năng | Công suất và hiệu suất
Động lượng: Định nghĩa động lượng | Bảo toàn động lượng | Động lượng và va chạm
Chuyển động tròn: Động học của chuyển động tròn đều | Gia tốc hướng tâm và lực hướng tâm
Biến dạng của vật rắn: Biến dạng kéo và biến dạng nén | Đặc tính của lò xo | Định luật Hooke

【Khối 11】
Dao động: Dao động điều hoà | Dao động tắt dần, hiện tượng cộng hưởng
Sóng: Mô tả sóng | Sóng dọc và sóng ngang | Sóng điện từ | Giao thoa sóng kết hợp | Sóng dừng | Đo tốc độ truyền âm
Trường điện (Điện trường): Lực điện tương tác giữa các điện tích | Khái niệm điện trường | Điện trường đều | Điện thế và thế năng điện | Tụ điện và điện dung
Dòng điện, mạch điện: Cường độ dòng điện | Mạch điện và điện trở | Năng lượng điện, công suất điện

【Khối 12】
Vật lí nhiệt: Sự chuyển thể | Nội năng, định luật 1 của nhiệt động lực học | Thang nhiệt độ, nhiệt kế | Nhiệt dung riêng, nhiệt nóng chảy riêng, nhiệt hoá hơi riêng
Khí lí tưởng: Mô hình động học phân tử chất khí | Phương trình trạng thái | Áp suất khí theo mô hình động học phân tử | Động năng phân tử
Trường từ (Từ trường): Khái niệm từ trường | Lực từ tác dụng lên đoạn dây dẫn mang dòng điện; Cảm ứng từ | Từ thông; Cảm ứng điện từ
Vật lí hạt nhân và phóng xạ: Cấu trúc hạt nhân | Độ hụt khối và năng lượng liên kết hạt nhân | Sự phóng xạ và chu kì bán rã

【Khối Chuyên đề】
Chuyên đề Lớp 10: Vật lí trong một số ngành nghề | Trái Đất và bầu trời | Vật lí với giáo dục về bảo vệ môi trường
Chuyên đề Lớp 11: Trường hấp dẫn | Truyền thông tin bằng sóng vô tuyến | Mở đầu về điện tử học
Chuyên đề Lớp 12: Dòng điện xoay chiều | Một số ứng dụng vật lí trong chẩn đoán y học | Vật lí lượng tử

Mức độ: Nhận biết(NB) | Thông hiểu(TH) | Vận dụng(VD) | Vận dụng cao(VDC)
`;

// ============================================================
// SHARED: Prompt & Schema — Đọc BẤT KỲ đề nào
// ============================================================

function buildDigitizePromptBase(inputDescription: string, topicHint?: string): string {
  return `
Chuyên gia Số hóa Đề thi Vật lý THPT.

## NHIỆM VỤ
Số hóa ${inputDescription} thành JSON.
${topicHint ? `Gợi ý chủ đề: ${topicHint}` : 'Tự nhận diện chủ đề.'}

${PHYSICS_KNOWLEDGE_TREE}

## QUY TẮC

【1】NHẬN DIỆN CẤU TRÚC:
• Có a),b),c),d) chữ thường → part=2 (Đúng/Sai). YÊU CẦU QUAN TRỌNG: KHÔNG ĐƯỢC tự động chuyển đổi thành A., B., C., D. chữ HOA. Nội dung trong mảng \`options\` của Phần 2 BẮT BUỘC PHẢI XÓA BỎ CÁC TIỀN TỐ "a)", "b)", "c)", "d)" Ở ĐẦU CÂU (chỉ lấy mệnh đề thuần túy). MỘT LẦN NỮA: Phần II KHÔNG ĐƯỢC CHỨA CÁC CHỮ A. B. C. D. TRONG OPTIONS!
• Có A.,B.,C.,D. chữ HOA → part=1 (Trắc nghiệm)
• Yêu cầu điền số → part=3 (Trả lời ngắn)

【2】CORRECTANSWER (LUÔN LÀ STRING, KHÔNG null):
Part 1: "0"=A, "1"=B, "2"=C, "3"=D. Tìm <u>/<b>/*/✓ hoặc bảng đáp án hoặc tự giải.
Part 2: "true,true,false,false" (4 giá trị)
Part 3: "2.45" (đáp số)
Ưu tiên: <u>gạch chân → <b>đậm → */✓ → bảng đáp án cuối đề → AI tự giải

【3】TOPIC/LEVEL/TAGS/SUB_TOPIC:
Trường "topic": CHỈ ĐƯỢC ĐIỀN TÊN MỤC LỚN (Ví dụ: "Trường từ (Từ trường)", "Động học").
Trường "sub_topic": CHỈ ĐƯỢC ĐIỀN TÊN MỤC CHI TIẾT (Ví dụ: "Từ thông; Cảm ứng điện từ", "Chuyển động biến đổi"). Nếu mục lớn không có phân nhánh thì để trống.
Nếu có #Chương:/#Bài:/#Dạng: trong text → trích xuất chính xác, XÓA SẠCH khỏi content.
Nếu không → tự suy luận dựa theo CÂY KIẾN THỨC VẬT LÝ THPT ở trên. tags >= 2.

【6】LaTeX: Δ→$\\Delta$, ω→$\\omega$, phân số→$\\frac{a}{b}$, vector→$\\vec{F}$

【7】HÌNH: Giữ nguyên marker [IMG_1], [IMG_2] ở cuối content.

【8】BẢNG: Có bảng → **[BẢNG SỐ LIỆU]**

【9】GIẢI: Có lời giải → trích nguyên văn + LaTeX. Không có → "Chưa có lời giải chi tiết."

【10】KIỂM TRA: correctAnswer hợp lệ? topic cụ thể? tags>=2? LaTeX đủ? groupId cho câu kép?
  `.trim();
}

// ─── Bổ sung cho câu kép + câu chùm ──────────────────────────────────────
const PAIRED_AND_CLUSTER_RULE = `

【11】CÂU KÉP PHẦN II:
Hai câu liền kề cùng đề bài → SAO CHÉP nguyên văn đề chung vào content CẢ HAI câu.
Gán cùng groupId ("g1","g2"...). Câu đơn: không có groupId.

【12】CÂU CHÙM (CLUSTER):
Nhận diện: "Sử dụng thông tin sau...", "Dựa vào dữ kiện...", đoạn dữ kiện dài cho nhiều câu.
Output: {"item_type":"cluster", "shared_context":"...", "topic":"...", "sub_questions":[{câu đầy đủ}...]}
Câu đơn: {"item_type":"single", ...các trường câu hỏi...}
⛔ KHÔNG tách riêng câu chùm thành câu đơn.
`;

function buildDigitizePromptFull(inputDescription: string, topicHint?: string): string {
  return buildDigitizePromptBase(inputDescription, topicHint) + PAIRED_AND_CLUSTER_RULE;
}

// ─── Schema cho output AI: hỗ trợ cả single và cluster ──────────────────
const QUESTION_ITEM_PROPERTIES = {
  part:          { type: Type.INTEGER },
  topic:         { type: Type.STRING },
  sub_topic:     { type: Type.STRING },
  level:         { type: Type.STRING },
  content:       { type: Type.STRING },
  options:       { type: Type.ARRAY, items: { type: Type.STRING } },
  correctAnswer: { type: Type.STRING },
  explanation:   { type: Type.STRING },
  tags:          { type: Type.ARRAY, items: { type: Type.STRING } },
  groupId:       { type: Type.STRING },
  resources: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        url:   { type: Type.STRING },
        type:  { type: Type.STRING }
      },
      required: ["title", "url", "type"]
    }
  },
  simulationUrl: { type: Type.STRING }
} as const;

const DIGITIZE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      // ── Discriminator ──
      item_type:      { type: Type.STRING },  // "single" | "cluster"
      // ── Single question fields ──
      ...QUESTION_ITEM_PROPERTIES,
      // ── Cluster fields ──
      shared_context: { type: Type.STRING },
      sub_questions:  {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: QUESTION_ITEM_PROPERTIES,
          required: ["part", "content", "correctAnswer", "tags", "explanation"]
        }
      },
    },
    required: ["item_type"]
  }
} as const;

// ============================================================
// Normalize correctAnswer — chuyển output AI thô → đúng type UI cần
// ============================================================

/**
 * Chuyển đổi correctAnswer từ nhiều format AI có thể trả về
 * thành đúng kiểu mà QuestionReviewBoard UI yêu cầu:
 *  - Part 1: number (0-3)
 *  - Part 2: boolean[] (4 phần tử)
 *  - Part 3: number
 * Trả về { value, needsReview } — needsReview=true khi fallback.
 */
function normalizeCorrectAnswer(raw: any, part: number): { value: any; needsReview: boolean } {
  // ── PART 1: Trắc nghiệm → số nguyên 0-3 ──
  if (part === 1) {
    // Đã là số hợp lệ
    if (typeof raw === 'number' && [0, 1, 2, 3].includes(raw)) return { value: raw, needsReview: false };

    // Chuỗi chữ cái: "A", "B", "C", "D" (có thể lẫn text thừa)
    if (typeof raw === 'string') {
      const cleaned = raw.trim().toUpperCase();
      // Tìm chữ cái A-D đầu tiên trong chuỗi
      const match = cleaned.match(/\b([ABCD])\b|\.?\s*([ABCD])\s*\.?/);
      if (match) {
        const letter = (match[1] || match[2]);
        const MAP: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        if (letter && MAP[letter] !== undefined) return { value: MAP[letter], needsReview: false };
      }
      // Thử parse như số
      const numVal = parseInt(cleaned, 10);
      if ([0, 1, 2, 3].includes(numVal)) return { value: numVal, needsReview: false };
    }

    // Object dạng {"answer": "C"} hoặc {"correct_answer": "B"}
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const val = raw.answer || raw.correct_answer || raw.correctAnswer || raw.value;
      if (val !== undefined) return normalizeCorrectAnswer(val, 1);
    }

    // Fallback: 0 (A) + đánh dấu cần review
    console.warn('[normalizeCorrectAnswer] Part 1: ⚠️ Không parse được → cần review. Raw:', raw);
    return { value: 0, needsReview: true };
  }

  // ── PART 2: Đúng/Sai → boolean[4] ──
  if (part === 2) {
    // Đã đúng format
    if (Array.isArray(raw) && raw.length === 4 && raw.every((v: any) => typeof v === 'boolean')) {
      return { value: raw, needsReview: false };
    }

    // Mảng nhưng phần tử chưa phải boolean
    if (Array.isArray(raw)) {
      const normalized = raw.slice(0, 4).map((v: any) => {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          return s === 'true' || s === 'đ' || s === 'đúng' || s === '✓' || s === '✔' || s === '*';
        }
        if (typeof v === 'number') return v === 1 || v > 0;
        return false;
      });
      while (normalized.length < 4) normalized.push(false);
      return { value: normalized, needsReview: false };
    }

    // Chuỗi: "Đ, S, S, Đ" hoặc "true, false, true, false"
    if (typeof raw === 'string') {
      const parts = raw.split(/[,\-;/\s]+/).filter(Boolean);
      if (parts.length >= 4) {
        return { value: parts.slice(0, 4).map((s: string) => {
          const v = s.trim().toLowerCase();
          return v === 'true' || v === 'đ' || v === 'đúng' || v === '✓' || v === '✔' || v === '*' || v === '1';
        }), needsReview: false };
      }
    }

    // Object dạng {"a": true, "b": false, "c": true, "d": false}
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const keys = ['a', 'b', 'c', 'd'];
      const fromObj = keys.map(k => {
        const v = raw[k] ?? raw[k.toUpperCase()];
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          return s === 'true' || s === 'đ' || s === 'đúng';
        }
        return false;
      });
      return { value: fromObj, needsReview: false };
    }

    console.warn('[normalizeCorrectAnswer] Part 2: ⚠️ Không parse được → cần review. Raw:', raw);
    return { value: [false, false, false, false], needsReview: true };
  }

  // ── PART 3: Trả lời ngắn → number ──
  if (part === 3) {
    if (typeof raw === 'number' && !isNaN(raw)) return { value: raw, needsReview: false };

    if (typeof raw === 'string') {
      const cleaned = raw.replace(/,/g, '.');
      const numMatch = cleaned.match(/-?\d+\.?\d*/);
      if (numMatch) {
        const val = parseFloat(numMatch[0]);
        if (!isNaN(val)) return { value: val, needsReview: false };
      }
    }

    if (typeof raw === 'object' && raw !== null) {
      const val = raw.answer || raw.correct_answer || raw.correctAnswer || raw.value;
      if (val !== undefined) return normalizeCorrectAnswer(val, 3);
    }

    console.warn('[normalizeCorrectAnswer] Part 3: ⚠️ Không parse được → cần review. Raw:', raw);
    return { value: 0, needsReview: true };
  }

  return { value: raw, needsReview: false };
}

/**
 * Sanitize LaTeX: Chuyển dấu < thành \lt bên trong $...$ để trình duyệt
 * không hiểu nhầm là thẻ HTML (nguyên nhân gây mất nội dung đáp án).
 *
 * VD: "$v_r < v_l < v_k$" → "$v_r \lt v_l \lt v_k$"
 *     "$a <= b$"          → "$a \leq b$"
 *     "nhiệt độ < 100"    → giữ nguyên (nằm ngoài $...$)
 */
function sanitizeLatexHtml(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\$([^$]+)\$/g, (_m, inner: string) => {
    let s = inner;
    s = s.replace(/(?<!\\)<=\s*/g, '\\leq ');
    s = s.replace(/(?<!\\)>=\s*/g, '\\geq ');
    s = s.replace(/(?<!\\)<(?!=)/g, '\\lt ');
    return `$${s}$`;
  });
}

/**
 * Normalize toàn bộ mảng Question[] sau khi nhận từ AI.
 * Đảm bảo correctAnswer luôn đúng kiểu cho UI.
 * Gắn tag '__needs_answer_review' nếu không parse được đáp án.
 * + Sanitize LaTeX HTML: tự động chuyển < → \lt trong $...$
 */
export function normalizeQuestions(rawItems: any[]): Question[] {
  const flattened = flattenClusterOutput(rawItems);
  return flattened.map(q => {
    const { value, needsReview } = normalizeCorrectAnswer(q.correctAnswer, q.part);

    // ── Sanitize LaTeX HTML: chuyển < → \lt trong $...$ ──
    const safeContent = sanitizeLatexHtml(q.content || '');
    const safeExplanation = sanitizeLatexHtml(q.explanation || '');
    let safeOptions = q.options;
    if (Array.isArray(q.options)) {
      safeOptions = q.options.map((opt: any) =>
        typeof opt === 'string' ? sanitizeLatexHtml(opt) : opt
      );
    }

    // Tự động dọn dẹp các tiền tố a), b), c), d) hoặc a., b., c., d. nếu AI vẫn sinh ra
    if (q.part === 2 && Array.isArray(safeOptions)) {
      safeOptions = safeOptions.map((opt: any) => {
        if (typeof opt !== 'string') return opt;
        return opt.replace(/^[a-dA-D][\.\)]\s*/, '').trim();
      });
    }

    return {
      ...q,
      content: safeContent,
      explanation: safeExplanation,
      options: safeOptions,
      correctAnswer: value,
      tags: needsReview
        ? [...(q.tags || []), '__needs_answer_review']
        : (q.tags || []),
    };
  });
}

/**
 * Chuyển đổi output AI (mixed single/cluster) thành mảng Question[] phẳng.
 * 
 * - item_type = "single" → giữ nguyên (bỏ item_type)
 * - item_type = "cluster" → tạo clusterId tạm, gắn vào mỗi sub_question
 *   + lưu shared_context vào tag đặc biệt "__cluster_context:..." trên mỗi câu
 *   + Khi sync Firestore, hàm handleSync sẽ tạo document cluster
 */
function flattenClusterOutput(rawItems: any[]): Question[] {
  const result: Question[] = [];
  let clusterCounter = 0;

  for (const item of rawItems) {
    const itemType = item.item_type || item.itemType || 'single';

    if (itemType === 'cluster' && Array.isArray(item.sub_questions) && item.sub_questions.length > 0) {
      // ═══ CLUSTER ═══
      clusterCounter++;
      const tempClusterId = `__temp_cluster_${clusterCounter}_${Date.now()}`;
      const sharedContext = item.shared_context || item.sharedContext || '';
      const clusterTopic = item.topic || item.sub_questions[0]?.topic || '';

      for (let i = 0; i < item.sub_questions.length; i++) {
        const sq = item.sub_questions[i];
        result.push({
          part: sq.part ?? 1,
          topic: sq.topic || clusterTopic,
          subTopic: sq.sub_topic || sq.subTopic,
          level: sq.level || 'Thông hiểu',
          content: sq.content || '',
          options: sq.options,
          correctAnswer: sq.correctAnswer,
          explanation: sq.explanation || 'Chưa có lời giải chi tiết.',
          tags: [
            ...(sq.tags || []),
            `__cluster_context:${sharedContext}`,  // Tag đặc biệt chứa shared context
          ],
          groupId: sq.groupId,
          clusterId: tempClusterId,
          clusterOrder: i,
          resources: sq.resources,
          simulationUrl: sq.simulationUrl,
        } as Question);
      }
      
      console.info(
        `[Cluster Flatten] Cluster #${clusterCounter}: ${item.sub_questions.length} câu | ` +
        `Context: "${sharedContext.substring(0, 80)}..."`
      );
    } else {
      // ═══ SINGLE ═══
      const { item_type, itemType: _it, shared_context, sub_questions, sub_topic, subTopic, ...questionFields } = item;
      result.push({
        ...questionFields,
        subTopic: sub_topic || subTopic,
      } as Question);
    }
  }

  if (clusterCounter > 0) {
    console.info(`[Cluster Flatten] Tổng: ${clusterCounter} cluster → ${result.length} câu hỏi`);
  }

  return result;
}

// ============================================================
// Tiện ích
// ============================================================
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function isRateLimitError(error: any): boolean {
  const msg = String(error?.message || error || '');
  return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
}

function isTransientError(error: any): boolean {
  const msg = String(error?.message || error || '');
  return msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded')
    || msg.includes('high demand') || isRateLimitError(error);
}

/**
 * Auto-retry với exponential backoff cho lỗi tạm thời (503, 429).
 * Nếu là 429 (Rate Limit) thì chờ lâu hơn (10s, 20s, 30s...).
 * @param onRetry callback để cập nhật UI khi đang retry
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 3000,
  onRetry?: (attempt: number, maxRetries: number, delaySec: number) => void
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < maxRetries && isTransientError(error)) {
        const isRateLimit = isRateLimitError(error);
        // Nếu bị Rate limit → chờ lâu hơn để reset token (Free API)
        const delaySec = isRateLimit 
          ? ([10, 20, 30, 40][attempt] ?? 30) 
          : ([3, 5, 10, 15][attempt] ?? 10);

        console.warn(`[Gemini] Lỗi tạm thời (lần ${attempt + 1}/${maxRetries}), thử lại sau ${delaySec}s... Error:`, String(error));
        onRetry?.(attempt + 1, maxRetries, delaySec);
        await new Promise(r => setTimeout(r, delaySec * 1000));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unreachable');
}

/**
 * Chạy mảng async tasks với giới hạn song song (concurrency limit).
 * Tránh ngộp API khi có nhiều chunks.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  };

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Cắt PDF thành các nhóm trang (mỗi nhóm tối đa groupSize trang)
 * Trả về mảng base64 PDF nhỏ để xử lý song song
 */
async function splitPdfToPageGroups(
  pdfBuffer: ArrayBuffer,
  groupSize = 2
): Promise<string[]> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= groupSize) {
    // PDF nhỏ → không cần cắt
    return [arrayBufferToBase64(pdfBuffer)];
  }

  const groups: string[] = [];
  for (let start = 0; start < totalPages; start += groupSize) {
    const end = Math.min(start + groupSize, totalPages);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(srcDoc, Array.from({ length: end - start }, (_, i) => start + i));
    pages.forEach(p => newDoc.addPage(p));
    const pdfBytes = await newDoc.save();
    groups.push(arrayBufferToBase64(pdfBytes.buffer as ArrayBuffer));
  }

  return groups;
}

// ============================================================
// TRINH SÁT ĐÁP ÁN — Trích xuất bảng đáp án TRƯỚC khi chunk
// ============================================================

/**
 * Quét HTML (từ mammoth) bằng regex để tìm bảng đáp án.
 * Chạy TRƯỚC khi chunk → kết quả sẽ inject vào prompt mỗi chunk.
 * Trả về string dạng: "Câu 1: B, Câu 2: D, ..."
 */
function extractAnswerKeyFromHTML(html: string): string {
  const results: Map<number, string> = new Map();

  // Strip HTML tags để quét text thuần
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

  // === Pattern 1: Inline "1.A 2.C 3.B" hoặc "1-A, 2-C" ===
  const p1 = /(\d+)\s*[.:\-]\s*([ABCDabcd])(?=[\s,;.|\d]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = p1.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 50) {
      results.set(num, m[2].toUpperCase());
    }
  }

  // === Pattern 2: Gạch chân <u>A</u>, <u>B</u> trong HTML gốc ===
  // Tìm pattern: "Câu X" ... <u>Y</u> (Y = A/B/C/D)
  const uPattern = /Câu\s+(\d+)[^]*?<u[^>]*>\s*([ABCDabcd])\s*<\/u>/gi;
  while ((m = uPattern.exec(html)) !== null) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 50 && !results.has(num)) {
      results.set(num, m[2].toUpperCase());
    }
  }

  // === Pattern 3: Part 2 — "Câu 19: a-Đ b-S c-Đ d-S" ===
  const p2 = /[Cc]âu\s+(\d+)\s*[:.]?\s*.*?([a-d])\s*[-–]\s*([ĐđSsTt]).*?([a-d])\s*[-–]\s*([ĐđSsTt]).*?([a-d])\s*[-–]\s*([ĐđSsTt]).*?([a-d])\s*[-–]\s*([ĐđSsTt])/gi;
  while ((m = p2.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    const vals = [m[3], m[5], m[7], m[9]].map(v => /[ĐđTt]/.test(v) ? 'Đ' : 'S');
    if (!results.has(num)) {
      results.set(num, vals.join(','));
    }
  }

  // === Pattern 4: Part 3 — "Câu 25: 2.45" ===
  const p3 = /[Cc]âu\s+(\d+)\s*[:.]\s*([\d.,]+)/g;
  while ((m = p3.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    if (num >= 21 && num <= 40 && !results.has(num)) {
      results.set(num, m[2].replace(',', '.'));
    }
  }

  if (results.size === 0) return '';

  // Sắp xếp theo số câu
  const sorted = [...results.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([num, ans]) => `Câu ${num}: ${ans}`).join(' | ');
}

/**
 * Gửi 1-2 trang cuối PDF cho AI Flash để trích xuất bảng đáp án.
 * Trả về string dạng: "Câu 1: B, Câu 2: D, ..."
 */
async function extractAnswerKeyFromPDF(
  ai: any,
  pdfBuffer: ArrayBuffer,
  onProgress?: (status: string) => void
): Promise<string> {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer);
    const totalPages = srcDoc.getPageCount();
    if (totalPages < 2) return ''; // PDF quá ngắn

    // Trích 1-2 trang cuối
    const startPage = Math.max(0, totalPages - 2);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(
      srcDoc,
      Array.from({ length: totalPages - startPage }, (_, i) => startPage + i)
    );
    pages.forEach(p => newDoc.addPage(p));
    const pdfBytes = await newDoc.save();
    const base64Data = arrayBufferToBase64(pdfBytes.buffer as ArrayBuffer);

    onProgress?.('🔍 Đang trinh sát bảng đáp án ở trang cuối...');

    const response = await retryWithBackoff(() => ai.models.generateContent({
      model: MODELS.ANALYZE, // Flash — nhanh & rẻ
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: `Nếu trang này chứa BẢNG ĐÁP ÁN, hãy trích xuất.
Format: Câu 1: B | Câu 2: D | Câu 3: A | ...
Với Part 2 (Đúng/Sai): Câu 19: Đ,S,S,Đ
Với Part 3: Câu 25: 2.45
Nếu KHÔNG CÓ bảng đáp án, trả về chỉ chữ "NONE".` }
        ]
      }],
      config: { responseMimeType: 'text/plain' }
    }), 2, 2000);

    const result = ((response as any).text || '').trim();
    if (result === 'NONE' || result.length < 5) return '';

    console.info('[AnswerKey PDF] Trích xuất được:', result.substring(0, 200));
    return result;
  } catch (error) {
    console.warn('[AnswerKey PDF] Không trích xuất được bảng đáp án:', error);
    return '';
  }
}

/**
 * Tạo đoạn text inject vào prompt nếu có bảng đáp án.
 */
function buildAnswerKeyInjection(answerKey: string): string {
  if (!answerKey) return '';
  return `\n\n=== BẢNG ĐÁP ÁN ĐÃ TRÍCH XUẤT TỪ FILE GỐC ===
${answerKey}
→ Hãy dùng bảng này để điền correctAnswer cho từng câu tương ứng.
→ Nếu câu nào không có trong bảng, hãy tự xác định đáp án theo chiến lược ở trên.`;
}

// ============================================================
// DIGITIZE FROM PDF — Gemini Vision + Song song từng nhóm trang
// ============================================================
export async function digitizeFromPDF(
  pdfFile: File,
  topicHint?: string,
  onProgress?: (status: string) => void
): Promise<Question[]> {
  const ai = getAI();

  onProgress?.("Đang đọc và cắt trang PDF...");
  const pdfBuffer = await pdfFile.arrayBuffer();

  // ── Trinh sát đáp án từ trang cuối PDF ──
  const answerKey = await extractAnswerKeyFromPDF(ai, pdfBuffer, onProgress);
  const answerKeyInjection = buildAnswerKeyInjection(answerKey);
  if (answerKey) {
    onProgress?.(`✅ Tìm thấy bảng đáp án! Đang tiếp tục số hóa...`);
  }

  const pageGroups = await splitPdfToPageGroups(pdfBuffer, 2);

  const prompt = buildDigitizePromptFull(
    "nội dung đề thi Vật lý trong file PDF đính kèm",
    topicHint
  ) + answerKeyInjection;

  onProgress?.(`PDF có ${pageGroups.length} phần. Đang xử lý song song...`);

  // Xử lý từng nhóm trang — CHẠY TUẦN TỰ (1 nhóm/lần) để chống ngộp API
  const CONCURRENCY = 1;
  const allQuestions: Question[] = [];

  for (let batch = 0; batch < pageGroups.length; batch += CONCURRENCY) {
    const batchGroups = pageGroups.slice(batch, batch + CONCURRENCY);

    const batchResults = await Promise.all(
      batchGroups.map(async (base64Data, batchIdx) => {
        const groupIdx = batch + batchIdx;
        const pdfPart = {
          inlineData: {
            mimeType: "application/pdf" as const,
            data: base64Data,
          }
        };

          onProgress?.(`⚡ Flash đang phân tích phần ${groupIdx + 1}/${pageGroups.length}...`);

          try {
            const response = await retryWithBackoff(() => ai.models.generateContent({
              model: MODELS.ANALYZE,
              contents: [{ role: "user", parts: [pdfPart, { text: prompt }] }],
              config: {
                responseMimeType: "application/json",
                responseSchema: DIGITIZE_SCHEMA,
              }
            }), 4, 5000, // COST FIX: More retries + longer backoff instead of Pro fallback
              (attempt, max, delaySec) => {
                onProgress?.(`⏳ Server AI đang bận — tự động kết nối lại (${attempt}/${max}), đợi ${delaySec}s...`);
              }
            );

            return JSON.parse(response.text || "[]") as Question[];
          } catch (error) {
            console.error(`PDF Error phần ${groupIdx + 1}:`, error);
            throw error;
          }
      })
    );

    allQuestions.push(...batchResults.flat());
  }

  onProgress?.("Đang chuẩn hóa đáp án...");
  return normalizeQuestions(allQuestions);
}

export async function digitizeDocument(
  htmlContent: string,
  topicHint?: string,
  onProgress?: (status: string) => void
): Promise<Question[]> {
  const ai = getAI();

  // ── Trinh sát đáp án từ HTML gốc (trước khi chunk) ──
  const answerKey = extractAnswerKeyFromHTML(htmlContent);
  const answerKeyInjection = buildAnswerKeyInjection(answerKey);
  if (answerKey) {
    console.info('[AnswerKey HTML] Trích xuất được:', answerKey.substring(0, 200));
    onProgress?.(`🎯 Tìm thấy bảng đáp án trong file! (${answerKey.split('|').length} câu)`);
  }

  // ── CHUNKING: Tách thông minh theo ranh giới "Câu X" ──
  const chunks: string[] = [];
  const splitParts = htmlContent.split(/(?=Câu\s+\d+)/i);
  let currentChunk = "";
  for (const part of splitParts) {
    if ((currentChunk + part).length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = part;
    } else {
      currentChunk += part;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  // Đảm bảo luôn có ít nhất 1 chunk
  if (chunks.length === 0) chunks.push(htmlContent);

  const totalChunks = chunks.length;
  onProgress?.(`📦 Chia thành ${totalChunks} phần. Đang xử lý...`);

  // ── Hàm xử lý 1 chunk — Flash only (COST FIX: no Pro fallback) ──
  const processChunk = async (chunk: string, idx: number): Promise<Question[]> => {
    const prompt = buildDigitizePromptFull(
      "nội dung HTML từ file Word (ảnh đã được thay bằng URL Firebase Storage)",
      topicHint
    ) + answerKeyInjection + `\n\n=== NỘI DUNG HTML ĐẦU VÀO ===\n${chunk}`;

    onProgress?.(`⚡ Flash đang xử lý phần ${idx + 1}/${totalChunks}...`);
    try {
      const response = await retryWithBackoff(
        () => ai.models.generateContent({
          model: MODELS.ANALYZE,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: DIGITIZE_SCHEMA,
          }
        }),
        4,    // maxRetries (more retries instead of Pro fallback)
        5000, // baseDelay
        (attempt, max, delaySec) => {
          onProgress?.(`⏳ Server AI đang bận — tự động kết nối lại (${attempt}/${max}), đợi ${delaySec}s...`);
        }
      );

      const questions = JSON.parse(response.text || "[]") as Question[];
      onProgress?.(`✅ Hoàn thành phần ${idx + 1}/${totalChunks} — ${questions.length} câu`);
      return questions;
    } catch (error) {
      throw error;
    }
  };

  // ── Xử lý tuần tự theo batch, tối đa MAX_CONCURRENCY song song ──
  const tasks = chunks.map((chunk, idx) => () => processChunk(chunk, idx));
  const results = await runWithConcurrency(tasks, MAX_CONCURRENCY);

  onProgress?.("🔗 Đang chuẩn hóa đáp án...");
  return normalizeQuestions(results.flat());
}

// ============================================================
// PARSE MATRIX IMAGE — AI đọc ảnh/PDF ma trận đề thi
// ============================================================

export interface ParsedMatrixRow {
  topic: string;
  part1: { 'Nhận biết': number; 'Thông hiểu': number; 'Vận dụng': number; 'Vận dụng cao': number };
  part2: { 'Nhận biết': number; 'Thông hiểu': number; 'Vận dụng': number; 'Vận dụng cao': number };
  part3: { 'Nhận biết': number; 'Thông hiểu': number; 'Vận dụng': number; 'Vận dụng cao': number };
}

export interface ParsedMatrixResult {
  examTitle: string;
  rows: ParsedMatrixRow[];
}

export async function parseMatrixImage(
  file: File,
  onProgress?: (status: string) => void
): Promise<ParsedMatrixResult> {
  const ai = getAI();
  onProgress?.('📸 Đang đọc file ma trận...');

  const isPDF = file.name.toLowerCase().endsWith('.pdf');
  const buffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(buffer);
  const mimeType = isPDF ? 'application/pdf' : (file.type || 'image/png');

  const prompt = `Bạn là Chuyên gia Giáo dục Vật lý. Đọc ảnh/PDF chứa BẢNG MA TRẬN ĐỀ THI Vật lý THPT và trích xuất thành JSON.

Cấu trúc bảng: CỘT = mức độ (NB, TH, VD, VDC), HÀNG = chủ đề, Ô = số câu.
Nếu chia theo phần: Phần I/TNKQ→part1, Phần II/Đúng-Sai→part2, Phần III/Trả lời ngắn→part3.
Nếu KHÔNG chia phần → mặc định tất cả vào part1.
Ô trống/gạch ngang = 0. Ô chứa điểm: 0.25đ = 1 câu.
Topic map chuẩn: "Dao động cơ", "Sóng cơ", "Điện xoay chiều", "Sóng điện từ", "Lượng tử ánh sáng", "Quang hình học", "Từ trường", "Cảm ứng điện từ", "Vật lí nhiệt", "Khí lí tưởng", "Vật lí hạt nhân", "Động học chất điểm", "Động lực học", "Năng lượng", "Dòng điện".
Nếu topic viết tắt/khác biệt, hãy tự map cho đúng.`;

  onProgress?.('🤖 AI đang phân tích bảng ma trận...');

  const levelProps = {
    'Nhận biết': { type: Type.INTEGER },
    'Thông hiểu': { type: Type.INTEGER },
    'Vận dụng': { type: Type.INTEGER },
    'Vận dụng cao': { type: Type.INTEGER },
  };
  const levelRequired = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
  const partSchema = { type: Type.OBJECT, properties: levelProps, required: levelRequired };

  try {
    const response = await retryWithBackoff(() => ai.models.generateContent({
      model: MODELS.ANALYZE,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: prompt }
      ]}],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            examTitle: { type: Type.STRING },
            rows: { type: Type.ARRAY, items: {
              type: Type.OBJECT,
              properties: { topic: { type: Type.STRING }, part1: partSchema, part2: partSchema, part3: partSchema },
              required: ['topic', 'part1', 'part2', 'part3']
            }}
          },
          required: ['examTitle', 'rows']
        }
      }
    }), 3, 3000, (attempt, max, delaySec) => {
      onProgress?.(`⏳ Server AI bận — thử lại (${attempt}/${max}), đợi ${delaySec}s...`);
    });

    const parsed = JSON.parse(response.text || '{}') as ParsedMatrixResult;
    if (!parsed.rows || parsed.rows.length === 0) {
      throw new Error('AI không nhận diện được bảng ma trận trong file.');
    }
    onProgress?.(`✅ Đã nhận diện ${parsed.rows.length} chủ đề từ ma trận!`);
    return parsed;
  } catch (error: any) {
    console.error('[ParseMatrix] Error:', error);
    throw new Error(`Lỗi đọc ma trận: ${error.message || 'Không xác định'}`);
  }
}
