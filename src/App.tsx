// ═══════════════════════════════════════════════════════════════════════
//  App.tsx — PURE ROUTING & ORCHESTRATION (Post-Refactor)
//  Tất cả UI components đã được tách ra /components & /layouts
//  File này CHỉ chứa: State, Auth, Effects, Routing Logic
// ═══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import MathRenderer from './lib/MathRenderer';
import {
  auth, db, collection, doc, addDoc, getDocs, getDoc,
  setDoc, updateDoc, onSnapshot, query, where, Timestamp,
  signInWithGoogle, signOut, startExamAttempt, consumePdfDownloadAttempts
} from './firebase';
import { useAuthStore } from './store/useAuthStore';
import {
  UserProfile, Question, Attempt, Topic, Exam, Simulation,
  Badge, AppNotification, LoginLog
} from './types';
import type { SidebarTab, TargetGroup, Part } from './types';
import { diagnoseUserExam } from './services/geminiService';

import { getCurrentRank } from './services/RankSystem';
import { calculateAdaptiveXP } from './services/AdaptiveEngine';
import type { AdaptiveExamType } from './services/AdaptiveEngine.types';
import { refreshTopicProgress, popResolvedFailures } from './services/profileUpdater';
import type { ScoredQuestion } from './services/profileUpdater';
import { useDashboardStats } from './hooks/useDashboardStats';
import { syncMemoryLogs } from './utils/spacedRepetition';
import { PHYSICS_TOPICS } from './utils/physicsTopics';
import { jsPDF } from 'jspdf';
import { exportExamToWord } from './services/ExamWordExporter';
import { robotoBase64 } from './utils/robotoFont';

// ── Layout ──
import Sidebar from './components/Sidebar';
import { NotificationCenter } from './components/NotificationCenter';
import { AppFooter } from './layouts/AppFooter';

// ── Common UI ──
import { PrescriptionCard, SmartResourceCard } from './components/common';
import LoadingSpinner from './components/LoadingSpinner';
import { ConfettiCelebration } from './components/ConfettiCelebration';
import { SimulationModal } from './components/SimulationModal';
import { UpgradeModal } from './components/UpgradeModal';
import { AuthErrorBoundary } from './components/AuthErrorBoundary';
import { PerformanceChart } from './components/charts/PerformanceChart';
import { TopicCard } from './components/TopicCard';
import { SkeletonNumber } from './components/SkeletonLoader';
import { ToastProvider, toast } from './components/Toast';

import { ProExamExperience } from './components/ProExamExperience';
import StudentDashboard from './components/StudentDashboard';
import { PersonalizedResultPanel } from './components/PersonalizedResultPanel';
import { StudentOnboardingModal } from './components/StudentOnboardingModal';
import DigitizationDashboard from './components/DigitizationDashboard';
import QuestionBank from './components/QuestionBank';
import ExamGenerator from './components/ExamGenerator';
import { DuplicateReviewHubWrapper } from './components/DuplicateReviewHubWrapper';
import { ReviewExam } from './components/ReviewExam';
import { ProExamExperience } from './components/ProExamExperience';
import { HistoryDashboard } from './components/HistoryDashboard';
import { InvitePage } from './components/InvitePage';

// ── Lazy-loaded Admin Modules ──
const ExamMatrixGenerator = lazy(() => import('./components/ExamMatrixGenerator'));
const SimulationAdminBoard = lazy(() => import('./components/SimulationLab').then(m => ({ default: m.default })));
const DataSanitizer = lazy(() => import('./components/DataSanitizer'));
const ReportHub = lazy(() => import('./components/ReportHub'));
const ClassManager = lazy(() => import('./components/ClassManager'));
const StudentDirectory = lazy(() => import('./components/StudentDirectory'));
const ExamLibrary = lazy(() => import('./components/ExamLibrary'));
const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));
const LiveClassExam = lazy(() => import('./components/LiveClassExam'));
const Grade10Dashboard = lazy(() => import('./components/Grade10Dashboard'));
const Grade11Dashboard = lazy(() => import('./components/Grade11Dashboard'));
const Grade12Dashboard = lazy(() => import('./components/Grade12Dashboard'));
const DatabaseMigrationTool = lazy(() => import('./components/DatabaseMigrationTool'));
const ScoreRecalibrationTool = lazy(() => import('./components/ScoreRecalibrationTool'));
const AdaptiveDashboard = lazy(() => import('./components/AdaptiveDashboard'));
const ProjectorLeaderboard = lazy(() => import('./components/ProjectorLeaderboard'));
const SimulationViewer: React.FC<{ simulation: Simulation, onClose: () => void }> = lazy(() => import('./components/SimulationLab').then(m => ({ default: (m as any).SimulationViewer || m.default }))) as any;
const AICampaignManager = lazy(() => import('./components/AICampaignManager'));
const YCCDAutoTagger = lazy(() => import('./components/YCCDAutoTagger'));
const StudentViewSimulator = lazy(() => import('./components/StudentViewSimulator'));
const AIChatLogsDashboard = lazy(() => import('./components/AIChatLogsDashboard'));

// ── Mindmap Module ──
const MindmapViewer = lazy(() => import('./modules/mindmap/MindmapContainer'));
const MindmapAdminPanel = lazy(() => import('./modules/mindmap/MindmapAdminPanel'));

// ── Non-lazy (small component) ──
import { ExamResultGamification } from './components/ExamResultGamification';
import { ResetNoticeModal } from './components/ResetNoticeModal';

// ── Icons ──
import {
  LogOut, BrainCircuit, Target, Activity, Settings, Play, BookOpen,
  FlaskConical, Trophy, CheckCircle2, AlertTriangle, Star, ArrowRight,
  Info, Save, History, Beaker, ShieldAlert, ArrowLeftRight, Flag, BarChart3, Send
} from 'lucide-react';

// ── Stale Chunk Error Boundary ──────────────────────────────────────────────
// Khi Vercel deploy mới, file JS cũ bị xóa → browser gặp lỗi "Failed to fetch
// dynamically imported module". ErrorBoundary này tự reload trang để lấy chunk mới.
class StaleChunkBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    // Chỉ bắt lỗi dynamic import (stale chunk sau deploy)
    const msg = String(error?.message || '');
    if (msg.includes('Failed to fetch') || msg.includes('dynamically imported') || msg.includes('Loading chunk')) {
      return { hasError: true };
    }
    return null;
  }
  componentDidCatch(error: any) {
    const msg = String(error?.message || '');
    if (msg.includes('Failed to fetch') || msg.includes('dynamically imported') || msg.includes('Loading chunk')) {
      // Reload trang để browser tải chunk mới từ Vercel
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Đang tải bản cập nhật mới nhất...</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  LAZY WRAPPER
// ═══════════════════════════════════════════════════════════════════════
const LazyWrap = ({ children }: { children: React.ReactNode }) => (
  <StaleChunkBoundary>
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      {children}
    </Suspense>
  </StaleChunkBoundary>
);

const GUEST_USER: UserProfile = {
  uid: 'guest',
  email: '',
  displayName: 'Khách Tham Quan',
  role: 'student',
  targetGroup: 'Chống Sai Ngu',
  createdAt: Timestamp.now(),
  lastActive: Timestamp.now(),
  streak: 0,
  lastStreakDate: '',
  usedAttempts: 0,
  maxAttempts: 0,
  tier: 'free',
  className: '12A1',
  learningPath: { completedTopics: [], topicProgress: {}, overallProgress: 0, weaknesses: [] },
  badges: [],
  notifications: []
};

// ═══════════════════════════════════════════════════════════════════════
//  MAIN APP — ORCHESTRATION ONLY
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const authStore = useAuthStore();
  const authUser = authStore.user;
  const user = authUser || GUEST_USER;
  const isAuthInitializing = authStore.loading;
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [confirmPdfExam, setConfirmPdfExam] = useState<Exam | null>(null);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const ADMIN_TABS = ['Digitize', 'Bank', 'Matrix', 'Generator', 'SimLab', 'MindmapAdmin', 'Duplicates', 'Sanitizer', 'Reports', 'Classroom', 'Directory', 'Library', 'Tracking', 'Campaign', 'YCCD', 'Migration', 'AIChats', 'RecalibScore'] as const;
  const [adminTab, setAdminTab] = useState<'Digitize' | 'Bank' | 'Matrix' | 'Generator' | 'SimLab' | 'MindmapAdmin' | 'Duplicates' | 'Sanitizer' | 'Reports' | 'Classroom' | 'Directory' | 'Library' | 'Tracking' | 'Campaign' | 'YCCD' | 'Migration' | 'AIChats' | 'RecalibScore'>('Digitize');
  const [activeView, setActiveView] = useState<SidebarTab>('dashboard');

  // ── Magic Link: đọc ?invite=<token> từ URL khi app khởi động ──
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('invite') || null;
  });

  // ── Direct Exam Link: đọc ?examId=<id> từ URL ──
  const [directExamId, setDirectExamId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('examId') || null;
  });

  // ── Unified navigation handler: student tabs vs admin tabs ──
  const handleSidebarNavigate = (tab: SidebarTab) => {
    setActiveView(tab);
    if ((ADMIN_TABS as readonly string[]).includes(tab)) {
      setAdminTab(tab as any);
    }
    if (activeTest && !results) {
      // Đang làm bài → không cho chuyển
    }
  };

  const [activeTest, setActiveTest] = useState<{ topic: Topic, questions: Question[], examId?: string } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [results, setResults] = useState<Attempt | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{ score: number; earnedXP: number; show: boolean; xpBreakdown?: import('./services/AdaptiveEngine.types').IXPBreakdown } | null>(null);
  const attempts = authStore.attempts;

  // Khi đang thi (activeTest có nhưng chưa nộp, hoặc đang xem lại bài làm), giao diện phải là Fullscreen Zen Mode.
  const isFullScreenMode = Boolean(activeTest && (!results || isReviewing));

  // ═══ [SESSION PERSISTENCE] Lưu & khôi phục phiên thi khi bị văng ra ═══
  const SESSION_KEY = 'phys8_active_exam_session';

  useEffect(() => {
    if (activeTest && !results) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          topic: activeTest.topic,
          questions: activeTest.questions,
          examId: activeTest.examId,
          answers,
          currentQuestionIndex,
          savedAt: Date.now(),
        }));
      } catch (e) {
        console.warn('[Session] Không thể lưu phiên thi:', e);
      }
    }
  }, [activeTest, answers, currentQuestionIndex, results]);

  const clearExamSession = () => {
    localStorage.removeItem(SESSION_KEY);
    if (auth.currentUser?.uid && activeTest?.topic) {
      localStorage.removeItem(`exam_draft_${auth.currentUser.uid}_${activeTest.topic}`);
    }
  };

  const restoreExamSession = () => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (!saved) return false;
      const session = JSON.parse(saved);
      if (!session.questions || !Array.isArray(session.questions) || session.questions.length === 0) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }
      const elapsed = Date.now() - (session.savedAt || 0);
      if (elapsed > 2 * 60 * 60 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }
      setActiveTest({ topic: session.topic, questions: session.questions, examId: session.examId });
      setAnswers(session.answers || {});
      setCurrentQuestionIndex(session.currentQuestionIndex || 0);
      setResults(null);
      console.info(`[Session] ✅ Đã khôi phục phiên thi: ${session.topic} — ${session.questions.length} câu`);
      return true;
    } catch (e) {
      console.warn('[Session] Lỗi khôi phục phiên thi:', e);
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
  };

  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [activeSimulationViewer, setActiveSimulationViewer] = useState<Simulation | null>(null);
  const [showVirtualLab, setShowVirtualLab] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeSimulation, setActiveSimulation] = useState<{ title: string, description: string, url: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isStartingExam, setIsStartingExam] = useState(false); // [FIX] Guard chống click nhiều lần
  const [loading, setLoading] = useState(false); // Spinner khi tạo đề / load review

  // Auto collapse sidebar when reviewing exam or running a test
  useEffect(() => {
    if (activeTest || isReviewing) {
      setIsSidebarCollapsed(true);
    } else {
      setIsSidebarCollapsed(false);
    }
  }, [activeTest, isReviewing]);

  // Safe sign-in handler with error feedback
  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        setAuthError(`Tên miền ${domain} chưa được cấp phép. Thầy vào Firebase Console → Authentication → Settings → Authorized domains và thêm "${domain}" để đăng nhập.`);
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Popup bị chặn — đang chuyển sang đăng nhập Redirect. Vui lòng đợi...');
      } else if (code === 'auth/popup-closed-by-user') {
        // User closed popup intentionally - not an error
      } else {
        setAuthError(`Đăng nhập thất bại: ${err?.message || 'Lỗi không xác định'}`);
      }
    }
  };

  // Fetch Simulations
  useEffect(() => {
    if (!authUser || activeView !== 'simulations') return;
    const fetchSims = async () => {
      try {
        const snap = await getDocs(collection(db, 'simulations'));
        const simsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Simulation));
        setSimulations(simsData.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
      } catch (error) {
        console.error("Lỗi khi load simulations:", error);
      }
    };
    fetchSims();
  }, [authUser, activeView]);

  // ═══ ONE-TIME MIGRATION: Gán status='published' cho câu hỏi cũ chưa có status ═══
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const MIGRATION_KEY = 'phy8_status_migration_v1';
    if (localStorage.getItem(MIGRATION_KEY)) return;

    const migrate = async () => {
      try {
        const snap = await getDocs(collection(db, 'questions'));
        let count = 0;
        for (const d of snap.docs) {
          const data = d.data();
          if (!data.status) {
            await updateDoc(doc(db, 'questions', d.id), { status: 'published' });
            count++;
          }
        }
        if (count > 0) {
          console.info(`[Migration] ✅ Đã gán status='published' cho ${count} câu hỏi cũ.`);
        }
        localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
      } catch (e) {
        console.warn('[Migration] Lỗi:', e);
      }
    };
    migrate();
  }, [user]);

  // ═══ AUTH LISTENER — Chạy từ useAuthStore.initializeAuth() (single source of truth) ═══
  useEffect(() => {
    const cleanup = useAuthStore.getState().initializeAuth();
    return cleanup;
  }, []);

  const markNotificationAsRead = async (id: string) => {
    if (!user) return;
    const updatedNotifications = user.notifications?.map(n => n.id === id ? { ...n, read: true } : n);
    await setDoc(doc(db, 'users', user.uid), { notifications: updatedNotifications }, { merge: true });
    authStore.setUser({ ...user, notifications: updatedNotifications });
  };

  // ═══ PDF EXPORT ═══
  const exportExamToPDF = async (exam: Exam) => {
    const pdfDoc = new jsPDF();
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();
    const marginBottom = 20;

    pdfDoc.setFontSize(10);
    pdfDoc.text("SỞ GIÁO DỤC VÀ ĐÀO TẠO", 20, 20);
    pdfDoc.text("TRƯỜNG THPT CHUYÊN PHYS-9+", 20, 25);
    pdfDoc.text("ĐỀ THI CHÍNH THỨC", 20, 30);
    pdfDoc.setFontSize(12);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.text("KỲ THI TỐT NGHIỆP TRUNG HỌC PHỔ THÔNG NĂM 2026", pageWidth / 2, 45, { align: "center" });
    pdfDoc.text(`Bài thi: VẬT LÝ - Mã đề: ${Math.floor(Math.random() * 900) + 100}`, pageWidth / 2, 52, { align: "center" });
    pdfDoc.setFontSize(10);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.text("Thời gian làm bài: 50 phút, không kể thời gian phát đề", pageWidth / 2, 58, { align: "center" });
    pdfDoc.line(20, 65, pageWidth - 20, 65);

    let y = 75;

    const estimateQuestionHeight = (q: Question, label: string): number => {
      const contentLines = pdfDoc.splitTextToSize(`${label}: ${q.content.replace(/\$|\$\$/g, '')}`, pageWidth - 40);
      let h = contentLines.length * 5 + 5;
      if (q.options) {
        h += (q.part === 1 ? Math.ceil(q.options.length / 2) : q.options.length) * 7 + 5;
      }
      return h;
    };

    const renderQuestion = (q: Question, label: string, currentY: number): number => {
      const contentLines = pdfDoc.splitTextToSize(`${label}: ${q.content.replace(/\$|\$\$/g, '')}`, pageWidth - 40);
      pdfDoc.text(contentLines, 20, currentY);
      currentY += contentLines.length * 5 + 5;
      if (q.part === 1) {
        q.options?.forEach((opt, idx) => {
          pdfDoc.text(String.fromCharCode(65 + idx) + ". " + opt.replace(/\$|\$\$/g, ''), 30 + (idx % 2 === 0 ? 0 : 80), currentY);
          if (idx % 2 === 1) currentY += 7;
        });
        currentY += 5;
      } else if (q.part === 2) {
        q.options?.forEach((opt, idx) => {
          pdfDoc.text(String.fromCharCode(97 + idx) + ") " + opt.replace(/\$|\$\$/g, ''), 30, currentY);
          currentY += 7;
        });
        currentY += 5;
      }
      return currentY;
    };

    const buildBlocks = (questions: Question[]): (Question | Question[])[] => {
      const blocks: (Question | Question[])[] = [];
      const processed = new Set<string>();
      for (const q of questions) {
        if (q.clusterId) {
          if (processed.has(q.clusterId)) continue;
          processed.add(q.clusterId);
          blocks.push(questions.filter(cq => cq.clusterId === q.clusterId).sort((a, b) => (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0)));
        } else {
          blocks.push(q);
        }
      }
      return blocks;
    };

    const renderPart = (partTitle: string, questions: Question[], startIdx: number): number => {
      y += 10;
      if (y > pageHeight - marginBottom) { pdfDoc.addPage(); y = 20; }
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.text(partTitle, 20, y);
      y += 10;
      pdfDoc.setFont("helvetica", "normal");

      const blocks = buildBlocks(questions);
      let qCounter = startIdx;

      for (const block of blocks) {
        if (Array.isArray(block)) {
          const clusterTag = block[0]?.tags?.find((t: string) => t.startsWith('__cluster_context:'));
          const sharedCtx = clusterTag?.replace('__cluster_context:', '');

          let totalHeight = 0;
          if (sharedCtx) {
            const ctxText = sharedCtx.replace(/\$|\$\$/g, '').replace(/<[^>]*>/g, '');
            totalHeight += pdfDoc.splitTextToSize(`[Dữ kiện chung] ${ctxText}`, pageWidth - 50).length * 5 + 8;
          }
          for (let ci = 0; ci < block.length; ci++) {
            totalHeight += estimateQuestionHeight(block[ci], `Câu ${qCounter + ci + 1}`);
          }

          if (y + totalHeight > pageHeight - marginBottom && y > 40) {
            pdfDoc.addPage();
            y = 20;
          }

          if (sharedCtx) {
            pdfDoc.setFont("helvetica", "italic");
            const ctxText = sharedCtx.replace(/\$|\$\$/g, '').replace(/<[^>]*>/g, '');
            const ctxLines = pdfDoc.splitTextToSize(`[Dữ kiện chung] ${ctxText}`, pageWidth - 50);
            pdfDoc.text(ctxLines, 25, y);
            y += ctxLines.length * 5 + 5;
            pdfDoc.setFont("helvetica", "normal");
          }

          for (const cq of block) {
            qCounter++;
            y = renderQuestion(cq, `Câu ${qCounter}`, y);
          }
        } else {
          qCounter++;
          if (y > pageHeight - marginBottom) { pdfDoc.addPage(); y = 20; }
          y = renderQuestion(block, `Câu ${qCounter}`, y);
        }
      }
      return qCounter;
    };

    let idx = 0;
    idx = renderPart("PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.", exam.questions.filter(q => q.part === 1), idx);
    idx = renderPart("PHẦN II. Câu trắc nghiệm Đúng/Sai.", exam.questions.filter(q => q.part === 2), idx);
    renderPart("PHẦN III. Câu trắc nghiệm trả lời ngắn.", exam.questions.filter(q => q.part === 3), idx);

    // Normalize: bo dau tieng Viet -> ASCII de browser nhan dung filename (jsPDF khong ho tro Unicode filename)
    const normalizeVN = (str: string) => str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd').replace(/\u0110/g, 'D')
      .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const safeTitle = normalizeVN(exam.title || 'De_Thi') || 'De_Thi';
    pdfDoc.save(`${safeTitle}.pdf`);
  };

  // ═══ STUDENT PDF EXPORT (Trừ 5 lượt) ═══
  const handleStudentDownloadPDF = async (exam: Exam) => {
    if (!user || user === GUEST_USER) {
      toast.error('Bạn cần đăng nhập để tải đề.');
      return;
    }
    setConfirmPdfExam(exam); // Mở modal xác nhận
  };

  const executePdfDownload = async () => {
    if (!confirmPdfExam || !user) return;
    const examToDownload = confirmPdfExam;
    setConfirmPdfExam(null); // Đóng modal ngay
    setIsPdfDownloading(true);

    try {
      toast.info('Đang xử lý tải PDF...');
      const success = await consumePdfDownloadAttempts(user.uid, examToDownload.id);
      if (success) {
        exportExamToPDF(examToDownload);
        toast.success('Đã tải PDF và trừ 5 lượt thành công!');
      }
    } catch (err: any) {
      if (err.message === "EXCEEDED_LIMIT") {
        setShowUpgradeModal(true);
      } else {
        toast.error(`Lỗi tải đề: ${err.message}`);
      }
    } finally {
      setIsPdfDownloading(false);
    }
  };

  // ═══ WORD EXPORT (GV/Admin only) ═══
  const handleExportWord = async (exam: Exam, mode: 'student' | 'teacher') => {
    try {
      await exportExamToWord(exam, mode);
    } catch (err) {
      console.error('[WordExport] Lỗi xuất Word:', err);
      toast.error('Xuất Word thất bại. Vui lòng thử lại.');
    }
  };

  // ═══ START TEST ═══
  const startTest = async (topic: Topic, examId?: string) => {
    if (!authUser) { handleSignIn(); return; }
    // [FIX] Guard chống click nhiều lần: nếu đang trong quá trình khởi tạo bài thì bỏ qua
    if (isStartingExam) return;
    setIsStartingExam(true);

    // --- BẮT ĐẦU TRỪ LƯỢT FREE ---
    try {
      const isAdmin = user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com';
      await startExamAttempt(user.uid, examId || topic, isAdmin);
    } catch (err: any) {
      if (err.message === "EXCEEDED_LIMIT") {
        // ✅ Đúng flow: hết 30 lượt → hiện modal Zalo liên hệ thầy Hậu
        setShowUpgradeModal(true);
        setIsStartingExam(false);
        return;
      }
      // Các lỗi khác (mạng, Firebase quota...) → KHÔNG block HS, chỉ log cảnh báo
      // firebase.ts đã xử lý permission-denied bằng graceful return true
      // Nếu vẫn throw tới đây thì đây là lỗi bất thường, vẫn cho vào bài
      console.warn('[startTest] Lỗi không xác định từ startExamAttempt, cho HS vào bài:', err.message);
    }
    // ---------------------------------

    setLoading(true);

    try {

      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession && !examId) {
        try {
          const session = JSON.parse(savedSession);
          const elapsed = Date.now() - (session.savedAt || 0);
          if (session.topic === topic && session.questions?.length > 0 && elapsed < 2 * 60 * 60 * 1000) {
            setActiveTest({ topic: session.topic, questions: session.questions, examId: session.examId });
            setAnswers(session.answers || {});
            setCurrentQuestionIndex(session.currentQuestionIndex || 0);
            setResults(null);
            setLoading(false);
            return;
          }
        } catch (e) { console.warn('[startTest] Lỗi đọc session cũ, tạo đề mới:', e); }
      }

      if (examId) {
        const examDoc = await getDoc(doc(db, 'exams', examId));
        if (examDoc.exists()) {
          const examData = examDoc.data() as Exam;
          if (!examData.questions || examData.questions.length === 0) {
            toast.error("Đề thi này hiện chưa có câu hỏi nào. Bạn vui lòng chọn đề khác.");
            setLoading(false);
            return;
          }

          const publishedQuestions = examData.questions.filter(q => (q.status || 'published') === 'published');

          if (publishedQuestions.length === 0) {
            toast.error("Đề thi này chưa có câu hỏi nào được duyệt. Bạn vui lòng chọn đề khác.");
            setLoading(false);
            return;
          }

          setActiveTest({ topic: publishedQuestions[0]?.topic || examData.title || topic, questions: publishedQuestions, examId: examDoc.id });
          setCurrentQuestionIndex(0);
          setAnswers({});
          setResults(null);
          setLoading(false);
          return;
        }
      }

      const qRef = collection(db, 'questions');
      let snapshot;
      if (topic === 'THPT') {
        const qQuery = query(qRef, where('topic', 'in', ['Vật lí nhiệt', 'Khí lí tưởng', 'Từ trường', 'Vật lí hạt nhân']));
        snapshot = await getDocs(qQuery);
      } else {
        const qQuery = query(qRef, where('topic', '==', topic));
        snapshot = await getDocs(qQuery);
      }

      let allQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)).filter(q => q.status === 'published');

      const shuffle = (array: any[]) => array.sort(() => Math.random() - 0.5);

      const categorize = (qs: Question[]) => {
        const buckets: Record<number, { NB: Question[], TH: Question[], VD: Question[] }> = {
          1: { NB: [], TH: [], VD: [] },
          2: { NB: [], TH: [], VD: [] },
          3: { NB: [], TH: [], VD: [] },
        };
        qs.forEach(q => {
          if (!buckets[q.part]) return;
          const lvl = q.level || 'Nhận biết';
          let cat: 'NB' | 'TH' | 'VD' = 'VD';
          if (lvl.includes('Nhận biết')) cat = 'NB';
          else if (lvl.includes('Thông hiểu')) cat = 'TH';
          buckets[q.part][cat].push(q);
        });
        return buckets;
      };

      const buckets = categorize(shuffle(allQuestions));

      const pick = (part: 1 | 2 | 3, expectedNb: number, expectedTh: number, expectedVd: number, total: number) => {
        const result: Question[] = [];
        const take = (cat: 'NB' | 'TH' | 'VD', count: number) => {
          const taken = buckets[part][cat].splice(0, count);
          result.push(...taken);
        };
        take('NB', expectedNb);
        take('TH', expectedTh);
        take('VD', expectedVd);
        const remainingInPart = [...buckets[part].NB, ...buckets[part].TH, ...buckets[part].VD];
        shuffle(remainingInPart);
        const needed = total - result.length;
        if (needed > 0 && remainingInPart.length > 0) {
          result.push(...remainingInPart.splice(0, Math.min(needed, remainingInPart.length)));
        }
        return result;
      };

      const p1 = pick(1, 7, 6, 5, 18);
      const p2 = pick(2, 2, 1, 1, 4);
      const p3 = pick(3, 2, 1, 3, 6);

      let finalQuestions = [...p1, ...p2, ...p3];

      // ═══ [CLUSTER] Đảm bảo câu chùm luôn đi cùng nhau ═══
      const selectedClusterIds = new Set<string>();
      for (const q of finalQuestions) {
        if (q.clusterId) selectedClusterIds.add(q.clusterId);
      }
      if (selectedClusterIds.size > 0) {
        for (const cid of selectedClusterIds) {
          const siblings = allQuestions.filter(q => q.clusterId === cid && !finalQuestions.find(fq => fq.id === q.id));
          if (siblings.length > 0) finalQuestions.push(...siblings);
        }
        for (const cid of selectedClusterIds) {
          try {
            const clusterSnap = await getDoc(doc(db, 'clusters', cid));
            if (clusterSnap.exists()) {
              const cd = clusterSnap.data();
              const firstQ = finalQuestions.find(q => q.clusterId === cid && (q.clusterOrder ?? 0) === 0);
              if (firstQ && cd.sharedContext && !firstQ.tags?.some((t: string) => t.startsWith('__cluster_context:'))) {
                firstQ.tags = [...(firstQ.tags || []), `__cluster_context:${cd.sharedContext}`];
              }
            }
          } catch (err) { console.warn(`[startTest] Cluster ${cid}:`, err); }
        }
      }

      // ═══ BLOCK-SHUFFLE ═══
      const blockShuffle = (questions: Question[]): Question[] => {
        const clusterMap = new Map<string, Question[]>();
        const standalones: Question[] = [];
        for (const q of questions) {
          if (q.clusterId) {
            if (!clusterMap.has(q.clusterId)) clusterMap.set(q.clusterId, []);
            clusterMap.get(q.clusterId)!.push(q);
          } else {
            standalones.push(q);
          }
        }
        for (const [, group] of clusterMap) {
          group.sort((a, b) => (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0));
        }
        const blocks: (Question | Question[])[] = [
          ...standalones,
          ...Array.from(clusterMap.values())
        ];
        blocks.sort(() => Math.random() - 0.5);
        return blocks.flatMap(b => Array.isArray(b) ? b : [b]);
      };

      const part1Qs = finalQuestions.filter(q => q.part === 1);
      const part2Qs = finalQuestions.filter(q => q.part === 2);
      const part3Qs = finalQuestions.filter(q => q.part === 3);
      finalQuestions = [...blockShuffle(part1Qs), ...blockShuffle(part2Qs), ...blockShuffle(part3Qs)];

      if (finalQuestions.length === 0) {
        finalQuestions = [
          { id: 'q1', part: 1, topic, level: 'Thông hiểu', content: 'Trong quá trình đẳng nhiệt của một lượng khí lí tưởng nhất định, nếu áp suất tăng lên 2 lần thì thể tích của khối khí sẽ:', options: ['Tăng 2 lần', 'Giảm 2 lần', 'Tăng 4 lần', 'Không đổi'], correctAnswer: 1, explanation: 'Theo định luật Boyle: $pV = const$. Nếu $p$ tăng 2 thì $V$ giảm 2.' },
          { id: 'q2', part: 2, topic, level: 'Vận dụng', content: 'Xét một khối khí lí tưởng thực hiện chu trình biến đổi trạng thái. Các phát biểu sau đây đúng hay sai?', options: ['a) Trong quá trình đẳng tích, độ biến thiên nội năng bằng nhiệt lượng mà khí nhận được.', 'b) Trong quá trình đẳng áp, công mà khí thực hiện tỉ lệ thuận với độ biến thiên nhiệt độ.', 'c) Trong quá trình đẳng nhiệt, khí không trao đổi nhiệt với môi trường.', 'd) Một chu trình kín luôn có tổng công thực hiện bằng 0.'], correctAnswer: [true, true, false, false], explanation: 'a) Đúng ($Q = \\\\Delta U + A, A=0$). b) Đúng ($A = p\\\\Delta V = nR\\\\Delta T$). c) Sai ($Q = A$). d) Sai ($A_{total} = \\\\text{Diện tích chu trình}$).' },
          { id: 'q3', part: 3, topic, level: 'Vận dụng cao', content: 'Một xi lanh chứa 0,1 mol khí lí tưởng ở áp suất $10^5$ Pa và nhiệt độ 27°C. Nén khí đẳng nhiệt đến áp suất $2.10^5$ Pa. Tính thể tích cuối cùng của khối khí theo đơn vị lít (L). Làm tròn đến 2 chữ số thập phân.', correctAnswer: 1.25, explanation: '$V_1 = \\\\frac{nRT}{p_1} = \\\\frac{0.1 \\\\cdot 8.31 \\\\cdot 300}{10^5} = 0.002493 \\\\text{ m}^3 = 2.493 \\\\text{ L}$. $V_2 = V_1 \\\\cdot \\\\frac{p_1}{p_2} = 2.493 / 2 = 1.2465 \\\\text{ L}$. Làm tròn -> 1.25 L.' }
        ];
      }

      setActiveTest({ topic, questions: finalQuestions });
      setCurrentQuestionIndex(0);
      setAnswers({});
      setResults(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setIsStartingExam(false); // [FIX] Luôn reset guard để HS có thể thử lại
    }
  };

  // ── Auto-start test for Direct Exam Link ──
  const hasTriggeredLogin = useRef(false);
  useEffect(() => {
    if (directExamId && !isAuthInitializing) {
      if (authUser) {
        startTest('Đề Thi Trực Tiếp', directExamId);
        setDirectExamId(null);
        // Clean URL
        const url = new URL(window.location.href);
        url.searchParams.delete('examId');
        window.history.replaceState({}, '', url.toString());
      } else {
        if (!hasTriggeredLogin.current) {
          hasTriggeredLogin.current = true;
          handleSignIn().finally(() => {
            // Cho phép thử lại nếu popup bị đóng mà chưa đăng nhập thành công
            setTimeout(() => {
              if (!auth.currentUser) hasTriggeredLogin.current = false;
            }, 1000);
          });
        }
      }
    }
  }, [directExamId, authUser, isAuthInitializing]);

  const handleAnswer = (questionId: string, answer: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  // ═══ SUBMIT TEST ═══
  const submitTest = async () => {
    if (!activeTest || !user) return;
    setIsAnalyzing(true);

    // ── Xác định khối lớp để áp dụng thang điểm phù hợp ──────────────
    // Lớp 12: Part 3 = 0.25đ/câu | Lớp 10-11: Part 3 = 0.5đ/câu
    const gradeNumber = parseInt(user.className?.replace(/\D/g, '') || '12');
    const part3ScorePerQuestion = gradeNumber <= 11 ? 0.5 : 0.25;

    let totalScore = 0;
    const normalizeDecimal = (v: any) => parseFloat(String(v ?? '0').replace(',', '.'));
    const newFailedQuestionIds = new Set(user.failedQuestionIds || []);
    const sm2Evaluations: { questionId: string; isCorrect: boolean; topic?: string }[] = [];
    const incorrectRecords: any[] = [];
    const skippedRecords: any[] = [];
    // ── Danh sách câu đã chấm — truyền cho profileUpdater ──
    const scoredQuestions: ScoredQuestion[] = [];
    // ── ID câu trả lời ĐÚNG trong lần này — để pop failedQuestionIds ──
    const correctQuestionIds: string[] = [];

    for (const q of activeTest.questions) {
      const studentAns = answers[q.id];
      let isCorrect = false;

      if (q.part === 1) {
        // Phần 1 — Trắc nghiệm 4 lựa chọn: 0.25đ/câu đúng
        isCorrect = studentAns === q.correctAnswer;
        if (isCorrect) totalScore += 0.25;
      } else if (q.part === 2) {
        // Phần 2 — Trắc nghiệm Đúng/Sai (theo quy định THPTQG 2025)
        // 4/4 ý đúng = 1.0đ | 3/4 = 0.5đ | 2/4 = 0.25đ | 1/4 = 0.1đ | 0/4 = 0đ
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
        // 0 ý đúng = 0đ
        isCorrect = correctSubCount === totalSubItems; // Chỉ "đúng" hoàn toàn mới tính pass SM-2
      } else if (q.part === 3) {
        // Phần 3 — Trả lời ngắn: Lớp 12 = 0.25đ/câu | Lớp 10-11 = 0.5đ/câu
        const studentVal = normalizeDecimal(studentAns);
        const correctVal = normalizeDecimal(q.correctAnswer);
        isCorrect = !isNaN(studentVal) && Math.abs(studentVal - correctVal) < 0.01;
        if (isCorrect) totalScore += part3ScorePerQuestion;
      }

      if (q.id) {
        sm2Evaluations.push({ questionId: q.id, isCorrect, topic: q.topic });
        // Ghi vào scoredQuestions cho profileUpdater
        scoredQuestions.push({ questionId: q.id, topic: q.topic ?? '', isCorrect });
        if (!isCorrect) {
          newFailedQuestionIds.add(q.id);
          const isSkipped = studentAns === undefined || studentAns === '' || (Array.isArray(studentAns) && studentAns.length === 0);
          if (isSkipped) {
            skippedRecords.push({ question: q, studentAnswer: studentAns, isCorrect: false });
          } else {
            incorrectRecords.push({ question: q, studentAnswer: studentAns, isCorrect: false });
          }
        } else {
          newFailedQuestionIds.delete(q.id);
          correctQuestionIds.push(q.id); // Gom ID đã đúng để pop
        }
      }
    }

    // ── GỌI AI CHẨN ĐOÁN với timeout 10s ──────────────────────────────
    // Promise.race đảm bảo: dù Gemini chậm hay lỗi mạng → addDoc vẫn chạy
    // HS không bao giờ mất bài vì AI timeout.
    // gradeNumber đã được tính ở trên (phần tính điểm)
    const aiTimeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 10000));
    const aiResult = await Promise.race([
      diagnoseUserExam(incorrectRecords, skippedRecords, gradeNumber, user.learningPath?.weaknessProfile)
        .catch(() => null), // Nếu AI lỗi → trả null, không throw
      aiTimeout,
    ]);

    const attempt: Attempt = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.uid,
      testId: activeTest.topic,
      examId: (activeTest as any).examId || (activeTest as any).id || undefined, // [FIX] Lưu examId để review lịch sử
      answers,
      score: totalScore,
      analysis: aiResult ?? null,
      weaknessProfile: aiResult?.weaknessProfile ?? null, // [HOTFIX] aiResult có thể null khi AI timeout
      timestamp: Timestamp.now()
    };

    try {
      await addDoc(collection(db, 'attempts'), attempt);

      const updatedUser = { ...user };
      const newBadges: Badge[] = [...(user.badges || [])];
      const newNotifications: AppNotification[] = [...(user.notifications || [])];

      if (totalScore === 10.0 && !newBadges.find(b => b.id === `master_${activeTest.topic}`)) {
        newBadges.push({
          id: `master_${activeTest.topic}`,
          title: `Bậc thầy ${activeTest.topic}`,
          icon: 'Award',
          description: `Đạt điểm tuyệt đối chuyên đề ${activeTest.topic}.`,
          unlockedAt: Timestamp.now()
        });
      }

      updatedUser.badges = newBadges;
      updatedUser.notifications = newNotifications;
      updatedUser.failedQuestionIds = Array.from(newFailedQuestionIds);

      if (aiResult?.redZones && aiResult.redZones.length > 0) { // [HOTFIX] guard null
        updatedUser.redZones = Array.from(new Set([...(user.redZones || []), ...aiResult.redZones]));
      }

      if (user.prescriptions) {
        updatedUser.prescriptions = user.prescriptions.map(p => {
          if (p.status === 'pending' && p.title === activeTest.topic) {
            return { ...p, status: 'completed', completedAt: Timestamp.now(), score: totalScore };
          }
          return p;
        });
      }

      // ═══ GAMIFICATION: SPRINT 1 — Physics9+ Adaptive XP Engine ═══
      // CVE-1: weightFactor ngăn farm với đề ngắn
      // CVE-2: rankFloor — dưới ngưỡng nhận 0 XP
      // CVE-3: xpMultiplier phân biệt loại đề (STANDARD/REMEDIAL/...)
      // CVE-4: isFirstSubmitToday guard chặn streak spam
      // CVE-5: điều kiện >= 8.0 đã được fix trong engine

      const today = new Date().toISOString().slice(0, 10);
      const lastDate = user.lastStreakDate;

      // ─ Streak: giữ | +1 | reset ──────────────────────────────────
      let newStreak = 1;
      if (lastDate) {
        if (lastDate === today) {
          newStreak = user.streak || 1;
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().slice(0, 10);
          newStreak = lastDate === yesterdayStr ? (user.streak || 0) + 1 : 1;
        }
      }
      const isFirstSubmitToday = lastDate !== today; // CVE-4 guard

      // ─ Tính XP ───────────────────────────────────────────────────
      const examType: AdaptiveExamType =
        (activeTest as any).adaptiveConfig?.examType ?? 'STANDARD';

      const xpBreakdown = calculateAdaptiveXP(
        totalScore,
        activeTest.questions.length,
        getCurrentRank(user.stars ?? 0).id,
        examType,
        isFirstSubmitToday,
        user.streak ?? 0,
      );

      const earnedXP = xpBreakdown.finalXP;

      // ─ Áp dụng vào user ──────────────────────────────────────────
      const prevStars = user.stars ?? 0;
      const prevRank = getCurrentRank(prevStars);
      updatedUser.stars = prevStars + earnedXP + xpBreakdown.streakBonus;
      updatedUser.streak = newStreak;
      updatedUser.lastStreakDate = today;
      updatedUser.lastActive = Timestamp.now();

      // ─ Rank Up ───────────────────────────────────────────────────
      const newRank = getCurrentRank(updatedUser.stars);
      if (newRank.id > prevRank.id) {
        setShowConfetti(true);
        newNotifications.push({
          id: `rank_up_${Date.now()}`,
          title: `🎉 Thăng cấp ${newRank.icon} ${newRank.name}!`,
          message: `Chúc mừng! Bạn đã thăng lên ${newRank.name} với ${updatedUser.stars} ⭐ (+${earnedXP} XP${xpBreakdown.streakBonus > 0 ? ` + 🔥${xpBreakdown.streakBonus} streak` : ''})!`,
          type: 'success',
          read: false,
          timestamp: Timestamp.now(),
        });
        updatedUser.notifications = newNotifications;
      }

      await setDoc(doc(db, 'users', user.uid), updatedUser, { merge: true });
      authStore.setUser(updatedUser);

      // ── Chạy ngầm Thuật toán Siêu trí nhớ SM-2 bằng Batch Write ──
      syncMemoryLogs(user.uid, sm2Evaluations).catch(e => console.error("SM2 Sync failed", e));

      // ── Cập nhật topicProgress (correctCount/totalQuestions) và pop failedQuestionIds ──
      // Fire-and-forget: chạy ngầm, không block UI, không bao giờ crash luồng chính
      refreshTopicProgress(user.uid, scoredQuestions, totalScore)
        .catch(e => console.warn('[App] refreshTopicProgress:', e));
      popResolvedFailures(user.uid, correctQuestionIds)
        .catch(e => console.warn('[App] popResolvedFailures:', e));

      setSubmissionResult({ score: totalScore, earnedXP, show: true, xpBreakdown });
      setResults(attempt);
      clearExamSession();
      setShowVirtualLab(false);
    } catch (e: any) {
      console.error('[submitTest] Lỗi nộp bài:', e);
      const msg = String(e?.message || e || '');
      // [HOTFIX] Thông báo lỗi rõ ràng thay vì nuốt im lặng
      if (msg.includes('Timeout') || msg.includes('timeout')) {
        toast.error('⏱ Mạng chậm — Đã lưu bài cục bộ. Em có thể F5 và bấm Nộp bài lại mà không mất đáp án.');
      } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('offline')) {
        toast.error('📶 Mất kết nối — Bài làm vẫn được lưu nháp. Kiểm tra WiFi rồi bấm Nộp bài lại.');
      } else {
        toast.error('❌ Nộp bài thất bại. Em thử bấm Nộp bài lại sau vài giây.');
      }
      // Không clearExamSession — giữ draft để HS có thể nộp lại
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ═══ AI DIAGNOSIS ═══
  // [DEPRECATED] handleDiagnosis đã chuyển sang Chiến dịch Tâm Thư AI (AICampaignManager)
  // Admin chủ động chạy batch thay vì auto-gọi sau mỗi bài thi → Tiết kiệm 100% token.

  // ═══ ADAPTIVE TEST FIX ═══
  const handleAdaptiveTestFix = async () => {
    if (!authUser) { handleSignIn(); return; }
    if (!results || !results.weaknessProfile || !user) return;
    const matrix = results.weaknessProfile.remedialMatrix;
    if (!matrix || matrix.length === 0) { toast.error("Hệ thống chưa tạo được ma trận khắc phục. Hãy thử phân tích lại."); return; }

    setLoading(true);
    try {
      const resultQuestions: Question[] = [];
      const qRef = collection(db, 'questions');

      const levelMap: Record<string, number> = {
        'Nhận biết': 1, 'NB': 1,
        'Thông hiểu': 2, 'TH': 2,
        'Vận dụng': 3, 'VD': 3,
        'Vận dụng cao': 4, 'VDC': 4
      };

      for (const item of matrix) {
        if (item.count <= 0) continue;
        const qQuery = query(qRef, where('topic', '==', item.topic));
        const snapshot = await getDocs(qQuery);
        let qs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)).filter(q => q.status === 'published');

        // Ưu tiên các câu thuộc list level yêu cầu, nếu có
        if (item.levels && item.levels.length > 0) {
          const mappedTargetLevels = item.levels.map(l => levelMap[l] || 5);
          qs.sort((a, b) => {
            const lA = levelMap[a.level] || 5;
            const lB = levelMap[b.level] || 5;
            const matchA = mappedTargetLevels.includes(lA) ? 0 : 1;
            const matchB = mappedTargetLevels.includes(lB) ? 0 : 1;
            if (matchA !== matchB) return matchA - matchB;
            // Nếu cùng match (hoặc không match), ưu tiên Failed Questions (nếu có user memory)
            const aFailed = user.failedQuestionIds?.includes(a.id || '') ? -1 : 1;
            const bFailed = user.failedQuestionIds?.includes(b.id || '') ? -1 : 1;
            if (aFailed !== bFailed) return aFailed - bFailed;
            return Math.random() - 0.5;
          });
        } else {
          qs = qs.sort(() => Math.random() - 0.5);
        }

        resultQuestions.push(...qs.slice(0, item.count));
      }

      if (resultQuestions.length === 0) { toast.error("Xin lỗi, ngân hàng đề chưa đủ câu hỏi cho các chủ đề này."); setLoading(false); return; }

      // Sắp xếp tổng thể: Nhận biết -> Thông hiểu -> VD -> VDC
      resultQuestions.sort((a, b) => {
        const lA = levelMap[a.level] || 5;
        const lB = levelMap[b.level] || 5;
        if (lA !== lB) return lA - lB;
        return a.part - b.part;
      });

      // Cluster handling for adaptive test
      const clusterIds = new Set<string>();
      for (const q of resultQuestions) { if (q.clusterId) clusterIds.add(q.clusterId); }
      if (clusterIds.size > 0) {
        const allPickedIds = new Set(resultQuestions.map(q => q.id));
        for (const cid of clusterIds) {
          const sibSnap = await getDocs(query(qRef, where('clusterId', '==', cid)));
          const siblings = sibSnap.docs.map(d => ({ ...d.data(), id: d.id } as Question)).filter(q => !allPickedIds.has(q.id));
          resultQuestions.push(...siblings);
        }
        resultQuestions.sort((a, b) => {
          if (a.part !== b.part) return a.part - b.part;
          if (a.clusterId || b.clusterId) {
            if (a.clusterId === b.clusterId) return (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0);
            return (a.clusterId || '').localeCompare(b.clusterId || '');
          }
          return 0;
        });
      }

      setActiveTest({ topic: "BÀI TẬP KHẮC PHỤC CÁ NHÂN HÓA", questions: resultQuestions, type: 'AI_Diagnosis', createdBy: 'AI Architect' } as any);
      setCurrentQuestionIndex(0);
      setAnswers({});
      setResults(null);
    } catch (e) {
      console.error(e);
      toast.error('Lỗi tạo đề khắc phục tự động');
    } finally {
      setLoading(false);
    }
  };

  // ═══ REVIEW ATTEMPT FROM HISTORY ═══
  const handleReviewAttempt = async (attempt: Attempt) => {
    if (!authUser) {
      handleSignIn();
      return;
    }
    setLoading(true);
    try {
      const qIds = Object.keys(attempt.answers);
      if (qIds.length === 0) {
        toast.error("Bài làm này không có câu trả lời nào.");
        setLoading(false);
        return;
      }

      let questions: Question[] = [];

      // ── Chiến lược 1: Query từ collection 'questions' theo doc ID ──
      try {
        for (let i = 0; i < qIds.length; i += 10) {
          const chunk = qIds.slice(i, i + 10);
          const qQuery = query(collection(db, 'questions'), where('__name__', 'in', chunk));
          const snap = await getDocs(qQuery);
          questions.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
        }
      } catch (queryErr) {
        console.warn('[ReviewAttempt] Lỗi query questions collection:', queryErr);
      }

      // ── Chiến lược 2: Nếu thiếu quá nhiều câu → load từ exam document ──
      if (questions.length < qIds.length * 0.5 && attempt.examId) {
        try {
          const examDoc = await getDoc(doc(db, 'exams', attempt.examId));
          if (examDoc.exists()) {
            const examData = examDoc.data() as Exam;
            if (examData.questions && examData.questions.length > 0) {
              // Dùng questions từ exam doc, ưu tiên hơn kết quả rỗng
              questions = examData.questions.map((q, idx) => ({
                ...q,
                id: q.id || `exam_q_${idx}`,
              }));
              console.info(`[ReviewAttempt] ✅ Fallback: Load ${questions.length} câu từ exam/${attempt.examId}`);
            }
          }
        } catch (examErr) {
          console.warn('[ReviewAttempt] Lỗi load exam doc:', examErr);
        }
      }

      // ── Chiến lược 3: Nếu vẫn rỗng → load exam theo testId (tìm theo title) ──
      if (questions.length === 0) {
        try {
          const examQuery = query(collection(db, 'exams'), where('title', '==', attempt.testId));
          const examSnap = await getDocs(examQuery);
          if (!examSnap.empty) {
            const examData = examSnap.docs[0].data() as Exam;
            if (examData.questions && examData.questions.length > 0) {
              questions = examData.questions.map((q, idx) => ({
                ...q,
                id: q.id || `exam_q_${idx}`,
              }));
              console.info(`[ReviewAttempt] ✅ Fallback 2: Load ${questions.length} câu từ exam title match`);
            }
          }
        } catch (titleErr) {
          console.warn('[ReviewAttempt] Lỗi query exam by title:', titleErr);
        }
      }

      if (questions.length === 0) {
        toast.error("Không thể tải chi tiết câu hỏi. Đề thi có thể đã bị xóa khỏi hệ thống.");
        setLoading(false);
        return;
      }

      questions.sort((a, b) => (a.part || 1) - (b.part || 1));

      setActiveTest({ topic: attempt.testId, questions });
      setResults(attempt);
      setIsReviewing(true);
      setActiveView('dashboard'); // Chuyển về dashboard để render phần Review
    } catch (e) {
      console.error(e);
      toast.error("Lỗi tải chi tiết bài làm.");
    } finally {
      setLoading(false);
    }
  };

  // ═══ SAVE TO VAULT ═══
  const handleSaveToVault = async () => {
    if (!results || !activeTest || !user) return;
    try {
      const incorrectIds = activeTest.questions.filter(q => {
        const studentAns = results.answers[q.id || ''];
        if (studentAns === undefined || studentAns === null || studentAns === '') return true;
        if (q.part === 1) return studentAns !== q.correctAnswer;
        if (q.part === 2) { return Array.from({ length: 4 }).some((_, i) => !Array.isArray(studentAns) || studentAns[i] !== (q.correctAnswer as boolean[])[i]); }
        if (q.part === 3) return Math.abs(parseFloat(studentAns) - (q.correctAnswer as number)) >= 0.01;
        return false;
      }).map(q => q.id as string).filter(id => id);

      const updatedVault = Array.from(new Set([...(user.knowledgeGapVault || []), ...incorrectIds]));
      await updateDoc(doc(db, 'users', user.uid), { knowledgeGapVault: updatedVault });
      authStore.setUser({ ...user, knowledgeGapVault: updatedVault });
      toast.success("Đã lưu " + incorrectIds.length + " câu sai vào Kho Ôn Tập thành công!");
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi lưu vào Kho Ôn Tập");
    }
  };

  const adminStats = useDashboardStats();

  // ═══ Projector View Detection ═══
  const projectorExamId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('projector');
  }, []);

  if (projectorExamId) {
    return <LazyWrap><ProjectorLeaderboard classExamId={projectorExamId} /></LazyWrap>;
  }

  if (isAuthInitializing) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full"
      />
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER — PURE ROUTING LOGIC
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-fuchsia-500/30 flex flex-col md:flex-row relative">
      <ToastProvider />
      <AuthErrorBoundary />
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}

      {/* ── Confirm PDF Modal ── */}
      {confirmPdfExam && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Tải Đề PDF</h3>
            <p className="text-sm text-slate-300 mb-6">
              Tải đề <b>{confirmPdfExam.title}</b> dưới dạng PDF sẽ tiêu tốn <span className="text-amber-500 font-bold">5 lượt</span> sử dụng của bạn. Bạn có chắc chắn muốn tải không?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmPdfExam(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-800 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={executePdfDownload}
                disabled={isPdfDownloading}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-colors flex items-center gap-2"
              >
                {isPdfDownloading ? 'Đang xử lý...' : 'Xác nhận tải'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfettiCelebration show={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* ── Magic Link Route: ?invite=<token> — render ISOLATED, không có Sidebar/Dashboard ── */}
      {inviteToken && (() => {
        const handleInviteSuccess = () => {
          setInviteToken(null);
          const url = new URL(window.location.href);
          url.searchParams.delete('invite');
          window.history.replaceState({}, '', url.toString());
        };
        return (
          <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-y-auto">
            {/* Mini header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-800/60 flex items-center justify-between">
              <span className="font-black text-white text-xl tracking-tight">
                PHYS<span className="text-fuchsia-500">9+</span>
              </span>
              {!authUser && (
                <button
                  onClick={handleSignIn}
                  className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-bold rounded-xl transition-all"
                >
                  Đăng nhập để kích hoạt
                </button>
              )}
            </div>
            {/* InvitePage content */}
            <div className="flex-1 flex flex-col p-6 md:p-12 max-w-2xl mx-auto w-full">
              <InvitePage
                token={inviteToken}
                user={user}
                onSuccess={handleInviteSuccess}
              />
            </div>
          </div>
        );
      })()}
      {activeSimulationViewer && (
        <LazyWrap>
          <SimulationViewer
            simulation={activeSimulationViewer}
            onClose={() => setActiveSimulationViewer(null)}
          />
        </LazyWrap>
      )}

      {!isFullScreenMode && (
        <Sidebar
          user={user}
          isAdmin={user?.role === 'admin' || user?.email === 'haunn.vietanhschool@gmail.com'}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          activeTab={activeView}
          setActiveTab={handleSidebarNavigate}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          isMobileOpen={isMobileMenuOpen}
          setIsMobileOpen={setIsMobileMenuOpen}
        />
      )}

      {/* ══════ MOBILE TOP BAR ══════ */}
      {user && !isFullScreenMode && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-[80] bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/50 safe-area-inset">
          <div className="flex items-center justify-between px-4 h-[56px]">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all active:scale-90"
                aria-label="Mở menu"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <span className="font-headline font-black text-white text-lg tracking-tighter">
                PHYS<span className="text-fuchsia-500 text-glow-neon">9+</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <NotificationCenter
                notifications={user.notifications}
                onRead={markNotificationAsRead}
              />
              <button
                onClick={signOut}
                className="p-2 rounded-xl text-slate-500 hover:text-red-500 hover:bg-red-600/10 transition-all"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cn(
        "flex-1 transition-all duration-300 min-h-screen w-full",
        user && !isFullScreenMode ? (isSidebarCollapsed ? "md:ml-[80px]" : "md:ml-[260px]") : "",
        user && !isFullScreenMode ? "pt-[56px] md:pt-0" : ""
      )}>
        <main className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-12">
          {!authUser && activeView === 'dashboard' ? (
            /* ══════ LANDING PAGE — Cinematic Video Hero ══════ */
            <div className="relative w-full min-h-screen overflow-hidden flex flex-col items-center justify-center py-20 -mx-4 -mt-6 md:-mx-6 md:-mt-12 px-0">
              {/* ── Video Background ── */}
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover z-0"
                src="/1000028512.mp4"
                aria-hidden="true"
              />

              {/* ── Dark Overlay ── */}
              <div className="absolute inset-0 bg-[#0B0F19]/85 z-10" />

              {/* ── Content ── */}
              <div className="relative z-20 flex flex-col items-center text-center px-4 w-full max-w-5xl mx-auto">
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }} className="w-full">
                  {/* ── Badge ── */}
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-black uppercase tracking-[0.25em] mb-10"
                    style={{ background: 'rgba(0,0,0,0.6)', borderColor: 'rgba(255,255,255,0.3)', color: '#e2e8f0', backdropFilter: 'blur(8px)' }}
                  >
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                    Hệ thống luyện thi Vật lý 2026
                  </div>

                  {/* ── Heading: cân đối 3 dòng ── */}
                  <h1
                    className="font-black tracking-tighter text-center mb-8"
                    style={{ isolation: 'isolate' }}
                  >
                    {/* CHINH PHỤC */}
                    <span style={{
                      display: 'block',
                      color: '#ffffff',
                      fontSize: 'clamp(2.2rem, 7vw, 5.5rem)',
                      lineHeight: 1.1,
                      letterSpacing: '-0.02em',
                      textShadow: '0 2px 30px rgba(0,0,0,1)',
                      marginBottom: '0.1em',
                    }}>CHINH PHỤC</span>

                    {/* 9.0+ — điểm nhấn, lớn hơn nhưng không quá chênh */}
                    <span style={{
                      display: 'block',
                      fontSize: 'clamp(4rem, 14vw, 9rem)',
                      fontWeight: 900,
                      lineHeight: 0.95,
                      background: 'linear-gradient(135deg, #ef4444 0%, #f97316 60%, #fbbf24 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      marginBottom: '0.05em',
                    }}>9.0+</span>

                    {/* VẬT LÝ */}
                    <span style={{
                      display: 'block',
                      color: '#ffffff',
                      fontSize: 'clamp(2.2rem, 7vw, 5.5rem)',
                      lineHeight: 1.1,
                      letterSpacing: '-0.02em',
                      textShadow: '0 2px 30px rgba(0,0,0,1)',
                    }}>VẬT LÝ</span>
                  </h1>

                  {/* ── Subtitle ── */}
                  <p style={{ color: 'rgba(226,232,240,0.7)', fontSize: 'clamp(0.9rem, 2vw, 1.1rem)', fontWeight: 500, marginBottom: '2.5rem', maxWidth: '560px', margin: '0 auto 2.5rem' }}>
                    Nền tảng luyện thi Vật lý thông minh — AI cá nhân hoá lộ trình học cho từng học sinh.
                  </p>

                  {/* ── CTA Button ── */}
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSignIn}
                    className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl font-black text-base uppercase tracking-widest text-white shadow-2xl transition-all"
                    style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)', boxShadow: '0 0 40px rgba(239,68,68,0.4)' }}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </motion.div>
              </div>
            </div>
// ══════════════════════════════════════════════════════════════════════
    ) : (
    /* ══════ MAIN DASHBOARD VIEW ══════ */
    <div className="space-y-12 relative z-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight uppercase">
            CHÀO MỪNG ĐẾN VỚI <span className="text-fuchsia-500 text-glow-neon">PHY9+</span>
          </h2>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Hệ thống đã kết nối. Chúc các chiến binh có một phiên huấn luyện hiệu quả!
          </p>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Huy hiệu</span>
              <span className="text-sm font-bold text-white">{user.badges?.length || 0}</span>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Điểm TB</span>
              <span className="text-sm font-bold text-red-500">{(attempts.reduce((acc, a) => acc + a.score, 0) / (attempts.length || 1)).toFixed(1)}</span>
            </div>
          </div>
          <NotificationCenter notifications={user.notifications} onRead={markNotificationAsRead} />
          <button onClick={signOut} className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-red-600/10 hover:border-red-600/50 transition-all group">
            <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-500" />
          </button>
        </div>
      </header>

      {/* ──── CONTENT ROUTING ──── */}
      {activeView === 'liveExam' && <LazyWrap><LiveClassExam user={user} /></LazyWrap>}
      {activeView === 'adaptive' && (
        <LazyWrap>
          <AdaptiveDashboard
            user={user}
            attempts={attempts}
            onStartAdaptiveTest={(questions, config, assessment) => {
              setActiveTest({
                topic: `Đề Thích Ứng: ${config.examType}`,
                questions,
                adaptiveConfig: config,
              } as any);
              setActiveView('liveExam');
            }}
          />
        </LazyWrap>
      )}
      {activeView === 'StudentView' && (user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') && (
        <LazyWrap>
          <StudentViewSimulator
            user={user}
            attempts={attempts}
            onStartPrescription={(topic, examId) => startTest(topic, examId)}
            onStartExam={(exam) => startTest(exam.title, exam.id)}
          />
        </LazyWrap>
      )}

      {activeView === 'history' && (
        <HistoryDashboard attempts={attempts} onReviewAttempt={handleReviewAttempt} />
      )}

      {/* ══════ MINDMAP VIEWER ══════ */}
      {activeView === 'mindmap' && (
        <LazyWrap><MindmapViewer user={user} /></LazyWrap>
      )}
      {activeView === 'MindmapAdmin' && (user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') && (
        <LazyWrap><MindmapAdminPanel user={user} /></LazyWrap>
      )}

      {(activeView === 'dashboard' || activeView === 'tasks') && (
        <LazyWrap>
          <StudentDashboard user={user} attempts={attempts} onStartPrescription={(topic, examId) => startTest(topic as string, examId as string)} onStartExam={(exam) => startTest(exam.title, exam.id)} onDownloadPDF={handleStudentDownloadPDF} />
        </LazyWrap>
      )}

      {activeView === 'simulations' && (
        <div className="space-y-12">
          <section className="space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2"><FlaskConical className="text-red-500" /> VIRTUAL LAB & THỰC TẾ</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div onClick={() => {
                if (!authUser) { handleSignIn(); return; }
                setActiveSimulation({ title: 'Máy chụp MRI', description: 'Ứng dụng từ trường mạnh và hiện tượng cộng hưởng từ hạt nhân.', url: 'https://phet.colorado.edu/sims/html/mri/latest/mri_all.html' });
              }} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:bg-slate-800 transition-colors cursor-pointer group">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500 mb-4"><BrainCircuit className="w-6 h-6" /></div>
                <h4 className="font-bold text-white mb-2">Máy chụp MRI</h4>
                <p className="text-sm text-slate-400">Ứng dụng từ trường mạnh và hiện tượng cộng hưởng từ hạt nhân.</p>
              </div>
              <div onClick={() => {
                if (!authUser) { handleSignIn(); return; }
                setActiveSimulation({ title: 'Định luật Boyle', description: 'Phân tích dữ liệu thực nghiệm từ bộ thí nghiệm áp kế.', url: 'https://phet.colorado.edu/sims/html/gas-properties/latest/gas-properties_all.html' });
              }} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:bg-slate-800 transition-colors cursor-pointer group">
                <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500 mb-4"><FlaskConical className="w-6 h-6" /></div>
                <h4 className="font-bold text-white mb-2">Định luật Boyle</h4>
                <p className="text-sm text-slate-400">Phân tích dữ liệu thực nghiệm từ bộ thí nghiệm áp kế.</p>
              </div>
            </div>
          </section>
          <section id="resources" className="space-y-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white flex items-center gap-2"><Beaker className="text-blue-500" /> KHO HỌC LIỆU MÔ PHỎNG SỐ</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {simulations.map(sim => (
                <div key={sim.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 group hover:border-blue-500/50 transition-colors flex flex-col">
                  <div className="text-4xl mb-4">{sim.thumbnail}</div>
                  <h4 className="text-lg font-black text-white mb-2 line-clamp-2">{sim.title}</h4>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3">{sim.category}</p>
                  <p className="text-sm text-slate-400 mb-6 flex-1 line-clamp-3">{sim.description}</p>
                  <button onClick={async () => {
                    if (!authUser) { handleSignIn(); return; }

                    // --- BẮT ĐẦU TRỪ LƯỢT FREE ---
                    try {
                      const isAdmin = user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com';
                      await startExamAttempt(user.uid, 'Simulation_' + sim.id, isAdmin);
                    } catch (err: any) {
                      if (err.message === "EXCEEDED_LIMIT") {
                        setShowUpgradeModal(true);
                        return;
                      }
                      console.warn('[Simulation] Lỗi không xác định từ startExamAttempt:', err.message);
                    }

                    setActiveSimulationViewer(sim);
                  }} className="w-full bg-slate-950 border border-slate-800 hover:bg-blue-600 hover:border-blue-500 hover:text-white text-slate-300 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex justify-center items-center gap-2">
                    <Play className="w-4 h-4" /> Bắt đầu thí nghiệm
                  </button>
                </div>
              ))}
            </div>
          </section>
          <SimulationModal isOpen={!!activeSimulation} onClose={() => setActiveSimulation(null)} title={activeSimulation?.title || ''} description={activeSimulation?.description || ''} simulationUrl={activeSimulation?.url || ''} />
        </div>
      )}

      {/* ══════ STUDENT VIEW SIMULATOR (Khối 10, 11, 12) ══════ */}
      {activeView === 'StudentView' && (
        <div className="w-full h-full">
          <LazyWrap>
            <StudentViewSimulator
              user={user}
              attempts={attempts}
              onStartPrescription={(topic, examId) => startTest(topic, examId)}
              onStartExam={(exam) => startTest(exam.title, exam.id)}
            />
          </LazyWrap>
        </div>
      )}

      {/* ══════ ADMIN SECTION ══════ */}
      {(user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') && (ADMIN_TABS as readonly string[]).includes(activeView as any) && activeView !== 'StudentView' && (
        <section className="space-y-10 mt-12 pt-12 border-t border-slate-800/50">
          <div className="text-center mb-4">
            <h2 className="text-lg sm:text-xl md:text-3xl font-black font-headline text-gradient-cyber tracking-tight uppercase">
              CHÀO THẦY THUỐC {user.displayName} — HỆ THỐNG SẴN SÀNG
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-2 leading-6 sm:leading-7">Trung tâm điều khiển Phy9+ | Quản lý câu hỏi, số hóa đề thi & phân tích dữ liệu</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 md:mb-8">
            {[
              { label: 'Trạng thái AI', value: 'Sẵn sàng', icon: BrainCircuit, color: 'text-green-500' },
              { label: 'Tổng số câu hỏi', value: adminStats.isLoading ? null : adminStats.totalQuestions.toLocaleString(), icon: BookOpen, color: 'text-cyan-400' },
              { label: 'Lượt thi hôm nay', value: adminStats.isLoading ? null : adminStats.todayAttempts.toString(), icon: Activity, color: 'text-fuchsia-400' },
              { label: 'HS đang Online', value: adminStats.isLoading ? null : adminStats.onlineStudents.toString(), icon: Settings, color: 'text-amber-400' },
            ].map((s, i) => (
              <div key={i} className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl flex items-center gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5 min-h-[88px]">
                <div className={cn("p-2 rounded-xl bg-slate-800/80 shrink-0", s.color)}><s.icon className="w-5 h-5" /></div>
                <div className="flex-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-5 line-clamp-1 truncate">{s.label}</p>
                  {s.value !== null ? (<p className="text-lg font-black text-white truncate">{s.value}</p>) : (<div className="mt-1"><SkeletonNumber width="60px" height="20px" /></div>)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
            <h3 className="text-lg sm:text-xl md:text-2xl font-black flex items-center gap-2 md:gap-3 text-gradient-fire font-headline"><Settings className="text-cyan-400 w-5 h-5 md:w-7 md:h-7" /> HỆ THỐNG QUẢN TRỊ PHYS-9+</h3>
            <div className="flex overflow-x-auto bg-slate-900 p-1 rounded-2xl border border-slate-800 w-full md:w-auto scrolling-touch hide-scrollbar">
              {[
                { id: 'Digitize', label: 'Số hóa đề', icon: History },
                { id: 'Bank', label: 'Kho câu hỏi', icon: BookOpen },
                { id: 'Matrix', label: 'Ma Trận Đề', icon: Target },
                { id: 'Generator', label: 'Tạo đề thi', icon: Play },
                { id: 'SimLab', label: 'Kho Mô phỏng', icon: Beaker },
                { id: 'Duplicates', label: 'Trùng lặp', icon: ArrowLeftRight },
                { id: 'Sanitizer', label: 'Bảo trì', icon: ShieldAlert },
                { id: 'Reports', label: 'Báo lỗi', icon: Flag },
                { id: 'Classroom', label: 'Phòng Thi', icon: Activity },
                { id: 'Tracking', label: 'Theo dõi HS', icon: BarChart3 },
                { id: 'Campaign', label: 'Tâm Thư AI', icon: Send },
                { id: 'YCCD', label: 'YCCĐ', icon: Target },
                { id: 'AIChats', label: 'Log Chat AI', icon: BrainCircuit },
                { id: 'RecalibScore', label: 'Hi\u1ec7u Ch\u1ec9nh \u0110i\u1ec3m', icon: ShieldAlert },
              ].map(tab => (
                <button key={tab.id} onClick={() => setAdminTab(tab.id as any)} className={cn("flex-none whitespace-nowrap px-3 sm:px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center justify-center gap-1.5 md:gap-2", adminTab === tab.id ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "text-slate-500 hover:text-slate-300")}>
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <motion.div key={adminTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <LazyWrap>
              {adminTab === 'Digitize' && <DigitizationDashboard onQuestionsAdded={() => { setAdminTab('Bank'); adminStats.refetch(); }} />}
              {adminTab === 'Bank' && <QuestionBank onCountChanged={(delta) => adminStats.adjustCount(delta)} onQuestionsLoaded={(n) => adminStats.setCount(n)} />}
              {adminTab === 'Matrix' && <ExamMatrixGenerator />}
              {adminTab === 'Generator' && <ExamGenerator user={user} onExportPDF={exportExamToPDF} onExportWord={handleExportWord} />}
              {adminTab === 'SimLab' && <SimulationAdminBoard onPlay={(sim) => setActiveSimulationViewer(sim)} />}
              {adminTab === 'Duplicates' && <DuplicateReviewHubWrapper />}
              {adminTab === 'Sanitizer' && <DataSanitizer />}
              {adminTab === 'Reports' && <ReportHub />}
              {adminTab === 'Classroom' && <ClassManager user={user} />}
              {adminTab === 'Directory' && <StudentDirectory />}
              {adminTab === 'Library' && <ExamLibrary />}
              {adminTab === 'Tracking' && <TeacherDashboard />}
              {adminTab === 'Campaign' && <AICampaignManager />}
              {adminTab === 'YCCD' && <YCCDAutoTagger />}
              {adminTab === 'Migration' && <DatabaseMigrationTool />}
              {adminTab === 'RecalibScore' && <ScoreRecalibrationTool />}
              {adminTab === 'AIChats' && <AIChatLogsDashboard />}
            </LazyWrap>
          </motion.div>
        </section>
      )}
    </div>
          )}
        </main>
      </div>
    </div>
  );
}

