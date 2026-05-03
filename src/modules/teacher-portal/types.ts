/**
 * ═══════════════════════════════════════════════════════════════════
 *  teacher-portal/types.ts — Internal Types for Teacher Portal Module
 *  Không import bất kỳ component nào. Chỉ data shapes và UI enums.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { ClassRoom, Exam, TeacherExamAssignment, LearningMaterial } from '../../types';

// ── Tab IDs ──────────────────────────────────────────────────────────────────
export type TeacherTabId =
  | 'overview'
  | 'classroom'
  | 'exam-hub'
  | 'materials'
  | 'students'
  | 'analytics'
  | 'live-class'
  | 'messages'
  | 'reports'           // Module 2: Báo cáo lớp học
  | 'personalized'      // Module 3: Giao bài cá nhân hoá
  | 'notifications';    // Module 1: Thông báo (upgrade messages tab)

// ── ClassRoom mở rộng: kèm theo số HS thực tế (denormalized) ─────────────────
export interface TeacherClassSummary extends ClassRoom {
  studentCount: number;         // Số HS trong lớp (từ studentIds.length)
  activeAssignments: number;    // Số đề đang active
  averageScore?: number;        // ĐTB lớp (lazy-loaded khi mở Analytics)
  grade?: number;               // Khối lớp
}

// ── Thống kê nhanh hiển thị ở Overview ────────────────────────────────────────
export interface TeacherOverviewStats {
  totalClasses: number;
  totalStudents: number;
  activeAssignments: number;
  submissionsToday: number;
  averageScoreAllClasses?: number;
  isLoading: boolean;
}

// ── Assignment kèm thêm thông tin exam title để render ───────────────────────
export interface AssignmentWithMeta extends TeacherExamAssignment {
  examTitle: string;
  className: string;
  progressPercent: number;       // submittedCount / totalStudents * 100
}

// ── Question Pool Cache entry (sessionStorage) ────────────────────────────────
export interface QuestionPoolCacheEntry {
  key: string;                   // cache key: "pool_{part}_{level}_{grade}"
  questions: any[];              // Question[]
  fetchedAt: number;             // Unix ms
  ttlMs: number;                 // Time-to-live (default 10 phút = 600_000)
}

// ── Teacher Matrix Builder form state ─────────────────────────────────────────
export interface MatrixRowConfig {
  part: 1 | 2 | 3;
  level: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';
  count: number;
  topicFilter?: string[];        // undefined = bất kỳ topic
}

export interface TeacherMatrixDraft {
  title: string;
  targetGrade: number;
  durationMinutes: number;
  rows: MatrixRowConfig[];
  visibility: 'private' | 'class' | 'public';
}

// ── Learning Material Upload state ────────────────────────────────────────────
export type UploadStage = 'idle' | 'validating' | 'uploading' | 'saving' | 'done' | 'error';

export interface MaterialUploadState {
  stage: UploadStage;
  progress: number;              // 0–100 (chỉ dùng khi stage='uploading')
  error?: string;
}

// ── Phân tích học sinh theo lớp (TeacherAnalytics) ───────────────────────────
export interface ClassStudentStat {
  uid: string;
  displayName: string;
  averageScore: number;
  totalAttempts: number;
  streak: number;
  needsSupport: boolean;         // averageScore < 5.0
}

export interface ClassAnalyticsData {
  classId: string;
  scoreDistribution: Record<string, number>; // "0-2": 3, "2-4": 5 ...
  weakTopics: { topic: string; accuracy: number }[];
  students: ClassStudentStat[];
  isLoading: boolean;
}
