import React from 'react';
import { Users, BookOpen, ClipboardList, TrendingUp } from 'lucide-react';
import type { UserProfile } from '../../../types';
import type { useTeacherPortal } from '../useTeacherPortal';

type Portal = ReturnType<typeof useTeacherPortal>;

interface Props {
  portal: Portal;
  user: UserProfile;
}

const STAT_ITEMS = (stats: Portal['overviewStats']) => [
  { icon: Users,         label: 'Tổng học sinh',    value: stats.totalStudents,      color: 'text-emerald-400' },
  { icon: BookOpen,      label: 'Lớp đang quản lý', value: stats.totalClasses,       color: 'text-cyan-400' },
  { icon: ClipboardList, label: 'Đề đang phát',     value: stats.activeAssignments,  color: 'text-amber-400' },
  { icon: TrendingUp,    label: 'Bài đã nộp',       value: stats.submissionsToday,   color: 'text-violet-400' },
];

const TeacherOverview: React.FC<Props> = ({ portal, user }) => {
  const { overviewStats, classes, assignments, loading } = portal;

  return (
    <div className="space-y-6">

      {/* ── Stats Grid ─────────────────────────────────────────── */}
      <div className="tp-stats-grid">
        {STAT_ITEMS(overviewStats).map(({ icon: Icon, label, value, color }) => (
          <div className="tp-stat-card" key={label}>
            <div className={`tp-stat-icon ${color}`}>
              <Icon />
            </div>
            <div>
              <p className="tp-stat-label">{label}</p>
              {overviewStats.isLoading
                ? <div className="tp-skeleton h-6 w-14 mt-1" />
                : <p className="tp-stat-value">{value}</p>
              }
            </div>
          </div>
        ))}
      </div>

      {/* ── Hai cột: Lớp học + Assignments gần đây ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Lớp học */}
        <div>
          <div className="tp-section-header">
            <h3 className="tp-section-title"><Users /> Lớp của tôi</h3>
            <button className="tp-btn-ghost text-xs" onClick={() => portal.setActiveTab('classroom')}>
              Xem tất cả →
            </button>
          </div>
          {loading.classes ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="tp-skeleton h-16 w-full" />)}
            </div>
          ) : classes.length === 0 ? (
            <div className="tp-empty">
              <Users />
              <p className="tp-empty-title">Chưa có lớp học nào</p>
              <p className="tp-empty-desc">Tạo lớp đầu tiên để bắt đầu quản lý học sinh.</p>
              <button className="tp-btn-primary mt-1" onClick={() => portal.setActiveTab('classroom')}>
                Tạo lớp ngay
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {classes.slice(0, 4).map(cls => (
                <div
                  key={cls.id}
                  className="tp-class-card"
                  onClick={() => {
                    portal.setSelectedClassId(cls.id ?? null);
                    portal.setActiveTab('students');
                  }}
                >
                  <div className="flex items-center justify-between">
                    <p className="tp-class-name">{cls.name}</p>
                    <span className="tp-class-badge">{cls.studentCount} HS</span>
                  </div>
                  <div className="tp-class-meta">
                    <span>Mã: <strong className="text-emerald-400">{cls.code}</strong></span>
                    {cls.activeAssignments > 0 && (
                      <span>{cls.activeAssignments} đề đang phát</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignments gần đây */}
        <div>
          <div className="tp-section-header">
            <h3 className="tp-section-title"><ClipboardList /> Đề đang phát</h3>
            <button className="tp-btn-ghost text-xs" onClick={() => portal.setActiveTab('exam-hub')}>
              Quản lý →
            </button>
          </div>
          {loading.assignments ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="tp-skeleton h-16 w-full" />)}
            </div>
          ) : assignments.filter(a => a.status === 'active').length === 0 ? (
            <div className="tp-empty">
              <ClipboardList />
              <p className="tp-empty-title">Chưa có đề nào đang phát</p>
              <p className="tp-empty-desc">Vào "Tạo & Phát đề" để giao bài kiểm tra cho lớp.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {assignments.filter(a => a.status === 'active').slice(0, 4).map(a => (
                <div key={a.id} className="tp-class-card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="tp-class-name text-sm leading-snug">{a.examTitle}</p>
                    <span className="tp-badge tp-badge-active flex-shrink-0">Active</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Lớp: {a.className}</p>
                  {/* Progress bar */}
                  <div className="tp-progress">
                    <div className="tp-progress-bar" style={{ width: `${a.progressPercent}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {a.submittedCount ?? 0}/{a.totalStudents ?? 0} đã nộp ({a.progressPercent}%)
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default TeacherOverview;
