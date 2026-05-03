import React, { forwardRef } from 'react';
import { Question } from '../types';
import 'katex/dist/katex.min.css';
import katex from 'katex';

// ── Render LaTeX sắc nét bằng KaTeX DOM thuần ──────────────────────
// Không dùng html2canvas — trình duyệt tự xử lý font vector chuẩn
function renderMath(text: string): string {
  if (!text) return '';
  // Xử lý block math: $$...$$ hoặc \[...\]
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _; }
  });
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
    catch { return _; }
  });
  // Xử lý inline math: $...$ hoặc \(...\)
  text = text.replace(/\$([^$\n]+?)\$/g, (_, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
    catch { return _; }
  });
  text = text.replace(/\\\((.+?)\\\)/g, (_, expr) => {
    try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
    catch { return _; }
  });
  return text;
}

// Strip HTML tags để lấy text thuần
function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

const LEVEL_LABELS: Record<number, string> = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' };

interface PrintableExamProps {
  title: string;
  questions: Question[];
  schoolName?: string;
  subjectLabel?: string;
}

// ── Component ẩn — chỉ dùng để in, không render ra UI chính ──────────
export const PrintableExam = forwardRef<HTMLDivElement, PrintableExamProps>(
  ({ title, questions, schoolName = 'phy9plus.com', subjectLabel = 'VẬT LÝ' }, ref) => {

    // Tách nhóm câu theo Part
    const part1 = questions.filter(q => q.part === 1);
    const part2 = questions.filter(q => q.part === 2);
    const part3 = questions.filter(q => q.part === 3);

    // Đáp án Part I
    const answerKeyP1 = part1.map((q, idx) => ({
      no: idx + 1,
      answer: typeof q.correctAnswer === 'number' ? LEVEL_LABELS[q.correctAnswer] : String(q.correctAnswer),
    }));

    // Đáp án Part III
    const answerKeyP3 = part3.map((q, idx) => ({
      no: part1.length + part2.length + idx + 1,
      answer: String(q.correctAnswer),
    }));

    return (
      <div
        ref={ref}
        style={{
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: '12pt',
          color: '#000',
          background: '#fff',
          padding: '18mm 20mm',
          maxWidth: '210mm',
          margin: '0 auto',
          lineHeight: 1.6,
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ textAlign: 'center', marginBottom: '12mm', borderBottom: '2px solid #000', paddingBottom: '6mm' }}>
          <p style={{ fontSize: '10pt', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{schoolName}</p>
          <h1 style={{ fontSize: '16pt', fontWeight: 900, margin: '4px 0', textTransform: 'uppercase' }}>
            ĐỀ THI MÔN {subjectLabel}
          </h1>
          <h2 style={{ fontSize: '13pt', fontWeight: 700, margin: '2px 0' }}>{title}</h2>
          <p style={{ fontSize: '10pt', margin: '4px 0 0', color: '#555' }}>
            Tổng số câu: <strong>{questions.length}</strong> &nbsp;|&nbsp; Ngày tạo: <strong>{new Date().toLocaleDateString('vi-VN')}</strong>
          </p>
        </div>

        {/* ── PHẦN I ── */}
        {part1.length > 0 && (
          <section style={{ marginBottom: '8mm' }}>
            <h3 style={{ fontSize: '12pt', fontWeight: 900, borderLeft: '4px solid #2563eb', paddingLeft: '8px', marginBottom: '6mm' }}>
              PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN ({part1.length} câu · 0.25đ/câu)
            </h3>
            {part1.map((q, idx) => (
              <div key={q.id || idx} style={{ marginBottom: '7mm', pageBreakInside: 'avoid' }}>
                <p style={{ fontWeight: 700, margin: '0 0 2mm' }}>
                  Câu {idx + 1}.{' '}
                  <span dangerouslySetInnerHTML={{ __html: renderMath(stripHtml(q.content)) }} />
                </p>
                {/* Ảnh trong content (nếu có) */}
                {q.content.includes('<img') && (
                  <div
                    dangerouslySetInnerHTML={{ __html: q.content.replace(/<p[^>]*>|<\/p>/g, '') }}
                    style={{ margin: '2mm 0', maxWidth: '100%' }}
                  />
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1mm 8mm', marginTop: '2mm' }}>
                  {(q.options || []).map((opt, oIdx) => (
                    <p key={oIdx} style={{ margin: '1mm 0', display: 'flex', gap: '4px' }}>
                      <strong style={{ minWidth: '16px' }}>{LEVEL_LABELS[oIdx]}.</strong>
                      <span dangerouslySetInnerHTML={{ __html: renderMath(stripHtml(opt)) }} />
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── PHẦN II ── */}
        {part2.length > 0 && (
          <section style={{ marginBottom: '8mm' }}>
            <h3 style={{ fontSize: '12pt', fontWeight: 900, borderLeft: '4px solid #16a34a', paddingLeft: '8px', marginBottom: '6mm' }}>
              PHẦN II. ĐÚNG/SAI ({part2.length} câu)
            </h3>
            {part2.map((q, idx) => (
              <div key={q.id || idx} style={{ marginBottom: '7mm', pageBreakInside: 'avoid' }}>
                <p style={{ fontWeight: 700, margin: '0 0 2mm' }}>
                  Câu {part1.length + idx + 1}.{' '}
                  <span dangerouslySetInnerHTML={{ __html: renderMath(stripHtml(q.content)) }} />
                </p>
                {(q.options || []).map((opt, oIdx) => (
                  <p key={oIdx} style={{ margin: '1mm 0 1mm 8mm', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <span style={{ border: '1px solid #999', borderRadius: '3px', padding: '0 4px', fontSize: '10pt', minWidth: '18px', textAlign: 'center' }}>
                      {String.fromCharCode(97 + oIdx)}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: renderMath(stripHtml(opt)) }} />
                    <span style={{ marginLeft: 'auto', border: '1px solid #ccc', borderRadius: '3px', padding: '0 8px', minWidth: '40px', textAlign: 'center', color: '#888' }}>
                      Đ / S
                    </span>
                  </p>
                ))}
              </div>
            ))}
          </section>
        )}

        {/* ── PHẦN III ── */}
        {part3.length > 0 && (
          <section style={{ marginBottom: '8mm' }}>
            <h3 style={{ fontSize: '12pt', fontWeight: 900, borderLeft: '4px solid #dc2626', paddingLeft: '8px', marginBottom: '6mm' }}>
              PHẦN III. TRẢ LỜI NGẮN ({part3.length} câu · 0.25đ/câu)
            </h3>
            {part3.map((q, idx) => (
              <div key={q.id || idx} style={{ marginBottom: '7mm', pageBreakInside: 'avoid' }}>
                <p style={{ fontWeight: 700, margin: '0 0 2mm' }}>
                  Câu {part1.length + part2.length + idx + 1}.{' '}
                  <span dangerouslySetInnerHTML={{ __html: renderMath(stripHtml(q.content)) }} />
                </p>
                <p style={{ margin: '2mm 0 0 4mm', color: '#555', fontStyle: 'italic', fontSize: '11pt' }}>
                  Trả lời: _______________
                </p>
              </div>
            ))}
          </section>
        )}

        {/* ── PAGE BREAK → TRANG ĐÁP ÁN ── */}
        <div style={{ pageBreakBefore: 'always' }} />

        {/* ── TRANG ĐÁP ÁN ── */}
        <div style={{ borderTop: '3px double #000', paddingTop: '8mm' }}>
          <h2 style={{ textAlign: 'center', fontSize: '14pt', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8mm' }}>
            BẢNG ĐÁP ÁN
          </h2>

          {/* Đáp án Part I — dạng bảng ngang */}
          {answerKeyP1.length > 0 && (
            <div style={{ marginBottom: '8mm' }}>
              <p style={{ fontWeight: 700, marginBottom: '4mm' }}>Phần I — Trắc nghiệm nhiều lựa chọn:</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                <tbody>
                  {/* Chia thành các hàng 10 câu */}
                  {Array.from({ length: Math.ceil(answerKeyP1.length / 10) }, (_, rowIdx) => {
                    const rowItems = answerKeyP1.slice(rowIdx * 10, rowIdx * 10 + 10);
                    return (
                      <React.Fragment key={rowIdx}>
                        <tr style={{ backgroundColor: '#f1f5f9' }}>
                          {rowItems.map(item => (
                            <td key={item.no} style={{ border: '1px solid #cbd5e1', padding: '3px 6px', textAlign: 'center', fontWeight: 700 }}>
                              Câu {item.no}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          {rowItems.map(item => (
                            <td key={item.no} style={{ border: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', fontWeight: 900, color: '#1d4ed8', fontSize: '12pt' }}>
                              {item.answer}
                            </td>
                          ))}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Đáp án Part II */}
          {part2.length > 0 && (
            <div style={{ marginBottom: '8mm' }}>
              <p style={{ fontWeight: 700, marginBottom: '4mm' }}>Phần II — Đúng/Sai:</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11pt' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Câu</th>
                    {['a', 'b', 'c', 'd'].map(l => (
                      <th key={l} style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {part2.map((q, idx) => {
                    const ans = Array.isArray(q.correctAnswer) ? q.correctAnswer as boolean[] : [];
                    return (
                      <tr key={q.id || idx}>
                        <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'center', fontWeight: 700 }}>
                          Câu {part1.length + idx + 1}
                        </td>
                        {[0, 1, 2, 3].map(i => (
                          <td key={i} style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'center', fontWeight: 900, color: ans[i] ? '#16a34a' : '#dc2626' }}>
                            {ans[i] !== undefined ? (ans[i] ? 'Đ' : 'S') : '?'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Đáp án Part III */}
          {answerKeyP3.length > 0 && (
            <div>
              <p style={{ fontWeight: 700, marginBottom: '4mm' }}>Phần III — Trả lời ngắn:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '3mm' }}>
                {answerKeyP3.map(item => (
                  <div key={item.no} style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>Câu {item.no}:</span>
                    <span style={{ fontWeight: 900, color: '#1d4ed8' }}>{item.answer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: '12mm', fontSize: '9pt', color: '#94a3b8' }}>
            — Được tạo tự động bởi {schoolName} · {new Date().toLocaleString('vi-VN')} —
          </p>
        </div>
      </div>
    );
  }
);

PrintableExam.displayName = 'PrintableExam';
