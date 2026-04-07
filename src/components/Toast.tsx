import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export type ToastType = 'error' | 'success' | 'info';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

let toastFunction: (msg: string, type?: ToastType) => void = () => {};

export const toast = {
  error: (msg: string) => toastFunction(msg, 'error'),
  success: (msg: string) => toastFunction(msg, 'success'),
  info: (msg: string) => toastFunction(msg, 'info'),
};

export const ToastProvider = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    toastFunction = (message: string, type: ToastType = 'info') => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2);
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-2xl max-w-sm border backdrop-blur-md",
              t.type === 'error' ? "bg-red-950/80 border-red-500/50 text-red-100" :
              t.type === 'success' ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-100" :
              "bg-slate-900/80 border-slate-700 text-slate-100"
            )}
          >
            {t.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
            {t.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />}
            
            <p className="text-sm font-medium leading-relaxed break-words flex-1 whitespace-pre-wrap">{t.message}</p>
            
            <button 
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
