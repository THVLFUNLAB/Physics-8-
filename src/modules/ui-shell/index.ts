// ═══════════════════════════════════════════════════════════════════════
//  MODULE: ui-shell
//  Nhóm: Các UI primitive dùng chung — layout, feedback, mascot, modal
//  Quy tắc: Chỉ sửa file gốc trong /components. Module này chỉ re-export.
// ═══════════════════════════════════════════════════════════════════════

// Layout
export { default as Sidebar } from '@/src/components/Sidebar';
export { AppFooter } from '@/src/layouts/AppFooter';
export { default as Navbar } from '@/src/layouts/Navbar';

// Feedback & Loading
export { ToastProvider, toast } from '@/src/components/Toast';
export { default as LoadingSpinner } from '@/src/components/LoadingSpinner';
export { default as SkeletonLoader, SkeletonNumber } from '@/src/components/SkeletonLoader';
export { ConnectionStatusBadge } from '@/src/components/ConnectionStatusBadge';
export { NotificationCenter } from '@/src/components/NotificationCenter';

// Modals
export { UpgradeModal } from '@/src/components/UpgradeModal';
export { ResetNoticeModal } from '@/src/components/ResetNoticeModal';
export { SimulationModal } from '@/src/components/SimulationModal';
export { AuthErrorBoundary } from '@/src/components/AuthErrorBoundary';
export { StudentOnboardingModal } from '@/src/components/StudentOnboardingModal';

// Mascot & Celebration
export { ConfettiCelebration } from '@/src/components/ConfettiCelebration';
export { default as InteractiveMascot } from '@/src/components/InteractiveMascot';
export { default as WelcomeMascot } from '@/src/components/WelcomeMascot';
export { default as VideoMascot } from '@/src/components/VideoMascot';
export { BackgroundMusic } from '@/src/components/BackgroundMusic';

// Common
export { TopicCard } from '@/src/components/TopicCard';
