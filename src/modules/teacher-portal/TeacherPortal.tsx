import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Users, BookOpen, FolderOpen,
  BarChart3, MonitorPlay, MessageSquare, GraduationCap,
  RefreshCw,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import type { TeacherTabId } from './types';
import { useTeacherPortal } from './useTeacherPortal';
import './teacher-portal.css';

// ── Lazy-load tabs ──────────────────────────────────────────────────────────
const TeacherOverview    = React.lazy(() => import('./tabs/TeacherOverview'));
const TeacherClassroom   = React.lazy(() => import('./tabs/TeacherClassroom'));
const TeacherExamHub     = React.lazy(() => import('./tabs/TeacherExamHub'));
const TeacherMaterials   = React.lazy(() => import('./tabs/TeacherMaterials'));
const TeacherStudentList = React.lazy(() => import('./tabs/TeacherStudentList'));
const TeacherAnalytics   = React.lazy(() => import('./tabs/TeacherAnalytics'));
const TeacherMessages    = React.lazy(() => import('./tabs/TeacherMessages'));

// ── Tab config ──────────────────────────────────────────────────────────────
const TABS: { id: TeacherTabId; label: string; icon: React.FC<any> }[] = [
  { id: 'overview',    label: 'Tổng quan',    icon: LayoutDashboard },
  { id: 'classroom',   label: 'Lớp học',      icon: Users },
  { id: 'exam-hub',    label: 'Tạo & Phát đề', icon: BookOpen },
  { id: 'materials',   label: 'Học liệu',     icon: FolderOpen },
  { id: 'students',    label: 'Học sinh',      icon: GraduationCap },
  { id: 'analytics',   label: 'Phân tích',    icon: BarChart3 },
  { id: 'live-class',  label: 'Phòng thi',    icon: MonitorPlay },
  { id: 'messages',    label: 'Thông báo',    icon: MessageSquare },
];

// ── Tab fallback spinner ──────────────────────────────────────────────────
const TabSpinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Props ────────────────────────────────────────────────────────────────────
interface TeacherPortalProps {
  user: UserProfile;
}

// ═══════════════════════════════════════════════════════════════════════
//  TEACHER PORTAL — Shell Component
// ═══════════════════════════════════════════════════════════════════════
const TeacherPortal: React.FC<TeacherPortalProps> = ({ user }) => {
  const portal = useTeacherPortal(user);
  const { activeTab, setActiveTab, overviewStats, loading } = portal;

  return (
    <div className="tp-root">

      {/* ── Header Banner ─────────────────────────────────────────────── */}
      <div className="tp-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="tp-header-title">
              👩‍🏫 Xin chào, {user.displayName}
            </h2>
            <p className="tp-header-subtitle">
              Cổng Giáo Viên PHYS9+ &nbsp;·&nbsp; Quản lý lớp học &amp; học liệu
            </p>
          </div>
          <button
            className="tp-btn-ghost"
            onClick={() => {
              portal.refreshClasses();
              portal.refreshAssignments();
            }}
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">Làm mới</span>
          </button>
        </div>

        {/* Mini stats dạng inline pill */}
        {!overviewStats.isLoading && (
          <div className="flex flex-wrap gap-3 mt-3">
            {[
              { v: overviewStats.totalClasses,        l: 'Lớp học' },
              { v: overviewStats.totalStudents,       l: 'Học sinh' },
              { v: overviewStats.activeAssignments,   l: 'Đề đang phát' },
              { v: overviewStats.submissionsToday,    l: 'Bài đã nộp' },
            ].map(({ v, l }) => (
              <div key={l} className="tp-class-badge">
                <span className="font-black">{v}</span>
                <span className="opacity-70">{l}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab Navigation ────────────────────────────────────────────── */}
      <div className="tp-tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`tp-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          <React.Suspense fallback={<TabSpinner />}>
            {activeTab === 'overview' && (
              <TeacherOverview portal={portal} user={user} />
            )}
            {activeTab === 'classroom' && (
              <TeacherClassroom portal={portal} />
            )}
            {activeTab === 'exam-hub' && (
              <TeacherExamHub portal={portal} user={user} />
            )}
            {activeTab === 'materials' && (
              <TeacherMaterials portal={portal} user={user} />
            )}
            {activeTab === 'students' && (
              <TeacherStudentList portal={portal} />
            )}
            {activeTab === 'analytics' && (
              <TeacherAnalytics portal={portal} />
            )}
            {activeTab === 'live-class' && (
              <TeacherLiveClassWrapper user={user} portal={portal} />
            )}
            {activeTab === 'messages' && (
              <TeacherMessages portal={portal} user={user} />
            )}
          </React.Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ── Live Class wrapper — reuse ClassManager scoped theo teacherId ────────────
const TeacherLiveClassWrapper = React.lazy(async () => {
  const { default: ClassManager } = await import('../../components/ClassManager');
  return {
    default: ({ user }: { user: UserProfile; portal: any }) => (
      <ClassManager user={user} />
    ),
  };
});

export default TeacherPortal;
