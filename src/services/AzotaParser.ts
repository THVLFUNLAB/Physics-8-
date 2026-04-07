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
  // [ANSWER DETECT] Đáp án nhận diện từ gạch chân trong file gốc
  detectedCorrectIdx?: number;     // Phần I: index (0-3) của option được gạch chân
  detectedCorrectP2?: boolean[];   // Phần II: true/false cho từng ý a,b,c,d
  needs_manual_review?: boolean;   // Không xác định được đáp án → cần Admin review
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

/**
 * Nhận diện đoạn dữ kiện chung (Cluster trigger):
 * - "Sử dụng thông tin sau..."
 * - "Dựa vào dữ kiện sau..."
 * - "Dùng dữ liệu sau cho câu X..."
 * - "Cho đoạn thông tin sau..."
 * - "Đọc đoạn văn sau..."
 */
const RE_CLUSTER_TRIGGER = /(?:sử\s*dụng|dựa\s*vào|dùng|cho|\u0111ọc)\s+(?:\u0111oạn\s+)?(?:thông\s*tin|dữ\s*kiện|dữ\s*liệu|văn\s*bản)\s+(?:sau|bên\s*dưới)/i;

/** Regex bổ sung: "...cho câu X đến câu Y" hoặc "...cho 2 câu tiếp theo" */
const RE_CLUSTER_RANGE  = /cho\s+(?:câu\s+\d+|\d+\s+câu)\s*(?:đến|tiếp)/i;

// ─── Helper: Sanitize content — loại bỏ rác UI ──────────────────────────

/**
 * [FIX #1] Xóa label "HÌNH MINH HỌA" dưới mọi dạng
 * [FIX #2] Xóa chuỗi base64 rò rỉ trong text content
 */
function sanitizeContent(html: string): string {
  let out = html;
  // Xóa các thẻ HTML chứa "HÌNH MINH HỌA"
  out = out.replace(/<[^>]*>\s*HÌNH\s+MINH\s+HỌA[^<]*<\/[^>]*>/gi, '');
  // Xóa placeholder dạng [HÌNH MINH HỌA...] và **[HÌNH MINH HỌA...]**
  out = out.replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '');
  // Xóa text đơn "HÌNH MINH HỌA" (từ alt attribute rò rỉ)
  out = out.replace(/HÌNH\s+MINH\s+HỌA\s*[^\n]*/gi, '');
  out = out.replace(/Hình minh họa đề thi/g, '');

  // BẢO VỆ ảnh hợp lệ trước khi xóa base64 rác
  const imgBackup: string[] = [];
  // Markdown images: ![...](data:image/...)
  out = out.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, (match) => {
    imgBackup.push(match);
    return `__PARSER_SAFE_${imgBackup.length - 1}__`;
  });
  // HTML img tags: <img src="data:image/...">
  out = out.replace(/<img\s+[^>]*src=["']data:image\/[^"']+["'][^>]*\/?>/gi, (match) => {
    imgBackup.push(match);
    return `__PARSER_SAFE_${imgBackup.length - 1}__`;
  });

  // Giờ mới xóa chuỗi base64 rác (ảnh hợp lệ đã được bảo vệ)
  out = out.replace(/\(?data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]{20,}\)?/g, '');

  // Khôi phục ảnh hợp lệ
  out = out.replace(/__PARSER_SAFE_(\d+)__/g, (_, idx) => imgBackup[parseInt(idx)]);

  // Dọn khoảng trắng thừa
  out = out.replace(/\s{3,}/g, ' ').trim();
  return out;
}

/**
 * [FIX #3] Cắt bỏ phần sub-items bị lặp trong nội dung đề bài chung (Phần II)
 * Content chỉ giữ phần đề bài chung, dừng trước:
 *   - "Hãy xác định tính đúng sai..."
 *   - Hoặc ký hiệu đầu sub-item "a) " / "a. " / "a/ "
 */
function truncatePartIIContent(content: string): string {
  const text = stripHtml(content);
  
  // Tìm vị trí cắt trong text thuần
  const markers = [
    /Hãy\s+xác\s+định\s+tính\s+đúng\s+sai/i,
    /Hãy\s+xác\s+định\s+mệnh\s+đề\s+đúng/i,
    /Xác\s+định\s+tính\s+đúng\s+sai/i,
    /(?:^|\n|\s)a\)\s+/,     // a) ...
    /(?:^|\n|\s)a\.\s+/,     // a. ...
  ];
  
  let cutTextPos = -1;
  let cutMarkerText = '';
  
  for (const re of markers) {
    const m = re.exec(text);
    if (m) {
      const pos = m.index;
      if (cutTextPos === -1 || pos < cutTextPos) {
        cutTextPos = pos;
        cutMarkerText = m[0];
      }
    }
  }
  
  if (cutTextPos <= 0) return content; // Không tìm thấy → giữ nguyên
  
  // Tìm vị trí tương ứng trong HTML gốc
  // Approach đơn giản: tìm cùng cụm text trong HTML và cắt
  const escapedMarker = cutMarkerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const htmlMarkerRe = new RegExp(escapedMarker.replace(/\s+/g, '[\\s\\S]{0,20}'), 'i');
  const htmlMatch = htmlMarkerRe.exec(content);
  
  if (htmlMatch) {
    return content.substring(0, htmlMatch.index).trim();
  }
  
  // Fallback: cắt dựa trên tỷ lệ vị trí text thuần
  const ratio = cutTextPos / text.length;
  const approxHtmlPos = Math.floor(content.length * ratio);
  return content.substring(0, approxHtmlPos).trim();
}

// ─── Helper: strip HTML để test regex ────────────────────────────────────

/**
 * [ANSWER DETECT] Kiểm tra xem ký tự label (A/B/C/D hoặc a/b/c/d) 
 * có được gạch chân trong HTML không.
 * Patterns nhận diện:
 *   <u>A</u>   — mammoth output với style map u => u
 *   <u>A.</u>  — label + dấu chấm cùng gạch chân
 *   <u>a)</u>  — label + ngoặc đóng cùng gạch chân
 */
function isLabelUnderlined(htmlLine: string, label: string): boolean {
  // Pattern 1: <u>X</u> (chỉ label trong u tag)
  const p1 = new RegExp(`<u[^>]*>\\s*${label}\\s*</u>`, 'i');
  if (p1.test(htmlLine)) return true;

  // Pattern 2: <u>X.</u> hoặc <u>X)</u> (label + dấu câu trong u tag)
  const p2 = new RegExp(`<u[^>]*>\\s*${label}\\s*[.):]\\s*</u>`, 'i');
  if (p2.test(htmlLine)) return true;

  return false;
}

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

// ─── [FIX Part I] Tách inline options A./B./C./D. trên cùng một dòng ──────

/**
 * Khi Word xuất HTML, các options A. B. C. D. đôi khi nằm cùng một <p>.
 * Hàm này nhận diện và tách chúng thành mảng 4 options.
 *
 * Hỗ trợ:
 *   - "A. opt1 B. opt2 C. opt3 D. opt4"
 *   - "Nội dung câu hỏi A. opt1 B. opt2 C. opt3 D. opt4"
 *   - Label có thể bọc <u> (gạch chân đáp án đúng)
 *
 * @returns Object chứa contentHtml + options nếu tìm thấy inline, null nếu không.
 */
function tryExtractInlineOptions(html: string): {
  contentHtml: string;
  optionHtmls: string[];
  detectedCorrectIdx?: number;
} | null {
  const text = stripHtml(html);

  // Tìm tất cả option markers trong text thuần
  const labels = new Set<string>();
  const qre = /(?:^|\s)([A-D])\.\s/g;
  let qm: RegExpExecArray | null;
  while ((qm = qre.exec(text)) !== null) labels.add(qm[1]);
  if (labels.size < 3 || !labels.has('A')) return null;

  // ═══ Tìm vị trí từng marker trong HTML ═══
  // Mỗi marker có thể xuất hiện dưới dạng:
  //   "A. "  |  "<u>A</u>. "  |  "<u>A.</u> "
  const markerPatterns = ['A', 'B', 'C', 'D']
    .filter(l => labels.has(l))
    .map(l => ({
      label: l,
      // Regex tìm marker L. trong HTML (hỗ trợ <u> wrap)
      re: new RegExp(
        `(?:^|[\\s>])` +
        `(?:` +
          `<u[^>]*>\\s*${l}\\s*<\\/u>\\s*\\.` +
          `|<u[^>]*>\\s*${l}\\s*\\.\\s*<\\/u>` +
          `|${l}\\.` +
        `)\\s+`,
        'gi'
      ),
    }));

  // Tìm vị trí HTML cho mỗi marker (lấy match đầu tiên)
  const found: { label: string; htmlIdx: number; matchLen: number }[] = [];
  for (const mp of markerPatterns) {
    const mm = mp.re.exec(html);
    if (mm) {
      found.push({ label: mp.label, htmlIdx: mm.index + (mm[0].match(/^[\s>]/) ? 1 : 0), matchLen: mm[0].replace(/^[\s>]/, '').length });
    }
  }

  if (found.length < 3) return null;
  found.sort((a, b) => a.htmlIdx - b.htmlIdx);

  // Content trước option đầu tiên
  const contentHtml = html.substring(0, found[0].htmlIdx).trim();

  // Tách từng option
  const options: string[] = ['', '', '', ''];
  let detectedCorrectIdx: number | undefined;

  for (let i = 0; i < found.length; i++) {
    const idx = found[i].label.charCodeAt(0) - 65;
    const afterLabel = found[i].htmlIdx + found[i].matchLen;
    const end = i + 1 < found.length ? found[i].htmlIdx + found[i].matchLen + 
      (html.substring(afterLabel, found[i + 1].htmlIdx).length) : html.length;
    const optHtml = html.substring(afterLabel, i + 1 < found.length ? found[i + 1].htmlIdx : html.length).trim();
    options[idx] = optHtml;

    // Check underline trong vùng label
    const labelRegion = html.substring(found[i].htmlIdx, afterLabel);
    if (/<u[^>]*>/i.test(labelRegion)) {
      detectedCorrectIdx = idx;
    }
  }

  return { contentHtml, optionHtmls: options, detectedCorrectIdx };
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

  // ═══ Cluster tracking ═══
  let clusterCounter = 0;
  let activeClusterId: string | null = null;
  let activeClusterContext: string = '';
  let activeClusterOrder = 0;
  // Map: questionNumber → { clusterId, clusterOrder, sharedContext }
  const clusterMap: Map<number, { clusterId: string; clusterOrder: number; sharedContext: string }> = new Map();

  // ── Helper: đóng câu hiện tại ──────────────────────────────────────────
  const flushQuestion = () => {
    if (!currentQuestion) return;

    // [FIX #1 + #2] Sanitize tất cả trường nội dung
    currentQuestion.content = sanitizeContent(currentQuestion.content.trim());
    if (currentQuestion.options)
      currentQuestion.options = currentQuestion.options.map(o => sanitizeContent(o.trim()));
    if (currentQuestion.subItems)
      currentQuestion.subItems = currentQuestion.subItems.map(si => ({
        ...si,
        text: sanitizeContent(si.text.trim()),
      }));

    // [FIX #3] Phần II: Cắt bỏ phần sub-items bị lặp trong nội dung đề bài chung
    if (currentQuestion.part === 2 && currentQuestion.subItems && currentQuestion.subItems.length > 0) {
      currentQuestion.content = truncatePartIIContent(currentQuestion.content);
    }

    rawQuestions.push(currentQuestion);

    // [CLUSTER] Nếu câu thuộc cluster đang hoạt động → đăng ký
    if (activeClusterId && currentQuestion.number) {
      clusterMap.set(currentQuestion.number, {
        clusterId: activeClusterId,
        clusterOrder: activeClusterOrder,
        sharedContext: activeClusterContext,
      });
      activeClusterOrder++;
    }

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
      flushQuestion(); state = 'PART_I'; activeClusterId = null; activeClusterContext = ''; continue;
    }
    if (RE_PART_II.test(textLine) && !RE_PART_III.test(textLine)) {
      flushQuestion(); state = 'PART_II'; activeClusterId = null; activeClusterContext = ''; continue;
    }
    if (RE_PART_III.test(textLine)) {
      flushQuestion(); state = 'PART_III'; activeClusterId = null; activeClusterContext = ''; continue;
    }
    if (RE_HET.test(textLine)) {
      flushQuestion(); state = 'AFTER_HET'; activeClusterId = null; activeClusterContext = ''; continue;
    }
    if (RE_LOI_GIAI.test(textLine) && state === 'AFTER_HET') {
      state = 'SOLUTION_SECTION'; continue;
    }

    // ── [CLUSTER] Nhận diện đoạn dữ kiện chung ──────────────────────
    if ((state === 'PART_I' || state === 'PART_II' || state === 'PART_III') &&
        !RE_QUESTION_START_TEXT.test(textLine) &&
        (RE_CLUSTER_TRIGGER.test(textLine) || RE_CLUSTER_RANGE.test(textLine))) {
      // Bắt đầu cluster mới
      flushQuestion();
      clusterCounter++;
      activeClusterId = `__temp_cluster_${clusterCounter}_${Date.now()}`;
      activeClusterContext = htmlLine; // Lưu HTML gốc (bảo toàn hình ảnh)
      activeClusterOrder = 0;
      continue;
    }
    // Nếu đang thu thập cluster context (chưa gặp Câu X tiếp theo)
    if (activeClusterId && !currentQuestion && !RE_QUESTION_START_TEXT.test(textLine) &&
        state !== 'AFTER_HET' && state !== 'SOLUTION_SECTION') {
      activeClusterContext += ' ' + htmlLine;
      continue;
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

        // [FIX] Check nếu options A./B./C./D. nằm inline trong cùng dòng
        const inlineCheck = tryExtractInlineOptions(contentHtml);
        if (inlineCheck) {
          currentQuestion.content = inlineCheck.contentHtml;
          currentQuestion.options = inlineCheck.optionHtmls;
          if (inlineCheck.detectedCorrectIdx !== undefined) {
            currentQuestion.detectedCorrectIdx = inlineCheck.detectedCorrectIdx;
          }
          currentOptionKey = 'D'; // Dòng tiếp nối sẽ gắn vào option D
        }
        continue;
      }

      if (currentQuestion) {
        // [FIX] Check inline options cho dòng bắt đầu bằng A. nhưng cũng chứa B./C./D.
        const inlineOpts = tryExtractInlineOptions(htmlLine);
        if (inlineOpts) {
          // Nếu có content trước A. → nối vào question content
          if (inlineOpts.contentHtml) {
            currentQuestion.content += ' ' + inlineOpts.contentHtml;
          }
          currentQuestion.options = inlineOpts.optionHtmls;
          if (inlineOpts.detectedCorrectIdx !== undefined) {
            currentQuestion.detectedCorrectIdx = inlineOpts.detectedCorrectIdx;
          }
          currentOptionKey = 'D';
          continue;
        }

        const om = RE_OPTION_P1_TEXT.exec(textLine);
        if (om) {
          currentOptionKey = om[1] as 'A' | 'B' | 'C' | 'D';
          const idx = currentOptionKey.charCodeAt(0) - 65;
          // [ANSWER DETECT] Kiểm tra gạch chân trước khi strip label
          if (isLabelUnderlined(htmlLine, om[1])) {
            currentQuestion.detectedCorrectIdx = idx;
          }
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
          // [ANSWER DETECT] Kiểm tra gạch chân cho ý a/b/c/d
          if (!currentQuestion.detectedCorrectP2) {
            currentQuestion.detectedCorrectP2 = [];
          }
          currentQuestion.detectedCorrectP2.push(isLabelUnderlined(htmlLine, sm[1]));

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
  let underlineDetected = 0;
  for (const rq of rawQuestions) {
    if (rq.part === 1) {
      // [ANSWER DETECT] Ưu tiên 1: Gạch chân trong file gốc
      if (rq.detectedCorrectIdx !== undefined) {
        rq.correctAnswer = rq.detectedCorrectIdx;
        answersMatched++;
        underlineDetected++;
      } else {
        // Fallback: Bảng đáp án sau H᫮T
        const ans = rawAnswers.get(rq.number);
        if (ans) {
          rq.correctAnswer = ans.charCodeAt(0) - 65;
          answersMatched++;
        } else {
          errors.push({ line: rq.lineStart, message: `Câu ${rq.number} (Phần I): Không tìm thấy đáp án.` });
        }
      }
    } else if (rq.part === 2) {
      // ═══════════════ PIPELINE 3 BƯỚC CHO PART 2 ═══════════════
      // Ưu tiên 1: Gạch chân <u> trong file gốc
      if (rq.detectedCorrectP2 && rq.detectedCorrectP2.length >= 4) {
        rq.correctAnswer = rq.detectedCorrectP2.slice(0, 4);
        answersMatched++;
        underlineDetected++;
      } else {
        // Ưu tiên 2 (MỚI): Quét thông minh từ Explanation_Block
        const explanationText = rq.explanation ?? rawSolutions.get(rq.number)?.join('\n') ?? '';
        const fromExplanation = extractPart2AnswersFromExplanation(explanationText);
        if (fromExplanation) {
          rq.correctAnswer = fromExplanation;
          answersMatched++;
          console.info(`[Part2 Pipeline] Câu ${rq.number}: Đáp án trích từ lời giải → [${fromExplanation.map(v => v ? 'Đ' : 'S').join(',')}]`);
        } else {
          // Ưu tiên 3: Bảng đáp án sau HẾT
          const arr = rawAnswersP2.get(rq.number);
          if (arr?.length === 4) {
            rq.correctAnswer = arr.map(v => /[ĐđTt]/.test(v));
            answersMatched++;
          } else {
            // FALLBACK: Không tìm được → gán null + đánh cờ review
            rq.correctAnswer = [null, null, null, null];
            rq.needs_manual_review = true;
            errors.push({
              line: rq.lineStart,
              message: `Câu ${rq.number} (Phần II): ⚠️ Không tìm được đáp án Đ/S trong đề lẫn lời giải → cần Admin review thủ công.`
            });
          }
        }
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

  // ═══ [CLUSTER] Gắn clusterId/clusterOrder/sharedContext vào Question ═══
  if (clusterMap.size > 0) {
    for (let i = 0; i < rawQuestions.length; i++) {
      const rq = rawQuestions[i];
      const clusterInfo = clusterMap.get(rq.number);
      if (clusterInfo) {
        questions[i].clusterId = clusterInfo.clusterId;
        questions[i].clusterOrder = clusterInfo.clusterOrder;
        questions[i].tags = [
          ...(questions[i].tags || []),
          `__cluster_context:${clusterInfo.sharedContext}`,
        ];
      }
    }
    console.info(
      `[AzotaParser] Cluster detected: ${clusterCounter} cluster(s), ` +
      `${clusterMap.size} câu thuộc cluster`
    );
  }

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
  // [ANSWER DETECT] Normalize: strip <u> từ quanh label trước khi trích xuất
  let line = htmlLine
    .replace(new RegExp(`<u[^>]*>\\s*(${label})\\s*</u>\\s*\\.`, 'gi'), '$1.')  // <u>A</u>. → A.
    .replace(new RegExp(`<u[^>]*>\\s*(${label}\\s*\\.)\\s*</u>`, 'gi'), '$1')   // <u>A.</u> → A.
    .replace(new RegExp(`<u[^>]*>\\s*(${label})\\s*</u>`, 'gi'), '$1');          // <u>A</u>  → A

  const pattern = new RegExp(`${label}\\.\\s*`, 'i');
  return line.replace(pattern, '').trim();
}

/**
 * Từ dòng HTML "... a) [1,NB] Nội dung ...",
 * trả về phần HTML sau "a) "
 */
function extractAfterSubItemLabel(htmlLine: string, label: string): string {
  // [ANSWER DETECT] Normalize: strip <u> từ quanh label trước khi trích xuất
  let line = htmlLine
    .replace(new RegExp(`<u[^>]*>\\s*(${label})\\s*</u>\\s*\\)`, 'gi'), '$1)')  // <u>a</u>) → a)
    .replace(new RegExp(`<u[^>]*>\\s*(${label}\\s*\\))\\s*</u>`, 'gi'), '$1')   // <u>a)</u> → a)
    .replace(new RegExp(`<u[^>]*>\\s*(${label})\\s*</u>`, 'gi'), '$1');          // <u>a</u>  → a

  const pattern = new RegExp(`${label}\\)\\s*`, 'i');
  return line.replace(pattern, '').trim();
}

// ─── [STEP 3] Quét đáp án Đúng/Sai từ Explanation_Block (Phần II) ─────────

/**
 * extractPart2AnswersFromExplanation()
 * ────────────────────────────────────
 * Quét toàn bộ text lời giải / hướng dẫn để tìm mapping a→Đúng/Sai, b→…, c→…, d→…
 *
 * Hỗ trợ các kiểu viết phổ biến trong đề thi thực tế:
 *   1. Đầu dòng:  "a) Sai. Điện năng..."  hoặc  "a) Đúng"
 *   2. Sau công thức: "...= 5V => a) Sai"
 *   3. Gom cụm inline: "a) Sai; b) Đúng; c) Đúng; d) Sai"
 *   4. Dạng dấu chấm: "a. Đúng", "b. Sai"
 *   5. Ngôn ngữ tự nhiên: "Ý a sai", "Mệnh đề b đúng"
 *
 * @returns mảng 4 boolean nếu tìm đủ 4 ý, hoặc null nếu không đủ
 */
function extractPart2AnswersFromExplanation(explanationHtml: string): boolean[] | null {
  const text = stripHtml(explanationHtml);
  if (!text) return null;

  // Kết quả: map từ a/b/c/d → true(Đúng) / false(Sai)
  const results: Map<string, boolean> = new Map();

  // ── Pattern 1: "a) Đúng" hoặc "a) Sai" (có thể theo sau bởi dấu chấm, phẩy, khoảng trắng) ──
  const p1 = /([a-d])\)\s*(đúng|sai|Đúng|Sai|ĐÚNG|SAI)/gi;
  let m: RegExpExecArray | null;
  while ((m = p1.exec(text)) !== null) {
    const key = m[1].toLowerCase();
    const val = /[đĐ]/i.test(m[2]);
    if (!results.has(key)) results.set(key, val);
  }

  // ── Pattern 2: "=> a) Sai" hoặc "→ d) Đúng" (sau công thức) ──
  if (results.size < 4) {
    const p2 = /(?:=>|→|->|⇒|\s)\s*([a-d])\)\s*(đúng|sai|Đúng|Sai|ĐÚNG|SAI)/gi;
    while ((m = p2.exec(text)) !== null) {
      const key = m[1].toLowerCase();
      const val = /[đĐ]/i.test(m[2]);
      if (!results.has(key)) results.set(key, val);
    }
  }

  // ── Pattern 3: "a. Đúng" hoặc "a. Sai" (dấu chấm thay ngoặc) ──
  if (results.size < 4) {
    const p3 = /([a-d])\.\s*(đúng|sai|Đúng|Sai|ĐÚNG|SAI)/gi;
    while ((m = p3.exec(text)) !== null) {
      const key = m[1].toLowerCase();
      const val = /[đĐ]/i.test(m[2]);
      if (!results.has(key)) results.set(key, val);
    }
  }

  // ── Pattern 4: "Ý a sai" hoặc "Mệnh đề b đúng" hoặc "Phát biểu c sai" ──
  if (results.size < 4) {
    const p4 = /(?:ý|mệnh\s*đề|phát\s*biểu|nhận\s*định|câu)\s+([a-d])\s+(?:là\s+)?(đúng|sai)/gi;
    while ((m = p4.exec(text)) !== null) {
      const key = m[1].toLowerCase();
      const val = /[đĐ]/i.test(m[2]);
      if (!results.has(key)) results.set(key, val);
    }
  }

  // ── Pattern 5: "a-Đ" hoặc "b-S" hoặc "c – Đ" (bảng inline trong lời giải) ──
  if (results.size < 4) {
    const p5 = /([a-d])\s*[-–—]\s*([ĐđSsTt])/gi;
    while ((m = p5.exec(text)) !== null) {
      const key = m[1].toLowerCase();
      const val = /[ĐđTt]/.test(m[2]);
      if (!results.has(key)) results.set(key, val);
    }
  }

  // ── Pattern 6: Chữ "đúng" hoặc "sai" đứng ngay sau dấu "a)" cách bởi nội dung dài
  //    VD: "a) Lực từ tác dụng... → Đúng" ──
  if (results.size < 4) {
    // Tách từng block theo a)/b)/c)/d)
    const blockRe = /([a-d])\)\s*([\s\S]*?)(?=(?:[a-d]\)|$))/gi;
    while ((m = blockRe.exec(text)) !== null) {
      const key = m[1].toLowerCase();
      if (results.has(key)) continue;
      const blockText = m[2];
      // Tìm từ cuối block: "đúng" hoặc "sai"
      const verdict = blockText.match(/(?:→|=>|->|:)\s*(đúng|sai)\s*[.;,!]?\s*$/i)
                   || blockText.match(/(đúng|sai)\s*[.;,!]?\s*$/i);
      if (verdict) {
        results.set(key, /[đĐ]/i.test(verdict[1]));
      }
    }
  }

  // Kiểm tra có đủ 4 ý không
  if (results.size < 4) return null;

  return [
    results.get('a') ?? true,
    results.get('b') ?? true,
    results.get('c') ?? true,
    results.get('d') ?? true,
  ];
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

  // [PIPELINE LOG] Thống kê nguồn đáp án
  const ulDetected = result.rawQuestions.filter(
    rq => rq.detectedCorrectIdx !== undefined || (rq.detectedCorrectP2 && rq.detectedCorrectP2.length > 0)
  ).length;
  const explDetected = result.rawQuestions.filter(
    rq => rq.part === 2 && !rq.needs_manual_review && !rq.detectedCorrectP2?.length
  ).length;
  const needsReview = result.rawQuestions.filter(rq => rq.needs_manual_review).length;

  console.info(
    `[AzotaParser v2] ${result.questions.length} câu | ` +
    `P1:${result.stats.part1Count} P2:${result.stats.part2Count} ` +
    `P3:${result.stats.part3Count} | ${result.stats.answersMatched} có đáp án` +
    (ulDetected > 0 ? ` | 🎯 ${ulDetected} từ gạch chân` : '') +
    (explDetected > 0 ? ` | 📝 ${explDetected} từ lời giải` : '') +
    (needsReview > 0 ? ` | ⚠️ ${needsReview} cần review` : '')
  );
  return result.questions;
}
