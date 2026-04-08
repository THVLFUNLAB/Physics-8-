/**
 * ═══════════════════════════════════════════════════════════════
 *  useDashboardStats() — Admin Dashboard Real-time Statistics
 *  Thay thế toàn bộ hardcode bằng Firestore queries thực
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  Timestamp,
  getCountFromServer,
} from '../firebase';

export interface AdminDashboardStats {
  totalQuestions: number;
  todayAttempts: number;
  onlineStudents: number;
  isLoading: boolean;
}

/**
 * Hook lấy thống kê real-time cho Admin Dashboard.
 * - totalQuestions: onSnapshot trên collection 'questions'
 * - todayAttempts: query 'attempts' có timestamp >= 00:00 hôm nay
 * - onlineStudents: query 'users' có lastActive trong 15 phút gần nhất
 */
export function useDashboardStats(): AdminDashboardStats {
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [todayAttempts, setTodayAttempts] = useState(0);
  const [onlineStudents, setOnlineStudents] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // ── 1. Một lần lấy số đếm câu hỏi (giảm read liên tục) ──
    const fetchTotalQuestions = async () => {
      try {
        const snap = await getCountFromServer(collection(db, 'questions'));
        setTotalQuestions(snap.data().count);
      } catch (err) {
        console.error('[useDashboardStats] questions error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTotalQuestions();

    // ── 2. Đếm số lượt thi hôm nay ──
    const fetchTodayAttempts = async () => {
      try {
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(todayMidnight);

        const attemptsQuery = query(
          collection(db, 'attempts'),
          where('timestamp', '>=', todayTimestamp)
        );
        const snap = await getCountFromServer(attemptsQuery);
        setTodayAttempts(snap.data().count);
      } catch (err) {
        console.error('[useDashboardStats] attempts error:', err);
      }
    };
    fetchTodayAttempts();

    // ── 3. Polling: Học sinh Online (lastActive < 15 phút) ──
    const fetchOnline = async () => {
      try {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        const onlineQuery = query(
          collection(db, 'users'),
          where('role', '==', 'student'),
          where('lastActive', '>=', Timestamp.fromDate(fifteenMinAgo))
        );
        const snap = await getDocs(onlineQuery);
        setOnlineStudents(snap.size);
      } catch (err) {
        console.error('[useDashboardStats] online students error:', err);
      }
    };

    fetchOnline();
    const onlineInterval = setInterval(fetchOnline, 60_000); // Refresh mỗi phút

    return () => {
      clearInterval(onlineInterval);
    };
  }, []);

  return { totalQuestions, todayAttempts, onlineStudents, isLoading };
}

// ═══════════════════════════════════════════════════════════════
//  useStudentStats() — Student Dashboard computed metrics
// ═══════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import type { Attempt, UserProfile, Question } from '../types';

export interface StudentStats {
  /** Trung bình cộng điểm (thang 10) tất cả bài test */
  gpa: string;
  /** Tổng số bài test đã hoàn thành */
  completedTests: number;
  /** Streak hiện tại (ngày) */
  streak: number;
  /** Số vùng đỏ */
  redZoneCount: number;
  /** Dữ liệu cho Radar Chart */
  radarData: { subject: string; A: number; fullMark: number }[];
  /** Dữ liệu cho Line/Area Chart */
  progressData: { date: string; score: number }[];
  /** Có dữ liệu hay không */
  hasData: boolean;
}

/**
 * Hook tính toán thống kê Student Dashboard từ attempts + user profile.
 * Tất cả đều computed (memo), không fetch thêm.
 */
export function useStudentStats(user: UserProfile | null, attempts: Attempt[]): StudentStats {
  return useMemo(() => {
    if (!user || attempts.length === 0) {
      return {
        gpa: '0.0',
        completedTests: 0,
        streak: user?.streak || 0,
        redZoneCount: user?.redZones?.length || 0,
        radarData: [],
        progressData: [],
        hasData: false,
      };
    }

    // ── GPA: Trung bình cộng điểm tất cả bài test ──
    const totalScore = attempts.reduce((acc, a) => acc + a.score, 0);
    const gpa = (totalScore / attempts.length).toFixed(1);

    // ── Completed Tests: Đếm số bài test ──
    const completedTests = attempts.length;

    // ── Topic performance cho Radar Chart ──
    const topicMap: Record<string, { totalScore: number; count: number }> = {};
    attempts.forEach((a) => {
      const topic = a.testId; // testId chính là topic name
      if (!topicMap[topic]) topicMap[topic] = { totalScore: 0, count: 0 };
      topicMap[topic].totalScore += a.score;
      topicMap[topic].count += 1;
    });

    const radarData = Object.entries(topicMap).map(([topic, data]) => ({
      subject: topic,
      A: Math.round((data.totalScore / data.count / 10) * 100), // % trên thang 10
      fullMark: 100,
    }));

    // ── Progress Data cho Line Chart ──
    const progressData = attempts
      .slice()
      .sort((a, b) => {
        const tsA = a.timestamp?.seconds || 0;
        const tsB = b.timestamp?.seconds || 0;
        return tsA - tsB; // Sort cũ → mới
      })
      .map((a) => ({
        date: new Date((a.timestamp?.seconds || 0) * 1000).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
        }),
        score: a.score, // Đã là thang 10
      }));

    return {
      gpa,
      completedTests,
      streak: user.streak || 0,
      redZoneCount: user.redZones?.length || 0,
      radarData,
      progressData,
      hasData: true,
    };
  }, [user, attempts]);
}
