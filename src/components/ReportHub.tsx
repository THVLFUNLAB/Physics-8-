import React, { useState, useEffect } from 'react';
import { db, collection, query, where, getDocs, updateDoc, doc, getDoc, setDoc, addDoc, Timestamp } from '../firebase';
import { Question, ReportedQuestion, UserProfile } from '../types';
import { Flag, Check, X, AlertTriangle, Edit3, Trash2, ArrowRight } from 'lucide-react';
import MathRenderer from '../lib/MathRenderer';
import { cn } from '../lib/utils';
import MDEditor from '@uiw/react-md-editor';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

export default function ReportHub() {
  const [reports, setReports] = useState<(ReportedQuestion & { questionData?: Question })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'reportedQuestions'), where('status', '==', 'pending'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReportedQuestion));
      
      // Fetch associated questions
      const reportsWithQuestions = await Promise.all(data.map(async (rep) => {
        const qDoc = await getDoc(doc(db, 'questions', rep.questionId));
        if (qDoc.exists()) {
          return { ...rep, questionData: { id: qDoc.id, ...qDoc.data() } as Question };
        }
        return rep;
      }));
      setReports(reportsWithQuestions);
    } catch (e) {
      console.error(e);
      alert('Lỗi tải báo cáo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleEditClick = (report: ReportedQuestion & { questionData?: Question }) => {
    if (report.questionData) {
      setEditingQuestion({ ...report.questionData });
      setActiveReportId(report.id || null);
    }
  };

  const handleSaveAndResolve = async () => {
    if (!editingQuestion || !editingQuestion.id || !activeReportId) return;
    setSyncing(true);
    try {
      // Get the old question to calculate diffs
      const oldQuestion = reports.find(r => r.id === activeReportId)?.questionData;
      if (!oldQuestion) throw new Error("Missing old question data for regrading");

      // 1. Regrade (Tính lại điểm cho tất cả attempt có câu hỏi này)
      await regradeAttempts(oldQuestion, editingQuestion);

      // 2. Update Question in DB
      await updateDoc(doc(db, 'questions', editingQuestion.id), { ...editingQuestion });
      
      // 3. Resolve Report
      await updateDoc(doc(db, 'reportedQuestions', activeReportId), {
        status: 'resolved',
        resolvedAt: Timestamp.now()
      });

      alert('Đã cập nhật câu hỏi và chấm lại điểm thành công!');
      setEditingQuestion(null);
      setActiveReportId(null);
      fetchReports();
    } catch (e) {
      console.error('Lỗi khi lưu và chấm lại:', e);
      alert('Có lỗi xảy ra. Hãy thử lại.');
    } finally {
      setSyncing(false);
    }
  };

  const getQuestionScore = (q: Question, studentAns: any) => {
    if (studentAns === undefined || studentAns === null || studentAns === '') return 0;
    if (q.part === 1) {
      return studentAns === q.correctAnswer ? 0.25 : 0;
    }
    if (q.part === 2) {
      if (!Array.isArray(studentAns)) return 0;
      let correctCount = 0;
      for (let i = 0; i < 4; i++) {
        if (studentAns[i] !== undefined && studentAns[i] === (q.correctAnswer as boolean[])[i]) {
          correctCount++;
        }
      }
      if (correctCount === 4) return 1.0;
      if (correctCount === 3) return 0.5;
      if (correctCount === 2) return 0.25;
      if (correctCount === 1) return 0.1;
      return 0;
    }
    if (q.part === 3) {
      const sv = parseFloat(String(studentAns).replace(',', '.'));
      const cv = parseFloat(String(q.correctAnswer).replace(',', '.'));
      return !isNaN(sv) && Math.abs(sv - cv) < 0.01 ? 0.25 : 0;
    }
    return 0;
  };

  const regradeAttempts = async (oldQ: Question, newQ: Question) => {
    const attemptsSnap = await getDocs(collection(db, 'attempts'));
    const attempts = attemptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    for (const attempt of attempts) {
      if (attempt.answers && attempt.answers[newQ.id!]) {
        const studentAns = attempt.answers[newQ.id!];
        
        const oldScoreForQ = getQuestionScore(oldQ, studentAns);
        const newScoreForQ = getQuestionScore(newQ, studentAns);
        const ptDiff = newScoreForQ - oldScoreForQ;
        
        if (Math.abs(ptDiff) > 0.001) {
          const newTotalScore = Math.max(0, attempt.score + ptDiff);
          
          await updateDoc(doc(db, 'attempts', attempt.id), {
            score: newTotalScore
          });

          // Push notification to user
          const userRef = doc(db, 'users', attempt.userId);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data() as UserProfile;
            const notifs = userData.notifications || [];
            
            const actionText = ptDiff > 0 ? `CỘNG ${ptDiff.toFixed(2)} điểm` : `TRỪ ${Math.abs(ptDiff).toFixed(2)} điểm`;
            const type = ptDiff > 0 ? 'success' : 'warning';
            
            notifs.push({
              id: `regrade_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              title: `Biến động điểm số: ${actionText}`,
              message: `Thầy đã sửa lỗi câu hỏi trong bài ${attempt.testId}. Điểm của bạn được ${actionText}. Điểm mới: ${newTotalScore.toFixed(2)}`,
              type: type as any,
              read: false,
              timestamp: Timestamp.now()
            });
            await updateDoc(userRef, { notifications: notifs });
          }
        }
      }
    }
  };
  


  const PREVIEW_OPTIONS = {
    rehypePlugins: [[rehypeKatex]] as any,
    remarkPlugins: [[remarkMath]] as any,
  };

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight font-headline">
        <Flag className="text-amber-500 w-8 h-8" />
        DUYỆT BÁO LỖI (REPORT HUB)
      </h2>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
          <Check className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Hệ thống sạch bóng lỗi!</h3>
          <p className="text-slate-400">Không có báo cáo nào đang chờ duyệt.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-amber-500/20">
                  {report.reason}
                </span>
                <span className="text-xs text-slate-500 font-bold">{new Date().toLocaleDateString('vi-VN')}</span>
              </div>
              
              <div className="text-sm font-bold text-slate-300 mb-2">Học sinh: <span className="text-white">{report.studentName}</span></div>
              
              {report.message && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 mb-4 text-xs text-slate-300 italic">
                  <span className="font-bold text-amber-500 mr-2">Ghi chú:</span>
                  {report.message}
                </div>
              )}
              
              <div className="flex-1 bg-slate-950 rounded-xl p-4 mb-6 border border-slate-800/50 overflow-hidden relative">
                {report.questionData ? (
                  <div className="text-sm text-slate-400 line-clamp-3">
                    <MathRenderer content={report.questionData.content || ''} />
                  </div>
                ) : (
                  <div className="text-rose-500 flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4" /> Câu hỏi đã bị xóa
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
              </div>

              <button 
                onClick={() => handleEditClick(report)}
                disabled={!report.questionData}
                className="w-full bg-slate-800 hover:bg-amber-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all gap-2 flex items-center justify-center disabled:opacity-50"
              >
                <Edit3 className="w-4 h-4" /> Xem & Fix Lỗi
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-widest">
                <Edit3 className="text-amber-500" /> Sửa lại Câu Hỏi & Cập Nhật Điểm
              </h3>
              <button onClick={() => setEditingQuestion(null)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Nội dung câu hỏi</label>
                <div data-color-mode="dark">
                  <MDEditor
                    value={editingQuestion.content}
                    onChange={(val) => setEditingQuestion({...editingQuestion, content: val || ''})}
                    previewOptions={PREVIEW_OPTIONS}
                    height={200}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-800">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Đáp án đúng</label>
                
                {editingQuestion.part === 1 && editingQuestion.options && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {editingQuestion.options.map((opt, i) => (
                      <div key={i} className={cn(
                        "p-4 rounded-2xl border cursor-pointer flex flex-col gap-2 transition-all",
                        editingQuestion.correctAnswer === i ? "bg-emerald-500/10 border-emerald-500" : "bg-slate-950 border-slate-800"
                      )} onClick={() => setEditingQuestion({...editingQuestion, correctAnswer: i})}>
                         <span className="w-6 h-6 rounded-md bg-slate-900 flex items-center justify-center font-bold text-xs">{String.fromCharCode(65 + i)}</span>
                         <div className="text-xs text-slate-300 line-clamp-3"><MathRenderer content={opt}/></div>
                      </div>
                    ))}
                  </div>
                )}

                {editingQuestion.part === 2 && editingQuestion.options && (
                  <div className="space-y-3">
                    {editingQuestion.options.map((opt, i) => {
                      const isTrue = (editingQuestion.correctAnswer as boolean[])[i];
                      return (
                        <div key={i} className="flex gap-4 items-center bg-slate-950 p-4 rounded-2xl border border-slate-800">
                           <div className="flex-1 text-sm"><MathRenderer content={opt}/></div>
                           <button onClick={() => {
                             const newAns = [...(editingQuestion.correctAnswer as boolean[])];
                             newAns[i] = !isTrue;
                             setEditingQuestion({...editingQuestion, correctAnswer: newAns});
                           }} className={cn("px-4 py-2 rounded-xl text-xs font-bold w-24 text-center", isTrue ? "bg-emerald-500 text-slate-950" : "bg-rose-500 text-white")}>
                             {isTrue ? "ĐÚNG" : "SAI"}
                           </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {editingQuestion.part === 3 && (
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-950 border border-slate-800 px-6 py-4 rounded-2xl text-2xl font-black text-center text-white"
                    value={editingQuestion.correctAnswer as number}
                    onChange={(e) => setEditingQuestion({...editingQuestion, correctAnswer: parseFloat(e.target.value) || 0})}
                  />
                )}
              </div>

            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-950 flex gap-4 justify-end">
               <button onClick={() => setEditingQuestion(null)} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-900">
                 HỦY BO
               </button>
               <button onClick={handleSaveAndResolve} disabled={syncing} className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-8 py-3 rounded-xl font-black tracking-widest uppercase flex items-center gap-2">
                 {syncing ? "ĐANG TIẾN HÀNH..." : <><Check className="w-5 h-5"/> LƯU & REGRADE MỌI HỌC SINH</>}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
