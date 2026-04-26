import React, { useState, useMemo } from 'react';
import { Rocket, Target, Star, AlertTriangle, BrainCircuit, Play, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { getYCCDByGrade } from '../data/yccdData';
import { TopicCard } from './TopicCard';
import { ExamsList } from './ExamsList';
import { Topic, Exam } from '../types';

// ═══════════════════════════════════════════
//  Định nghĩa Topics chính thức của Lớp 10
// ═══════════════════════════════════════════
const GRADE_10_TOPICS: { topic: Topic; displayName: string; color: string }[] = [
  { topic: 'Động học', displayName: 'Chương: Động Học', color: '#06b6d4' },
  { topic: 'Động lực học', displayName: 'Chương: Động Lực Học', color: '#8b5cf6' },
  { topic: 'Công, năng lượng, công suất', displayName: 'Chương: Công - Năng Lượng', color: '#f97316' },
  { topic: 'Động lượng', displayName: 'Chương: Động Lượng', color: '#10b981' },
  { topic: 'Chuyển động tròn', displayName: 'Chương: Chuyển Động Tròn', color: '#ec4899' },
  { topic: 'Biến dạng của vật rắn', displayName: 'Chương: Biến Dạng Vật Rắn', color: '#eab308' },
];

// ═══ Props Interface ═══
interface Grade10DashboardProps {
  onStartPrescription?: (topic: Topic, examId: string) => void;
  onStartExam?: (exam: Exam) => void;
}

// ═══ Hero Banner ═══
function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-[0_0_20px_rgba(34,211,238,0.15)] group p-6 sm:p-10">
      <div className="absolute top-0 right-0 -m-8 w-32 h-32 bg-cyan-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-cyan-500/30 transition duration-700"></div>
      <div className="absolute bottom-0 left-0 -m-8 w-32 h-32 bg-violet-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-violet-500/30 transition duration-700"></div>
      
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-black uppercase tracking-wider mb-2">
            <Rocket className="w-4 h-4" /> Khối 10 GDPT 2018
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">TRẠM KHÔNG GIAN <br className="hidden sm:block"/>VẬT LÍ 10</h1>
          <p className="text-slate-400 text-sm">Nền tảng vững chắc — Vươn xa tương lai!</p>
        </div>

        <div className="w-full md:w-auto bg-slate-950/80 p-5 rounded-2xl border border-slate-800/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-3">
            <Target className="w-4 h-4 stroke-cyan-400" /> Mục tiêu học kỳ
          </div>
          <div className="flex items-center gap-3">
            <div className="text-cyan-400 font-black text-3xl flex items-center gap-1">
              <Star className="w-6 h-6 fill-cyan-400" /> 8.5+
            </div>
            <span className="text-slate-500 text-xs font-bold uppercase">GPA Vật Lí</span>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800/50">
        <div className="flex justify-between items-end mb-2">
           <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
             <Target className="w-4 h-4 text-violet-400" /> Tiến độ chương trình:
           </div>
           <div className="text-violet-400 font-black flex items-center gap-1">
             6 Chuyên đề
           </div>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-gradient-to-r from-violet-600 to-cyan-400 rounded-full relative w-[50%] shadow-[0_0_10px_rgba(139,92,246,0.6)]">
             <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/30 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ YCCĐ Accordion cho từng Topic ═══
function YCCDTopicSection({ topic, color }: { topic: string; color: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const yccdItems = useMemo(() => getYCCDByGrade('10').filter(y => y.topic === topic), [topic]);

  if (yccdItems.length === 0) return null;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
          <span className="text-sm font-bold text-white">{topic}</span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">{yccdItems.length} YCCĐ</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-800">
          {yccdItems.map((item, idx) => (
            <div key={item.code} className="flex gap-3 p-3 bg-slate-950/50 rounded-xl border border-slate-800/50">
              <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white" style={{ backgroundColor: `${color}30`, color: color }}>
                {idx + 1}
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-300 leading-5">{item.content}</p>
                <span className="text-[10px] text-slate-600 font-mono mt-1 inline-block">{item.code}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══ Radar Chart (mockData — sẽ kết nối dữ liệu attempts thật ở pha sau) ═══
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
  // TODO: Kết nối dữ liệu thật từ attempts - Hiện dùng placeholder
  const radarData = GRADE_10_TOPICS.map(t => ({
    subject: t.topic.length > 12 ? t.topic.substring(0, 12) + '...' : t.topic,
    score: 0,
    fullMark: 100,
  }));

  return (
    <div className="w-full h-[350px] bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-[0_0_15px_rgba(15,23,42,0.5)] flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} 
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

// ═══ MAIN COMPONENT ═══
export default function Grade10Dashboard({ onStartPrescription, onStartExam }: Grade10DashboardProps) {
  return (
    <div className="space-y-8 animate-in fade-in zoom-in duration-500">
      {/* ── Hero Banner ── */}
      <HeroBanner />

      {/* ── Năng lực + Lệnh triệu tập ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            Bản đồ Năng lực Lớp 10
          </h2>
          <MasteryRadarChart />
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"></span>
            Bản đồ YCCĐ Lớp 10
          </h2>
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
            {GRADE_10_TOPICS.map(t => (
              <YCCDTopicSection key={t.topic} topic={t.topic} color={t.color} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Bài Tập & Luyện Tập Chuyên Đề (Chỉ Lớp 10) ── */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <h3 className="text-3xl font-black flex items-center gap-3 mb-8 font-headline tracking-tight text-gradient-ocean">
          <BrainCircuit className="text-cyan-400 w-8 h-8" />
          Luyện Tập Chuyên Đề — Lớp 10
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {GRADE_10_TOPICS.map(t => (
            <TopicCard
              key={t.topic}
              topic={t.topic}
              displayName={t.displayName}
              isLocked={false}
              onClick={() => onStartPrescription?.(t.topic, '')}
              color={t.color}
            />
          ))}
        </div>
      </div>

      {/* ── Đề Thi & Nhiệm Vụ GV Giao ── */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-emerald-500/20 rounded-3xl p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex justify-between items-center mb-8 relative z-10">
          <h3 className="text-2xl sm:text-3xl font-black flex items-center gap-3 font-headline tracking-tight text-emerald-400">
            <BookOpen className="text-emerald-400 w-8 h-8" />
            Nhiệm Vụ GV Giao
          </h3>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black rounded-full uppercase tracking-widest">
            0 Mới
          </div>
        </div>
        <div className="bg-slate-950/80 border border-slate-800 border-dashed p-10 rounded-2xl flex flex-col items-center justify-center text-center relative z-10">
           <BookOpen className="w-12 h-12 text-slate-700 mb-4" />
           <h4 className="text-xl font-black text-slate-400 mb-2">Chưa có nhiệm vụ</h4>
           <p className="text-sm text-slate-500">Giáo viên của bạn chưa giao bài tập hoặc đề thi nào mới.</p>
        </div>
      </div>

      {/* ── Danh sách Đề kiểm tra (Lock cứng Khối 10) ── */}
      {onStartExam && <ExamsList onStartExam={onStartExam} gradeFilter={10} />}
    </div>
  );
}
