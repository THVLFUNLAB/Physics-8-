/**
 * StudentMissionsView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Trang "Nhiệm Vụ" riêng biệt cho HS — hiển thị toàn bộ bài tập GV giao.
 *
 * Tính năng:
 * - Danh sách đầy đủ các đề GV phát cho lớp (10/11/12)
 * - Khi click "Làm bài", các card khác tối màu lại (focus mode)
 * - Badge trạng thái: Chưa làm / Đang làm / Đã nộp / Sắp hết hạn
 * - Lọc theo: Tất cả / Chưa làm / Đã nộp
 * - Tự động refresh mỗi 5 phút
 *
 * ✅ Standalone component — không ảnh hưởng StudentDashboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target, Play, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, Filter, Loader2, GraduationCap, BookOpen,
  ChevronRight, Bell, Trophy, BarChart2,
} from 'lucide-react';
import {
  getStudentAssignedExams,
  clearStudentAssignmentCache,
  type StudentAssignedExam,
} from '../services/studentAssignmentService';
import type { UserProfile, Exam } from '../types';
import { cn } from '../lib/utils';

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  user: UserProfile;
  onStartExam: (exam: Exam) => void;
}

// ─── Filter type ──────────────────────────────────────────────────────────────
type FilterType = 'all' | 'pending' | 'done';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDeadline(deadline: any): { text: string; urgency: 'expired' | 'urgent' | 'normal' | null } {
  if (!deadline) return { text: '', urgency: null };
  const secs = deadline?.seconds ?? null;
  if (!secs) return { text: '', urgency: null };
  const diff = secs * 1000 - Date.now();
  if (diff < 0) return { text: 'Đã hết hạn', urgency: 'expired' };
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (hours < 1) return { text: 'Còn < 1 giờ!', urgency: 'urgent' };
  if (hours < 24) return { text: `Còn ${hours}h`, urgency: 'urgent' };
  return { text: `Còn ${days} ngày`, urgency: 'normal' };
}

function fmtDate(ts: any): string {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// ─── Mission Card ─────────────────────────────────────────────────────────────
interface MissionCardProps {
  item: StudentAssignedExam;
  isSelected: boolean;
  isDimmed: boolean;
  onSelect: (id: string) => void;
  onStart: (exam: Exam) => void;
}

const MissionCard: React.FC<MissionCardProps> = ({ item, isSelected, isDimmed, onSelect, onStart }) => {
  const deadline = formatDeadline(item.assignment.deadline);
  const title = item.exam?.title || item.assignment.examTitle || 'Đề kiểm tra';
  const duration = item.exam?.durationMinutes;
  const grade = item.exam?.targetGrade || item.assignment?.targetGrade;
  const progress = item.assignment.totalStudents
    ? Math.round(((item.assignment.submittedCount ?? 0) / item.assignment.totalStudents) * 100)
    : null;

  const borderColor = item.hasSubmitted
    ? '#334155'
    : deadline.urgency === 'urgent' || deadline.urgency === 'expired'
      ? '#ef4444'
      : '#10b981';

  const glowColor = item.hasSubmitted
    ? 'transparent'
    : deadline.urgency === 'urgent'
      ? 'rgba(239,68,68,0.15)'
      : 'rgba(16,185,129,0.1)';

  return (
    <motion.div
      layout
      onClick={() => !item.hasSubmitted && onSelect(item.assignmentId)}
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: isDimmed ? 0.3 : 1,
        scale: isSelected ? 1.01 : 1,
        y: 0,
      }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-2xl border p-4 space-y-3 transition-all cursor-pointer select-none',
        isSelected && 'ring-2 ring-offset-1 ring-offset-slate-950',
        !item.hasSubmitted && !isDimmed && 'hover:scale-[1.005]',
      )}
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${glowColor}, rgba(15,23,42,0.9))`
          : item.hasSubmitted
            ? 'rgba(15,23,42,0.5)'
            : `linear-gradient(135deg, ${glowColor}, rgba(15,23,42,0.8))`,
        border: `1px solid ${isSelected ? borderColor : `${borderColor}50`}`,
        boxShadow: isSelected ? `0 0 24px ${glowColor}` : 'none',
        ringColor: borderColor,
      }}
    >
      {/* ── Top row ── */}
      <div className="flex items-start justify-between gap-3">
        {/* Status icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: item.hasSubmitted
              ? 'rgba(16,185,129,0.1)'
              : deadline.urgency === 'urgent'
                ? 'rgba(239,68,68,0.15)'
                : 'rgba(16,185,129,0.1)',
            border: `1px solid ${borderColor}40`,
          }}
        >
          {item.hasSubmitted
            ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            : deadline.urgency === 'urgent'
              ? <AlertTriangle className="w-5 h-5 text-red-400" />
              : <Target className="w-5 h-5 text-emerald-400" />
          }
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-black text-sm leading-snug line-clamp-2',
            item.hasSubmitted ? 'text-slate-400 line-through decoration-slate-600' : 'text-white',
          )}>
            {title}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] text-slate-500">
              {item.assignment.className}
            </span>
            {grade && (
              <span
                className="px-1.5 py-0.5 rounded-md text-[10px] font-black"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}
              >
                Khối {grade}
              </span>
            )}
            {duration && (
              <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />{duration} phút
              </span>
            )}
          </div>
        </div>

        {/* Deadline badge */}
        {deadline.urgency && (
          <span
            className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
            style={{
              background: deadline.urgency === 'urgent' || deadline.urgency === 'expired'
                ? 'rgba(239,68,68,0.15)'
                : 'rgba(16,185,129,0.12)',
              color: deadline.urgency === 'urgent' || deadline.urgency === 'expired'
                ? '#f87171'
                : '#6ee7b7',
            }}
          >
            <Clock className="w-3 h-3" />
            {deadline.text}
          </span>
        )}
      </div>

      {/* ── Progress bar (if leaderboard enabled) ── */}
      {item.assignment.showLeaderboard && progress !== null && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-600">
            <span>Tiến độ lớp</span>
            <span>{item.assignment.submittedCount ?? 0}/{item.assignment.totalStudents} đã nộp</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #10b981, #06b6d4)' }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>
      )}

      {/* ── CTA ── */}
      <AnimatePresence>
        {isSelected && !item.hasSubmitted && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              if (item.exam) onStart(item.exam);
            }}
            disabled={!item.exam}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-black text-sm text-white transition-all active:scale-97 disabled:opacity-50"
            style={{
              background: deadline.urgency === 'urgent'
                ? 'linear-gradient(135deg, #dc2626, #f97316)'
                : 'linear-gradient(135deg, #059669, #06b6d4)',
              boxShadow: deadline.urgency === 'urgent'
                ? '0 0 20px rgba(239,68,68,0.35)'
                : '0 0 20px rgba(16,185,129,0.3)',
            }}
          >
            <Play className="w-4 h-4" fill="currentColor" />
            {deadline.urgency === 'urgent' ? '⚡ NỘP NGAY!' : '🎯 BẮT ĐẦU LÀM BÀI'}
          </motion.button>
        )}
        {item.hasSubmitted && (
          <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã nộp bài · {fmtDate(item.assignment.assignedAt)}</span>
            {item.assignment.allowReview && item.exam && (
              <button
                className="ml-auto text-[11px] text-slate-500 hover:text-slate-300 underline transition-colors"
                onClick={(e) => { e.stopPropagation(); onStart(item.exam!); }}
              >
                Xem lại đáp án
              </button>
            )}
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ filter: FilterType }> = ({ filter }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 px-6 text-center"
  >
    <div
      className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
    >
      {filter === 'done'
        ? <Trophy className="w-10 h-10 text-amber-400" />
        : <Target className="w-10 h-10 text-emerald-400" />
      }
    </div>
    <h3 className="font-black text-white text-lg mb-2">
      {filter === 'all' ? 'Chưa có nhiệm vụ nào' : filter === 'pending' ? 'Tất cả đã hoàn thành!' : 'Chưa có bài nào đã nộp'}
    </h3>
    <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
      {filter === 'all'
        ? 'Giáo viên sẽ giao bài vào đây. Hãy đảm bảo bạn đã tham gia lớp học của giáo viên.'
        : filter === 'pending'
          ? 'Xuất sắc lắm! Bạn đã hoàn thành tất cả bài tập được giao.'
          : 'Bạn chưa nộp bài nào. Hãy bắt đầu từ danh sách "Chưa làm".'}
    </p>
    <div
      className="mt-6 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold"
      style={{ background: 'rgba(16,185,129,0.08)', color: '#6ee7b7' }}
    >
      <Bell className="w-4 h-4" />
      Bạn sẽ nhận thông báo khi GV giao bài mới
    </div>
  </motion.div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const StudentMissionsView: React.FC<Props> = ({ user, onStartExam }) => {
  const [items, setItems] = useState<StudentAssignedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    if (force) {
      clearStudentAssignmentCache(user.uid);
      setRefreshing(true);
    }
    try {
      const data = await getStudentAssignedExams(user.uid, user.classId);
      setItems(data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.uid, user.classId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 5 * 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Close selection when clicking outside card area
  const handleToggleSelect = (id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  // Filter items
  const displayed = items.filter(item => {
    if (filter === 'pending') return !item.hasSubmitted;
    if (filter === 'done') return item.hasSubmitted;
    return true;
  });

  const pending = items.filter(i => !i.hasSubmitted);
  const done = items.filter(i => i.hasSubmitted);
  const urgent = pending.filter(i => {
    const d = formatDeadline(i.assignment.deadline);
    return d.urgency === 'urgent' || d.urgency === 'expired';
  });

  const anySelected = selectedId !== null;

  return (
    <div
      className="min-h-screen"
      onClick={(e) => {
        // Clicking the background deselects
        if ((e.target as HTMLElement).closest('[data-mission-card]') === null) {
          setSelectedId(null);
        }
      }}
    >
      <div className="max-w-lg mx-auto p-4 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              Nhiệm Vụ Được Giao
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Bài tập từ giáo viên — click vào thẻ để làm bài
            </p>
          </div>
          <button
            onClick={() => fetchData(true)}
            className="p-2 rounded-xl hover:bg-slate-800 transition-colors text-slate-500 hover:text-slate-300"
            title="Làm mới"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin text-emerald-400')} />
          </button>
        </div>

        {/* ── Urgent Alert ── */}
        <AnimatePresence>
          {urgent.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 animate-pulse" />
              <div>
                <p className="text-red-400 font-black text-sm">{urgent.length} bài sắp hết hạn!</p>
                <p className="text-red-400/70 text-xs">Hãy nộp bài ngay trước khi quá giờ.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stats strip ── */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Tổng nhiệm vụ', value: items.length, color: '#6366f1', icon: BookOpen },
              { label: 'Chưa làm', value: pending.length, color: '#f59e0b', icon: Clock },
              { label: 'Đã hoàn thành', value: done.length, color: '#10b981', icon: CheckCircle2 },
            ].map(({ label, value, color, icon: Icon }) => (
              <div
                key={label}
                className="p-3 rounded-2xl flex flex-col items-center text-center"
                style={{ background: `${color}0f`, border: `1px solid ${color}25` }}
              >
                <Icon className="w-4 h-4 mb-1" style={{ color }} />
                <p className="text-lg font-black text-white">{value}</p>
                <p className="text-[10px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Filter tabs ── */}
        <div className="flex gap-2 p-1 bg-slate-900/60 rounded-xl border border-slate-800/60">
          {([
            { id: 'all', label: 'Tất cả', count: items.length },
            { id: 'pending', label: 'Chưa làm', count: pending.length },
            { id: 'done', label: 'Đã nộp', count: done.length },
          ] as { id: FilterType; label: string; count: number }[]).map(f => (
            <button
              key={f.id}
              onClick={() => { setFilter(f.id); setSelectedId(null); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all"
              style={filter === f.id
                ? { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }
                : { color: '#64748b', border: '1px solid transparent' }
              }
            >
              {f.label}
              {f.count > 0 && (
                <span
                  className="px-1.5 rounded-full text-[10px] font-black"
                  style={filter === f.id
                    ? { background: 'rgba(16,185,129,0.3)', color: '#6ee7b7' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#475569' }
                  }
                >
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Hint when item selected ── */}
        <AnimatePresence>
          {anySelected && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }}
            >
              <BarChart2 className="w-4 h-4" />
              <span>Click vào thẻ khác để chuyển · Bấm ra ngoài để bỏ chọn</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Mission list ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-sm text-slate-500">Đang tải danh sách nhiệm vụ...</p>
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="space-y-3" data-mission-list>
            {displayed.map(item => (
              <div key={item.assignmentId} data-mission-card="true">
                <MissionCard
                  item={item}
                  isSelected={selectedId === item.assignmentId}
                  isDimmed={anySelected && selectedId !== item.assignmentId && !item.hasSubmitted}
                  onSelect={handleToggleSelect}
                  onStart={(exam) => {
                    setSelectedId(null);
                    onStartExam(exam);
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Footer tip ── */}
        {!loading && items.length > 0 && (
          <p className="text-center text-[11px] text-slate-700 pb-4">
            Tự động làm mới mỗi 5 phút · {items.length} nhiệm vụ từ giáo viên
          </p>
        )}
      </div>
    </div>
  );
};

export default StudentMissionsView;
