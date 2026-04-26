/**
 * ═══════════════════════════════════════════════════════════════════
 *  profileUpdater.ts — Cập nhật hồ sơ năng lực sau mỗi lượt thi
 *
 *  Module ĐỘC LẬP — không import geminiService hay VoiceTutorButton.
 *  Gọi sau addDoc(attempts, ...) trong App.tsx để giữ topicProgress
 *  luôn chính xác và để biểu đồ Radar phản ánh đúng thực tế.
 * ═══════════════════════════════════════════════════════════════════
 */

import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Kiểu dữ liệu nội bộ ────────────────────────────────────────────

/**
 * Thông tin từng câu hỏi đã chấm, truyền từ submitTest vào.
 * Đủ để cập nhật correctCount theo topic.
 */
export interface ScoredQuestion {
  questionId: string;
  topic: string;      // e.g. "Vật lí nhiệt"
  isCorrect: boolean;
}

// ─── Hằng số: 4 mạch nội dung cốt lõi THPTQG ────────────────────────

/**
 * 4 trục radar của biểu đồ Radar — đúng với ma trận đề thi THPTQG.
 * Chuyên đề (Dòng điện xoay chiều, Lượng tử...) KHÔNG thuộc phần này.
 */
export const RADAR_TOPICS = [
  'Vật lí nhiệt',
  'Khí lí tưởng',
  'Từ trường',
  'Vật lí hạt nhân',   // Alias: "Hạt nhân & Phóng xạ"
] as const;

/**
 * Map alias → tên chuẩn trong RADAR_TOPICS.
 * Câu hỏi trong DB có thể dùng nhiều cách viết khác nhau.
 */
const TOPIC_ALIAS_MAP: Record<string, string> = {
  'vật lí nhiệt':              'Vật lí nhiệt',
  'vật lý nhiệt':              'Vật lí nhiệt',
  'nhiệt học':                 'Vật lí nhiệt',
  'khí lí tưởng':              'Khí lí tưởng',
  'khí lý tưởng':              'Khí lí tưởng',
  'chất khí':                  'Khí lí tưởng',
  'từ trường':                 'Từ trường',
  'trường từ':                 'Từ trường',
  'cảm ứng điện từ':           'Từ trường',
  'vật lí hạt nhân':           'Vật lí hạt nhân',
  'vật lý hạt nhân':           'Vật lí hạt nhân',
  'vật lí hạt nhân và phóng xạ': 'Vật lí hạt nhân',
  'hạt nhân và phóng xạ':     'Vật lí hạt nhân',
  'hạt nhân':                  'Vật lí hạt nhân',
  'phóng xạ':                  'Vật lí hạt nhân',
};

/** Chuẩn hoá tên topic về một trong 4 mạch RADAR_TOPICS, hoặc null nếu không thuộc. */
export function normalizeRadarTopic(rawTopic: string): string | null {
  const lower = rawTopic.toLowerCase().trim();
  return TOPIC_ALIAS_MAP[lower] ?? null;
}

// ─── refreshTopicProgress ─────────────────────────────────────────────

/**
 * Cập nhật `topicProgress` trong Firestore sau mỗi lượt thi.
 *
 * Cấu trúc `topicProgress[topic]` được nâng cấp để chứa:
 *   - correctCount: số câu đúng tích lũy (mới — nguồn dữ liệu chính)
 *   - totalQuestions: tổng số câu đã làm trong topic
 *   - bestScore / lastScore: giữ nguyên tương thích ngược
 *   - totalAttempts: số lần thi (bài) có chứa topic này
 *
 * @param userId - UID người dùng
 * @param scoredQuestions - Danh sách câu đã chấm trong bài thi vừa nộp
 * @param totalScore - Điểm tổng bài (thang 10) — để cập nhật lastScore/bestScore
 */
export async function refreshTopicProgress(
  userId: string,
  scoredQuestions: ScoredQuestion[],
  totalScore: number,
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    // Lấy topicProgress hiện tại hoặc tạo mới
    const topicProgress: Record<string, {
      totalAttempts: number;
      bestScore: number;
      lastScore: number;
      mastered: boolean;
      correctCount?: number;   // MỚI — đếm số câu đúng tích lũy
      totalQuestions?: number; // MỚI — đếm tổng câu đã làm trong topic
    }> = userData?.learningPath?.topicProgress ?? {};

    // Gom câu theo topic đã chuẩn hoá
    const byTopic: Record<string, { correct: number; total: number }> = {};
    for (const sq of scoredQuestions) {
      const normalized = normalizeRadarTopic(sq.topic);
      if (!normalized) continue; // Bỏ qua topic không thuộc 4 mạch radar
      if (!byTopic[normalized]) byTopic[normalized] = { correct: 0, total: 0 };
      byTopic[normalized].total += 1;
      if (sq.isCorrect) byTopic[normalized].correct += 1;
    }

    // Cập nhật từng topic có câu hỏi trong bài thi này
    for (const [topic, stats] of Object.entries(byTopic)) {
      const prev = topicProgress[topic] ?? {
        totalAttempts: 0,
        bestScore: 0,
        lastScore: 0,
        mastered: false,
        correctCount: 0,
        totalQuestions: 0,
      };

      topicProgress[topic] = {
        totalAttempts:  (prev.totalAttempts ?? 0) + 1,
        bestScore:      Math.max(prev.bestScore ?? 0, totalScore),
        lastScore:      totalScore,
        mastered:       Math.max(prev.bestScore ?? 0, totalScore) >= 8.0,
        // ── Trường MỚI: đếm câu đúng / tổng câu ──
        correctCount:   (prev.correctCount  ?? 0) + stats.correct,
        totalQuestions: (prev.totalQuestions ?? 0) + stats.total,
      };
    }

    await updateDoc(userRef, {
      'learningPath.topicProgress': topicProgress,
    });
  } catch (err) {
    // Graceful — không crash luồng chính nếu cập nhật thất bại
    console.warn('[profileUpdater] refreshTopicProgress failed:', err);
  }
}

// ─── popResolvedFailures ──────────────────────────────────────────────

/**
 * Xoá (pop) các câu hỏi đã trả lời ĐÚNG khỏi `failedQuestionIds`.
 *
 * Được gọi ngay sau submitTest khi bài làm có câu hỏi nằm trong
 * `failedQuestionIds` của học sinh. Firestore `arrayRemove` đảm bảo
 * atomic — không bao giờ xoá nhầm câu.
 *
 * @param userId - UID người dùng
 * @param correctQuestionIds - Danh sách ID câu đã trả lời ĐÚNG trong lần thi này
 */
export async function popResolvedFailures(
  userId: string,
  correctQuestionIds: string[],
): Promise<void> {
  if (correctQuestionIds.length === 0) return;
  try {
    const userRef = doc(db, 'users', userId);
    // arrayRemove chỉ xoá các phần tử khớp chính xác — an toàn
    await updateDoc(userRef, {
      failedQuestionIds: arrayRemove(...correctQuestionIds),
    });
  } catch (err) {
    console.warn('[profileUpdater] popResolvedFailures failed:', err);
  }
}
