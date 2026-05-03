/**
 * AdminStatsDashboard.tsx
 * ════════════════════════════════════════════════════════════════
 * Tầng UI thuần túy — không biết Firestore tồn tại.
 * Nhận toàn bộ data từ useAdminStats hook.
 * ════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { motion } from 'motion/react';
import {
  Users, TrendingUp, Activity, BrainCircuit,
  RefreshCw, Clock, AlertTriangle, CheckCircle2,
  BarChart3, Trophy, Crown, Zap,
} from 'lucide-react';
import { useAdminStats } from './useAdminStats';
import { StatCard } from './StatCard';
import { ActivityChart } from './ActivityChart';
import { cn } from '../../lib/utils';

// ── Skeleton Rows ──────────────────────────────────────────────────────────
const SkeletonRow: React.FC<{ w?: string }> = ({ w = 'w-full' }) => (
  <div className={cn('h-4 bg-slate-800 rounded animate-pulse', w)} />
);

// ── Section Card Wrapper ───────────────────────────────────────────────────
const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title, icon, children, className,
}) => (
  <div className={cn('bg-slate-900 border border-slate-800 rounded-3xl p-6', className)}>
    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-5">
      {icon}
      {title}
    </h3>
    {children}
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────
export default function AdminStatsDashboard() {
  const { stats, loading, error, lastFetched, refresh } = useAdminStats();

  const freeRatio = stats
    ? Math.round((stats.freeStudents / Math.max(stats.totalStudents, 1)) * 100)
    : 0;
  const vipRatio = 100 - freeRatio;

  return (
    <div className="space-y-8 pb-12">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-cyan-400 shrink-0" />
            Thống Kê Tổng Quan Hệ Thống
          </h2>
          <p className="text-slate-400 text-sm mt-1 max-w-xl">
            Dữ liệu thực tế từ Firestore · Cache tự động làm mới mỗi 5 phút
          </p>
        </div>

        {/* Refresh + timestamp */}
        <div className="flex items-center gap-3 shrink-0">
          {lastFetched && (
            <div className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border text-slate-500 border-slate-800 bg-slate-900">
              <Clock className="w-3 h-3" />
              Cập nhật lúc {lastFetched.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {loading ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>
      </div>

      {/* ── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl"
        >
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300 font-medium">{error}</p>
        </motion.div>
      )}

      {/* ── KPI Cards — 2 cols mobile, 3 cols tablet, 6 cols desktop ─ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          icon={Users}
          label="Tổng Học Sinh"
          value={loading ? '—' : (stats?.totalStudents ?? 0).toLocaleString()}
          subLabel="Không tính Admin"
          color="cyan"
          delay={0.0}
          loading={loading && !stats}
        />
        <StatCard
          icon={Activity}
          label="Active 7 Ngày"
          value={loading ? '—' : (stats?.activeStudents7d ?? 0).toLocaleString()}
          subLabel="Có lastActive ≥ 7 ngày"
          color="emerald"
          delay={0.05}
          loading={loading && !stats}
        />
        <StatCard
          icon={Zap}
          label="Tổng Lượt Thi"
          value={loading ? '—' : (stats?.totalAttempts ?? 0).toLocaleString()}
          subLabel="Toàn hệ thống"
          color="violet"
          delay={0.10}
          loading={loading && !stats}
        />
        <StatCard
          icon={TrendingUp}
          label="Điểm TB"
          value={loading ? '—' : `${stats?.averageScore ?? 0}`}
          subLabel="100 lượt gần nhất / 10"
          color="amber"
          delay={0.15}
          loading={loading && !stats}
        />
        <StatCard
          icon={BrainCircuit}
          label="AI Chat 30 Ngày"
          value={loading ? '—' : (stats?.aiChatCount30d ?? 0).toLocaleString()}
          subLabel="Lượt hỏi Thầy Hậu AI"
          color="fuchsia"
          delay={0.20}
          loading={loading && !stats}
        />
        <StatCard
          icon={Crown}
          label="VIP"
          value={loading ? '—' : (stats?.vipStudents ?? 0).toLocaleString()}
          subLabel={`${vipRatio}% tổng HS`}
          color="rose"
          delay={0.25}
          loading={loading && !stats}
        />
      </div>

      {/* ── Row 2: Chart + Tier Breakdown ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Activity Chart — chiếm 2/3 trên desktop */}
        <SectionCard
          title="Hoạt Động 7 Ngày Qua"
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
          className="lg:col-span-2"
        >
          {loading && !stats ? (
            <div className="h-[220px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ActivityChart data={stats?.activityByDay ?? []} />
          )}
        </SectionCard>

        {/* Tier Breakdown — chiếm 1/3 */}
        <SectionCard
          title="Phân Bổ Tài Khoản"
          icon={<Crown className="w-4 h-4 text-amber-400" />}
        >
          {loading && !stats ? (
            <div className="space-y-4">
              <SkeletonRow />
              <SkeletonRow w="w-3/4" />
              <SkeletonRow w="w-1/2" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* VIP Bar */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-rose-400 flex items-center gap-1.5">
                    <Crown className="w-3 h-3" /> VIP
                  </span>
                  <span className="text-white">{stats?.vipStudents ?? 0} · {vipRatio}%</span>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${vipRatio}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                    className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full"
                  />
                </div>
              </div>

              {/* Free Bar */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Free
                  </span>
                  <span className="text-white">{stats?.freeStudents ?? 0} · {freeRatio}%</span>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${freeRatio}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
                    className="h-full bg-gradient-to-r from-slate-600 to-slate-500 rounded-full"
                  />
                </div>
              </div>

              {/* Tổng */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Tổng cộng</span>
                <span className="text-white font-black text-lg">
                  {(stats?.totalStudents ?? 0).toLocaleString()}
                  <span className="text-xs text-slate-500 ml-1 font-normal">HS</span>
                </span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Row 3: Top Exams + Quick Stats ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Top 5 Đề thi */}
        <SectionCard
          title="Top 5 Đề Thi Được Làm Nhiều Nhất (7 Ngày)"
          icon={<Trophy className="w-4 h-4 text-amber-400" />}
        >
          {loading && !stats ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="w-8 h-8 bg-slate-800 rounded-lg animate-pulse" />
                  <SkeletonRow w="flex-1" />
                </div>
              ))}
            </div>
          ) : !stats?.topExams?.length ? (
            <p className="text-center text-slate-600 text-sm py-6">
              Chưa có dữ liệu usage_logs trong 7 ngày qua.
            </p>
          ) : (
            <div className="space-y-2">
              {stats.topExams.map((exam, idx) => {
                const maxCount = stats.topExams[0]?.count || 1;
                const pct = Math.round((exam.count / maxCount) * 100);
                const rankColors = ['text-amber-400', 'text-slate-300', 'text-orange-600', 'text-slate-500', 'text-slate-500'];
                return (
                  <motion.div
                    key={exam.examId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.07 }}
                    className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl group hover:bg-slate-800 transition-colors"
                  >
                    <div className={cn('w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-black bg-slate-900', rankColors[idx])}>
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate">{exam.examTitle}</p>
                      <p className="text-[10px] text-slate-600 truncate mt-0.5">ID: {exam.examId.slice(0, 12)}...</p>
                      <div className="mt-1.5 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-black text-cyan-400 shrink-0">{exam.count}</span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Quick Fact Panel */}
        <SectionCard
          title="Chỉ Số Nhanh"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        >
          {loading && !stats ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                {
                  label: 'Tỉ lệ VIP / Tổng HS',
                  value: `${vipRatio}%`,
                  note: 'Mục tiêu 30%+',
                  color: 'text-rose-400',
                  ok: vipRatio >= 30,
                },
                {
                  label: 'ĐTB toàn hệ thống',
                  value: `${stats?.averageScore}/10`,
                  note: '100 lượt gần nhất',
                  color: 'text-amber-400',
                  ok: (stats?.averageScore ?? 0) >= 6,
                },
                {
                  label: 'HS Active / Tổng HS',
                  value: stats ? `${Math.round((stats.activeStudents7d / Math.max(stats.totalStudents, 1)) * 100)}%` : '—',
                  note: '7 ngày qua',
                  color: 'text-emerald-400',
                  ok: stats ? (stats.activeStudents7d / Math.max(stats.totalStudents, 1)) >= 0.5 : false,
                },
                {
                  label: 'Lượt AI / Tổng lượt thi',
                  value: stats
                    ? `${Math.round((stats.aiChatCount30d / Math.max(stats.totalAttempts, 1)) * 100)}%`
                    : '—',
                  note: '30 ngày / tổng',
                  color: 'text-fuchsia-400',
                  ok: true,
                },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl border border-slate-800">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-300 truncate">{item.label}</p>
                    <p className="text-[10px] text-slate-600">{item.note}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-base font-black', item.color)}>{item.value}</span>
                    {item.ok
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <AlertTriangle className="w-4 h-4 text-amber-500" />
                    }
                  </div>
                </div>
              ))}

              <p className="text-[10px] text-slate-700 text-center pt-2">
                * Dữ liệu cache 5 phút · Nhấn "Làm mới" để cập nhật ngay
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
