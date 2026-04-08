import React, { useState } from 'react';
import { Question, Topic } from '../types';
import MathRenderer from '../lib/MathRenderer';
import { cn } from '../lib/utils';
import { Check, X, ArrowLeft, Lightbulb, Info, Flag, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { auth, db, collection, addDoc, Timestamp } from '../firebase';
import { toast } from './Toast';

export const ReviewExam = ({
  test,
  answers,
  onBack
}: {
  test: { topic: Topic, questions: Question[] },
  answers: Record<string, any>,
  onBack: () => void
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentQuestion = test.questions[currentIndex];

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState<'Sai đáp án' | 'Lỗi đề' | 'Lỗi công thức'>('Sai đáp án');
  const [reportMessage, setReportMessage] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const handleReportSubmit = async () => {
    if (!currentQuestion?.id || !auth.currentUser) return;
    setIsSubmittingReport(true);
    try {
      await addDoc(collection(db, 'reportedQuestions'), {
        questionId: currentQuestion.id,
        studentId: auth.currentUser.uid,
        studentName: auth.currentUser.displayName || 'Học sinh',
        reason: reportReason,
        message: reportMessage.trim(),
        status: 'pending',
        timestamp: Timestamp.now()
      });
      setReportSuccess(true);
      setTimeout(() => {
        setReportSuccess(false);
        setReportModalOpen(false);
        setReportMessage('');
      }, 2000);
    } catch (error) {
      console.error('Error reporting question:', error);
      toast.error('Có lỗi xảy ra khi gửi báo lỗi. Vui lòng thử lại sau.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const checkCorrectness = (q: Question, studentAns: any) => {
    if (studentAns === undefined) return false;
    if (q.part === 1) return studentAns === q.correctAnswer;
    if (q.part === 2) {
      if (!Array.isArray(studentAns)) return false;
      let allCorrect = true;
      for (let i = 0; i < 4; i++) {
        if (studentAns[i] !== (q.correctAnswer as boolean[])[i]) {
          allCorrect = false;
        }
      }
      return allCorrect;
    }
    if (q.part === 3) {
      const sv = parseFloat(String(studentAns).replace(',', '.'));
      const cv = parseFloat(String(q.correctAnswer).replace(',', '.'));
      return !isNaN(sv) && Math.abs(sv - cv) < 0.01;
    }
    return false;
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center gap-6">
        <button 
          onClick={onBack}
          className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-headline font-black text-white tracking-tight uppercase">XEM LẠI BÀI LÀM LỜI GIẢI</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{test.topic} | {test.questions.length} CÂU HỎI</p>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Navigation */}
        <aside className="w-80 bg-slate-900/50 border-r border-slate-800 p-6 overflow-y-auto custom-scrollbar hidden lg:block">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 font-headline">BẢNG CÂU HỎI</h4>
          <div className="grid grid-cols-4 gap-2">
            {test.questions.map((q, i) => {
              const isCorrect = checkCorrectness(q, answers[q.id || '']);
              return (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    "w-full aspect-square rounded-xl flex items-center justify-center text-xs font-black transition-all border",
                    currentIndex === i ? "ring-2 ring-white scale-110 shadow-lg z-10" : "",
                    isCorrect 
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                      : answers[q.id || ''] !== undefined 
                        ? "bg-rose-500/10 border-rose-500/50 text-rose-400"
                        : "bg-slate-800 border-slate-700 text-slate-500" // Not answered
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 bg-slate-950 flex flex-col overflow-hidden relative">
          {/* Glassmorphism ambient background */}
          <div className="absolute top-[20%] left-[10%] w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-[40%] right-[10%] w-[30rem] h-[30rem] bg-rose-600/10 rounded-full blur-[120px] pointer-events-none" />

          {/* Mobile Horizontal Nav */}
          <div className="block lg:hidden flex-none w-full bg-slate-900 border-b border-slate-800 relative z-20">
            <div className="flex overflow-x-auto whitespace-nowrap gap-2 py-3 px-4 w-full custom-scrollbar">
              {test.questions.map((q, i) => {
                const isCorrect = checkCorrectness(q, answers[q.id || '']);
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className={cn(
                      "flex-none w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black transition-all border shrink-0",
                      currentIndex === i ? "ring-2 ring-white scale-110 shadow-lg z-10" : "",
                      isCorrect 
                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                        : answers[q.id || ''] !== undefined 
                          ? "bg-rose-500/10 border-rose-500/50 text-rose-400"
                          : "bg-slate-800 border-slate-700 text-slate-500" // Not answered
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-12 pb-32">
            <div className="w-full max-w-3xl mx-auto space-y-8 relative z-10 break-words whitespace-normal min-w-0">
            <div className="flex items-center gap-4">
              <span className="bg-slate-900 border border-slate-800 text-slate-400 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                PHẦN {currentQuestion?.part || '?'}
              </span>
              <span className="text-slate-600 font-bold text-xs">MỨC ĐỘ: {currentQuestion?.level || '—'}</span>
              
              {currentQuestion && (
                <button 
                  onClick={() => setReportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase font-black tracking-widest border border-amber-500/30 text-amber-500 bg-amber-500/10 hover:bg-amber-500 hover:text-white transition-all ml-2"
                  title="Báo lỗi câu hỏi này"
                >
                  <Flag className="w-3 h-3" /> Báo lỗi
                </button>
              )}

              <div className={cn(
                "ml-auto px-4 py-1 rounded-full text-xs font-bold flex items-center gap-2 border",
                checkCorrectness(currentQuestion, answers[currentQuestion.id || ''])
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : answers[currentQuestion.id || ''] !== undefined 
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                    : "bg-slate-800 border-slate-700 text-slate-400"
              )}>
                {checkCorrectness(currentQuestion, answers[currentQuestion.id || '']) ? (
                  <><Check className="w-4 h-4"/> ĐÚNG</>
                ) : answers[currentQuestion.id || ''] !== undefined ? (
                  <><X className="w-4 h-4"/> SAI</>
                ) : (
                  <>CHƯA LÀM</>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {/* ═══ [CLUSTER] Hiển thị ngữ cảnh chung ═══ */}
              {(() => {
                const clusterTag = currentQuestion.tags?.find(t => t.startsWith('__cluster_context:'));
                if (clusterTag && currentQuestion.clusterOrder === 0) {
                  const ctx = clusterTag.replace('__cluster_context:', '');
                  return (
                    <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-6 mb-4">
                      <div className="flex items-center gap-2 text-amber-500 mb-3">
                        <Info className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-wider">Dữ kiện chung — Câu hỏi chùm</span>
                      </div>
                      <div className="text-amber-100/90 text-sm leading-relaxed">
                        <MathRenderer content={ctx} />
                      </div>
                    </div>
                  );
                }
                if (currentQuestion.clusterId && (currentQuestion.clusterOrder ?? 0) > 0) {
                  return (
                    <div className="text-amber-500/70 text-xs font-bold flex items-center gap-1 mb-2">
                      <Info className="w-3 h-3" />
                      📎 Câu này dùng chung dữ kiện với câu trước
                    </div>
                  );
                }
                return null;
              })()}

              <h3 className="text-xl md:text-2xl font-bold text-white leading-relaxed break-words whitespace-normal min-w-0">
                <span className="text-slate-500 mr-2 font-headline">CÂU {currentIndex + 1}.</span>
                <MathRenderer content={currentQuestion?.content || 'Chưa có nội dung câu hỏi.'} />
              </h3>

              <div className="space-y-4 pt-6">
                {currentQuestion.part === 1 && currentQuestion.options?.map((opt, idx) => {
                  const isUserAns = answers[currentQuestion.id || ''] === idx;
                  const isCorrectAns = currentQuestion.correctAnswer === idx;

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "w-full p-6 rounded-2xl border text-left flex items-center gap-6 group relative overflow-hidden",
                        isCorrectAns
                          ? "bg-emerald-600/10 border-emerald-500 text-emerald-100"
                          : isUserAns
                            ? "bg-rose-600/10 border-rose-500 text-rose-100"
                            : "bg-slate-900 border-slate-800 text-slate-400"
                      )}
                    >
                      <span className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors",
                        isCorrectAns ? "bg-emerald-600 text-white" : isUserAns ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-500"
                      )}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <div className="text-base md:text-lg flex-1 min-w-0 break-words whitespace-normal">
                        <MathRenderer content={opt} />
                      </div>
                      {isCorrectAns && <Check className="w-6 h-6 outline-emerald-500 text-emerald-500 mr-4" />}
                      {isUserAns && !isCorrectAns && <X className="w-6 h-6 outline-rose-500 text-rose-500 mr-4" />}
                    </div>
                  );
                })}

                {currentQuestion.part === 2 && (
                  <div className="space-y-4">
                    {currentQuestion.options?.map((opt, idx) => {
                      const userAns = (answers[currentQuestion.id || ''] || [])[idx];
                      const correctAns = (currentQuestion.correctAnswer as boolean[])[idx];
                      const isMatch = userAns === correctAns;
                      const hasAns = userAns !== undefined && userAns !== null;

                      return (
                        <div key={idx} className={cn(
                          "p-6 bg-slate-900 border rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4",
                          hasAns ? (isMatch ? "border-emerald-500/50" : "border-rose-500/50") : "border-slate-800"
                        )}>
                          <div className="text-base md:text-lg text-slate-200 flex-1 min-w-0 break-words whitespace-normal">
                            <MathRenderer content={opt} />
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Đ/A Gốc</span>
                              <div className={cn("px-4 py-1 rounded text-xs font-black uppercase", correctAns ? "bg-green-600 text-white" : "bg-red-600 text-white")}>
                                {correctAns ? 'ĐÚNG' : 'SAI'}
                              </div>
                            </div>
                            {hasAns && (
                              <div className="flex flex-col items-center border-l border-slate-700 pl-4">
                                <span className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Bạn Chọn</span>
                                <div className={cn("px-4 py-1 rounded text-xs font-black uppercase", userAns === correctAns ? "text-emerald-400 bg-emerald-400/10" : "text-rose-400 bg-rose-400/10")}>
                                  {userAns ? 'ĐÚNG' : 'SAI'} 
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.part === 3 && (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 font-bold uppercase">KẾT QUẢ ĐÚNG:</p>
                    <div className="w-full bg-emerald-500/10 border border-emerald-500/50 p-6 rounded-2xl text-2xl font-black text-emerald-400">
                      {currentQuestion.correctAnswer}
                    </div>
                    
                    <p className="text-xs text-slate-500 font-bold uppercase mt-4">BẠN ĐÃ NHẬP:</p>
                    <div className={cn(
                      "w-full border p-6 rounded-2xl text-2xl font-black",
                      checkCorrectness(currentQuestion, answers[currentQuestion.id || ''])
                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/50 text-rose-400"
                    )}>
                      {answers[currentQuestion.id || ''] || 'Bỏ trống'}
                    </div>
                  </div>
                )}
              </div>

              {/* Lời giải chi tiết */}
              <div className="mt-12 p-8 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-blue-500" />
                <h4 className="text-sm font-black text-white flex items-center gap-2 mb-6 uppercase tracking-widest">
                  <Lightbulb className="text-yellow-500" /> LỜI GIẢI CHI TIẾT
                </h4>
                <div className="prose prose-invert max-w-none text-slate-300 break-words whitespace-normal min-w-0">
                  {currentQuestion.explanation ? (
                    <MathRenderer content={currentQuestion.explanation} block />
                  ) : (
                    <p className="italic opacity-50">Giáo viên chưa cập nhật lời giải cho câu hỏi này.</p>
                  )}
                </div>
              </div>

              </div >

              {/* Desktop Navigation Footer */}
              <div className="hidden lg:flex justify-between items-center pt-8 border-t border-slate-800 mt-8 mb-4">
                <button 
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-2 text-slate-500 hover:text-white disabled:opacity-0 transition-colors font-bold text-sm"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                  Câu trước
                </button>
                <button 
                  onClick={() => setCurrentIndex(prev => Math.min(test.questions.length - 1, prev + 1))}
                  disabled={currentIndex === test.questions.length - 1}
                  className="flex items-center gap-2 text-blue-500 hover:text-blue-400 disabled:opacity-0 transition-colors font-bold text-sm"
                >
                  Câu tiếp theo
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Navigation for Mobile */}
          <div className="lg:hidden absolute bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 p-4 z-50 flex gap-3 pb-8">
            <button 
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 text-white font-black text-sm disabled:opacity-30 disabled:cursor-not-allowed active:bg-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              CÂU TRƯỚC
            </button>
            <button 
              onClick={() => setCurrentIndex(prev => Math.min(test.questions.length - 1, prev + 1))}
              disabled={currentIndex === test.questions.length - 1}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-black text-sm disabled:opacity-30 disabled:cursor-not-allowed active:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20"
            >
              CÂU TIẾP
              <ArrowLeft className="w-5 h-5 rotate-180" />
            </button>
          </div>
        </main>
      </div>

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Flag className="text-amber-500" /> Báo lỗi câu hỏi
              </h3>
              <p className="text-xs text-slate-400 mb-6">Bạn phát hiện vấn đề ở câu {currentIndex + 1}? Hãy báo cho thầy biết nhé!</p>
              
              <div className="space-y-3">
                {(['Sai đáp án', 'Lỗi đề', 'Lỗi công thức'] as const).map(reason => (
                  <button
                    key={reason}
                    onClick={() => setReportReason(reason)}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-xl border text-sm font-bold transition-all text-left",
                      reportReason === reason 
                        ? "border-amber-500 bg-amber-500/10 text-amber-400" 
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      reportReason === reason ? "border-amber-500" : "border-slate-600"
                    )}>
                      {reportReason === reason && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                    </div>
                    {reason}
                  </button>
                ))}
                
                <textarea
                  placeholder="Ghi chú thêm (Tùy chọn)... Ví dụ: Đáp án đúng phải là C."
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 min-h-[80px] focus:outline-none focus:border-amber-500/50 resize-none transition-colors"
                />
              </div>

              {reportSuccess && (
                <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold text-center">
                  Cảm ơn bạn! Thầy sẽ kiểm tra lại câu này sớm nhất.
                </div>
              )}
            </div>
            
            <div className="border-t border-slate-800 p-4 flex gap-3 bg-slate-950">
              <button 
                onClick={() => setReportModalOpen(false)}
                className="flex-1 py-3 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-900 transition-colors"
                disabled={isSubmittingReport}
              >
                HỦY
              </button>
              <button 
                onClick={handleReportSubmit}
                disabled={isSubmittingReport || reportSuccess}
                className="flex-1 py-3 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors disabled:opacity-50"
              >
                {isSubmittingReport ? 'ĐANG GỬI...' : 'GỬI BÁO LỖI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
