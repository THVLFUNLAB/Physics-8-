import React, { useEffect, useState, useMemo } from 'react';
import { db, doc, getDoc, updateDoc } from '../firebase';
import { ExamReport, Exam } from '../types';
import { GoogleGenAI } from '@google/genai';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from 'recharts';
import { 
  TrendingUp, Users, AlertTriangle, Crosshair, HelpCircle, Activity, Sparkles, Loader2 
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const MacroAnalyticsDashboard: React.FC<{ examId: string; isAdmin?: boolean }> = ({ examId, isAdmin = false }) => {
  const [report, setReport] = useState<ExamReport | null>(null);
  const [examContent, setExamContent] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // LƯU Ý CHI PHÍ API: Component này chỉ gọi ĐÚNG 1 Query GET duy nhất (Hoặc 2 nếu cần lấy nội dung đề cho AI).
  useEffect(() => {
    const fetchMacroReport = async () => {
      try {
        setLoading(true);
        const docSnap = await getDoc(doc(db, 'exam_reports', examId));
        if (docSnap.exists()) {
          setReport({ id: docSnap.id, ...docSnap.data() } as ExamReport);
        } else {
          setError('Chưa có dữ liệu chẩn đoán cho mã đề này (Cần ít nhất 1 lần nhập điểm Offline).');
        }
      } catch (err) {
        console.error("Error fetching report: ", err);
        setError('Có lỗi xảy ra khi tải dữ liệu báo cáo.');
      } finally {
        setLoading(false);
      }
    };
    if (examId) fetchMacroReport();
  }, [examId]);

  // Transform Data cho Recharts
  const scoreData = useMemo(() => {
    if (!report?.scoreDistribution) return [];
    const colorMap: Record<string, string> = {
      "0-2": "#ef4444", // red-500
      "2-4": "#f97316", // orange-500
      "4-6": "#eab308", // yellow-500
      "6-8": "#06b6d4", // cyan-500
      "8-10": "#10b981", // emerald-500
    };
    return Object.entries(report.scoreDistribution).map(([range, count]) => ({
      range, 
      count,
      fill: colorMap[range] || "#6366f1"
    }));
  }, [report]);

  // Top 5 Câu Sai Nhiều Nhất
  const topWrongQuestions = useMemo(() => {
    if (!report?.questionStats) return [];
    return Object.entries(report.questionStats)
      .map(([qId, stats]) => ({
        qId,
        wrongCount: stats.wrong,
        accuracy: stats.accuracy
      }))
      .sort((a, b) => b.wrongCount - a.wrongCount)
      .slice(0, 5); // Take top 5
  }, [report]);

  // ── AI TREATMENT PLAN GENERATOR ──
  const generateAiTreatmentPlan = async () => {
    if (!report || topWrongQuestions.length === 0) return;
    
    setAiLoading(true);
    setAiError('');

    try {
      // Lazy load nội dung Đề thi (chỉ gọi 1 read database khi cần nguyên văn câu hỏi)
      let currentExamDoc = examContent;
      if (!currentExamDoc) {
        const docSnap = await getDoc(doc(db, 'exams', examId));
        if (!docSnap.exists()) {
          throw new Error('Không tìm thấy nội dung đề thi gốc.');
        }
        currentExamDoc = docSnap.data() as Exam;
        setExamContent(currentExamDoc);
      }

      // Trích xuất đúng Text của 5 câu hỏi sai nhiều nhất
      const top5Contents = topWrongQuestions.map(wq => {
        // qId lưu dạng "q1", "q2" tương đương index 0, 1...
        const idxMatch = wq.qId.match(/\d+/);
        if (idxMatch && currentExamDoc?.questions) {
          const index = parseInt(idxMatch[0], 10) - 1;
          const q = currentExamDoc.questions[index];
          if (q) {
            const docParse = new DOMParser().parseFromString(q.content, 'text/html');
            const cleanText = docParse.body.textContent || "";
            return `[${wq.qId}] (Tỉ lệ sai: ${100 - wq.accuracy}%) Chủ đề: ${q.topic} - Cấp độ: ${q.level}\nNội dung: ${cleanText.substring(0, 500)}`;
          }
        }
        return `[${wq.qId}] Không nạp được nội dung.`;
      }).join('\n\n');

      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chưa cài đặt VITE_GEMINI_API_KEY");

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Đóng vai chuyên gia Vật lý. Dựa vào 5 câu hỏi học sinh làm sai nhiều nhất này, hãy chỉ ra 2 lỗ hổng kiến thức cốt lõi và sinh ra 3 bài tập tự luận tương tự ở mức độ dễ hơn một chút để giáo viên cho học sinh ôn tập. Trả về định dạng Markdown ngắn gọn.
      
      Danh sách câu hỏi làm sai: 
      ${top5Contents}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const resultText = response.text || "Không thể sinh phác đồ.";
      
      // Update Firebase Caching 
      await updateDoc(doc(db, 'exam_reports', examId), {
        ai_treatment_plan: resultText
      });

      // Update Local State
      setReport({ ...report, ai_treatment_plan: resultText });

    } catch (err: any) {
      console.error("AI Error:", err);
      setAiError(err.message || 'Lỗi khi gọi Gemini API.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-3xl">
        <Activity className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl text-center">
        <HelpCircle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
        <p className="text-amber-500 font-bold">{error}</p>
        <p className="text-slate-500 text-sm mt-2">
          Sau khi trợ giảng Lưu Bảng Điểm, biểu đồ tự động hiển thị tại đây chỉ với 1 Query Document.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       {/* ── MACRO METRICS HEADER ── */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
             <div className="p-2 bg-indigo-500/10 rounded-xl mb-2">
               <Users className="w-6 h-6 text-indigo-400" />
             </div>
             <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Sĩ Số Tham Gia</p>
             <p className="text-2xl font-black text-white">{report.totalParticipants}</p>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
             <div className="p-2 bg-emerald-500/10 rounded-xl mb-2">
               <TrendingUp className="w-6 h-6 text-emerald-400" />
             </div>
             <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Điểm Trung Bình</p>
             <p className="text-2xl font-black text-emerald-400">{report.averageScore?.toFixed(2)}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
             <div className="p-2 bg-red-500/10 rounded-xl mb-2">
               <AlertTriangle className="w-6 h-6 text-red-400" />
             </div>
             <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">&lt; 5 Điểm</p>
             <p className="text-2xl font-black text-red-400">
                {((report.scoreDistribution["0-2"] || 0) + (report.scoreDistribution["2-4"] || 0))}
             </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
             <div className="p-2 bg-cyan-500/10 rounded-xl mb-2">
               <Crosshair className="w-6 h-6 text-cyan-400" />
             </div>
             <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Tỉ Lệ Đạt (&gt; 5)</p>
             <p className="text-2xl font-black text-cyan-400">
                {report.totalParticipants > 0 
                  ? Math.round(100 - (((report.scoreDistribution["0-2"] || 0) + (report.scoreDistribution["2-4"] || 0)) / report.totalParticipants) * 100) 
                  : 0}%
             </p>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* ── BIEU DO PHO DIEM ── */}
         <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
           <h3 className="text-lg font-black text-white mb-6 uppercase tracking-tighter flex items-center gap-2">
             <Activity className="w-5 h-5 text-indigo-400" />
             Phổ điểm tông quan
           </h3>
           <div className="h-[250px] w-full">
             {scoreData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={scoreData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                   <XAxis dataKey="range" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                   <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                   <Tooltip 
                     cursor={{fill: '#1e293b'}} 
                     contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                     itemStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                   />
                   <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                     {scoreData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={entry.fill} />
                     ))}
                   </Bar>
                 </BarChart>
               </ResponsiveContainer>
             ) : (
                <div className="flex h-full items-center justify-center text-slate-600">Chưa có đủ phổ điểm</div>
             )}
           </div>
         </div>

         {/* ── CAU HOI VA CHUYEN DE SAI NHIEU NHAT ── */}
         <div className="space-y-6">
            {/* Top 5 Cau Sai */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
               <div className="bg-red-500/10 px-6 py-4 border-b border-red-500/20">
                 <h3 className="text-sm font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> 
                    Top 5 Bẫy Câu Hỏi (Sai Nhều Nhất)
                 </h3>
               </div>
               <div className="p-4">
                 {topWrongQuestions.length > 0 ? (
                   <div className="space-y-3">
                     {topWrongQuestions.map((q, idx) => (
                       <motion.div 
                         initial={{ opacity: 0, x: -10 }} 
                         animate={{ opacity: 1, x: 0 }} 
                         transition={{ delay: idx * 0.1 }}
                         key={q.qId} 
                         className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl"
                       >
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 font-black flex items-center justify-center text-sm border border-red-500/30">
                               #{idx + 1}
                             </div>
                             <div>
                               <p className="text-sm font-bold text-white uppercase">{q.qId}</p>
                               <p className="text-[10px] text-slate-400">Tỉ lệ đúng: {q.accuracy}%</p>
                             </div>
                          </div>
                          <div className="text-right">
                             <p className="text-sm font-black text-red-400">{q.wrongCount} hs</p>
                             <p className="text-[10px] text-slate-500">làm sai</p>
                          </div>
                       </motion.div>
                     ))}
                   </div>
                 ) : (
                   <p className="text-center text-slate-500 text-sm py-4">Chưa có đủ số liệu bẫy câu hỏi.</p>
                 )}
               </div>

               {/* ── NÚT GỌI AI & KẾT QUẢ AI (CHỈ ADMIN THẤY/DÙNG) ── */}
               {isAdmin && (
                 <div className="bg-indigo-900/20 border-t border-indigo-500/20 p-4">
                   {report.ai_treatment_plan ? (
                     <div className="bg-indigo-950/40 rounded-xl p-4 border border-indigo-500/30">
                       <h4 className="text-indigo-400 font-black uppercase text-xs mb-3 flex items-center gap-2">
                         <Sparkles className="w-4 h-4" /> 
                         Phác đồ ôn tập (AI Gemini sinh)
                       </h4>
                       <div className="prose prose-invert prose-sm max-w-none text-slate-300 markdown-body">
                         <ReactMarkdown 
                           remarkPlugins={[remarkMath]} 
                           rehypePlugins={[rehypeKatex]}
                         >
                           {report.ai_treatment_plan}
                         </ReactMarkdown>
                       </div>
                     </div>
                   ) : (
                     <div>
                       <button
                         onClick={generateAiTreatmentPlan}
                         disabled={aiLoading || topWrongQuestions.length === 0}
                         className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {aiLoading ? (
                           <>
                             <Loader2 className="w-5 h-5 animate-spin" />
                             Đang nạp dữ liệu & suy luận AI...
                           </>
                         ) : (
                           <>
                             <Sparkles className="w-5 h-5" />
                             Nhờ AI phân tích phác đồ ôn tập
                           </>
                         )}
                       </button>
                       {aiError && <p className="text-red-400 text-xs mt-2 text-center">{aiError}</p>}
                     </div>
                   )}
                 </div>
               )}
            </div>

            {/* Chuyen De Yeu (Lay tu WeakTopics nếu có) */}
            {report.weakTopics && report.weakTopics.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4">
                 <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-4">
                    ⚠️ Mảng Chuyên Đề Yếu Cần Ôn Tập Lên Bảng
                 </h3>
                 <div className="space-y-2">
                    {report.weakTopics.map((topic, tIdx) => (
                      <div key={tIdx} className="flex justify-between items-center p-2 border-b border-slate-800/60 last:border-0">
                         <span className="text-xs font-bold text-slate-300">{topic.topic}</span>
                         <span className="text-xs font-black text-amber-400">{topic.averagePerformance} đ</span>
                      </div>
                    ))}
                 </div>
              </div>
            )}
         </div>
       </div>
    </div>
  );
};
