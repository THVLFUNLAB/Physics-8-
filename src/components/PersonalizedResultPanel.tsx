import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Activity, CheckCircle2, AlertTriangle, AlertCircle, TrendingUp, BookOpen, Clock, Zap, TargetIcon, Flame, Lightbulb, FileText, LayoutDashboard, BrainCog } from 'lucide-react';
import { WeaknessProfile, Attempt, Question } from '../types';

interface RecordItem {
  question: Question;
  studentAnswer: any;
  isCorrect: boolean;
}

interface Props {
  profile: WeaknessProfile;
  attempt: Attempt;
  incorrectRecords: RecordItem[];
  onRetry: () => void;
  onFixWeaknesses: () => void;
  onReviewTheory: () => void;
  onSaveToVault: () => void;
}

export const PersonalizedResultPanel: React.FC<Props> = ({ 
  profile, 
  attempt, 
  incorrectRecords, 
  onRetry, 
  onFixWeaknesses, 
  onReviewTheory,
  onSaveToVault 
}) => {
  const totalScore = attempt.score;
  const rankVisual = profile.overallLevel === 'S' 
    ? { icon: '🏆', color: 'from-amber-400 to-yellow-600', text: 'text-amber-400', label: 'XUẤT SẮC (S)' }
    : profile.overallLevel === 'A'
    ? { icon: '🔥', color: 'from-emerald-400 to-teal-600', text: 'text-emerald-400', label: 'GIỎI (A)' }
    : profile.overallLevel === 'B'
    ? { icon: '⚡', color: 'from-blue-400 to-indigo-600', text: 'text-blue-400', label: 'KHÁ (B)' }
    : { icon: '⚠️', color: 'from-rose-400 to-red-600', text: 'text-rose-400', label: 'CẦN CỐ GẮNG (C)' };

  // Calculate stats
  const totalQuestions = Object.keys(attempt.answers || {}).length;
  const incorrectCount = incorrectRecords.length;
  const skippedCount = profile.items?.filter(i => i.errorType === 'skipped').reduce((a,b)=>a+b.wrongCount, 0) || 0;
  const correctCount = totalQuestions - incorrectCount - skippedCount;

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
      {/* ── HEADER KẾT QUẢ ── */}
      <div className={`p-8 md:p-10 relative overflow-hidden`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${rankVisual.color} opacity-[0.08]`}></div>
        <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
          <BrainCog className="w-48 h-48" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${rankVisual.color} p-1 shadow-xl shadow-black/50`}>
              <div className="w-full h-full bg-slate-900 rounded-full flex flex-col items-center justify-center">
                <span className="text-3xl">{rankVisual.icon}</span>
                <span className={`text-[10px] font-black uppercase mt-1 ${rankVisual.text}`}>{profile.overallLevel}</span>
              </div>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-0.5 rounded-full bg-slate-800 text-[10px] font-black tracking-widest uppercase border border-slate-700 ${rankVisual.text}`}>
                  HẠNG {profile.overallLevel}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-black tracking-widest uppercase border border-slate-700">
                  Vật Lý {profile.grade}
                </span>
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-white font-headline">
                {totalScore.toFixed(2)}<span className="text-xl md:text-2xl text-slate-500">/10</span>
              </h2>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 p-4 rounded-2xl flex flex-col items-center min-w-[80px]">
              <span className="text-emerald-400 font-black text-xl">{correctCount}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">Đúng</span>
            </div>
            <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 p-4 rounded-2xl flex flex-col items-center min-w-[80px]">
              <span className="text-rose-400 font-black text-xl">{incorrectCount}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">Sai</span>
            </div>
            {skippedCount > 0 && (
              <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 p-4 rounded-2xl flex flex-col items-center min-w-[80px]">
                <span className="text-amber-400 font-black text-xl">{skippedCount}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">Bỏ trống</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BÁO CÁO PHÂN TÍCH ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1 px-1 bg-slate-800 border-t border-b border-slate-700">
        
        {/* CỘT 1: NHẬN XÉT HÀNH VI */}
        <div className="bg-slate-900 p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Hành vi & Nhận thức</h3>
          </div>
          
          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl mb-6">
            <p className="text-sm text-purple-100 leading-relaxed italic">
              "{profile.behavioralNote}"
            </p>
          </div>
          
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Điểm sáng cần giữ vững</h4>
            {profile.strengths?.map((s, i) => (
              <div key={i} className="flex gap-3 items-start">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-sm text-slate-300">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CỘT 2: MA TRẬN YẾU ĐIỂM (THEO YCCĐ) */}
        <div className="bg-slate-900 p-6 lg:p-8 lg:border-l lg:border-r border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TargetIcon className="w-5 h-5 text-rose-400" />
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Lỗ Hổng Năng Lực</h3>
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Chuẩn GDPT 2018</span>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {profile.items?.map((item, idx) => (
              <div 
                key={idx} 
                className={`p-4 rounded-xl border relative overflow-hidden group transition-all
                  ${item.priority === 'critical' ? 'bg-rose-500/5 border-rose-500/30 hover:border-rose-500/50' : 
                    item.priority === 'major' ? 'bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50' : 
                    'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'}
                `}
              >
                {/* Visual Level Marker */}
                <div className={`absolute top-0 right-0 px-2 py-1 rounded-bl-lg text-[9px] font-black uppercase
                  ${item.weakLevel === 'NB' || item.weakLevel === 'TH' ? 'bg-rose-500/20 text-rose-400' : 
                    item.weakLevel === 'VD' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}
                `}>
                  Mức {item.weakLevel}
                </div>

                <div className="pr-12">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">{item.yccDCode}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase truncate">{item.topic}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mb-2 leading-snug">{item.subTopic}</h4>
                  
                  <div className="flex gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-[10px] font-medium text-slate-400">
                      {item.errorType === 'fundamental' ? <AlertTriangle className="w-3 h-3 text-rose-400"/> : 
                       item.errorType === 'careless' ? <AlertCircle className="w-3 h-3 text-amber-400"/> : 
                       <Clock className="w-3 h-3 text-slate-500"/>}
                      {item.errorType === 'fundamental' ? 'Hổng bản chất' : 
                       item.errorType === 'careless' ? 'Lỗi kỹ năng/ẩu' : 'Bỏ trống'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-[10px] font-medium text-slate-400">
                      Sai {item.wrongCount} câu
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {(!profile.items || profile.items.length === 0) && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-sm text-slate-400">Phần kiến thức đã kiểm tra rất vững chắc, không phát hiện lỗ hổng lớn.</p>
              </div>
            )}
          </div>
        </div>

        {/* CỘT 3: KẾ HOẠCH HÀNH ĐỘNG */}
        <div className="bg-slate-900 p-6 lg:p-8 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Kế Hoạch Khắc Phục</h3>
          </div>

          <div className="space-y-4 mb-8 flex-1">
            {profile.actionPlan?.map((step, i) => (
              <div key={i} className="flex gap-3 group">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mt-0.5 group-hover:bg-blue-500/20 group-hover:border-blue-500/50 transition-colors">
                  <span className="text-[11px] font-black text-blue-400">{i + 1}</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed pt-0.5">
                  {step}
                </p>
              </div>
            ))}
          </div>

          {/* TOTAL REMEDIAL PREVIEW */}
          {profile.remedialMatrix && profile.remedialMatrix.length > 0 && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Toa thuốc từ AI:</span>
                <span className="text-xs font-black text-blue-400">
                  {profile.remedialMatrix.reduce((a,b)=>a+b.count, 0)} Câu
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {profile.remedialMatrix.map((m, i) => (
                  <div key={i} className="h-2 bg-slate-800 rounded-full overflow-hidden" style={{ width: `${(m.count / 28) * 100}%` }}>
                    <div className="w-full h-full bg-blue-500/50"></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ACTION BỨT PHÁ ── */}
      <div className="p-6 lg:p-8 bg-slate-900 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex gap-3 w-full sm:w-auto">
          <button 
            onClick={onRetry}
            className="flex-1 sm:flex-none px-6 py-3.5 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-white rounded-2xl flex items-center justify-center gap-2 font-bold text-sm"
          >
            <LayoutDashboard className="w-4 h-4" /> TRANG CHỦ
          </button>
          
          <button 
            onClick={onSaveToVault}
            className="flex-1 sm:flex-none px-6 py-3.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-blue-400 transition-all rounded-2xl flex items-center justify-center gap-2 font-bold text-sm border border-slate-700"
          >
            <BookOpen className="w-4 h-4" /> XEM LỜI GIẢI
          </button>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <button 
            onClick={onReviewTheory}
            className="flex-1 sm:flex-none px-6 py-3.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 active:scale-95 transition-all text-white rounded-2xl flex items-center justify-center gap-2 font-bold text-sm group"
          >
            <Lightbulb className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" /> 
            ÔN LẠI LÝ THUYẾT
          </button>

          <button 
            onClick={onFixWeaknesses}
            disabled={!profile.remedialMatrix || profile.remedialMatrix.length === 0}
            className="flex-1 sm:flex-none px-8 py-3.5 bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] active:scale-95 transition-all text-white rounded-2xl flex items-center justify-center gap-2 font-black tracking-wide text-sm whitespace-nowrap group disabled:opacity-50 disabled:pointer-events-none"
          >
            <Zap className="w-4 h-4 group-hover:rotate-12 transition-transform" /> 
            CHỮA LỖI CẤP TỐC
          </button>
        </div>
      </div>
    </div>
  );
};
