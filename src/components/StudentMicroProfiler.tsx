import React, { useEffect, useState } from 'react';
import { db, collection, query, where, orderBy, limit, getDocs, startAfter, doc, getDoc, updateDoc } from '../firebase';
import { Attempt, UserProfile, Exam, Question } from '../types';
import { GoogleGenAI } from '@google/genai';
import { X, Clock, BrainCircuit, AlertTriangle, Sparkles, Loader2, Target, History, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  student: UserProfile | null;
}

export const StudentMicroProfiler: React.FC<Props> = ({ isOpen, onClose, student }) => {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [loadingTop, setLoadingTop] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // LƯU Ý CHI PHÍ DB: Chống tràn - Limit siêu chặt
  useEffect(() => {
    if (!isOpen || !student) return;
    
    const fetchInitial = async () => {
      setLoadingTop(true);
      setAttempts([]);
      setHasMore(false); // Disable simple pagination when merging
      setErrorMsg('');
      try {
        const q1 = query(
          collection(db, 'attempts'),
          where('userId', '==', student.uid)
        );
        
        const q2 = query(
          collection(db, 'classAttempts'),
          where('studentId', '==', student.uid)
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        const data1 = snap1.docs.map(d => ({ id: d.id, ...d.data() } as Attempt));
        const data2 = snap2.docs.map(d => {
          const ca = d.data();
          return {
            id: d.id,
            userId: ca.studentId,
            testId: ca.classExamId, // Store classExamId here
            answers: ca.answers || {},
            score: ca.score || 0,
            timestamp: ca.submittedAt || ca.startedAt,
            personal_ai_diagnosis: ca.personal_ai_diagnosis,
            isClassAttempt: true
          } as any as Attempt;
        });

        // Merge, sort DESC, and slice top 5
        const merged = [...data1, ...data2].sort((a, b) => {
          const ta = a.timestamp?.seconds || 0;
          const tb = b.timestamp?.seconds || 0;
          return tb - ta;
        }).slice(0, 5);

        setAttempts(merged);
        
        // Disable loadMore when merging for simplicity to avoid complex compound cursors
        setHasMore(false);
      } catch (err) {
        console.error("Lỗi fetch lịch sử:", err);
      } finally {
        setLoadingTop(false);
      }
    };
    fetchInitial();
  }, [isOpen, student]);

  const loadMoreData = async () => {
    // Disabled load more for merged view
  };

  const runMicroDiagnosis = async (attempt: Attempt) => {
    if (analyzingId) return;
    setAnalyzingId(attempt.id);
    setErrorMsg('');

    try {
      // 1. Fetch Đề thi gốc
      let examTargetId = attempt.examId || attempt.testId;
      
      // Nếu là thi Tập Trung (Class), testId lưu classExamId, cần tra cứu sang examId
      if ((attempt as any).isClassAttempt) {
        const cExamSnap = await getDoc(doc(db, 'classExams', attempt.testId));
        if (cExamSnap.exists()) {
          examTargetId = cExamSnap.data().examId;
        }
      }

      if (!examTargetId) throw new Error("Bản ghi không gắn với đề thi.");
      
      const examSnap = await getDoc(doc(db, 'exams', examTargetId));
      if (!examSnap.exists()) throw new Error("Đề thi gốc không còn tồn tại trên hệ thống.");
      const exam = examSnap.data() as Exam;

      // 2. Chấm đè & Lọc "Mâm Khuyết"
      const incorrectQuestions: Question[] = [];
      exam.questions.forEach((q, idx) => {
        const key = `q${idx + 1}`;
        const sAns = attempt.answers[key];
        
        let isCorrect = false;
        if (q.part === 1 || q.part === 3) {
          isCorrect = sAns === q.correctAnswer;
        } else if (q.part === 2) {
          isCorrect = JSON.stringify(sAns) === JSON.stringify(q.correctAnswer);
        }
        
        if (!isCorrect) {
          incorrectQuestions.push(q);
        }
      });

      if (incorrectQuestions.length === 0) {
        throw new Error("Tuyệt vời, học sinh Đạt 10/10 nên không có gì để chẩn đoán.");
      }

      // 3. TỐI ƯU PAYLOAD (CHỐNG TRÀN TOKEN API)
      // a) Nhóm theo chuyên đề (Topic)
      const topicCounts: Record<string, number> = {};
      incorrectQuestions.forEach(q => {
        topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
      });

      const topicSummaryString = Object.entries(topicCounts)
        .map(([topic, count]) => `- Chuyên đề [${topic}]: Làm sai ${count} câu.`)
        .join('\n');

      // b) Chỉ trích Note nội dung TEXT của TỐI ĐA 3 CÂU
      // Ưu tiên các câu thuộc Vận Dụng/Thông Hiểu vì đó là lỗi nền tảng.
      const sampleTexts = incorrectQuestions
        .sort((a, b) => {
           // Giả lập ưu tiên "Thông hiểu/Vận dụng" thay vì "Nhận biết"
           const weight = (lvl: string) => lvl.includes("hiểu") ? 3 : lvl.includes("Vận") ? 2 : 1;
           return weight(b.level) - weight(a.level);
        })
        .slice(0, 3)
        .map(q => {
          const docParse = new DOMParser().parseFromString(q.content, 'text/html');
          return `(Cấp độ: ${q.level}) Nội dung: ${docParse.body.textContent || ""}`;
        })
        .join('\n---\n');

      // 4. Kích hoạt Gemini
      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chưa cài đặt API Key.");
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `ĐÓNG VAI CHUYÊN GIA SƯ PHẠM VẬT LÝ BIÊN SOẠN GIÁO ÁN.
Học sinh vừa làm bài và mắc nhiều lỗi. Dưới đây là Báo cáo cô đọng lỗ hổng:

=== THỐNG KÊ LỖ HỔNG THEO PHÂN MẢNG ===
${topicSummaryString}

=== 3 VÍ DỤ ĐIỂN HÌNH VỀ CÂU HỎI HỌC SINH MẮC BẪY ===
${sampleTexts}

=== YÊU CẦU ===
1. Chẩn đoán nguyên nhân gốc rễ (Root Cause) cực ngắn gọn từ các ví dụ trên.
2. Viết Phác đồ ôn tập (Micro-Prescription) dành riêng cho em học sinh này. Gợi ý 1-2 mẹo nhỏ giải quyết cái lỗi sai đó.
3. Không trả lời miên man, trình bày Markdown sạch sẽ.`;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt
      });

      const resultText = response.text || "Không thể sinh phác đồ.";

      // 5. CACHE WRITE MỘT LẦN VĨNH VIỄN
      const collectionName = (attempt as any).isClassAttempt ? 'classAttempts' : 'attempts';
      await updateDoc(doc(db, collectionName, attempt.id), {
        personal_ai_diagnosis: resultText
      });

      // Update Local State
      setAttempts(prev => prev.map(a => a.id === attempt.id ? { ...a, personal_ai_diagnosis: resultText } : a));

    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi kết nối AI');
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100]" 
          />
          
          {/* Side Drawer */}
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="fixed top-0 right-0 w-full max-w-2xl h-[100dvh] bg-slate-900 border-l border-slate-800 shadow-2xl z-[101] flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              {student ? (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">
                     {student.displayName?.[0]?.toUpperCase() || student.email?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">{student.displayName || "Học sinh"}</h2>
                    <p className="text-sm text-cyan-400 font-bold">{student.email}</p>
                  </div>
                </div>
              ) : <div />}
              
              <button 
                onClick={onClose}
                className="p-3 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
               
               <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                 <History className="w-4 h-4 text-cyan-500" /> Hồ sơ luyện thi
               </h3>

               {loadingTop ? (
                 <div className="flex flex-col items-center justify-center p-12 text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mb-4" />
                    Đang nạp dữ liệu lịch sử...
                 </div>
               ) : attempts.length === 0 ? (
                 <div className="p-8 border border-dashed border-slate-700 rounded-3xl text-center bg-slate-800/20">
                    <Target className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 font-bold">Học sinh chưa hoàn thành đề thi nào.</p>
                 </div>
               ) : (
                 <div className="space-y-6">
                    {attempts.map(attempt => (
                      <div key={attempt.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 hover:border-cyan-500/30 transition-all">
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-2">
                                 <Clock className="w-3.5 h-3.5" />
                                 {attempt.timestamp?.seconds ? new Date(attempt.timestamp.seconds * 1000).toLocaleString('vi-VN') : "Chưa rõ thời gian"}
                               </div>
                               <h4 className="text-lg font-bold text-white mb-1"><span className="text-slate-500">Mã bài thi:</span> {attempt.id.slice(-6).toUpperCase()}</h4>
                               <p className="text-sm text-cyan-400 font-black">Điểm đạt: {attempt.score.toFixed(2)}/10</p>
                            </div>

                            {/* Cục Chẩn Đoán Của Từng Bài */}
                            {!attempt.personal_ai_diagnosis && (
                              <button
                                onClick={() => runMicroDiagnosis(attempt)}
                                disabled={analyzingId === attempt.id}
                                className="px-4 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/30 font-bold rounded-xl text-xs transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/5"
                              >
                                {analyzingId === attempt.id ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" />ĐANG NẠP AI...</>
                                ) : (
                                  <><Sparkles className="w-4 h-4" />CHẨN ĐOÁN LỖ HỔNG</>
                                )}
                              </button>
                            )}
                         </div>

                         {/* Kết quả AI Analysis Render ra ngay lập tức từ Cache */}
                         {attempt.personal_ai_diagnosis && (
                           <motion.div 
                             initial={{ opacity: 0, height: 0 }}
                             animate={{ opacity: 1, height: 'auto' }}
                             className="bg-indigo-950/40 border-l-2 border-indigo-500 rounded-r-xl p-4 mt-4"
                           >
                              <h5 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                                 <BrainCircuit className="w-4 h-4" /> Chuyên gia AI Cố Vấn
                              </h5>
                              <div className="prose prose-invert prose-sm max-w-none text-slate-300 markdown-body marker:text-indigo-400">
                                 <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                    {attempt.personal_ai_diagnosis}
                                 </ReactMarkdown>
                              </div>
                           </motion.div>
                         )}
                      </div>
                    ))}

                    {/* Pagination Load More Button */}
                    {hasMore && (
                      <button
                        onClick={loadMoreData}
                        disabled={loadingMore}
                        className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 font-bold hover:bg-slate-800 hover:text-white hover:border-slate-600 transition-all flex items-center justify-center gap-2"
                      >
                        {loadingMore ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCcw className="w-5 h-5" />}
                        {loadingMore ? "ĐANG TẢI..." : "TẢI THÊM LỊCH SỬ"}
                      </button>
                    )}
                 </div>
               )}

               {errorMsg && (
                 <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-bold text-center flex items-center justify-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {errorMsg}
                 </div>
               )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
