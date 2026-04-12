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

  // Fallback nếu server chưa seeding data hoặc bị lỗi permission
  const finalTargetDate = targetDate || new Date("2026-06-11T07:00:00+07:00");
  const isExpired = finalTargetDate.getTime() - new Date().getTime() <= 0;

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
        {!isExpired ? (
          <>
            <TimeBox label="NGÀY" value={timeLeft.days} />
            <TimeBox label="GIỜ" value={timeLeft.hours} />
            <TimeBox label="PHÚT" value={timeLeft.minutes} />
            <TimeBox label="GIÂY" value={timeLeft.seconds} highlight />
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

const TimeBox = ({ label, value, highlight = false }: { label: string, value: number, highlight?: boolean }) => {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-14 h-16 sm:w-20 sm:h-24 md:w-24 md:h-28 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-inner ${highlight ? 'bg-red-600/20 border-red-500/50' : 'bg-slate-800/80 border-slate-700/50'} border backdrop-blur-md relative overflow-hidden group transition-all duration-300 hover:scale-105 hover:shadow-cyan-500/20`}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent p-px mix-blend-overlay"></div>
        <span className={`text-3xl sm:text-5xl md:text-6xl font-black ${highlight ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'text-white'}`}>
          {value.toString().padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">{label}</span>
    </div>
  );
};
