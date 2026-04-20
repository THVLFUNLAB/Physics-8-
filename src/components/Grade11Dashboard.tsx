import React, { useState, useMemo } from 'react';
import { Rocket, Target, Star, AlertTriangle, BrainCircuit, Play, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { getYCCDByGrade } from '../data/yccdData';
import { TopicCard } from './TopicCard';
import { ExamsList } from './ExamsList';
import { Topic, Exam } from '../types';

// ═══════════════════════════════════════════
//  Định nghĩa Topics chính thức của Lớp 11
// ═══════════════════════════════════════════
const GRADE_11_TOPICS: { topic: Topic; displayName: string; color: string }[] = [
  { topic: 'Dao động', displayName: 'Chương: Dao Động', color: '#eab308' },
  { topic: 'Sóng', displayName: 'Chương: Sóng', color: '#f97316' },
  { topic: 'Trường điện', displayName: 'Chương: Trường Điện', color: '#ec4899' },
  { topic: 'Dòng điện, mạch điện', displayName: 'Chương: Dòng Điện - Mạch Điện', color: '#8b5cf6' },
];

// ═══ Props Interface ═══
interface Grade11DashboardProps {
  onStartPrescription?: (topic: Topic, examId: string) => void;
  onStartExam?: (exam: Exam) => void;
}

// ═══ Hero Banner ═══
function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-[0_0_20px_rgba(234,179,8,0.15)] group p-6 sm:p-10">
      <div className="absolute top-0 right-0 -m-8 w-32 h-32 bg-yellow-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-yellow-500/30 transition duration-700"></div>
      <div className="absolute bottom-0 left-0 -m-8 w-32 h-32 bg-orange-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-orange-500/30 transition duration-700"></div>
      
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-black uppercase tracking-wider mb-2">
            <Rocket className="w-4 h-4" /> Khối 11 GDPT 2018
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">TRẠM BỨT PHÁ <br className="hidden sm:block"/>VẬT LÍ 11</h1>
          <p className="text-slate-400 text-sm">Chặng nước rút quan trọng. Giữ vững tốc độ!</p>
        </div>

        <div className="w-full md:w-auto bg-slate-950/80 p-5 rounded-2xl border border-slate-800/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-3">
            <Target className="w-4 h-4 stroke-yellow-400" /> Mục tiêu học kỳ
          </div>
          <div className="flex items-center gap-3">
            <div className="text-yellow-400 font-black text-3xl flex items-center gap-1">
              <Star className="w-6 h-6 fill-yellow-400" /> 8.0+
            </div>
            <span className="text-slate-500 text-xs font-bold uppercase">GPA Vật Lí</span>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800/50">
        <div className="flex justify-between items-end mb-2">
           <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
             <Target className="w-4 h-4 text-orange-400" /> Tiến độ chương trình:
           </div>
           <div className="text-orange-400 font-black flex items-center gap-1">
             4 Chuyên đề
           </div>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div className="h-full bg-gradient-to-r from-orange-600 to-yellow-400 rounded-full relative w-[50%] shadow-[0_0_10px_rgba(234,179,8,0.6)]">
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
  const yccdItems = useMemo(() => getYCCDByGrade('11').filter(y => y.topic === topic), [topic]);

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

// ═══ Radar Chart ═══
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-yellow-500/30 p-3 rounded-xl shadow-[0_0_15px_rgba(234,179,8,0.2)]">
        <p className="text-white font-bold text-sm mb-1">{payload[0].payload.subject}</p>
        <p className="text-yellow-400 font-black text-lg">{payload[0].value}% <span className="text-[10px] text-slate-500 uppercase">Thông thạo</span></p>
      </div>
    );
  }
  return null;
};

function MasteryRadarChart() {
  // TODO: Kết nối dữ liệu thật từ attempts - Hiện dùng placeholder
  const radarData = GRADE_11_TOPICS.map(t => ({
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
            name="Khối 11"
            dataKey="score"
            stroke="#eab308"
            strokeWidth={3}
            fill="#eab308"
            fillOpacity={0.4}
            className="drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]"
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export default function Grade11Dashboard({ onStartPrescription, onStartExam }: Grade11DashboardProps) {
  return (
    <div className="space-y-8 animate-in fade-in zoom-in duration-500">
      {/* ── Hero Banner ── */}
      <HeroBanner />

      {/* ── Năng lực + YCCĐ ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping"></span>
            Bản đồ Năng lực Lớp 11
          </h2>
          <MasteryRadarChart />
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-black text-slate-500 uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
            Bản đồ YCCĐ Lớp 11
          </h2>
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
            {GRADE_11_TOPICS.map(t => (
              <YCCDTopicSection key={t.topic} topic={t.topic} color={t.color} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Bài Tập & Luyện Tập Chuyên Đề (Chỉ Lớp 11) ── */}
      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500 to-transparent opacity-50" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />
        <h3 className="text-3xl font-black flex items-center gap-3 mb-8 font-headline tracking-tight" style={{ background: 'linear-gradient(90deg, #eab308, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <BrainCircuit className="text-yellow-400 w-8 h-8" style={{ WebkitTextFillColor: 'initial' }} />
          Luyện Tập Chuyên Đề — Lớp 11
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {GRADE_11_TOPICS.map(t => (
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

      {/* ── Danh sách Đề kiểm tra (Lock cứng Khối 11) ── */}
      {onStartExam && <ExamsList onStartExam={onStartExam} gradeFilter={11} />}
    </div>
  );
}
