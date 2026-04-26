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
      className="bg-white text-black print:text-black w-full min-h-screen p-8 print:p-0 mx-auto print:max-w-none max-w-4xl shadow-xl space-y-6 print:space-y-4"
      style={{ fontFamily: "'Times New Roman', Times, serif" }}
    >
      <style>{`
        @media print {
          body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
            background: white; 
            line-height: 1.16 !important; 
          }
          .page-break-avoid { page-break-inside: avoid; }
          /* Khổ giấy và căn lề tiêu chuẩn 0.5 inches (~12.7mm) */
          @page { margin: 0.5in; }
          
          /* Cơ chế tự động thu nhỏ ảnh để tối ưu không gian in */
          img, .math-image {
            max-width: 60% !important;
            max-height: 250px !important;
            width: auto !important;
            height: auto !important;
            display: block;
            margin: 0.25rem auto !important;
            page-break-inside: avoid;
          }
        }
      `}</style>
      
      {/* ── HEADER ĐỀ THI ── */}
      <div className="text-center pb-4 print:pb-2 border-b-2 border-black mb-6 print:mb-3">
        <h1 className="text-2xl font-bold uppercase mb-2 print:mb-1">ĐỀ THI: {exam.title}</h1>
        <p className="text-sm italic">Thời gian làm bài: 50 phút (không kể thời gian phát đề)</p>
      </div>

      {/* ── PHẦN I: TNKQ ── */}
      {part1.length > 0 && (
        <div className="mb-6 print:mb-3">
          <h2 className="text-lg font-bold mb-4 print:mb-2 uppercase text-black">
            Phần I. Câu trắc nghiệm nhiều phương án lựa chọn ({part1.length} câu)
          </h2>
          <div className="space-y-4 print:space-y-2">
            {part1.map((q, idx) => (
              <div key={idx} className="page-break-avoid space-y-2 print:space-y-1 text-base text-justify">
                <div className="flex gap-1">
                  <span className="font-bold shrink-0">Câu {idx + 1}:</span>
                  <div className="flex-1 overflow-hidden [&_math]:!inline-block [&_.katex]:!inline-block">
                    <MathRenderer content={q.content} />
                  </div>
                </div>
                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 print:gap-1 mt-1 print:mt-0">
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
        <div className="mb-6 print:mb-3">
          <h2 className="text-lg font-bold mb-4 print:mb-2 uppercase text-black">
            Phần II. Câu trắc nghiệm đúng sai ({part2.length} câu)
          </h2>
          <div className="space-y-6 print:space-y-3">
            {part2.map((q, idx) => (
              <div key={idx} className="page-break-avoid space-y-2 print:space-y-1 text-base text-justify">
                <div className="flex gap-1">
                  <span className="font-bold shrink-0">Câu {part1.length + idx + 1}:</span>
                  <div className="flex-1 overflow-hidden [&_math]:!inline-block [&_.katex]:!inline-block">
                    <MathRenderer content={q.content} />
                  </div>
                </div>
                {q.options && q.options.length > 0 && (
                  <div className="flex flex-col gap-2 print:gap-1 mt-2 print:mt-1 ml-6">
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
        <div className="mb-6 print:mb-3">
          <h2 className="text-lg font-bold mb-4 print:mb-2 uppercase text-black">
            Phần III. Câu trắc nghiệm trả lời ngắn ({part3.length} câu)
          </h2>
          <div className="space-y-4 print:space-y-2">
            {part3.map((q, idx) => (
              <div key={idx} className="page-break-avoid space-y-2 print:space-y-1 text-base text-justify">
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
      <div className="mt-12 print:mt-6 text-center text-sm font-bold border-t-2 border-black pt-4 print:pt-2">
        --- HẾT ---
      </div>
    </div>
  );
});

export default PrintableExamView;
