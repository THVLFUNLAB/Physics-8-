import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, doc, updateDoc } from '../firebase';
import { UserProfile } from '../types';
import { toast } from './Toast';
import { User, ShieldAlert, CheckCircle2, ChevronDown, GraduationCap } from 'lucide-react';

interface StudentOnboardingModalProps {
  user: UserProfile;
}

export const StudentOnboardingModal: React.FC<StudentOnboardingModalProps> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [className, setClassName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Only show if className is missing, empty
    if (!user.className || user.className.trim() === '') {
      setDisplayName(user.displayName || '');
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [user.className, user.displayName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className) {
      toast.error('Vui lòng chọn lớp của em!');
      return;
    }
    if (!displayName.trim()) {
      toast.error('Vui lòng nhập Họ và Tên!');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.trim(),
        className: className,
      });
      toast.success('Cập nhật thông tin thành công! Chào mừng em đến với hệ thống.');
      setIsOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(`Lỗi cập nhật: ${err?.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
        {/* Anti-dismiss background - no onClick handler */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-slate-900 border border-slate-700/50 p-8 pt-10 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden"
        >
          {/* Header Graphic */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />
          
          <div className="mb-8 text-center relative z-10">
            <div className="mx-auto w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 mb-4">
               <ShieldAlert className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Đăng Nhập Lần Đầu</h2>
            <p className="text-sm text-slate-400">Em vui lòng điền đủ thông tin để hệ thống sắp xếp đúng trạm không gian học tập nhé!</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            {/* Name Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <User className="w-4 h-4" /> Họ và Tên
              </label>
              <input
                type="text"
                placeholder="Nhập đầy đủ Họ Tên thật của em..."
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-medium"
              />
            </div>

            {/* Class Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <GraduationCap className="w-4 h-4" /> Lớp (Khối)
              </label>
              <div className="relative">
                <select
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700 text-white rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-bold transition-all"
                >
                  <option value="" disabled>--- Vui lòng Chọn Lớp ---</option>
                  <optgroup label="TRẠM VỀ ĐÍCH (ĐẠI HỌC) - Khối 12" className="bg-slate-900 text-red-400 font-bold">
                    <option value="12L1" className="text-white">12L1</option>
                    <option value="12L2" className="text-white">12L2</option>
                    <option value="12L3" className="text-white">12L3</option>
                    <option value="12L4" className="text-white">12L4</option>
                  </optgroup>
                  <optgroup label="TRẠM BỨT PHÁ - Khối 11" className="bg-slate-900 text-amber-500 font-bold">
                    <option value="11L1" className="text-white">11L1</option>
                    <option value="11L2" className="text-white">11L2</option>
                    <option value="11L3" className="text-white">11L3</option>
                    <option value="11L4" className="text-white">11L4</option>
                  </optgroup>
                  <optgroup label="TRẠM KHÔNG GIAN - Khối 10" className="bg-slate-900 text-cyan-400 font-bold">
                    <option value="10L1" className="text-white">10L1</option>
                    <option value="10L2" className="text-white">10L2</option>
                    <option value="10L3" className="text-white">10L3</option>
                    <option value="10L4" className="text-white">10L4</option>
                  </optgroup>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !className || !displayName.trim()}
              className="w-full mt-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black py-4 rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm"
            >
              {isSubmitting ? (
                 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" /> Xác Nhận Thông Tin
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
