/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHYSICS9+ AI ADAPTIVE ENGINE — TYPE DEFINITIONS
 *  Sprint 1 — Core interfaces & XP breakdown types
 *
 *  Extends src/types.ts — zero breaking changes to existing types.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { Topic, WeaknessProfile } from '../types';
import type { RankDef } from './RankSystem';

// ─── PHÂN HỆ 1: Analysis & Diagnosis ──────────────────────────────

/**
 * Phân loại năng lực học sinh dựa trên Moving Average 7 ngày.
 * Là trục chính điều khiển toàn bộ LEVEL_MATRIX của PH2.
 */
export type CapabilityTier =
  | 'CRITICAL'    // MA7 < 5.0  — Nguy hiểm, ưu tiên khắc phục
  | 'DEVELOPING'  // MA7 5–6.9  — Đang phát triển
  | 'PROFICIENT'  // MA7 7–7.9  — Khá
  | 'ADVANCED'    // MA7 8–8.9  — Giỏi
  | 'ELITE';      // MA7 ≥ 9.0  — Xuất sắc

/** Hiệu suất chi tiết theo từng chuyên đề */
export interface ITopicPerformance {
  topic: Topic;
  totalAttempts: number;
  correctRate: number;           // 0.0 – 1.0
  avgScore: number;              // Thang 10
  failedQuestionIds: string[];   // Câu sai gần nhất trong topic này
  lastAttemptAt: string;         // ISO date "YYYY-MM-DD"
  trend: 'improving' | 'stable' | 'declining';
}

/** Output chính của PH1 — Bản chẩn đoán năng lực đầy đủ */
export interface IAssessmentRecord {
  userId: string;
  generatedAt: string;                    // ISO timestamp

  // Moving Average windows
  recentScores: number[];                 // 7–14 điểm gần nhất (thang 10)
  movingAvg7:   number;                   // MA của 7 điểm gần nhất
  movingAvg14:  number;                   // MA của 14 điểm gần nhất

  capabilityTier: CapabilityTier;

  // Topic breakdown
  topicBreakdown: ITopicPerformance[];
  criticalTopics: Topic[];                // correctRate < 0.40
  majorTopics:    Topic[];                // correctRate 0.40–0.59
  strongTopics:   Topic[];                // correctRate ≥ 0.80

  weaknessProfile?: WeaknessProfile;     // Từ AI diagnosis (existing type)
}

// ─── PHÂN HỆ 2: Remedial & Progression ───────────────────────────

/**
 * Loại đề thích ứng — quyết định xpMultiplier ở PH3.
 * REMEDIAL < STANDARD < PROGRESSIVE < CHALLENGE
 */
export type AdaptiveExamType =
  | 'STANDARD'     // Đề từ DB chuẩn        — multiplier ×1.0
  | 'REMEDIAL'     // Mini-test khắc phục    — multiplier ×0.7
  | 'PROGRESSIVE'  // Đề nâng cấp năng lực   — multiplier ×1.3
  | 'CHALLENGE';   // Thử thách elite        — multiplier ×1.5

/** Phân bổ tỷ lệ câu hỏi theo 4 cấp độ nhận thức Bloom */
export interface ILevelDistribution {
  NB:  number;   // Nhận biết    (0.0–1.0)
  TH:  number;   // Thông hiểu
  VD:  number;   // Vận dụng
  VDC: number;   // Vận dụng cao — tỷ lệ tăng dần theo CapabilityTier
}

/** Config hoàn chỉnh để sinh đề thích ứng — Output của PH2 */
export interface IAdaptiveTestConfig {
  userId: string;
  examType: AdaptiveExamType;
  xpMultiplier: number;              // 0.7 | 1.0 | 1.3 | 1.5

  targetQuestions: {
    part1: number;                   // TNKQ 4 lựa chọn
    part2: number;                   // Đúng / Sai 4 ý
    part3: number;                   // Điền số
    total: number;                   // Tổng (dùng cho weightFactor / 28)
  };

  levelDistribution: ILevelDistribution;

  // Topic targeting
  priorityTopics:  Topic[];          // Ưu tiên lấy câu từ đây
  excludeTopics:   Topic[];          // Loại trừ (strong topics khi REMEDIAL)
  targetFailedIds: string[];         // Câu sai cần tái test (70-30 routing)

  // Rank-based thresholds
  minAccuracyThreshold: number;      // Điểm sàn — dưới đây → FinalXP = 0
  rankId: number;                    // ID rank hiện tại (1–10)

  generatedAt: string;               // ISO timestamp
}

// ─── PHÂN HỆ 3: Hardcore Gamification ────────────────────────────

/**
 * Breakdown XP hoàn toàn minh bạch — hiển thị cho HS sau khi nộp bài.
 * Giải quyết CVE-1 (weight), CVE-2 (floor), CVE-3 (multiplier), CVE-4 (streak guard).
 */
export interface IXPBreakdown {
  rawScore:       number;   // totalScore (thang 10)
  numQuestions:   number;   // Số câu thực tế trong bài thi
  weightFactor:   number;   // numQuestions / 28 — cân bằng đề ngắn/dài
  baseXP:         number;   // rawScore × hệ số theo tier điểm
  typeMultiplier: number;   // xpMultiplier từ AdaptiveExamType
  finalXP:        number;   // Math.round(baseXP × weightFactor × typeMultiplier)
  belowFloor:     boolean;  // true = dưới điểm sàn → finalXP bị về 0
  rankFloor:      number;   // Điểm sàn tương ứng rank hiện tại
  streakBonus:    number;   // Stars bonus streak — CHỈ cộng lần đầu trong ngày
  isFirstSubmitToday: boolean; // Guard chặn streak bonus spam (CVE-4)
}

/** Kết quả đầy đủ sau submitTest — dùng cho UI Victory Screen */
export interface ISubmissionResult {
  userId:        string;
  xpBreakdown:   IXPBreakdown;
  newTotalStars: number;
  rankBefore:    RankDef;
  rankAfter:     RankDef;
  didRankUp:     boolean;
  streakDay:     number;
}
