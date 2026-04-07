import { GoogleGenAI, Type } from "@google/genai";
import { PDFDocument } from "pdf-lib";
import { Question, ErrorAnalysis } from "../types";

// ============================================================
// MODEL CONFIGURATION
// - gemini-2.5-pro  : Số hóa đề từ PDF (cần Vision + reasoning sâu)
// - gemini-2.5-flash: Số hóa DOCX (text input) / Phân tích câu trả lời
// ============================================================
const MODELS = {
  DIGITIZE: "gemini-2.5-pro",
  ANALYZE:  "gemini-2.5-flash",
} as const;

// ~20K chars ≈ 10-15 câu/chunk — tránh overload API với đề lớn (100+ câu)
const MAX_CHUNK_SIZE = 20_000;
const MAX_CONCURRENCY = 2; // Tối đa 2 chunk song song — giảm áp lực API

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
Bạn là Chuyên gia Sư phạm Vật lý cấp cao của dự án PHYS-8+.
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
export async function diagnoseUserExam(
  incorrectRecords: { question: Question, studentAnswer: any, isCorrect: boolean }[],
  skippedRecords: { question: Question, studentAnswer: any, isCorrect: boolean }[] = []
): Promise<{ 
  feedback: string;
  redZones: string[];
  remedialMatrix: { topic: string; count: number }[];
  behavioralAnalysis: { carelessCount: number; fundamentalCount: number; skippedCount: number };
}> {
  const ai = getAI();

  if (incorrectRecords.length === 0 && skippedRecords.length === 0) {
    return {
      feedback: "Tuyệt vời! Bạn không sai câu nào và không bỏ trống câu nào. Không phát hiện lỗ hổng.",
      redZones: [],
      remedialMatrix: [],
      behavioralAnalysis: { carelessCount: 0, fundamentalCount: 0, skippedCount: 0 }
    };
  }

  const prompt = `
Bạn là Chuyên gia Sư phạm Vật lý cấp cao của dự án PHYS-8+.
Học sinh vừa hoàn thành một bài test, kết quả như sau:
- Câu LÀM SAI (Incorrect): ${incorrectRecords.length}
- Câu BỎ TRỐNG (Skipped): ${skippedRecords.length}

=== DANH SÁCH CÂU SAI ===
${incorrectRecords.length > 0 ? incorrectRecords.map((r, i) => `
Lỗi #${i + 1}:
- Chủ đề: ${r.question.topic} | Mức độ: ${r.question.level}
- Nội dung: ${r.question.content}
- Đáp án đúng: ${JSON.stringify(r.question.correctAnswer)}
- Học sinh chọn: ${JSON.stringify(r.studentAnswer)}
`).join("\n") : "Không có câu nào làm sai."}

=== YÊU CẦU PHÂN TÍCH CHUẨN ĐOÁN ===
Dựa vào chuẩn kiến thức GDPT 2018 môn Vật lý:
1. Đánh giá tổng quan về các lỗ hổng kiến thức chính (redZones). Liệt kê cụ thể tên các chủ đề nhỏ bị rỗng. Dựa chủ yếu vào phần CÂU SAI.
2. Viết Phản hồi (feedback) bằng Markdown để học sinh đọc. Phân tích rõ vì sao dính bẫy.
   - Nếu tỷ lệ câu hỏi 'Bỏ trống' (Skipped) > 15%, hãy đưa ra lời khuyên về Chiến thuật quản lý thời gian (Time Management) và khuyên học sinh không được bỏ trống vì thi trắc nghiệm không trừ điểm sai.
   - Chỉ tập trung kê đơn ôn tập kiến thức cho các câu 'Làm sai' (Incorrect).
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
=== CÂY KIẾN THỨC VẬT LÝ THPT — CHƯƠNG TRÌNH GDPT 2018 ===

【VẬT LÝ 10】
• Động học: Chuyển động thẳng đều, biến đổi đều, rơi tự do, chuyển động tròn đều
• Động lực học: Ba định luật Newton, lực ma sát, lực đàn hồi, lực hướng tâm
• Năng lượng: Công, công suất, động năng, thế năng, cơ năng, bảo toàn cơ năng
• Động lượng: Động lượng, xung lực, bảo toàn động lượng, va chạm

【VẬT LÝ 11】
• Dao động cơ: Dao động điều hòa, con lắc lò xo, con lắc đơn, dao động tắt dần, cộng hưởng
• Sóng cơ: Sóng ngang, sóng dọc, giao thoa sóng, sóng dừng, sóng âm
• Điện trường: Lực Coulomb, điện trường, hiệu điện thế, tụ điện
• Dòng điện: Dòng điện không đổi, định luật Ohm, ghép điện trở, năng lượng điện

【VẬT LÝ 12】
• Từ trường: Từ trường, lực từ, cảm ứng từ, lực Lorentz
• Cảm ứng điện từ: Từ thông, suất điện động cảm ứng, tự cảm
• Điện xoay chiều: Mạch RLC, cộng hưởng điện, công suất, máy biến áp, truyền tải điện
• Sóng điện từ: Dao động điện từ, sóng điện từ, thang sóng điện từ
• Quang học: Tán sắc, giao thoa ánh sáng, nhiễu xạ
• Vật lí nhiệt: Nội năng, các nguyên lí nhiệt động lực học
• Khí lí tưởng: Phương trình trạng thái, các đẳng quá trình
• Lượng tử ánh sáng: Hiện tượng quang điện, thuyết lượng tử, quang phổ
• Vật lí hạt nhân: Cấu tạo hạt nhân, phóng xạ, phản ứng hạt nhân, năng lượng liên kết

=== MỨC ĐỘ NHẬN THỨC ===
• Nhận biết (NB): Nhớ, liệt kê, nhận dạng khái niệm
• Thông hiểu (TH): Giải thích, suy luận, so sánh
• Vận dụng (VD): Áp dụng công thức, giải bài tập cơ bản
• Vận dụng cao (VDC): Bài tập phức tạp, tổng hợp nhiều kiến thức

=== QUY TẮC PHÂN LOẠI CHỦ ĐỀ LỚP 12 — BỘ LỌC TỪ KHÓA ĐỘC QUYỀN (BẮT BUỘC) ===

⚠️ STOP-WORDS RULE: Khi phân loại, BỎ QUA HOÀN TOÀN trọng số của các từ phổ quát sau:
   "công", "năng lượng", "lực", "chuyển động", "nhiệt độ".
   CHỈ dùng các từ khóa đặc trưng (Exclusive Keywords) dưới đây để ra quyết định dán nhãn.

⚡ LOGIC PHÂN LOẠI IF → ELSE IF (KHẮT KHE, KHÔNG NỘI SUY CẢM TÍNH):

IF câu hỏi chứa BẤT KỲ từ khóa nào trong nhóm sau:
   ▸ "sự nóng chảy", "sự hoá hơi", "nội năng", "định luật 1 nhiệt động lực học",
   ▸ "thang Celsius", "thang Kelvin", "độ không tuyệt đối",
   ▸ "nhiệt dung riêng", "nhiệt nóng chảy riêng", "nhiệt hoá hơi riêng"
   → GÁN topic = "Vật lí nhiệt" ✅

ELSE IF câu hỏi chứa BẤT KỲ từ khóa nào trong nhóm sau:
   ▸ "động học phân tử chất khí", "chuyển động Brown", "định luật Boyle",
   ▸ "định luật Charles", "phương trình trạng thái khí lí tưởng",
   ▸ "áp suất khí", "hằng số Boltzmann"
   → GÁN topic = "Khí lí tưởng" ✅

ELSE IF câu hỏi chứa BẤT KỲ từ khóa nào trong nhóm sau:
   ▸ "đường sức từ", "nam châm", "lực từ", "đoạn dây dẫn mang dòng điện",
   ▸ "cảm ứng từ B", "tesla", "từ thông", "weber",
   ▸ "cảm ứng điện từ", "định luật Faraday", "định luật Lenz"
   → GÁN topic = "Từ trường" ✅

ELSE (không match nhóm nào ở trên):
   → Tiếp tục dùng CÂY KIẾN THỨC phía trên để xác định chủ đề phù hợp nhất.

📌 VÍ DỤ:
   • "Tính nội năng của hệ khi nhận nhiệt lượng Q" → có "nội năng" → topic = "Vật lí nhiệt"
   • "Áp suất khí trong xi-lanh thay đổi khi thể tích giảm" → có "áp suất khí" → topic = "Khí lí tưởng"
   • "Tính lực từ tác dụng lên đoạn dây dẫn mang dòng điện" → có "lực từ" + "đoạn dây dẫn mang dòng điện" → topic = "Từ trường"
   • "Tính công của lực F khi vật di chuyển" → "công" và "lực" là stop-words → KHÔNG đủ để phân loại → dùng ngữ cảnh tổng thể
`;

// ============================================================
// SHARED: Prompt & Schema — Đọc BẤT KỲ đề nào
// ============================================================

function buildDigitizePromptBase(inputDescription: string, topicHint?: string): string {
  return `
Bạn là Chuyên gia Số hóa Đề thi Vật lý THPT Cao cấp, với khả năng suy luận sâu.

## NHIỆM VỤ
Đọc và số hóa ${inputDescription} thành cấu trúc JSON câu hỏi chuẩn.
${topicHint ? `Gợi ý chủ đề: ${topicHint}` : 'Tự nhận diện chủ đề dựa trên nội dung câu hỏi.'}

${PHYSICS_KNOWLEDGE_TREE}

## QUY TẮC SỐ HÓA

【1】 TỰ NHẬN DIỆN CẤU TRÚC ĐỀ (CỰC KỲ QUAN TRỌNG — PHẢI TUÂN THỦ TUYỆT ĐỐI):
  Đề có thể có nhiều format khác nhau. Hãy dùng CÂY QUYẾT ĐỊNH sau:

  ▸ BƯỚC 1: Kiểm tra câu hỏi có các ý con dạng chữ thường a), b), c), d) không?
    → CÓ: Đây là Part 2 (Đúng/Sai). KHÔNG BAO GIỜ phân loại thành Part 1.
    → KHÔNG: Tiếp tục Bước 2.

  ▸ BƯỚC 2: Câu hỏi có các phương án lựa chọn dạng chữ HOA A., B., C., D. không?
    → CÓ: Đây là Part 1 (Trắc nghiệm nhiều lựa chọn).
    → KHÔNG: Tiếp tục Bước 3.

  ▸ BƯỚC 3: Câu hỏi yêu cầu điền số / tính toán kết quả?
    → CÓ: Đây là Part 3 (Trả lời ngắn).

  ⚠️ QUY TẮC SẮT ĐÁ — PHẢI GHI NHỚ:
  • Nếu thấy ý con viết bằng chữ cái THƯỜNG: a), b), c), d) → BẮT BUỘC part = 2 (Đúng/Sai).
  • Nếu thấy phương án viết bằng chữ cái HOA: A., B., C., D. → BẮT BUỘC part = 1 (Trắc nghiệm).
  • KHÔNG ĐƯỢC nhầm lẫn hai dạng này, dù nội dung câu hỏi có giống nhau.

  📌 VÍ DỤ CỤ THỂ:

  VÍ DỤ PART 1 (Trắc nghiệm — chữ HOA):
  "Câu 5: Đơn vị đo cường độ dòng điện là:
   A. Vôn (V)     B. Ampe (A)     C. Oát (W)     D. Ôm (Ω)"
  → part = 1, options = ["Vôn (V)", "Ampe (A)", "Oát (W)", "Ôm (Ω)"]

  VÍ DỤ PART 2 (Đúng/Sai — chữ thường):
  "Câu 19: Một dây dẫn mang dòng điện đặt trong từ trường đều. Hãy xác định mệnh đề đúng/sai:
   a) Lực từ tác dụng lên dây dẫn luôn vuông góc với dây.
   b) Khi đổi chiều dòng điện, lực từ đổi chiều.
   c) Lực từ tỉ lệ nghịch với cường độ dòng điện.
   d) Lực từ không phụ thuộc vào chiều dài dây dẫn."
  → part = 2, options = ["a) Lực từ tác dụng lên...", "b) Khi đổi chiều...", ...], correctAnswer = [true, true, false, false]

  VÍ DỤ PART 2 (dạng KHÔNG có tiêu đề "Đúng/Sai" nhưng VẪN LÀ PART 2):
  "Câu 20: Cho mạch điện RLC nối tiếp. Xét các phát biểu sau:
   a) Khi xảy ra cộng hưởng, cường độ dòng điện cực đại.
   b) Hệ số công suất luôn bằng 1 khi có cộng hưởng.
   c) Điện áp hai đầu tụ điện luôn trễ pha π/2 so với dòng điện.
   d) Tần số cộng hưởng phụ thuộc vào điện trở R."
  → part = 2 (vì có a/b/c/d chữ thường), KHÔNG PHẢI part = 1

【2】 CORRECTANSWER — TỰ ĐỘNG NHẬN DIỆN ĐÁP ÁN (QUAN TRỌNG NHẤT — BẮT BUỘC CHO MỌI CÂU):
  ⚠️ QUY TẮC SẮT ĐÁ: correctAnswer KHÔNG BAO GIỜ được null/undefined/rỗng. Phải luôn có giá trị.
  ⚠️ ĐÂY LÀ TRƯỜNG QUAN TRỌNG NHẤT — AI PHẢI ĐỌC KỸ PHẦN LỜI GIẢI / HƯỚNG DẪN GIẢI ĐỂ XÁC ĐỊNH.

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ CHIẾN LƯỢC TÌM ĐÁP ÁN (ÁP DỤNG CHO TẤT CẢ CÁC PHẦN):             │
  │                                                                       │
  │ 1. ĐỌC TOÀN BỘ đề thi — bao gồm cả phần "Hướng dẫn giải",         │
  │    "Lời giải", "Đáp án" nếu có (thường ở cuối file PDF).            │
  │ 2. Quét BẢNG ĐÁP ÁN tổng hợp nếu tồn tại (thường ở trang cuối).    │
  │ 3. Tìm manh mối inline (gạch chân, in đậm, dấu sao, ✓/✗).          │
  │ 4. Đọc lời giải từng câu → tìm kết luận cuối "→ Chọn X".           │
  │ 5. Nếu KHÔNG TÌM THẤY bất kỳ dấu hiệu nào → AI TỰ GIẢI BÀI.       │
  └─────────────────────────────────────────────────────────────────────────┘

  ━━━ PART 1 (Trắc nghiệm) → correctAnswer = index số nguyên (0=A, 1=B, 2=C, 3=D) ━━━
  Tìm đáp án đúng bằng cách quét TẤT CẢ dấu hiệu sau (theo thứ tự ưu tiên):
  
  ✅ Ưu tiên 1: Chữ cái A/B/C/D được **gạch chân** (<u>A</u>, <u>B</u>...) → đó là đáp án đúng
  ✅ Ưu tiên 2: Chữ cái A/B/C/D hoặc nội dung phương án được **in đậm** (<strong>B</strong>, <b>C. 2m/s</b>...)
  ✅ Ưu tiên 3: Có dấu sao (*) hoặc dấu tích (✓, ✔) nằm trước/sau chữ cái (VD: *A, A✓)
  ✅ Ưu tiên 4: Phương án có highlight/màu khác biệt (<span style="color:red">C</span>)
  ✅ Ưu tiên 5: Tìm BẢNG ĐÁP ÁN ở cuối đề/cuối mỗi phần. Bảng thường có format:
     - "Câu | 1 | 2 | 3 | ..." dòng 1, "ĐA | A | C | B | ..." dòng 2
     - Hoặc: "1.A  2.C  3.B  4.D ..."
     - Hoặc: "1-A, 2-C, 3-B..."
  ✅ Ưu tiên 6: Nếu đang trong phần "Lời giải" / "Hướng dẫn giải", tìm KẾT LUẬN CUỐI:
     - "→ Chọn B", "Đáp án: C", "Chọn D", "Lời giải: ... → A"
     - Các biến thể: "Chọn A.", "Chọn: A", "ĐA: B", "Vậy đáp án là C"
  
  ⛔ Nếu KHÔNG tìm thấy bất kỳ dấu hiệu nào → Dùng kiến thức Vật lý để GIẢI câu hỏi → chọn đáp án đúng.

  ⚠️ OUTPUT FORMAT CHÍNH XÁC (KHÔNG ĐƯỢC SAI):
  correctAnswer PHẢI là INTEGER: 0, 1, 2, hoặc 3
  ❌ SAI: correctAnswer = "A"  ← CHUỖI, KHÔNG CHẤP NHẬN
  ❌ SAI: correctAnswer = "Chọn B" ← CHUỖI, KHÔNG CHẤP NHẬN
  ❌ SAI: correctAnswer = {"answer": "C"} ← OBJECT, KHÔNG CHẤP NHẬN
  ❌ SAI: correctAnswer = null ← NULL, KHÔNG CHẤP NHẬN
  ✅ ĐÚNG: correctAnswer = 0 (A), 1 (B), 2 (C), 3 (D)
  
  VÍ DỤ:
  - Thấy <u>B</u> → correctAnswer = 1
  - Thấy <strong>C</strong>. 340 m/s → correctAnswer = 2
  - Bảng đáp án: "Câu 5: D" → correctAnswer = 3
  - Lời giải kết luận: "→ Chọn A" → correctAnswer = 0
  - Không có dấu hiệu → AI giải bài → xác định A đúng → correctAnswer = 0

  ━━━ PART 2 (Đúng/Sai 4 ý) → correctAnswer = [bool, bool, bool, bool] ━━━
  Mỗi ý a), b), c), d) cần xác định Đúng (true) hoặc Sai (false):
  
  ✅ Ưu tiên 1: Dấu sao (*) trước chữ cái → ĐÚNG (true). VD: *a), *b) → true
  ✅ Ưu tiên 2: Ký hiệu Đ/S ghi kèm: "a) Đ", "b) S" hoặc "a) ✓", "b) ✗"
  ✅ Ưu tiên 3: Ý nào được **gạch chân** hoặc **in đậm** → ĐÚNG
  ✅ Ưu tiên 4: Tìm BẢNG ĐÁP ÁN cuối đề. Format phổ biến:
     - "Câu 19: a-Đ, b-Đ, c-S, d-S" → [true, true, false, false]
     - "19: Đ Đ S Đ" → [true, true, false, true]
     - "Đáp án: S - S - S - Đ" → [false, false, false, true]
     - "19: a)* b)* c) d)" → [true, true, false, false]
  ✅ Ưu tiên 5: Nếu ý có lời giải → đọc lời giải để xác nhận từng ý
  
  ⛔ Nếu KHÔNG tìm thấy → Dùng kiến thức Vật lý: đọc từng mệnh đề, xác nhận đúng/sai bằng lý thuyết.

  ⚠️ OUTPUT FORMAT CHÍNH XÁC (KHÔNG ĐƯỢC SAI):
  correctAnswer PHẢI là ARRAY gồm ĐÚNG 4 BOOLEAN: [true/false, true/false, true/false, true/false]
  ❌ SAI: correctAnswer = "Đ, Đ, S, S" ← CHUỖI
  ❌ SAI: correctAnswer = ["Đ", "S", "S", "Đ"] ← MẢNG CHUỖI
  ❌ SAI: correctAnswer = {"a": true, "b": false} ← OBJECT
  ✅ ĐÚNG: correctAnswer = [true, true, false, false]

  ━━━ PART 3 (Trả lời ngắn) → correctAnswer = "số" (STRING chứa số) ━━━
  Tìm đáp số bằng cách quét:
  
  ✅ Ưu tiên 1: Tìm cụm "Đáp án:", "KQ:", "Kết quả:", "Đ/A:" → lấy con số ngay sau đó
  ✅ Ưu tiên 2: Tìm BẢNG ĐÁP ÁN cuối đề: "Câu 25: 1.25", "25. 2,5"
  ✅ Ưu tiên 3: Tìm trong lời giải: "Trả lời: 165", "Kết quả: 2,45"
  ✅ Ưu tiên 4: Nếu có lời giải → tìm con số cuối cùng trong lời giải (thường là đáp số)
  ✅ Ưu tiên 5: Tìm số được **in đậm** hoặc **gạch chân** hoặc **đóng khung** trong câu hỏi
  
  ⛔ Nếu KHÔNG tìm thấy → Dùng kiến thức Vật lý: GIẢI BÀI TOÁN → ghi đáp số.
  
  ⚠️ Lưu ý format số: "1,25" (phẩy) = 1.25 (chấm). Luôn trả về dạng chấm thập phân.
  
  ⚠️ OUTPUT FORMAT CHÍNH XÁC (KHÔNG ĐƯỢC SAI):
  correctAnswer PHẢI là STRING chứa giá trị số: "2.45", "165", "0.75"
  ❌ SAI: correctAnswer = "Đáp án là 2.45" ← THỪA TEXT
  ❌ SAI: correctAnswer = null ← NULL
  ✅ ĐÚNG: correctAnswer = "2.45"
  ✅ ĐÚNG: correctAnswer = "165"

【3】 TỰ NHẬN DIỆN CHỦ ĐỀ (topic):
  • Đọc nội dung → xác định thuộc chương/bài nào trong CÂY KIẾN THỨC ở trên
  • Gán topic = tên chủ đề cụ thể (VD: "Dao động cơ", "Từ trường", "Quang học")
  • KHÔNG dùng topic chung chung như "Vật lý"

【4】 TỰ PHÂN LOẠI MỨC ĐỘ (level):
  • "Nhận biết": Nhớ khái niệm, nhận dạng đơn giản
  • "Thông hiểu": Giải thích, suy luận 1 bước
  • "Vận dụng": Áp dụng 1-2 công thức
  • "Vận dụng cao": Tổng hợp nhiều kiến thức, bài toán phức tạp

【5】 GẮN THẺ TAGS (chi tiết, ít nhất 2 tag):
  • "Chương: [Tên chương]" (VD: "Chương: Dao động cơ")
  • "Bài: [Tên bài]" (VD: "Bài: Con lắc lò xo")
  • "Dạng: [Dạng bài]" (VD: "Dạng: Tìm biên độ dao động")
  • Tag phụ: "Có hình", "Có bảng", "Ngữ cảnh chung", "Thí nghiệm"

【6】 CÔNG THỨC → LaTeX (TUYỆT ĐỐI KHÔNG BỎ SÓT):
  • Inline: $F = ma$, $\\\\Delta t$, $v_0$
  • Block: $$E_k = \\\\frac{1}{2}mv^2$$
  • Ký hiệu: Δ→$\\\\Delta$, ω→$\\\\omega$, λ→$\\\\lambda$, α→$\\\\alpha$, π→$\\\\pi$
  • Vector: $\\\\vec{F}$, $\\\\overrightarrow{AB}$
  • Phân số: $\\\\frac{a}{b}$; Căn: $\\\\sqrt{x}$

【7】 HÌNH ẢNH — CHỈ ĐÁNH DẤU Ở CUỐI NỘI DUNG:
  • Nếu câu hỏi có hình → THÊM VÀO CUỐI content chuỗi: **[HÌNH MINH HỌA]**
  • KHÔNG mô tả hình, KHÔNG đặt placeholder ở giữa câu
  • Ví dụ đúng: "Một vật dao động điều hòa... **[HÌNH MINH HỌA]**"

【8】 BẢNG SỐ LIỆU → PLACEHOLDER:
  • Có bảng → **[BẢNG SỐ LIỆU — Thầy copy nội dung bảng vào đây]**

【9】 LỜI GIẢI (explanation):
  • Trích NGUYÊN VĂN lời giải nếu đề có, chuyển LaTeX
  • Kết thúc: "→ **Đáp án: [kết quả]**"
  • Nếu đề KHÔNG có lời giải → "Chưa có lời giải chi tiết."

【10】 KIỂM TRA TRƯỚC KHI OUTPUT (BẮT BUỘC — KHÔNG ĐƯỢC BỎ QUA):
  ✓ correctAnswer hợp lệ cho MỌI câu?
    - Part 1: phải là SỐ NGUYÊN 0, 1, 2, hoặc 3 (KHÔNG PHẢI chuỗi "A", KHÔNG PHẢI null)
    - Part 2: phải là MẢNG 4 BOOLEAN [true/false, ...] (KHÔNG PHẢI chuỗi, KHÔNG PHẢI object)
    - Part 3: phải là CHUỖI chứa số "2.45" (KHÔNG PHẢI null)
  ✓ Nếu không tìm thấy đáp án trong đề → AI PHẢI TỰ GIẢI để xác định đáp án đúng
  ✓ topic cụ thể (không chung chung)?
  ✓ tags >= 2?
  ✓ LaTeX đầy đủ?
  ✓ Placeholder đúng?
  ✓ Câu kép Phần II: groupId đã gán và context chung đã COPY đầy đủ vào CẢ HAI câu?
  `.trim();
}

// ─── Bổ sung cho câu kép + câu chùm ──────────────────────────────────────
const PAIRED_AND_CLUSTER_RULE = `

【11】 CÂU KÉP PHẦN II (CỰC KỲ QUAN TRỌNG):
  Phần II thường có 6 câu, trong đó có các cặp câu (2 câu liền kề cùng dùng chung 1 đề bài):

  Ví dụ câu kép:
  "Một vật dao động điều hòa với A=5cm, f=2Hz. (Đề bài dùng chung cho Câu 19 và Câu 20)
   Câu 19: [4 ý a,b,c,d về vận tốc]    → correctAnswer = [true/false x4]
   Câu 20: [4 ý a,b,c,d về gia tốc]    → correctAnswer = [true/false x4]"

  QUY TẮC SẮT ĐÁ khi gặp câu kép:
  1. SAO CHÉP NGUYÊN VĂN nội dung đề bài chung vào trường "content" của CẢ HAI câu
     ❌ SAI: Câu 20 có content = "(Xem câu 19)" hoặc bỏ trống
     ✅ ĐÚNG: Câu 20 có đầy đủ "Một vật dao động điều hòa với A=5cm..." như Câu 19
  2. GÁN cùng giá trị groupId = "g1" (hoặc "g2", "g3"...) cho cả hai câu trong cặp
     - Cặp 1: groupId = "g1" cho cả câu 19 và câu 20
     - Cặp 2: groupId = "g2" cho cả câu 21 và câu 22
  3. Câu không ghép cặp: KHÔNG có trường groupId (bỏ qua / để undefined)

【12】 CÂU HỎI CHÙM — CLUSTER QUESTIONS (CỰC KỲ QUAN TRỌNG):
  Một số đề thi có đoạn ngữ cảnh/dữ kiện chung áp dụng cho NHIỀU câu hỏi liền kề.

  ⚡ TRIGGER — Nhận diện khi gặp BẤT KỲ cụm từ nào sau:
    ▸ "Sử dụng thông tin sau..."
    ▸ "Dựa vào dữ kiện sau..."
    ▸ "Dùng dữ liệu sau cho câu X đến câu Y..."
    ▸ "Cho đoạn thông tin sau...Trả lời câu X, Y"
    ▸ "Đọc đoạn thông tin sau và trả lời..."
    ▸ "Một nhà máy / Một vật thể / Một thí nghiệm... (dữ kiện dài) ... Trả lời các câu X→Y"
    ▸ Hoặc BẤT KỲ đoạn dữ kiện dài nào đi kèm chỉ thị áp dụng cho nhiều câu

  QUY TẮC SẮT ĐÁ:
  1. GOM TOÀN BỘ đoạn dữ kiện chung vào trường "shared_context" (string)
  2. Mỗi câu hỏi phụ thuộc → đưa vào mảng "sub_questions"
  3. Mỗi sub_question là 1 object câu hỏi đầy đủ (part, content, options, correctAnswer, ...)
  4. item_type = "cluster" để phân biệt với câu đơn (item_type = "single")

  📌 VÍ DỤ OUTPUT:
  {
    "item_type": "cluster",
    "shared_context": "Sử dụng các thông tin sau... Một nhà máy điện hạt nhân dùng nhiên liệu uranium...",
    "topic": "Vật lí hạt nhân",
    "sub_questions": [
      {
        "part": 1, "content": "Một hạt nhân uranium phân hạch...",
        "options": ["A","B","C","D"], "correctAnswer": 2,
        "level": "Vận dụng", "explanation": "...", "tags": ["..."]
      },
      {
        "part": 1, "content": "Nếu nhà máy hoạt động liên tục...",
        "options": ["A","B","C","D"], "correctAnswer": 1,
        "level": "Vận dụng cao", "explanation": "...", "tags": ["..."]
      }
    ]
  }

  ⚠️ CÂU ĐƠN (không thuộc cluster):
  {
    "item_type": "single",
    "part": 1, "content": "...", "options": [...], "correctAnswer": 0, ...
  }

  ⛔ KHÔNG BAO GIỜ TÁCH RIÊNG CÂU CHÙM THÀNH CÂU ĐƠN — MẤT DỮ KIỆN!
`;

function buildDigitizePromptFull(inputDescription: string, topicHint?: string): string {
  return buildDigitizePromptBase(inputDescription, topicHint) + PAIRED_AND_CLUSTER_RULE;
}

// ─── Schema cho output AI: hỗ trợ cả single và cluster ──────────────────
const QUESTION_ITEM_PROPERTIES = {
  part:          { type: Type.INTEGER },
  topic:         { type: Type.STRING },
  level:         { type: Type.STRING },
  content:       { type: Type.STRING },
  options:       { type: Type.ARRAY, items: { type: Type.STRING } },
  correctAnswer: { type: Type.OBJECT },
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
 */
function normalizeCorrectAnswer(raw: any, part: number): any {
  // ── PART 1: Trắc nghiệm → số nguyên 0-3 ──
  if (part === 1) {
    // Đã là số hợp lệ
    if (typeof raw === 'number' && [0, 1, 2, 3].includes(raw)) return raw;

    // Chuỗi chữ cái: "A", "B", "C", "D" (có thể lẫn text thừa)
    if (typeof raw === 'string') {
      const cleaned = raw.trim().toUpperCase();
      // Tìm chữ cái A-D đầu tiên trong chuỗi
      // Xử lý: "Chọn A", "Đáp án: B", "A", "Lời giải: → C", "D."
      const match = cleaned.match(/\b([ABCD])\b|\.?\s*([ABCD])\s*\.?/);
      if (match) {
        const letter = (match[1] || match[2]);
        const MAP: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        if (letter && MAP[letter] !== undefined) return MAP[letter];
      }
      // Thử parse như số
      const numVal = parseInt(cleaned, 10);
      if ([0, 1, 2, 3].includes(numVal)) return numVal;
    }

    // Object dạng {"answer": "C"} hoặc {"correct_answer": "B"}
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const val = raw.answer || raw.correct_answer || raw.correctAnswer || raw.value;
      if (val !== undefined) return normalizeCorrectAnswer(val, 1);
    }

    // Fallback: 0 (A) — tốt hơn null
    console.warn('[normalizeCorrectAnswer] Part 1: Không parse được, fallback 0. Raw:', raw);
    return 0;
  }

  // ── PART 2: Đúng/Sai → boolean[4] ──
  if (part === 2) {
    // Đã đúng format
    if (Array.isArray(raw) && raw.length === 4 && raw.every((v: any) => typeof v === 'boolean')) {
      return raw;
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
      // Pad to 4 if needed
      while (normalized.length < 4) normalized.push(false);
      return normalized;
    }

    // Chuỗi: "Đ, S, S, Đ" hoặc "Đ - S - S - Đ" hoặc "true, false, true, false"
    if (typeof raw === 'string') {
      const parts = raw.split(/[,\-;/\s]+/).filter(Boolean);
      if (parts.length >= 4) {
        return parts.slice(0, 4).map((s: string) => {
          const v = s.trim().toLowerCase();
          return v === 'true' || v === 'đ' || v === 'đúng' || v === '✓' || v === '✔' || v === '*' || v === '1';
        });
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
      return fromObj;
    }

    console.warn('[normalizeCorrectAnswer] Part 2: Không parse được, fallback all false. Raw:', raw);
    return [false, false, false, false];
  }

  // ── PART 3: Trả lời ngắn → number ──
  if (part === 3) {
    // Đã là số
    if (typeof raw === 'number' && !isNaN(raw)) return raw;

    // Chuỗi chứa số: "2.45", "165", "Trả lời: 165", "Đáp án: 2,45"
    if (typeof raw === 'string') {
      // Xóa text thừa, giữ lại số (bao gồm dấu âm, chấm, phẩy)
      const cleaned = raw.replace(/,/g, '.'); // Phẩy → chấm
      const numMatch = cleaned.match(/-?\d+\.?\d*/);
      if (numMatch) {
        const val = parseFloat(numMatch[0]);
        if (!isNaN(val)) return val;
      }
    }

    // Object
    if (typeof raw === 'object' && raw !== null) {
      const val = raw.answer || raw.correct_answer || raw.correctAnswer || raw.value;
      if (val !== undefined) return normalizeCorrectAnswer(val, 3);
    }

    console.warn('[normalizeCorrectAnswer] Part 3: Không parse được, fallback 0. Raw:', raw);
    return 0;
  }

  return raw;
}

/**
 * Normalize toàn bộ mảng Question[] sau khi nhận từ AI.
 * Đảm bảo correctAnswer luôn đúng kiểu cho UI.
 * Hỗ trợ cả dạng cluster (flatten sub_questions → individual Questions + clusterId).
 */
export function normalizeQuestions(rawItems: any[]): Question[] {
  const flattened = flattenClusterOutput(rawItems);
  return flattened.map(q => ({
    ...q,
    correctAnswer: normalizeCorrectAnswer(q.correctAnswer, q.part),
  }));
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
      const { item_type, itemType: _it, shared_context, sub_questions, ...questionFields } = item;
      result.push(questionFields as Question);
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
 * Tối đa 3 lần, delay: 3s → 5s → 10s.
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
        const delaySec = [3, 5, 10][attempt] ?? 10;
        console.warn(`[Gemini] Lỗi tạm thời (lần ${attempt + 1}/${maxRetries}), thử lại sau ${delaySec}s...`);
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
  const pageGroups = await splitPdfToPageGroups(pdfBuffer, 2);

  const prompt = buildDigitizePromptFull(
    "nội dung đề thi Vật lý trong file PDF đính kèm",
    topicHint
  );

  onProgress?.(`PDF có ${pageGroups.length} phần. Đang xử lý song song...`);

  // Xử lý từng nhóm trang — chạy song song tối đa 3 nhóm cùng lúc
  const CONCURRENCY = 3;
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

        // Pro trước, Flash fallback
        for (const model of [MODELS.DIGITIZE, MODELS.ANALYZE]) {
          onProgress?.(
            model === MODELS.DIGITIZE
              ? `⚡ Pro đang phân tích phần ${groupIdx + 1}/${pageGroups.length}...`
              : `🔄 Dùng Flash cho phần ${groupIdx + 1}...`
          );

          try {
            const response = await retryWithBackoff(() => ai.models.generateContent({
              model,
              contents: [{ role: "user", parts: [pdfPart, { text: prompt }] }],
              config: {
                ...(model === MODELS.DIGITIZE ? { thinkingConfig: { thinkingBudget: 10000 } } : {}),
                responseMimeType: "application/json",
                responseSchema: DIGITIZE_SCHEMA,
              }
            }));

            return JSON.parse(response.text || "[]") as Question[];
          } catch (error) {
            if (isRateLimitError(error) && model === MODELS.DIGITIZE) {
              console.warn(`Pro bị 429 ở phần ${groupIdx + 1}, thử Flash...`);
              continue;
            }
            console.error(`PDF Error phần ${groupIdx + 1}:`, error);
            throw error;
          }
        }
        throw new Error(`Phần ${groupIdx + 1}: Tất cả model đều thất bại.`);
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
  onProgress?.(`📦 Chia thành ${totalChunks} phần (mỗi phần ~10-15 câu). Đang xử lý...`);

  // ── Hàm xử lý 1 chunk — Flash trước, Pro fallback ──
  const processChunk = async (chunk: string, idx: number): Promise<Question[]> => {
    const prompt = buildDigitizePromptFull(
      "nội dung HTML từ file Word (ảnh đã được thay bằng URL Firebase Storage)",
      topicHint
    ) + `\n\n=== NỘI DUNG HTML ĐẦU VÀO ===\n${chunk}`;

    for (const model of [MODELS.ANALYZE, MODELS.DIGITIZE]) {
      onProgress?.(
        model === MODELS.ANALYZE
          ? `⚡ Flash đang xử lý phần ${idx + 1}/${totalChunks}...`
          : `🔄 Dùng Pro cho phần ${idx + 1}/${totalChunks}...`
      );
      try {
        const response = await retryWithBackoff(
          () => ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              ...(model === MODELS.DIGITIZE ? { thinkingConfig: { thinkingBudget: 8000 } } : {}),
              responseMimeType: "application/json",
              responseSchema: DIGITIZE_SCHEMA,
            }
          }),
          3,   // maxRetries
          3000, // baseDelay
          // ── UI callback khi retry ──
          (attempt, max, delaySec) => {
            onProgress?.(`⏳ Server AI đang bận — tự động kết nối lại (${attempt}/${max}), đợi ${delaySec}s...`);
          }
        );

        const questions = JSON.parse(response.text || "[]") as Question[];
        onProgress?.(`✅ Hoàn thành phần ${idx + 1}/${totalChunks} — ${questions.length} câu`);
        return questions;
      } catch (error) {
        if (isTransientError(error) && model === MODELS.ANALYZE) {
          console.warn(`Flash bị lỗi ở chunk ${idx + 1}, thử Pro...`);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Phần ${idx + 1}: Tất cả model đều thất bại.`);
  };

  // ── Xử lý tuần tự theo batch, tối đa MAX_CONCURRENCY song song ──
  const tasks = chunks.map((chunk, idx) => () => processChunk(chunk, idx));
  const results = await runWithConcurrency(tasks, MAX_CONCURRENCY);

  onProgress?.("🔗 Đang chuẩn hóa đáp án...");
  return normalizeQuestions(results.flat());
}

