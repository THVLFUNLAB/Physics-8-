// ═══════════════════════════════════════════════════════════════════════
//  MODULE: admin-tools
//  Nhóm: Công cụ quản trị — làm sạch dữ liệu, migration, phân tích
//  Quy tắc: Chỉ sửa file gốc trong /components. Module này chỉ re-export.
// ═══════════════════════════════════════════════════════════════════════

export { default as DataSanitizer } from '@/src/components/DataSanitizer';
// DuplicateReviewHub: export cả named lẫn default để tương thích cả 2 kiểu import
export { default as DuplicateReviewHub } from '@/src/components/DuplicateReviewHub';
export { DuplicateReviewHubWrapper } from '@/src/components/DuplicateReviewHubWrapper';
export { default as DatabaseMigrationTool } from '@/src/components/DatabaseMigrationTool';
export { default as ScoreRecalibrationTool } from '@/src/components/ScoreRecalibrationTool';
export { default as XPRecalibrationTool } from '@/src/components/XPRecalibrationTool';
export { default as ReportHub } from '@/src/components/ReportHub';
export { MacroAnalyticsDashboard } from '@/src/components/MacroAnalyticsDashboard';
export { default as AICampaignManager } from '@/src/components/AICampaignManager';
export { default as AIChatLogsDashboard } from '@/src/components/AIChatLogsDashboard';
export { default as YCCDAutoTagger } from '@/src/components/YCCDAutoTagger';
export { default as AdminStudentProfile } from '@/src/components/AdminStudentProfile';
export { StudentMicroProfiler } from '@/src/components/StudentMicroProfiler';
export { OfflineDataEntry } from '@/src/components/OfflineDataEntry';
export { default as StudentViewSimulator } from '@/src/components/StudentViewSimulator';
