import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  db, auth, collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc,
  query, where, onSnapshot, Timestamp, serverTimestamp
} from '../firebase';
import { UserProfile, ClassRoom, ClassExam, ClassAttempt, Exam, Question } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from './Toast';
import MathRenderer from '../lib/MathRenderer';
import { 
  KeyRound, Radio, Clock, ChevronLeft, ChevronRight, Send, 
  CheckCircle2, Trophy, AlertTriangle, Users, XCircle, Info
} from 'lucide-react';

// ── Device fingerprint (simple but effective) ──
const getDeviceId = (): string => {
  let stored = localStorage.getItem('phy8_device_id');
  if (stored) return stored;
  const id = `${navigator.userAgent.slice(0, 30)}_${screen.width}x${screen.height}_${Date.now().toString(36)}`;
  const hash = id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0).toString(36);
  stored = `dev_${hash}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem('phy8_device_id', stored);
  return stored;
};

interface LiveClassExamProps {
  user: UserProfile;
}

type Phase = 'join' | 'waiting' | 'exam' | 'results';

const LiveClassExam: React.FC<LiveClassExamProps> = ({ user }) => {
  const [phase, setPhase] = useState<Phase>('join');
  const [classCode, setClassCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  // ── Exam state ──
  const [classroom, setClassroom] = useState<ClassRoom | null>(null);
  const [classExam, setClassExam] = useState<ClassExam | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  // ── Results state ──
  const [finalScore, setFinalScore] = useState(0);
  const [classRanking, setClassRanking] = useState<ClassAttempt[]>([]);
  const [myRank, setMyRank] = useState(0);

  // ── Cheat detection ──
  const [cheatWarnings, setCheatWarnings] = useState(0);

  // Heartbeat interval ref
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Clock ──
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Heartbeat: ping lastPing every 15s ──
  useEffect(() => {
    if (phase !== 'exam' || !attemptId) return;

    const ping = () => {
      updateDoc(doc(db, 'classAttempts', attemptId), {
        lastPing: Timestamp.now(),
      }).catch(e => console.warn('Heartbeat failed:', e));
    };

    ping(); // Initial ping
    heartbeatRef.current = setInterval(ping, 15000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [phase, attemptId]);

  // ── Visibility change detection (anti-cheat) ──
  useEffect(() => {
    if (phase !== 'exam') return;
    const handleVisibility = () => {
      if (document.hidden) {
        setCheatWarnings(prev => prev + 1);
        toast.error('⚠️ Cảnh báo: Bạn vừa rời khỏi trang thi!');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [phase]);

  // ── Listen to classExam status changes (force end) ──
  useEffect(() => {
    if (!classExam?.id) return;
    const unsub = onSnapshot(doc(db, 'classExams', classExam.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ClassExam;
        setClassExam({ id: snap.id, ...data });
        if (data.status === 'ended' && phase === 'exam') {
          handleSubmit(true);
        }
      }
    });
    return unsub;
  }, [classExam?.id, phase]);

  // ── Countdown ──
  const countdown = useMemo(() => {
    if (!classExam?.startTime) return null;
    
    const startMs = classExam.startTime?.toDate?.()
      ? classExam.startTime.toDate().getTime()
      : (classExam.startTime?.seconds || 0) * 1000;
    
    const endMs = startMs + classExam.duration * 60 * 1000;
    const remaining = Math.max(0, endMs - now);
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    return {
      remaining,
      display: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      isUrgent: remaining < 5 * 60 * 1000 && remaining > 0,
      isEnded: remaining <= 0,
    };
  }, [classExam, now]);

  // ── Auto-submit when time runs out ──
  useEffect(() => {
    if (countdown?.isEnded && phase === 'exam' && classExam?.autoSubmit) {
      handleSubmit(true);
    }
  }, [countdown?.isEnded]);

  // ── 5 minute warning ──
  useEffect(() => {
    if (countdown?.remaining && countdown.remaining <= 5 * 60 * 1000 && countdown.remaining > 4.9 * 60 * 1000 && phase === 'exam') {
      toast.error('⏰ Còn 5 phút! Hãy kiểm tra lại bài.');
    }
  }, [countdown?.remaining]);

  // ══════════════════════════════════════════
  //  JOIN FLOW
  // ══════════════════════════════════════════

  const handleJoin = async () => {
    const code = classCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Mã lớp phải có đúng 6 ký tự.');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      // 1. Find class by code
      const classSnap = await getDocs(query(collection(db, 'classes'), where('code', '==', code)));
      if (classSnap.empty) {
        setError('Không tìm thấy lớp với mã này. Kiểm tra lại.');
        setIsJoining(false);
        return;
      }

      const classDoc = classSnap.docs[0];
      const classData = { id: classDoc.id, ...classDoc.data() } as ClassRoom;
      setClassroom(classData);

      // 2. Auto join class — SKIP arrayUnion (eliminated concurrency bottleneck)
      // Student membership is now tracked via participants sub-collection below

      // 3. Check for live exam in this class
      const examSnap = await getDocs(
        query(collection(db, 'classExams'), where('classId', '==', classDoc.id), where('status', '==', 'live'))
      );

      if (examSnap.empty) {
        setError('Lớp này chưa có phiên thi nào đang diễn ra. Hãy đợi thầy/cô bắt đầu.');
        setIsJoining(false);
        return;
      }

      const examDoc = examSnap.docs[0];
      const examData = { id: examDoc.id, ...examDoc.data() } as ClassExam;
      setClassExam(examData);

      // 4. Fetch exam questions — CACHE-FIRST (F5-proof, saves reads)
      const cacheKey = `phy8_exam_${examData.examId}`;
      let examQuestions: Question[] = [];
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          examQuestions = JSON.parse(cached);
        } catch { /* fallthrough to fetch */ }
      }
      if (examQuestions.length === 0) {
        const examRef = await getDoc(doc(db, 'exams', examData.examId));
        if (!examRef.exists()) {
          setError('Đề thi không tồn tại. Liên hệ thầy/cô.');
          setIsJoining(false);
          return;
        }
        const exam = examRef.data() as Exam;
        examQuestions = exam.questions || [];
        // Cache for F5 resilience
        try { sessionStorage.setItem(cacheKey, JSON.stringify(examQuestions)); } catch {}
      }
      setQuestions(examQuestions);

      // 5. Check if student already has an attempt (resume)
      const existingAttempt = await getDocs(
        query(
          collection(db, 'classAttempts'),
          where('classExamId', '==', examDoc.id),
          where('studentId', '==', user.uid)
        )
      );

      if (!existingAttempt.empty) {
        // Resume existing attempt
        const existing = existingAttempt.docs[0];
        const existingData = existing.data() as ClassAttempt;
        
        if (existingData.status === 'submitted') {
          // Already submitted — show results
          setFinalScore(existingData.score);
          setPhase('results');
          fetchRanking(examDoc.id);
          setIsJoining(false);
          return;
        }

        setAttemptId(existing.id);
        setAnswers(existingData.answers || {});
        setPhase('exam');
        toast.info('Tiếp tục bài thi từ lần trước.');
      } else {
        // Create new attempt
        const deviceId = getDeviceId();
        const attemptRef = await addDoc(collection(db, 'classAttempts'), {
          classExamId: examDoc.id,
          studentId: user.uid,
          studentName: user.displayName,
          studentEmail: user.email,
          answers: {},
          score: 0,
          totalAnswered: 0,
          startedAt: Timestamp.now(),
          status: 'in_progress',
          deviceId,
          lastPing: Timestamp.now(),
        });
        setAttemptId(attemptRef.id);
        setPhase('exam');
      }

      // ── Register in participants sub-collection (scalable: 1 doc per student) ──
      try {
        await setDoc(doc(db, 'classExams', examDoc.id, 'participants', user.uid), {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          joinedAt: Timestamp.now(),
          deviceId: getDeviceId(),
        });
      } catch (participantErr) {
        console.warn('Participant registration (non-blocking):', participantErr);
      }

      toast.success(`Đã vào phòng thi: ${classData.name}`);
    } catch (e) {
      console.error(e);
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setIsJoining(false);
    }
  };

  // ══════════════════════════════════════════
  //  ANSWER & SUBMIT
  // ══════════════════════════════════════════

  const handleAnswer = useCallback((questionId: string, answer: any) => {
    setAnswers(prev => {
      const updated = { ...prev, [questionId]: answer };
      
      // Sync to Firestore (debounced via the state update)
      if (attemptId) {
        const totalAnswered = Object.values(updated).filter(v => v !== undefined && v !== null && v !== '').length;
        updateDoc(doc(db, 'classAttempts', attemptId), {
          answers: updated,
          totalAnswered,
          lastPing: Timestamp.now(),
        }).catch(e => console.warn('Answer sync failed:', e));
      }
      
      return updated;
    });
  }, [attemptId]);

  const handleSubmit = async (isAutoSubmit = false) => {
    if (isSubmitting) return;
    if (!isAutoSubmit && !window.confirm('Nộp bài? Bạn không thể sửa sau khi nộp.')) return;
    
    setIsSubmitting(true);
    try {
      // ── Score calculation (same logic as App.tsx) ──
      let totalScore = 0;
      const normalizeDecimal = (v: any) => parseFloat(String(v ?? '0').replace(',', '.'));

      for (const q of questions) {
        const studentAns = answers[q.id || ''];
        
        if (q.part === 1) {
          if (studentAns === q.correctAnswer) totalScore += 0.25;
        } else if (q.part === 2) {
          let correctCount = 0;
          for (let i = 0; i < 4; i++) {
            if (Array.isArray(studentAns) && studentAns[i] !== undefined && studentAns[i] === (q.correctAnswer as boolean[])[i]) {
              correctCount++;
            }
          }
          if (correctCount === 4) totalScore += 1.0;
          else if (correctCount === 3) totalScore += 0.5;
          else if (correctCount === 2) totalScore += 0.25;
          else if (correctCount === 1) totalScore += 0.1;
        } else if (q.part === 3) {
          const sv = normalizeDecimal(studentAns);
          const cv = normalizeDecimal(q.correctAnswer);
          if (!isNaN(sv) && Math.abs(sv - cv) < 0.01) totalScore += 0.25;
        }
      }

      totalScore = Math.round(totalScore * 100) / 100;

      if (attemptId) {
        await updateDoc(doc(db, 'classAttempts', attemptId), {
          answers,
          score: totalScore,
          totalAnswered: Object.keys(answers).length,
          status: 'submitted',
          submittedAt: Timestamp.now(),
        });
      }

      setFinalScore(totalScore);
      setPhase('results');

      if (classExam?.id) fetchRanking(classExam.id);

      if (heartbeatRef.current) clearInterval(heartbeatRef.current);

      toast.success(isAutoSubmit ? '⏰ Hết giờ — Bài đã tự động nộp.' : '✅ Nộp bài thành công!');
    } catch (e) {
      console.error(e);
      toast.error('Lỗi khi nộp bài. Thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchRanking = (classExamId: string) => {
    onSnapshot(
      query(collection(db, 'classAttempts'), where('classExamId', '==', classExamId)),
      (snap) => {
        const all = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as ClassAttempt))
          .filter(a => a.status === 'submitted')
          .sort((a, b) => b.score - a.score);
        
        setClassRanking(all);
        const rank = all.findIndex(a => a.studentId === user.uid) + 1;
        setMyRank(rank);
      }
    );
  };

  // ── Progress ──
  const answeredCount = Object.values(answers).filter(v => v !== undefined && v !== null && v !== '').length;
  const currentQuestion = questions[currentIndex];

  // ══════════════════════════════════════════
  //  RENDER: JOIN PHASE
  // ══════════════════════════════════════════

  if (phase === 'join') {
    return (
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-violet-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <KeyRound className="w-10 h-10 text-violet-400" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">PHÒNG THI TRỰC TUYẾN</h2>
          <p className="text-slate-400 mt-2 font-medium">Nhập mã lớp 6 ký tự từ thầy/cô để tham gia</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mã lớp</label>
            <input
              type="text"
              value={classCode}
              onChange={e => { setClassCode(e.target.value.toUpperCase().slice(0, 6)); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="VD: K12A1X"
              maxLength={6}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-6 py-4 text-2xl font-black text-white text-center tracking-[0.5em] font-mono placeholder-slate-600 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none uppercase"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-xl flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400 font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={isJoining || classCode.length !== 6}
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-30 flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-violet-600/20"
          >
            {isJoining ? (
              <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin" />
            ) : (
              <Radio className="w-5 h-5" />
            )}
            {isJoining ? 'Đang kết nối...' : 'VÀO PHÒNG THI'}
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  RENDER: EXAM PHASE
  // ══════════════════════════════════════════

  if (phase === 'exam' && currentQuestion) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Bar: Timer + Progress */}
        <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl py-4 flex items-center justify-between gap-4 border-b border-slate-800/50">
          {/* Countdown */}
          <div className={cn(
            "px-4 py-2 rounded-xl font-mono text-lg font-black flex items-center gap-2",
            countdown?.isUrgent
              ? "text-red-400 bg-red-600/10 border border-red-600/30 animate-pulse"
              : "text-white bg-slate-900 border border-slate-800"
          )}>
            <Clock className="w-4 h-4" />
            {countdown?.display || '--:--'}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 font-bold">{answeredCount}/{questions.length} đã làm</span>
            <div className="w-32 bg-slate-800 rounded-full h-2 overflow-hidden hidden sm:block">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${(answeredCount / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            NỘP BÀI
          </button>
        </div>

        {/* Question Navigator (horizontal scroll) */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 custom-scrollbar">
          {questions.map((q, idx) => {
            const isAnswered = answers[q.id || ''] !== undefined && answers[q.id || ''] !== null && answers[q.id || ''] !== '';
            return (
              <button
                key={q.id || idx}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "shrink-0 w-9 h-9 rounded-lg text-xs font-bold transition-all",
                  idx === currentIndex
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30"
                    : isAnswered
                      ? "bg-green-600/20 text-green-400 border border-green-600/30"
                      : "bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600"
                )}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6"
          >
            {/* Header */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "px-3 py-1 rounded-lg text-xs md:text-sm font-black uppercase tracking-widest",
                  currentQuestion.part === 1 ? "bg-blue-600/20 text-blue-400" :
                  currentQuestion.part === 2 ? "bg-fuchsia-600/20 text-fuchsia-400" :
                  "bg-orange-600/20 text-orange-400"
                )}>
                  Phần {currentQuestion.part}
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  Câu {currentIndex + 1}/{questions.length}
                </span>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
                currentQuestion.level === 'Nhận biết' ? "bg-green-600/10 text-green-400" :
                currentQuestion.level === 'Thông hiểu' ? "bg-blue-600/10 text-blue-400" :
                currentQuestion.level === 'Vận dụng' ? "bg-amber-600/10 text-amber-400" :
                "bg-red-600/10 text-red-400"
              )}>
                {currentQuestion.level}
              </span>
            </div>

            {/* Content */}
            <div className="text-white text-fluid-base">
              <MathRenderer content={currentQuestion.content} />
            </div>

            {/* Answer Options */}
            {currentQuestion.part === 1 && currentQuestion.options && (
              <div className="space-y-3">
                {currentQuestion.options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(currentQuestion.id || '', idx)}
                    className={cn(
                      "w-full p-4 rounded-xl border text-left flex items-center gap-4 transition-all touch-target",
                      answers[currentQuestion.id || ''] === idx
                        ? "bg-violet-600/15 border-violet-500/50 text-white"
                        : "bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600"
                    )}
                  >
                    <span className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                      answers[currentQuestion.id || ''] === idx
                        ? "bg-violet-600 text-white"
                        : "bg-slate-800 text-slate-400"
                    )}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-base md:text-lg overflow-x-auto"><MathRenderer content={opt} /></span>
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.part === 2 && currentQuestion.options && (
              <div className="space-y-3">
                {currentQuestion.options.map((opt, idx) => {
                  const currentAnswers = Array.isArray(answers[currentQuestion.id || ''])
                    ? answers[currentQuestion.id || '']
                    : [undefined, undefined, undefined, undefined];
                  
                  return (
                    <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 gap-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                      <span className="text-base md:text-lg text-slate-300 flex-1 overflow-x-auto">
                        <MathRenderer content={opt} />
                      </span>
                      <div className="flex gap-2 shrink-0">
                        {['Đúng', 'Sai'].map((label, boolIdx) => {
                          const value = boolIdx === 0;
                          return (
                            <button
                              key={label}
                              onClick={() => {
                                const newAns = [...currentAnswers];
                                newAns[idx] = value;
                                handleAnswer(currentQuestion.id || '', newAns);
                              }}
                              className={cn(
                                "px-4 py-3 rounded-lg text-xs md:text-sm font-bold transition-all min-w-[70px] touch-target flex-1 md:flex-none text-center",
                                currentAnswers[idx] === value
                                  ? (value ? "bg-green-600 text-white" : "bg-red-600 text-white")
                                  : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {currentQuestion.part === 3 && (
              <div className="space-y-2">
                <label className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-widest">Nhập đáp án (số)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={answers[currentQuestion.id || ''] ?? ''}
                  onChange={e => handleAnswer(currentQuestion.id || '', e.target.value)}
                  onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                  placeholder="VD: 1,25"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-lg text-white font-mono focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none"
                />
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t border-slate-800">
              <button
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs disabled:opacity-30 hover:bg-slate-700 transition-all"
              >
                <ChevronLeft className="w-4 h-4" /> Câu trước
              </button>
              <button
                onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                disabled={currentIndex === questions.length - 1}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl font-bold text-xs disabled:opacity-30 hover:bg-violet-500 transition-all"
              >
                Câu tiếp <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Cheat warning banner */}
        {cheatWarnings > 0 && (
          <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400 font-bold">⚠️ Bạn đã rời trang {cheatWarnings} lần. Hành vi này được ghi nhận.</span>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  RENDER: RESULTS PHASE
  // ══════════════════════════════════════════

  if (phase === 'results') {
    return (
      <div className="max-w-lg mx-auto space-y-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6"
        >
          <div className="w-20 h-20 mx-auto bg-green-600/20 rounded-3xl flex items-center justify-center">
            <Trophy className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white">KẾT QUẢ</h2>
            <p className="text-slate-400 text-sm mt-1">{classExam?.title}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 p-6 rounded-2xl">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Điểm số</p>
              <p className={cn(
                "text-4xl font-black",
                finalScore >= 8 ? "text-amber-400" : finalScore >= 5 ? "text-blue-400" : "text-red-400"
              )}>
                {finalScore.toFixed(2)}
              </p>
            </div>
            <div className="bg-slate-800/50 p-6 rounded-2xl">
              <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Xếp hạng</p>
              <p className="text-4xl font-black text-violet-400">
                {myRank > 0 ? `#${myRank}` : '—'}
              </p>
              <p className="text-[10px] text-slate-500">/{classRanking.length} thí sinh</p>
            </div>
          </div>
        </motion.div>

        {/* Class Ranking */}
        {classRanking.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" /> Bảng xếp hạng lớp
            </h4>
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
              {classRanking.map((a, idx) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border",
                    a.studentId === user.uid
                      ? "bg-violet-600/10 border-violet-500/30"
                      : "bg-slate-950/50 border-slate-800"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black",
                      idx === 0 ? "bg-amber-500/20 text-amber-400" :
                      idx === 1 ? "bg-slate-400/10 text-slate-300" :
                      idx === 2 ? "bg-orange-600/10 text-orange-400" :
                      "bg-slate-800 text-slate-500"
                    )}>
                      {idx < 3 ? <Trophy className="w-4 h-4" /> : idx + 1}
                    </span>
                    <span className={cn("text-sm font-bold", a.studentId === user.uid ? "text-violet-300" : "text-white")}>
                      {a.studentName}
                      {a.studentId === user.uid && <span className="text-[9px] ml-2 text-violet-400">(Bạn)</span>}
                    </span>
                  </div>
                  <span className={cn(
                    "text-lg font-black",
                    a.score >= 8 ? "text-amber-400" : a.score >= 5 ? "text-blue-400" : "text-red-400"
                  )}>
                    {a.score.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => { setPhase('join'); setClassCode(''); setAnswers({}); setQuestions([]); }}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
        >
          Quay lại
        </button>
      </div>
    );
  }

  // Fallback
  return null;
};

export default LiveClassExam;
