import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Bell, AlertTriangle, Info } from 'lucide-react';
import { AppNotification } from '../types';

export const NotificationCenter = ({ notifications, onRead }: { notifications?: AppNotification[], onRead: (id: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-4 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h4 className="text-xs font-black text-white uppercase tracking-widest">Thông báo</h4>
              <span className="text-[10px] text-slate-500">{unreadCount} tin mới</span>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {notifications?.map((n, i) => (
                <div 
                  key={i} 
                  onClick={() => { onRead(n.id); setIsOpen(false); }}
                  className={cn(
                    "p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer",
                    !n.read && "bg-blue-600/5"
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      n.type === 'warning' ? "bg-amber-600/10 text-amber-500" : 
                      n.type === 'success' ? "bg-green-600/10 text-green-500" : "bg-blue-600/10 text-blue-500"
                    )}>
                      {n.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{n.title}</p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                      <p className="text-[8px] text-slate-600 mt-2 uppercase font-bold">
                        {new Date(n.timestamp?.seconds * 1000).toLocaleTimeString('vi-VN')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {(!notifications || notifications.length === 0) && (
                <div className="p-10 text-center text-slate-600 italic text-xs">Không có thông báo nào.</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
