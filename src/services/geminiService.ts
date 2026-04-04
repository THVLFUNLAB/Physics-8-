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

【2】 CORRECTANSWER — TỰ ĐỘNG NHẬN DIỆN ĐÁP ÁN (RẤT QUAN TRỌNG, BẮT BUỘC):
  ⚠️ QUY TẮC SẮT ĐÁ: correctAnswer KHÔNG BAO GIỜ được null/undefined. Phải luôn có giá trị.

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
  ✅ Ưu tiên 6: Nếu đang trong phần "Lời giải", tìm kết luận cuối: "→ Chọn B", "Đáp án: C"
  
  ⛔ Nếu KHÔNG tìm thấy bất kỳ dấu hiệu nào → Dùng kiến thức Vật lý để GIẢI câu hỏi → chọn đáp án đúng.
  
  VÍ DỤ:
  - Thấy <u>B</u> → correctAnswer = 1
  - Thấy <strong>C</strong>. 340 m/s → correctAnswer = 2
  - Bảng đáp án: "Câu 5: D" → correctAnswer = 3
  - Không có dấu hiệu → AI giải bài → xác định A đúng → correctAnswer = 0

  ━━━ PART 2 (Đúng/Sai 4 ý) → correctAnswer = [bool, bool, bool, bool] ━━━
  Mỗi ý a), b), c), d) cần xác định Đúng (true) hoặc Sai (false):
  
  ✅ Ưu tiên 1: Dấu sao (*) trước chữ cái → ĐÚNG (true). VD: *a), *b) → true
  ✅ Ưu tiên 2: Ký hiệu Đ/S ghi kèm: "a) Đ", "b) S" hoặc "a) ✓", "b) ✗"
  ✅ Ưu tiên 3: Ý nào được **gạch chân** hoặc **in đậm** → ĐÚNG
  ✅ Ưu tiên 4: Tìm BẢNG ĐÁP ÁN cuối đề. Format phổ biến:
     - "Câu 19: a-Đ, b-Đ, c-S, d-S" → [true, true, false, false]
     - "19: Đ Đ S Đ" → [true, true, false, true]
     - "19: a)* b)* c) d)" → [true, true, false, false]
  ✅ Ưu tiên 5: Nếu ý có lời giải → đọc lời giải để xác nhận
  
  ⛔ Nếu KHÔNG tìm thấy → Dùng kiến thức Vật lý: đọc từng mệnh đề, xác nhận đúng/sai bằng lý thuyết.
  
  VÍ DỤ:
  - *a) Đúng, *b) Đúng, c) Sai, *d) Đúng → [true, true, false, true]
  - Không dấu hiệu → AI tự phân tích: a) đúng theo ĐL Newton, b) sai vì...  → [true, false, ...]

  ━━━ PART 3 (Trả lời ngắn) → correctAnswer = số thực (number) ━━━
  Tìm đáp số bằng cách quét:
  
  ✅ Ưu tiên 1: Tìm cụm "Đáp án:", "KQ:", "Kết quả:", "Đ/A:" → lấy con số ngay sau đó
  ✅ Ưu tiên 2: Tìm BẢNG ĐÁP ÁN cuối đề: "Câu 25: 1.25", "25. 2,5"
  ✅ Ưu tiên 3: Nếu có lời giải → tìm con số cuối cùng trong lời giải (thường là đáp số)
  ✅ Ưu tiên 4: Tìm số được **in đậm** hoặc **gạch chân** hoặc **đóng khung** trong câu hỏi
  
  ⛔ Nếu KHÔNG tìm thấy → Dùng kiến thức Vật lý: GIẢI BÀI TOÁN → ghi đáp số.
  
  ⚠️ Lưu ý format số: "1,25" (phẩy) = 1.25 (chấm). Luôn trả về dạng chấm thập phân.
  
  VÍ DỤ:
  - "Đáp án: 2,45" → correctAnswer = 2.45
  - Bảng: "Câu 27: 0.75" → correctAnswer = 0.75
  - Không có đáp án → AI giải: F = ma = 2×3 = 6 → correctAnswer = 6

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

【10】 KIỂM TRA TRƯỚC KHI OUTPUT (BẮT BUỘC):
  ✓ correctAnswer hợp lệ cho MỌI câu?
    - Part 1: phải là số 0, 1, 2, hoặc 3 (KHÔNG PHẢI null, KHÔNG PHẢI -1)
    - Part 2: phải là mảng 4 phần tử boolean [true/false, ...]
    - Part 3: phải là số thực (number), KHÔNG PHẢI chuỗi
  ✓ Nếu không tìm thấy đáp án trong đề → AI PHẢI TỰ GIẢI để xác định đáp án đúng
  ✓ topic cụ thể (không chung chung)?
  ✓ tags >= 2?
  ✓ LaTeX đầy đủ?
  ✓ Placeholder đúng?
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

  const prompt = buildDigitizePrompt(
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
            const response = await ai.models.generateContent({
              model,
              contents: [{ role: "user", parts: [pdfPart, { text: prompt }] }],
              config: {
                ...(model === MODELS.DIGITIZE ? { thinkingConfig: { thinkingBudget: 10000 } } : {}),
                responseMimeType: "application/json",
                responseSchema: DIGITIZE_SCHEMA,
              }
            });

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

  onProgress?.("Đang ghép kết quả...");
  return allQuestions;
}

// ============================================================
// DIGITIZE DOCUMENT (HTML) — Flash ưu tiên + Parallel chunks
// Input đã sạch (text + Firebase URLs), Flash xử lý cực nhanh
// ============================================================
export async function digitizeDocument(
  htmlContent: string,
  topicHint?: string,
  onProgress?: (status: string) => void
): Promise<Question[]> {
  const ai = getAI();

  // Tách thành chunks nếu quá dài
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

  onProgress?.(`Gemini Flash đang phân tích ${chunks.length} phần...`);

  // Hàm xử lý 1 chunk — Flash trước, Pro fallback
  const processChunk = async (chunk: string, idx: number): Promise<Question[]> => {
    const prompt = buildDigitizePrompt(
      "nội dung HTML từ file Word (ảnh đã được thay bằng URL Firebase Storage)",
      topicHint
    ) + `\n\n=== NỘI DUNG HTML ĐẦU VÀO ===\n${chunk}`;

    // Ưu tiên Flash (nhanh, rẻ) vì input là text thuần
    for (const model of [MODELS.ANALYZE, MODELS.DIGITIZE]) {
      onProgress?.(
        model === MODELS.ANALYZE
          ? `⚡ Flash đang xử lý phần ${idx + 1}/${chunks.length}...`
          : `🔄 Flash thất bại, dùng Pro cho phần ${idx + 1}...`
      );
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

        return JSON.parse(response.text || "[]") as Question[];
      } catch (error) {
        if (isRateLimitError(error) && model === MODELS.ANALYZE) {
          console.warn(`Flash bị rate limit ở chunk ${idx + 1}, thử Pro...`);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Chunk ${idx + 1}: Tất cả model đều thất bại.`);
  };

  // Xử lý song song tất cả chunks bằng Promise.all()
  const results = await Promise.all(
    chunks.map((chunk, idx) => processChunk(chunk, idx))
  );

  onProgress?.("Đang ghép kết quả...");
  return results.flat();
}

