import React from 'react';
import { Rocket, Target, Clock, Star, AlertTriangle, BrainCircuit, Play } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

function HeroCountdown() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-[0_0_20px_rgba(34,211,238,0.15)] group p-6 sm:p-10">
      <div className="absolute top-0 right-0 -m-8 w-32 h-32 bg-cyan-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-cyan-500/30 transition duration-700"></div>
      <div className="absolute bottom-0 left-0 -m-8 w-32 h-32 bg-violet-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-violet-500/30 transition duration-700"></div>
      
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-black uppercase tracking-wider mb-2">
            <Rocket className="w-4 h-4" /> Khối 10 GDPT 2018
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">TRẠM KHÔNG GIAN <br className="hidden sm:block"/>HỌC KỲ 2</h1>
          <p className="text-slate-400 text-sm">Thời gian không chờ đợi ai. Hãy tăng tốc!</p>
        </div>

        <div className="w-full md:w-auto bg-slate-950/80 p-5 rounded-2xl border border-slate-800/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-3">
            <Clock className="w-4 h-4 stroke-cyan-400" /> TỚI NGÀY THI
          </div>
          <div className="flex justify-between gap-2 text-center text-white font-black text-2xl sm:text-3xl font-mono tracking-widest">
            <div className="flex flex-col"><span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">14</span><span className="text-[10px] text-slate-500 uppercase mt-1">Ngày</span></div>
            <span className="text-slate-600">:</span>
            <div className="flex flex-col"><span className="text-white">08</span><span className="text-[10px] text-slate-500 uppercase mt-1">Giờ</span></div>
            <span className="text-slate-600">:</span>
            <div className="flex flex-col"><span className="text-white">30</span><span className="text-[10px] text-slate-500 uppercase mt-1">Phút</span></div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800/50">
        <div className="flex justify-between items-end mb-2">
           <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
             <Target className="w-4 h-4 text-violet-400" /> Mục tiêu GPA:
           </div>
           <div className="text-violet-400 font-black flex items-center gap-1">
             <Star className="w-4 h-4 fill-violet-400" /> 8.5/10
           </div>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-gradient-to-r from-violet-600 to-cyan-400 rounded-full relative w-[85%] shadow-[0_0_10px_rgba(139,92,246,0.6)]">
             <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/30 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const mockData = [
  { subject: 'Động học', score: 85, fullMark: 100 },
  { subject: 'Động lực học', score: 60, fullMark: 100 },
  { subject: 'Năng lượng', score: 45, fullMark: 100 },
  { subject: 'Động lượng', score: 75, fullMark: 100 },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-cyan-500/30 p-3 rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.2)]">
        <p className="text-white font-bold text-sm mb-1">{payload[0].payload.subject}</p>
        <p className="text-cyan-400 font-black text-lg">{payload[0].value}% <span className="text-[10px] text-slate-500 uppercase">Thông thạo</span></p>
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
            name="Khối 10"
            dataKey="score"
            stroke="#22d3ee"
            strokeWidth={3}
            fill="#22d3ee"
            fillOpacity={0.4}
            className="drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

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
            <h3 className="text-red-400 font-black text-sm uppercase tracking-wide mb-1">Cảnh báo Đỏ</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              5 câu <strong className="text-white">Động lượng</strong> (Mức Vận dụng) đang bị hỏng lặp lại. Bấm để chữa cháy ngay!
            </p>
            <button className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest py-3 rounded-xl transition-all hover:shadow-[0_0_10px_rgba(239,68,68,0.4)]">
              Chữa cháy ngay <Play className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-violet-500/30 rounded-3xl p-5 relative overflow-hidden group hover:border-violet-500/60 transition-colors shadow-[0_0_15px_rgba(139,92,246,0.05)]">
        <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 blur-2xl rounded-full pointer-events-none"></div>
        <div className="flex items-start gap-4 relative z-10">
          <div className="bg-violet-500/20 p-3 rounded-2xl shrink-0">
             <BrainCircuit className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h3 className="text-violet-400 font-black text-sm uppercase tracking-wide mb-1">Chu kỳ SM-2</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              10 câu lý thuyết <strong className="text-white">Năng lượng</strong> đã đến hạn cần ôn lại vào hôm nay.
            </p>
            <button className="flex items-center justify-center gap-2 w-full bg-slate-950 border border-violet-500/50 hover:bg-violet-600 text-white text-xs font-black uppercase tracking-widest py-3 rounded-xl transition-all hover:shadow-[0_0_10px_rgba(139,92,246,0.4)]">
              Thực thi nhiệm vụ <Play className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Grade10Dashboard() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in duration-500">
      <HeroCountdown />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            Bản đồ Năng lực
          </h2>
          <MasteryRadarChart />
        </div>
        <div className="space-y-3">
            <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"></span>
            Lệnh Triệu Tập Hôm Nay ⚡
          </h2>
          <DailyQuestBoard />
        </div>
      </div>
    </div>
  );
}
