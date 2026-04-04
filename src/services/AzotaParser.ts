/**
 * AzotaParser.ts  v2 — HTML-Aware State Machine Parser
 * ──────────────────────────────────────────────────────────────────────────
 * Nâng cấp từ v1: Đầu vào là HTML (từ DocxReader.ts),
 * KHÔNG phải plain text.
 *
 * Mọi <img src="..."> và công thức $LaTeX$ được BẢO TOÀN NGUYÊN VẸN
 * trong chuỗi content/options/explanation của từng câu hỏi.
 *
 * Kiến trúc: State Machine duyệt từng "dòng HTML logic"
 * (content của mỗi thẻ <p> sau khi splitHtmlIntoLines())
 */

import { Question, Topic, QuestionLevel, Part } from '../types';
import { splitHtmlIntoLines } from './DocxReader';

// ─── Kiểu dữ liệu ────────────────────────────────────────────────────────

export interface DifficultyTag {
  score: number;   // VD: 1
  level: string;   // VD: 'NB', 'TH', 'VD', 'VDC'
  raw: string;     // VD: '[1,NB]'
}

export interface Part2SubItem {
  text: string;                  // HTML content (có thể chứa <img>)
  difficultyTag?: DifficultyTag;
}

export interface RawQuestion {
  lineStart: number;
  part: Part;
  number: number;
  content: string;               // HTML string
  options?: string[];            // HTML strings (Phần I)
  subItems?: Part2SubItem[];     // Phần II
  correctAnswer?: any;
  explanation?: string;          // HTML string
}

export interface ParseResult {
  questions: Question[];
  errors: ParseError[];
  rawQuestions: RawQuestion[];
  stats: {
    part1Count: number;
    part2Count: number;
    part3Count: number;
    answersMatched: number;
  };
}

export interface ParseError {
  line: number;
  message: string;
}

// ─── Regex (HTML-aware: bỏ qua nội dung bên trong thẻ HTML) ──────────────

/** Nhận diện đầu phần — tìm trong TEXT content (loại bỏ tags trước khi test) */
const RE_PART_I   = /^\s*ph\s*[àầ]\s*n\s+i\b/i;
const RE_PART_II  = /^\s*ph\s*[àầ]\s*n\s+ii\b/i;
const RE_PART_III = /^\s*ph\s*[àầ]\s*n\s+iii\b/i;
const RE_HET      = /^\s*h\s*[eế]\s*t\s*$/i;
const RE_LOI_GIAI = /l[oờ]i\s*gi[aả]i/i;

/**
 * Nhận diện đầu câu: "Câu 1.", "Câu 12:", "câu 1."
 * Capture group 1 = số câu, group 2 = phần text sau dấu ./:
 * Dùng trên TEXT thuần (sau khi strip HTML)
 */
const RE_QUESTION_START_TEXT = /^\s*c\s*â\s*u\s+(\d+)\s*[.:]\s*(.*)/is;

/** Phần I: lựa chọn A/B/C/D trên TEXT thuần */
const RE_OPTION_P1_TEXT = /^\s*([A-D])\.\s+(.*)/s;

/** Phần II: ý nhỏ a)/b)/c)/d) trên TEXT thuần */
const RE_SUBITEM_P2_TEXT = /^\s*([a-d])\)\s*(.*)/s;

/**
 * DifficultyTag: [1,NB] hoặc [0, TH] ở đầu nội dung sau khi strip HTML.
 * Chỉ tìm trên text, sau đó ta cắt ra khỏi HTML gốc.
 */
const RE_DIFFICULTY_TAG = /^\[(\d+)\s*,\s*([A-Za-z]+)\]\s*(.*)/s;

/** Bảng đáp án Phần I: "1.A  2.B  3.C ..." trên text */
const RE_ANSWER_TABLE_INLINE = /(\d+)\s*[.:\-]\s*([A-Da-d])/g;

/** Bảng đáp án Phần II: "Câu 19: a-Đ  b-S  c-Đ  d-S" trên text */
const RE_ANSWER_P2_ROW  = /c\s*â\s*u\s+(\d+)\s*[:.]?\s*(.*)/i;
const RE_ANSWER_P2_ITEM = /([a-d])\s*[-—]\s*([ĐđSsTt])/g;

/** Bảng đáp án Phần III: "Câu 23: 1.25" trên text */
const RE_ANSWER_P3_ROW = /c\s*â\s*u\s+(\d+)\s*[:.]?\s*([\d.,]+)/i;

/** Đầu lời giải: "Câu 3:" hoặc "Câu 3." */
const RE_SOLUTION_START = /^\s*c\s*â\s*u\s+(\d+)\s*[:.](.*)$/is;

// ─── Helper: strip HTML để test regex ────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')  // xóa tất cả tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cắt DifficultyTag ra khỏi chuỗi HTML gốc.
 * Tag luôn nằm ở đầu TEXT, trước nội dung — ta tìm vị trí text sau khi
 * bỏ bất kỳ thẻ HTML mở đầu nào, rồi xóa '[x,XX]' ra.
 */
function extractDifficultyTagFromHtml(html: string): {
  tag?: DifficultyTag;
  htmlWithoutTag: string;
} {
  const text = stripHtml(html);
  const m = RE_DIFFICULTY_TAG.exec(text);
  if (!m) return { htmlWithoutTag: html };

  const tag: DifficultyTag = {
    score: parseInt(m[1], 10),
    level: m[2].toUpperCase(),
    raw: `[${m[1]},${m[2]}]`,
  };

  // Xóa pattern [số,mã] ra khỏi HTML (tìm dưới dạng text node)
  const tagPattern = new RegExp(
    `\\[${m[1]}\\s*,\\s*${m[2]}\\]\\s*`,
    'i'
  );
  const htmlWithoutTag = html.replace(tagPattern, '').trim();
  return { tag, htmlWithoutTag };
}

// ─── Máy trạng thái ───────────────────────────────────────────────────────

type State =
  | 'INIT'
  | 'PART_I'
  | 'PART_II'
  | 'PART_III'
  | 'AFTER_HET'
  | 'SOLUTION_SECTION';

// ─── Hàm chính: nhận HTML ─────────────────────────────────────────────────

/**
 * Bóc tách đề thi từ HTML (output của DocxReader.processDocxFile).
 * Ảnh <img> và công thức $LaTeX$ được giữ nguyên trong nội dung câu hỏi.
 *
 * @param html   Chuỗi HTML đã xử lý từ DocxReader
 * @param topic  Chủ đề gán cho tất cả câu hỏi
 */
export function parseAzotaExam(html: string, topic: Topic): ParseResult {
  // Bước 1: Tách HTML thành "dòng" — mỗi dòng = content của một <p>
  const lines = splitHtmlIntoLines(html);

  const errors: ParseError[] = [];
  const rawQuestions: RawQuestion[] = [];

  let state: State = 'INIT';
  let currentQuestion: RawQuestion | null = null;
  let currentOptionKey: 'A' | 'B' | 'C' | 'D' | null = null;

  // Đáp án thu thập sau HẾT
  const rawAnswers: Map<number, string>   = new Map();
  const rawAnswersP2: Map<number, string[]> = new Map();
  const rawAnswersP3: Map<number, number> = new Map();

  // Lời giải
  const rawSolutions: Map<number, string[]> = new Map();
  let currentSolutionNum: number | null = null;

  // ── Helper: đóng câu hiện tại ──────────────────────────────────────────
  const flushQuestion = () => {
    if (!currentQuestion) return;
    currentQuestion.content = currentQuestion.content.trim();
    if (currentQuestion.options)
      currentQuestion.options = currentQuestion.options.map(o => o.trim());
    if (currentQuestion.subItems)
      currentQuestion.subItems = currentQuestion.subItems.map(si => ({
        ...si,
        text: si.text.trim(),
      }));
    rawQuestions.push(currentQuestion);
    currentQuestion = null;
    currentOptionKey = null;
  };

  // ── Vòng lặp duyệt từng "dòng HTML" ──────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const htmlLine = lines[i];          // HTML gốc (có thể chứa <img>)
    const textLine = stripHtml(htmlLine); // Text thuần để test regex

    if (!textLine) continue;

    // ── Chuyển trạng thái toàn cục ───────────────────────────────────
    if (RE_PART_I.test(textLine) && !RE_PART_II.test(textLine) && !RE_PART_III.test(textLine)) {
      flushQuestion(); state = 'PART_I'; continue;
    }
    if (RE_PART_II.test(textLine) && !RE_PART_III.test(textLine)) {
      flushQuestion(); state = 'PART_II'; continue;
    }
    if (RE_PART_III.test(textLine)) {
      flushQuestion(); state = 'PART_III'; continue;
    }
    if (RE_HET.test(textLine)) {
      flushQuestion(); state = 'AFTER_HET'; continue;
    }
    if (RE_LOI_GIAI.test(textLine) && state === 'AFTER_HET') {
      state = 'SOLUTION_SECTION'; continue;
    }

    // ────────────────────────────────────────────────────────────────
    //  PHẦN I — Trắc nghiệm 4 lựa chọn
    // ────────────────────────────────────────────────────────────────
    if (state === 'PART_I') {
      const qm = RE_QUESTION_START_TEXT.exec(textLine);
      if (qm) {
        flushQuestion();
        // Trích phần content sau "Câu X." từ HTML gốc
        const contentHtml = extractAfterQuestionHeader(htmlLine, qm[1]);
        currentQuestion = {
          lineStart: lineNum,
          part: 1,
          number: parseInt(qm[1], 10),
          content: contentHtml,
          options: ['', '', '', ''],
        };
        currentOptionKey = null;
        continue;
      }

      if (currentQuestion) {
        const om = RE_OPTION_P1_TEXT.exec(textLine);
        if (om) {
          currentOptionKey = om[1] as 'A' | 'B' | 'C' | 'D';
          const idx = currentOptionKey.charCodeAt(0) - 65;
          // Lấy phần sau "X. " từ HTML gốc
          currentQuestion.options![idx] = extractAfterOptionLabel(htmlLine, om[1]);
          continue;
        }
        // Dòng tiếp nối
        if (currentOptionKey !== null) {
          const idx = currentOptionKey.charCodeAt(0) - 65;
          currentQuestion.options![idx] += ' ' + htmlLine;
        } else {
          currentQuestion.content += ' ' + htmlLine;
        }
      }
      continue;
    }

    // ────────────────────────────────────────────────────────────────
    //  PHẦN II — Đúng/Sai
    // ────────────────────────────────────────────────────────────────
    if (state === 'PART_II') {
      const qm = RE_QUESTION_START_TEXT.exec(textLine);
      if (qm) {
        flushQuestion();
        const contentHtml = extractAfterQuestionHeader(htmlLine, qm[1]);
        currentQuestion = {
          lineStart: lineNum,
          part: 2,
          number: parseInt(qm[1], 10),
          content: contentHtml,
          subItems: [],
        };
        continue;
      }

      if (currentQuestion) {
        const sm = RE_SUBITEM_P2_TEXT.exec(textLine);
        if (sm) {
          // Lấy HTML sau "x) "
          let itemHtml = extractAfterSubItemLabel(htmlLine, sm[1]);
          // Tách DifficultyTag ra khỏi HTML
          const { tag, htmlWithoutTag } = extractDifficultyTagFromHtml(itemHtml);
          currentQuestion.subItems!.push({
            text: htmlWithoutTag,
            difficultyTag: tag,
          });
          continue;
        }
        // Tiếp nối
        if (currentQuestion.subItems!.length > 0) {
          const last = currentQuestion.subItems![currentQuestion.subItems!.length - 1];
          last.text += ' ' + htmlLine;
        } else {
          currentQuestion.content += ' ' + htmlLine;
        }
      }
      continue;
    }

    // ────────────────────────────────────────────────────────────────
    //  PHẦN III — Trả lời ngắn
    // ────────────────────────────────────────────────────────────────
    if (state === 'PART_III') {
      const qm = RE_QUESTION_START_TEXT.exec(textLine);
      if (qm) {
        flushQuestion();
        const contentHtml = extractAfterQuestionHeader(htmlLine, qm[1]);
        currentQuestion = {
          lineStart: lineNum,
          part: 3,
          number: parseInt(qm[1], 10),
          content: contentHtml,
        };
        continue;
      }
      if (currentQuestion) {
        currentQuestion.content += ' ' + htmlLine;
      }
      continue;
    }

    // ────────────────────────────────────────────────────────────────
    //  SAU HẾT — bảng đáp án (dùng TEXT, đáp án không chứa hình)
    // ────────────────────────────────────────────────────────────────
    if (state === 'AFTER_HET') {
      // Phần I: "1.A  2.B  ..."
      const reInline = new RegExp(RE_ANSWER_TABLE_INLINE.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = reInline.exec(textLine)) !== null) {
        const num = parseInt(m[1], 10);
        const ans = m[2].toUpperCase();
        if ('ABCD'.includes(ans)) rawAnswers.set(num, ans);
      }

      // Phần II: "Câu 19: a-Đ b-S c-Đ d-S"
      const p2Row = RE_ANSWER_P2_ROW.exec(textLine);
      if (p2Row) {
        const num = parseInt(p2Row[1], 10);
        const rest = p2Row[2];
        const items: string[] = [];
        const re2 = new RegExp(RE_ANSWER_P2_ITEM.source, 'g');
        let im: RegExpExecArray | null;
        while ((im = re2.exec(rest)) !== null) items.push(im[2]);
        if (items.length === 4) rawAnswersP2.set(num, items);
        continue;
      }

      // Phần III: "Câu 23: 1.25"
      const p3Row = RE_ANSWER_P3_ROW.exec(textLine);
      if (p3Row) {
        const val = parseFloat(p3Row[2].replace(',', '.'));
        if (!isNaN(val)) rawAnswersP3.set(parseInt(p3Row[1], 10), val);
      }
      continue;
    }

    // ────────────────────────────────────────────────────────────────
    //  PHẦN LỜI GIẢI — giữ nguyên HTML (có thể chứa hình/công thức)
    // ────────────────────────────────────────────────────────────────
    if (state === 'SOLUTION_SECTION') {
      const sm = RE_SOLUTION_START.exec(textLine);
      if (sm) {
        currentSolutionNum = parseInt(sm[1], 10);
        // Giữ HTML gốc của phần sau "Câu X:"
        const solutionHtml = extractAfterQuestionHeader(htmlLine, sm[1]);
        rawSolutions.set(currentSolutionNum, [solutionHtml]);
        continue;
      }
      if (currentSolutionNum !== null) {
        const arr = rawSolutions.get(currentSolutionNum) ?? [];
        arr.push(htmlLine); // giữ HTML
        rawSolutions.set(currentSolutionNum, arr);
      }
      continue;
    }
  }

  flushQuestion();

  // ── Map đáp án + lời giải ──────────────────────────────────────────────
  let answersMatched = 0;
  for (const rq of rawQuestions) {
    if (rq.part === 1) {
      const ans = rawAnswers.get(rq.number);
      if (ans) {
        rq.correctAnswer = ans.charCodeAt(0) - 65;
        answersMatched++;
      } else {
        errors.push({ line: rq.lineStart, message: `Câu ${rq.number} (Phần I): Không tìm thấy đáp án.` });
      }
    } else if (rq.part === 2) {
      const arr = rawAnswersP2.get(rq.number);
      if (arr?.length === 4) {
        rq.correctAnswer = arr.map(v => /[ĐđTt]/.test(v));
        answersMatched++;
      } else {
        rq.correctAnswer = [true, true, true, true];
        errors.push({ line: rq.lineStart, message: `Câu ${rq.number} (Phần II): Thiếu đáp án, dùng mặc định [Đ,Đ,Đ,Đ].` });
      }
    } else {
      const val = rawAnswersP3.get(rq.number);
      if (val !== undefined) {
        rq.correctAnswer = val;
        answersMatched++;
      } else {
        rq.correctAnswer = 0;
        errors.push({ line: rq.lineStart, message: `Câu ${rq.number} (Phần III): Không tìm thấy đáp án số.` });
      }
    }

    // Lời giải dưới dạng HTML
    const sol = rawSolutions.get(rq.number);
    rq.explanation = sol ? sol.join('\n').trim() : 'Chưa có lời giải chi tiết.';
  }

  const questions = rawQuestions.map(rq => buildQuestion(rq, topic, errors));
  return {
    questions,
    errors,
    rawQuestions,
    stats: {
      part1Count: rawQuestions.filter(q => q.part === 1).length,
      part2Count: rawQuestions.filter(q => q.part === 2).length,
      part3Count: rawQuestions.filter(q => q.part === 3).length,
      answersMatched,
    },
  };
}

// ─── Helpers: trích HTML sau nhãn ────────────────────────────────────────

/**
 * Từ dòng HTML "... Câu 3. Nội dung <img...> ...",
 * trả về phần HTML BẮT ĐẦU từ sau "Câu X." (giữ nguyên tags)
 */
function extractAfterQuestionHeader(htmlLine: string, questionNum: string): string {
  // Tìm text "Câu X." trong chuỗi (bỏ qua tags), cắt HTML sau chúng
  // Approach: tìm vị trí  của số câu trong text, đếm offset tương ứng trong HTML
  const pattern = new RegExp(
    `c\\s*â\\s*u\\s+${questionNum}\\s*[:.]\\s*`,
    'gi'
  );
  // Xóa phần "Câu X. " khỏi text node trong HTML
  // (đơn giản nhất: strip phần trước từ HTML, giữ phần sau)
  const stripped = htmlLine.replace(pattern, '');
  return stripped.trim();
}

/**
 * Từ dòng HTML "... A. Nội dung ...",
 * trả về phần HTML sau "A. "
 */
function extractAfterOptionLabel(htmlLine: string, label: string): string {
  const pattern = new RegExp(`${label}\\.\\s*`, 'i');
  return htmlLine.replace(pattern, '').trim();
}

/**
 * Từ dòng HTML "... a) [1,NB] Nội dung ...",
 * trả về phần HTML sau "a) "
 */
function extractAfterSubItemLabel(htmlLine: string, label: string): string {
  const pattern = new RegExp(`${label}\\)\\s*`, 'i');
  return htmlLine.replace(pattern, '').trim();
}

// ─── Chuyển RawQuestion → Question ───────────────────────────────────────

function buildQuestion(rq: RawQuestion, topic: Topic, errors: ParseError[]): Question {
  let level: QuestionLevel = 'Thông hiểu';
  if (rq.part === 2 && rq.subItems) {
    const firstTag = rq.subItems.find(si => si.difficultyTag)?.difficultyTag?.level;
    if (firstTag) level = mapLevelCode(firstTag, rq.lineStart, errors) ?? 'Thông hiểu';
  }

  const q: Question = {
    part: rq.part,
    topic,
    level,
    content: rq.content,
    correctAnswer: rq.correctAnswer ?? (rq.part === 3 ? 0 : rq.part === 2 ? [true,true,true,true] : 0),
    explanation: rq.explanation ?? 'Chưa có lời giải chi tiết.',
    tags: [`Phần ${toRoman(rq.part)}`, 'Azota', topic],
  };

  if (rq.part === 1) {
    q.options = rq.options ?? [];
  }

  if (rq.part === 2) {
    // Build options: giữ HTML content + thêm DifficultyTag vào tags
    q.options = (rq.subItems ?? []).map((si, idx) => {
      const label = String.fromCharCode(97 + idx) + ') ';
      return `${label}${si.text}`;
    });
    // Gắn tất cả DifficultyTag vào trường tags
    const dtags = (rq.subItems ?? [])
      .filter(si => si.difficultyTag)
      .map(si => si.difficultyTag!.raw);
    if (dtags.length > 0) q.tags = [...(q.tags ?? []), ...dtags];
  }

  return q;
}

function mapLevelCode(code: string, line: number, errors: ParseError[]): QuestionLevel | null {
  const map: Record<string, QuestionLevel> = {
    NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao',
  };
  if (map[code]) return map[code];
  errors.push({ line, message: `Mã mức độ không xác định: "${code}". Dùng NB/TH/VD/VDC.` });
  return null;
}

function toRoman(n: 1 | 2 | 3): string {
  return ['I', 'II', 'III'][n - 1];
}

// ─── API tương thích ngược ────────────────────────────────────────────────

/** Wrapper cho App.tsx. Nhận HTML, trả về Question[]. */
export function parseByRulesV2(html: string, topic: Topic): Question[] {
  const result = parseAzotaExam(html, topic);
  if (result.errors.length > 0) {
    console.group('[AzotaParser v2] Cảnh báo:');
    result.errors.forEach(e => console.warn(`Dòng ${e.line}: ${e.message}`));
    console.groupEnd();
  }
  console.info(
    `[AzotaParser v2] ${result.questions.length} câu | ` +
    `P1:${result.stats.part1Count} P2:${result.stats.part2Count} ` +
    `P3:${result.stats.part3Count} | ${result.stats.answersMatched} có đáp án`
  );
  return result.questions;
}
