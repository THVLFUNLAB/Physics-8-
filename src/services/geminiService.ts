import { GoogleGenAI, Type } from "@google/genai";
import { Question, ErrorAnalysis } from "../types";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please check your environment settings.");
  }
  return new GoogleGenAI({ apiKey });
};

export async function analyzeAnswer(
  question: Question,
  studentAnswer: any,
  isCorrect: boolean
): Promise<{ analysis: ErrorAnalysis; feedback: string }> {
  const model = "gemini-3-flash-preview"; // Using flash for faster analysis
  const ai = getAI();
  
  const prompt = `
    Bạn là Kiến trúc sư trưởng dự án PHYS-8+.
    Nhiệm vụ: Phân tích câu trả lời của học sinh cho câu hỏi Vật lý THPT.
    
    Câu hỏi (Phần ${question.part}): ${question.content}
    Chủ đề: ${question.topic}
    Đáp án đúng: ${JSON.stringify(question.correctAnswer)}
    Giải thích: ${question.explanation}
    
    Câu trả lời của học sinh: ${JSON.stringify(studentAnswer)}
    Kết quả: ${isCorrect ? "Đúng" : "Sai"}
    
    Yêu cầu:
    1. Phân loại lỗi (nếu sai) vào 1 trong 3 nhóm: "Lỗi hiểu sai bản chất", "Lỗi kỹ năng", "Lỗi kỹ thuật".
    2. Phản hồi theo cấu trúc: [Đúng/Sai] -> [Bản chất Vật lý] -> [Nhắc nhở kỹ năng].
    3. Nếu là Phần III (Trả lời ngắn), hãy kiểm tra khắt khe quy tắc làm tròn số.
    4. Chỉ sử dụng kiến thức Chương trình GDPT 2018.
    
    Trả về kết quả dưới dạng JSON:
    {
      "analysis": {
        "type": "Lỗi hiểu sai bản chất" | "Lỗi kỹ năng" | "Lỗi kỹ thuật",
        "reason": "Giải thích tại sao sai",
        "advice": "Lời khuyên khắc phục"
      },
      "feedback": "[Đúng/Sai] -> [Bản chất Vật lý] -> [Nhắc nhở kỹ năng]"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
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
      feedback: isCorrect ? "[Đúng] -> Bạn đã làm tốt!" : "[Sai] -> Hãy kiểm tra lại kiến thức cơ bản."
    };
  }
}

export async function digitizeDocument(
  htmlContent: string,
  topicHint?: string
): Promise<Question[]> {
  const model = "gemini-3-flash-preview"; // Using flash for better availability
  const ai = getAI();
  
  // If content is extremely large, split it into chunks of ~20,000 characters
  const MAX_CHUNK_SIZE = 20000;
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
    const prompt = `
      Bạn là Chuyên gia Số hóa Đề thi Vật lý Cao cấp (Azota-style AI).
      Nhiệm vụ: Chuyển đổi nội dung HTML bóc tách từ file Word thành danh sách câu hỏi cấu trúc Bộ GD&ĐT 2025.
      
      Nội dung HTML (Đoạn trích):
      ${chunk}
      
      Gợi ý chủ đề: ${topicHint || "Vật lý THPT"}
      
      YÊU CẦU BÓC TÁCH PHỨC TẠP:
      1. CẤU TRÚC 3 PHẦN:
         - Phần I: Trắc nghiệm 4 lựa chọn (A, B, C, D). Tìm đáp án sau từ khóa "Chọn A/B/C/D" hoặc trong phần "Hướng dẫn".
         - Phần II: Trắc nghiệm Đúng/Sai (4 ý a, b, c, d). Tìm trạng thái Đúng/Sai cho từng ý trong phần "Hướng dẫn".
         - Phần III: Trả lời ngắn. Tìm giá trị số sau từ khóa "Trả lời ngắn:" hoặc trong "Hướng dẫn".
      
      2. XỬ LÝ NGỮ CẢNH CHUNG (Common Context):
         - Nếu thấy cụm từ "Sử dụng thông tin sau cho Câu X và Câu Y", hãy trích xuất đoạn văn bản/hình ảnh đó và lặp lại nó trong trường "content" của cả Câu X và Câu Y.
      
      3. CÔNG THỨC & KÝ HIỆU:
         - Chuyển đổi TOÀN BỘ công thức, ký hiệu toán học, đơn vị phức tạp sang LaTeX (kẹp trong $...$ cho inline hoặc $$...$$ cho khối).
      
      4. HÌNH ẢNH & BẢNG BIỂU:
         - Giữ nguyên thẻ <img> hoặc ghi chú [HÌNH MINH HỌA] tại đúng vị trí trong văn bản.
      
      5. GIẢI THÍCH CHI TIẾT (Hướng dẫn):
         - Trích xuất toàn bộ nội dung sau từ khóa "Hướng dẫn" vào trường "explanation".
      
      6. GẮN NHÃN (Tags) CHUYÊN SÂU:
         - Gắn nhãn theo cây kiến thức: [Chương] -> [Bài] -> [Dạng toán].
      
      7. ĐỀ XUẤT HỌC LIỆU & MÔ PHỎNG:
         - Dựa trên chủ đề câu hỏi, hãy đề xuất 1-2 link video bài giảng (Youtube) hoặc tài liệu tóm tắt (Wiki/Blog Vật lý) uy tín.
         - Nếu câu hỏi có thể minh họa bằng thí nghiệm ảo, hãy đề xuất URL mô phỏng PhET (ví dụ: https://phet.colorado.edu/sims/html/faradays-law/latest/faradays-law_all.html).
      
      Trả về mảng JSON các đối tượng Question:
      {
        "part": 1 | 2 | 3,
        "topic": "Vật lí nhiệt" | "Khí lí tưởng" | "Từ trường" | "Vật lí hạt nhân",
        "level": "Nhận biết" | "Thông hiểu" | "Vận dụng" | "Vận dụng cao",
        "content": "Nội dung câu hỏi + Ngữ cảnh chung (nếu có) + LaTeX",
        "options": ["A...", "B...", "C...", "D..."] (chỉ cho Phần I),
        "correctAnswer": index (Phần I: 0-3) | [true, false, true, false] (Phần II) | number (Phần III),
        "explanation": "Lời giải chi tiết kèm LaTeX",
        "tags": ["Tag 1", "Tag 2", "Tag 3"],
        "resources": [
          { "title": "Tên bài giảng/tài liệu", "url": "Link thực tế", "type": "video" | "document" }
        ],
        "simulationUrl": "Link PhET/Virtual Lab"
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                part: { type: Type.INTEGER },
                topic: { type: Type.STRING },
                level: { type: Type.STRING },
                content: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.OBJECT },
                explanation: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                resources: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      url: { type: Type.STRING },
                      type: { type: Type.STRING }
                    },
                    required: ["title", "url", "type"]
                  }
                },
                simulationUrl: { type: Type.STRING }
              },
              required: ["part", "topic", "content", "correctAnswer", "tags", "explanation"]
            }
          }
        }
      });

      const chunkQuestions = JSON.parse(response.text || "[]");
      allQuestions.push(...chunkQuestions);
    } catch (error) {
      console.error("Chunk Digitization Error:", error);
      throw error; // Re-throw to handle in UI
    }
  }

  return allQuestions;
}
