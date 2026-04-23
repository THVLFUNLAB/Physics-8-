import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, CheckCircle2, Heart, ChevronRight } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface ResetNoticeModalProps {
  userId: string;
  userName: string;
}

const RESET_VERSION = 'v9_upgrade_2026_04'; // Tăng version này khi reset lần sau

export const ResetNoticeModal: React.FC<ResetNoticeModalProps> = ({ userId, userName }) => {
  const [visible, setVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    // Hiện modal nếu chưa xác nhận reset version này
    const key = `phys9_reset_ack_${RESET_VERSION}_${userId}`;
    if (!localStorage.getItem(key)) {
      setVisible(true);
    }
  }, [userId]);

  const handleConfirm = async () => {
    setConfirmed(true);

    // Đánh dấu đã xác nhận trong localStorage
    const key = `phys9_reset_ack_${RESET_VERSION}_${userId}`;
    localStorage.setItem(key, '1');

    // Ẩn modal sau 1.5s animation
    setTimeout(() => setVisible(false), 1600);
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[500]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="fixed inset-0 z-[501] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700/60 rounded-[2rem] overflow-hidden shadow-2xl shadow-black/60">

              {/* ── Header gradient banner ── */}
              <div className="relative bg-gradient-to-br from-red-600/30 via-orange-500/20 to-amber-500/10 px-8 pt-10 pb-8 text-center overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-2 left-8 text-5xl">⚛</div>
                  <div className="absolute bottom-2 right-8 text-4xl">🎯</div>
                </div>

                {/* Icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', delay: 0.15, stiffness: 200 }}
                  className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-xl shadow-red-500/30"
                >
                  {confirmed
                    ? <CheckCircle2 className="w-10 h-10 text-white" />
                    : <Sparkles className="w-10 h-10 text-white" />
                  }
                </motion.div>

                <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                  {confirmed ? 'Cảm ơn em rất nhiều! 💪' : 'PHYS-9+ đã nâng cấp toàn diện'}
                </h2>
                <p className="text-sm text-orange-300 font-bold mt-1 uppercase tracking-widest">
                  {confirmed ? 'Hành trình mới bắt đầu từ đây' : 'Thông báo quan trọng từ Thầy Hậu'}
                </p>
              </div>

              {/* ── Body ── */}
              <AnimatePresence mode="wait">
                {!confirmed ? (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="px-8 py-6 space-y-5"
                  >
                    {/* Lời nhắn */}
                    <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-5 space-y-3">
                      <p className="text-slate-200 text-sm leading-relaxed">
                        Xin chào <span className="text-white font-bold">{userName || 'em'}</span>! 👋
                      </p>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        Để mang đến <span className="text-white font-semibold">trải nghiệm học tập tốt nhất và công bằng nhất</span> cho tất cả học sinh trên hệ thống mới PHYS-9+, Thầy đã thực hiện nâng cấp toàn diện hệ thống xếp hạng.
                      </p>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        Điểm XP và Rank của em đã được <span className="text-amber-400 font-semibold">khởi động lại từ đầu</span> — đây là cơ hội để em chinh phục vị trí cao hơn trên bảng xếp hạng mới! 🚀
                      </p>
                    </div>

                    {/* Những gì được nâng cấp */}
                    <div className="space-y-2">
                      {[
                        { icon: '⚡', text: 'Thuật toán xếp hạng mới, công bằng hơn' },
                        { icon: '🤖', text: 'Gia sư AI Thầy Hậu nâng cấp — trả lời đầy đủ hơn' },
                        { icon: '📱', text: 'Giao diện mới — mô phỏng hiển thị trên mọi thiết bị' },
                        { icon: '🎯', text: 'Dashboard thông minh theo từng khối lớp' },
                      ].map((item, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.08 }}
                          className="flex items-center gap-3 text-slate-300 text-xs"
                        >
                          <span className="text-base flex-shrink-0">{item.icon}</span>
                          <span>{item.text}</span>
                        </motion.div>
                      ))}
                    </div>

                    {/* Lời cảm ơn */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-800 pt-4">
                      <Heart className="w-3 h-3 text-red-500 flex-shrink-0" />
                      <span>Thầy Hậu trân trọng sự đồng hành của em trong hành trình chinh phục 9.0+ Vật lý!</span>
                    </div>

                    {/* CTA Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleConfirm}
                      className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-red-600/30 transition-all flex items-center justify-center gap-2"
                    >
                      Tôi đã hiểu — Bắt đầu hành trình mới!
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="confirmed"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-8 py-10 text-center space-y-3"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 250 }}
                      className="text-5xl mb-2"
                    >
                      🎉
                    </motion.div>
                    <p className="text-white font-bold text-lg">Chúc em học tốt!</p>
                    <p className="text-slate-400 text-sm">Hệ thống đang tải dữ liệu mới...</p>
                    <div className="flex justify-center mt-4">
                      <RefreshCw className="w-5 h-5 text-red-500 animate-spin" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ResetNoticeModal;
