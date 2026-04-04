import { Question, Topic } from "../types";

export function parseByRules(text: string, topic: Topic): Question[] {
  const questions: Question[] = [];
  
  // Split text by "Câu [số]"
  const blocks = text.split(/(?=Câu\s+\d+[:.])/i).filter(b => b.trim().length > 0);
  
  for (const block of blocks) {
    try {
      // Determine Part based on structure
      if (block.includes("a)") && block.includes("b)") && block.includes("c)") && block.includes("d)")) {
        // Part II: True/False
        const match = block.match(/Câu\s+\d+[:.]\s*([\s\S]*?)\s*a\)\s*([\s\S]*?)\s*b\)\s*([\s\S]*?)\s*c\)\s*([\s\S]*?)\s*d\)\s*([\s\S]*?)(?:\s*Hướng dẫn:\s*([\s\S]*))?$/i);
        if (match) {
          questions.push({
            part: 2,
            topic,
            level: "Thông hiểu",
            content: match[1].trim(),
            options: [match[2].trim(), match[3].trim(), match[4].trim(), match[5].trim()],
            correctAnswer: [true, true, true, true], // Default to True, user can edit later or we look for keywords
            explanation: match[6]?.trim() || "Chưa có lời giải chi tiết.",
            tags: ["Số hóa thủ công", "Phần II"]
          });
        }
      } else if (block.includes("A.") && block.includes("B.") && block.includes("C.") && block.includes("D.")) {
        // Part I: Multiple Choice
        const match = block.match(/Câu\s+\d+[:.]\s*([\s\S]*?)\s*A\.\s*([\s\S]*?)\s*B\.\s*([\s\S]*?)\s*C\.\s*([\s\S]*?)\s*D\.\s*([\s\S]*?)(?:\s*Hướng dẫn:\s*([\s\S]*))?$/i);
        if (match) {
          // Look for correct answer hint like "Chọn A"
          let correctIdx = 0;
          const hintMatch = block.match(/Chọn\s+([A-D])/i);
          if (hintMatch) {
            correctIdx = hintMatch[1].toUpperCase().charCodeAt(0) - 65;
          }

          questions.push({
            part: 1,
            topic,
            level: "Thông hiểu",
            content: match[1].trim(),
            options: [match[2].trim(), match[3].trim(), match[4].trim(), match[5].trim()],
            correctAnswer: correctIdx,
            explanation: match[6]?.trim() || "Chưa có lời giải chi tiết.",
            tags: ["Số hóa thủ công", "Phần I"]
          });
        }
      } else if (block.toLowerCase().includes("trả lời ngắn")) {
        // Part III: Short Answer
        const match = block.match(/Câu\s+\d+[:.]\s*([\s\S]*?)\s*Trả lời ngắn:\s*([\d.,-]+)(?:\s*Hướng dẫn:\s*([\s\S]*))?$/i);
        if (match) {
          questions.push({
            part: 3,
            topic,
            level: "Vận dụng",
            content: match[1].trim(),
            correctAnswer: parseFloat(match[2].replace(',', '.')),
            explanation: match[3]?.trim() || "Chưa có lời giải chi tiết.",
            tags: ["Số hóa thủ công", "Phần III"]
          });
        }
      }
    } catch (e) {
      console.warn("Error parsing block:", block, e);
    }
  }
  
  return questions;
}
