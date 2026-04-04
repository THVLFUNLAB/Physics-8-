import { GoogleGenAI, Type } from "@google/genai";
import { Question, ErrorAnalysis } from "../types";

// ============================================================
// MODEL CONFIGURATION
// - gemini-2.5-pro  : Số hóa đề (cần reasoning sâu, độ chính xác cao)
// - gemini-2.0-flash: Phân tích câu trả lời / fallback khi Pro bị 429
// ============================================================
const MODELS = {
  DIGITIZE: "gemini-2.5-pro",
  ANALYZE:  "gemini-2.0-flash",
} as const;

const MAX_CHUNK_SIZE = 60_000;

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please check your environment settings.");
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

    return JSON.parse(response.text || "{}");
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
`;

// ============================================================
// SHARED: Prompt & Schema — Đọc BẤT KỲ đề nào
// ============================================================

function buildDigitizePrompt(inputDescription: string, topicHint?: string): string {
  return `
Bạn là Chuyên gia Số hóa Đề thi Vật lý THPT Cao cấp, với khả năng suy luận sâu.

## NHIỆM VỤ
Đọc và số hóa ${inputDescription} thành cấu trúc JSON câu hỏi chuẩn.
${topicHint ? `Gợi ý chủ đề: ${topicHint}` : 'Tự nhận diện chủ đề dựa trên nội dung câu hỏi.'}

${PHYSICS_KNOWLEDGE_TREE}

## QUY TẮC SỐ HÓA

【1】 TỰ NHẬN DIỆN CẤU TRÚC ĐỀ:
  Đề có thể có nhiều format khác nhau. Hãy TỰ PHÁT HIỆN:
  • Câu trắc nghiệm 4 lựa chọn (A/B/C/D) → part = 1
  • Câu đúng/sai 4 ý (a/b/c/d với Đ/S) → part = 2
  • Câu trả lời ngắn (điền số) → part = 3
  • Nếu đề không chia phần rõ ràng → dựa vào dạng câu hỏi để phân loại

【2】 CORRECTANSWER (BẮT BUỘC, KHÔNG được null):
  TÌM ĐÁP ÁN DỰA VÀO ĐẶC ĐIỂM THỊ GIÁC VÀ KÝ HIỆU TRONG FILE:
  • Part 1 (Trắc nghiệm 4 lựa chọn):
    - correctAnswer = index số nguyên (0=A, 1=B, 2=C, 3=D)
    - AI hãy nhìn kỹ: Phương án nào có chữ A, B, C hoặc D **được gạch chân** (underline) thì đó là đáp án đúng.
    - VD: Nếu thấy <u>A</u> thì correctAnswer = 0.
  • Part 2 (Đúng/Sai 4 ý):
    - correctAnswer = mảng boolean [bool, bool, bool, bool] (tương ứng a, b, c, d)
    - AI hãy nhìn kỹ: Ý nào có **dấu sao (*)** nằm trước chữ cái (VD: *a) hoặc *a.) thì ý đó ĐÚNG (true). Không có dấu sao là SAI (false).
  • Part 3 (Trả lời ngắn):
    - correctAnswer = số thực (ghi nhớ: đáp án phần này tối đa 4 kí tự số)
    - AI hãy tìm con số nằm ngay sau chữ **"Đáp án:"**.
  *(Nếu trong đề không có những dấu hiệu trên, hãy đọc kỹ bảng đáp án ở phần "HẾT" hoặc cuối đề để thiết lập đúng).*

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

【7】 HÌNH ẢNH → PLACEHOLDER:
  • Có hình → **[HÌNH MINH HỌA — Thầy cần chèn ảnh tại đây]**
  • Mô tả ngắn nội dung hình nếu đọc được

【8】 BẢNG SỐ LIỆU → PLACEHOLDER:
  • Có bảng → **[BẢNG SỐ LIỆU — Thầy copy nội dung bảng vào đây]**

【9】 LỜI GIẢI (explanation):
  • Trích NGUYÊN VĂN lời giải nếu đề có, chuyển LaTeX
  • Kết thúc: "→ **Đáp án: [kết quả]**"
  • Nếu đề KHÔNG có lời giải → "Chưa có lời giải chi tiết."

【10】 KIỂM TRA TRƯỚC KHI OUTPUT:
  ✓ correctAnswer hợp lệ? ✓ topic cụ thể? ✓ tags >= 2? ✓ LaTeX đủ? ✓ Placeholder đúng?
  `.trim();
}

const DIGITIZE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      part:          { type: Type.INTEGER },
      topic:         { type: Type.STRING },
      level:         { type: Type.STRING },
      content:       { type: Type.STRING },
      options:       { type: Type.ARRAY, items: { type: Type.STRING } },
      correctAnswer: { type: Type.OBJECT },
      explanation:   { type: Type.STRING },
      tags:          { type: Type.ARRAY, items: { type: Type.STRING } },
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
    },
    required: ["part", "topic", "level", "content", "correctAnswer", "tags", "explanation"]
  }
} as const;

// ============================================================
// Tiện ích
// ============================================================
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function isRateLimitError(error: any): boolean {
  const msg = String(error?.message || error || '');
  return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
}

// ============================================================
// DIGITIZE FROM PDF — Gemini Vision + Fallback 429
// ============================================================
export async function digitizeFromPDF(
  pdfFile: File,
  topicHint?: string,
  onProgress?: (status: string) => void
): Promise<Question[]> {
  const ai = getAI();

  onProgress?.("Đang đọc file PDF...");
  const base64Data = await fileToBase64(pdfFile);

  const prompt = buildDigitizePrompt(
    "nội dung đề thi Vật lý trong file PDF đính kèm",
    topicHint
  );

  const pdfPart = {
    inlineData: {
      mimeType: "application/pdf" as const,
      data: base64Data,
    }
  };

  // Thử Pro trước, fallback Flash nếu 429
  for (const model of [MODELS.DIGITIZE, MODELS.ANALYZE]) {
    onProgress?.(
      model === MODELS.DIGITIZE
        ? "AI Gemini 2.5 Pro đang phân tích PDF..."
        : "⚠️ Pro hết quota, đang dùng Flash..."
    );

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [pdfPart, { text: prompt }] }],
        config: {
          ...(model === MODELS.DIGITIZE ? { thinkingConfig: { thinkingBudget: 10000 } } : {}),
          responseMimeType: "application/json",
          responseSchema: DIGITIZE_SCHEMA,
        }
      });

      onProgress?.("Đang xử lý kết quả...");
      return JSON.parse(response.text || "[]") as Question[];
    } catch (error) {
      if (isRateLimitError(error) && model === MODELS.DIGITIZE) {
        console.warn("Gemini 2.5 Pro bị rate limit, fallback sang Flash...");
        continue;
      }
      console.error("PDF Digitization Error:", error);
      throw error;
    }
  }

  throw new Error("Tất cả model đều thất bại. Vui lòng thử lại sau.");
}

// ============================================================
// DIGITIZE DOCUMENT (HTML) — Word/mammoth + Fallback 429
// ============================================================
export async function digitizeDocument(
  htmlContent: string,
  topicHint?: string,
  onProgress?: (status: string) => void
): Promise<Question[]> {
  const ai = getAI();

  const chunks: string[] = [];
  if (htmlContent.length > MAX_CHUNK_SIZE) {
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
  } else {
    chunks.push(htmlContent);
  }

  const allQuestions: Question[] = [];

  for (const chunk of chunks) {
    const prompt = buildDigitizePrompt(
      "nội dung HTML từ file Word",
      topicHint
    ) + `\n\n=== NỘI DUNG HTML ĐẦU VÀO ===\n${chunk}`;

    let success = false;
    for (const model of [MODELS.DIGITIZE, MODELS.ANALYZE]) {
      if (model !== MODELS.DIGITIZE) {
        onProgress?.("⚠️ Pro hết quota, đang dùng Flash...");
      }
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            ...(model === MODELS.DIGITIZE ? { thinkingConfig: { thinkingBudget: 8000 } } : {}),
            responseMimeType: "application/json",
            responseSchema: DIGITIZE_SCHEMA,
          }
        });

        allQuestions.push(...JSON.parse(response.text || "[]"));
        success = true;
        break;
      } catch (error) {
        if (isRateLimitError(error) && model === MODELS.DIGITIZE) {
          console.warn("Pro bị rate limit, thử Flash...");
          continue;
        }
        throw error;
      }
    }
    if (!success) throw new Error("Tất cả model đều thất bại.");
  }

  return allQuestions;
}
