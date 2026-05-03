/**
 * StatCard.tsx
 * Reusable KPI card — bám sát design system hiện tại của PHYS9+
 */
import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: LucideIcon;
  color: 'cyan' | 'emerald' | 'violet' | 'fuchsia' | 'amber' | 'rose';
  trend?: 'up' | 'down' | 'neutral';
  trendText?: string;
  loading?: boolean;
  delay?: number;
}

const colorMap = {
  cyan:    { icon: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    value: 'text-cyan-300' },
  emerald: { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', value: 'text-emerald-300' },
  violet:  { icon: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  value: 'text-violet-300' },
  fuchsia: { icon: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', value: 'text-fuchsia-300' },
  amber:   { icon: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   value: 'text-amber-300' },
  rose:    { icon: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    value: 'text-rose-300' },
};

export const StatCard: React.FC<StatCardProps> = ({
  label, value, subLabel, icon: Icon,
  color, trend, trendText, loading = false, delay = 0,
}) => {
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'bg-slate-900 border rounded-2xl p-4 flex flex-col gap-3',
        'hover:border-slate-700 transition-colors duration-200',
        c.border,
      )}
    >
      {/* Top row: icon + trend */}
      <div className="flex items-center justify-between">
        <div className={cn('p-2 rounded-xl', c.bg)}>
          <Icon className={cn('w-5 h-5', c.icon)} />
        </div>
        {trend && (
          <span className={cn(
            'flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg',
            trend === 'up'      ? 'text-emerald-400 bg-emerald-500/10' :
            trend === 'down'    ? 'text-rose-400 bg-rose-500/10' :
                                  'text-slate-400 bg-slate-800',
          )}>
            {trend === 'up'   && <TrendingUp className="w-3 h-3" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend === 'neutral' && <Minus className="w-3 h-3" />}
            {trendText}
          </span>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-24 bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-3 w-16 bg-slate-800 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className={cn('text-3xl font-black tabular-nums tracking-tight', c.value)}>
            {value}
          </p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            {label}
          </p>
          {subLabel && (
            <p className="text-[11px] text-slate-600 mt-0.5">{subLabel}</p>
          )}
        </div>
      )}
    </motion.div>
  );
};
