import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { BookOpen, Settings, AlertTriangle } from 'lucide-react';
import { Topic } from '../types';

export const TopicCard = ({ topic, displayName, isLocked, onClick, color }: { topic: Topic, displayName?: string, isLocked: boolean, onClick: () => void, color?: string }) => (
  <motion.div 
    whileHover={!isLocked ? { y: -4, scale: 1.01 } : {}}
    whileTap={!isLocked ? { scale: 0.98 } : {}}
    onClick={!isLocked ? onClick : undefined}
    className={cn(
      "relative p-8 rounded-[2rem] border transition-all duration-300 cursor-pointer group overflow-hidden",
      isLocked 
        ? "bg-slate-900/50 border-slate-800 grayscale opacity-60 cursor-not-allowed" 
        : "bg-slate-900/50 backdrop-blur-md border-slate-700/50"
    )}
    style={!isLocked ? {} : {}}
    onMouseEnter={(e) => {
      if (!isLocked && color) {
        const el = e.currentTarget;
        el.style.borderColor = `${color}60`;
        el.style.boxShadow = `0 0 24px ${color}15, 0 8px 32px rgba(0,0,0,0.3)`;
      }
    }}
    onMouseLeave={(e) => {
      if (!isLocked) {
        const el = e.currentTarget;
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }
    }}
  >
    <div className="absolute top-0 right-0 w-32 h-32 blur-3xl -z-10 transition-opacity opacity-0 group-hover:opacity-100"
      style={{ backgroundColor: `${color || '#dc2626'}15` }} />
    
    <div className="flex justify-between items-start mb-6">
      <div className={cn(
        "p-4 rounded-2xl transition-all duration-500",
        isLocked ? "bg-slate-800" : "text-white"
      )}
        style={!isLocked ? { backgroundColor: `${color || '#dc2626'}18` } : {}}
      >
        {topic === 'THPT' ? <Settings className="w-6 h-6" /> : <BookOpen className="w-6 h-6" />}
      </div>
      {isLocked && (
        <div className="flex items-center gap-1 text-amber-500 text-[10px] font-bold uppercase bg-amber-500/10 px-2 py-1 rounded-full animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          Vùng Đỏ
        </div>
      )}
    </div>

    <h4 className="text-xl font-black text-white mb-2 tracking-tight transition-colors">
      {displayName || topic}
    </h4>
    <p className="text-xs text-slate-500 font-medium leading-6 mb-6">
      {isLocked 
        ? "Đang trong vùng đỏ. Cần hoàn thành phác đồ điều trị để mở khóa." 
        : topic === 'THPT' 
          ? "Kiểm tra tổng hợp 4 chương chuẩn theo cấu trúc Bộ GD&ĐT 2026" 
          : "Luyện tập cấu trúc 3 phần: Trắc nghiệm, Đúng/Sai, Trả lời ngắn."}
    </p>

    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-600">
        <span>Cấu trúc</span>
        <span className="text-slate-400">18 - 4 - 6</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full w-0 group-hover:w-full transition-all duration-1000 rounded-full"
          style={{ backgroundColor: color || '#dc2626' }} />
      </div>
    </div>
  </motion.div>
);

export default TopicCard;
