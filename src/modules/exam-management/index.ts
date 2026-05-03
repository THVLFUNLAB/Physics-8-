// ═══════════════════════════════════════════════════════════════════════
//  MODULE: exam-management
//  Nhóm: Quản lý đề thi — tạo đề, ngân hàng câu hỏi, số hóa, xuất bản
//  Quy tắc: Chỉ sửa file gốc trong /components. Module này chỉ re-export.
// ═══════════════════════════════════════════════════════════════════════

export { default as ExamLibrary } from '@/src/components/ExamLibrary';
export { default as ExamGenerator } from '@/src/components/ExamGenerator';
export { default as ExamMatrixGenerator } from '@/src/components/ExamMatrixGenerator';
export { default as QuestionBank } from '@/src/components/QuestionBank';
export { default as QuestionReviewBoard } from '@/src/components/QuestionReviewBoard';
export { default as DigitizationDashboard } from '@/src/components/DigitizationDashboard';
export { ExamsList } from '@/src/components/ExamsList';
export { VipLinkGenerator } from '@/src/components/VipLinkGenerator';
