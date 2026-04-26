import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, query, where, getDocs, orderBy } from '../firebase';
import { Exam, Attempt, UserProfile } from '../types';
import { X, CheckCircle2, CircleDashed, Users, Medal, Clock, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from './Toast';

interface ExamResultsModalProps {
  exam: Exam;
  onClose: () => void;
}

interface StudentResult {
  userId: string;
  displayName: string;
  email: string;
  className?: string;
  bestScore?: number;
  attemptsCount: number;
  lastAttemptTime?: any;
}

export const ExamResultsModal: React.FC<ExamResultsModalProps> = ({ exam, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'completed' | 'incomplete'>('completed');
  
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  
  // Nút reload dữ liệu
  const fetchResults = async () => {
    if (!exam.id) return;
    setLoading(true);
    try {
      // 1. Fetch toàn bộ học sinh (role === 'student')
      const qUsers = query(collection(db, 'users'), where('role', '==', 'student'));
      const snapUsers = await getDocs(qUsers);
      const fetchedStudents = snapUsers.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      
      // 2. Fetch toàn bộ attempt của exam này
      // Note: attempt lưu testId = exam.id hoặc examId = exam.id tùy phiên bản. Query testId trước.
      const qAttempts1 = query(collection(db, 'attempts'), where('testId', '==', exam.id));
      const snapAttempts1 = await getDocs(qAttempts1);
      let fetchedAttempts = snapAttempts1.docs.map(d => ({ id: d.id, ...d.data() } as Attempt));
      
      // Nếu có dùng 'examId' ở một số bản cũ
      if (fetchedAttempts.length === 0) {
        const qAttempts2 = query(collection(db, 'attempts'), where('examId', '==', exam.id));
        const snapAttempts2 = await getDocs(qAttempts2);
        if (!snapAttempts2.empty) {
          fetchedAttempts = snapAttempts2.docs.map(d => ({ id: d.id, ...d.data() } as Attempt));
        }
      }
      
      setStudents(fetchedStudents);
      setAttempts(fetchedAttempts);
    } catch (error) {
      console.error('Lỗi khi fetch kết quả:', error);
      toast.error('Không thể tải danh sách kết quả. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [exam.id]);

  // Map dữ liệu học sinh với điểm số
  const mappedResults = useMemo(() => {
    const completed: StudentResult[] = [];
    const incomplete: StudentResult[] = [];

    // Nhóm attempts theo userId
    const attemptMap = new Map<string, Attempt[]>();
    for (const a of attempts) {
      if (!attemptMap.has(a.userId)) {
        attemptMap.set(a.userId, []);
      }
      attemptMap.get(a.userId)!.push(a);
    }

    for (const st of students) {
      const userAttempts = attemptMap.get(st.uid);
      if (userAttempts && userAttempts.length > 0) {
        // Tìm best score và last timestamp
        const bestScore = Math.max(...userAttempts.map(a => a.score || 0));
        // Lấy attempt gần nhất
        const lastAttempt = userAttempts.sort((a, b) => {
           const tA = a.timestamp?.seconds || 0;
           const tB = b.timestamp?.seconds || 0;
           return tB - tA;
        })[0];
        
        completed.push({
          userId: st.uid,
          displayName: st.displayName || 'Học sinh chưa đặt tên',
          email: st.email,
          className: st.className,
          bestScore,
          attemptsCount: userAttempts.length,
          lastAttemptTime: lastAttempt.timestamp
        });
      } else {
        incomplete.push({
          userId: st.uid,
          displayName: st.displayName || 'Học sinh chưa đặt tên',
          email: st.email,
          className: st.className,
          attemptsCount: 0
        });
      }
    }
    
    // Sort completed by score (desc), then by name
    completed.sort((a, b) => {
      if ((b.bestScore || 0) !== (a.bestScore || 0)) {
        return (b.bestScore || 0) - (a.bestScore || 0);
      }
      return a.displayName.localeCompare(b.displayName);
    });
    
    // Sort incomplete by name
    incomplete.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { completed, incomplete };
  }, [students, attempts]);

  const formatDate = (ts: any): string => {
    if (!ts) return '—';
    const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* HEADER */}
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-black text-white flex items-center gap-2 tracking-widest uppercase">
              <Users className="text-fuchsia-500" /> Kết Quả Đề Thi
            </h3>
            <p className="text-sm font-bold text-slate-400 mt-1 truncate max-w-[300px] sm:max-w-lg">
              {exam.title}
            </p>
          </div>
          <div className="flex items-center gap-2">
             <button 
                onClick={fetchResults}
                disabled={loading}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                title="Tải lại dữ liệu"
             >
                <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
             </button>
             <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
               <X className="w-6 h-6" />
             </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
            <div className="w-10 h-10 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-bold animate-pulse">Đang quét dữ liệu học sinh...</p>
          </div>
        ) : (
          <>
            {/* TABS */}
            <div className="flex gap-4 p-4 border-b border-slate-800 shrink-0 bg-slate-900">
              <button
                onClick={() => setActiveTab('completed')}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-3 rounded-2xl transition-all border",
                  activeTab === 'completed'
                    ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/20"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-black uppercase tracking-widest text-sm">Đã làm bài</span>
                </div>
                <span className="text-xl font-black">{mappedResults.completed.length} <span className="text-xs font-bold opacity-70">HS</span></span>
              </button>
              
              <button
                onClick={() => setActiveTab('incomplete')}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-3 rounded-2xl transition-all border",
                  activeTab === 'incomplete'
                    ? "bg-rose-600/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.1)]"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-rose-400 hover:border-rose-500/20"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CircleDashed className="w-5 h-5" />
                  <span className="font-black uppercase tracking-widest text-sm">Chưa làm</span>
                </div>
                <span className="text-xl font-black">{mappedResults.incomplete.length} <span className="text-xs font-bold opacity-70">HS</span></span>
              </button>
            </div>

            {/* LIST */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-950">
              {activeTab === 'completed' ? (
                 <div className="space-y-3">
                    {mappedResults.completed.length === 0 ? (
                       <div className="text-center py-12 text-slate-600">
                          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                          <p className="font-bold">Chưa có học sinh nào hoàn thành đề này.</p>
                       </div>
                    ) : (
                       mappedResults.completed.map((st, idx) => (
                          <div key={st.userId} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors">
                             <div className="w-8 font-black text-slate-600 text-lg">#{idx + 1}</div>
                             <div className="flex-1">
                                <p className="font-bold text-white text-base flex items-center gap-2">
                                  {st.displayName}
                                  {st.className && (
                                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{st.className}</span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-500">{st.email}</p>
                             </div>
                             <div className="flex items-center gap-6 shrink-0 mt-2 sm:mt-0 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800/50">
                                <div className="text-right">
                                   <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1 flex items-center justify-end gap-1"><Medal className="w-3 h-3"/> Điểm cao nhất</p>
                                   <p className="text-xl font-black text-emerald-400">{(st.bestScore || 0).toFixed(2)}</p>
                                </div>
                                <div className="w-px h-8 bg-slate-800 hidden sm:block"></div>
                                <div className="text-right">
                                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center justify-end gap-1"><Clock className="w-3 h-3"/> Lần nộp cuối</p>
                                   <p className="text-xs font-bold text-slate-300">{formatDate(st.lastAttemptTime)}</p>
                                   <p className="text-[9px] text-slate-500 italic mt-0.5">Số lần thử: {st.attemptsCount}</p>
                                </div>
                             </div>
                          </div>
                       ))
                    )}
                 </div>
              ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {mappedResults.incomplete.length === 0 ? (
                       <div className="col-span-full text-center py-12 text-slate-600">
                          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                          <p className="font-bold">Tuyệt vời! Tất cả học sinh đều đã làm bài.</p>
                       </div>
                    ) : (
                       mappedResults.incomplete.map((st, idx) => (
                          <div key={st.userId} className="flex items-center gap-3 bg-slate-900 border border-rose-500/10 rounded-2xl p-3 hover:border-rose-500/30 transition-colors">
                             <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-300 text-sm truncate flex items-center gap-2">
                                  {st.displayName}
                                  {st.className && (
                                    <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-md shrink-0">{st.className}</span>
                                  )}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">{st.email}</p>
                             </div>
                          </div>
                       ))
                    )}
                 </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
