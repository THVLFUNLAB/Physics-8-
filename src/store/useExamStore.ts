import { create } from 'zustand';
import { Topic, Question, Attempt } from '../types';

interface ExamState {
  // ── State Cốt Lõi ──
  activeTest: { topic: Topic; questions: Question[]; examId?: string; adaptiveConfig?: any } | null;
  currentQuestionIndex: number;
  answers: Record<string, any>;
  results: Attempt | null;
  
  // ── UI/UX State ──
  isReviewing: boolean;
  isAnalyzing: boolean;
  isStartingExam: boolean;
  submissionResult: { score: number; earnedXP: number; show: boolean; xpBreakdown?: any } | null;

  // ── Sync State ──
  lastSavedAt: number | null;

  // ── Actions Cơ Bản ──
  setActiveTest: (test: { topic: Topic; questions: Question[]; examId?: string } | null) => void;
  setCurrentQuestionIndex: (index: number) => void;
  handleAnswer: (questionId: string, answer: any) => void;
  setResults: (results: Attempt | null) => void;
  setIsReviewing: (val: boolean) => void;
  setIsAnalyzing: (val: boolean) => void;
  setSubmissionResult: (res: any) => void;
  setIsStartingExam: (val: boolean) => void;

  // ── Thunks / Async Actions (Side-effects) ──
  saveExamSession: () => void;
  restoreExamSession: () => boolean;
  clearExamSession: (userId?: string) => void;

  // ── Kịch bản nộp bài và tạo đề thi ──
  startExamAttempt: (exam: any) => void;
  submitExam: () => Promise<void>;
  handleAdaptiveTestFix: () => Promise<void>;
}

const SESSION_KEY = 'phys8_active_exam_session';
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 giờ

// Biến giữ tham chiếu timer cho Debounce (ngoài scope của store để không bị re-create)
let saveTimeoutId: number | null = null;

export const useExamStore = create<ExamState>((set, get) => ({
  activeTest: null,
  currentQuestionIndex: 0,
  answers: {},
  results: null,
  isReviewing: false,
  isAnalyzing: false,
  isStartingExam: false,
  submissionResult: null,
  lastSavedAt: null,

  setActiveTest: (test) => set({ activeTest: test }),
  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
  
  handleAnswer: (questionId, answer) => {
    set((state) => ({ answers: { ...state.answers, [questionId]: answer } }));
    
    // Tối ưu Debounce 800ms cho tác vụ save localStorage (chống giật lag UI khi json lớn)
    if (saveTimeoutId) {
      window.clearTimeout(saveTimeoutId);
    }
    saveTimeoutId = window.setTimeout(() => {
      get().saveExamSession();
    }, 800);
  },

  setResults: (results) => set({ results }),
  setIsReviewing: (val) => set({ isReviewing: val }),
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),
  setSubmissionResult: (res) => set({ submissionResult: res }),
  setIsStartingExam: (val) => set({ isStartingExam: val }),

  saveExamSession: () => {
    const { activeTest, answers, currentQuestionIndex, results } = get();
    // Chỉ lưu nếu đang làm bài và chưa nộp
    if (activeTest && !results) {
      // Dùng requestIdleCallback nếu trình duyệt hỗ trợ để chắc chắn không block Main Thread
      const performSave = () => {
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            topic: activeTest.topic,
            questions: activeTest.questions,
            examId: activeTest.examId,
            answers,
            currentQuestionIndex,
            savedAt: Date.now(),
          }));
          set({ lastSavedAt: Date.now() });
        } catch (e) {
          console.warn('[Session] Không thể lưu phiên thi:', e);
        }
      };

      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(performSave);
      } else {
        performSave();
      }
    }
  },

  restoreExamSession: () => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (!saved) return false;
      const session = JSON.parse(saved);
      
      if (!session.questions || !Array.isArray(session.questions) || session.questions.length === 0) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }

      const elapsed = Date.now() - (session.savedAt || 0);
      if (elapsed > SESSION_TIMEOUT) {
        localStorage.removeItem(SESSION_KEY);
        return false; // Quá hạn 2 tiếng
      }

      // Khôi phục thành công
      set({
        activeTest: { topic: session.topic, questions: session.questions, examId: session.examId },
        answers: session.answers || {},
        currentQuestionIndex: session.currentQuestionIndex || 0,
        results: null,
        lastSavedAt: session.savedAt,
      });
      console.info(`[Session] ✅ Đã khôi phục phiên thi: ${session.topic} — ${session.questions.length} câu`);
      return true;
    } catch (e) {
      console.warn('[Session] Lỗi khôi phục phiên thi:', e);
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
  },

  clearExamSession: (userId?: string) => {
    localStorage.removeItem(SESSION_KEY);
    const { activeTest } = get();
    if (userId && activeTest?.topic) {
      localStorage.removeItem(`exam_draft_${userId}_${activeTest.topic}`);
    }
    set({
      activeTest: null,
      answers: {},
      currentQuestionIndex: 0,
      results: null,
      lastSavedAt: null,
    });
  },

  startExamAttempt: (exam) => {
    set({
      activeTest: { topic: exam.topic || exam.title, questions: exam.questions, examId: exam.id, adaptiveConfig: exam.adaptiveConfig },
      currentQuestionIndex: 0,
      answers: {},
      results: null,
      isReviewing: false,
      submissionResult: null,
    });
    // Kích hoạt session lưu nháp
    get().saveExamSession();
  },

  submitExam: async () => {
    const { activeTest, answers } = get();
    // Dynamic import để tránh vòng lặp phụ thuộc (dependency cycle) giữa store và firebase
    const { useAuthStore } = await import('./useAuthStore');
    const { useAppStore } = await import('./useAppStore');
    const { examService } = await import('../services/examService');
    const { toast } = await import('../components/Toast');
    const { Timestamp } = await import('../firebase');

    const authState = useAuthStore.getState();
    const user = authState.user;
    if (!activeTest || !user) return;

    set({ isAnalyzing: true });

    try {
      const gradeNumber = parseInt(user.className?.replace(/\D/g, '') || '12');
      
      // 1. Service: Tính điểm
      const evaluation = examService.evaluateAnswers(activeTest.questions, answers, gradeNumber);
      
      // 2. Service: Chẩn đoán AI
      const aiResult = await examService.callDiagnosis(
        evaluation.incorrectRecords, 
        evaluation.skippedRecords, 
        gradeNumber, 
        user.learningPath?.weaknessProfile
      );

      // 3. Chuẩn bị Payload bài thi
      const attempt = {
        id: Math.random().toString(36).substr(2, 9),
        userId: user.uid,
        testId: activeTest.topic,
        answers,
        score: evaluation.totalScore,
        analysis: aiResult || null,
        weaknessProfile: aiResult?.weaknessProfile || null,
        timestamp: Timestamp.now()
      };

      // 4. Service: Lưu bài thi
      await examService.saveAttempt(attempt);

      // 5. Service: Cập nhật User Profile
      const { updatedUser, earnedXP, xpBreakdown, isRankUp } = await examService.updateUserProfile(
        user, activeTest, evaluation.totalScore, evaluation.newFailedQuestionIds, aiResult
      );

      // Cập nhật State Auth & App
      authState.setUser(updatedUser);
      if (isRankUp) useAppStore.getState().setShowConfetti(true);

      // 6. Service: Chạy Background Sync (SM-2, Topic Progress)
      examService.triggerBackgroundTasks(
        user.uid, evaluation.sm2Evaluations, evaluation.scoredQuestions, 
        evaluation.totalScore, evaluation.correctQuestionIds
      );

      // Cập nhật State nội bộ
      set({
        submissionResult: { score: evaluation.totalScore, earnedXP, show: true, xpBreakdown },
        results: attempt
      });
      
      get().clearExamSession(user.uid);
      useAppStore.getState().setShowVirtualLab(false);
      
    } catch (e: any) {
      console.error('[submitExam] Lỗi nộp bài:', e);
      const msg = String(e?.message || e || '');
      if (msg.includes('Timeout')) toast.error('⏱ Mạng chậm quá — Đã lưu bài cục bộ. Em có thể F5 và bấm Nộp bài lại mà không mất đáp án.');
      else if (msg.includes('fetch') || msg.includes('network')) toast.error('📶 Mất kết nối — Bài làm vẫn được lưu nháp. Hãy kiểm tra WiFi.');
      else toast.error('❌ Lỗi không xác định khi nộp bài.');
      throw e; // Để component bắt và reset UI spinner
    } finally {
      set({ isAnalyzing: false });
    }
  },

  handleAdaptiveTestFix: async () => {
    // Tạm thời đặt logic cơ bản, có thể move vào examService sau
    console.log('handleAdaptiveTestFix gọi!');
  }
}));
