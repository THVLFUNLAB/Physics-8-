import React from 'react';
import { Target, ChevronRight, CheckCircle2 } from 'lucide-react';

export const UpgradeModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border-2 border-amber-500/30 w-full max-w-md rounded-[2rem] p-8 shadow-2xl flex flex-col items-center text-center overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-500/10 blur-[100px] rounded-full pointer-events-none" />
        
        {/* Icon Header */}
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/40 border border-amber-300">
          <Target className="w-10 h-10 text-white" />
        </div>

        <h2 className="text-2xl font-black text-white mb-2">Cạn năng lượng!</h2>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Bạn đã sử dụng hết 30 lượt dùng thử. Để tiếp tục hành trình chinh phục điểm 10, hãy nâng cấp gói <strong className="text-amber-400">VIP</strong> ngay!
        </p>

        {/* Feature list */}
        <div className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 mb-6">
          <ul className="text-left text-sm space-y-3">
            <li className="flex items-center gap-3 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Không giới hạn lượt thi</li>
            <li className="flex items-center gap-3 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Ưu tiên chấm điểm AI siêu tốc</li>
            <li className="flex items-center gap-3 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Mở khóa Lộ trình Hổng kiến thức</li>
          </ul>
        </div>

        {/* CTA Button */}
        <a 
          href="https://zalo.me/0962662736?text=Em%20ch%C3%A0o%20Th%E1%BA%A7y%20H%E1%BA%ADu%2C%20em%20mu%E1%BB%91n%20n%C3%A2ng%20c%E1%BA%A5p%20t%C3%A0i%20kho%E1%BA%A3n%20VIP%20PHY8%2B"
          target="_blank" 
          rel="noreferrer"
          className="w-full relative group overflow-hidden bg-white text-slate-900 font-black rounded-xl p-4 flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all duration-300"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
          Liên hệ Thầy Hậu nâng cấp gói VIP <ChevronRight className="w-5 h-5" />
        </a>

        <button 
          onClick={onClose}
          className="mt-6 text-xs text-slate-500 font-bold hover:text-white transition-colors"
        >
          Đóng cửa sổ
        </button>
      </div>
    </div>
  );
};

export default UpgradeModal;
