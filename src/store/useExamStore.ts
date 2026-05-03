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
        return false;
      }

      set({
        activeTest: { topic: session.topic, questions: session.questions, examId: session.examId },
        answers: session.answers || {},
        currentQuestionIndex: session.currentQuestionIndex || 0,
        results: null,
        lastSavedAt: session.savedAt,
      });
      console.info(`[Session] Đã khôi phục phiên thi: ${session.topic} — ${session.questions.length} câu`);
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
    get().saveExamSession();
  },

  // ═══════════════════════════════════════════════════════════════════
  //  SUBMIT EXAM — Fire-and-Forget Architecture
  //  Học sinh thấy điểm NGAY, AI chẩn đoán chạy ngầm sau đó
  // ═══════════════════════════════════════════════════════════════════
  submitExam: async () => {
    const { activeTest, answers } = get();
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

      // BƯỚC 1: Tính điểm ngay lập tức
      const evaluation = examService.evaluateAnswers(activeTest.questions, answers, gradeNumber);
      const wrongCount = evaluation.incorrectRecords.length;

      // BƯỚC 2: FallbackProfile dựa trên điểm THỰC TẾ (không dùng message cũ "AI quá tải")
      const overallLevel = evaluation.totalScore >= 9.0 ? 'S'
        : evaluation.totalScore >= 8.0 ? 'A'
        : evaluation.totalScore >= 5.0 ? 'B' : 'C';

      const fallbackProfile = {
        grade: gradeNumber,
        overallLevel: overallLevel as 'S' | 'A' | 'B' | 'C',
        behavioralNote: wrongCount === 0
          ? 'Xuất sắc! Không phát hiện lỗ hổng kiến thức nào.'
          : `Đã ghi nhận ${wrongCount} câu sai. Hệ thống đang phân tích lộ trình cá nhân hóa — kết quả chi tiết sẽ cập nhật sau.`,
        items: [],
        strengths: evaluation.totalScore >= 5.0 ? ['Hoàn thành bài kiểm tra'] : [],
        actionPlan: wrongCount > 0
          ? ['Ôn lại các câu đã làm sai trong bài thi', 'Tiếp tục luyện tập các đề thi tiếp theo']
          : ['Tiếp tục duy trì phong độ xuất sắc'],
        remedialMatrix: []
      };

      // BƯỚC 3: Lưu attempt NGAY với fallbackProfile (không chờ AI)
      const attempt: any = {
        id: Math.random().toString(36).substr(2, 9),
        userId: user.uid,
        testId: activeTest.topic,
        examId: (activeTest as any).examId || undefined,
        answers,
        score: evaluation.totalScore,
        analysis: null,
        weaknessProfile: fallbackProfile,
        timestamp: Timestamp.now()
      };

      const attemptDocRef = await examService.saveAttempt(attempt);

      // BƯỚC 4: Cập nhật User Profile (XP, Rank, Streak) — không phụ thuộc AI
      const { updatedUser, earnedXP, xpBreakdown, isRankUp } = await examService.updateUserProfile(
        user, activeTest, evaluation.totalScore, evaluation.newFailedQuestionIds, null
      );

      authState.setUser(updatedUser);
      if (isRankUp) useAppStore.getState().setShowConfetti(true);

      // BƯỚC 5: SM-2 & Topic Progress (background)
      examService.triggerBackgroundTasks(
        user.uid, evaluation.sm2Evaluations, evaluation.scoredQuestions,
        evaluation.totalScore, evaluation.correctQuestionIds
      );

      // BƯỚC 6: Hiển thị kết quả NGAY — không cần chờ AI
      set({
        submissionResult: { score: evaluation.totalScore, earnedXP, show: true, xpBreakdown },
        results: attempt
      });
      get().clearExamSession(user.uid);
      useAppStore.getState().setShowVirtualLab(false);

      // BƯỚC 7: FIRE-AND-FORGET — AI chạy ngầm sau khi HS đã thấy điểm
      if (wrongCount > 0 || evaluation.skippedRecords.length > 0) {
        examService.runDiagnosisInBackground(
          attemptDocRef,
          evaluation.incorrectRecords,
          evaluation.skippedRecords,
          gradeNumber,
          user.learningPath?.weaknessProfile
        ).catch((e: any) => console.error('[Background AI Diag] Failed silently:', e));
      }

    } catch (e: any) {
      console.error('[submitExam] Lỗi nộp bài:', e);
      const msg = String(e?.message || e || '');
      if (msg.includes('Timeout')) toast.error('Mạng chậm — Đã lưu bài cục bộ. Em có thể F5 và bấm Nộp bài lại mà không mất đáp án.');
      else if (msg.includes('fetch') || msg.includes('network')) toast.error('Mất kết nối — Bài làm vẫn được lưu nháp. Hãy kiểm tra WiFi.');
      else toast.error('Lỗi không xác định khi nộp bài.');
      throw e;
    } finally {
      set({ isAnalyzing: false });
    }
  },

  handleAdaptiveTestFix: async () => {
    console.log('handleAdaptiveTestFix gọi!');
  }
}));
