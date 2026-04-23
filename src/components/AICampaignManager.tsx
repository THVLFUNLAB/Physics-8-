// ═══════════════════════════════════════════════════════════════════════
//  AICampaignManager.tsx — Chiến dịch Tâm Thư AI (Admin → Student)
//  ┌──────────────────────────────────────────────────────────────┐
//  │ Throttled Queue: Concurrency 3, Delay 2s giữa các chunk     │
//  │ Tenure-Based Prompt: Thâm niên > 6 tháng → Prompt khác      │
//  │ Progress Bar: Real-time theo từng em hoàn thành              │
//  └──────────────────────────────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Users, CheckSquare, Square, CheckCircle2, XCircle,
  Loader2, BrainCircuit, Zap, Clock, AlertTriangle, ChevronDown
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  db, collection, getDocs, query, where, orderBy, limit,
  addDoc, Timestamp, doc, getDoc
} from '../firebase';
import { UserProfile, Attempt, CampaignMessage, Exam, Question } from '../types';
import { GoogleGenAI } from '@google/genai';

// ═══════════════════════════════════════════════════════════════════════
//  THROTTLE CONFIG
// ═══════════════════════════════════════════════════════════════════════
const CONCURRENCY_LIMIT = 3;          // Tối đa 3 request song song
const DELAY_BETWEEN_CHUNKS_MS = 2000; // Delay 2 giây giữa các chunk

// ═══════════════════════════════════════════════════════════════════════
//  TENURE CALCULATION
// ═══════════════════════════════════════════════════════════════════════
function calculateTenureMonths(createdAt: any): number {
  if (!createdAt) return 0;
  const joinDate = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - joinDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
}

function getTenureLabel(months: number): string {
  if (months > 6) return 'Học sinh cũ (>' + months + ' tháng)';
  return 'Học sinh mới (' + months + ' tháng)';
}

// ═══════════════════════════════════════════════════════════════════════
//  BUILD AI PROMPT — Core 4-Step Psychology + Tenure Injection
// ═══════════════════════════════════════════════════════════════════════
function buildCampaignPrompt(
  student: UserProfile,
  tenureMonths: number,
  recentErrors: string[],
  recentScore: number | null
): string {
  // Inject tenure greeting
  const tenureInjection = tenureMonths > 6
    ? 'Nhấn mạnh việc thầy trò đã đồng hành lâu dài, thầy rất hiểu năng lực của con.'
    : 'Nhấn mạnh sự ghi nhận nỗ lực bắt nhịp của con dù mới gia nhập lớp.';

  const errorContext = recentErrors.length > 0
    ? `Các lỗi sai gần đây của học sinh:\n${recentErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
    : 'Học sinh chưa có dữ liệu lỗi sai cụ thể.';

  const scoreContext = recentScore !== null
    ? `Điểm bài thi gần nhất: ${recentScore.toFixed(1)}/10`
    : 'Chưa có dữ liệu điểm gần đây.';

  return `
Bạn là Thầy Hậu — Giáo viên Vật lý dạy lớp 12 luyện thi THPT Quốc gia trên nền tảng PHYS-9+.
Nhiệm vụ: Viết một bức "Tâm thư" cá nhân hóa gửi học sinh ${student.displayName || 'em'}.

${tenureInjection}

=== THÔNG TIN HỌC SINH ===
- Tên: ${student.displayName}
- Email: ${student.email}
- Thâm niên: ${tenureMonths} tháng
- Lớp: ${student.className || 'Chưa cập nhật'}
- ${scoreContext}

=== DỮ LIỆU LỖI SAI ===
${errorContext}

=== CẤU TRÚC TÂM THƯ (4 BƯỚC TÂM LÝ — BẮT BUỘC) ===
1. **GHI NHẬN**: Khen ngợi nỗ lực cụ thể (hoặc mức điểm) mà học sinh đang duy trì.
2. **THỨC TỈNH**: Nêu cụ thể 1-2 lỗ hổng kiến thức từ dữ liệu lỗi sai. Dùng giọng nhẹ nhàng nhưng thẳng thắn.
3. **TRAO GIẢI PHÁP**: Hướng dẫn cụ thể: Làm lại đề trên PHYS-9+, ghi chép lỗi sai vào sổ tay.
4. **TRUYỀN LỬA**: Nhắc nhở kỳ thi THPT Quốc gia đang tới rất gần. Truyền năng lượng tích cực.

=== QUY TẮC ===
- Viết bằng tiếng Việt, giọng thầy gần gũi, ấm áp, KHÔNG giáo điều.
- Độ dài: 150-250 từ.
- Xưng "thầy" và gọi học sinh bằng "con".
- KHÔNG dùng Markdown heading (#). Dùng **bold** cho nhấn mạnh.
- Ký tên cuối thư: "Thầy Hậu — PHYS-9+"
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════
//  FETCH RECENT ERRORS FOR A STUDENT
// ═══════════════════════════════════════════════════════════════════════
async function fetchRecentErrors(studentId: string): Promise<{ errors: string[], score: number | null }> {
  try {
    // Get latest attempt
    const attSnap = await getDocs(
      query(collection(db, 'attempts'), where('userId', '==', studentId), orderBy('timestamp', 'desc'), limit(1))
    );
    if (attSnap.empty) return { errors: [], score: null };

    const attempt = attSnap.docs[0].data() as Attempt;
    const score = attempt.score;

    // Try to find the associated exam to extract error details
    const examId = attempt.examId || attempt.testId;
    if (!examId) return { errors: [], score };

    let examSnap;
    try { examSnap = await getDoc(doc(db, 'exams', examId)); } catch { return { errors: [], score }; }
    if (!examSnap.exists()) return { errors: [], score };

    const exam = examSnap.data() as Exam;
    const errors: string[] = [];

    exam.questions.forEach((q: Question, idx: number) => {
      const key = `q${idx + 1}`;
      const sAns = attempt.answers[key];
      let isWrong = false;

      if (q.part === 1) isWrong = sAns !== q.correctAnswer;
      else if (q.part === 2) {
        isWrong = Array.from({ length: 4 }).some((_, i) =>
          !Array.isArray(sAns) || sAns[i] !== (q.correctAnswer as boolean[])[i]
        );
      }
      else if (q.part === 3) {
        isWrong = Math.abs(parseFloat(sAns || '0') - (q.correctAnswer as number)) >= 0.01;
      }

      if (isWrong && errors.length < 3) {
        // Extract clean text via DOMParser
        const tmpDoc = new DOMParser().parseFromString(q.content, 'text/html');
        const cleanText = (tmpDoc.body.textContent || '').slice(0, 120);
        errors.push(`[${q.topic}] ${cleanText}...`);
      }
    });

    return { errors, score };
  } catch (err) {
    console.warn('[AICampaignManager] Error fetching data for', studentId, err);
    return { errors: [], score: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  CALL GEMINI FOR ONE STUDENT
// ═══════════════════════════════════════════════════════════════════════
async function generateLetterForStudent(prompt: string): Promise<string> {
  const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY missing');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return (response as any).text || 'Không thể tạo thư.';
}

// ═══════════════════════════════════════════════════════════════════════
//  STUDENT STATUS TRACKING
// ═══════════════════════════════════════════════════════════════════════
interface StudentStatus {
  student: UserProfile;
  status: 'pending' | 'processing' | 'done' | 'error';
  message?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
const AICampaignManager: React.FC = () => {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Map<string, StudentStatus>>(new Map());
  const [completedCount, setCompletedCount] = useState(0);
  const [totalSelected, setTotalSelected] = useState(0);
  const abortRef = useRef(false);

  // ── Fetch student list ──
  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where('role', '!=', 'admin'))
        );
        const list = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
        setStudents(list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')));
      } catch (err) {
        console.error('[AICampaignManager] Fetch students error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // ── Select / Deselect ──
  const toggleSelect = (uid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === students.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(students.map(s => s.uid)));
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  THROTTLED BATCH PROCESSING — Chunking + Concurrency Limit
  // ═══════════════════════════════════════════════════════════════
  const runCampaign = useCallback(async () => {
    if (selected.size === 0) return;
    abortRef.current = false;
    setRunning(true);
    setCompletedCount(0);
    setTotalSelected(selected.size);

    const campaignId = `campaign_${Date.now()}`;
    const selectedStudents = students.filter(s => selected.has(s.uid));

    // Initialize statuses
    const initMap = new Map<string, StudentStatus>();
    selectedStudents.forEach(s => initMap.set(s.uid, { student: s, status: 'pending' }));
    setStatuses(new Map(initMap));

    // ── Process one student ──
    const processStudent = async (student: UserProfile) => {
      if (abortRef.current) return;

      setStatuses(prev => {
        const next = new Map(prev);
        next.set(student.uid, { ...next.get(student.uid)!, status: 'processing' });
        return next;
      });

      try {
        const tenureMonths = calculateTenureMonths(student.createdAt);
        const { errors, score } = await fetchRecentErrors(student.uid);
        const prompt = buildCampaignPrompt(student, tenureMonths, errors, score);
        const letterContent = await generateLetterForStudent(prompt);

        // Write to Firestore
        const msg: CampaignMessage = {
          studentId: student.uid,
          studentName: student.displayName || student.email,
          content: letterContent,
          isRead: false,
          campaignId,
          createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, 'campaign_messages'), msg);

        setStatuses(prev => {
          const next = new Map(prev);
          next.set(student.uid, { ...next.get(student.uid)!, status: 'done', message: letterContent.slice(0, 100) + '...' });
          return next;
        });
        setCompletedCount(prev => prev + 1);
      } catch (err: any) {
        setStatuses(prev => {
          const next = new Map(prev);
          next.set(student.uid, { ...next.get(student.uid)!, status: 'error', error: err.message || 'Lỗi không xác định' });
          return next;
        });
        setCompletedCount(prev => prev + 1);
      }
    };

    // ── Chunked execution with concurrency limit ──
    const chunks: UserProfile[][] = [];
    for (let i = 0; i < selectedStudents.length; i += CONCURRENCY_LIMIT) {
      chunks.push(selectedStudents.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (let ci = 0; ci < chunks.length; ci++) {
      if (abortRef.current) break;

      // Process chunk concurrently (max CONCURRENCY_LIMIT)
      await Promise.allSettled(chunks[ci].map(s => processStudent(s)));

      // Delay between chunks (skip delay after last chunk)
      if (ci < chunks.length - 1 && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
      }
    }

    setRunning(false);
  }, [selected, students]);

  const abortCampaign = () => {
    abortRef.current = true;
  };

  // ── Stats ──
  const doneCount = Array.from(statuses.values()).filter(s => s.status === 'done').length;
  const errorCount = Array.from(statuses.values()).filter(s => s.status === 'error').length;
  const progressPercent = totalSelected > 0 ? Math.round((completedCount / totalSelected) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-fuchsia-500/10 via-slate-900 to-slate-900 border border-fuchsia-500/30 rounded-3xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-fuchsia-500/20 rounded-2xl">
              <Send className="w-6 h-6 text-fuchsia-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Chiến Dịch Tâm Thư AI</h2>
              <p className="text-xs text-slate-500 font-medium">Gửi thư chẩn đoán cá nhân hóa bằng Gemini AI • Throttled Queue (3 concurrent, 2s delay)</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Student Selection ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            Chọn Học Sinh ({selected.size}/{students.length})
          </h3>
          <div className="flex gap-3">
            <button
              onClick={selectAll}
              disabled={running}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all flex items-center gap-2",
                selected.size === students.length
                  ? "bg-cyan-600 border-cyan-600 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-cyan-500 hover:text-cyan-400"
              )}
            >
              <CheckSquare className="w-4 h-4" />
              {selected.size === students.length ? 'Bỏ chọn tất cả' : 'Select All'}
            </button>
            <button
              onClick={runCampaign}
              disabled={running || selected.size === 0}
              className="px-6 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-fuchsia-600/20"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {running ? 'Đang gửi...' : 'Phát Động Chiến Dịch'}
            </button>
            {running && (
              <button
                onClick={abortCampaign}
                className="px-4 py-2 bg-red-600/20 border border-red-500/50 text-red-400 rounded-xl text-xs font-bold hover:bg-red-600/30 transition-all"
              >
                Dừng
              </button>
            )}
          </div>
        </div>

        {/* ── Progress Bar ── */}
        {running && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 bg-slate-950 border border-slate-800 rounded-2xl p-5"
          >
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-fuchsia-400 animate-spin" />
                <span className="text-sm text-white font-bold">Đang xử lý chiến dịch...</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {doneCount}</span>
                <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {errorCount}</span>
                <span className="text-slate-400">{completedCount}/{totalSelected}</span>
              </div>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <motion.div
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5 }}
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-500 to-cyan-400 relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </motion.div>
            </div>
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              Throttle: {CONCURRENCY_LIMIT} concurrent • {DELAY_BETWEEN_CHUNKS_MS / 1000}s delay giữa các chunk
            </p>
          </motion.div>
        )}

        {/* ── Student List ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-slate-600 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {students.map(student => {
              const isSelected = selected.has(student.uid);
              const status = statuses.get(student.uid);
              const tenure = calculateTenureMonths(student.createdAt);

              return (
                <motion.div
                  key={student.uid}
                  layout
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-2xl border transition-all cursor-pointer group",
                    isSelected ? "bg-fuchsia-500/5 border-fuchsia-500/30" : "bg-slate-950/50 border-slate-800 hover:border-slate-600",
                    status?.status === 'done' && "bg-green-500/5 border-green-500/30",
                    status?.status === 'error' && "bg-red-500/5 border-red-500/30",
                    status?.status === 'processing' && "bg-amber-500/5 border-amber-500/30 animate-pulse"
                  )}
                  onClick={() => !running && toggleSelect(student.uid)}
                >
                  {/* Checkbox */}
                  <div className="shrink-0">
                    {status?.status === 'done' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : status?.status === 'error' ? (
                      <XCircle className="w-5 h-5 text-red-400" />
                    ) : status?.status === 'processing' ? (
                      <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                    ) : isSelected ? (
                      <CheckSquare className="w-5 h-5 text-fuchsia-400" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-600 group-hover:text-slate-400" />
                    )}
                  </div>

                  {/* Avatar */}
                  {student.photoURL ? (
                    <img src={student.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-white">
                      {(student.displayName || student.email)[0].toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{student.displayName || student.email}</p>
                    <p className="text-[10px] text-slate-500 truncate">{student.email}</p>
                  </div>

                  {/* Tenure Badge */}
                  <div className={cn(
                    "shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider hidden sm:block",
                    tenure > 6
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  )}>
                    <Clock className="w-3 h-3 inline mr-1" />
                    {tenure}th
                  </div>

                  {/* Status Message */}
                  {status?.status === 'done' && (
                    <span className="text-[10px] text-green-400 font-medium hidden md:block max-w-[150px] truncate">✓ Đã gửi</span>
                  )}
                  {status?.status === 'error' && (
                    <span className="text-[10px] text-red-400 font-medium hidden md:block max-w-[150px] truncate" title={status.error}>✗ Lỗi</span>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Post-Campaign Summary ── */}
      <AnimatePresence>
        {!running && doneCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-green-500/5 border border-green-500/30 rounded-3xl p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
              <h3 className="text-lg font-bold text-green-400">Chiến Dịch Hoàn Tất!</h3>
            </div>
            <p className="text-sm text-slate-400">
              Đã gửi thành công <span className="text-green-400 font-black">{doneCount}</span> tâm thư
              {errorCount > 0 && <> • <span className="text-red-400 font-bold">{errorCount} lỗi</span></>}.
              Học sinh sẽ nhận thư khi đăng nhập lần tiếp theo.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AICampaignManager;
