/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHYSICS9+ AI ADAPTIVE ENGINE
 *  Sprint 1: calculateAdaptiveXP — Hardcore Gamification (PH3)
 *
 *  Fixes:
 *    CVE-1: Weight factor ngăn farm XP với đề ngắn
 *    CVE-2: Cân bằng đề ngắn/dài qua (numQuestions / 28)
 *    CVE-3: xpMultiplier phân biệt loại đề (STANDARD/REMEDIAL/...)
 *    CVE-4: isFirstSubmitToday guard chặn streak bonus spam
 *    CVE-5: Điều kiện bonusXP fixed từ > 8.0 → >= 8.0
 * ═══════════════════════════════════════════════════════════════════
 */

import { db } from '../firebase';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { getCurrentRank } from './RankSystem';
import type { UserProfile, Question, Attempt } from '../types';
import type {
  IXPBreakdown,
  AdaptiveExamType,
  IAssessmentRecord,
  IAdaptiveTestConfig,
  ILevelDistribution,
  CapabilityTier
} from './AdaptiveEngine.types';

// ─── Rank Floor Table ─────────────────────────────────────────────
// Dưới điểm sàn này → FinalXP = 0 (không thể spam đề dưới ngưỡng)

export const RANK_FLOOR: Record<number, number> = {
  1: 4.0, 2: 4.0, 3: 4.0,         // Đồng → Vàng Đoàn
  4: 6.5, 5: 6.5, 6: 6.5,         // Bạch Kim → Tinh Anh
  7: 8.0, 8: 8.0, 9: 8.0, 10: 8.0, // Cao Thủ → Bất Tử
};

// ─── XP Multiplier per Exam Type ─────────────────────────────────
export const EXAM_TYPE_MULTIPLIER: Record<AdaptiveExamType, number> = {
  REMEDIAL:    0.7,  // Mini-test khắc phục — XP thấp hơn vì câu dễ hơn
  STANDARD:    1.0,  // Đề chuẩn
  PROGRESSIVE: 1.3,  // Đề nâng cấp năng lực — XP thưởng cao hơn
  CHALLENGE:   1.5,  // Thử thách elite — XP cao nhất
};

// ─── Streak Bonus Lookup ──────────────────────────────────────────
// Chỉ áp dụng khi isFirstSubmitToday === true (CVE-4 fix)

function getStreakBonus(streak: number): number {
  if (streak >= 30) return 2500;
  if (streak >= 14) return 1000;
  if (streak >= 7)  return 500;
  if (streak >= 3)  return 250;
  return 0;
}

/**
 * calculateAdaptiveXP
 * ─────────────────────────────────────────────────────────────────
 * Hàm tính XP theo kiến trúc Physics9+ Adaptive Engine Sprint 1.
 * Thay thế hoàn toàn block XP cũ (dòng 895–925 trong App.tsx).
 *
 * @param totalScore         Điểm thô (thang 10, ví dụ: 7.25)
 * @param numQuestions       Số câu hỏi thực tế trong bài thi
 * @param rankId             ID rank hiện tại (1–10) từ getCurrentRank()
 * @param examType           Loại đề (mặc định: 'STANDARD' cho backward compat)
 * @param isFirstSubmitToday true = lần nộp đầu tiên ngày hôm nay
 * @param currentStreak      Streak hiện tại (số ngày liên tiếp)
 *
 * @returns IXPBreakdown — breakdown chi tiết, dùng cho UI và persist vào DB
 */
export function calculateAdaptiveXP(
  totalScore: number,
  numQuestions: number,
  rankId: number,
  examType: AdaptiveExamType = 'STANDARD',
  isFirstSubmitToday: boolean = false,
  currentStreak: number = 0,
): IXPBreakdown {

  // ── 1. Rank Floor Check (CVE-2 partial, CVE-1 partial) ──────────
  const rankFloor = RANK_FLOOR[rankId] ?? 4.0;
  const belowFloor = totalScore < rankFloor;

  // ── 2. BaseXP theo tier điểm (Exponential Bonus spec) ───────────
  // Hệ số tăng mạnh theo vùng điểm cao để incentivize xuất sắc
  let baseXP = 0;
  if (!belowFloor) {
    if      (totalScore >= 9.0) baseXP = Math.round(totalScore * 100); // 9.0→900, 10→1000
    else if (totalScore >= 8.0) baseXP = Math.round(totalScore * 40);  // 8.0→320, 8.9→356
    else if (totalScore >= 7.0) baseXP = Math.round(totalScore * 20);  // 7.0→140, 7.9→158
    else if (totalScore >= 5.0) baseXP = Math.round(totalScore * 10);  // 5.0→50,  6.9→69
    else                        baseXP = Math.round(totalScore * 5);   // <5.0→max 24
  }

  // ── 3. Weight Factor — Cân bằng đề ngắn/dài (CVE-2 fix) ────────
  // FinalXP = BaseXP × (numQuestions / 28)
  // Đề 28 câu → ×1.0 | Đề 8 câu → ×0.286 | Đề 3 câu → ×0.107
  const weightFactor = Math.min(Math.max(numQuestions / 28, 0), 1.0);

  // ── 4. Type Multiplier — Phân biệt loại đề (CVE-3 fix) ──────────
  const typeMultiplier = EXAM_TYPE_MULTIPLIER[examType];

  // ── 5. Final XP ─────────────────────────────────────────────────
  const finalXP = belowFloor
    ? 0
    : Math.max(0, Math.round(baseXP * weightFactor * typeMultiplier));

  // ── 6. Streak Bonus — Chỉ lần đầu trong ngày (CVE-4 fix) ────────
  const streakBonus = (isFirstSubmitToday && !belowFloor)
    ? getStreakBonus(currentStreak)
    : 0;

  return {
    rawScore:       totalScore,
    numQuestions,
    weightFactor,
    baseXP,
    typeMultiplier,
    finalXP,
    belowFloor,
    rankFloor,
    streakBonus,
    isFirstSubmitToday,
  };
}

/**
 * formatXPBreakdown — Tạo chuỗi mô tả XP cho notification/toast
 * Ví dụ: "+320 XP ⚖️×0.57 📊×1.3 = +237 XP | 🔥+10 streak"
 */
export function formatXPBreakdown(xp: IXPBreakdown): string {
  if (xp.belowFloor) {
    return `❌ Dưới điểm sàn (${xp.rankFloor}đ) — 0 XP nhận được`;
  }
  const parts: string[] = [`BaseXP ${xp.baseXP}`];
  if (xp.weightFactor < 1) parts.push(`⚖️×${xp.weightFactor.toFixed(2)}`);
  if (xp.typeMultiplier !== 1) parts.push(`📊×${xp.typeMultiplier}`);
  parts.push(`= +${xp.finalXP} XP`);
  if (xp.streakBonus > 0) parts.push(`| 🔥+${xp.streakBonus} streak`);
  return parts.join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// SPRINT 2: ADAPTIVE EXAM GENERATION (PH1 & PH2)
// ═══════════════════════════════════════════════════════════════════

/**
 * Tỷ lệ câu VDC theo CapabilityTier.
 * Progressive Overload: HS càng giỏi → càng nhiều câu khó.
 */
const LEVEL_MATRIX: Record<CapabilityTier, ILevelDistribution> = {
  CRITICAL:   { NB: 0.40, TH: 0.35, VD: 0.20, VDC: 0.05 },
  DEVELOPING: { NB: 0.25, TH: 0.35, VD: 0.30, VDC: 0.10 },
  PROFICIENT: { NB: 0.15, TH: 0.25, VD: 0.35, VDC: 0.25 },
  ADVANCED:   { NB: 0.05, TH: 0.15, VD: 0.35, VDC: 0.45 },
  ELITE:      { NB: 0.00, TH: 0.10, VD: 0.25, VDC: 0.65 },
};

// ── STEP 1: PH1 — Xây dựng IAssessmentRecord ───────────────────────

async function buildAssessmentRecord(
  userId: string,
  user: UserProfile
): Promise<IAssessmentRecord> {
  // [FIX] Bỏ orderBy để tránh lỗi "requires a composite index" trên Firestore.
  // Query chỉ filter theo userId, rồi sort timestamp trong memory.
  let attempts: Attempt[] = [];
  try {
    const attemptsSnap = await getDocs(
      query(
        collection(db, 'attempts'),
        where('userId', '==', userId),
        limit(50)  // Lấy nhiều hơn, sort & slice trong memory
      )
    );
    attempts = attemptsSnap.docs
      .map(d => d.data() as Attempt)
      .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0))
      .slice(0, 14);
  } catch (fetchErr) {
    console.warn('[AdaptiveEngine] Không lấy được attempts, dùng dữ liệu trống:', fetchErr);
    // Graceful: tiếp tục với mảng rỗng thay vì crash toàn bộ
  }
  const scores = attempts.map(a => a.score);

  // Moving averages
  const movingAvg7  = scores.slice(0, 7).reduce((s, x) => s + x, 0) / Math.max(scores.slice(0, 7).length, 1);
  const movingAvg14 = scores.reduce((s, x) => s + x, 0) / Math.max(scores.length, 1);

  // Capability tier dựa trên MA7 (7 ngày gần nhất — phản ánh hiện tại)
  const capabilityTier: CapabilityTier =
    movingAvg7 >= 9.0 ? 'ELITE'     :
    movingAvg7 >= 8.0 ? 'ADVANCED'  :
    movingAvg7 >= 7.0 ? 'PROFICIENT':
    movingAvg7 >= 5.0 ? 'DEVELOPING': 'CRITICAL';

  // Topic breakdown từ learningPath.topicProgress
  const topicProgress = user.learningPath?.topicProgress ?? {};
  const topicBreakdown = Object.entries(topicProgress).map(([topic, data]) => {
    // ── correctRate MỚI (chính xác) ──────────────────────────────────
    // Nếu refreshTopicProgress đã ghi correctCount/totalQuestions → dùng trực tiếp.
    // Nếu chưa (data cũ) → fallback bestScore/10 để tương thích ngược.
    const extData = data as typeof data & {
      correctCount?: number;
      totalQuestions?: number;
    };
    const correctRate =
      typeof extData.correctCount  === 'number' &&
      typeof extData.totalQuestions === 'number' &&
      extData.totalQuestions > 0
        ? extData.correctCount / Math.max(extData.totalQuestions, 1)  // Công thức đúng
        : data.bestScore / 10;                                          // Backward compat

    return {
      topic,
      totalAttempts: data.totalAttempts,
      correctRate,
      avgScore: (data.bestScore + data.lastScore) / 2,
      failedQuestionIds: [],
      lastAttemptAt: new Date().toISOString(),
      trend: (data.lastScore >= data.bestScore ? 'improving' : 'stable') as 'improving' | 'stable' | 'declining',
    };
  });

  const criticalTopics = topicBreakdown.filter(t => t.correctRate < 0.4).map(t => t.topic);
  const majorTopics    = topicBreakdown.filter(t => t.correctRate >= 0.4 && t.correctRate < 0.6).map(t => t.topic);
  const strongTopics   = topicBreakdown.filter(t => t.correctRate >= 0.8).map(t => t.topic);

  return {
    userId,
    generatedAt: new Date().toISOString(),
    recentScores: scores,
    movingAvg7,
    movingAvg14,
    capabilityTier,
    topicBreakdown,
    criticalTopics,
    majorTopics,
    strongTopics,
    weaknessProfile: user.learningPath?.weaknessProfile,
  };
}

// ── STEP 2: PH2 — Quyết định IAdaptiveTestConfig ───────────────────

function buildAdaptiveConfig(
  userId: string,
  user: UserProfile,
  assessment: IAssessmentRecord
): IAdaptiveTestConfig {
  const rank = getCurrentRank(user.stars ?? 0);

  // Quyết định loại đề
  const hasCriticalWeakness = assessment.criticalTopics.length > 0;
  const isEliteRank = rank.id >= 6; // Tinh Anh trở lên

  let examType: AdaptiveExamType;
  let xpMultiplier: number;

  if (hasCriticalWeakness) {
    examType = 'REMEDIAL';     // Ưu tiên chữa yếu trước khi nâng cấp
    xpMultiplier = 0.7;
  } else if (isEliteRank && assessment.capabilityTier === 'ELITE') {
    examType = 'CHALLENGE';    // Thử thách elite
    xpMultiplier = 1.5;
  } else if (assessment.capabilityTier === 'ADVANCED' || assessment.capabilityTier === 'ELITE') {
    examType = 'PROGRESSIVE';  // Nâng cấp năng lực
    xpMultiplier = 1.3;
  } else {
    examType = 'STANDARD';
    xpMultiplier = 1.0;
  }

  // Số câu chuẩn THPT 2026 (có thể điều chỉnh cho REMEDIAL)
  const isRemedial = examType === 'REMEDIAL';
  const targetQuestions = isRemedial
    ? { part1: 5, part2: 2, part3: 1, total: 8 }   // Mini-test khắc phục
    : { part1: 18, part2: 4, part3: 6, total: 28 }; // Đề chuẩn 2026

  // Topic targeting
  const priorityTopics = examType === 'REMEDIAL'
    ? assessment.criticalTopics
    : [...assessment.criticalTopics, ...assessment.majorTopics];

  const targetFailedIds = (user.failedQuestionIds ?? []).slice(0, 20); // Tối đa 20 câu tái test

  return {
    userId,
    examType,
    xpMultiplier,
    targetQuestions,
    levelDistribution: LEVEL_MATRIX[assessment.capabilityTier],
    priorityTopics,
    excludeTopics: examType === 'REMEDIAL' ? assessment.strongTopics : [],
    targetFailedIds,
    minAccuracyThreshold: RANK_FLOOR[rank.id] ?? 4.0,
    rankId: rank.id,
    generatedAt: new Date().toISOString(),
  };
}

// ── STEP 3: Lấy Questions từ Firestore theo config ──────────────────

async function fetchQuestionsForConfig(
  config: IAdaptiveTestConfig,
  targetGrade: number
): Promise<Question[]> {
  const allQuestions: Question[] = [];
  const levelDist = config.levelDistribution;
  const total = config.targetQuestions.total;

  // Tính số câu theo cấp độ
  const countByLevel: Record<string, number> = {
    'Nhận biết':    Math.round(levelDist.NB  * total),
    'Thông hiểu':   Math.round(levelDist.TH  * total),
    'Vận dụng':     Math.round(levelDist.VD  * total),
    'Vận dụng cao': Math.round(levelDist.VDC * total),
  };

  // ── Lấy câu hỏi từ priority topics theo từng cấp độ ──
  for (const [level, count] of Object.entries(countByLevel)) {
    if (count === 0) continue;

    if (config.priorityTopics.length > 0) {
      // Batch theo 10 (Firestore 'in' limit)
      for (let i = 0; i < config.priorityTopics.length; i += 10) {
        const topicBatch = config.priorityTopics.slice(i, i + 10);
        try {
          const snap = await getDocs(
            query(
              collection(db, 'questions'),
              where('level', '==', level),
              where('topic', 'in', topicBatch),
              where('status', '==', 'published'),
              limit(count * 2)
            )
          );
          snap.docs.forEach(d => allQuestions.push({ id: d.id, ...d.data() } as Question));
        } catch { /* Bỏ qua lỗi từng batch */ }
      }
    }
  }

  // [FIX] Fallback nếu thiếu câu — filter theo level + targetGrade để tránh bốc nhầm câu lớp khác
  if (allQuestions.length < total) {
    const activeLevels = Object.entries(countByLevel)
      .filter(([, c]) => c > 0)
      .map(([lvl]) => lvl);

    for (const level of activeLevels) {
      try {
        const fallbackSnap = await getDocs(
          query(
            collection(db, 'questions'),
            where('status', '==', 'published'),
            where('level', '==', level),
            where('targetGrade', '==', targetGrade),
            limit(30)
          )
        );
        fallbackSnap.docs.forEach(d => allQuestions.push({ id: d.id, ...d.data() } as Question));
      } catch { /* Bỏ qua lỗi từng level */ }
    }
  }

  // Shuffle + deduplicate + cap tới total
  const seen = new Set<string>();
  const unique = allQuestions.filter(q => {
    if (!q.id || seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });

  return unique.sort(() => Math.random() - 0.5).slice(0, total);
}

// ── MAIN ORCHESTRATOR ───────────────────────────────────────────────

/**
 * generateAdaptiveTest — Hàm điều phối chính của Physics9+ AI Engine.
 * Flow: UserProfile → Assessment (PH1) → Config (PH2) → Questions → ActiveTest
 */
export async function generateAdaptiveTest(
  userId: string,
  user: UserProfile
): Promise<{
  questions: Question[];
  config: IAdaptiveTestConfig;
  assessment: IAssessmentRecord;
}> {
  // ── PH1: Phân tích & Chẩn đoán ──
  const assessment = await buildAssessmentRecord(userId, user);

  // ── PH2: Quyết định cấu hình đề ──
  const config = buildAdaptiveConfig(userId, user, assessment);

  // ── Fetch câu hỏi theo config ──
  const gradeNumber: number = user.grade
    ?? parseInt(user.className?.match(/^\d+/)?.[0] || '12', 10);
  let questions = await fetchQuestionsForConfig(config, gradeNumber);
  
  // Nếu DB trống hoặc không đủ câu hỏi, sinh câu hỏi dummy (cho mục đích demo/dev)
  if (questions.length === 0) {
     questions = [
        { id: 'q_dummy_1', part: 1, topic: 'Động lực học', level: 'Thông hiểu', content: 'Vật chuyển động thẳng đều thì gia tốc:', options: ['Bằng 0', 'Lớn hơn 0', 'Nhỏ hơn 0', 'Thay đổi'], correctAnswer: 0, explanation: 'Chuyển động thẳng đều có vận tốc không đổi, suy ra gia tốc bằng 0.', status: 'published' },
        { id: 'q_dummy_2', part: 1, topic: 'Động lực học', level: 'Nhận biết', content: 'Đơn vị của lực trong hệ SI là:', options: ['Joule', 'Newton', 'Watt', 'Pascal'], correctAnswer: 1, explanation: 'Đơn vị chuẩn của lực là Newton (N).', status: 'published' }
     ];
  }

  return { questions, config, assessment };
}
