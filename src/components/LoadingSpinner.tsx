import { motion } from 'motion/react';

export const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-20">
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-4"
    >
      <div className="w-12 h-12 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin" />
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">
        Đang tải module...
      </p>
    </motion.div>
  </div>
);

export default LoadingSpinner;
