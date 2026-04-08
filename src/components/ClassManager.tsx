import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  db, auth, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, 
  query, where, onSnapshot, Timestamp, serverTimestamp, arrayUnion, setDoc, writeBatch, orderBy
} from '../firebase';
import { UserProfile, ClassRoom, ClassExam, ClassAttempt, Exam, Question } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from './Toast';
import { 
  Users, Plus, Copy, Trash2, Play, Square, Monitor, RefreshCw, 
  CheckCircle2, Clock, AlertTriangle, Radio, Eye, X, ChevronRight,
  Wifi, WifiOff, Smartphone, Shield
} from 'lucide-react';

// ── Helper: Generate 6-char class code ──
const generateClassCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

// ── Sub-tab type ──
type ManagerTab = 'classes' | 'create-exam' | 'live';

interface ClassManagerProps {
  user: UserProfile;
}

const ClassManager: React.FC<ClassManagerProps> = ({ user }) => {
  const [tab, setTab] = useState<ManagerTab>('classes');

  // ── Class Management State ──
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // ── Exam Session State ──
  const [exams, setExams] = useState<Exam[]>([]);
  const [classExams, setClassExams] = useState<ClassExam[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState(50);
  const [autoSubmit, setAutoSubmit] = useState(true);

  // ── Live Dashboard State ──
  const [activeClassExam, setActiveClassExam] = useState<ClassExam | null>(null);
  const [liveAttempts, setLiveAttempts] = useState<ClassAttempt[]>([]);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);

  // ── Fetch classes ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'classes'), where('teacherId', '==', user.uid)),
      (snap) => {
        setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassRoom)));
      }
    );
    return unsub;
  }, [user.uid]);

  // ── Fetch exams ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'exams'), (snap) => {
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    });
    return unsub;
  }, []);

  // ── Fetch class exams ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classExams'), (snap) => {
      setClassExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassExam))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    });
    return unsub;
  }, []);

  // ── Live dashboard: listen classAttempts for active exam ──
  useEffect(() => {
    if (!activeClassExam?.id) {
      setLiveAttempts([]);
      return;
    }

    const unsub = onSnapshot(
      query(collection(db, 'classAttempts'), where('classExamId', '==', activeClassExam.id)),
      (snap) => {
        setLiveAttempts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassAttempt)));
      }
    );
    return unsub;
  }, [activeClassExam?.id]);

  // ── Fetch questions for active exam ──
  useEffect(() => {
    if (!activeClassExam?.examId) return;
    const fetchQuestions = async () => {
      try {
        const examDoc = await getDoc(doc(db, 'exams', activeClassExam.examId));
        if (examDoc.exists()) {
          const examData = examDoc.data() as Exam;
          setExamQuestions(examData.questions || []);
        }
      } catch (e) { console.error('Lỗi fetch questions:', e); }
    };
    fetchQuestions();
  }, [activeClassExam?.examId]);

  // ══════════════════════════════════════════
  //  CLASS MANAGEMENT ACTIONS
  // ══════════════════════════════════════════

  const createClass = async () => {
    if (!newClassName.trim()) {
      toast.error('Vui lòng nhập tên lớp.');
      return;
    }
    setIsCreating(true);
    try {
      let code = generateClassCode();
      // Ensure unique
      const existing = await getDocs(query(collection(db, 'classes'), where('code', '==', code)));
      if (!existing.empty) code = generateClassCode();

      await addDoc(collection(db, 'classes'), {
        code,
        name: newClassName.trim(),
        teacherId: user.uid,
        studentIds: [],
        createdAt: Timestamp.now(),
      });
      setNewClassName('');
      toast.success(`Đã tạo lớp "${newClassName}" với mã: ${code}`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Lỗi khi tạo lớp.');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteClass = async (classId: string) => {
    if (!window.confirm('Xóa lớp này? Tất cả dữ liệu phiên thi trong lớp sẽ mất.')) return;
    try {
      await deleteDoc(doc(db, 'classes', classId));
      toast.success('Đã xóa lớp.');
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi xóa lớp.');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Đã copy mã lớp: ${code}`);
  };

  // ══════════════════════════════════════════
  //  EXAM SESSION ACTIONS
  // ══════════════════════════════════════════

  const startExamSession = async () => {
    if (!selectedClassId || !selectedExamId) {
      toast.error('Vui lòng chọn lớp và đề thi.');
      return;
    }
    try {
      const classDoc = classes.find(c => c.id === selectedClassId);
      const examDoc = exams.find(e => e.id === selectedExamId);

      await addDoc(collection(db, 'classExams'), {
        classId: selectedClassId,
        examId: selectedExamId,
        title: examTitle.trim() || `Phiên thi: ${examDoc?.title || 'Không tên'} — ${classDoc?.name || ''}`,
        startTime: Timestamp.now(),
        duration: examDuration,
        status: 'live',
        autoSubmit,
        createdAt: Timestamp.now(),
      });
      toast.success('🔴 PHIÊN THI ĐÃ BẮT ĐẦU! Học sinh có thể join bằng mã lớp.');
      setTab('live');
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi bắt đầu phiên thi.');
    }
  };

  const endExamSession = async (classExamId: string) => {
    if (!window.confirm('Kết thúc phiên thi? Tất cả bài chưa nộp sẽ tự động nộp.')) return;
    try {
      // 1. Set exam status to 'ended'
      await updateDoc(doc(db, 'classExams', classExamId), { status: 'ended' });

      // 2. Auto-submit all in_progress attempts
      const attemptsSnap = await getDocs(
        query(collection(db, 'classAttempts'), where('classExamId', '==', classExamId), where('status', '==', 'in_progress'))
      );

      const batch = writeBatch(db);
      attemptsSnap.docs.forEach(d => {
        batch.update(d.ref, {
          status: 'submitted',
          submittedAt: Timestamp.now(),
        });
      });
      await batch.commit();

      toast.success(`Đã kết thúc phiên thi. ${attemptsSnap.docs.length} bài tự động nộp.`);
      setActiveClassExam(null);
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi kết thúc phiên thi.');
    }
  };

  const openProjector = (classExamId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?projector=${classExamId}`;
    window.open(url, '_blank', 'width=1920,height=1080');
  };

  // ══════════════════════════════════════════
  //  LIVE DASHBOARD COMPUTED
  // ══════════════════════════════════════════

  const liveStats = useMemo(() => {
    const now = Date.now();
    const ONLINE_THRESHOLD = 30 * 1000; // 30 seconds

    const onlineStudents = liveAttempts.filter(a => {
      const lastPing = a.lastPing?.toDate?.() ?? a.lastPing?.seconds ? new Date(a.lastPing.seconds * 1000) : null;
      if (!lastPing) return false;
      return (now - lastPing.getTime()) < ONLINE_THRESHOLD;
    });

    // Detect duplicate devices: same studentId but different deviceId
    const studentDevices: Record<string, Set<string>> = {};
    liveAttempts.forEach(a => {
      if (!studentDevices[a.studentId]) studentDevices[a.studentId] = new Set();
      studentDevices[a.studentId].add(a.deviceId);
    });
    const duplicates = Object.entries(studentDevices)
      .filter(([_, devices]) => devices.size > 1)
      .map(([studentId]) => {
        const attempt = liveAttempts.find(a => a.studentId === studentId);
        return attempt?.studentName || studentId;
      });

    const submitted = liveAttempts.filter(a => a.status === 'submitted');
    const inProgress = liveAttempts.filter(a => a.status === 'in_progress');
    const totalQuestions = examQuestions.length;

    return {
      total: liveAttempts.length,
      online: onlineStudents.length,
      submitted: submitted.length,
      inProgress: inProgress.length,
      duplicates,
      totalQuestions,
      avgScore: submitted.length > 0
        ? (submitted.reduce((sum, a) => sum + a.score, 0) / submitted.length).toFixed(2)
        : '—',
    };
  }, [liveAttempts, examQuestions.length]);

  const isStudentOnline = useCallback((attempt: ClassAttempt) => {
    const now = Date.now();
    const lastPing = attempt.lastPing?.toDate?.() ?? ( attempt.lastPing?.seconds ? new Date(attempt.lastPing.seconds * 1000) : null);
    if (!lastPing) return false;
    return (now - lastPing.getTime()) < 30000;
  }, []);

  const sortedAttempts = useMemo(() => {
    return [...liveAttempts].sort((a, b) => {
      // Submitted first, then by score desc, then by totalAnswered desc
      if (a.status === 'submitted' && b.status !== 'submitted') return -1;
      if (a.status !== 'submitted' && b.status === 'submitted') return 1;
      if (a.status === 'submitted' && b.status === 'submitted') return b.score - a.score;
      return b.totalAnswered - a.totalAnswered;
    });
  }, [liveAttempts]);

  // ── Active live exams (not ended) ──
  const liveExams = useMemo(() => 
    classExams.filter(e => e.status === 'live'), 
  [classExams]);

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-3 bg-violet-600/20 rounded-2xl">
              <Users className="w-7 h-7 text-violet-400" />
            </div>
            PHÒNG THI TẬP TRUNG
          </h3>
          <p className="text-slate-400 text-sm mt-1">Tạo lớp, phát đề, theo dõi realtime, chiếu bảng xếp hạng</p>
        </div>

        {/* ── Live indicator ── */}
        {liveExams.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-600/10 border border-red-600/30 rounded-2xl animate-pulse">
            <Radio className="w-4 h-4 text-red-500" />
            <span className="text-red-400 text-xs font-black uppercase tracking-widest">
              {liveExams.length} PHIÊN ĐANG DIỄN RA
            </span>
          </div>
        )}
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800">
        {[
          { id: 'classes' as ManagerTab, label: 'Quản Lý Lớp', icon: Users },
          { id: 'create-exam' as ManagerTab, label: 'Tạo Phiên Thi', icon: Play },
          { id: 'live' as ManagerTab, label: 'Live Dashboard', icon: Radio, badge: liveExams.length > 0 },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 relative",
              tab === t.id
                ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
            {t.badge && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB 1: CLASS MANAGEMENT ═══════════════════ */}
      <AnimatePresence mode="wait">
        {tab === 'classes' && (
          <motion.div
            key="classes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Create Class */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-violet-400" /> Tạo lớp mới
              </h4>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createClass()}
                  placeholder="VD: Lớp 12A1 — Ba Đình"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none"
                />
                <button
                  onClick={createClass}
                  disabled={isCreating}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-2 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  {isCreating ? 'Đang tạo...' : 'Tạo lớp'}
                </button>
              </div>
            </div>

            {/* Class List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map(cls => (
                <motion.div
                  key={cls.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-violet-500/30 transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h5 className="text-lg font-black text-white">{cls.name}</h5>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                        {cls.studentIds.length} học sinh
                      </p>
                    </div>
                    <button
                      onClick={() => deleteClass(cls.id!)}
                      className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Class Code */}
                  <button
                    onClick={() => copyCode(cls.code)}
                    className="w-full flex items-center justify-between p-3 bg-slate-800 border border-slate-700 rounded-xl hover:border-violet-500/50 transition-all group/code"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4 text-violet-400" />
                      <span className="text-xl font-black text-white tracking-[0.3em] font-mono">{cls.code}</span>
                    </div>
                    <Copy className="w-4 h-4 text-slate-500 group-hover/code:text-violet-400 transition-colors" />
                  </button>

                  {/* Student count */}
                  {cls.studentIds.length > 0 && (
                    <div className="mt-4 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Học sinh đã tham gia:</p>
                      <div className="flex flex-wrap gap-1">
                        {cls.studentIds.slice(0, 8).map((_, i) => (
                          <div key={i} className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center">
                            <Users className="w-3 h-3 text-slate-500" />
                          </div>
                        ))}
                        {cls.studentIds.length > 8 && (
                          <div className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-400">
                            +{cls.studentIds.length - 8}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {classes.length === 0 && (
                <div className="col-span-full text-center py-16 text-slate-600">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-sm font-bold">Chưa có lớp nào.</p>
                  <p className="text-xs mt-1">Hãy tạo lớp đầu tiên ở trên.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══════════════════ TAB 2: CREATE EXAM SESSION ═══════════════════ */}
        {tab === 'create-exam' && (
          <motion.div
            key="create-exam"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
              <h4 className="text-lg font-black text-white mb-6 flex items-center gap-2">
                <Play className="w-5 h-5 text-red-500" /> Thiết lập phiên thi mới
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Select Class */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">1. Chọn lớp</label>
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-violet-500/50 outline-none appearance-none cursor-pointer"
                  >
                    <option value="">— Chọn lớp —</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name} ({cls.studentIds.length} HS) — Mã: {cls.code}</option>
                    ))}
                  </select>
                </div>

                {/* Select Exam */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">2. Chọn đề thi</label>
                  <select
                    value={selectedExamId}
                    onChange={e => setSelectedExamId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-violet-500/50 outline-none appearance-none cursor-pointer"
                  >
                    <option value="">— Chọn đề thi —</option>
                    {exams.map(exam => (
                      <option key={exam.id} value={exam.id}>
                        {exam.title} ({exam.questions?.length || 0} câu)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Exam Title */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">3. Tên phiên thi (tuỳ chọn)</label>
                  <input
                    type="text"
                    value={examTitle}
                    onChange={e => setExamTitle(e.target.value)}
                    placeholder="VD: Kiểm tra 1 tiết — Chương Từ trường"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 outline-none"
                  />
                </div>

                {/* Duration + Auto submit */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">4. Thời gian (phút)</label>
                    <input
                      type="number"
                      value={examDuration}
                      onChange={e => setExamDuration(Math.max(5, parseInt(e.target.value) || 50))}
                      min={5}
                      max={180}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-violet-500/50 outline-none"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSubmit}
                      onChange={e => setAutoSubmit(e.target.checked)}
                      className="w-5 h-5 bg-slate-800 border-slate-700 rounded accent-violet-500"
                    />
                    <span className="text-xs text-slate-300 font-medium">Tự nộp khi hết giờ</span>
                  </label>
                </div>
              </div>

              {/* Start Button */}
              <button
                onClick={startExamSession}
                disabled={!selectedClassId || !selectedExamId}
                className="mt-8 w-full py-5 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white rounded-2xl font-black text-lg uppercase tracking-widest transition-all shadow-2xl shadow-red-600/30 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                <Radio className="w-6 h-6" />
                🔴 BẮT ĐẦU PHIÊN THI NGAY
              </button>
            </div>

            {/* Recent Sessions */}
            {classExams.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" /> Lịch sử phiên thi
                </h4>
                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {classExams.slice(0, 10).map(ce => (
                    <div
                      key={ce.id}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer hover:bg-slate-800/50",
                        ce.status === 'live'
                          ? "bg-red-600/5 border-red-600/30"
                          : "bg-slate-950/50 border-slate-800"
                      )}
                      onClick={() => {
                        setActiveClassExam(ce);
                        setTab('live');
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          ce.status === 'live' ? "bg-red-600/20 text-red-400" :
                          ce.status === 'ended' ? "bg-green-600/10 text-green-400" :
                          "bg-slate-800 text-slate-500"
                        )}>
                          {ce.status === 'live' ? <Radio className="w-5 h-5 animate-pulse" /> :
                           ce.status === 'ended' ? <CheckCircle2 className="w-5 h-5" /> :
                           <Clock className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{ce.title}</p>
                          <p className="text-[10px] text-slate-500 uppercase">
                            {ce.duration} phút • {ce.status === 'live' ? '🔴 ĐANG DIỄN RA' : ce.status === 'ended' ? '✅ Đã kết thúc' : '⏰ Chờ bắt đầu'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════ TAB 3: LIVE DASHBOARD ═══════════════════ */}
        {tab === 'live' && (
          <motion.div
            key="live"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Select active exam */}
            {!activeClassExam ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6">
                <Radio className="w-16 h-16 text-slate-600 mx-auto" />
                <div>
                  <p className="text-lg font-bold text-white">Chọn phiên thi để theo dõi</p>
                  <p className="text-slate-400 text-sm mt-1">Bấm vào phiên thi đang diễn ra hoặc đã kết thúc</p>
                </div>
                <div className="space-y-3 max-w-md mx-auto">
                  {liveExams.map(ce => (
                    <button
                      key={ce.id}
                      onClick={() => setActiveClassExam(ce)}
                      className="w-full p-4 bg-red-600/10 border border-red-600/30 rounded-xl text-left hover:bg-red-600/20 transition-all flex items-center gap-4"
                    >
                      <Radio className="w-5 h-5 text-red-500 animate-pulse shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">{ce.title}</p>
                        <p className="text-[10px] text-red-400 uppercase font-bold">🔴 LIVE — {ce.duration} phút</p>
                      </div>
                    </button>
                  ))}
                  {classExams.filter(e => e.status === 'ended').slice(0, 5).map(ce => (
                    <button
                      key={ce.id}
                      onClick={() => setActiveClassExam(ce)}
                      className="w-full p-4 bg-slate-800/50 border border-slate-700 rounded-xl text-left hover:bg-slate-800 transition-all flex items-center gap-4"
                    >
                      <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">{ce.title}</p>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">✅ Đã kết thúc</p>
                      </div>
                    </button>
                  ))}
                  {classExams.length === 0 && (
                    <p className="text-sm text-slate-500 py-4">Chưa có phiên thi nào. Hãy tạo ở tab "Tạo Phiên Thi".</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Dashboard Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setActiveClassExam(null)}
                      className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div>
                      <h4 className="text-lg font-black text-white flex items-center gap-2">
                        {activeClassExam.status === 'live' && <Radio className="w-5 h-5 text-red-500 animate-pulse" />}
                        {activeClassExam.title}
                      </h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                        {activeClassExam.duration} phút • {activeClassExam.status === 'live' ? '🔴 ĐANG LIVE' : '✅ Đã kết thúc'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {activeClassExam.status === 'live' && (
                      <>
                        <button
                          onClick={() => openProjector(activeClassExam.id!)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95"
                        >
                          <Monitor className="w-4 h-4" /> 📽 MÀN HÌNH CHIẾU
                        </button>
                        <button
                          onClick={() => endExamSession(activeClassExam.id!)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95"
                        >
                          <Square className="w-4 h-4" /> KẾT THÚC
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Tổng HS', value: liveStats.total, color: 'text-violet-400', bgColor: 'bg-violet-500/10' },
                    { label: '🟢 Online', value: liveStats.online, color: 'text-green-400', bgColor: 'bg-green-500/10' },
                    { label: 'Đang làm', value: liveStats.inProgress, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
                    { label: 'Đã nộp', value: liveStats.submitted, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
                    { label: 'Điểm TB', value: liveStats.avgScore, color: 'text-red-400', bgColor: 'bg-red-500/10' },
                  ].map((s, i) => (
                    <div key={i} className={cn("p-4 rounded-2xl border border-slate-800", s.bgColor)}>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</p>
                      <p className={cn("text-2xl font-black mt-1", s.color)}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Duplicate Warning */}
                {liveStats.duplicates.length > 0 && (
                  <div className="p-4 bg-red-600/10 border border-red-600/30 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-400">⚠️ CẢNH BÁO: HS VÀO 2 THIẾT BỊ</p>
                      <p className="text-xs text-red-300 mt-1">
                        {liveStats.duplicates.join(', ')} — đang sử dụng nhiều thiết bị cùng lúc.
                      </p>
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tiến độ nộp bài</span>
                    <span className="text-xs font-bold text-white">
                      {liveStats.submitted}/{liveStats.total} ({liveStats.total > 0 ? Math.round((liveStats.submitted / liveStats.total) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${liveStats.total > 0 ? (liveStats.submitted / liveStats.total) * 100 : 0}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-violet-600 to-blue-400"
                    />
                  </div>
                </div>

                {/* Student Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Eye className="w-4 h-4 text-violet-400" /> Chi tiết từng học sinh
                    </h4>
                    <span className="text-[10px] text-slate-500 font-bold">{liveStats.totalQuestions} câu hỏi trong đề</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
                          <th className="p-3 text-left">#</th>
                          <th className="p-3 text-left">Học sinh</th>
                          <th className="p-3 text-center">Online</th>
                          <th className="p-3 text-center">Đã làm</th>
                          <th className="p-3 text-center">Trạng thái</th>
                          <th className="p-3 text-center">Điểm</th>
                          <th className="p-3 text-center">Thiết bị</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAttempts.map((attempt, idx) => {
                          const online = isStudentOnline(attempt);
                          const isDuplicate = liveStats.duplicates.includes(attempt.studentName);

                          return (
                            <motion.tr
                              key={attempt.id}
                              layoutId={attempt.id}
                              className={cn(
                                "border-b border-slate-800/50 transition-colors",
                                attempt.status === 'submitted' ? "bg-green-600/5" : "",
                                isDuplicate ? "bg-red-600/5" : "",
                              )}
                            >
                              <td className="p-3 text-slate-500 font-bold">{idx + 1}</td>
                              <td className="p-3">
                                <p className="text-white font-bold">{attempt.studentName}</p>
                                <p className="text-[10px] text-slate-500">{attempt.studentEmail}</p>
                              </td>
                              <td className="p-3 text-center">
                                {online ? (
                                  <Wifi className="w-4 h-4 text-green-400 mx-auto" />
                                ) : (
                                  <WifiOff className="w-4 h-4 text-slate-600 mx-auto" />
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <span className="text-xs font-bold text-white">
                                  {attempt.totalAnswered}/{liveStats.totalQuestions}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
                                  attempt.status === 'submitted'
                                    ? "bg-green-600/20 text-green-400"
                                    : "bg-amber-600/20 text-amber-400"
                                )}>
                                  {attempt.status === 'submitted' ? 'Đã nộp' : 'Đang làm'}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span className={cn(
                                  "text-lg font-black",
                                  attempt.status === 'submitted'
                                    ? (attempt.score >= 8 ? "text-amber-400" : attempt.score >= 5 ? "text-blue-400" : "text-red-400")
                                    : "text-slate-600"
                                )}>
                                  {attempt.status === 'submitted' ? attempt.score.toFixed(2) : '—'}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {isDuplicate ? (
                                  <div className="flex items-center justify-center gap-1 text-red-400" title="Đang dùng 2 thiết bị">
                                    <Smartphone className="w-3 h-3" />
                                    <Smartphone className="w-3 h-3" />
                                    <span className="text-[9px] font-bold">⚠️</span>
                                  </div>
                                ) : (
                                  <Smartphone className="w-4 h-4 text-slate-600 mx-auto" />
                                )}
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {sortedAttempts.length === 0 && (
                      <div className="text-center py-12 text-slate-600">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-bold">Chưa có học sinh nào tham gia.</p>
                        <p className="text-xs mt-1">Chia sẻ mã lớp cho học sinh để bắt đầu.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ClassManager;
