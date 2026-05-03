/**
 * TeacherNotificationsV2.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Hệ thống thông báo GV → HS. Thay thế placeholder TeacherMessages.tsx.
 * ✅ Standalone — không sửa file hiện có.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare, Send, Bell, Pin, Users, CheckCheck,
  Megaphone, Clock, AlarmClock, Trophy, ChevronDown,
} from 'lucide-react';
import type { UserProfile } from '../../../types';
import type { useTeacherPortal } from '../useTeacherPortal';
import {
  sendNotification,
  getTeacherNotifications,
  togglePinNotification,
  type TeacherNotification,
} from '../services/teacherNotificationService';
import { toast } from '../../../components/Toast';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; user: UserProfile; }

// ─── Types ───────────────────────────────────────────────────────────────────

type NotifType = TeacherNotification['type'];

const TYPE_CONFIG: Record<NotifType, { icon: React.FC<any>; label: string; color: string; bg: string }> = {
  announcement: { icon: Megaphone,   label: 'Thông báo', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  reminder:     { icon: AlarmClock,  label: 'Nhắc nhở',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  alert:        { icon: Bell,        label: 'Cảnh báo',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  achievement:  { icon: Trophy,      label: 'Khen ngợi', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
};

// ─── Helper: format timestamp ─────────────────────────────────────────────────
function fmtTime(ts: any): string {
  if (!ts) return '';
  const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ trước`;
  return d.toLocaleDateString('vi-VN');
}

// ─── Notification Card ────────────────────────────────────────────────────────
const NotifCard: React.FC<{
  notif: TeacherNotification;
  onTogglePin: (id: string, pinned: boolean) => void;
}> = ({ notif, onTogglePin }) => {
  const cfg = TYPE_CONFIG[notif.type];
  const Icon = cfg.icon;
  const readCount = notif.readBy?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border p-4 flex gap-3 relative group"
      style={{ background: cfg.bg, borderColor: `${cfg.color}30` }}
    >
      {/* Pin indicator */}
      {notif.pinned && (
        <div className="absolute top-2 right-2">
          <Pin className="w-3.5 h-3.5" style={{ color: cfg.color }} />
        </div>
      )}

      {/* Type icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: cfg.bg, border: `1px solid ${cfg.color}40` }}
      >
        <Icon className="w-4 h-4" style={{ color: cfg.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-bold text-white text-sm leading-tight">{notif.title}</p>
          <span className="text-[10px] text-slate-500 whitespace-nowrap flex-shrink-0 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {fmtTime(notif.createdAt)}
          </span>
        </div>
        <p className="text-slate-400 text-xs mt-1 leading-relaxed line-clamp-2">{notif.body}</p>
        <div className="flex items-center gap-3 mt-2.5">
          {/* Class tags */}
          <div className="flex gap-1 flex-wrap">
            {notif.targetClassNames.slice(0, 3).map(cn => (
              <span
                key={cn}
                className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                style={{ background: `${cfg.color}20`, color: cfg.color }}
              >
                {cn}
              </span>
            ))}
            {notif.targetClassNames.length > 3 && (
              <span className="text-[10px] text-slate-600">+{notif.targetClassNames.length - 3}</span>
            )}
          </div>
          {/* Read count */}
          <span className="text-[10px] text-slate-600 ml-auto flex items-center gap-1">
            <CheckCheck className="w-3 h-3 text-emerald-600" />
            {readCount} đã đọc
          </span>
          {/* Pin toggle */}
          <button
            onClick={() => onTogglePin(notif.id!, !notif.pinned)}
            className="text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
          >
            {notif.pinned ? 'Bỏ ghim' : 'Ghim'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Compose Form ─────────────────────────────────────────────────────────────
const ComposeForm: React.FC<{
  classes: { id: string; name: string }[];
  teacherId: string;
  teacherName: string;
  onSent: () => void;
}> = ({ classes, teacherId, teacherName, onSent }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<NotifType>('announcement');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showClassPicker, setShowClassPicker] = useState(false);

  const toggleClass = (id: string) => {
    setSelectedClassIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Vui lòng nhập tiêu đề và nội dung thông báo.');
      return;
    }
    setSending(true);
    try {
      const targetIds = selectedClassIds.length > 0 ? selectedClassIds : classes.map(c => c.id);
      const targetNames = selectedClassIds.length > 0
        ? classes.filter(c => selectedClassIds.includes(c.id)).map(c => c.name)
        : classes.map(c => c.name);
      await sendNotification({
        teacherId, teacherName, title: title.trim(), body: body.trim(),
        type, targetClassIds: targetIds, targetClassNames: targetNames, pinned: false,
      });
      toast.success('Đã gửi thông báo thành công!');
      setTitle(''); setBody(''); setSelectedClassIds([]);
      onSent();
    } catch (e) {
      toast.error('Không thể gửi thông báo. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <h4 className="font-black text-white text-sm flex items-center gap-2">
        <Send className="w-4 h-4 text-emerald-400" /> Soạn thông báo mới
      </h4>

      {/* Type selector */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.entries(TYPE_CONFIG) as [NotifType, any][]).map(([t, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold transition-all"
              style={type === t
                ? { background: cfg.bg, border: `1px solid ${cfg.color}50`, color: cfg.color }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#64748b' }
              }
            >
              <Icon className="w-4 h-4" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Tiêu đề thông báo..."
        className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700/40 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
        maxLength={100}
      />

      {/* Body */}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Nội dung thông báo... (hỗ trợ nhiều dòng)"
        rows={3}
        className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700/40 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
        maxLength={500}
      />

      {/* Class picker */}
      <div>
        <button
          onClick={() => setShowClassPicker(v => !v)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <Users className="w-4 h-4" />
          {selectedClassIds.length === 0
            ? 'Gửi đến tất cả lớp'
            : `${selectedClassIds.length} lớp đã chọn`}
          <ChevronDown className={`w-4 h-4 transition-transform ${showClassPicker ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence>
          {showClassPicker && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex flex-wrap gap-2"
            >
              {classes.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleClass(c.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={selectedClassIds.includes(c.id)
                    ? { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }
                  }
                >
                  {c.name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={sending || !title.trim() || !body.trim()}
        className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 0 20px rgba(16,185,129,0.3)' }}
      >
        {sending ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {sending ? 'Đang gửi...' : 'Gửi thông báo'}
      </button>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const TeacherNotificationsV2: React.FC<Props> = ({ portal, user }) => {
  const [notifications, setNotifications] = useState<TeacherNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  const loadNotifs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTeacherNotifications(user.uid);
      setNotifications(data);
    } catch (e) {
      toast.error('Không thể tải thông báo.');
    } finally {
      setLoading(false);
    }
  }, [user.uid]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  const handleTogglePin = async (id: string, pinned: boolean) => {
    await togglePinNotification(id, pinned);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, pinned } : n)
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
    );
  };

  const pinnedNotifs = notifications.filter(n => n.pinned);
  const regularNotifs = notifications.filter(n => !n.pinned);
  const classOptions = portal.classes.map(c => ({ id: c.id!, name: c.name }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="tp-section-header">
        <h3 className="tp-section-title"><MessageSquare /> Thông Báo Lớp Học</h3>
        <button
          className="tp-btn-primary"
          onClick={() => setShowCompose(v => !v)}
        >
          <Send className="w-4 h-4" />
          {showCompose ? 'Đóng' : 'Soạn thông báo'}
        </button>
      </div>

      {/* Stats pills */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Đã gửi', value: notifications.length, color: '#10b981' },
          { label: 'Đã ghim', value: pinnedNotifs.length, color: '#f59e0b' },
          { label: 'Tổng lớp', value: classOptions.length, color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold"
            style={{ background: `${color}12`, border: `1px solid ${color}30`, color }}
          >
            <span className="text-white font-black">{value}</span>
            <span className="opacity-70">{label}</span>
          </div>
        ))}
      </div>

      {/* Compose form */}
      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <ComposeForm
              classes={classOptions}
              teacherId={user.uid}
              teacherName={user.displayName || 'Giáo viên'}
              onSent={() => { setShowCompose(false); loadNotifs(); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notifications list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="tp-skeleton h-20 rounded-2xl" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="tp-empty">
          <MessageSquare />
          <p className="tp-empty-title">Chưa có thông báo nào</p>
          <p className="tp-empty-desc">Soạn thông báo đầu tiên để gửi đến học sinh trong lớp của bạn.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pinnedNotifs.length > 0 && (
            <>
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-500/70 flex items-center gap-2">
                <Pin className="w-3 h-3" /> Đã ghim
              </p>
              {pinnedNotifs.map(n => (
                <NotifCard key={n.id} notif={n} onTogglePin={handleTogglePin} />
              ))}
              {regularNotifs.length > 0 && (
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-600 pt-1">
                  Tất cả thông báo
                </p>
              )}
            </>
          )}
          {regularNotifs.map(n => (
            <NotifCard key={n.id} notif={n} onTogglePin={handleTogglePin} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherNotificationsV2;
