import React, { forwardRef } from 'react';
import { Exam } from '../types';
import MathRenderer from '../lib/MathRenderer';
import { cn } from '../lib/utils';

interface PrintableExamProps {
  exam: Exam;
}

export const PrintableExamView = forwardRef<HTMLDivElement, PrintableExamProps>(({ exam }, ref) => {
  if (!exam || !exam.questions) return null;

  // Tách câu hỏi theo Part
  const part1 = exam.questions.filter(q => q.part === 1);
  const part2 = exam.questions.filter(q => q.part === 2);
  const part3 = exam.questions.filter(q => q.part === 3);

  return (
    <div 
      ref={ref} 
      className="bg-white text-black print:text-black w-full min-h-screen p-8 mx-auto print:max-w-none max-w-4xl shadow-xl space-y-6"
      style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
          .page-break-avoid { page-break-inside: avoid; }
          .page-break-before { page-break-before: always; }
          @page { margin: 20mm; }
        }
      `}</style>
      
      {/* ── HEADER ĐỀ THI ── */}
      <div className="text-center pb-4 border-b-2 border-black mb-6">
        <h1 className="text-2xl font-bold uppercase mb-2">ĐỀ THI: {exam.title}</h1>
        <p className="text-sm italic">Thời gian làm bài: 50 phút (không kể thời gian phát đề)</p>
      </div>

      {/* ── PHẦN I: TNKQ ── */}
      {part1.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-4 uppercase text-black">
            Phần I. Câu trắc nghiệm nhiều phương án lựa chọn ({part1.length} câu)
          </h2>
          <div className="space-y-4">
            {part1.map((q, idx) => (
              <div key={idx} className="page-break-avoid space-y-2 text-base text-justify">
                <div className="flex gap-1">
                  <span className="font-bold shrink-0">Câu {idx + 1}:</span>
                  <div className="flex-1 overflow-hidden [&_math]:!inline-block [&_.katex]:!inline-block">
                    <MathRenderer content={q.content} />
                  </div>
                </div>
                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-1">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex gap-1">
                        <span className="font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                        <span><MathRenderer content={opt} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PHẦN II: TRẮC NGHIỆM Đ/S ── */}
      {part2.length > 0 && (
        <div className="mb-6 page-break-before">
          <h2 className="text-lg font-bold mb-4 uppercase text-black">
            Phần II. Câu trắc nghiệm đúng sai ({part2.length} câu)
          </h2>
          <div className="space-y-6">
            {part2.map((q, idx) => (
              <div key={idx} className="page-break-avoid space-y-2 text-base text-justify">
                <div className="flex gap-1">
                  <span className="font-bold shrink-0">Câu {part1.length + idx + 1}:</span>
                  <div className="flex-1 overflow-hidden [&_math]:!inline-block [&_.katex]:!inline-block">
                    <MathRenderer content={q.content} />
                  </div>
                </div>
                {q.options && q.options.length > 0 && (
                  <div className="flex flex-col gap-2 mt-2 ml-6">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex gap-2">
                        <span className="font-bold">{String.fromCharCode(97 + oIdx)})</span>
                        <span><MathRenderer content={opt} /></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PHẦN III: TỰ LUẬN NGẮN ── */}
      {part3.length > 0 && (
        <div className="mb-6 page-break-before">
          <h2 className="text-lg font-bold mb-4 uppercase text-black">
            Phần III. Câu trắc nghiệm trả lời ngắn ({part3.length} câu)
          </h2>
          <div className="space-y-4">
            {part3.map((q, idx) => (
              <div key={idx} className="page-break-avoid space-y-2 text-base text-justify">
                <div className="flex gap-1">
                  <span className="font-bold shrink-0">Câu {part1.length + part2.length + idx + 1}:</span>
                  <div className="flex-1 overflow-hidden [&_math]:!inline-block [&_.katex]:!inline-block">
                     <MathRenderer content={q.content} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FOOTER ĐỀ THI ── */}
      <div className="mt-12 text-center text-sm font-bold border-t-2 border-black pt-4">
        --- HẾT ---
      </div>
    </div>
  );
});

export default PrintableExamView;
