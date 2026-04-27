import { Question, UserProfile, Attempt, Badge } from '../types';
import { db, collection, addDoc, doc, setDoc, Timestamp } from '../firebase';
import { diagnoseUserExam } from './geminiService';
import { calculateAdaptiveXP } from './AdaptiveEngine';
import type { AdaptiveExamType } from './AdaptiveEngine.types';
import { getCurrentRank } from './RankSystem';
import { syncMemoryLogs } from '../utils/spacedRepetition';
import { refreshTopicProgress, popResolvedFailures } from './profileUpdater';

// Thêm helper timeout
const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} Timeout sau ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
};

export const examService = {
  /**
   * 1. Tính toán điểm số dựa trên 3 phần thi
   */
  evaluateAnswers(questions: Question[], answers: Record<string, any>, gradeNumber: number) {
    const part3ScorePerQuestion = gradeNumber <= 11 ? 0.5 : 0.25;
    let totalScore = 0;
    
    const normalizeDecimal = (v: any) => {
      if (v === undefined || v === null || v === '') return NaN;
      return parseFloat(String(v).replace(',', '.'));
    };

    const sm2Evaluations: any[] = [];
    const incorrectRecords: any[] = [];
    const skippedRecords: any[] = [];
    const scoredQuestions: any[] = [];
    const correctQuestionIds: string[] = [];
    const newFailedQuestionIds = new Set<string>();

    for (const q of questions) {
      const studentAns = answers[q.id || ''];
      let isCorrect = false;

      if (q.part === 1) {
        isCorrect = studentAns === q.correctAnswer;
        if (isCorrect) totalScore += 0.25;
      } else if (q.part === 2) {
        const totalSubItems = Array.isArray(q.correctAnswer) ? (q.correctAnswer as boolean[]).length : 4;
        let correctSubCount = 0;
        for (let i = 0; i < totalSubItems; i++) {
          if (Array.isArray(studentAns) && studentAns[i] !== undefined && studentAns[i] === (q.correctAnswer as boolean[])[i]) {
            correctSubCount++;
          }
        }
        if (correctSubCount === totalSubItems) totalScore += 1.0;
        else if (correctSubCount === totalSubItems - 1) totalScore += 0.5;
        else if (correctSubCount === totalSubItems - 2) totalScore += 0.25;
        else if (correctSubCount === 1) totalScore += 0.1;
        
        isCorrect = correctSubCount === totalSubItems; 
      } else if (q.part === 3) {
        const studentVal = normalizeDecimal(studentAns);
        const correctVal = normalizeDecimal(q.correctAnswer);
        isCorrect = !isNaN(studentVal) && Math.abs(studentVal - correctVal) < 0.01;
        if (isCorrect) totalScore += part3ScorePerQuestion;
      }
      
      if (q.id) {
        sm2Evaluations.push({ questionId: q.id, isCorrect, topic: q.topic });
        scoredQuestions.push({ questionId: q.id, topic: q.topic ?? '', isCorrect });
        
        if (!isCorrect) { 
          newFailedQuestionIds.add(q.id); 
          const isSkipped = studentAns === undefined || studentAns === '' || (Array.isArray(studentAns) && studentAns.length === 0);
          if (isSkipped) skippedRecords.push({ question: q, studentAnswer: studentAns, isCorrect: false });
          else incorrectRecords.push({ question: q, studentAnswer: studentAns, isCorrect: false });
        } else { 
          correctQuestionIds.push(q.id); 
        }
      }
    }

    totalScore = Math.round(totalScore * 100) / 100;
    
    return {
      totalScore, sm2Evaluations, incorrectRecords, skippedRecords, 
      scoredQuestions, correctQuestionIds, newFailedQuestionIds
    };
  },

  /**
   * 2. Gọi Gemini AI Chẩn đoán (Có bọc Timeout 8s)
   */
  async callDiagnosis(incorrectRecords: any[], skippedRecords: any[], gradeNumber: number, weaknessProfile: any) {
    const aiTimeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 8000));
    try {
      const aiResult = await Promise.race([
        diagnoseUserExam(incorrectRecords, skippedRecords, gradeNumber, weaknessProfile).catch(() => null),
        aiTimeout,
      ]);
      return aiResult;
    } catch (error) {
      console.warn("AI Diagnosis Failed or Timeout", error);
      return null;
    }
  },

  /**
   * 3. Lưu Attempt vào Firestore (Timeout 12s)
   */
  async saveAttempt(attempt: Attempt) {
    await withTimeout(addDoc(collection(db, 'attempts'), attempt), 12000, 'Lưu bài thi');
  },

  /**
   * 4. Cập nhật User Profile (XP, Rank, Streak, Firestore)
   */
  async updateUserProfile(
    user: UserProfile, 
    activeTest: any, 
    totalScore: number, 
    newFailedQuestionIds: Set<string>, 
    aiResult: any
  ) {
    const updatedUser = { ...user };
    const newBadges: Badge[] = [...(user.badges || [])];
    const newNotifications: any[] = [...(user.notifications || [])];

    // Master Badge
    if (totalScore === 10.0 && !newBadges.find(b => b.id === `master_${activeTest.topic}`)) {
      newBadges.push({
        id: `master_${activeTest.topic}`, title: `Bậc thầy ${activeTest.topic}`,
        icon: 'Award', description: `Đạt điểm tuyệt đối chuyên đề ${activeTest.topic}.`, unlockedAt: Timestamp.now()
      });
    }

    updatedUser.badges = newBadges;
    updatedUser.failedQuestionIds = Array.from(new Set([...(user.failedQuestionIds || []), ...Array.from(newFailedQuestionIds)]));
    
    if (aiResult?.redZones && aiResult.redZones.length > 0) {
      updatedUser.redZones = Array.from(new Set([...(user.redZones || []), ...aiResult.redZones]));
    }

    // Cập nhật Prescriptions
    if (user.prescriptions) {
      updatedUser.prescriptions = user.prescriptions.map(p => {
        if (p.status === 'pending' && p.title === activeTest.topic) {
          return { ...p, status: 'completed', completedAt: Timestamp.now(), score: totalScore };
        }
        return p;
      });
    }

    // XP Logic
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = user.lastStreakDate;
    let newStreak = 1;
    if (lastDate) {
      if (lastDate === today) newStreak = user.streak || 1;
      else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        newStreak = lastDate === yesterday.toISOString().slice(0, 10) ? (user.streak || 0) + 1 : 1;
      }
    }
    const isFirstSubmitToday = lastDate !== today;
    const examType: AdaptiveExamType = activeTest.adaptiveConfig?.examType ?? 'STANDARD';

    const xpBreakdown = calculateAdaptiveXP(
      totalScore, activeTest.questions.length, getCurrentRank(user.stars ?? 0).id,
      examType, isFirstSubmitToday, user.streak ?? 0
    );

    const earnedXP = xpBreakdown.finalXP;
    const prevStars = user.stars ?? 0;
    const prevRank = getCurrentRank(prevStars);
    
    updatedUser.stars = prevStars + earnedXP + xpBreakdown.streakBonus;
    updatedUser.streak = newStreak;
    updatedUser.lastStreakDate = today;
    updatedUser.lastActive = Timestamp.now();

    // Rank Up Notification
    const newRank = getCurrentRank(updatedUser.stars);
    let isRankUp = false;
    if (newRank.id > prevRank.id) {
      isRankUp = true;
      newNotifications.push({
        id: `rank_up_${Date.now()}`,
        title: `🎉 Thăng cấp ${newRank.icon} ${newRank.name}!`,
        message: `Chúc mừng! Bạn đã thăng lên ${newRank.name} với ${updatedUser.stars} ⭐!`,
        type: 'success', read: false, timestamp: Timestamp.now(),
      });
      updatedUser.notifications = newNotifications;
    }

    // ── Gated Content & Metered Freemium: Trừ lượt (Credits) ──
    const firestoreUpdatePayload: any = { ...updatedUser };
    if (user.tier !== 'vip') {
      // Trừ lượt an toàn bằng Atomic Increment của Firestore để chống Race Condition
      const { increment } = await import('firebase/firestore');
      firestoreUpdatePayload.usedAttempts = increment(1);
      // State frontend (optimistic update)
      updatedUser.usedAttempts = (user.usedAttempts || 0) + 1;
    }

    await withTimeout(setDoc(doc(db, 'users', user.uid), firestoreUpdatePayload, { merge: true }), 8000, 'Cập nhật hồ sơ');

    return { updatedUser, earnedXP, xpBreakdown, isRankUp };
  },

  /**
   * 5. Đồng bộ Background Tasks (SM-2, Progress)
   */
  async triggerBackgroundTasks(uid: string, sm2Evaluations: any[], scoredQuestions: any[], totalScore: number, correctQuestionIds: string[]) {
    syncMemoryLogs(uid, sm2Evaluations).catch(e => console.error("SM2 Sync failed", e));
    refreshTopicProgress(uid, scoredQuestions, totalScore).catch(e => console.warn('[App] refreshTopicProgress:', e));
    popResolvedFailures(uid, correctQuestionIds).catch(e => console.warn('[App] popResolvedFailures:', e));
  }
};
