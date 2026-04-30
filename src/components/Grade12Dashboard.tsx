import React, { useState, useEffect } from 'react';
import { Rocket, Target, Clock, Star, AlertTriangle, BrainCircuit, Play, Settings } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TopicCard } from './TopicCard';
import { ExamsList } from './ExamsList';
import { Topic, Exam, UserProfile } from '../types';
import { UserRankCard } from './UserRankCard';
import { GradeLeaderboard } from './GradeLeaderboard';

// ═══════════════════════════════════════════
//  Định nghĩa Topics chính thức của Lớp 12
// ═══════════════════════════════════════════
const GRADE_12_TOPICS: { topic: Topic; displayName: string; color: string }[] = [
  { topic: 'Vật lí nhiệt', displayName: 'Chương 1: Vật Lý Nhiệt', color: '#f97316' },
  { topic: 'Khí lí tưởng', displayName: 'Chương 2: Khí Lý Tưởng', color: '#3b82f6' },
  { topic: 'Từ trường', displayName: 'Chương 3: Từ Trường', color: '#8b5cf6' },
  { topic: 'Vật lí hạt nhân', displayName: 'Chương 4: VL Hạt Nhân', color: '#10b981' },
];

// ═══ Props Interface ═══
interface Grade12DashboardProps {
  user?: UserProfile;
  onStartPrescription?: (topic: Topic, examId: string) => void;
  onStartExam?: (exam: Exam) => void;
  onDownloadPDF?: (exam: Exam) => void;
}

// ═══ Hero Countdown (giữ nguyên 100% logic cũ) ═══
function HeroCountdown() {
  const calculateTimeLeft = () => {
    // 7h00 sáng ngày 11 tháng 6 năm 2026
    const examDate = new Date('2026-06-11T07:00:00');
    const now = new Date();
    const difference = examDate.getTime() - now.getTime();

    if (difference <= 0) return { days: '00', hours: '00', minutes: '00', seconds: '00' };

    const days = Math.floor(difference / (1000 * 60 * 60 * 24)).toString().padStart(2, '0');
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
    const minutes = Math.floor((difference / 1000 / 60) % 60).toString().padStart(2, '0');
    const seconds = Math.floor((difference / 1000) % 60).toString().padStart(2, '0');

    return { days, hours, minutes, seconds };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-[0_0_20px_rgba(225,29,72,0.15)] group p-6 sm:p-10">
      {/* [FIX] pointer-events-none trên tất cả decorative divs */}
      <div className="absolute top-0 right-0 -m-8 w-32 h-32 bg-rose-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-rose-500/30 transition duration-700"></div>
      <div className="absolute bottom-0 left-0 -m-8 w-32 h-32 bg-red-600/20 blur-3xl rounded-full pointer-events-none group-hover:bg-red-600/30 transition duration-700"></div>
      
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-wider mb-2">
            <Rocket className="w-4 h-4" /> Khối 12 GDPT 2018
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">TRẠM VỀ ĐÍCH <br className="hidden sm:block"/>ĐẠI HỌC</h1>
          <p className="text-slate-400 text-sm">Trận chiến cuối cùng. Rực cháy đam mê!</p>
        </div>

        <div className="w-full md:w-auto bg-slate-950/80 p-5 rounded-2xl border border-slate-800/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-3">
            <Clock className="w-4 h-4 stroke-rose-400" /> TỚI NGÀY THI THPTQG
          </div>
          <div className="flex justify-between gap-2 text-center text-white font-black text-2xl sm:text-3xl font-mono tracking-widest min-w-[280px]">
            <div className="flex flex-col"><span className="text-rose-400 drop-shadow-[0_0_8px_rgba(225,29,72,0.6)]">{timeLeft.days}</span><span className="text-[10px] text-slate-500 uppercase mt-1">Ngày</span></div>
            <span className="text-slate-600 animate-pulse">:</span>
            <div className="flex flex-col"><span className="text-white">{timeLeft.hours}</span><span className="text-[10px] text-slate-500 uppercase mt-1">Giờ</span></div>
            <span className="text-slate-600 animate-pulse">:</span>
            <div className="flex flex-col"><span className="text-white">{timeLeft.minutes}</span><span className="text-[10px] text-slate-500 uppercase mt-1">Phút</span></div>
            <span className="text-slate-600 animate-pulse">:</span>
            <div className="flex flex-col"><span className="text-white">{timeLeft.seconds}</span><span className="text-[10px] text-slate-500 uppercase mt-1">Giây</span></div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800/50">
        <div className="flex justify-between items-end mb-2">
           <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
             <Target className="w-4 h-4 text-red-400" /> Mục tiêu Vật Lý:
           </div>
           <div className="text-red-400 font-black flex items-center gap-1">
             <Star className="w-4 h-4 fill-red-400" /> 9.0+
           </div>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-gradient-to-r from-red-600 to-rose-400 rounded-full relative w-[90%] shadow-[0_0_10px_rgba(225,29,72,0.6)]">
             <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/30 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ Radar Chart (giữ nguyên visual) ═══
const mockData = [
  { subject: 'Vật lí Nhiệt', score: 90, fullMark: 100 },
  { subject: 'Khí Lý Tưởng', score: 85, fullMark: 100 },
  { subject: 'Từ Trường', score: 70, fullMark: 100 },
  { subject: 'Vật lí hạt nhân', score: 65, fullMark: 100 },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-rose-500/30 p-3 rounded-xl shadow-[0_0_15px_rgba(225,29,72,0.2)]">
        <p className="text-white font-bold text-sm mb-1">{payload[0].payload.subject}</p>
        <p className="text-rose-400 font-black text-lg">{payload[0].value}% <span className="text-[10px] text-slate-500 uppercase">Thông thạo</span></p>
      </div>
    );
  }
  return null;
};

function MasteryRadarChart() {
  return (
    <div className="w-full h-[350px] bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-[0_0_15px_rgba(15,23,42,0.5)] flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={mockData}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }} 
          />
          <Tooltip content={<CustomTooltip />} />
          <Radar
            name="Khối 12"
            dataKey="score"
            stroke="#f43f5e"
            strokeWidth={3}
            fill="#e11d48"
            fillOpacity={0.4}
            className="drop-shadow-[0_0_8px_rgba(225,29,72,0.5)]"
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══ Daily Quest Board (giữ nguyên 100%) ═══
function DailyQuestBoard() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-900 border border-red-500/30 rounded-3xl p-5 relative overflow-hidden group hover:border-red-500/60 transition-colors shadow-[0_0_15px_rgba(239,68,68,0.05)]">
        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-2xl rounded-full pointer-events-none"></div>
        <div className="flex items-start gap-4 relative z-10">
          <div className="bg-red-500/20 p-3 rounded-2xl shrink-0">
             <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-red-400 font-black text-sm uppercase tracking-wide mb-1">Cảnh báo Đỏ ĐH</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              5 câu <strong className="text-white">Từ Trường (VDC)</strong> sai sốt nhiều trong tuần này. Không được phép sai nữa!
            </p>
            <button className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest py-3 rounded-xl transition-all hover:shadow-[0_0_10px_rgba(239,68,68,0.4)]">
              Chữa bài ngay <Play className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-5 relative overflow-hidden group hover:border-rose-500/60 transition-colors shadow-[0_0_15px_rgba(225,29,72,0.05)]">
        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 blur-2xl rounded-full pointer-events-none"></div>
        <div className="flex items-start gap-4 relative z-10">
          <div className="bg-rose-500/20 p-3 rounded-2xl shrink-0">
             <BrainCircuit className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h3 className="text-rose-400 font-black text-sm uppercase tracking-wide mb-1">Chìa Khóa 9.0+</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              Bạn CẦN hoàn thiện nhanh bài tập <strong className="text-white">Vật lý hạt nhân</strong> để kịp tiến độ Đề Tổng Ôn.
            </p>
            <button className="flex items-center justify-center gap-2 w-full bg-slate-950 border border-rose-500/50 hover:bg-rose-600 text-white text-xs font-black uppercase tracking-widest py-3 rounded-xl transition-all hover:shadow-[0_0_10px_rgba(225,29,72,0.4)]">
              Thực thi nhiệm vụ <Play className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export default function Grade12Dashboard({ user, onStartPrescription, onStartExam, onDownloadPDF }: Grade12DashboardProps) {
  return (
    <div className="space-y-8 animate-in fade-in zoom-in duration-500">
      {/* ── Hero Countdown (giữ nguyên) ── */}
      <HeroCountdown />      {/* ── Bảng Xếp Hạng & Cá Nhân ── */}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <UserRankCard user={user} />
          <GradeLeaderboard currentUser={user} />
        </div>
      )}

      {/* ── Năng lực + Lệnh triệu tập ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
            Bản đồ Năng lực
          </h2>
          <MasteryRadarChart />
        </div>
        <div className="space-y-3">
            <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Lệnh Triệu Tập Hôm Nay ⚡
          </h2>
          <DailyQuestBoard />
        </div>
      </div>

      {/* ── Bài Tập & Kiểm Tra (Chỉ Lớp 12 — chuyển từ StudentDashboard vào đây) ── */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 relative overflow-hidden shadow-xl">
        {/* [FIX] pointer-events-none trên decorative elements, z-10 cho content */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-rose-500 to-transparent opacity-50 pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        <h3 className="text-3xl font-black flex items-center gap-3 mb-8 font-headline tracking-tight text-gradient-cyber relative z-10">
          <BrainCircuit className="text-rose-400 w-8 h-8" />
          Bài Tập & Kiểm Tra — Lớp 12
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          {GRADE_12_TOPICS.map(t => (
            <TopicCard
              key={t.topic}
              topic={t.topic}
              displayName={t.displayName}
              isLocked={false}
              onClick={() => onStartPrescription?.(t.topic, '')}
              color={t.color}
            />
          ))}
          <div className="lg:col-span-4">
            <TopicCard topic="THPT" displayName="🔴 THI THỬ THPT QG MÔ PHỎNG" isLocked={false} onClick={() => onStartPrescription?.('THPT' as Topic, '')} color="#e11d48" />
          </div>
        </div>
      </div>

      {/* ── Danh sách Đề kiểm tra (Lock cứng Khối 12) ── */}
      {onStartExam && <ExamsList onStartExam={onStartExam} onDownloadPDF={onDownloadPDF} gradeFilter={12} />}
    </div>
  );
}
