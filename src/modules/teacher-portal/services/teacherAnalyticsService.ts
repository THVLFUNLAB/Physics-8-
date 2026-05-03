import { db, collection, query, where, getDocs } from '../../../firebase';
import type { Attempt } from '../../../types';
import type { TeacherClassSummary } from '../types';
import { toast } from '../../../components/Toast';

export interface AssignmentAnalyticsResult {
  averageScore: number;
  submissionRate: number;
  totalSubmissions: number;
  scoreDistribution: { range: string; count: number }[];
  weakTopics: { topic: string; errorCount: number; frequency: string }[];
  topStudents: { name: string; score: number; timeSpent?: number }[];
}

// Hàm hỗ trợ gom nhóm điểm số
function getScoreRange(score: number): string {
  if (score < 2) return '0-2';
  if (score < 4) return '2-4';
  if (score < 6) return '4-6';
  if (score < 8) return '6-8';
  return '8-10';
}

/**
 * Lấy dữ liệu phân tích của 1 Đề thi (Assignment) trong 1 Lớp học cụ thể.
 * Tích hợp cơ chế LƯU CACHE (sessionStorage) trong 5 phút.
 */
export async function getAssignmentAnalytics(
  assignmentId: string, 
  examId: string, 
  classData: TeacherClassSummary,
  forceRefresh: boolean = false
): Promise<AssignmentAnalyticsResult> {
  const cacheKey = `analytics_${assignmentId}_${classData.id}`;
  
  if (!forceRefresh) {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Kiểm tra TTL 5 phút
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        return parsed.data;
      }
    }
  }

  try {
    // Kéo toàn bộ attempts của examId
    const attemptsRef = collection(db, 'attempts');
    const q = query(attemptsRef, where('examId', '==', examId));
    const snapshot = await getDocs(q);

    // Lọc attempts thuộc về học sinh trong lớp (bằng JS để tránh giới hạn IN query của Firebase)
    const classStudentIds = new Set(classData.studentIds || []);
    const validAttempts: Attempt[] = [];

    snapshot.forEach(doc => {
      const data = doc.data() as Attempt;
      // Trong trường hợp attempt lưu userId hoặc studentEmail/studentName, ta map theo userId
      // Note: Attempt interface dùng userId
      if (data.userId && classStudentIds.has(data.userId)) {
        validAttempts.push({ id: doc.id, ...data });
      }
    });

    // 1. Tính Tỷ lệ và Điểm trung bình
    const totalSubmissions = validAttempts.length;
    const submissionRate = classData.studentCount > 0 
      ? Math.round((totalSubmissions / classData.studentCount) * 100) 
      : 0;

    let totalScore = 0;
    const distributionMap: Record<string, number> = {
      '0-2': 0, '2-4': 0, '4-6': 0, '6-8': 0, '8-10': 0
    };

    // 2. Gom nhóm Topic sai nhiều nhất
    const topicErrorCounts: Record<string, number> = {};

    validAttempts.forEach(attempt => {
      totalScore += (attempt.score || 0);
      distributionMap[getScoreRange(attempt.score || 0)]++;

      // Gom lỗi sai từ analysis.errorTracking
      if (attempt.analysis?.errorTracking) {
        Object.entries(attempt.analysis.errorTracking).forEach(([topic, reason]) => {
          if (!topicErrorCounts[topic]) topicErrorCounts[topic] = 0;
          topicErrorCounts[topic]++;
        });
      }
    });

    const averageScore = totalSubmissions > 0 ? Number((totalScore / totalSubmissions).toFixed(2)) : 0;

    const scoreDistribution = Object.entries(distributionMap).map(([range, count]) => ({
      range,
      count
    }));

    // Sắp xếp weak topics
    const weakTopics = Object.entries(topicErrorCounts)
      .map(([topic, errorCount]) => ({
        topic,
        errorCount,
        frequency: totalSubmissions > 0 ? `${Math.round((errorCount / totalSubmissions) * 100)}%` : '0%'
      }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 10); // Lấy top 10 chủ đề yếu nhất

    // 3. Top 5 Học sinh
    const topStudents = [...validAttempts]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map(att => {
        // Fallback: Tìm name từ list, tạm thời nếu Attempt ko có tên thì dùng userId mảng đầu
        // Tốt nhất nếu Attempt có lưu studentName, nếu không thì hiện ID
        const rawName = (att as any).studentName || `Học sinh ${att.userId.substring(0,5)}`;
        return {
          name: rawName,
          score: att.score || 0,
          timeSpent: att.timeSpent
        };
      });

    const result: AssignmentAnalyticsResult = {
      averageScore,
      submissionRate,
      totalSubmissions,
      scoreDistribution,
      weakTopics,
      topStudents
    };

    // Lưu Cache
    sessionStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      data: result
    }));

    return result;
  } catch (error) {
    console.error('Lỗi khi fetch Analytics:', error);
    toast.error('Không thể lấy dữ liệu phân tích.');
    throw error;
  }
}
