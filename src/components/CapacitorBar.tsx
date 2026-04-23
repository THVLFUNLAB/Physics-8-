/**
 * CapacitorBar — Cột Năng Lượng (Capacitor Overload) UI
 * ──────────────────────────────────────────────────────
 * Hiển thị mức năng lượng của phòng thi realtime.
 * Tối ưu cho mobile: dùng CSS custom property + GPU compositor layer.
 *
 * Performance principles (R3):
 *  1. React.memo — chỉ re-render khi energy thay đổi
 *  2. CSS custom property thay vì inline style tính toán trong JS
 *  3. will-change: transform để đẩy lên GPU
 *  4. Hiệu ứng tia sét dùng CSS animation, không dùng JS setInterval
 *
 * Usage (trên màn chiếu Projector):
 *   <CapacitorBar energy={roomEnergy} recentEvents={recentEvents} showLabel />
 */

import React, { useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MAX_ENERGY } from '../hooks/useEnergyBuffer';
import type { EnergyEvent } from '../hooks/useEnergyBuffer';

// ─── Types ─────────────────────────────────────────────────────────────────

interface CapacitorBarProps {
  /** Mức năng lượng hiện tại (0 đến MAX_ENERGY). */
  energy: number;
  /** Các sự kiện gần nhất để animate "+2" nổi lên. */
  recentEvents?: EnergyEvent[];
  /** Hiện nhãn % và trạng thái bên cạnh bar. */
  showLabel?: boolean;
  /** Kích thước: 'sm' (trong giao diện học sinh), 'lg' (màn chiếu). */
  size?: 'sm' | 'lg';
  /** Callback khi energy đạt 100% (để trigger effect bùng nổ). */
  onFullCharge?: () => void;
}

// ─── Color zones ───────────────────────────────────────────────────────────

function getEnergyColor(energy: number): {
  barClass: string;
  glowColor: string;
  label: string;
  emoji: string;
} {
  if (energy >= 80) return {
    barClass: 'from-red-500 via-orange-400 to-yellow-300',
    glowColor: 'rgba(239,68,68,0.6)',
    label: 'NGUY HIỂM',
    emoji: '⚡',
  };
  if (energy >= 50) return {
    barClass: 'from-orange-600 via-amber-500 to-yellow-400',
    glowColor: 'rgba(249,115,22,0.5)',
    label: 'ĐANG NẠP',
    emoji: '🔋',
  };
  return {
    barClass: 'from-blue-600 via-indigo-500 to-violet-400',
    glowColor: 'rgba(99,102,241,0.4)',
    label: 'KHỞI ĐỘNG',
    emoji: '💡',
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

export const CapacitorBar: React.FC<CapacitorBarProps> = memo(({
  energy,
  recentEvents = [],
  showLabel = false,
  size = 'sm',
  onFullCharge,
}) => {
  const fillRef = useRef<HTMLDivElement>(null);
  const prevEnergyRef = useRef(energy);
  const wasFullRef = useRef(false);

  const clampedEnergy = Math.max(0, Math.min(energy, MAX_ENERGY));
  const percent = (clampedEnergy / MAX_ENERGY) * 100;
  const { barClass, glowColor, label, emoji } = getEnergyColor(clampedEnergy);
  const isFullCharge = clampedEnergy >= MAX_ENERGY;

  // ── DOM direct update — bypass React reconciler cho animation mượt ──
  useEffect(() => {
    if (!fillRef.current) return;
    fillRef.current.style.setProperty('--energy-pct', `${percent}%`);
  }, [percent]);

  // ── Full charge callback ──
  useEffect(() => {
    if (isFullCharge && !wasFullRef.current) {
      wasFullRef.current = true;
      onFullCharge?.();
    }
    if (!isFullCharge) {
      wasFullRef.current = false;
    }
  }, [isFullCharge, onFullCharge]);

  // ── Track recent events để hiển thị "+2" floating ──
  const latestEvent = recentEvents[recentEvents.length - 1];
  const prevEventRef = useRef<EnergyEvent | null>(null);
  const showFloating = latestEvent && latestEvent !== prevEventRef.current;
  if (showFloating) prevEventRef.current = latestEvent;

  // ── Sizes ──
  const barHeight = size === 'lg' ? 'h-48 w-12' : 'h-24 w-6';
  const labelSize = size === 'lg' ? 'text-sm' : 'text-[10px]';

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* ── Label trên ── */}
      {showLabel && (
        <div className={`font-black uppercase tracking-widest text-slate-400 ${labelSize}`}>
          {emoji} {label}
        </div>
      )}

      {/* ── Container ── */}
      <div className="relative flex items-end">
        {/* Outer bar (nền) */}
        <div
          className={`relative ${barHeight} rounded-full bg-slate-800 border border-slate-700 overflow-hidden`}
          style={{
            boxShadow: isFullCharge ? `0 0 20px ${glowColor}` : undefined,
          }}
        >
          {/* Fill bar — animation driven by CSS custom property */}
          <div
            ref={fillRef}
            className={`absolute bottom-0 left-0 right-0 rounded-full bg-gradient-to-t ${barClass}`}
            style={{
              height: 'var(--energy-pct, 0%)',
              willChange: 'height',
              transition: 'height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          />

          {/* Shimmer overlay */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 60%)',
            }}
          />

          {/* Lightning bolt + burst khi đầy 100% */}
          {isFullCharge && (
            <>
              {/* Burst glow overlay — expand + fade */}
              <motion.div
                key="burst"
                initial={{ opacity: 0.9, scale: 0.6 }}
                animate={{ opacity: 0, scale: 2.8 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)` }}
              />
              {/* Tia sét nhấp nháy liên tục */}
              <div
                className="absolute inset-0 flex items-center justify-center font-black pointer-events-none"
                style={{
                  animation: 'lightning-pulse 0.4s ease-in-out infinite',
                  fontSize: size === 'lg' ? '1.8rem' : '0.9rem',
                  textShadow: `0 0 10px ${glowColor}, 0 0 20px ${glowColor}`,
                }}
              >
                ⚡
              </div>
            </>
          )}

        </div>

        {/* ── Floating "+N" khi nạp năng lượng ── */}
        <AnimatePresence>
          {showFloating && latestEvent && (
            <motion.div
              key={latestEvent.ts}
              initial={{ opacity: 1, y: 0, x: 8 }}
              animate={{ opacity: 0, y: -40 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="absolute right-0 top-0 text-amber-400 font-black text-xs pointer-events-none whitespace-nowrap"
            >
              +{latestEvent.delta}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Percent label dưới ── */}
      {showLabel && (
        <div className={`font-black text-white ${labelSize}`}>
          {Math.round(percent)}%
        </div>
      )}

      {/* ── Tên học sinh vừa nạp ── */}
      {showLabel && latestEvent && (
        <div className={`text-slate-500 font-medium ${labelSize} truncate max-w-[80px]`}>
          {latestEvent.name}
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.energy === next.energy &&
  prev.recentEvents === next.recentEvents &&
  prev.showLabel === next.showLabel &&
  prev.size === next.size
);

CapacitorBar.displayName = 'CapacitorBar';

export default CapacitorBar;
