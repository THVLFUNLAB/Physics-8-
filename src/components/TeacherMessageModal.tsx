// ═══════════════════════════════════════════════════════════════════════
//  TeacherMessageModal.tsx — Modal nhận Tâm Thư từ Thầy Hậu
//  Popup khi học sinh đăng nhập và có thư chưa đọc (isRead: false).
//  Bấm "Đã hiểu và Quyết tâm" → isRead: true → đóng Modal.
// ═══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Heart, X, Sparkles, BookOpen } from 'lucide-react';
import {
  db, collection, getDocs, query, where, orderBy, limit, updateDoc, doc
} from '../firebase';
import type { CampaignMessage } from '../types';

interface TeacherMessageModalProps {
  studentId: string;
}

const TeacherMessageModal: React.FC<TeacherMessageModalProps> = ({ studentId }) => {
  const [message, setMessage] = useState<CampaignMessage | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ── Check for unread messages on mount ──
  useEffect(() => {
    if (!studentId) return;

    const checkMessages = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'campaign_messages'),
            where('studentId', '==', studentId),
            where('isRead', '==', false),
            orderBy('createdAt', 'desc'),
            limit(1)
          )
        );

        if (!snap.empty) {
          const msgData = snap.docs[0].data() as CampaignMessage;
          setMessage({ ...msgData, id: snap.docs[0].id });
          setIsOpen(true);
        }
      } catch (err) {
        console.warn('[TeacherMessageModal] Error fetching messages:', err);
      }
    };

    // Delay a bit so it doesn't compete with initial auth loading
    const timer = setTimeout(checkMessages, 2000);
    return () => clearTimeout(timer);
  }, [studentId]);

  // ── Mark as read & close ──
  const handleConfirm = async () => {
    if (!message?.id) return;
    setIsClosing(true);

    try {
      await updateDoc(doc(db, 'campaign_messages', message.id), { isRead: true });
    } catch (err) {
      console.error('[TeacherMessageModal] Error marking as read:', err);
    }

    // Animate out
    setTimeout(() => {
      setIsOpen(false);
      setMessage(null);
      setIsClosing(false);
    }, 400);
  };

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 400);
  };

  return (
    <AnimatePresence>
      {isOpen && message && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isClosing ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            onClick={handleDismiss}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.85, y: 40, opacity: 0 }}
            animate={{
              scale: isClosing ? 0.9 : 1,
              y: isClosing ? 20 : 0,
              opacity: isClosing ? 0 : 1,
            }}
            exit={{ scale: 0.85, y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 120 }}
            className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-[2rem] shadow-2xl shadow-fuchsia-500/10 overflow-hidden"
          >
            {/* ── Decorative Header ── */}
            <div className="relative bg-gradient-to-b from-fuchsia-500/20 via-violet-500/10 to-transparent px-6 pt-8 pb-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-fuchsia-500/15 blur-[80px] rounded-full pointer-events-none" />
              
              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative z-10 flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="w-16 h-16 bg-gradient-to-br from-fuchsia-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-fuchsia-500/30 mb-4"
                >
                  <Heart className="w-8 h-8 text-white" />
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xl font-black text-white tracking-tight"
                >
                  ✉️ Tâm Thư Từ Thầy Hậu
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-xs text-slate-400 mt-1 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-fuchsia-400" />
                  Viết bởi AI • Cá nhân hóa cho riêng con
                </motion.p>
              </div>
            </div>

            {/* ── Letter Body ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="px-6 py-4 max-h-[50vh] overflow-y-auto custom-scrollbar"
            >
              <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5">
                <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed [&>p]:mb-3 [&_strong]:text-fuchsia-400 [&_strong]:font-bold">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            </motion.div>

            {/* ── CTA Button ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="p-6 pt-2"
            >
              <button
                onClick={handleConfirm}
                className="w-full group relative bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-fuchsia-600/20 flex items-center justify-center gap-3 overflow-hidden active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <BookOpen className="w-5 h-5" />
                Đã Hiểu Và Quyết Tâm
              </button>
              <p className="text-center text-[10px] text-slate-600 mt-2">
                Bấm nút để xác nhận đã đọc thư
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TeacherMessageModal;
