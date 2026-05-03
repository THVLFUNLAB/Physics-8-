// ═══════════════════════════════════════════════════════════════════════
//  MODULE: admin-stats
//  Nhóm: Thống kê tổng quan hệ thống (Admin only)
//  Quy tắc: Chỉ sửa file gốc trong module này. Không import trực tiếp
//           từ các file con, luôn import qua barrel index này.
// ═══════════════════════════════════════════════════════════════════════

export { default as AdminStatsDashboard } from './AdminStatsDashboard';
export { StatCard } from './StatCard';
export { ActivityChart } from './ActivityChart';
export { useAdminStats } from './useAdminStats';
export type { SystemStats, DayActivity, TopExam } from './adminStatsService';
