import React, { useState, useEffect } from 'react';
import { db, doc, onSnapshot } from '../firebase';

export const CountdownTimer = () => {
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    // Listen to exam_config realtime
    const unsub = onSnapshot(doc(db, 'metadata', 'exam_config'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().exam_date) {
        // Firebase timestamp to JS Date
        const tDate = docSnap.data().exam_date.toDate();
        setTargetDate(tDate);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Nếu targetDate vẫn null, dùng fallback để đếm ngược để UI không bị trống
    const dateToUse = targetDate || new Date("2026-06-11T07:00:00+07:00");

    const intervalId = setInterval(() => {
      const now = new Date().getTime();
      const distance = dateToUse.getTime() - now;

      if (distance < 0) {
        clearInterval(intervalId);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [targetDate]);

  // Fallback
  const finalTargetDate = targetDate || new Date("2026-06-11T07:00:00+07:00");
  const isExpired = finalTargetDate.getTime() - new Date().getTime() <= 0;

  return (
    <div className="flex flex-col items-center justify-center py-4 w-full">
      <div className="flex items-center justify-center gap-1 sm:gap-2 w-full">
        {!isExpired ? (
          <>
            <TimeBox label="NGÀY" value={timeLeft.days} color="cyan" />
            <Separator />
            <TimeBox label="GIỜ" value={timeLeft.hours} color="fuchsia" />
            <Separator />
            <TimeBox label="PHÚT" value={timeLeft.minutes} color="amber" />
            <Separator />
            <TimeBox label="GIÂY" value={timeLeft.seconds} color="red" />
          </>
        ) : (
          <div className="text-xl sm:text-2xl font-black text-red-500 tracking-widest uppercase animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]">
            HẾT GIỜ Ư?! XÔNG LÊN CHIẾN BINH!
          </div>
        )}
      </div>
    </div>
  );
};

const Separator = () => {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const id = setInterval(() => setVisible(v => !v), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="text-2xl sm:text-4xl md:text-6xl font-black text-slate-500 select-none mb-4 transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0.1 }}
    >:</span>
  );
};

type GlowColor = 'cyan' | 'fuchsia' | 'amber' | 'red';
const TimeBox = ({ label, value, color }: { label: string, value: number, color: GlowColor }) => {
  const styles = {
    cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/50',    text: 'text-cyan-300',    shadow: '0 0 30px rgba(34,211,238,0.9), 0 0 60px rgba(34,211,238,0.4)',    outer: 'shadow-cyan-500/40' },
    fuchsia: { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/50', text: 'text-fuchsia-300', shadow: '0 0 30px rgba(217,70,239,0.9), 0 0 60px rgba(217,70,239,0.4)',    outer: 'shadow-fuchsia-500/40' },
    amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/50',   text: 'text-amber-300',   shadow: '0 0 30px rgba(251,191,36,0.9), 0 0 60px rgba(251,191,36,0.4)',    outer: 'shadow-amber-500/40' },
    red:     { bg: 'bg-red-500/10',     border: 'border-red-500/50',     text: 'text-red-400',     shadow: '0 0 30px rgba(239,68,68,0.9), 0 0 60px rgba(239,68,68,0.4)',      outer: 'shadow-red-500/40' },
  }[color];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`
        flex-1 min-w-[3rem] max-w-[7rem] aspect-[3/4]
        rounded-xl md:rounded-3xl flex items-center justify-center
        ${styles.bg} border ${styles.border}
        backdrop-blur-md relative overflow-hidden
        transition-all duration-300 hover:scale-105
        shadow-[0_0_20px_rgba(0,0,0,0.5)]
      `}>
        {/* Gradient shine overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-black/30 pointer-events-none" />
        {/* Scanline effect */}
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)] pointer-events-none" />
        <span
          className={`font-black ${styles.text} font-mono tracking-tighter relative z-10 leading-none`}
          style={{ textShadow: styles.shadow, fontSize: 'clamp(1.5rem, 5vw + 0.5rem, 4.5rem)' }}
        >
          {value.toString().padStart(2, '0')}
        </span>
      </div>
      <span className={`text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] ${styles.text} opacity-80 mt-2`}>{label}</span>
    </div>
  );
};
