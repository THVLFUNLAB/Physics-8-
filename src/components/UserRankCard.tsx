import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';
import { getCurrentRank, getNextRank, getRankProgress, RANKS } from '../services/RankSystem';

export const UserRankCard = ({ user }: { user: UserProfile }) => {
  const stars = user.stars || 0;
  const rank = getCurrentRank(stars);
  const nextRank = getNextRank(stars);
  const progress = getRankProgress(stars);

  return (
    <div className={cn(
      "bg-gradient-to-r p-[1px] rounded-3xl",
      rank.bgColor.replace('from-', 'from-').includes('via-')
        ? "bg-gradient-to-r from-amber-500/40 via-rose-500/40 to-purple-500/40"
        : `bg-gradient-to-r ${rank.bgColor.replace('/20', '/40').replace('/10', '/30')}`
    )}>
      <div className="bg-slate-950 rounded-3xl p-6 space-y-4">
        {/* Rank Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-gradient-to-br border",
              rank.bgColor,
              rank.borderColor
            )}>
              {rank.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hạng hiện tại</p>
              <h3 className={cn("text-2xl font-black", rank.color)}>
                {rank.name}
              </h3>
              <p className="text-[10px] text-slate-500 italic">{rank.description}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Tổng sao</p>
            <p className={cn("text-3xl font-black", rank.color)}>⭐ {stars}</p>
          </div>
        </div>

        {/* Progress Bar */}
        {nextRank ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500">{rank.icon} {rank.name}</span>
              <span className="text-[10px] font-bold text-slate-500">{nextRank.icon} {nextRank.name}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress.percent}%` }}
                transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
                className={cn(
                  "h-full rounded-full bg-gradient-to-r relative",
                  rank.id >= 8 ? "from-red-600 via-orange-500 to-amber-400" :
                  rank.id >= 5 ? "from-blue-600 via-purple-500 to-rose-400" :
                  "from-slate-600 via-slate-500 to-slate-400"
                )}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </motion.div>
            </div>
            <p className="text-[10px] text-slate-400 text-center">
              Bạn đang có <span className="text-white font-bold">{stars} Sao</span>. 
              Chỉ cần <span className={cn("font-bold", nextRank.color)}>{progress.starsNeeded} Sao</span> nữa để thăng cấp <span className={cn("font-bold", nextRank.color)}>{nextRank.icon} {nextRank.name}</span>!
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-lg font-black bg-gradient-to-r from-amber-300 via-rose-400 to-purple-500 bg-clip-text text-transparent">
              🌟 HUYỀN THOẠI BẤT TỬ — ĐỈNH CAO VẬT LÝ 🌟
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Bạn đã đạt cấp bậc cao nhất!</p>
          </div>
        )}

        {/* Mini Rank Progress Overview */}
        <div className="flex gap-1 items-center">
          {RANKS.map((r, i) => (
            <div key={r.id} className="flex-1 group relative">
              <div className={cn(
                "h-1.5 rounded-full transition-all",
                stars >= r.minStars ? "bg-gradient-to-r from-red-500 to-orange-400 opacity-100" : "bg-slate-800 opacity-40"
              )} />
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-[9px] text-white px-2 py-1 rounded whitespace-nowrap z-10">
                {r.icon} {r.name} ({r.minStars}⭐)
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UserRankCard;
