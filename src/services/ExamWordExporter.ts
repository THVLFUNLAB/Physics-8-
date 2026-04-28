/* ═══════════════════════════════════════════════════════════════════
 *  EXAM WORD EXPORTER — Xuất đề thi ra file .docx
 *
 *  Chế độ:
 *    'student' — Chỉ câu hỏi, không đáp án, ảnh kèm 3 dòng kẻ
 *    'teacher' — Câu hỏi + bảng đáp án + giải thích chi tiết
 *
 *  Công thức: Giữ nguyên LaTeX dạng $...$  — MathType "Toggle TeX" tự render.
 *  Ảnh: Fetch từ URL → embed base64 PNG vào docx.
 *
 *  Phụ thuộc: docx, file-saver
 * ═══════════════════════════════════════════════════════════════════ */

import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow,
  TableCell, WidthType, BorderStyle, AlignmentType, HeadingLevel,
  ShadingType, convertInchesToTwip, LevelFormat, NumberFormat,
  UnderlineType, Header, Footer, PageNumber, Tab,
} from 'docx';
import { saveAs } from 'file-saver';
import type { Exam, Question } from '../types';

// ── Constants ──────────────────────────────────────────────────────
const LINE_SPACING = 360;           // ~25pt (twips)
const FONT_BODY    = 'Times New Roman';
const FONT_TITLE   = 'Times New Roman';
const SIZE_BODY    = 26;            // 13pt (half-points)
const SIZE_TITLE   = 28;            // 14pt
const SIZE_H1      = 30;            // 15pt
const MARGIN       = convertInchesToTwip(1.0); // 1 inch margins
const ANSWER_LINE  = '_'.repeat(80);

// ── Helpers ────────────────────────────────────────────────────────

/** Chuyển LaTeX inline $...$ → text plain giữ nguyên công thức cho MathType */
function latexAwarePlainText(raw: string): string {
  // Giữ nguyên — MathType sẽ tự nhận khi người dùng bôi chọn và Toggle TeX
  return raw ?? '';
}

/** Strip HTML tags (cho cluster shared context) */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Tạo TextRun chuẩn dùng Times New Roman */
function bodyText(text: string, opts?: {
  bold?: boolean; italic?: boolean; size?: number; color?: string;
}): TextRun {
  return new TextRun({
    text,
    font: FONT_BODY,
    size: opts?.size ?? SIZE_BODY,
    bold: opts?.bold,
    italics: opts?.italic,
    color: opts?.color,
  });
}

/** Dòng trống */
function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '' })] });
}

/** 3 dòng kẻ cho phần trả lời của HS */
function answerLines(): Paragraph[] {
  return [1, 2, 3].map(() =>
    new Paragraph({
      children: [bodyText(ANSWER_LINE, { color: 'AAAAAA' })],
      spacing: { before: 80, after: 80 },
    })
  );
}

/** Fetch ảnh từ URL → Uint8Array, trả null nếu lỗi */
async function fetchImageAsBuffer(url: string): Promise<{ data: Uint8Array; type: 'png' | 'jpg' } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const isJpeg = blob.type.includes('jpeg') || url.toLowerCase().includes('.jpg');
    const ab = await blob.arrayBuffer();
    return { data: new Uint8Array(ab), type: isJpeg ? 'jpg' : 'png' };
  } catch {
    return null;
  }
}

/** Tạo ImageRun với kích thước responsive (max 450px wide) */
function makeImageRun(data: Uint8Array, type: 'png' | 'jpg'): ImageRun {
  return new ImageRun({
    data,
    transformation: { width: 400, height: 260 },
    type,
  });
}

// ── Xử lý câu hỏi → mảng Paragraph ───────────────────────────────

function getCorrectAnswerText(q: Question): string {
  if (q.part === 1) {
    const idx = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0;
    return `Đáp án: ${String.fromCharCode(65 + idx)}`;
  }
  if (q.part === 2 && Array.isArray(q.correctAnswer)) {
    const labels = q.correctAnswer.map((v: boolean, i: number) =>
      `${String.fromCharCode(97 + i)}) ${v ? 'Đúng' : 'Sai'}`
    ).join(' | ');
    return `Đáp án: ${labels}`;
  }
  if (q.part === 3) {
    return `Đáp án: ${q.correctAnswer}`;
  }
  return `Đáp án: ${q.correctAnswer}`;
}

async function renderQuestionBlock(
  q: Question,
  label: string,
  mode: 'student' | 'teacher',
): Promise<Paragraph[]> {
  const paras: Paragraph[] = [];

  // ── Câu hỏi ──
  paras.push(new Paragraph({
    children: [
      bodyText(`${label}: `, { bold: true }),
      bodyText(latexAwarePlainText(q.content)),
    ],
    spacing: { before: 160, after: 80, line: LINE_SPACING },
    keepNext: true,
  }));

  // ── Ảnh minh họa (nếu có) ──
  const imgUrl = (q as any).imageUrl || (q as any).image;
  if (imgUrl) {
    const imgData = await fetchImageAsBuffer(imgUrl);
    if (imgData) {
      paras.push(new Paragraph({
        children: [makeImageRun(imgData.data, imgData.type)],
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        keepNext: true,
      }));
      // 3 dòng kẻ dưới ảnh (bản HS)
      if (mode === 'student') {
        paras.push(...answerLines());
      }
    }
  }

  // ── Options ──
  if (q.options && q.options.length > 0) {
    if (q.part === 1) {
      // 2 cột: A. ... | B. ...  /  C. ... | D. ...
      const opts = q.options;
      for (let i = 0; i < opts.length; i += 2) {
        const leftLabel = String.fromCharCode(65 + i);
        const rightLabel = i + 1 < opts.length ? String.fromCharCode(65 + i + 1) : null;
        paras.push(new Paragraph({
          children: [
            bodyText(`${leftLabel}. `, { bold: true }),
            bodyText(latexAwarePlainText(opts[i])),
            ...(rightLabel ? [
              bodyText('          '),
              bodyText(`${rightLabel}. `, { bold: true }),
              bodyText(latexAwarePlainText(opts[i + 1])),
            ] : []),
          ],
          spacing: { before: 40, after: 40 },
          indent: { left: convertInchesToTwip(0.3) },
        }));
      }
    } else if (q.part === 2) {
      q.options.forEach((opt, oIdx) => {
        paras.push(new Paragraph({
          children: [
            bodyText(`${String.fromCharCode(97 + oIdx)}) `, { bold: true }),
            bodyText(latexAwarePlainText(opt)),
          ],
          spacing: { before: 40, after: 40 },
          indent: { left: convertInchesToTwip(0.4) },
        }));
      });
    }
  }

  return paras;
}

// ── Section header ─────────────────────────────────────────────────
function sectionHeader(title: string): Paragraph {
  return new Paragraph({
    children: [bodyText(title, { bold: true, size: SIZE_H1 })],
    spacing: { before: 300, after: 160 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '1a1a2e' },
    },
  });
}

// ── Answer key table (GV) ──────────────────────────────────────────
function buildAnswerTable(questions: Question[]): Table {
  const headerRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [bodyText('Câu', { bold: true })] })],
        shading: { type: ShadingType.SOLID, color: '1a1a2e' },
        width: { size: 10, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [bodyText('Đáp án', { bold: true })] })],
        shading: { type: ShadingType.SOLID, color: '1a1a2e' },
        width: { size: 25, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [bodyText('Phần', { bold: true })] })],
        shading: { type: ShadingType.SOLID, color: '1a1a2e' },
        width: { size: 10, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [bodyText('Giải thích', { bold: true })] })],
        shading: { type: ShadingType.SOLID, color: '1a1a2e' },
        width: { size: 55, type: WidthType.PERCENTAGE },
      }),
    ],
  });

  const dataRows = questions.map((q, idx) => {
    const rowColor = idx % 2 === 0 ? 'FFFFFF' : 'F0F0F8';
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [bodyText(String(idx + 1))] })],
          shading: { type: ShadingType.SOLID, color: rowColor },
        }),
        new TableCell({
          children: [new Paragraph({ children: [bodyText(getCorrectAnswerText(q), { bold: true, color: '1a1a2e' })] })],
          shading: { type: ShadingType.SOLID, color: rowColor },
        }),
        new TableCell({
          children: [new Paragraph({ children: [bodyText(`Phần ${q.part}`)] })],
          shading: { type: ShadingType.SOLID, color: rowColor },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [bodyText(latexAwarePlainText(q.explanation || '—'), { italic: true })],
            spacing: { line: LINE_SPACING },
          })],
          shading: { type: ShadingType.SOLID, color: rowColor },
        }),
      ],
    });
  });

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
  });
}

// ── MAIN EXPORT FUNCTION ───────────────────────────────────────────
export async function exportExamToWord(
  exam: Exam,
  mode: 'student' | 'teacher',
): Promise<void> {
  const part1 = exam.questions.filter(q => q.part === 1);
  const part2 = exam.questions.filter(q => q.part === 2);
  const part3 = exam.questions.filter(q => q.part === 3);

  const allParagraphs: (Paragraph | Table)[] = [];

  // ══ TRANG BÌA / TIÊU ĐỀ ══════════════════════════════════════════
  allParagraphs.push(
    new Paragraph({
      children: [bodyText('SỞ GIÁO DỤC VÀ ĐÀO TẠO', { bold: true, size: SIZE_BODY })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [bodyText('TRƯỜNG THPT CHUYÊN PHYS-9+', { bold: true })],
      alignment: AlignmentType.CENTER,
    }),
    emptyParagraph(),
    new Paragraph({
      children: [bodyText(exam.title.toUpperCase(), { bold: true, size: SIZE_TITLE })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 80 },
    }),
    new Paragraph({
      children: [bodyText('Thời gian làm bài: 50 phút (không kể thời gian phát đề)', { italic: true })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [bodyText(mode === 'teacher'
        ? '⭐ BẢN GIÁO VIÊN — Có đáp án và giải thích chi tiết'
        : '📄 BẢN HỌC SINH',
        { bold: true, color: mode === 'teacher' ? 'B45309' : '1a1a2e' }
      )],
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 200 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: '1a1a2e' } },
      children: [],
      spacing: { after: 200 },
    }),
  );

  // ══ PHẦN I ════════════════════════════════════════════════════════
  if (part1.length > 0) {
    allParagraphs.push(sectionHeader(
      `PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN (${part1.length} câu)`
    ));
    let counter = 0;
    for (const q of part1) {
      counter++;
      const blocks = await renderQuestionBlock(q, `Câu ${counter}`, mode);
      allParagraphs.push(...blocks);
    }
  }

  // ══ PHẦN II ═══════════════════════════════════════════════════════
  if (part2.length > 0) {
    allParagraphs.push(emptyParagraph());
    allParagraphs.push(sectionHeader(
      `PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI (${part2.length} câu)`
    ));
    let counter = part1.length;
    for (const q of part2) {
      counter++;
      const blocks = await renderQuestionBlock(q, `Câu ${counter}`, mode);
      allParagraphs.push(...blocks);
    }
  }

  // ══ PHẦN III ══════════════════════════════════════════════════════
  if (part3.length > 0) {
    allParagraphs.push(emptyParagraph());
    allParagraphs.push(sectionHeader(
      `PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN (${part3.length} câu)`
    ));
    let counter = part1.length + part2.length;
    for (const q of part3) {
      counter++;
      const blocks = await renderQuestionBlock(q, `Câu ${counter}`, mode);
      allParagraphs.push(...blocks);
      // Bản HS: 3 dòng kẻ dưới mỗi câu phần III
      if (mode === 'student') {
        allParagraphs.push(...answerLines());
      }
    }
  }

  // ══ HẾT ══════════════════════════════════════════════════════════
  allParagraphs.push(
    emptyParagraph(),
    new Paragraph({
      children: [bodyText('— HẾT —', { bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: '1a1a2e' } },
    }),
  );

  // ══ PHẦN ĐÁP ÁN (CHỈ BẢN GV) ═════════════════════════════════════
  if (mode === 'teacher') {
    allParagraphs.push(
      emptyParagraph(),
      new Paragraph({
        children: [bodyText('ĐÁP ÁN VÀ HƯỚNG DẪN GIẢI CHI TIẾT', { bold: true, size: SIZE_TITLE })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 200 },
        pageBreakBefore: true,
      }),
      buildAnswerTable(exam.questions),
    );
  }

  // ══ BUILD DOCUMENT ════════════════════════════════════════════════
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                bodyText('PHY9+ | Hệ thống luyện thi Vật lý', { size: 18, color: '888888' }),
                new TextRun({ children: ['\t', PageNumber.CURRENT], font: FONT_BODY, size: 18, color: '888888' }),
              ],
              tabStops: [{ type: 'right' as any, position: convertInchesToTwip(6.5) }],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } },
            }),
          ],
        }),
      },
      children: allParagraphs as Paragraph[],
    }],
    styles: {
      default: {
        document: {
          run: { font: FONT_BODY, size: SIZE_BODY, language: { value: 'vi-VN' } },
        },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  const suffix = mode === 'teacher' ? 'GV' : 'HS';
  const safeTitle = (exam.title || 'De_Thi').replace(/[\/\\:*?"<>|]/g, '-');
  saveAs(blob, `${safeTitle}_${suffix}.docx`);
}
