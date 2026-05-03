import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';
import { db, doc, getDoc, updateDoc, addDoc, collection, Timestamp } from '../firebase';
import { ExamReport, Exam, Question } from '../types';
import { GoogleGenAI } from '@google/genai';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from 'recharts';
import { 
  TrendingUp, Users, AlertTriangle, Crosshair, HelpCircle, Activity, 
  Sparkles, Loader2, CheckSquare, Square, PlusCircle, FileText, X, Check, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PrintableExam } from './PrintableExam';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { toast } from './Toast';

// ── Kiểu dữ liệu nội bộ ──────────────────────────────────────────────
interface WrongQuestionRow {
  qId: string;          // "q1", "q2", ...
  wrongCount: number;
  accuracy: number;
  questionData?: Question; // Nội dung đề thi gốc (load lazy)
}

// ── Modal xác nhận tên đề ──────────────────────────────────────────────
interface CreateExamModalProps {
  count: number;
  onConfirm: (title: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

const CreateExamModal: React.FC<CreateExamModalProps> = ({ count, onConfirm, onClose, isLoading }) => {
  const [title, setTitle] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-500/20 rounded-xl">
            <PlusCircle className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-white font-black">Tạo Đề Mới</h3>
            <p className="text-slate-400 text-xs">{count} câu hỏi đã chọn · Trạng thái: <span className="text-amber-400 font-bold">DRAFT</span></p>
          </div>
        </div>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && title.trim() && onConfirm(title.trim())}
          placeholder="Nhập tên đề thi... (VD: Đề Khắc Phục Lỗ Hổng T5/2026)"
          className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none text-sm mb-4 transition-colors"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors text-sm font-bold"
          >
            Hủy
          </button>
          <button
            onClick={() => title.trim() && onConfirm(title.trim())}
            disabled={!title.trim() || isLoading}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isLoading ? 'Đang lưu...' : 'Tạo Đề'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//  COMPONENT CHÍNH
// ═══════════════════════════════════════════════════════════════════════
export const MacroAnalyticsDashboard: React.FC<{ examId: string; isAdmin?: boolean }> = ({ examId, isAdmin = false }) => {
  const [report, setReport] = useState<ExamReport | null>(null);
  const [examContent, setExamContent] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // ── Selection State ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // ── Print / PDF State ──
  const printRef = useRef<HTMLDivElement>(null);
  const [printTitle, setPrintTitle] = useState('');
  const [printQuestions, setPrintQuestions] = useState<Question[]>([]);
  const [isPrintReady, setIsPrintReady] = useState(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: printTitle || 'De-Khac-Phuc',
    onAfterPrint: () => setIsPrintReady(false),
  });

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
        setError('Có lỗi xảy ra khi tải dữ liệu báo cáo.');
      } finally {
        setLoading(false);
      }
    };
    if (examId) fetchMacroReport();
  }, [examId]);

  // Score chart data
  const scoreData = useMemo(() => {
    if (!report?.scoreDistribution) return [];
    const colorMap: Record<string, string> = {
      "0-2": "#ef4444", "2-4": "#f97316", "4-6": "#eab308",
      "6-8": "#06b6d4", "8-10": "#10b981",
    };
    return Object.entries(report.scoreDistribution).map(([range, count]) => ({
      range, count, fill: colorMap[range] || "#6366f1"
    }));
  }, [report]);

  // ── Danh sách TẤT CẢ câu sai (không giới hạn 5) ──
  const allWrongQuestions = useMemo<WrongQuestionRow[]>(() => {
    if (!report?.questionStats) return [];
    return Object.entries(report.questionStats)
      .map(([qId, stats]) => ({ qId, wrongCount: stats.wrong, accuracy: stats.accuracy }))
      .filter(q => q.wrongCount > 0)
      .sort((a, b) => b.wrongCount - a.wrongCount);
  }, [report]);

  // ── Lazy-load nội dung đề khi chọn câu ──
  const ensureExamContent = async (): Promise<Exam | null> => {
    if (examContent) return examContent;
    try {
      const docSnap = await getDoc(doc(db, 'exams', examId));
      if (!docSnap.exists()) return null;
      const data = docSnap.data() as Exam;
      setExamContent(data);
      return data;
    } catch {
      return null;
    }
  };

  // ── Toggle chọn / bỏ chọn ──
  const toggleSelect = (qId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === allWrongQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allWrongQuestions.map(q => q.qId)));
    }
  };

  // ── Hàm lấy danh sách Question từ selectedIds ──
  const resolveSelectedQuestions = async (): Promise<Question[]> => {
    const content = await ensureExamContent();
    if (!content) return [];
    const result: Question[] = [];
    for (const qId of selectedIds) {
      const idxMatch = qId.match(/\d+/);
      if (idxMatch && content.questions) {
        const index = parseInt(idxMatch[0], 10) - 1;
        const q = content.questions[index];
        if (q) result.push(q);
      }
    }
    return result;
  };

  // ── Hàm XUẤT PDF ──────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    const questions = await resolveSelectedQuestions();
    if (questions.length === 0) { toast.error('Không tìm được dữ liệu câu hỏi để in!'); return; }
    const title = examContent?.title || `Đề Khắc Phục ${new Date().toLocaleDateString('vi-VN')}`;
    setPrintTitle(title);
    setPrintQuestions(questions);
    setIsPrintReady(true);
    // Delay nhỏ để React render xong component ẩn trước khi gọi print
    setTimeout(() => { handlePrint(); }, 200);
  };

  // ── Hàm TẠO ĐỀ MỚI ──────────────────────────────────────────────────
  const createNewExamFromSelection = async (examTitle: string) => {
    setCreateLoading(true);
    try {
      const selectedQuestions = await resolveSelectedQuestions();
      if (selectedQuestions.length === 0) throw new Error('Không xác định được câu hỏi từ các ID đã chọn.');
      const content = examContent;

      // Tạo document mới trong collection 'exams' với status DRAFT
      const newExam: Omit<Exam, 'id'> = {
        title: examTitle,
        type: 'Custom',
        questions: selectedQuestions,
        published: false, // ← DRAFT: Admin phải duyệt trước khi public
        createdBy: 'admin',
        createdAt: Timestamp.now(),
        targetGrade: content?.targetGrade,
        sourceFile: `Tạo từ đề "${content?.title || examId}" — ${selectedQuestions.length} câu sai nhiều nhất`,
      };

      const docRef = await addDoc(collection(db, 'exams'), newExam);

      toast.success(`✅ Đã tạo đề DRAFT "${examTitle}" (${selectedQuestions.length} câu) — ID: ${docRef.id}`);
      setShowModal(false);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error('Lỗi tạo đề: ' + (err.message || String(err)));
    } finally {
      setCreateLoading(false);
    }
  };

  // ── AI Treatment Plan ────────────────────────────────────────────────
  const generateAiTreatmentPlan = async () => {
    if (!report || allWrongQuestions.length === 0) return;
    setAiLoading(true);
    setAiError('');
    try {
      const content = await ensureExamContent();
      const top5 = allWrongQuestions.slice(0, 5);
      const top5Contents = top5.map(wq => {
        const idxMatch = wq.qId.match(/\d+/);
        if (idxMatch && content?.questions) {
          const index = parseInt(idxMatch[0], 10) - 1;
          const q = content.questions[index];
          if (q) {
            const cleanText = new DOMParser().parseFromString(q.content, 'text/html').body.textContent || "";
            return `[${wq.qId}] (Sai ${100 - wq.accuracy}%) ${q.topic} — ${q.level}\n${cleanText.substring(0, 400)}`;
          }
        }
        return `[${wq.qId}] N/A`;
      }).join('\n\n');

      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chưa cài đặt VITE_GEMINI_API_KEY");
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Đóng vai chuyên gia Vật lý. Dựa vào 5 câu hỏi học sinh làm sai nhiều nhất sau đây, hãy chỉ ra 2 lỗ hổng kiến thức cốt lõi và sinh ra 3 bài tập tự luận tương tự ở mức độ dễ hơn để giáo viên cho học sinh ôn tập. Trả về Markdown ngắn gọn.\n\n${top5Contents}`;
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const resultText = response.text || "Không thể sinh phác đồ.";
      await updateDoc(doc(db, 'exam_reports', examId), { ai_treatment_plan: resultText });
      setReport({ ...report, ai_treatment_plan: resultText });
    } catch (err: any) {
      setAiError(err.message || 'Lỗi khi gọi Gemini API.');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Loading / Error states ───────────────────────────────────────────
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
        <p className="text-slate-500 text-sm mt-2">Sau khi trợ giảng Lưu Bảng Điểm, biểu đồ tự động hiển thị tại đây.</p>
      </div>
    );
  }

  const allSelected = selectedIds.size === allWrongQuestions.length && allWrongQuestions.length > 0;

  return (
    <div className="space-y-6">
      {/* ── MODAL ── */}
      <AnimatePresence>
        {showModal && (
          <CreateExamModal
            count={selectedIds.size}
            onConfirm={createNewExamFromSelection}
            onClose={() => setShowModal(false)}
            isLoading={createLoading}
          />
        )}
      </AnimatePresence>

      {/* ── MACRO METRICS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
          <div className="p-2 bg-indigo-500/10 rounded-xl mb-2"><Users className="w-6 h-6 text-indigo-400" /></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Sĩ Số</p>
          <p className="text-2xl font-black text-white">{report.totalParticipants}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
          <div className="p-2 bg-emerald-500/10 rounded-xl mb-2"><TrendingUp className="w-6 h-6 text-emerald-400" /></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">ĐTB</p>
          <p className="text-2xl font-black text-emerald-400">{report.averageScore?.toFixed(2)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
          <div className="p-2 bg-red-500/10 rounded-xl mb-2"><AlertTriangle className="w-6 h-6 text-red-400" /></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">&lt; 5 Điểm</p>
          <p className="text-2xl font-black text-red-400">
            {((report.scoreDistribution?.["0-2"] || 0) + (report.scoreDistribution?.["2-4"] || 0))}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
          <div className="p-2 bg-cyan-500/10 rounded-xl mb-2"><Crosshair className="w-6 h-6 text-cyan-400" /></div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Tỉ Lệ Đạt</p>
          <p className="text-2xl font-black text-cyan-400">
            {report.totalParticipants > 0
              ? Math.round(100 - (((report.scoreDistribution?.["0-2"] || 0) + (report.scoreDistribution?.["2-4"] || 0)) / report.totalParticipants) * 100)
              : 0}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── PHỔ ĐIỂM ── */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-black text-white mb-6 uppercase tracking-tighter flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Phổ điểm tổng quan
          </h3>
          <div className="h-[250px] w-full">
            {scoreData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="range" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#1e293b' }}
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

        {/* ── DANH SÁCH CÂU SAI + SELECTION ── */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            {/* Header */}
            <div className="bg-red-500/10 px-6 py-4 border-b border-red-500/20 flex items-center justify-between">
              <h3 className="text-sm font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Bẫy Câu Hỏi (Sai Nhiều Nhất)
              </h3>
              {isAdmin && allWrongQuestions.length > 0 && (
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  {allSelected
                    ? <><CheckSquare className="w-3.5 h-3.5 text-indigo-400" /> Bỏ chọn tất cả</>
                    : <><Square className="w-3.5 h-3.5" /> Chọn tất cả</>
                  }
                </button>
              )}
            </div>

            {/* Danh sách */}
            <div className="p-4 max-h-72 overflow-y-auto">
              {allWrongQuestions.length > 0 ? (
                <div className="space-y-2">
                  {allWrongQuestions.map((q, idx) => {
                    const isSelected = selectedIds.has(q.qId);
                    return (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                        key={q.qId}
                        onClick={() => isAdmin && toggleSelect(q.qId)}
                        className={`flex items-center justify-between p-3 rounded-xl transition-all ${isAdmin ? 'cursor-pointer' : ''} ${isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/50'
                          : 'bg-slate-800/50 border border-transparent hover:border-slate-600/50'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Checkbox chỉ hiện với Admin */}
                          {isAdmin && (
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-indigo-500 text-white' : 'border border-slate-600'}`}>
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                          )}
                          <div className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 font-black flex items-center justify-center text-xs border border-red-500/30 flex-shrink-0">
                            #{idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white uppercase">{q.qId}</p>
                            <p className="text-[10px] text-slate-400">Tỉ lệ đúng: {q.accuracy}%</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-black text-red-400">{q.wrongCount} hs</p>
                          <p className="text-[10px] text-slate-500">làm sai</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-slate-500 text-sm py-4">Chưa có đủ số liệu.</p>
              )}
            </div>

            {/* ── TOOLBAR HÀNH ĐỘNG (nổi khi có câu được chọn) ── */}
            <AnimatePresence>
              {isAdmin && selectedIds.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="border-t border-indigo-500/30 bg-indigo-950/60 p-4 flex items-center gap-3"
                >
                  <span className="text-indigo-300 text-xs font-bold flex-1">
                    ✓ Đã chọn <span className="text-white font-black">{selectedIds.size}</span> câu hỏi
                  </span>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Bỏ chọn tất cả"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs rounded-xl transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    Xuất PDF
                  </button>
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-xl transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Tạo Đề Mới
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── NÚT GỌI AI (chỉ Admin) ── */}
            {isAdmin && (
              <div className="bg-indigo-900/20 border-t border-indigo-500/20 p-4">
                {report.ai_treatment_plan ? (
                  <div className="bg-indigo-950/40 rounded-xl p-4 border border-indigo-500/30">
                    <h4 className="text-indigo-400 font-black uppercase text-xs mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Phác đồ ôn tập (AI Gemini sinh)
                    </h4>
                    <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {report.ai_treatment_plan}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={generateAiTreatmentPlan}
                      disabled={aiLoading || allWrongQuestions.length === 0}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aiLoading
                        ? <><Loader2 className="w-5 h-5 animate-spin" />Đang phân tích AI...</>
                        : <><Sparkles className="w-5 h-5" />Nhờ AI phân tích phác đồ ôn tập</>
                      }
                    </button>
                    {aiError && <p className="text-red-400 text-xs mt-2 text-center">{aiError}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chuyên Đề Yếu */}
          {report.weakTopics && report.weakTopics.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4">
              <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-4">
                ⚠️ Mảng Chuyên Đề Yếu Cần Ôn
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

      {/* ── COMPONENT ẨN DÀNH CHO IN ẤN — Không hiển thị trên UI ── */}
      {isPrintReady && (
        <div style={{ display: 'none' }}>
          <PrintableExam
            ref={printRef}
            title={printTitle}
            questions={printQuestions}
          />
        </div>
      )}
    </div>
  );
};
