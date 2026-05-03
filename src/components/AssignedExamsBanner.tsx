/**
 * AssignedExamsBanner.tsx — Hiển thị đề GV phát trong StudentDashboard
 *
 * Thiết kế:
 * - Banner nổi bật xuất hiện ngay dưới NHIỆM VỤ HÔM NAY nếu có đề được giao
 * - Urgent countdown nếu deadline còn < 24h
 * - Progress bar số HS đã nộp (nếu showLeaderboard = true)
 * - Nút "Làm bài" → onStartExam()
 * - Nút "Đã nộp" (disabled) nếu HS đã nộp rồi
 *
 * Performance: useSWR-style polling mỗi 5 phút, cache sessionStorage
 */
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ClipboardList, Play, CheckCircle2, Clock, ChevronDown, ChevronUp,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { getStudentAssignedExams, clearStudentAssignmentCache } from '../services/studentAssignmentService';
import type { UserProfile, Exam } from '../types';
import { cn } from '../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  user: UserProfile;
  onStartExam: (exam: Exam) => void;
}

// ── Deadline helper ───────────────────────────────────────────────────────────
function formatDeadline(deadline: any): { text: string; isUrgent: boolean } | null {
  if (!deadline) return null;
  const secs = deadline?.seconds ?? (deadline instanceof Date ? deadline.getTime() / 1000 : null);
  if (!secs) return null;

  const ms = secs * 1000;
  const diff = ms - Date.now();
  if (diff < 0) return { text: 'Đã hết hạn', isUrgent: true };

  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(hours / 24);
  const isUrgent = hours < 24;

  if (hours < 1)  return { text: 'Còn dưới 1 giờ!', isUrgent: true };
  if (hours < 24) return { text: `Còn ${hours}h`, isUrgent: true };
  return { text: `Còn ${days} ngày`, isUrgent: false };
}

// ── Main Component ────────────────────────────────────────────────────────────

const AssignedExamsBanner: React.FC<Props> = ({ user, onStartExam }) => {
  const [items, setItems] = useState<Awaited<ReturnType<typeof getStudentAssignedExams>>>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAssignments = useCallback(async (force = false) => {
    if (force) {
      clearStudentAssignmentCache(user.uid);
      setRefreshing(true);
    }
    try {
      const data = await getStudentAssignedExams(user.uid, user.classId);
      setItems(data);
    } catch (e) {
      console.warn('[AssignedExams] fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.uid, user.classId]);

  useEffect(() => {
    fetchAssignments();
    // Polling mỗi 5 phút
    const interval = setInterval(() => fetchAssignments(true), 5 * 60_000);
    return () => clearInterval(interval);
  }, [fetchAssignments]);

  // Không render gì nếu không có assignments
  if (!loading && items.length === 0) return null;

  const pending = items.filter(i => !i.hasSubmitted);
  const done    = items.filter(i => i.hasSubmitted);
  const displayItems = expanded ? items : items.slice(0, 2);

  const urgentCount = pending.filter(i => {
    const info = formatDeadline(i.assignment.deadline);
    return info?.isUrgent;
  }).length;

  return (
    <div className="space-y-2">
      {/* ── Section Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
          <ClipboardList className="w-3.5 h-3.5 text-emerald-400" />
          ĐỀ GIÁO VIÊN PHÁT
          {pending.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black">
              {pending.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => fetchAssignments(true)}
          className="text-slate-600 hover:text-slate-400 transition-colors p-1"
          title="Làm mới"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* ── Urgent badge ─────────────────────────────────────────────── */}
      {urgentCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {urgentCount} đề sắp hết hạn! Hãy nộp bài ngay.
        </motion.div>
      )}

      {/* ── Assignment Cards ─────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {displayItems.map((item, idx) => {
            const deadline = formatDeadline(item.assignment.deadline);
            const examTitle = item.exam?.title ?? item.assignment.examTitle ?? 'Đề kiểm tra';
            const duration  = item.exam?.durationMinutes;
            const progress  = item.assignment.totalStudents
              ? Math.round(((item.assignment.submittedCount ?? 0) / item.assignment.totalStudents) * 100)
              : null;

            return (
              <motion.div
                key={item.assignmentId}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: idx * 0.06 }}
                className={cn(
                  'rounded-2xl border p-4 space-y-3 transition-all duration-200',
                  item.hasSubmitted
                    ? 'bg-slate-900/40 border-slate-800/60 opacity-75'
                    : deadline?.isUrgent
                      ? 'bg-gradient-to-br from-red-900/25 to-slate-900/60 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.10)]'
                      : 'bg-gradient-to-br from-emerald-900/20 to-slate-900/60 border-emerald-500/25 shadow-[0_0_20px_rgba(16,185,129,0.08)]',
                )}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-black leading-snug line-clamp-2',
                      item.hasSubmitted ? 'text-slate-400' : 'text-white',
                    )}>
                      {examTitle}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Lớp: <span className="text-slate-400 font-semibold">{item.assignment.className}</span>
                      {duration && <> · {duration} phút</>}
                    </p>
                  </div>

                  {/* Deadline badge */}
                  {deadline && (
                    <span className={cn(
                      'flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg shrink-0',
                      deadline.isUrgent
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-slate-800 text-slate-500',
                    )}>
                      <Clock className="w-3 h-3" />
                      {deadline.text}
                    </span>
                  )}
                </div>

                {/* Progress bar (nếu GV bật showLeaderboard) */}
                {item.assignment.showLeaderboard && progress !== null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>Tiến độ lớp</span>
                      <span>{item.assignment.submittedCount ?? 0}/{item.assignment.totalStudents} đã nộp</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )}

                {/* CTA */}
                {item.hasSubmitted ? (
                  <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Đã nộp bài
                    {item.assignment.allowReview && (
                      <button
                        className="ml-auto text-xs text-slate-500 hover:text-slate-400 underline"
                        onClick={() => item.exam && onStartExam(item.exam)}
                      >
                        Xem lại
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => item.exam && onStartExam(item.exam)}
                    disabled={!item.exam}
                    className={cn(
                      'w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-black transition-all shadow-lg active:scale-97',
                      deadline?.isUrgent
                        ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-red-500/25 hover:shadow-red-500/40'
                        : 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-emerald-500/20 hover:shadow-emerald-500/35',
                      !item.exam && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Play className="w-3.5 h-3.5" fill="currentColor" />
                    {deadline?.isUrgent ? 'NỘP NGAY!' : 'LÀM BÀI'}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      {/* ── Show more toggle ─────────────────────────────────────────── */}
      {!loading && items.length > 2 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-slate-400 flex items-center justify-center gap-1.5 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> Thu gọn</>
            : <><ChevronDown className="w-3.5 h-3.5" /> Xem thêm {items.length - 2} đề ({done.length} đã nộp)</>
          }
        </button>
      )}
    </div>
  );
};

export default AssignedExamsBanner;
