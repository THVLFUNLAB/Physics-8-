// ── Common UI Components ──
// Gom nhóm các component nhỏ (<30 dòng) vào 1 file chung

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import {
  Video,
  BookOpen,
  ExternalLink,
  ChevronRight,
  FlaskConical,
  Award,
} from 'lucide-react';

// ── ResourceCard ──
export const ResourceCard = ({ title, type, url, description }: { title: string, type: 'video' | 'pdf' | 'link', url: string, description: string }) => (
  <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] hover:border-red-600/50 transition-all group">
    <div className={cn(
      "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110",
      type === 'video' ? "bg-red-600/10 text-red-600" : type === 'pdf' ? "bg-blue-600/10 text-blue-600" : "bg-green-600/10 text-green-600"
    )}>
      {type === 'video' ? <Video className="w-6 h-6" /> : type === 'pdf' ? <BookOpen className="w-6 h-6" /> : <ExternalLink className="w-6 h-6" />}
    </div>
    <h4 className="font-black text-white mb-2 uppercase text-sm tracking-tight">{title}</h4>
    <p className="text-xs text-slate-500 mb-6 leading-relaxed">{description}</p>
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
    >
      Xem ngay <ChevronRight className="w-3 h-3" />
    </a>
  </div>
);

// ── VirtualLabPanel ──
export const VirtualLabPanel = ({ url }: { url: string }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden h-[500px] shadow-2xl"
  >
    <div className="bg-slate-800 px-6 py-3 flex justify-between items-center">
      <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
        <FlaskConical className="text-red-500 w-4 h-4" />
        Phòng thí nghiệm ảo (Virtual Lab)
      </h3>
      <span className="text-[10px] text-slate-400 font-bold bg-slate-900 px-2 py-1 rounded uppercase">
        Tương tác trực tiếp
      </span>
    </div>
    <iframe 
      src={url} 
      className="w-full h-full border-none" 
      allowFullScreen 
      title="Virtual Lab Simulation"
    />
  </motion.div>
);

// ── SmartResourceCard ──
export const SmartResourceCard = ({ resource }: { resource: { title: string, url: string, type: 'video' | 'document' } }) => (
  <a 
    href={resource.url} 
    target="_blank" 
    rel="noopener noreferrer"
    className="flex items-center gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-red-500/50 hover:bg-slate-900 transition-all group"
  >
    <div className={cn(
      "w-10 h-10 rounded-xl flex items-center justify-center",
      resource.type === 'video' ? "bg-red-600/10 text-red-500" : "bg-blue-600/10 text-blue-500"
    )}>
      {resource.type === 'video' ? <Video className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
    </div>
    <div className="flex-1">
      <p className="text-sm font-bold text-white group-hover:text-red-500 transition-colors">{resource.title}</p>
      <p className="text-[10px] text-slate-500 uppercase font-bold">{resource.type === 'video' ? 'Video bài giảng' : 'Tài liệu tóm tắt'}</p>
    </div>
    <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-red-500" />
  </a>
);

// ── PrescriptionCard ──
export const PrescriptionCard = ({ title, content, icon: Icon, color }: { title: string, content: any, icon: any, color: string }) => (
  <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl space-y-3">
    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
      <Icon className="w-5 h-5" />
    </div>
    <h4 className="font-bold text-white text-sm uppercase tracking-wider">{title}</h4>
    <div className="text-xs text-slate-400 leading-relaxed">
      {typeof content === 'string' && title === 'Kiến thức hổng' ? (
        <div className="flex flex-wrap">
          {content.split(',').map((item: string, idx: number) => {
            const trimmed = item.trim();
            if (!trimmed) return null;
            return (
              <span key={idx} className="inline-block px-3 py-1 m-1 text-sm rounded-full bg-red-900/30 text-red-400 border border-red-500/50">
                {trimmed}
              </span>
            );
          })}
        </div>
      ) : content}
    </div>
  </div>
);

// ── BadgeGallery ──
export const BadgeGallery = ({ badges }: { badges?: { title: string; description: string; unlockedAt?: { seconds: number } }[] }) => (
  <div className="flex flex-wrap gap-4">
    {badges?.map((badge, i) => (
      <motion.div
        key={i}
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15, delay: i * 0.1 }}
        className="group relative"
      >
        <div className="w-14 h-14 bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 rounded-2xl flex items-center justify-center border-2 border-amber-200/50 shadow-xl shadow-amber-500/20 cursor-help overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <Award className="text-white w-7 h-7 drop-shadow-md" />
        </div>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-40 p-3 bg-slate-950 border border-slate-800 rounded-2xl text-[10px] text-center opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-2xl translate-y-2 group-hover:translate-y-0">
          <p className="font-black text-amber-500 uppercase tracking-widest mb-1">{badge.title}</p>
          <p className="text-slate-400 font-medium leading-relaxed">{badge.description}</p>
          <div className="mt-2 pt-2 border-t border-slate-800 text-[8px] text-slate-600 font-bold uppercase">
            Đạt được: {badge.unlockedAt ? new Date(badge.unlockedAt.seconds * 1000).toLocaleDateString('vi-VN') : 'Mới'}
          </div>
        </div>
      </motion.div>
    ))}
    {(!badges || badges.length === 0) && (
      <div className="flex flex-col items-center justify-center py-4 px-8 border-2 border-dashed border-slate-800 rounded-2xl opacity-30">
        <Award className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Chưa có danh hiệu</p>
      </div>
    )}
  </div>
);
