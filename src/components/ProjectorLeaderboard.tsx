import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, collection, query, where, onSnapshot, doc, getDoc } from '../firebase';
import { ClassExam, ClassAttempt, Exam } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Trophy, Clock, Radio, Users, CheckCircle2, Zap, Swords } from 'lucide-react';
import { CapacitorBar } from './CapacitorBar';
import type { EnergyEvent } from '../hooks/useEnergyBuffer';

interface ProjectorLeaderboardProps { classExamId: string; }

// ── Tính điểm đội (smart: same-size → sum, diff-size → avg) ──────────────────
function calcTeamScore(attempts: ClassAttempt[], teamId: 'A' | 'B', teamACount: number, teamBCount: number) {
  const members = attempts.filter(a => a.teamId === teamId && a.status === 'submitted');
  if (members.length === 0) return { score: 0, label: '—' };
  const useAvg = teamACount !== teamBCount;
  const score  = useAvg
    ? members.reduce((s, a) => s + a.score, 0) / members.length
    : members.reduce((s, a) => s + a.score, 0);
  return { score, label: score.toFixed(2) };
}

// ── Energy state shape ────────────────────────────────────────────────────────
interface TeamEnergyState {
  totalEnergy: number;
  lastCorrectName: string;
  recentEvents: EnergyEvent[];
}
const EMPTY_ENERGY: TeamEnergyState = { totalEnergy: 0, lastCorrectName: '', recentEvents: [] };

// ─────────────────────────────────────────────────────────────────────────────
const ProjectorLeaderboard: React.FC<ProjectorLeaderboardProps> = ({ classExamId }) => {
  const [classExam,       setClassExam]       = useState<ClassExam | null>(null);
  const [attempts,        setAttempts]        = useState<ClassAttempt[]>([]);
  const [totalQuestions,  setTotalQuestions]  = useState(0);
  const [now,             setNow]             = useState(Date.now());
  const [participantCount,setParticipantCount]= useState(0);

  // ── Energy states ──
  const [energyRoom,  setEnergyRoom]  = useState<TeamEnergyState>(EMPTY_ENERGY);
  const [energyTeamA, setEnergyTeamA] = useState<TeamEnergyState>(EMPTY_ENERGY);
  const [energyTeamB, setEnergyTeamB] = useState<TeamEnergyState>(EMPTY_ENERGY);

  const lastUpdateRef    = useRef(0);
  const pendingAttempts  = useRef<ClassAttempt[]>([]);

  // ── Fetch classExam ──
  useEffect(() => {
    return onSnapshot(doc(db, 'classExams', classExamId), snap => {
      if (snap.exists()) setClassExam({ id: snap.id, ...snap.data() } as ClassExam);
    });
  }, [classExamId]);

  // ── Participants ──
  useEffect(() => {
    return onSnapshot(collection(db, 'classExams', classExamId, 'participants'),
      snap => setParticipantCount(snap.size));
  }, [classExamId]);

  // ── Exam details ──
  useEffect(() => {
    if (!classExam?.examId) return;
    getDoc(doc(db, 'exams', classExam.examId)).then(d => {
      if (d.exists()) setTotalQuestions((d.data() as Exam).questions?.length || 0);
    }).catch(console.error);
  }, [classExam?.examId]);

  // ── Attempts (throttled 3s) ──
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'classAttempts'), where('classExamId', '==', classExamId)),
      snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassAttempt));
        const t = Date.now();
        if (t - lastUpdateRef.current < 3000) { pendingAttempts.current = data; return; }
        lastUpdateRef.current = t;
        setAttempts(data);
      }
    );
    const flush = setInterval(() => {
      if (pendingAttempts.current.length > 0) {
        setAttempts([...pendingAttempts.current]);
        pendingAttempts.current = [];
        lastUpdateRef.current = Date.now();
      }
    }, 3000);
    return () => { unsub(); clearInterval(flush); };
  }, [classExamId]);

  // ── Energy listeners ──
  useEffect(() => {
    const listen = (docId: string, setter: (s: TeamEnergyState) => void) =>
      onSnapshot(
        doc(db, 'classExams', classExamId, 'energyState', docId),
        snap => { if (snap.exists()) setter(snap.data() as TeamEnergyState); },
        err  => console.warn(`[Projector] energyState/${docId} error:`, err)
      );
    const u1 = listen('room',  setEnergyRoom);
    const u2 = listen('teamA', setEnergyTeamA);
    const u3 = listen('teamB', setEnergyTeamB);
    return () => { u1(); u2(); u3(); };
  }, [classExamId]);

  // ── Clock ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Countdown ──
  const countdown = useMemo(() => {
    if (!classExam?.startTime || classExam.status === 'ended') return null;
    const startMs = classExam.startTime?.toDate?.()?.getTime() ?? (classExam.startTime?.seconds || 0) * 1000;
    const remaining = Math.max(0, startMs + classExam.duration * 60000 - now);
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return { remaining, display: `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
             isUrgent: remaining < 300000, isEnded: remaining <= 0 };
  }, [classExam, now]);

  // ── Leaderboard ──
  const leaderboard = useMemo(() =>
    [...attempts].sort((a, b) => {
      if (a.status === 'submitted' && b.status !== 'submitted') return -1;
      if (a.status !== 'submitted' && b.status === 'submitted') return 1;
      if (a.status === 'submitted' && b.status === 'submitted') return b.score - a.score;
      return b.totalAnswered - a.totalAnswered;
    }), [attempts]);

  const submittedCount = attempts.filter(a => a.status === 'submitted').length;
  const isEnded        = classExam?.status === 'ended' || countdown?.isEnded;
  const isTeamMode     = !!classExam?.teamMode;
  const teamNames      = classExam?.teamNames ?? { A: 'Đội Đỏ 🔴', B: 'Đội Xanh 🔵' };

  // ── Team stats ──
  const teamACount  = attempts.filter(a => a.teamId === 'A').length;
  const teamBCount  = attempts.filter(a => a.teamId === 'B').length;
  const scoreA      = calcTeamScore(attempts, 'A', teamACount, teamBCount);
  const scoreB      = calcTeamScore(attempts, 'B', teamACount, teamBCount);
  const teamALeads  = scoreA.score > scoreB.score;
  const teamBLeads  = scoreB.score > scoreA.score;
  const tied        = scoreA.score === scoreB.score && submittedCount > 0;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950 text-white overflow-hidden flex flex-col"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-slate-800/50 bg-slate-950/95 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-black text-3xl tracking-tighter">
            PHYS<span className="text-fuchsia-500">9+</span>
          </span>
          <div className="w-px h-10 bg-slate-800" />
          <div>
            <p className="text-lg font-bold text-white leading-tight">{classExam?.title || 'Phòng Thi'}</p>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">
              {participantCount} join • {attempts.length} thi • {totalQuestions} câu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-600/30 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-blue-400" />
            <span className="text-lg font-black text-blue-300">{submittedCount}/{attempts.length}</span>
            <span className="text-xs text-blue-400 font-bold uppercase">nộp</span>
          </div>
          {classExam?.status === 'live' && countdown && !countdown.isEnded && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/15 border border-red-600/40 rounded-xl">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-black uppercase tracking-widest">LIVE</span>
            </div>
          )}
          {countdown && !countdown.isEnded ? (
            <div className={cn('px-6 py-3 rounded-2xl font-mono text-4xl font-black tracking-wider border',
              countdown.isUrgent ? 'text-red-400 border-red-600/50 bg-red-600/10 animate-pulse'
                                 : 'text-white border-slate-700 bg-slate-900')}>
              <Clock className="w-6 h-6 inline-block mr-3 -mt-1" />{countdown.display}
            </div>
          ) : (
            <div className="px-6 py-3 rounded-2xl font-black text-2xl text-green-400 border border-green-600/30 bg-green-600/10">
              ✅ KẾT THÚC
            </div>
          )}
        </div>
      </div>

      {/* ══════════════ TEAM BATTLE SECTION ══════════════ */}
      {isTeamMode && (
        <div className="shrink-0 px-6 py-4 border-b border-slate-800">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center max-w-7xl mx-auto">

            {/* ── ĐỘI A ── */}
            <motion.div
              animate={{ scale: teamALeads ? 1.02 : 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
              className={cn(
                'relative flex items-center gap-4 p-4 rounded-2xl border-2 transition-all',
                teamALeads
                  ? 'bg-red-600/15 border-red-500/60 shadow-lg shadow-red-600/20'
                  : 'bg-slate-900 border-slate-700'
              )}
            >
              {/* CapacitorBar dọc */}
              <div className="flex flex-col items-center gap-1">
                <CapacitorBar energy={energyTeamA.totalEnergy} recentEvents={energyTeamA.recentEvents} size="lg" showLabel />
              </div>
              {/* Scores */}
              <div className="flex-1">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">
                  {teamNames.A}
                  {teamALeads && <span className="ml-2 text-amber-400">👑 DẪN ĐẦU</span>}
                </p>
                <p className="text-5xl font-black text-red-300 tabular-nums">{scoreA.label}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {teamACount} thành viên • {attempts.filter(a=>a.teamId==='A'&&a.status==='submitted').length} đã nộp
                </p>
                {energyTeamA.lastCorrectName && (
                  <p className="text-[10px] text-amber-400 mt-1 truncate">
                    <Zap className="w-3 h-3 inline" /> {energyTeamA.lastCorrectName}
                  </p>
                )}
              </div>
              {teamALeads && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}}
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{boxShadow:'inset 0 0 30px rgba(239,68,68,0.15)'}} />
              )}
            </motion.div>

            {/* ── VS ── */}
            <div className="flex flex-col items-center gap-2">
              <motion.div
                animate={{ rotate: [0, -5, 5, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              >
                <Swords className={cn('w-12 h-12', tied ? 'text-amber-400' : 'text-slate-600')} />
              </motion.div>
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">VS</span>
              {tied && <span className="text-[10px] text-amber-400 font-bold">ĐANG HÒA!</span>}
              {!tied && submittedCount > 0 && (
                <span className={cn(
                  'text-[10px] font-bold uppercase',
                  teamALeads ? 'text-red-400' : 'text-blue-400'
                )}>
                  {teamALeads ? teamNames.A : teamNames.B} đang thắng
                </span>
              )}
            </div>

            {/* ── ĐỘI B ── */}
            <motion.div
              animate={{ scale: teamBLeads ? 1.02 : 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
              className={cn(
                'relative flex items-center gap-4 p-4 rounded-2xl border-2 transition-all flex-row-reverse text-right',
                teamBLeads
                  ? 'bg-blue-600/15 border-blue-500/60 shadow-lg shadow-blue-600/20'
                  : 'bg-slate-900 border-slate-700'
              )}
            >
              <div className="flex flex-col items-center gap-1">
                <CapacitorBar energy={energyTeamB.totalEnergy} recentEvents={energyTeamB.recentEvents} size="lg" showLabel />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">
                  {teamNames.B}
                  {teamBLeads && <span className="ml-2 text-amber-400">👑 DẪN ĐẦU</span>}
                </p>
                <p className="text-5xl font-black text-blue-300 tabular-nums">{scoreB.label}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {teamBCount} thành viên • {attempts.filter(a=>a.teamId==='B'&&a.status==='submitted').length} đã nộp
                </p>
                {energyTeamB.lastCorrectName && (
                  <p className="text-[10px] text-amber-400 mt-1 truncate">
                    <Zap className="w-3 h-3 inline" /> {energyTeamB.lastCorrectName}
                  </p>
                )}
              </div>
              {teamBLeads && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}}
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{boxShadow:'inset 0 0 30px rgba(59,130,246,0.15)'}} />
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* ── Non-team mode: single CapacitorBar ── */}
      {!isTeamMode && classExam?.status === 'live' && (
        <div className="shrink-0 flex justify-center py-3 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <CapacitorBar energy={energyRoom.totalEnergy} recentEvents={energyRoom.recentEvents} size="lg" showLabel />
            {energyRoom.lastCorrectName && (
              <p className="text-xs text-amber-400 font-bold">⚡ {energyRoom.lastCorrectName}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Leaderboard ── */}
      <div className="flex-1 overflow-hidden px-8 py-4 flex flex-col">
        <div className="flex items-center px-6 py-2 text-sm font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 shrink-0">
          <div className="w-20 text-center">HẠNG</div>
          {isTeamMode && <div className="w-24 text-center">ĐỘI</div>}
          <div className="flex-1">HỌ TÊN</div>
          <div className="w-32 text-center">TRẠNG THÁI</div>
          <div className="w-40 text-center">ĐIỂM SỐ</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 py-2">
          <AnimatePresence>
            {leaderboard.map((attempt, index) => {
              const rank   = index + 1;
              const isTop3 = rank <= 3 && attempt.status === 'submitted' && isEnded;
              const isA    = attempt.teamId === 'A';
              const isB    = attempt.teamId === 'B';
              return (
                <motion.div
                  key={attempt.id}
                  layoutId={`projector-${attempt.id}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ layout: { type: 'spring', stiffness: 200, damping: 25 } }}
                  className={cn(
                    'flex items-center px-6 py-3 rounded-2xl border transition-colors',
                    attempt.status === 'submitted' && isEnded
                      ? rank === 1 ? 'bg-gradient-to-r from-amber-600/15 to-transparent border-amber-500/30'
                        : rank === 2 ? 'bg-gradient-to-r from-slate-400/10 to-transparent border-slate-400/20'
                        : rank === 3 ? 'bg-gradient-to-r from-orange-700/10 to-transparent border-orange-600/20'
                        : 'bg-slate-900/30 border-transparent'
                      : 'bg-slate-900/30 border-transparent'
                  )}
                >
                  <div className="w-20 text-center">
                    {isTop3 ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.2 }}
                        className={cn('w-12 h-12 mx-auto rounded-xl flex items-center justify-center',
                          rank===1?'bg-amber-500/20':rank===2?'bg-slate-400/15':'bg-orange-600/15')}>
                        <Trophy className={cn('w-7 h-7',rank===1?'text-amber-400':rank===2?'text-slate-300':'text-orange-400')} />
                      </motion.div>
                    ) : (
                      <span className="text-3xl font-black text-slate-600">{rank}</span>
                    )}
                  </div>

                  {/* Team badge */}
                  {isTeamMode && (
                    <div className="w-24 flex justify-center">
                      <span className={cn(
                        'px-2 py-1 rounded-lg text-[10px] font-black uppercase',
                        isA ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                           : isB ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                           : 'text-slate-600'
                      )}>
                        {isA ? teamNames.A.slice(0,6) : isB ? teamNames.B.slice(0,6) : '—'}
                      </span>
                    </div>
                  )}

                  <div className="flex-1">
                    <p className={cn('font-black tracking-tight', isTop3?'text-3xl':'text-2xl',
                      rank===1?'text-amber-300':'text-white')}>
                      {attempt.studentName}
                    </p>
                  </div>

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

                  <div className="w-40 text-center">
                    {attempt.status === 'submitted' ? (
                      <motion.span initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className={cn('font-black', isTop3?'text-5xl':'text-4xl',
                          attempt.score>=8?'text-amber-400':attempt.score>=5?'text-blue-400':'text-red-400')}>
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
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 py-16">
              <Users className="w-20 h-20 mb-6 opacity-30" />
              <p className="text-2xl font-bold">Đang chờ thí sinh tham gia...</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-8 py-3 border-t border-slate-800/50 flex justify-between items-center text-slate-600 text-xs shrink-0">
        <span>© 2026 PHYS-9+ | Phòng Thi Tập Trung</span>
        <span className="font-mono">{new Date().toLocaleTimeString('vi-VN')}</span>
      </div>
    </div>
  );
};

export default ProjectorLeaderboard;
