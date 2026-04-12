import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, collection, query, where, onSnapshot, doc, getDoc } from '../firebase';
import { ClassExam, ClassAttempt, Exam } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Trophy, Clock, Radio, Users, CheckCircle2 } from 'lucide-react';

interface ProjectorLeaderboardProps {
  classExamId: string;
}

const ProjectorLeaderboard: React.FC<ProjectorLeaderboardProps> = ({ classExamId }) => {
  const [classExam, setClassExam] = useState<ClassExam | null>(null);
  const [attempts, setAttempts] = useState<ClassAttempt[]>([]);
  const [examTitle, setExamTitle] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [participantCount, setParticipantCount] = useState(0);

  // Throttle re-renders: only update state every 3 seconds
  const lastUpdateRef = useRef(0);
  const pendingAttemptsRef = useRef<ClassAttempt[]>([]);

  // ── Fetch classExam info ──
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'classExams', classExamId), (snap) => {
      if (snap.exists()) {
        setClassExam({ id: snap.id, ...snap.data() } as ClassExam);
      }
    });
    return unsub;
  }, [classExamId]);

  // ── Listen participants sub-collection (scalable join count) ──
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'classExams', classExamId, 'participants'),
      (snap) => setParticipantCount(snap.size)
    );
    return unsub;
  }, [classExamId]);

  // ── Fetch exam details (title, question count) ──
  useEffect(() => {
    if (!classExam?.examId) return;
    const fetchExam = async () => {
      try {
        const examDoc = await getDoc(doc(db, 'exams', classExam.examId));
        if (examDoc.exists()) {
          const exam = examDoc.data() as Exam;
          setExamTitle(exam.title);
          setTotalQuestions(exam.questions?.length || 0);
        }
      } catch (e) { console.error(e); }
    };
    fetchExam();
  }, [classExam?.examId]);

  // ── Listen classAttempts — THROTTLED for bandwidth ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'classAttempts'), where('classExamId', '==', classExamId)),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassAttempt));
        const now = Date.now();
        
        // Throttle: only update UI every 3 seconds
        if (now - lastUpdateRef.current < 3000) {
          pendingAttemptsRef.current = data;
          return;
        }
        
        lastUpdateRef.current = now;
        setAttempts(data);
      }
    );

    // Flush pending updates every 3 seconds
    const flushInterval = setInterval(() => {
      if (pendingAttemptsRef.current.length > 0) {
        setAttempts([...pendingAttemptsRef.current]);
        pendingAttemptsRef.current = [];
        lastUpdateRef.current = Date.now();
      }
    }, 3000);

    return () => { unsub(); clearInterval(flushInterval); };
  }, [classExamId]);

  // ── Clock update every second ──
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Countdown calculation ──
  const countdown = useMemo(() => {
    if (!classExam?.startTime || classExam.status === 'ended') return null;
    
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
      isUrgent: remaining < 5 * 60 * 1000, // < 5 minutes
      isEnded: remaining <= 0,
    };
  }, [classExam, now]);

  // ── Sorted leaderboard ──
  const leaderboard = useMemo(() => {
    return [...attempts].sort((a, b) => {
      // Submitted first, then by score desc
      if (a.status === 'submitted' && b.status !== 'submitted') return -1;
      if (a.status !== 'submitted' && b.status === 'submitted') return 1;
      if (a.status === 'submitted' && b.status === 'submitted') return b.score - a.score;
      return b.totalAnswered - a.totalAnswered;
    });
  }, [attempts]);

  const submittedCount = attempts.filter(a => a.status === 'submitted').length;
  const isEnded = classExam?.status === 'ended' || countdown?.isEnded;

  // ══════════════════════════════════════════
  //  PROJECTOR FULL-SCREEN RENDER
  // ══════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950 text-white overflow-hidden flex flex-col"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >
      {/* ── Top Bar: Logo + Title + Clock ── */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800/50 bg-slate-950/95 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <span className="font-black text-3xl tracking-tighter">
            PHYS<span className="text-fuchsia-500">9+</span>
          </span>
          <div className="w-px h-10 bg-slate-800" />
          <div>
            <p className="text-lg font-bold text-white leading-tight">{classExam?.title || 'Phòng Thi'}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">
              {participantCount} đã join • {attempts.length} đang thi • {totalQuestions} câu hỏi
            </p>
          </div>
        </div>

        {/* Status + Countdown */}
        <div className="flex items-center gap-6">
          {/* Submitted counter */}
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-600/30 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-blue-400" />
            <span className="text-lg font-black text-blue-300">{submittedCount}/{attempts.length}</span>
            <span className="text-xs text-blue-400 font-bold uppercase">đã nộp</span>
          </div>

          {/* Live indicator */}
          {classExam?.status === 'live' && countdown && !countdown.isEnded && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/15 border border-red-600/40 rounded-xl">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-black uppercase tracking-widest">LIVE</span>
            </div>
          )}

          {/* Countdown */}
          {countdown && !countdown.isEnded ? (
            <div className={cn(
              "px-6 py-3 rounded-2xl font-mono text-4xl font-black tracking-wider border",
              countdown.isUrgent
                ? "text-red-400 border-red-600/50 bg-red-600/10 animate-pulse"
                : "text-white border-slate-700 bg-slate-900"
            )}>
              <Clock className="w-6 h-6 inline-block mr-3 -mt-1" />
              {countdown.display}
            </div>
          ) : (
            <div className="px-6 py-3 rounded-2xl font-black text-2xl text-green-400 border border-green-600/30 bg-green-600/10">
              ✅ KẾT THÚC
            </div>
          )}
        </div>
      </div>

      {/* ── Leaderboard Content ── */}
      <div className="flex-1 overflow-hidden px-8 py-6 flex flex-col">
        {/* Column Headers */}
        <div className="flex items-center px-6 py-3 text-sm font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 shrink-0">
          <div className="w-20 text-center">HẠNG</div>
          <div className="flex-1">HỌ TÊN</div>
          <div className="w-32 text-center">TRẠNG THÁI</div>
          <div className="w-40 text-center">ĐIỂM SỐ</div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 py-3">
          <AnimatePresence>
            {leaderboard.map((attempt, index) => {
              const rank = index + 1;
              const isTop3 = rank <= 3 && attempt.status === 'submitted' && isEnded;

              return (
                <motion.div
                  key={attempt.id}
                  layoutId={`projector-${attempt.id}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 200, damping: 25 },
                    opacity: { duration: 0.3 },
                  }}
                  className={cn(
                    "flex items-center px-6 py-4 rounded-2xl transition-colors",
                    attempt.status === 'submitted' && isEnded
                      ? rank === 1 ? "bg-gradient-to-r from-amber-600/15 to-transparent border border-amber-500/30"
                        : rank === 2 ? "bg-gradient-to-r from-slate-400/10 to-transparent border border-slate-400/20"
                        : rank === 3 ? "bg-gradient-to-r from-orange-700/10 to-transparent border border-orange-600/20"
                        : "bg-slate-900/30 border border-transparent"
                      : "bg-slate-900/30 border border-transparent"
                  )}
                >
                  {/* Rank */}
                  <div className="w-20 text-center">
                    {isTop3 ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.2 }}
                        className={cn(
                          "w-12 h-12 mx-auto rounded-xl flex items-center justify-center",
                          rank === 1 ? "bg-amber-500/20" : rank === 2 ? "bg-slate-400/15" : "bg-orange-600/15"
                        )}
                      >
                        <Trophy className={cn(
                          "w-7 h-7",
                          rank === 1 ? "text-amber-400" : rank === 2 ? "text-slate-300" : "text-orange-400"
                        )} />
                      </motion.div>
                    ) : (
                      <span className="text-3xl font-black text-slate-600">{rank}</span>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1">
                    <p className={cn(
                      "font-black tracking-tight",
                      isTop3 ? "text-3xl" : "text-2xl",
                      rank === 1 ? "text-amber-300" : "text-white"
                    )}>
                      {attempt.studentName}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="w-32 text-center">
                    {attempt.status === 'submitted' ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600/15 text-green-400 rounded-full text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Đã nộp
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600/15 text-amber-400 rounded-full text-sm font-bold">
                        <Clock className="w-4 h-4" /> {attempt.totalAnswered}/{totalQuestions}
                      </span>
                    )}
                  </div>

                  {/* Score */}
                  <div className="w-40 text-center">
                    {attempt.status === 'submitted' ? (
                      <motion.span
                        initial={{ scale: 1.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={cn(
                          "font-black",
                          isTop3 ? "text-5xl" : "text-4xl",
                          attempt.score >= 8 ? "text-amber-400" :
                          attempt.score >= 5 ? "text-blue-400" : "text-red-400"
                        )}
                      >
                        {attempt.score.toFixed(2)}
                      </motion.span>
                    ) : (
                      <span className="text-3xl font-black text-slate-700">—</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {leaderboard.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 py-20">
              <Users className="w-20 h-20 mb-6 opacity-30" />
              <p className="text-2xl font-bold">Đang chờ thí sinh tham gia...</p>
              <p className="text-lg mt-2">Hãy chia sẻ mã lớp cho học sinh</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-8 py-3 border-t border-slate-800/50 flex justify-between items-center text-slate-600 text-xs shrink-0">
        <span>© 2026 PHYS-9+ | Phòng Thi Tập Trung</span>
        <span className="font-mono">{new Date().toLocaleTimeString('vi-VN')}</span>
      </div>
    </div>
  );
};

export default ProjectorLeaderboard;
