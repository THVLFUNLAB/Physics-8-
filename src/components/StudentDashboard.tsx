import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { UserProfile, Attempt, Topic, Exam } from '../types';
import { useStudentStats } from '../hooks/useDashboardStats';
import {
  User as UserIcon, BookOpen, Target, ChevronRight, History, BrainCircuit,
  Trophy, Activity, AlertTriangle, FlaskConical, Award, Archive,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis,
  Tooltip as RechartsTooltip
} from 'recharts';
import { UserRankCard } from './UserRankCard';
import { BehavioralAnalysisChart } from './charts/BehavioralChart';
import { BadgeGallery } from './common';

import { CountdownTimer } from './CountdownTimer';
import { MotivationalQuote } from './MotivationalQuote';
import { BackgroundMusic } from './BackgroundMusic';

import KnowledgeGapGallery from './KnowledgeGapGallery';
import TeacherMessageModal from './TeacherMessageModal';
import { toast } from './Toast';

// Render components các khối
import Grade10Dashboard from './Grade10Dashboard';
import Grade11Dashboard from './Grade11Dashboard';
import Grade12Dashboard from './Grade12Dashboard';
import { GradeLeaderboard } from './GradeLeaderboard';

export const StudentDashboard = ({ user, attempts, onStartPrescription, onStartExam }: { user: UserProfile, attempts: Attempt[], onStartPrescription: (topic: Topic, examId: string) => void, onStartExam: (exam: Exam) => void }) => {
  const studentStats = useStudentStats(user, attempts);

  const stats = useMemo(() => {
    if (attempts.length === 0) return null;
    const totalScore = attempts.reduce((acc, a) => acc + a.score, 0);
    const avgScore = (totalScore / attempts.length).toFixed(1);

    // Topic performance for Radar Chart
    const topicData: Record<string, { total: number, score: number }> = {};
    attempts.forEach(a => {
      if (!topicData[a.testId]) topicData[a.testId] = { total: 0, score: 0 };
      topicData[a.testId].total += 1;
      topicData[a.testId].score += a.score;
    });

    const radarData = Object.entries(topicData).map(([name, data]) => ({
      subject: name,
      A: (data.score / (data.total * 3)) * 100,
      fullMark: 100
    }));

    const progressData = attempts.slice().reverse().map(a => ({
      date: new Date(a.timestamp?.seconds * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      score: (a.score / 3) * 10
    }));

    return { avgScore, radarData, progressData };
  }, [attempts]);

  return (
    <div className="space-y-10">
      {/* ── Tâm Thư AI Modal (Auto-popup nếu có thư chưa đọc) ── */}
      <TeacherMessageModal studentId={user.uid} />
      {/* ── Header: Avatar + Info + Streak ── */}
      <div className="relative overflow-hidden bg-slate-900/50 backdrop-blur-md border border-slate-700/50 p-4 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-600/5 blur-3xl rounded-full translate-y-1/2 -translate-x-1/4 pointer-events-none" />
        <div className="flex items-center gap-6 relative z-10">
          {user.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl border-2 border-cyan-500/30 object-cover shadow-lg shadow-cyan-500/10" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-20 h-20 bg-cyan-600/10 rounded-3xl flex items-center justify-center border border-cyan-600/20">
              <UserIcon className="text-cyan-500 w-10 h-10" />
            </div>
          )}
          <div>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-black font-headline tracking-tight mb-1 text-gradient-cyber">CHÀO CHIẾN BINH, {user.displayName}</h2>
            <p className="text-slate-400 font-medium font-sans leading-7">Hệ thống đã chuẩn bị lộ trình huấn luyện hôm nay.</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                Nhóm: {user.targetGroup}
              </span>
              <span className="bg-green-600/10 text-green-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                Trạng thái: Đang điều trị
              </span>
              {(user.streak ?? 0) > 0 && (
                <span className="bg-orange-600/10 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest animate-pulse">
                  🔥 Streak: {user.streak} ngày
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="text-center bg-slate-800/50 px-5 py-3 rounded-2xl border border-slate-700">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Streak</p>
            <p className="text-2xl font-black text-orange-400">🔥 {user.streak || 0}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Ngày nhập viện</p>
            <p className="text-white font-bold">{new Date(user.createdAt?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
          </div>
        </div>
      </div>

      {/* ── GIAO DIỆN KHỐI (DYNAMIC ROUTING) — Cá nhân hóa 100% ── */}
      {(() => {
        const cName = user.className || '';
        if (cName.startsWith('12L')) return <Grade12Dashboard onStartPrescription={onStartPrescription} onStartExam={onStartExam} />;
        if (cName.startsWith('11L')) return <Grade11Dashboard onStartPrescription={onStartPrescription} onStartExam={onStartExam} />;
        if (cName.startsWith('10L')) return <Grade10Dashboard onStartPrescription={onStartPrescription} onStartExam={onStartExam} />;
        return <Grade12Dashboard onStartPrescription={onStartPrescription} onStartExam={onStartExam} />; // Mặc định nếu không rõ
      })()}

      {/* ── Rank Card ── */}
      <UserRankCard user={user} />

      {/* ── BẢNG PHONG THẦN (LEADERBOARD THEO KHỐI) ── */}
      <GradeLeaderboard currentUser={user} />

      {/* ── ATTEMPTS PROGRESS BAR (Monetization) ── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden">
        {user.tier === 'vip' || user.isUnlimited ? (
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />
        ) : null}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 z-10">
            <Target className={cn("w-4 h-4", user.tier === 'vip' || user.isUnlimited ? "text-amber-500" : "text-slate-300")} />
            Lượt dùng thử
            {user.tier === 'vip' || user.isUnlimited ? (
               <span className="ml-2 bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">VIP</span>
            ) : null}
          </h3>
          <span className={cn(
             "text-xs font-black z-10", 
             user.tier === 'vip' || user.isUnlimited ? "text-amber-500 text-lg" : 
             (user.usedAttempts || 0) > 25 ? "text-red-500" : 
             (user.usedAttempts || 0) >= 20 ? "text-amber-500" : 
             "text-emerald-500"
          )}>
            {user.tier === 'vip' || user.isUnlimited ? '∞' : `${user.usedAttempts || 0} / 30`}
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden relative z-10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: user.tier === 'vip' || user.isUnlimited ? '100%' : `${Math.min(100, ((user.usedAttempts || 0) / 30) * 100)}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className={cn(
               "h-full rounded-full relative",
               user.tier === 'vip' || user.isUnlimited ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300" : 
               (user.usedAttempts || 0) > 25 ? "bg-gradient-to-r from-red-600 via-red-500 to-rose-400" : 
               (user.usedAttempts || 0) >= 20 ? "bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400" : 
               "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400"
            )}
          >
            {user.tier === 'vip' || user.isUnlimited ? (
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
            ) : null}
          </motion.div>
        </div>
        <div className="flex justify-between mt-2 z-10 relative">
          <p className="text-[10px] text-slate-500">
            {user.tier === 'vip' || user.isUnlimited 
              ? '✨ Quyền lực tuyệt đối! Không giới hạn số đề ôn luyện.'
              : 'Nâng cấp VIP để mở khóa Vô Hạn lượt thi.'}
          </p>
          {user.tier !== 'vip' && !user.isUnlimited && (
             <a href="https://zalo.me/0962662736?text=Em%20ch%C3%A0o%20Th%E1%BA%A7y%20H%E1%BA%ADu%2C%20em%20mu%E1%BB%91n%20n%C3%A2ng%20c%E1%BA%A5p%20t%C3%A0i%20kho%E1%BA%A3n%20VIP%20PHY8%2B" target="_blank" className="text-[10px] font-bold text-amber-500 hover:text-amber-400 uppercase">
               Nâng cấp ngay »
             </a>
          )}
        </div>
      </div>

      {/* ── Learning Path Progress Bar ── */}
      {user.learningPath && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-red-500" />
              Lộ trình Chinh phục 8.0+
            </h3>
            <span className="text-xs font-black text-red-500">{Math.round(user.learningPath.overallProgress)}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${user.learningPath.overallProgress}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400"
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-[10px] text-slate-500">
              {user.learningPath.completedTopics.length > 0 
                ? `✅ ${user.learningPath.completedTopics.length} chủ đề hoàn thành`
                : 'Chưa hoàn thành chủ đề nào'
              }
            </p>
            {user.learningPath.weaknesses.length > 0 && (
              <p className="text-[10px] text-red-400">
                ⚠️ {user.learningPath.weaknesses.length} điểm yếu cần khắc phục
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Chỉ số Sức khỏe (GPA)', value: studentStats.gpa, icon: Trophy, color: 'text-amber-500', glow: 'hover:border-amber-500/40 hover:shadow-amber-500/10' },
          { label: 'Liều thuốc đã dùng', value: `${studentStats.completedTests} Đề`, icon: BookOpen, color: 'text-blue-500', glow: 'hover:border-blue-500/40 hover:shadow-blue-500/10' },
          { label: 'Chuỗi ngày học', value: `${studentStats.streak} Ngày`, icon: History, color: 'text-orange-500', glow: 'hover:border-orange-500/40 hover:shadow-orange-500/10' },
          { label: 'Vùng Đỏ (Nguy kịch)', value: studentStats.redZoneCount.toString(), icon: AlertTriangle, color: 'text-red-500', glow: 'hover:border-red-500/40 hover:shadow-red-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn("bg-slate-900/50 backdrop-blur-md border border-slate-700/50 p-6 rounded-3xl transition-all duration-300 hover:-translate-y-0.5", stat.glow)}
            style={{ boxShadow: 'none' }}
            whileHover={{ boxShadow: '0 0 20px rgba(0,0,0,0.2)' }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-3 rounded-2xl bg-slate-800/80", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-5">{stat.label}</p>
            <p className="text-3xl font-black text-white mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Progress Chart */}
        <div className="lg:col-span-2 bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2 font-headline">
              <History className="text-cyan-400" />
              Tiến Độ Lộ Trình
            </h3>
          </div>
          
          <div className="h-[300px] w-full">
            {studentStats.progressData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={studentStats.progressData}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15,23,42,0.95)', 
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(100,116,139,0.3)', 
                      borderRadius: '16px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      padding: '12px 16px',
                    }}
                    itemStyle={{ color: '#06b6d4', fontWeight: 700, fontSize: '14px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}
                    formatter={(value: any) => [`${Number(value).toFixed(1)} điểm`, 'Điểm']}
                    cursor={{ stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#06b6d4" 
                    fillOpacity={1} 
                    fill="url(#colorScore)" 
                    strokeWidth={3}
                    dot={{ fill: '#06b6d4', strokeWidth: 2, stroke: '#0f172a', r: 5 }}
                    activeDot={{ fill: '#06b6d4', strokeWidth: 3, stroke: '#0f172a', r: 7, style: { filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.5))' } }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 italic text-sm">
                Chưa đủ dữ liệu để vẽ tiến trình.
              </div>
            )}
          </div>
        </div>

        {/* Behavioral Analysis */}
        <div className="space-y-8">
          <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/8 rounded-full blur-3xl pointer-events-none" />
            <h3 className="text-2xl font-bold text-white flex items-center gap-2 mb-8 font-headline relative z-10">
              <BrainCircuit className="text-fuchsia-400" />
              Phân Tích Hành Vi
            </h3>
            <BehavioralAnalysisChart 
              careless={user.behavioralSummary?.careless || 0} 
              fundamental={user.behavioralSummary?.fundamental || 0} 
            />
            <div className="mt-6 space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Lỗi ẩu (Kỹ thuật)</span>
                <span className="text-blue-500 font-bold">{user.behavioralSummary?.careless || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Hổng gốc (Bản chất)</span>
                <span className="text-red-500 font-bold">{user.behavioralSummary?.fundamental || 0}</span>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-800">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Award className="w-3 h-3" />
                Danh hiệu đạt được
              </h4>
              <BadgeGallery badges={user.badges} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
              <Activity className="text-green-500 w-4 h-4" />
              Hoạt động gần đây
            </h3>
            <div className="space-y-4">
              {attempts.slice(0, 3).map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  <p className="text-xs text-slate-400">
                    Đã hoàn thành đề <span className="text-white font-bold">{a.testId}</span> với <span className="text-red-500">{a.score.toFixed(1)}đ</span>
                  </p>
                </div>
              ))}
              {attempts.length === 0 && <p className="text-xs text-slate-600 italic">Chưa có hoạt động nào.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bài Tập & Kiểm Tra: ĐÃ CHUYỂN VÀO TỪNG Grade*Dashboard ── */}

      {/* ── Kho Ôn Tập (Knowledge Gap Bucket) ── */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-[2rem] p-8 mb-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 relative z-10">
          <div>
            <h3 className="font-headline font-bold text-3xl text-white flex items-center gap-3">
              <Archive className="text-orange-500 w-8 h-8" />
              Kho Ôn Tập
            </h3>
            <p className="text-slate-400 text-sm mt-2 font-medium">Knowledge Gap Bucket: Các câu hỏi AI đề xuất dựa trên lỗ hổng kiến thức hiện tại.</p>
          </div>
          <button 
            onClick={() => {
              if (user.knowledgeGapVault && user.knowledgeGapVault.length > 0) {
                toast.info(`Bạn có ${user.knowledgeGapVault.length} câu hỏi trong kho. Tính năng bốc thuốc từ Kho đang phát triển.`);
              } else {
                toast.info("Kho ôn tập của bạn đang trống!");
              }
            }} 
            className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 active:scale-95 duration-200"
          >
            Luyện Tập Ngay
          </button>
        </div>
        
        {/* Render Knowledge Gap Vault */}
        <KnowledgeGapGallery vaultIds={user.knowledgeGapVault || []} />
      </div>

      <div id="treatment" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Prescription History */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="text-2xl font-bold text-white flex items-center gap-2 font-headline relative z-10">
            <FlaskConical className="text-amber-500" />
            Lịch Sử Kê Đơn (Treatment Log)
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {user.prescriptions?.map((p, i) => (
              <div 
                key={i} 
                onClick={p.status === 'pending' ? () => onStartPrescription(p.title as Topic, p.examId) : undefined}
                className={cn(
                  "flex items-center justify-between p-4 border rounded-2xl transition-all",
                  p.status === 'pending' 
                    ? "bg-amber-600/5 border-amber-600/20 hover:border-amber-500 cursor-pointer" 
                    : "bg-slate-950/50 border-slate-800"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    p.status === 'completed' ? "bg-green-600/10 text-green-500" : "bg-amber-600/10 text-amber-500"
                  )}>
                    {p.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <History className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{p.title}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Giao ngày: {new Date(p.assignedAt?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
                    p.status === 'completed' ? "bg-green-600/10 text-green-500" : "bg-amber-600/10 text-amber-500"
                  )}>
                    {p.status === 'completed' ? `Đạt ${p.score?.toFixed(1)}đ` : 'Uống thuốc ngay'}
                  </span>
                </div>
              </div>
            ))}
            {(!user.prescriptions || user.prescriptions.length === 0) && (
              <div className="text-center py-10 text-slate-600 italic text-xs">Chưa có đơn thuốc nào được kê.</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="text-2xl font-bold text-white flex items-center gap-2 font-headline relative z-10">
            <History className="text-blue-500" />
            Hoạt Động Gần Đây
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {attempts.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-slate-600 transition-colors cursor-pointer">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg",
                  a.score >= 2 ? "bg-green-600/10 text-green-500" : "bg-red-600/10 text-red-500"
                )}>
                  {a.score.toFixed(1)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white truncate">{a.testId}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">{new Date(a.timestamp?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </div>
            ))}
            {attempts.length === 0 && (
              <div className="text-center py-10 text-slate-600 italic text-xs">Chưa có hoạt động nào.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
