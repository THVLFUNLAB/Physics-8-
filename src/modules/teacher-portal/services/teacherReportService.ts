/**
 * teacherReportService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tổng hợp báo cáo lớp học từ Firestore examAttempts.
 * Không cần composite index — query đơn giản, sort client-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  db, collection, getDocs, query, where, limit,
} from '../../../firebase';

export interface StudentReportEntry {
  uid: string;
  displayName: string;
  email: string;
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  lastActive: number;     // Unix ms
  weakTopics: string[];
  needsSupport: boolean;  // averageScore < 5.0
}

export interface ClassReport {
  classId: string;
  className: string;
  totalStudents: number;
  activeStudents: number;       // Đã làm ít nhất 1 bài
  averageScore: number;
  scoreDistribution: {          // Phân phối điểm
    '0-2': number; '2-4': number; '4-6': number; '6-8': number; '8-10': number;
  };
  topStudents: StudentReportEntry[];
  weakStudents: StudentReportEntry[];
  topicAccuracy: { topic: string; accuracy: number; attempts: number }[];
  generatedAt: number;          // Unix ms
}

/**
 * Tạo báo cáo cho một lớp học.
 * Query: tất cả attempts của HS trong lớp.
 */
export async function generateClassReport(
  classId: string,
  className: string,
  studentIds: string[],
): Promise<ClassReport> {
  if (studentIds.length === 0) {
    return emptyReport(classId, className);
  }

  // Lấy tối đa 500 attempts gần nhất của lớp
  // Firestore không hỗ trợ `in` với mảng > 30 → chia batch
  const BATCH = 30;
  const allAttempts: any[] = [];
  for (let i = 0; i < studentIds.length; i += BATCH) {
    const batch = studentIds.slice(i, i + BATCH);
    const q = query(
      collection(db, 'examAttempts'),
      where('userId', 'in', batch),
      limit(500)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => allAttempts.push({ id: d.id, ...d.data() }));
  }

  // Nhóm theo HS
  const byStudent: Record<string, any[]> = {};
  for (const a of allAttempts) {
    if (!byStudent[a.userId]) byStudent[a.userId] = [];
    byStudent[a.userId].push(a);
  }

  // Build StudentReportEntry
  const entries: StudentReportEntry[] = Object.entries(byStudent).map(([uid, attempts]) => {
    const scores = attempts.map(a => Number(a.score) || 0);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const best = Math.max(...scores);

    // Collect weak topics from analysis.errorTracking
    const topicErrors: Record<string, number> = {};
    attempts.forEach(a => {
      if (a.analysis?.errorTracking) {
        Object.entries(a.analysis.errorTracking as Record<string, any>).forEach(([topic, data]: any) => {
          topicErrors[topic] = (topicErrors[topic] ?? 0) + (data.count ?? 0);
        });
      }
    });
    const weakTopics = Object.entries(topicErrors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([topic]) => topic);

    const lastAttempt = attempts.reduce((latest, a) => {
      const t = a.completedAt?.seconds ?? 0;
      return t > latest ? t : latest;
    }, 0);

    return {
      uid,
      displayName: attempts[0]?.userName || attempts[0]?.userEmail || uid.slice(0, 8),
      email: attempts[0]?.userEmail || '',
      totalAttempts: attempts.length,
      averageScore: parseFloat(avg.toFixed(2)),
      bestScore: parseFloat(best.toFixed(2)),
      lastActive: lastAttempt * 1000,
      weakTopics,
      needsSupport: avg < 5.0,
    };
  });

  // Score distribution
  const dist = { '0-2': 0, '2-4': 0, '4-6': 0, '6-8': 0, '8-10': 0 };
  allAttempts.forEach(a => {
    const s = Number(a.score) || 0;
    if (s < 2) dist['0-2']++;
    else if (s < 4) dist['2-4']++;
    else if (s < 6) dist['4-6']++;
    else if (s < 8) dist['6-8']++;
    else dist['8-10']++;
  });

  // Topic accuracy
  const topicData: Record<string, { correct: number; total: number }> = {};
  allAttempts.forEach(a => {
    if (a.analysis?.topicAccuracy) {
      Object.entries(a.analysis.topicAccuracy as Record<string, any>).forEach(([topic, data]: any) => {
        if (!topicData[topic]) topicData[topic] = { correct: 0, total: 0 };
        topicData[topic].correct += data.correct ?? 0;
        topicData[topic].total += data.total ?? 0;
      });
    }
  });
  const topicAccuracy = Object.entries(topicData)
    .map(([topic, { correct, total }]) => ({
      topic,
      accuracy: total > 0 ? parseFloat(((correct / total) * 100).toFixed(1)) : 0,
      attempts: total,
    }))
    .sort((a, b) => a.accuracy - b.accuracy) // Yếu nhất trước
    .slice(0, 10);

  const avgAll = entries.length
    ? entries.reduce((s, e) => s + e.averageScore, 0) / entries.length
    : 0;

  return {
    classId,
    className,
    totalStudents: studentIds.length,
    activeStudents: entries.length,
    averageScore: parseFloat(avgAll.toFixed(2)),
    scoreDistribution: dist,
    topStudents: [...entries].sort((a, b) => b.averageScore - a.averageScore).slice(0, 5),
    weakStudents: entries.filter(e => e.needsSupport).sort((a, b) => a.averageScore - b.averageScore).slice(0, 5),
    topicAccuracy,
    generatedAt: Date.now(),
  };
}

function emptyReport(classId: string, className: string): ClassReport {
  return {
    classId, className,
    totalStudents: 0, activeStudents: 0, averageScore: 0,
    scoreDistribution: { '0-2': 0, '2-4': 0, '4-6': 0, '6-8': 0, '8-10': 0 },
    topStudents: [], weakStudents: [], topicAccuracy: [],
    generatedAt: Date.now(),
  };
}
