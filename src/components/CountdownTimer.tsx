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
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center w-full">
        {!isExpired ? (
          <>
            <TimeBox label="NGÀY" value={timeLeft.days} color="cyan" />
            <TimeBox label="GIỜ" value={timeLeft.hours} color="fuchsia" />
            <TimeBox label="PHÚT" value={timeLeft.minutes} color="amber" />
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

type GlowColor = 'cyan' | 'fuchsia' | 'amber' | 'red';
const TimeBox = ({ label, value, color }: { label: string, value: number, color: GlowColor }) => {
  const styles = {
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/40', text: 'text-cyan-400', shadow: 'drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]', outer: 'hover:shadow-cyan-500/30' },
    fuchsia: { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/40', text: 'text-fuchsia-400', shadow: 'drop-shadow-[0_0_15px_rgba(217,70,239,0.8)]', outer: 'hover:shadow-fuchsia-500/30' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', shadow: 'drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]', outer: 'hover:shadow-amber-500/30' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-500', shadow: 'drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]', outer: 'hover:shadow-red-500/30' }
  }[color];

  return (
    <div className="flex flex-col items-center">
      <div className={`w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-inner ${styles.bg} ${styles.border} border backdrop-blur-md relative overflow-hidden group transition-all duration-300 hover:scale-105 ${styles.outer}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent mix-blend-overlay pointer-events-none"></div>
        <span className={`text-[2rem] sm:text-5xl md:text-6xl font-black ${styles.text} ${styles.shadow} font-mono tracking-tighter`}>
          {value.toString().padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">{label}</span>
    </div>
  );
};
