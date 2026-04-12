/**
 * ═══════════════════════════════════════════════════════════════
 *  useDashboardStats() — Admin Dashboard Statistics
 *  Cache-first: getDocs thay vì getCountFromServer → tiết kiệm quota
 *  Không polling → giảm reads liên tục
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
  getCountFromServer,
} from '../firebase';

export interface AdminDashboardStats {
  totalQuestions: number;
  todayAttempts: number;
  onlineStudents: number;
  isLoading: boolean;
  /** Gọi lại để đồng bộ header */
  refetch: () => Promise<void>;
  /** Tăng/giảm counter local ngay lập tức (optimistic UI). VD: adjustCount(-1) khi xóa */
  adjustCount: (delta: number) => void;
  /** Ghi đè counter bằng giá trị chính xác từ nguồn tin cậy */
  setCount: (n: number) => void;
}

/**
 * Hook lấy thống kê cho Admin Dashboard.
 * - totalQuestions: getDocs cache-first + count
 * - todayAttempts: getDocs cache-first 
 * - onlineStudents: getDocs cache-first
 * Tất cả đều graceful — nếu lỗi quota/mạng thì giữ giá trị cũ, không crash.
 */
export function useDashboardStats(): AdminDashboardStats {
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [todayAttempts, setTodayAttempts] = useState(0);
  const [onlineStudents, setOnlineStudents] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // ── Refetch: Gọi lại để lấy số đếm ──
  const refetch = useCallback(async () => {
    try {
      const qRef = collection(db, 'questions');
      const countSnap = await getCountFromServer(qRef);
      setTotalQuestions(countSnap.data().count);
    } catch (err) {
      console.warn('[useDashboardStats] refetch error (giữ giá trị cũ):', err);
    }
  }, []);

  // ── AdjustCount: Cập nhật optimistic UI ngay lập tức ──
  const adjustCount = useCallback((delta: number) => {
    setTotalQuestions(prev => Math.max(0, prev + delta));
  }, []);

  // ── SetCount: Ghi đè counter từ nguồn tin cậy ──
  const setCount = useCallback((n: number) => {
    setTotalQuestions(n);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchAll = async () => {
      // ── 1. Đếm câu hỏi — dùng getDocs cache-first ──
      try {
        const qRef = collection(db, 'questions');
        const countSnap = await getCountFromServer(qRef);
        if (isMounted) setTotalQuestions(countSnap.data().count);
      } catch (err) {
        console.warn('[useDashboardStats] questions count error:', err);
      }

      // ── 2. Đếm lượt thi hôm nay ──
      try {
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(todayMidnight);
        const attemptsQuery = query(
          collection(db, 'attempts'),
          where('timestamp', '>=', todayTimestamp)
        );
        const snap = await getDocs(attemptsQuery);
        if (isMounted) setTodayAttempts(snap.size);
      } catch (err) {
        console.warn('[useDashboardStats] attempts error:', err);
      }

      // ── 3. Học sinh Online (lastActive < 15 phút) — 1 lần duy nhất ──
      try {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        const onlineQuery = query(
          collection(db, 'users'),
          where('role', '==', 'student'),
          where('lastActive', '>=', Timestamp.fromDate(fifteenMinAgo))
        );
        const snap = await getDocs(onlineQuery);
        if (isMounted) setOnlineStudents(snap.size);
      } catch (err) {
        console.warn('[useDashboardStats] online students error:', err);
      }

      if (isMounted) setIsLoading(false);
    };

    fetchAll();

    return () => { isMounted = false; };
  }, []);

  return { totalQuestions, todayAttempts, onlineStudents, isLoading, refetch, adjustCount, setCount };
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
