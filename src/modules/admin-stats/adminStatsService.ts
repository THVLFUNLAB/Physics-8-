/**
 * adminStatsService.ts
 * ════════════════════════════════════════════════════════════════
 * Tầng DATA ACCESS — Thuần hàm, không biết UI tồn tại.
 * Mọi Firestore query đều tập trung tại đây.
 *
 * CHIẾN LƯỢC TỐI ƯU FIRESTORE READS:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Metric              │ Kỹ thuật          │ Read cost       │
 * │──────────────────────│───────────────────│─────────────────│
 * │  Tổng học sinh       │ getCountFromServer│ 1 read          │
 * │  Học sinh VIP        │ getCountFromServer│ 1 read          │
 * │  Học sinh active 7d  │ getCountFromServer│ 1 read          │
 * │  Tổng lượt thi       │ getCountFromServer│ 1 read          │
 * │  Lượt AI chat 30d    │ getCountFromServer│ 1 read          │
 * │  ĐTB (100 gần nhất)  │ getDocs limit=100 │ 100 reads       │
 * │  Top 5 exams         │ getDocs limit=200 │ 200 reads       │
 * │  Hoạt động 7 ngày    │ getDocs limit=500 │ ≤500 reads      │
 * └─────────────────────────────────────────────────────────────┘
 * TỔNG TỐI ĐA: ~805 reads / lần refresh
 * Với cache 5 phút → trung bình < 5 reads/phút
 * ════════════════════════════════════════════════════════════════
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  getCountFromServer,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

// ── Types ──────────────────────────────────────────────────────────────
export interface SystemStats {
  totalStudents: number;
  vipStudents: number;
  freeStudents: number;
  activeStudents7d: number;
  totalAttempts: number;
  averageScore: number;          // Tính từ 100 lượt gần nhất
  aiChatCount30d: number;
  activityByDay: DayActivity[];  // 7 ngày gần nhất
  topExams: TopExam[];           // Top 5 đề được làm nhiều nhất
  fetchedAt: number;             // Unix timestamp để validate cache
}

export interface DayActivity {
  date: string;    // 'DD/MM'
  attempts: number;
  simulations: number;
}

export interface TopExam {
  examId: string;
  examTitle: string;   // Tên đề thi lấy từ collection 'exams'
  count: number;
}

// ── Helper ─────────────────────────────────────────────────────────────
const nDaysAgo = (n: number): Timestamp => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
};

const dateLabel = (ts: Timestamp): string => {
  const d = ts.toDate();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ── Main Service Function ──────────────────────────────────────────────
/**
 * Lấy toàn bộ số liệu thống kê hệ thống.
 * Dùng Promise.all để chạy song song, giảm thời gian chờ.
 */
export async function fetchSystemStats(): Promise<SystemStats> {
  const cutoff7d  = nDaysAgo(7);
  const cutoff30d = nDaysAgo(30);

  // ── Chạy song song các queries độc lập ────────────────────────────
  const [
    totalStudentsSnap,
    vipStudentsSnap,
    activeStudents7dSnap,
    totalAttemptsSnap,
    aiChatSnap,
    recentAttemptsSnap,
    usageLogs7dSnap,
  ] = await Promise.all([
    // 1. Tổng học sinh (không tính admin)
    getCountFromServer(
      query(collection(db, 'users'), where('role', '==', 'student'))
    ),

    // 2. Học sinh VIP
    getCountFromServer(
      query(collection(db, 'users'), where('tier', '==', 'vip'))
    ),

    // 3. Học sinh active trong 7 ngày
    getCountFromServer(
      query(collection(db, 'users'), where('lastActive', '>=', cutoff7d))
    ),

    // 4. Tổng lượt thi (tất cả attempts)
    getCountFromServer(collection(db, 'attempts')),

    // 5. Lượt AI chat trong 30 ngày
    getCountFromServer(
      query(collection(db, 'ai_chat_logs'), where('timestamp', '>=', cutoff30d))
    ),

    // 6. 100 attempts gần nhất để tính ĐTB — limit tránh đọc toàn bộ DB
    getDocs(
      query(
        collection(db, 'attempts'),
        orderBy('timestamp', 'desc'),
        limit(100)
      )
    ),

    // 7. Usage logs 7 ngày — để vẽ biểu đồ hoạt động
    getDocs(
      query(
        collection(db, 'usage_logs'),
        where('timestamp', '>=', cutoff7d),
        orderBy('timestamp', 'asc'),
        limit(500)
      )
    ),
  ]);

  // ── Tính Điểm Trung Bình ──────────────────────────────────────────
  let totalScore = 0;
  let scoredCount = 0;
  recentAttemptsSnap.docs.forEach(d => {
    const score = d.data().score;
    if (typeof score === 'number' && !isNaN(score)) {
      totalScore += score;
      scoredCount++;
    }
  });
  const averageScore = scoredCount > 0 ? parseFloat((totalScore / scoredCount).toFixed(2)) : 0;

  // ── Biểu đồ hoạt động 7 ngày ──────────────────────────────────────
  // Khởi tạo map với 7 ngày (đảm bảo ngày 0 lượt cũng hiển thị)
  const dayMap = new Map<string, DayActivity>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    dayMap.set(label, { date: label, attempts: 0, simulations: 0 });
  }

  usageLogs7dSnap.docs.forEach(d => {
    const data = d.data();
    if (!data.timestamp) return;
    const label = dateLabel(data.timestamp as Timestamp);
    if (!dayMap.has(label)) return;

    const entry = dayMap.get(label)!;
    const action = data.action as string || '';
    if (action.startsWith('simulation') || action.startsWith('virtual_lab')) {
      entry.simulations += 1;
    } else {
      // Mặc định các action còn lại (exam, live_class, pdf...) = attempt activity
      entry.attempts += 1;
    }
  });
  const activityByDay = Array.from(dayMap.values());

  // ── Top 5 Đề thi được làm nhiều nhất ──────────────────────────────
  const examCountMap = new Map<string, number>();
  usageLogs7dSnap.docs.forEach(d => {
    const data = d.data();
    const examId = data.examId as string;
    if (!examId || examId === 'unknown_pdf') return;
    examCountMap.set(examId, (examCountMap.get(examId) || 0) + 1);
  });
  // Tính top 5 trước
  const top5Raw = Array.from(examCountMap.entries())
    .map(([examId, count]) => ({ examId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Fetch tên đề thi — tối đa 5 reads, chạy song song
  const topExams: TopExam[] = await Promise.all(
    top5Raw.map(async ({ examId, count }) => {
      try {
        const examSnap = await getDoc(doc(db, 'exams', examId));
        const title = examSnap.exists()
          ? (examSnap.data()?.title as string) || examId
          : examId;  // fallback nếu không tìm thấy
        return { examId, examTitle: title, count };
      } catch {
        return { examId, examTitle: examId, count }; // lỗi mạng → fallback
      }
    })
  );

  // ── Assemble kết quả ──────────────────────────────────────────────
  const totalStudents = totalStudentsSnap.data().count;
  const vipStudents   = vipStudentsSnap.data().count;

  return {
    totalStudents,
    vipStudents,
    freeStudents: totalStudents - vipStudents,
    activeStudents7d: activeStudents7dSnap.data().count,
    totalAttempts: totalAttemptsSnap.data().count,
    averageScore,
    aiChatCount30d: aiChatSnap.data().count,
    activityByDay,
    topExams,
    fetchedAt: Date.now(),
  };
}
