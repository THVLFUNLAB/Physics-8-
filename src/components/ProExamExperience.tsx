import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { auth } from '../firebase';
import { Question, Topic } from '../types';
import MathRenderer from '../lib/MathRenderer';
import {
  Activity, Clock, ChevronRight, ShieldAlert, Info, Archive
} from 'lucide-react';

export const ProExamExperience = ({ 
  test, 
  answers: initialAnswers, 
  onAnswer, 
  onSubmit, 
  onCancel 
}: { 
  test: { topic: Topic, questions: Question[] }, 
  answers: Record<string, any>, 
  onAnswer: (questionId: string, ans: any) => void, 
  onSubmit: () => void,
  onCancel: () => void
}) => {
  const DRAFT_KEY = `exam_draft_${auth.currentUser?.uid}_${test.topic}`;
  
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.timeLeft > 0) return parsed.timeLeft;
      } catch (e) {}
    }
    return 50 * 60; // 50 minutes
  });
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cheatWarnings, setCheatWarnings] = useState(0);
  const [showCheatAlert, setShowCheatAlert] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [clusterContextCollapsed, setClusterContextCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Object.keys(parsed.answers).length > 0) {
          setShowResumeModal(true);
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (!showResumeModal) {
      // Save state periodically
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        timeLeft,
        answers: initialAnswers,
        timestamp: Date.now()
      }));
    }
  }, [timeLeft, initialAnswers, showResumeModal]);

  useEffect(() => {
    if (showResumeModal) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setCheatWarnings(prev => prev + 1);
        setShowCheatAlert(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showResumeModal]);

  const handleSubmit = () => {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem('phys8_active_exam_session'); // Xóa session key
    onSubmit();
  };

  const handleResumeChoice = (choice: 'resume' | 'reset') => {
    if (choice === 'reset') {
      localStorage.removeItem(DRAFT_KEY);
      setTimeLeft(50 * 60);
    } else {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          Object.keys(parsed.answers).forEach(qid => onAnswer(qid, parsed.answers[qid]));
        } catch (e) {}
      }
    }
    setShowResumeModal(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion = test.questions[currentIndex];

  return (
    <div className={cn(
      "fixed inset-0 bg-slate-950 z-[100] flex flex-col overflow-hidden transition-all duration-1000",
      timeLeft < 300 ? "shadow-[inset_0_0_150px_rgba(220,38,38,0.3)] ring-4 ring-inset ring-red-500/50" : ""
    )}>
      {timeLeft < 300 && (
        <div className="absolute inset-0 pointer-events-none bg-red-500/5 animate-pulse z-0" />
      )}
      
      {/* Exam Header */}
      <header className="relative z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={cn("p-2 rounded-xl transition-all", timeLeft < 300 ? "bg-red-600 animate-bounce" : "bg-blue-600")}>
            <Activity className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className={cn("text-lg md:text-xl font-black uppercase tracking-tighter transition-colors", timeLeft < 300 ? "text-red-400" : "text-white")}>PHÒNG THI ZEN MODE</h2>
            <p className="text-xs md:text-sm text-slate-500 font-bold uppercase">Chủ đề: {test.topic} | {test.questions.length} Câu hỏi</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className={cn(
            "flex items-center gap-3 px-6 py-2 rounded-2xl border font-mono text-xl font-black transition-colors",
            timeLeft < 300 ? "bg-red-600/10 border-red-600 text-red-500 animate-pulse" : "bg-slate-950 border-slate-800 text-white"
          )}>
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
          
          <button 
            onClick={() => {
              if (confirm("Bạn có chắc chắn muốn nộp bài sớm?")) handleSubmit();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20"
          >
            Nộp bài
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Question Navigation */}
        <aside className="w-80 bg-slate-900/50 border-r border-slate-800 p-6 overflow-y-auto custom-scrollbar hidden lg:block">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Danh sách câu hỏi</h4>
          <div className="space-y-1">
            {(() => {
              // ═══ CLUSTER-AWARE SIDEBAR: Nhóm câu cluster visual ═══
              const items: React.ReactNode[] = [];
              let i = 0;
              while (i < test.questions.length) {
                const q = test.questions[i];
                if (q.clusterId) {
                  // Thu thập tất cả câu cùng cluster liền kề
                  const clusterStart = i;
                  const cid = q.clusterId;
                  while (i < test.questions.length && test.questions[i].clusterId === cid) i++;
                  const clusterEnd = i;
                  items.push(
                    <div key={`cluster-${cid}`} className="relative pl-4 py-1 mb-1 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      {/* Vertical accent bar */}
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500/40 rounded-full" />
                      <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
                        <span className="text-[8px]">🔗</span>
                        <span className="text-[8px] font-bold text-amber-500/70 uppercase tracking-wider">Câu chùm</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {Array.from({ length: clusterEnd - clusterStart }, (_, ci) => {
                          const qi = clusterStart + ci;
                          return (
                            <button
                              key={qi}
                              onClick={() => setCurrentIndex(qi)}
                              className={cn(
                                "w-full aspect-square rounded-lg flex items-center justify-center text-xs font-black transition-all border",
                                currentIndex === qi ? "bg-amber-600 border-amber-500 text-white shadow-lg" :
                                initialAnswers[test.questions[qi].id] !== undefined ? "bg-slate-800 border-slate-700 text-slate-300" :
                                "bg-slate-950 border-amber-900/30 text-slate-600 hover:border-amber-600/50"
                              )}
                            >
                              {qi + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                } else {
                  // Câu lẻ
                  const qi = i;
                  items.push(
                    <button
                      key={qi}
                      onClick={() => setCurrentIndex(qi)}
                      className={cn(
                        "w-full aspect-square rounded-xl flex items-center justify-center text-xs font-black transition-all border",
                        currentIndex === qi ? "bg-blue-600 border-blue-500 text-white shadow-lg" :
                        initialAnswers[test.questions[qi].id] !== undefined ? "bg-slate-800 border-slate-700 text-slate-300" :
                        "bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-600"
                      )}
                      style={{ width: 'calc(25% - 6px)', display: 'inline-flex' }}
                    >
                      {qi + 1}
                    </button>
                  );
                  i++;
                }
              }
              return <div className="flex flex-wrap gap-2">{items}</div>;
            })()}
          </div>

          <div className="mt-10 p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-amber-500">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase">Chống gian lận</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">Hệ thống sẽ ghi nhận mỗi khi bạn rời khỏi tab này. Số lần cảnh báo: <span className="text-red-500 font-bold">{cheatWarnings}</span></p>
          </div>
        </aside>

        {/* Question Content */}
        <main className="flex-1 bg-slate-950 p-8 md:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-10">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <span className="bg-slate-900 text-slate-400 px-4 py-1 rounded-full text-xs md:text-sm font-black uppercase border border-slate-800">
                Phần {currentQuestion.part}
              </span>
              <span className="text-slate-600 font-bold text-xs md:text-sm">Độ khó: {currentQuestion.level}</span>
            </div>

            <div className="space-y-6">
              {/* ═══ [CLUSTER] Hiển thị ngữ cảnh chung cho câu chùm ═══ */}
              {(() => {
                if (!currentQuestion.clusterId) return null;
                const headQuestion = test.questions.find(
                  q => q.clusterId === currentQuestion.clusterId && (q.clusterOrder ?? 0) === 0
                );
                const clusterTag = headQuestion?.tags?.find(t => t.startsWith('__cluster_context:'));
                const sharedCtx = clusterTag
                  ? clusterTag.replace('__cluster_context:', '')
                  : (currentQuestion.clusterOrder === 0 ? null : headQuestion?.content);

                if (currentQuestion.clusterOrder === 0 && clusterTag) {
                  const ctx = clusterTag.replace('__cluster_context:', '');
                  return (
                    <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-6 mb-4">
                      <div className="flex items-center gap-2 text-amber-500 mb-3">
                        <Info className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-wider">Dữ kiện chung — Câu hỏi chùm</span>
                      </div>
                      <div className="text-amber-100/90 text-fluid-base">
                        <MathRenderer content={ctx} />
                      </div>
                    </div>
                  );
                }

                if ((currentQuestion.clusterOrder ?? 0) > 0 && sharedCtx) {
                  return (
                    <div className="bg-amber-950/20 border border-amber-700/30 rounded-2xl overflow-hidden mb-4">
                      <button
                        onClick={() => setClusterContextCollapsed(!clusterContextCollapsed)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-900/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-amber-500">
                          <Info className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-wider">📎 Dữ kiện chung — Câu hỏi chùm</span>
                        </div>
                        <ChevronRight className={cn(
                          "w-4 h-4 text-amber-500 transition-transform",
                          clusterContextCollapsed ? "" : "rotate-90"
                        )} />
                      </button>
                      {!clusterContextCollapsed && (
                        <div className="px-6 pb-5 text-amber-100/90 text-fluid-base border-t border-amber-700/20 pt-4">
                          <MathRenderer content={sharedCtx} />
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              <h3 className="text-fluid-lg font-bold text-white leading-loose break-words whitespace-normal min-w-0">
                <span className="text-blue-500 mr-2">Câu {currentIndex + 1}:</span>
                <MathRenderer content={currentQuestion.content} />
              </h3>

              <div className="space-y-4 pt-6">
                {currentQuestion.part === 1 && currentQuestion.options?.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => onAnswer(currentQuestion.id, idx)}
                    className={cn(
                      "w-full p-4 md:p-6 rounded-2xl border text-left transition-all flex flex-row items-center gap-4 md:gap-6 group touch-target",
                      initialAnswers[currentQuestion.id] === idx 
                        ? "bg-blue-600/10 border-blue-600 shadow-lg shadow-blue-900/10" 
                        : "bg-slate-900 border-slate-800 hover:border-slate-600"
                    )}
                  >
                    <span className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors",
                      initialAnswers[currentQuestion.id] === idx ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500 group-hover:bg-slate-700"
                    )}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <div className="text-lg text-slate-200">
                      <MathRenderer content={opt} />
                    </div>
                  </button>
                ))}

                {currentQuestion.part === 2 && (
                  <div className="space-y-4">
                    {currentQuestion.options?.map((opt, idx) => (
                      <div key={idx} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="text-lg text-slate-200 flex-1">
                          <MathRenderer content={opt} />
                        </div>
                        <div className="flex gap-2">
                          {[true, false].map(val => (
                            <button
                              key={val.toString()}
                              onClick={() => {
                                const current = initialAnswers[currentQuestion.id] || [null, null, null, null];
                                const next = [...current];
                                next[idx] = val;
                                onAnswer(currentQuestion.id, next);
                              }}
                              className={cn(
                                "px-4 py-3 md:px-6 md:py-2 rounded-xl text-xs md:text-sm font-black uppercase tracking-widest transition-all border touch-target flex-1 md:flex-none text-center min-w-[70px]",
                                (initialAnswers[currentQuestion.id] || [])[idx] === val
                                  ? (val ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white")
                                  : "bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-600"
                              )}
                            >
                              {val ? 'Đúng' : 'Sai'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {currentQuestion.part === 3 && (
                  <div className="space-y-4 pt-6">
                    <p className="text-xs md:text-sm text-slate-500 font-bold uppercase">Nhập kết quả số của bạn:</p>
                    <input 
                      type="text"
                      inputMode="decimal"
                      value={initialAnswers[currentQuestion.id] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^-?\d*[,.]?\d*$/.test(val)) {
                          onAnswer(currentQuestion.id, val);
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-2xl font-black text-white focus:border-blue-600 outline-none transition-all placeholder:text-slate-800"
                      placeholder="0.00"
                    />
                    <p className="text-xs md:text-sm text-slate-600 italic">* Lưu ý quy tắc làm tròn số theo yêu cầu của đề bài.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-12 border-t border-slate-900">
              <button 
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-2 text-slate-500 hover:text-white disabled:opacity-0 transition-colors font-bold"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
                Câu trước
              </button>
              <button 
                onClick={() => setCurrentIndex(prev => Math.min(test.questions.length - 1, prev + 1))}
                disabled={currentIndex === test.questions.length - 1}
                className="flex items-center gap-2 text-blue-500 hover:text-blue-400 disabled:opacity-0 transition-colors font-bold"
              >
                Câu tiếp theo
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Cheat Alert Modal */}
      <AnimatePresence>
        {showCheatAlert && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-red-600/50 p-8 rounded-3xl max-w-md text-center space-y-6 shadow-2xl shadow-red-900/20"
            >
              <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto">
                <ShieldAlert className="text-red-600 w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">CẢNH BÁO GIAN LẬN</h3>
              <p className="text-slate-400 leading-relaxed">
                Bạn vừa rời khỏi tab phòng thi. Hệ thống đã ghi nhận hành vi này. 
                Vui lòng tập trung tuyệt đối vào bài làm để đảm bảo tính công bằng.
              </p>
              <button 
                onClick={() => setShowCheatAlert(false)}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
              >
                Tôi đã hiểu và quay lại thi
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resume Draft Modal */}
      <AnimatePresence>
        {showResumeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[300] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Archive className="text-blue-500 w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">BÀI LÀM ĐANG DỞ</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Bạn có một phiên làm bài chưa nộp cho chuyên đề <strong className="text-white">{test.topic}</strong>. Bạn muốn tiếp tục làm hay bắt đầu lại từ đầu?
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button 
                  onClick={() => handleResumeChoice('reset')}
                  className="bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold transition-all text-sm uppercase tracking-widest"
                >
                  Bắt đầu lại
                </button>
                <button 
                  onClick={() => handleResumeChoice('resume')}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all text-sm uppercase tracking-widest shadow-lg shadow-blue-500/20"
                >
                  Làm tiếp
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProExamExperience;
