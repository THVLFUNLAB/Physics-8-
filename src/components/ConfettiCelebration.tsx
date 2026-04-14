import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export const ConfettiCelebration = ({ show, onComplete }: { show: boolean; onComplete: () => void }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onComplete, 4000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1,
    duration: 2 + Math.random() * 2,
    size: 6 + Math.random() * 8,
    color: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899'][Math.floor(Math.random() * 6)],
    rotation: Math.random() * 360,
  }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] pointer-events-none overflow-hidden"
      >
        {particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ y: -20, x: `${p.left}vw`, opacity: 1, rotate: 0 }}
            animate={{ y: '110vh', opacity: 0, rotate: p.rotation + 720 }}
            transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              left: `${p.left}%`,
            }}
          />
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        >
          <p className="text-6xl mb-4">🎉</p>
          <p className="text-3xl font-black text-white uppercase tracking-widest">THĂNG CẤP!</p>
          <p className="text-sm text-slate-400 mt-2">Chúc mừng bạn đã lên hạng mới!</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ConfettiCelebration;
