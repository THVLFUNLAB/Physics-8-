/**
 * VipLinkGenerator.tsx
 * Admin tool: Sinh Magic Link VIP 1 lần và copy về clipboard.
 * Được nhúng vào TeacherDashboard hoặc AdminPanel.
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, doc, setDoc, getDocs, query, where, onSnapshot } from '../firebase';
import { Timestamp } from 'firebase/firestore';
import { UserProfile, ClassRoom } from '../types';
import { toast } from './Toast';
import { Link, Copy, Check, Crown, PlusCircle, Clock, User, Shield, ShieldOff } from 'lucide-react';
import { cn } from '../lib/utils';

interface VipLinkGeneratorProps {
  adminUser: UserProfile;
}

interface Invitation {
  id: string;
  token: string;
  classId: string;
  className?: string;
  isUsed: boolean;
  createdBy: string;
  createdAt: Timestamp;
  usedBy?: string;
  usedAt?: Timestamp;
}

/** Sinh token random 24 ký tự URL-safe */
const generateToken = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const BASE_URL = window.location.origin;

export const VipLinkGenerator: React.FC<VipLinkGeneratorProps> = ({ adminUser }) => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Real-time listener: danh sách lớp học
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'classes'), snap => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassRoom)));
    });
    return unsub;
  }, []);

  // Real-time listener: tất cả invitations do admin này tạo
  useEffect(() => {
    const q = query(collection(db, 'invitations'), where('createdBy', '==', adminUser.uid));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Invitation))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setInvitations(list);
    });
    return unsub;
  }, [adminUser.uid]);

  const handleGenerate = async () => {
    if (!selectedClassId) {
      toast.error('Vui lòng chọn lớp VIP trước khi tạo link!');
      return;
    }
    setIsGenerating(true);
    try {
      const token = generateToken();
      const invRef = doc(collection(db, 'invitations'));
      const selectedClass = classes.find(c => c.id === selectedClassId);

      await setDoc(invRef, {
        token,
        classId:   selectedClassId,
        className: selectedClass?.name || selectedClassId,
        isUsed:    false,
        createdBy: adminUser.uid,
        createdAt: Timestamp.now(),
      });

      toast.success('✅ Đã tạo Magic Link VIP thành công!');
    } catch (err: any) {
      console.error('[VipLinkGenerator]', err);
      toast.error(`Lỗi tạo link: ${err?.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (inv: Invitation) => {
    const link = `${BASE_URL}?invite=${inv.token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(inv.id);
      toast.success('📋 Đã copy link vào clipboard!');
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-amber-500/20 rounded-2xl">
          <Crown className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Magic Link VIP</h3>
          <p className="text-slate-400 text-sm">Tạo link 1 lần để nâng cấp học sinh lên VIP và xếp vào lớp</p>
        </div>
      </div>

      {/* Generator Card */}
      <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 space-y-4">
        <h4 className="text-sm font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Tạo Link Mới
        </h4>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedClassId}
            onChange={e => setSelectedClassId(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-500 transition-all"
          >
            <option value="">— Chọn lớp VIP gán kèm theo —</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id!}>
                {cls.name} {cls.code ? `(${cls.code})` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedClassId}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-black text-sm rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 whitespace-nowrap"
          >
            {isGenerating ? (
              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Link className="w-4 h-4" />
            )}
            Tạo Magic Link
          </button>
        </div>
      </div>

      {/* Invitation History */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Lịch sử Link đã tạo</h4>
          <span className="text-xs text-slate-500">{invitations.length} link</span>
        </div>

        {invitations.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Chưa có link nào. Hãy tạo link đầu tiên ở trên.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {invitations.map(inv => {
              const link = `${BASE_URL}?invite=${inv.token}`;
              const isCopied = copiedId === inv.id;
              return (
                <div key={inv.id} className={cn(
                  'px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all',
                  inv.isUsed ? 'opacity-50' : 'hover:bg-slate-800/30'
                )}>
                  {/* Status Badge */}
                  <div className={cn(
                    'shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold',
                    inv.isUsed
                      ? 'bg-slate-700/50 text-slate-500'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  )}>
                    {inv.isUsed ? <ShieldOff className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {inv.isUsed ? 'Đã dùng' : 'Còn hiệu lực'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-white truncate">{inv.className || inv.classId}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {inv.createdAt?.toDate?.()?.toLocaleDateString('vi-VN') || '—'}
                      </span>
                      {inv.isUsed && inv.usedBy && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <User className="w-3 h-3" />
                          Đã dùng bởi {inv.usedBy.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                    {/* Link preview (truncated) */}
                    <code className="block mt-1 text-[10px] text-slate-600 truncate max-w-[300px]">
                      {link}
                    </code>
                  </div>

                  {/* Copy Button */}
                  {!inv.isUsed && (
                    <button
                      onClick={() => handleCopy(inv)}
                      className={cn(
                        'shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all',
                        isCopied
                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      )}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {isCopied ? 'Đã Copy!' : 'Copy Link'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VipLinkGenerator;
