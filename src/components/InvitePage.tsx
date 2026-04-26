/**
 * InvitePage.tsx
 * Route: phát hiện ?token=xxx trong URL, xử lý Magic Link VIP 1 lần.
 * Vì đây là SPA Vite (không có file-based router), component này
 * được mount từ App.tsx khi URL chứa ?invite=<token>.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  db, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs
} from '../firebase';
import { auth } from '../firebase';
import { Timestamp, writeBatch } from 'firebase/firestore';
import { UserProfile } from '../types';
import { toast } from './Toast';
import { CheckCircle2, XCircle, Loader2, Crown, ShieldCheck } from 'lucide-react';

interface InvitePageProps {
  token: string;
  user: UserProfile | null;
  onSuccess: () => void; // callback về dashboard sau khi xử lý xong
}

type InviteStatus = 'loading' | 'valid' | 'used' | 'invalid' | 'success' | 'error';

interface Invitation {
  id: string;
  token: string;
  classId: string;
  isUsed: boolean;
  createdBy: string;
  createdAt: Timestamp;
  usedBy?: string;
  usedAt?: Timestamp;
}

export const InvitePage: React.FC<InvitePageProps> = ({ token, user, onSuccess }) => {
  const [status, setStatus] = useState<InviteStatus>('loading');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    setStatus('loading');
    try {
      // Query invitations collection by token field
      const q = query(collection(db, 'invitations'), where('token', '==', token));
      const snap = await getDocs(q);

      if (snap.empty) {
        setStatus('invalid');
        setErrorMsg('Link này không tồn tại hoặc đã bị xóa.');
        return;
      }

      const invDoc = snap.docs[0];
      const inv = { id: invDoc.id, ...invDoc.data() } as Invitation;
      setInvitation(inv);

      if (inv.isUsed) {
        setStatus('used');
        setErrorMsg('Link VIP này đã được sử dụng. Mỗi link chỉ dùng được 1 lần.');
        return;
      }

      setStatus('valid');
    } catch (err: any) {
      console.error('[InvitePage] verifyToken:', err);
      setStatus('error');
      setErrorMsg(`Lỗi kết nối: ${err?.message}`);
    }
  };

  const handleActivate = async () => {
    if (!user) {
      toast.error('Vui lòng đăng nhập trước khi kích hoạt link VIP.');
      return;
    }
    if (!invitation) return;

    setStatus('loading');
    try {
      const batch = writeBatch(db);

      // 1. Đánh dấu isUsed = true (chặn dùng lại)
      batch.update(doc(db, 'invitations', invitation.id), {
        isUsed:  true,
        usedBy:  user.uid,
        usedAt:  Timestamp.now(),
      });

      // 2. Nâng cấp VIP cho user
      batch.set(
        doc(db, 'users', user.uid),
        { tier: 'vip', isUnlimited: true, maxAttempts: 9999 },
        { merge: true }
      );

      // 3. Ghi danh vào lớp VIP
      const memberDocId = `${invitation.classId}_${user.uid}`;
      batch.set(
        doc(db, 'class_members', memberDocId),
        {
          classId:     invitation.classId,
          userId:      user.uid,
          displayName: user.displayName || '',
          email:       user.email || '',
          joinedAt:    Timestamp.now(),
          source:      'magic_link',
          inviteToken: token,
        },
        { merge: true }
      );

      await batch.commit();

      setStatus('success');
      toast.success('🎉 Chúc mừng! Tài khoản đã được nâng cấp lên VIP!');

      // Redirect về dashboard sau 2.5 giây
      setTimeout(() => onSuccess(), 2500);
    } catch (err: any) {
      console.error('[InvitePage] handleActivate:', err);
      setStatus('error');
      setErrorMsg(`Kích hoạt thất bại: ${err?.message}`);
    }
  };

  // ── Renders ──────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
        <p className="text-slate-400 font-medium">Đang xác minh Magic Link...</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center"
      >
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/40">
          <Crown className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-3xl font-black text-white">Chào mừng VIP! 🎉</h2>
        <p className="text-slate-400 max-w-sm">Tài khoản đã được nâng cấp. Đang chuyển về trang học...</p>
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </motion.div>
    );
  }

  if (status === 'used' || status === 'invalid' || status === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center"
      >
        <div className="w-20 h-20 rounded-3xl bg-red-600/20 flex items-center justify-center border border-red-600/30">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-2xl font-black text-white">
          {status === 'used' ? 'Link đã được dùng' : 'Link không hợp lệ'}
        </h2>
        <p className="text-slate-400 max-w-sm text-sm">{errorMsg}</p>
        <button
          onClick={() => onSuccess()}
          className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all"
        >
          Quay về trang chính
        </button>
      </motion.div>
    );
  }

  // status === 'valid'
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh]"
    >
      <div className="bg-slate-900 border-2 border-amber-500/30 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-fuchsia-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/40 border border-amber-300">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-2xl font-black text-white mb-2">Bạn nhận được Link VIP!</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Link này sẽ nâng cấp tài khoản của bạn lên <strong className="text-amber-400">Gói VIP</strong> và xếp bạn vào lớp học chuyên biệt.<br />
            <span className="text-red-400 font-bold">Link chỉ dùng được 1 lần!</span>
          </p>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 mb-6 text-left">
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Không giới hạn lượt làm bài</li>
              <li className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Được vào lớp VIP chuyên sâu</li>
              <li className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Ưu tiên AI Vật lý siêu tốc</li>
            </ul>
          </div>

          {!user ? (
            <p className="text-amber-400 text-sm font-bold p-3 bg-amber-500/10 rounded-xl border border-amber-500/30">
              ⚠️ Vui lòng đăng nhập để kích hoạt link VIP này.
            </p>
          ) : (
            <button
              onClick={handleActivate}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-black rounded-xl text-sm uppercase tracking-widest transition-all shadow-lg shadow-amber-500/30 hover:scale-105 active:scale-95"
            >
              <Crown className="inline w-5 h-5 mr-2 -mt-0.5" />
              Kích Hoạt VIP Ngay
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default InvitePage;
