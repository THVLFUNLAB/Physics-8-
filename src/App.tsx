/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  signOut, 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  getDocsFromServer,
  setDoc, 
  onAuthStateChanged, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  deleteDoc,
  updateDoc,
  Timestamp,
  handleFirestoreError,
  OperationType,
  writeBatch,
  orderBy,
  getDocFromCache,
  getDocFromServer,
  startExamAttempt
} from './firebase';
import { UserProfile, Question, ClusterQuestion, Attempt, Topic, Part, TargetGroup, Exam, ExamMatrix, Prescription, Badge, AppNotification, LoginLog, Simulation } from './types';
import { analyzeAnswer, digitizeDocument, digitizeFromPDF, diagnoseUserExam, normalizeQuestions } from './services/geminiService';
import { PHYSICS_TOPICS, matchesTopic } from './utils/physicsTopics';
import { 
  LogOut, 
  User as UserIcon, 
  BookOpen, 
  Target, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  Play, 
  History, 
  Settings,
  BrainCircuit,
  FlaskConical,
  Trophy,
  Video,
  ExternalLink,
  Info,
  Activity,
  Bell,
  Clock,
  ShieldAlert,
  Award,
  Download,
  ImagePlus,
  Save,
  X,
  Check,
  Filter,
  Beaker,
  Archive,
  Search,
  ChevronLeft,
  RotateCcw,
  ArrowLeftRight,
  Flag,
  FileText,
  Star,
  ArrowRight,
  Pencil,
  Eye
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import MathRenderer from './lib/MathRenderer';
import ReactMarkdown from 'react-markdown';
import { InlineMath, BlockMath } from 'react-katex';
import * as mammoth from 'mammoth';

import { parseAzotaExam, ParseError } from './services/AzotaParser';
import { processDocxFile } from './services/DocxReader';
import { ReviewExam } from './components/ReviewExam';
import QuestionReviewBoard from './components/QuestionReviewBoard';
import { SimulationAdminBoard, SimulationViewer } from './components/SimulationLab';
import DuplicateReviewHub from './components/DuplicateReviewHub';
import DataSanitizer from './components/DataSanitizer';
import ReportHub from './components/ReportHub';
import { StudentDirectory } from './components/StudentDirectory';
import { Sidebar, SidebarTab, STUDENT_TABS, ADMIN_TABS } from './components/Sidebar';
import { ToastProvider, toast } from './components/Toast';
import { getCurrentRank, getNextRank, getRankProgress, calculateTestRewards, RANKS } from './services/RankSystem';
import { useDashboardStats, useStudentStats } from './hooks/useDashboardStats';
import { SkeletonCard, SkeletonNumber, SkeletonText } from './components/SkeletonLoader';
import KnowledgeGapGallery from './components/KnowledgeGapGallery';
import ClassManager from './components/ClassManager';
import LiveClassExam from './components/LiveClassExam';
import ProjectorLeaderboard from './components/ProjectorLeaderboard';
import AdaptiveDashboard from './components/AdaptiveDashboard';
import { CountdownTimer } from './components/CountdownTimer';
import { MotivationalQuote } from './components/MotivationalQuote';
import { BackgroundMusic } from './components/BackgroundMusic';
import { ExamsList } from './components/ExamsList';
import ExamLibrary from './components/ExamLibrary';
import ExamMatrixGenerator from './components/ExamMatrixGenerator';

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Legend,
  LabelList
} from 'recharts';

// --- Components ---

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}



// ── Kiểu dữ liệu Summary Object cho báo cáo sau số hóa ──
interface DigitizationSummary {
  success: boolean;
  totalInserted: number;
  totalFailed: number;
  details: { part1: number; part2: number; part3: number };
  sourceFile: string;
  timestamp: Date;
  errorDetails: string[];
}

// ── Sanitizer: Strip undefined + chỉ xóa ảnh Base64 QUÁ LỚN (>100KB) ──
// Ảnh nén JPEG (5-20KB) nằm gọn trong giới hạn 1MB Firestore → giữ lại
export const stripLargeBase64 = (str: string): string => {
  // Chỉ xóa ảnh base64 > ~100KB (tức > 136,000 ký tự sau mã hóa)
  let result = str.replace(
    /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]{136000,})\)/g,
    '' // Xóa hoàn toàn thay vì để placeholder
  ).replace(
    /<img\s+[^>]*src=["'](data:image\/[^"']{136000,})["'][^>]*\/?>/gi,
    '' // Xóa hoàn toàn thay vì để placeholder
  );
  // [FIX #1] Xóa mọi dạng label "HÌNH MINH HỌA" trước khi lưu Firestore
  result = result.replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '');
  result = result.replace(/<[^>]*>\s*HÌNH\s+MINH\s+HỌA[^<]*<\/[^>]*>/gi, '');

  // [FIX #2] Xóa chuỗi base64 "rò rỉ" — BẢO VỆ ảnh hợp lệ trước khi dọn
  // Bước 2a: Tạm thay ảnh Markdown hợp lệ ![...](data:image/...) bằng placeholder
  const imgBackup: string[] = [];
  result = result.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, (match) => {
    imgBackup.push(match);
    return `__SAFE_IMG_${imgBackup.length - 1}__`;
  });
  // Bước 2b: Tạm thay ảnh HTML hợp lệ <img src="data:image/..."> bằng placeholder
  result = result.replace(/<img\s+[^>]*src=["']data:image\/[^"']+["'][^>]*\/?>/gi, (match) => {
    imgBackup.push(match);
    return `__SAFE_IMG_${imgBackup.length - 1}__`;
  });
  // Bước 2c: Giờ mới xóa base64 rác (ảnh hợp lệ đã an toàn trong placeholder)
  result = result.replace(/\(?data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]{20,}\)?/g, '');
  // Bước 2d: Khôi phục ảnh hợp lệ
  result = result.replace(/__SAFE_IMG_(\d+)__/g, (_, idx) => imgBackup[parseInt(idx)]);

  return result.replace(/\s{3,}/g, ' ').trim();
};

// Loại bỏ tất cả key có giá trị undefined (Firestore reject undefined)
export const stripUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(item => stripUndefined(item));
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = stripUndefined(value);
      }
    }
    return clean;
  }
  return obj;
};

export const sanitizeQuestion = (q: Question): Record<string, any> => {
  // [FIX] Tách `id` ra khỏi data trước khi lưu Firestore
  // Lý do: Firestore tự quản lý document ID qua addDoc/doc.
  // Nếu để `id` (VD: "q_123_abc" từ parser) vào data, khi đọc lại
  // `{ id: d.id, ...d.data() }` → temp ID ghi đè document ID thật → mọi update sẽ thất bại.
  const { id: _stripId, ...rest } = q;
  const cleaned = {
    ...rest,
    content: stripLargeBase64(q.content || ''),
    explanation: stripLargeBase64(q.explanation || ''),
    options: q.options?.map(opt => stripLargeBase64(opt ?? '')),
    tags: q.tags ?? [],
    resources: q.resources ?? [],
    status: q.status || 'draft',
  };
  return stripUndefined(cleaned);
};

const DigitizationDashboard = ({ onQuestionsAdded }: { onQuestionsAdded: (qs?: Question[]) => void }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [topicHint, setTopicHint] = useState<Topic>('');
  const [digitizeMode, setDigitizeMode] = useState<'AI' | 'Standard'>('AI');
  const [imageProgress, setImageProgress] = useState<string | null>(null);
  // ── Kết quả số hóa (Summary Modal) ──
  const [summaryModal, setSummaryModal] = useState<DigitizationSummary | null>(null);

  // ═══ Module 4: Upload Workflow — 2 Options sau khi AI xử lý xong ═══
  const [pendingQuestions, setPendingQuestions] = useState<Question[] | null>(null);
  const [pendingSourceFile, setPendingSourceFile] = useState('');
  const [showActionModal, setShowActionModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [showReviewBoard, setShowReviewBoard] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [alsoSaveToBank, setAlsoSaveToBank] = useState(true);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    try {
      const file = target.files?.[0];
      if (!file) return;

      const isPDF = file.name.toLowerCase().endsWith('.pdf');
      const isDOCX = file.name.toLowerCase().endsWith('.docx');
      const isJSON = file.name.toLowerCase().endsWith('.json');

      if (!isPDF && !isDOCX && !isJSON) {
        toast.error('Vui lòng chọn file .pdf, .docx hoặc .json');
        return;
      }

      setIsProcessing(true);

      // Check if API key is selected (if platform supports it)
      if (digitizeMode === 'AI' || isPDF) {
        try {
          if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
            await window.aistudio.openSelectKey();
          }
        } catch (err) {
          console.warn('Error checking API key status:', err);
        }
      }

      const sourceFileName = file.name;
      
      if (isJSON) {
        setImageProgress('Đang tải file ngân hàng câu hỏi JSON...');
        const text = await file.text();
        let questions: Question[];
        try {
          questions = JSON.parse(text);
        } catch (e) {
          throw new Error('File JSON bị lỗi định dạng.');
        }
        
        if (!Array.isArray(questions)) {
          // If the JSON is wrapped in an object e.g. { questions: [...] }
          if (questions && typeof questions === 'object' && Array.isArray((questions as any).questions)) {
            questions = (questions as any).questions;
          } else {
            throw new Error('File JSON không đúng cấu trúc (phải chứa danh sách câu hỏi).');
          }
        }

        // Tự động bổ sung các trường bị thiếu từ model/pipeline bên ngoài
        const rawQuestions = questions.map(q => {
          let inferredPart = q.part;
          if (!inferredPart) {
            // Nội suy Phần dựa vào cấu trúc đáp án/options
            if (q.options && Array.isArray(q.options) && q.options.length === 4) {
              inferredPart = 1; // Trắc nghiệm 4 đáp án (Phần 1)
            } else if (typeof q.correctAnswer === 'object' || (q.options && q.options.length > 0)) {
              inferredPart = 2; // Đúng/Sai thường trả object hoặc options khác 4 (Phần 2)
            } else {
              inferredPart = 3; // Trả lời ngắn, không có options (Phần 3)
            }
          }
          return {
            ...q,
            id: q.id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            part: inferredPart,
            topic: q.topic || topicHint || 'Chưa phân loại',
            // Map snake_case từ Parser bên ngoài → camelCase cho Firestore
            yccdCode: q.yccdCode || (q as any).yccd_code || undefined,
          };
        });

        // ═══ FIX: Normalize correctAnswer type + Sanitize LaTeX (đồng bộ với AI pipeline) ═══
        const finalQuestions = normalizeQuestions(rawQuestions);
        
        setParseErrors([]);
        setImageProgress(null);
        setPendingQuestions(finalQuestions);
        setPendingSourceFile(sourceFileName);
        setShowActionModal(true);
        setIsProcessing(false);
        return;
      } else if (isPDF) {
        // ===== PDF MODE: Gemini Vision đọc trực tiếp =====
        const questions = await digitizeFromPDF(
          file,
          topicHint,
          (status) => setImageProgress(status)
        );
        setImageProgress(null);
        if (questions.length === 0) {
          toast.error('AI không tìm thấy câu hỏi nào trong PDF. Thầy kiểm tra lại file.');
          return;
        }
        setParseErrors([]);
        // ═══ REFACTORED: Không auto-save — hiện modal 2 lựa chọn ═══
        setImageProgress(null);
        setPendingQuestions(questions);
        setPendingSourceFile(sourceFileName);
        setShowActionModal(true);
        setIsProcessing(false);
        return; // Exit early — user sẽ chọn action trong modal
      } else if (digitizeMode === 'AI') {
        // ===== AI Mode: mammoth → Nén ảnh JPEG → HTML (compact data URLs) → Gemini Flash =====
        setImageProgress('Đang đọc file Word và nén ảnh...');
        const arrayBuffer = await file.arrayBuffer();
        let imgCount = 0;

        // Hàm nén ảnh bằng Canvas (browser-native, 0 thư viện)
        // PNG 2-5MB → JPEG Q40 max 600px = 5-20KB
        const compressImage = (buffer: ArrayBuffer, mimeType: string): Promise<string> => {
          return new Promise((resolve) => {
            const blob = new Blob([buffer], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const img = new window.Image();
            img.onload = () => {
              const MAX_W = 600;
              const scale = img.width > MAX_W ? MAX_W / img.width : 1;
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d')!;
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              // JPEG quality 0.4 = nén cực mạnh, đủ rõ cho đề thi
              const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
              URL.revokeObjectURL(url);
              resolve(dataUrl);
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              resolve(''); // Fallback nếu ảnh bị lỗi
            };
            img.src = url;
          });
        };

        const convertImage = mammoth.images.imgElement(async (image) => {
          try {
            const rawBuffer = await image.read();
            // mammoth trả Buffer → copy sang ArrayBuffer chuẩn
            const arrayBuf = new Uint8Array(rawBuffer).buffer.slice(0) as ArrayBuffer;
            const mimeType = image.contentType ?? 'image/png';
            const compressedUrl = await compressImage(arrayBuf, mimeType);
            imgCount++;
            setImageProgress(`Đã nén ${imgCount} ảnh (JPEG nhẹ)...`);

            if (compressedUrl) {
              return { src: compressedUrl, alt: '' };
            }
            return { src: '', alt: '' };
          } catch (err) {
            console.error('[AI Mode] Lỗi nén ảnh:', err);
            return { src: '', alt: '' };
          }
        });

        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            convertImage,
            includeDefaultStyleMap: true,
            // RÀO CẢN 1 FIX: mammoth mặc định BỎ QUA underline.
            // Phải dùng convertUnderline (KHÔNG phải styleMap) để giữ <u> tag.
            // TS types lạc hậu → dùng assertion.
            convertUnderline: (mammoth as any).underline.element('u'),
          } as any
        );
        setImageProgress(`Nén xong ${imgCount} ảnh. AI đang phân tích...`);

        // Trước khi gửi AI: đánh số ảnh [IMG_1], [IMG_2]... để track chính xác
        const imageMap: Map<number, string> = new Map();
        let imgIndex = 0;
        const htmlForAI = result.value.replace(
          /<img\s+[^>]*src=["'](data:image\/[^"']+)["'][^>]*\/?>/gi,
          (_match: string, dataUrl: string) => {
            imgIndex++;
            imageMap.set(imgIndex, dataUrl);
            return `[IMG_${imgIndex}]`;
          }
        );
        const totalImages = imageMap.size;

        if (!htmlForAI || htmlForAI.trim().length === 0)
          throw new Error('File Word không có nội dung văn bản.');

        if (totalImages > 0) {
          setImageProgress(`📸 ${totalImages} ảnh đã đánh dấu. AI đang phân tích...`);
        }

        // Gửi text sạch (không có data URL) cho Gemini Flash → tiết kiệm token
        const questions = await digitizeDocument(htmlForAI, topicHint, (s) => setImageProgress(s));
        
        // Sau khi AI trả kết quả: ghép ảnh vào CUỐI content câu hỏi
        if (totalImages > 0 && questions.length > 0) {
          const usedImgIndices = new Set<number>();

          for (const q of questions) {
            // Tìm tất cả marker [IMG_X] trong content
            const markers = [...q.content.matchAll(/\[IMG_(\d+)\]/gi)];
            
            if (markers.length > 0) {
              // Xóa marker khỏi giữa content
              q.content = q.content.replace(/\[IMG_\d+\]/gi, '').trim();
              // Chèn ảnh vào CUỐI câu hỏi
              for (const m of markers) {
                const idx = parseInt(m[1], 10);
                const dataUrl = imageMap.get(idx);
                if (dataUrl) {
                  q.content += `\n\n![Hình minh họa](${dataUrl})`;
                  usedImgIndices.add(idx);
                }
              }
            } else {
              // AI không giữ marker → xóa placeholder dạng cũ nếu có
              q.content = q.content.replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '').trim();
            }
          }
          
          // Ảnh mồ côi (AI bỏ qua marker) → gắn vào câu cuối
          for (const [idx, dataUrl] of imageMap.entries()) {
            if (!usedImgIndices.has(idx)) {
              const lastQ = questions[questions.length - 1];
              lastQ.content += `\n\n![Hình minh họa](${dataUrl})`;
              console.info(`[Image Map] Ảnh mồ côi #${idx} → gán vào câu cuối`);
            }
          }
        }

        setParseErrors([]);
        // ═══ REFACTORED: Không auto-save — hiện modal 2 lựa chọn ═══
        setImageProgress(null);
        setPendingQuestions(questions);
        setPendingSourceFile(sourceFileName);
        setShowActionModal(true);
        setIsProcessing(false);
        return; // Exit early — user sẽ chọn action trong modal
      } else {
        // ===== Standard Mode: DocxReader + AzotaParser =====
        setImageProgress('Đang đọc file và xử lý hình ảnh...');
        const docxResult = await processDocxFile(
          file,
          'exam_images',
          (uploaded, total) => setImageProgress(`Đã upload ${uploaded}/${total} hình lên Storage...`)
        );
        setImageProgress(null);
        if (docxResult.warnings.length > 0)
          console.warn('[DocxReader] Cảnh báo:', docxResult.warnings);
        if (!docxResult.html || docxResult.html.trim().length === 0)
          throw new Error('File Word không có nội dung văn bản.');
        const parseResult = parseAzotaExam(docxResult.html, topicHint);
        if (parseResult.questions.length === 0) {
          toast.error('Không tìm thấy câu hỏi theo định dạng chuẩn Azota. Thầy hãy kiểm tra lại file.');
          return;
        }
        setParseErrors(parseResult.errors);
        // ═══ REFACTORED: Standard mode cũng hiện modal 2 lựa chọn ═══
        setImageProgress(null);
        setPendingQuestions(parseResult.questions);
        setPendingSourceFile(sourceFileName);
        setShowActionModal(true);
        setIsProcessing(false);
        return;
      }
    } catch (error: any) {
      console.error('File processing error:', error);
      const errorMsg = error.message || String(error);

      // ── Graceful Error Handling — không bao giờ hiện raw JSON ──
      if (errorMsg.includes('Requested entity was not found') && window.aistudio) {
        setImageProgress('⚠️ API Key không hợp lệ hoặc đã hết hạn. Đang mở chọn key mới...');
        await window.aistudio.openSelectKey();
      } else if (errorMsg.includes('GEMINI_API_KEY is not defined')) {
        setImageProgress('⚠️ Chưa cấu hình API Key. Vui lòng kiểm tra file .env');
      } else if (/503|UNAVAILABLE|high demand|overloaded/i.test(errorMsg)) {
        setImageProgress('🔴 Máy chủ AI hiện đang quá tải. Hệ thống đã thử lại 3 lần nhưng không thành công. Vui lòng thử lại sau 2-3 phút.');
      } else if (/429|quota|RESOURCE_EXHAUSTED/i.test(errorMsg)) {
        setImageProgress('🔴 Đã vượt giới hạn API. Vui lòng đợi 1 phút rồi thử lại.');
      } else if (/Tất cả model đều thất bại/i.test(errorMsg)) {
        setImageProgress('🔴 Cả hai model AI đều tạm thời không khả dụng. Vui lòng thử lại sau ít phút.');
      } else {
        // Lỗi khác: làm sạch message, không hiện raw JSON
        const cleanMsg = errorMsg
          .replace(/\{[\s\S]*\}/g, '') // Xóa JSON objects
          .replace(/\[[\s\S]*\]/g, '') // Xóa JSON arrays
          .trim() || 'Lỗi không xác định khi xử lý file.';
        setImageProgress(`⚠️ ${cleanMsg}`);
      }
      // Giữ imageProgress hiện 5 giây rồi tắt
      setTimeout(() => setImageProgress(null), 8000);
    } finally {
      setIsProcessing(false);
      if (target) {
        target.value = '';
      }
    }
  };


  // Sync từ Review Board → Firestore (sạch bóng Base64 + undefined)
  // ═══ Hỗ trợ Cluster: tạo document trong /clusters rồi gắn clusterId thật vào câu hỏi ═══
  // ═══ FIX Silent Failure: throw on error, return DigitizationSummary ═══
  const handleSync = async (questions: Question[], sourceFile: string = 'unknown') => {
    // ═══ GUARD: Validate input — chống Raw JSON Dump ═══
    if (!Array.isArray(questions)) {
      console.error('[handleSync] Input không phải Array! Type:', typeof questions);
      setSummaryModal({
        success: false,
        totalInserted: 0,
        totalFailed: 1,
        details: { part1: 0, part2: 0, part3: 0 },
        sourceFile,
        timestamp: new Date(),
        errorDetails: ['Dữ liệu đầu vào không hợp lệ — không phải danh sách câu hỏi.'],
      });
      return;
    }

    // ═══ Filter: Loại bỏ câu hỏi lỗi (content chứa JSON thô, thiếu part, ...) ═══
    const validQuestions = questions.filter(q => {
      if (!q || typeof q !== 'object') return false;
      const c = (q.content || '').trim();
      // Phát hiện raw JSON string bị gán nhầm vào content
      if ((c.startsWith('{') || c.startsWith('[')) && (c.includes('"content"') || c.includes('"part"'))) {
        console.warn('[handleSync] Phát hiện câu hỏi chứa JSON thô, đã loại bỏ.');
        return false;
      }
      if (!c || !q.part) return false;
      return true;
    });

    if (validQuestions.length === 0) {
      setSummaryModal({
        success: false,
        totalInserted: 0,
        totalFailed: questions.length,
        details: { part1: 0, part2: 0, part3: 0 },
        sourceFile,
        timestamp: new Date(),
        errorDetails: ['Không có câu hỏi hợp lệ nào sau khi kiểm tra. Dữ liệu AI trả về có thể bị lỗi format.'],
      });
      return;
    }

    // Ghi đè questions = validQuestions đã lọc
    questions = validQuestions;

    const errorDetails: string[] = [];
    let clusterSavedCount = 0;

    // ── Bước 1: Nhóm câu hỏi theo clusterId (nếu có) ──
    const uploadBatchId = 'batch_' + Date.now();
    const clusterGroups: Map<string, Question[]> = new Map();
    const standaloneQuestions: Question[] = [];

    for (const q of questions) {
      if (q.clusterId) {
        const group = clusterGroups.get(q.clusterId) || [];
        group.push(q);
        clusterGroups.set(q.clusterId, group);
      } else {
        standaloneQuestions.push(q);
      }
    }

    // ── Bước 2: Tạo cluster documents + lưu câu hỏi con ──
    const clusterIdMap: Map<string, string> = new Map(); // tempId → firestoreId

    for (const [tempClusterId, clusterQs] of clusterGroups.entries()) {
      // Trích shared_context từ tag đặc biệt
      const contextTag = clusterQs[0]?.tags?.find(t => t.startsWith('__cluster_context:'));
      const sharedContext = contextTag ? contextTag.replace('__cluster_context:', '') : '';

      try {
        // Tạo cluster document
        const clusterDoc = await addDoc(collection(db, 'clusters'), stripUndefined({
          sharedContext: stripLargeBase64(sharedContext),
          questionIds: [], // Sẽ update sau khi có question IDs
          topic: clusterQs[0]?.topic || '',
          tags: ['Cluster', `${clusterQs.length} câu`],
          createdAt: Timestamp.now(),
        }));
        clusterIdMap.set(tempClusterId, clusterDoc.id);

        // Lưu từng câu hỏi con với clusterId thật
        const questionIds: string[] = [];
        const sortedQs = [...clusterQs].sort((a, b) => (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0));

        for (const q of sortedQs) {
          try {
            const cleanQ = sanitizeQuestion({
              ...q,
              clusterId: clusterDoc.id,
              tags: (q.tags || []).filter(t => !t.startsWith('__cluster_context:')),
            });
            cleanQ.createdAt = Timestamp.now();
            cleanQ.uploadBatchId = uploadBatchId;
            const qDoc = await addDoc(collection(db, 'questions'), cleanQ);
            questionIds.push(qDoc.id);
            clusterSavedCount++;
          } catch (err: any) {
            const errMsg = `Cluster câu ${q.clusterOrder ?? '?'}: ${err?.code || ''} ${err?.message || String(err)}`;
            errorDetails.push(errMsg);
            console.error(`[handleSync] Lỗi lưu câu cluster:`, errMsg);
          }
        }

        // Update cluster doc với questionIds thật
        if (questionIds.length > 0) {
          await updateDoc(doc(db, 'clusters', clusterDoc.id), { questionIds });
        }
        console.info(`[Cluster Sync] ✅ Cluster ${clusterDoc.id}: ${questionIds.length} câu | Context: "${sharedContext.substring(0, 60)}..."`);
      } catch (err: any) {
        const errMsg = `Lỗi tạo cluster ${tempClusterId}: ${err?.code || ''} ${err?.message || String(err)}`;
        errorDetails.push(errMsg);
        console.error(`[handleSync]`, errMsg);
      }
    }

    // ── Bước 3: Lưu câu hỏi standalone (không thuộc cluster) + createdAt ──
    const batchTimestamp = Timestamp.now();
    const results = await Promise.allSettled(
      standaloneQuestions.map(async (q, idx) => {
        try {
          const clean = sanitizeQuestion({
            ...q,
            tags: (q.tags || []).filter(t => !t.startsWith('__cluster_context:')),
          });
          clean.createdAt = batchTimestamp;
          clean.uploadBatchId = uploadBatchId;
          await addDoc(collection(db, 'questions'), clean);
        } catch (err: any) {
          const contentPreview = (q.content || '').substring(0, 50).replace(/\n/g, ' ');
          const errMsg = `Câu ${idx + 1} (P${q.part}): ${err?.code || ''} ${err?.message || String(err)} — "${contentPreview}..."`;
          errorDetails.push(errMsg);
          console.error(`[handleSync] Lỗi lưu câu standalone ${idx + 1}:`, {
            error: err?.message || err,
            code: err?.code,
            questionPart: q.part,
            contentSize: q.content?.length,
          });
          throw err;
        }
      })
    );

    const standaloneFailed = results.filter(r => r.status === 'rejected').length;
    const standaloneSaved = results.filter(r => r.status === 'fulfilled').length;
    const totalSaved = clusterSavedCount + standaloneSaved;
    const totalFailed = errorDetails.length;

    // ── Thống kê theo Phần ──
    const savedQuestions = questions.filter((_, idx) => {
      // Cluster questions: đã track qua clusterSavedCount
      // Standalone questions: check results
      if (questions[idx]?.clusterId) return true; // approximate — cluster errors tracked separately
      const standaloneIdx = standaloneQuestions.indexOf(questions[idx]);
      if (standaloneIdx >= 0 && results[standaloneIdx]?.status === 'fulfilled') return true;
      return false;
    });
    const part1Count = savedQuestions.filter(q => q.part === 1).length;
    const part2Count = savedQuestions.filter(q => q.part === 2).length;
    const part3Count = savedQuestions.filter(q => q.part === 3).length;

    // ═══ SUMMARY MODAL — thay thế banner cũ ═══
    const summary: DigitizationSummary = {
      success: totalFailed === 0,
      totalInserted: totalSaved,
      totalFailed,
      details: { part1: part1Count, part2: part2Count, part3: part3Count },
      sourceFile,
      timestamp: new Date(),
      errorDetails,
    };
    setSummaryModal(summary);

    if (totalFailed > 0) {
      console.warn(
        `[handleSync] ⚠️ ${totalSaved}/${questions.length} câu lưu OK | ${totalFailed} lỗi`,
        errorDetails
      );
      // ═══ FIX SILENT FAILURE: Nếu TOÀN BỘ thất bại → throw error để catch block xử lý ═══
      if (totalSaved === 0) {
        throw new Error(`Lưu thất bại hoàn toàn: ${errorDetails[0] || 'Lỗi không xác định'}`);
      }
    } else {
      console.info(`[handleSync] ✅ Tổng: ${questions.length} câu | ${clusterGroups.size} cluster | ${standaloneQuestions.length} standalone`);
    }

    if (totalSaved > 0) {
      onQuestionsAdded();
    }
    setParseErrors([]);
  };

  // ═══════════════════════════════════════════════════════════════
  //  ACTION HANDLERS — sau khi AI xử lý xong
  // ═══════════════════════════════════════════════════════════════

  const handleSaveToBank = async () => {
    if (!pendingQuestions) return;
    setShowActionModal(false);
    setImageProgress('💾 Đang lưu vào Kho Câu Hỏi...');
    try {
      await handleSync(pendingQuestions, pendingSourceFile);
    } finally {
      setImageProgress(null);
      setPendingQuestions(null);
    }
  };

  const handleCreateExam = async () => {
    if (!pendingQuestions || !newExamTitle.trim()) {
      toast.error('Vui lòng nhập tên đề thi.');
      return;
    }
    setIsSavingExam(true);
    try {
      const batch = writeBatch(db);
      const questionIds: string[] = [];

      // 1. Tạo từng câu hỏi (nếu checkbox "cũng lưu vào kho" checked)
      for (const q of pendingQuestions) {
        const clean = sanitizeQuestion(q);
        clean.createdAt = Timestamp.now();
        if (alsoSaveToBank) {
          const qRef = doc(collection(db, 'questions'));
          batch.set(qRef, clean);
          questionIds.push(qRef.id);
        }
      }

      // 2. Tạo exam document
      const examRef = doc(collection(db, 'exams'));
      batch.set(examRef, {
        title: newExamTitle.trim(),
        questions: pendingQuestions.map(q => sanitizeQuestion(q)),
        questionIds: alsoSaveToBank ? questionIds : [],
        createdAt: Timestamp.now(),
        createdBy: auth.currentUser?.uid || 'admin',
        type: 'Digitized',
        sourceFile: pendingSourceFile,
      });

      // 3. Atomic commit
      await batch.commit();

      toast.success(`✅ Đã tạo đề "${newExamTitle}" với ${pendingQuestions.length} câu!`);
      if (alsoSaveToBank) {
        toast.info(`📚 ${questionIds.length} câu cũng đã lưu vào Kho Câu Hỏi.`);
        onQuestionsAdded();
      }

      setShowCreateExamModal(false);
      setShowActionModal(false);
      setPendingQuestions(null);
      setNewExamTitle('');
    } catch (e: any) {
      console.error('[handleCreateExam]', e);
      toast.error(`Lỗi tạo đề thi: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      setIsSavingExam(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black text-white">SỐ HÓA ĐỀ THI AI</h3>
          <p className="text-slate-400 text-sm">Upload bất kỳ đề nào — AI tự nhận diện, phân loại, gắn thẻ và sắp xếp.</p>
        </div>
        <div className="bg-red-600/10 p-3 rounded-2xl">
          <BrainCircuit className="text-red-600 w-8 h-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">1. Chế độ số hóa</p>
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setDigitizeMode('AI')}
              className={cn(
                "flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2",
                digitizeMode === 'AI' ? "bg-red-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <BrainCircuit className="w-3 h-3" /> AI (Tự do)
            </button>
            <button
              onClick={() => setDigitizeMode('Standard')}
              className={cn(
                "flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2",
                digitizeMode === 'Standard' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Settings className="w-3 h-3" /> Quy tắc (Chuẩn)
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">2. Gợi ý chủ đề (tùy chọn)</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTopicHint('')}
              className={cn(
                "py-1.5 px-3 rounded-lg text-[10px] font-bold border transition-all",
                topicHint === '' ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-800 border-slate-700 text-slate-400"
              )}
            >
              🤖 AI tự nhận diện
            </button>
            {(['Dao động cơ', 'Sóng cơ', 'Điện xoay chiều', 'Từ trường', 'Quang học', 'Vật lí nhiệt', 'Khí lí tưởng', 'Vật lí hạt nhân', 'Lượng tử ánh sáng', 'Động lực học', 'Năng lượng'] as Topic[]).map(t => (
              <button
                key={t}
                onClick={() => setTopicHint(t)}
                className={cn(
                  "py-1.5 px-2.5 rounded-lg text-[10px] font-bold border transition-all",
                  topicHint === t ? (digitizeMode === 'AI' ? "bg-red-600 border-red-600 text-white" : "bg-blue-600 border-blue-600 text-white") : "bg-slate-800 border-slate-700 text-slate-400"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">3. Tải lên file đề thi</p>
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".pdf,.docx,.json" 
            onChange={handleFileUpload}
            className="hidden"
            disabled={isProcessing}
            id="digitize-file-input"
          />
          <div 
            className={cn(
              "border-2 border-dashed rounded-2xl p-6 text-center transition-all group cursor-pointer select-none",
              isProcessing 
                ? "border-slate-700 opacity-50 cursor-not-allowed" 
                : isDragging
                  ? (digitizeMode === 'AI' ? "border-red-500 bg-red-500/10 scale-[1.02]" : "border-blue-500 bg-blue-500/10 scale-[1.02]")
                  : (digitizeMode === 'AI' ? "border-slate-700 hover:border-red-500/60 hover:bg-red-500/5" : "border-slate-700 hover:border-blue-500/60 hover:bg-blue-500/5")
            )}
            onClick={() => { if (!isProcessing && fileInputRef.current) fileInputRef.current.click(); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setIsDragging(false);
              if (isProcessing) return;
              const file = e.dataTransfer.files?.[0];
              if (file && fileInputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInputRef.current.files = dt.files;
                fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }}
          >
            <div className="flex items-center justify-center gap-3 pointer-events-none">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                isDragging ? "bg-red-500/30 scale-110" : "bg-slate-800 group-hover:bg-red-500/20 group-hover:scale-110"
              )}>
                <Download className={cn(
                  "w-6 h-6 transition-colors",
                  isDragging ? "text-red-400" : "text-slate-400 group-hover:text-red-400"
                )} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">
                  {isDragging ? '📥 Thả file vào đây...' : 'Chọn file hoặc kéo thả vào đây'}
                </p>
                <p className="text-[10px] text-slate-500">📄 PDF (khuyên dùng) · 📝 DOCX · 📋 JSON</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PROGRESS / ERROR STATUS BAR ═══ */}
      {(isProcessing || imageProgress) && (
        <div className="flex flex-col items-center justify-center gap-2">
          <div className={cn(
            "flex items-center gap-3 font-bold",
            isProcessing ? "text-red-500 animate-pulse" : "text-amber-400"
          )}>
            <BrainCircuit className={isProcessing ? "animate-spin" : ""} />
            {imageProgress || 'AI ĐANG BÓC TÁCH DỮ LIỆU & CÔNG THỨC...'}
          </div>
          {isProcessing && imageProgress && (
            <p className="text-[10px] text-slate-500">Quá trình này có thể mất 30-60 giây với PDF dài</p>
          )}
        </div>
      )}

      {/* ═══ SUMMARY MODAL — Báo cáo tổng kết số hóa (Glassmorphism) ═══ */}
      <AnimatePresence>
        {summaryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setSummaryModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg rounded-3xl border overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.92) 100%)',
                borderColor: summaryModal.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                boxShadow: summaryModal.success
                  ? '0 0 60px rgba(16,185,129,0.15), 0 25px 50px rgba(0,0,0,0.5)'
                  : '0 0 60px rgba(239,68,68,0.15), 0 25px 50px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Gradient accent bar */}
              <div className="h-1 w-full" style={{
                background: summaryModal.success
                  ? 'linear-gradient(90deg, #10b981, #06b6d4, #3b82f6)'
                  : 'linear-gradient(90deg, #ef4444, #f59e0b, #ef4444)',
              }} />

              {/* Close button */}
              <button
                onClick={() => setSummaryModal(null)}
                className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-8 space-y-6">
                {/* ── Header ── */}
                <div className="flex items-center gap-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2, damping: 12 }}
                    className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0",
                      summaryModal.success ? "bg-emerald-500/20" : "bg-red-500/20"
                    )}
                  >
                    {summaryModal.success
                      ? <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                      : <AlertTriangle className="w-9 h-9 text-red-400" />
                    }
                  </motion.div>
                  <div>
                    <h3 className={cn(
                      "text-xl font-black",
                      summaryModal.success ? "text-emerald-400" : "text-red-400"
                    )}>
                      {summaryModal.success ? '✅ Số hóa thành công!' : '⚠️ Số hóa có lỗi'}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Hệ thống đã bóc tách thành công <span className="text-white font-black text-base">{summaryModal.totalInserted}</span> câu hỏi từ nguồn đề <span className="text-cyan-400 font-bold">"{summaryModal.sourceFile}"</span>
                    </p>
                  </div>
                </div>

                {/* ── Chi tiết Part breakdown ── */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Phần I · TNKQ', count: summaryModal.details.part1, color: 'from-blue-500/20 to-blue-600/5', textColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
                    { label: 'Phần II · Đ/S', count: summaryModal.details.part2, color: 'from-amber-500/20 to-amber-600/5', textColor: 'text-amber-400', borderColor: 'border-amber-500/20' },
                    { label: 'Phần III · TLN', count: summaryModal.details.part3, color: 'from-emerald-500/20 to-emerald-600/5', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className={cn(
                        "rounded-2xl p-4 text-center border bg-gradient-to-b",
                        item.color, item.borderColor
                      )}
                    >
                      <p className={cn("text-3xl font-black", item.textColor)}>{item.count}</p>
                      <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">{item.label}</p>
                    </motion.div>
                  ))}
                </div>

                {/* ── Thông tin bổ sung ── */}
                <div className="bg-slate-800/50 rounded-2xl p-4 space-y-2 border border-slate-700/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">📄 File nguồn</span>
                    <span className="text-white font-bold">{summaryModal.sourceFile}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">⏰ Thời gian</span>
                    <span className="text-white font-bold">{summaryModal.timestamp.toLocaleTimeString('vi-VN')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">📊 Tổng câu phát hiện</span>
                    <span className="text-white font-bold">{summaryModal.totalInserted + summaryModal.totalFailed}</span>
                  </div>
                  {summaryModal.totalFailed > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-red-400">❌ Lỗi lưu</span>
                      <span className="text-red-400 font-black">{summaryModal.totalFailed} câu</span>
                    </div>
                  )}
                </div>

                {/* ── Error details (nếu có lỗi) ── */}
                {summaryModal.errorDetails.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-2"
                  >
                    <p className="text-xs font-black text-red-400 uppercase">🔴 Chi tiết lỗi</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {summaryModal.errorDetails.map((err, i) => (
                        <p key={i} className="text-[11px] text-red-300/80 font-mono leading-relaxed">
                          • {err}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── CTA ── */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setSummaryModal(null)}
                    className={cn(
                      "flex-1 py-3 rounded-2xl text-sm font-black transition-all",
                      summaryModal.success
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                        : "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20"
                    )}
                  >
                    {summaryModal.success ? '🎉 Tuyệt vời! Đóng' : '🔧 Đã hiểu, đóng'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ACTION CHOICE MODAL — 2 nút sau khi AI xử lý xong ═══ */}
      <AnimatePresence>
        {showActionModal && pendingQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-8 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-black text-white">AI XỬ LÝ XONG!</h3>
                <p className="text-slate-400 text-sm mt-2">
                  Đã phát hiện <span className="text-white font-black text-lg">{pendingQuestions.length}</span> câu hỏi từ file <span className="text-cyan-400 font-bold">"{pendingSourceFile}"</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-blue-400">{pendingQuestions.filter(q => q.part === 1).length}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Phần I</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-amber-400">{pendingQuestions.filter(q => q.part === 2).length}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Phần II</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-emerald-400">{pendingQuestions.filter(q => q.part === 3).length}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Phần III</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 text-center font-bold uppercase tracking-widest">Chọn hành động:</p>

              <div className="space-y-3">
                <button
                  onClick={() => { setShowActionModal(false); setShowReviewBoard(true); }}
                  className="w-full p-4 bg-fuchsia-600/10 border border-fuchsia-500/30 rounded-2xl hover:bg-fuchsia-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-fuchsia-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Pencil className="w-6 h-6 text-fuchsia-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">✏️ Duyệt & Chỉnh sửa từng câu</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Sửa nội dung, chèn ảnh, chỉnh đáp án, phát hiện trùng lặp trước khi lưu.</p>
                  </div>
                </button>

                <button
                  onClick={() => { setShowActionModal(false); setShowPreviewModal(true); }}
                  className="w-full p-4 bg-cyan-600/10 border border-cyan-500/30 rounded-2xl hover:bg-cyan-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-cyan-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Eye className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">👀 Xem nhanh (Read-only)</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Lướt nhanh kết quả, không chỉnh sửa.</p>
                  </div>
                </button>

                <button
                  onClick={handleSaveToBank}
                  className="w-full p-4 bg-blue-600/10 border border-blue-500/30 rounded-2xl hover:bg-blue-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <BookOpen className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">📚 Lưu vào Kho Câu Hỏi</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Các câu sẽ vào ngân hàng đề, sẵn sàng tạo đề sau.</p>
                  </div>
                </button>

                <button
                  onClick={() => { setShowCreateExamModal(true); setNewExamTitle(''); }}
                  className="w-full p-4 bg-violet-600/10 border border-violet-500/30 rounded-2xl hover:bg-violet-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-violet-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">📝 Tạo Đề Thi Riêng</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Tạo đề thi độc lập, sẵn sàng phát cho phòng thi.</p>
                  </div>
                </button>
              </div>

              <button
                onClick={() => { setShowActionModal(false); setPendingQuestions(null); }}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 font-bold transition-colors"
              >
                Hủy bỏ — không lưu
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PREVIEW MODAL — Xem trước các câu do AI số hóa ═══ */}
      <AnimatePresence>
        {showPreviewModal && pendingQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col p-4 md:p-8"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)' }}
          >
            <div className="w-full max-w-5xl mx-auto bg-slate-900 border border-cyan-500/30 rounded-3xl flex flex-col h-full shadow-2xl shadow-cyan-900/20 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-800/80 bg-slate-900/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">KẾT QUẢ SỐ HÓA TỪ AI</h2>
                    <p className="text-sm text-cyan-400 font-bold mt-0.5">{pendingQuestions.length} câu hỏi • {pendingSourceFile}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowPreviewModal(false); setShowActionModal(true); }}
                  className="p-3 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 rounded-xl transition-colors"
                  title="Quay lại"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-slate-950/30">
                <div className="space-y-6">
                  {pendingQuestions.map((q, idx) => (
                    <div key={idx} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 hover:border-cyan-500/30 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-cyan-950 text-cyan-400 text-xs font-bold rounded-lg border border-cyan-900/50 uppercase">Câu {idx + 1}</span>
                          <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 uppercase">Phần {q.part}</span>
                          <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700">{q.level}</span>
                          {q.topic && <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs flex items-center gap-1 rounded-lg border border-slate-700"><CheckCircle2 className="w-3 h-3 text-emerald-500"/> {q.topic}</span>}
                        </div>
                      </div>

                      <div className="mb-4 text-sm text-slate-200">
                        <MathRenderer content={q.content} />
                      </div>

                      {(q.part === 1 || q.part === 2) && q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                          {q.options.map((opt, iMap) => {
                            const isCorrect = q.part === 1 
                              ? String(q.correctAnswer) === String(iMap + 1)
                              : String(q.correctAnswer).split(',').includes(String(iMap + 1));
                            
                            return (
                              <div key={iMap} className={`flex gap-3 p-3 rounded-xl border ${isCorrect ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-slate-900/50 border-slate-700/50'}`}>
                                <span className={`font-bold shrink-0 ${isCorrect ? 'text-emerald-400' : 'text-slate-400'}`}>
                                  {String.fromCharCode(65 + iMap)}.
                                </span>
                                <div className={`text-sm ${isCorrect ? 'text-emerald-100' : 'text-slate-300'}`}>
                                  <MathRenderer content={opt} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.part === 3 && q.correctAnswer !== undefined && (
                        <div className="mb-4 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl inline-block">
                          <span className="text-sm font-bold text-emerald-400">Đáp án: </span>
                          <span className="text-sm font-black text-white">{q.correctAnswer}</span>
                        </div>
                      )}

                      {q.explanation && (
                        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lời giải chi tiết</p>
                          <div className="text-sm text-slate-300 leading-relaxed">
                            <MathRenderer content={q.explanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 sm:p-6 border-t border-slate-800/80 bg-slate-900/90 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 shrink-0">
                 <button
                   onClick={() => { setShowPreviewModal(false); setShowActionModal(true); }}
                   className="px-6 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors uppercase tracking-wider text-sm w-full sm:w-auto"
                 >
                   Quay lại
                 </button>
                 <button
                   onClick={() => { setShowPreviewModal(false); handleSaveToBank(); }}
                   className="px-6 py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 active:scale-95 uppercase tracking-wider text-sm flex items-center justify-center gap-2 w-full sm:w-auto"
                 >
                   <BookOpen className="w-4 h-4" />
                   Lưu vào Kho (Đã Kiểm tra)
                 </button>
                 <button
                   onClick={() => { setShowPreviewModal(false); setShowCreateExamModal(true); setNewExamTitle(''); }}
                   className="px-6 py-3 rounded-xl font-black text-white bg-violet-600 hover:bg-violet-500 transition-all shadow-lg shadow-violet-500/20 active:scale-95 uppercase tracking-wider text-sm flex items-center justify-center gap-2 w-full sm:w-auto"
                 >
                   <FileText className="w-4 h-4" />
                   Tạo Đề Thi Riêng
                 </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ QUESTION REVIEW BOARD — Duyệt & Chỉnh sửa từng câu (Human-in-the-loop) ═══ */}
      <AnimatePresence>
        {showReviewBoard && pendingQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(16px)' }}
          >
            <QuestionReviewBoard
              initialQuestions={pendingQuestions}
              parseErrors={parseErrors}
              topic={topicHint || ''}
              onSync={async (reviewedQuestions) => {
                setShowReviewBoard(false);
                setImageProgress('💾 Đang lưu vào Kho Câu Hỏi...');
                try {
                  await handleSync(reviewedQuestions, pendingSourceFile);
                } finally {
                  setImageProgress(null);
                  setPendingQuestions(null);
                }
              }}
              onCancel={() => {
                setShowReviewBoard(false);
                setShowActionModal(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ CREATE EXAM MODAL — Nhập tên đề thi ═══ */}
      <AnimatePresence>
        {showCreateExamModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md bg-slate-900 border border-violet-500/30 rounded-3xl p-8 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center">
                <h3 className="text-xl font-black text-white">📝 Tạo Đề Thi Riêng</h3>
                <p className="text-slate-400 text-sm mt-1">{pendingQuestions?.length || 0} câu từ "{pendingSourceFile}"</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tên đề thi *</label>
                <input
                  type="text"
                  value={newExamTitle}
                  onChange={e => setNewExamTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateExam()}
                  placeholder="VD: Đề kiểm tra 1 tiết — Chương Từ trường"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none"
                  autoFocus
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                <input
                  type="checkbox"
                  checked={alsoSaveToBank}
                  onChange={e => setAlsoSaveToBank(e.target.checked)}
                  className="w-5 h-5 bg-slate-800 border-slate-700 rounded accent-violet-500"
                />
                <div>
                  <span className="text-xs text-slate-300 font-bold">Cũng lưu vào Kho Câu Hỏi</span>
                  <p className="text-[10px] text-slate-500 mt-0.5">Câu hỏi sẽ có trong ngân hàng đề để tái sử dụng</p>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateExamModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-all"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleCreateExam}
                  disabled={isSavingExam || !newExamTitle.trim()}
                  className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  {isSavingExam ? <div className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-spin" /> : null}
                  {isSavingExam ? 'Đang lưu...' : 'Lưu & Tạo Đề'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

// ── Helper: Chuẩn hóa text bỏ dấu tiếng Việt cho tìm kiếm ──
const normalizeText = (str: string): string =>
  str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/\s+/g, ' ')
    .trim();

const ITEMS_PER_PAGE = 20;

const QuestionBank = ({ onCountChanged, onQuestionsLoaded }: { onCountChanged?: (delta: number) => void; onQuestionsLoaded?: (count: number) => void }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTopics, setFilterTopics] = useState<Set<string>>(new Set());
  const [filterSubTopics, setFilterSubTopics] = useState<Set<string>>(new Set());
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set(['Khối 12']));
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [filterPart, setFilterPart] = useState<Part | 'All'>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // ── Search & Level filter ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  // ── Time filter ──
  const [filterTime, setFilterTime] = useState<'All' | '1h' | 'today' | '7d' | '30d'>('All');
  // ── Status filter ──
  const [filterStatus, setFilterStatus] = useState<'All' | 'draft' | 'published'>('All');
  // ── Inline edit state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editIsTrap, setEditIsTrap] = useState(false);
  const [editExplanation, setEditExplanation] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [quickImgSaving, setQuickImgSaving] = useState<string | null>(null);

  // ── Thêm state cho Bulk Delete & Batch Filter ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [filterBatchId, setFilterBatchId] = useState<string | 'All'>('All');

  // Load danh sách UploadBatchId
  const uploadBatches = useMemo(() => {
    const batches = new Map<string, { id: string, count: number, timestamp: number }>();
    questions.forEach(q => {
      if (q.uploadBatchId && q.createdAt) {
        if (!batches.has(q.uploadBatchId)) {
          const ts = q.createdAt?.toDate ? q.createdAt.toDate().getTime() : new Date(q.createdAt).getTime();
          batches.set(q.uploadBatchId, { id: q.uploadBatchId, count: 1, timestamp: ts });
        } else {
          batches.get(q.uploadBatchId)!.count++;
        }
      }
    });
    return Array.from(batches.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [questions]);

  // ── Fetch questions ONE-SHOT — Bypass cache để sửa lỗi 0 câu hỏi ──
  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const qRef = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocsFromServer(qRef);
      // [FIX] Đặt `id: d.id` SAU `...d.data()` để document ID thật luôn thắng
      // Trước đây: { id: d.id, ...d.data() } → d.data().id ghi đè d.id → saveEdit dùng sai ID
      const qs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Question));
      setQuestions(qs);
      // Đồng bộ số lượng thực tế lên Header Dashboard
      onQuestionsLoaded?.(qs.length);
    } catch (error) {
      console.warn('[fetchQuestions] Lỗi khi tải câu hỏi:', error);
      // Không throw — giữ UI hoạt động
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // ── Lọc kết hợp Search + Topic + Part + Level + Time + Batch ──
  const filtered = useMemo(() => {
    let result = questions;
    if (filterBatchId !== 'All') result = result.filter(q => q.uploadBatchId === filterBatchId);
    // Filter topic + subtopic
    if (filterTopics.size > 0 || filterSubTopics.size > 0) {
      result = result.filter(q => {
        const inSub = filterSubTopics.has(q.subTopic || '');
        if (inSub) return true;
        
        const matchedTopicName = Array.from(filterTopics).find(tn => matchesTopic(q.topic, tn));
        if (matchedTopicName) {
           const subTopicsOfThisTopic = PHYSICS_TOPICS.flatMap(g => g.topics).find(t => t.name === matchedTopicName)?.subTopics || [];
           const hasCheckedSubForThisTopic = subTopicsOfThisTopic.some(sub => filterSubTopics.has(sub));
           if (!hasCheckedSubForThisTopic) return true;
        }
        return false;
      });
    }
    // Filter part
    if (filterPart !== 'All') result = result.filter(q => q.part === filterPart);
    // Filter levels (multi-select)
    if (filterLevels.size > 0) result = result.filter(q => filterLevels.has(q.level));
    // Filter status (treat undefined as published)
    if (filterStatus !== 'All') {
      result = result.filter(q => {
        const status = q.status || 'published';
        return status === filterStatus;
      });
    }
    // Filter by upload time
    if (filterTime !== 'All') {
      const now = Date.now();
      const cutoffs: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        'today': (() => {
          const d = new Date(); d.setHours(0, 0, 0, 0); return now - d.getTime();
        })(),
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      const cutoff = cutoffs[filterTime] ?? 0;
      result = result.filter(q => {
        if (!q.createdAt) return false;
        const ts = q.createdAt?.toDate ? q.createdAt.toDate().getTime() : new Date(q.createdAt).getTime();
        return (now - ts) <= cutoff;
      });
    }
    // Full-text search
    if (searchQuery.trim()) {
      const needle = normalizeText(searchQuery);
      result = result.filter(q => {
        const haystack = normalizeText(
          [q.content, q.explanation, ...(q.tags || []), q.topic, q.level].join(' ')
        );
        return haystack.includes(needle);
      });
    }
    // Mặc định luôn sắp xếp mới nhất lên đầu (cho cả old docs chưa có createdAt)
    result = [...result].sort((a, b) => {
      const tsA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tsB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tsB - tsA;
    });
    return result;
  }, [questions, filterTopics, filterSubTopics, filterPart, filterLevels, filterStatus, filterTime, searchQuery]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);
  // Reset page khi filter thay đổi
  useEffect(() => { setCurrentPage(1); }, [filterTopics, filterSubTopics, filterPart, filterLevels, filterStatus, filterTime, filterBatchId, searchQuery]);

  const hasActiveFilters = filterTopics.size > 0 || filterSubTopics.size > 0 || filterPart !== 'All' || filterLevels.size > 0 || filterStatus !== 'All' || filterTime !== 'All' || searchQuery.trim() !== '';
  const resetAllFilters = () => {
    setFilterTopics(new Set());
    setFilterSubTopics(new Set());
    setFilterPart('All');
    setFilterLevels(new Set());
    setFilterStatus('All');
    setFilterTime('All');
    setFilterBatchId('All');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const toggleLevel = (level: string) => {
    setFilterLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  };

  // ── Thống kê ──
  const stats = useMemo(() => {
    const topicSet = new Set(questions.map(q => q.topic));
    const p1 = questions.filter(q => q.part === 1).length;
    const p2 = questions.filter(q => q.part === 2).length;
    const p3 = questions.filter(q => q.part === 3).length;
    const needsImage = questions.filter(q => 
      /\[HÌNH MINH HỌA/i.test(q.content) || 
      /<img[^>]*src=["']\s*["']/i.test(q.content) ||
      /src=["']data:image\/png;base64,ERROR["']/i.test(q.content)
    ).length;
    return { total: questions.length, p1, p2, p3, topics: topicSet.size, needsImage };
  }, [questions]);

  // Hàm hỗ trợ chống kẹt Firebase nếu mất mạng/hết Quota
  const withTimeout = (promise: Promise<any>, ms: number) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
    ]);
  };

  const deleteQuestion = async (id: string) => {
    if (!window.confirm('Thầy có chắc chắn muốn xóa câu hỏi này không?')) return;
    
    // Giao diện chỉ tiến hành báo đang xoá
    toast.info('Đang xóa câu hỏi...');

    // Optimistic UI Update - Xóa ngay trên màn hình
    setQuestions(prev => prev.filter(q => q.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    onCountChanged?.(-1);
    toast.success('Xóa câu hỏi thành công (đang đồng bộ)!');

    // Chạy ngầm xoá dữ liệu trên server
    deleteDoc(doc(db, 'questions', id)).catch(err => {
        console.error('Lỗi khi xoá ngầm:', err);
        // Có thể hiện cảnh báo nhỏ nếu cần, nhưng không block flow của người dùng
    });
  };

  const deleteSelectedQuestions = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Thầy có chắc chắn muốn xóa ${selectedIds.size} câu hỏi đã chọn?`)) return;
    setIsDeletingBulk(true);
    try {
      const idsArray = Array.from(selectedIds);
      let deletedCount = 0;
      toast.info(`Đang xóa ${idsArray.length} câu...`);
      
      // Xóa tuần tự từng câu hỏi bằng Optimistic UI
      for (const id of idsArray) {
        // Cập nhật UI ngay lập tức cho từng câu
        deletedCount++;
        setQuestions(prev => prev.filter(q => q.id !== id));
        setSelectedIds(prev => { 
           const newSet = new Set(prev); 
           newSet.delete(id); 
           return newSet; 
        });

        // Xoá ngầm trên Backend
        deleteDoc(doc(db, 'questions', id)).catch(err => console.error(err));
      }
      
      onCountChanged?.(-deletedCount);
      toast.success(`✅ Xong! Đã xóa ${deletedCount} câu (đang đồng bộ ngầm).`);
    } catch (error: any) {
      console.error('[deleteSelectedQuestions] LỖI:', error);
      toast.error('Có lỗi xảy ra khi xoá đồng loạt (UI).');
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedQuestions.map(q => q.id!)));
    }
  };

  const toggleStatus = async (q: Question) => {
    if (!q.id) return;
    try {
      const newStatus = (q.status || 'published') === 'published' ? 'draft' : 'published';
      
      // Cách 1: Chờ hoàn thành mới báo UI
      await withTimeout(updateDoc(doc(db, 'questions', q.id), { status: newStatus }), 8000);
      
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, status: newStatus } : item));
      toast.success(newStatus === 'published' ? 'Đã duyệt câu hỏi vào thư viện' : 'Đã chuyển thành bản nháp');
    } catch (error: any) {
      if (error.message === 'TIMEOUT') {
        toast.error('🚨 Lỗi Server (Timeout): Server phản hồi quá chậm!');
      } else {
        toast.error('🚨 Lỗi hệ thống, trạng thái vẫn như cũ!');
        handleFirestoreError(error, OperationType.UPDATE, `questions/${q.id}`);
      }
    }
  };

  // ── Inline Edit ──
  const startEdit = (q: Question) => {
    setEditingId(q.id!);
    setEditContent(q.content);
    setEditExplanation(q.explanation || '');
    setEditOptions(q.options ? [...q.options] : []);
    // Đảm bảo đú́ng kiểu: Part 2 correctAnswer phải là boolean[]
    if (q.part === 2) {
      const ca = Array.isArray(q.correctAnswer)
        ? q.correctAnswer.map((v: any) => v === true || v === 'true')
        : [false, false, false, false];
      setEditCorrectAnswer(ca);
    } else {
      setEditCorrectAnswer(q.correctAnswer ?? (q.part === 1 ? 0 : 0));
    }
    setEditIsTrap(q.isTrap || false);
    setExpandedId(q.id!);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditExplanation('');
    setEditOptions([]);
    setEditCorrectAnswer(null);
    setEditIsTrap(false);
  };

  const saveEdit = async (q: Question) => {
    if (!q.id) {
      toast.error('Lỗi: Không tìm thấy ID câu hỏi. Hãy làm mới trang và thử lại.');
      return;
    }
    setEditSaving(true);
    try {
      // [FIX] Không dùng stripLargeBase64 cho saveEdit — quá mạnh, xóa ảnh Admin vừa chèn.
      // Chỉ dùng stripUndefined để đảm bảo Firestore không reject undefined.
      const updateData: any = stripUndefined({
        content: editContent || '',
        explanation: editExplanation || '',
        status: q.status || 'published',
        isTrap: editIsTrap
      });
      if (q.part === 1 || q.part === 2) {
        // Đảm bảo options array không chứa undefined — thay bằng '' để giữ đúng index
        updateData.options = (editOptions || []).map(opt => opt ?? '');
        updateData.correctAnswer = editCorrectAnswer;
      }
      if (q.part === 3) {
        updateData.correctAnswer = Number(editCorrectAnswer) || 0;
      }
      
      // [FIX] Kiểm tra document size trước khi gửi — Firestore reject > 1MB
      const payloadSize = new Blob([JSON.stringify(updateData)]).size;
      if (payloadSize > 900_000) { // 900KB safety margin
        toast.error(`⚠️ Nội dung quá lớn (${Math.round(payloadSize / 1024)}KB). Firestore giới hạn 1MB. Hãy cắt bớt ảnh hoặc nội dung.`);
        setEditSaving(false);
        return;
      }
      
      console.info(`[saveEdit] Lưu câu ${q.id} | Size: ${Math.round(payloadSize / 1024)}KB`);
      
      // Optimistic UI Update
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, ...updateData } : item));
      toast.success('✅ Đã lưu (đang đồng bộ)!');
      setEditingId(null); // Tắt form edit ngay
      
      // Pushing to Firebase in background without blocking UI
      updateDoc(doc(db, 'questions', q.id), updateData).catch((error: any) => {
        console.error('[saveEdit] LỖI đồng bộ ngầm:', error);
        if (error?.message?.includes('TIMEOUT')) {
           toast.error('⚠️ Máy chủ phản hồi chậm hoặc hết Quota. Trạng thái đã lưu offline.');
        } else {
           toast.error(`⚠️ Lỗi đẩy dữ liệu: ${error?.message}`);
        }
      });
      
    } catch (error: any) {
      console.error('[saveEdit] LỖI:', error);
      toast.error('Lỗi khi chuẩn bị dữ liệu lưu.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Nén ảnh (Canvas JPEG 40%, max 600px) — tránh vượt 1MB Firestore ──
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const MAX_W = 600;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không đọc được ảnh'));
      };
      img.src = url;
    });
  };

  // ── Chèn ảnh vào content/explanation (trong edit mode) ──
  const handleImageInsert = (target: 'content' | 'explanation') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        const imgMarkdown = `\n![](${dataUrl})\n`;
        if (target === 'content') {
          setEditContent(prev => prev + imgMarkdown);
        } else {
          setEditExplanation(prev => prev + imgMarkdown);
        }
      } catch (err) {
        toast.error('Không thể đọc ảnh. Kiểm tra file.');
      }
    };
    input.click();
  };

  // ── Chèn ảnh nhanh (không cần edit mode) — lưu thẳng Firestore ──
  const handleQuickImageInsert = (q: Question) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !q.id) return;
      setQuickImgSaving(q.id);
      try {
        const dataUrl = await compressImage(file);
        // Xóa placeholder rồi chèn ảnh vào CUỐI nội dung
        let newContent = q.content
          .replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '')
          .trim();
        newContent = newContent + `\n\n![](${dataUrl})`;
        await updateDoc(doc(db, 'questions', q.id), { content: newContent });
        
        // Cập nhật local state
        setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, content: newContent } : item));
        toast.success('Đã chèn ảnh trực tiếp thành công!');
      } catch (err) {
        toast.error('Lỗi chèn ảnh. Kiểm tra file hoặc kết nối.');
        console.error('[QuickImageInsert]', err);
      } finally {
        setQuickImgSaving(null);
      }
    };
    input.click();
  };

  // ── Kiểm tra câu thiếu ảnh ──
  const hasImageIssue = (q: Question) => {
    return /\[HÌNH MINH HỌA/i.test(q.content) || 
           /<img[^>]*src=["']\s*["']/i.test(q.content) ||
           /src=["']data:image\/png;base64,ERROR["']/i.test(q.content);
  };

  // ── Helper cho TreeView ──
  const toggleGrade = (grade: string) => {
    setExpandedGrades(prev => { const n = new Set(prev); if(n.has(grade)) n.delete(grade); else n.add(grade); return n; });
  };
  const toggleTopicExpand = (topic: string) => {
    setExpandedTopics(prev => { const n = new Set(prev); if(n.has(topic)) n.delete(topic); else n.add(topic); return n; });
  };
  const toggleTopicCheck = (topic: string) => {
    setFilterTopics(prev => { const n = new Set(prev); if(n.has(topic)) n.delete(topic); else n.add(topic); return n; });
  };
  const toggleSubTopicCheck = (sub: string) => {
    setFilterSubTopics(prev => { const n = new Set(prev); if(n.has(sub)) n.delete(sub); else n.add(sub); return n; });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
      {/* ── Header + Thống kê ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-2xl font-black text-white">KHO CÂU HỎI ĐÃ SỐ HÓA</h3>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="text-slate-400 text-sm font-bold">Tổng: {stats.total} câu</span>
              <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">P1: {stats.p1}</span>
              <span className="text-[10px] bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">P2: {stats.p2}</span>
              <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">P3: {stats.p3}</span>
              {stats.needsImage > 0 && (
                <span className="text-[10px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
                  ⚠️ {stats.needsImage} câu thiếu ảnh
                </span>
              )}
            </div>
          </div>
          <button
            onClick={fetchQuestions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all disabled:opacity-40"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            )}
            Làm mới
          </button>
        </div>

        {/* ══════════ LAYOUT 2 CỘT ══════════ */}
        <div className="flex flex-col xl:flex-row gap-8">
          
          {/* ── CỘT TRÁI: SIDEBAR FILTER THEO BỘ GDPT ── */}
          <div className="w-full xl:w-80 shrink-0 space-y-4">
            
            {/* THANH TÌM KIẾM */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nội dung, chủ đề, tag..."
                className="w-full bg-slate-800/80 border-2 border-slate-700 hover:border-slate-600 focus:border-red-600/60 rounded-2xl pl-11 pr-11 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* TREE VIEW BỘ GDPT */}
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 max-h-[800px] overflow-y-auto custom-scrollbar">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-1">Cấu trúc GDPT 2018</h4>
              {PHYSICS_TOPICS.map((gradeGroup) => (
                <div key={gradeGroup.grade} className="mb-3">
                  <button 
                    onClick={() => toggleGrade(gradeGroup.grade)}
                    className="w-full flex items-center justify-between p-2.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl transition-all"
                  >
                    <span className={cn("font-bold text-sm", gradeGroup.isSpecialized ? "text-amber-400" : "text-slate-200")}>
                      {gradeGroup.grade}
                    </span>
                    <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expandedGrades.has(gradeGroup.grade) && "rotate-90")} />
                  </button>
                  
                  {expandedGrades.has(gradeGroup.grade) && (
                    <div className="pl-3 mt-2 border-l-2 border-slate-700/50 space-y-1.5 py-1">
                      {gradeGroup.topics.map(topic => {
                        const isTopicChecked = filterTopics.has(topic.name);
                        const isExpanded = expandedTopics.has(topic.name);
                        const qCount = questions.filter(q => matchesTopic(q.topic, topic.name)).length;
                        if (qCount === 0 && !isTopicChecked && gradeGroup.grade !== 'Khối 12') return null; // Ẩn bớt mục trống
                        
                        return (
                          <div key={topic.name}>
                            <div className={cn("flex items-center justify-between hover:bg-slate-800/60 p-1.5 rounded-lg transition-colors group", isExpanded && "bg-slate-800/40")}>
                              <div className="flex flex-1 items-center gap-2">
                                {topic.subTopics.length > 0 ? (
                                  <button onClick={() => toggleTopicExpand(topic.name)} className="p-0.5 hover:bg-slate-700 rounded text-slate-500 hover:text-white">
                                    <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-90")} />
                                  </button>
                                ) : <span className="w-5 h-5 flex-shrink-0" />}
                                
                                <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isTopicChecked}
                                    onChange={() => toggleTopicCheck(topic.name)}
                                    className="w-4 h-4 bg-slate-800 border-slate-600 rounded accent-red-600 shrink-0 cursor-pointer"
                                  />
                                  <span className={cn("text-xs truncate transition-colors cursor-pointer", isTopicChecked ? "text-red-400 font-bold" : "text-slate-300 group-hover:text-white")}>
                                    {topic.name}
                                  </span>
                                </label>
                              </div>
                              <span className="text-[10px] text-slate-500 font-bold ml-2 shrink-0">{qCount}</span>
                            </div>
                            
                            {topic.subTopics.length > 0 && isExpanded && (
                              <div className="pl-9 mt-1 pr-1 space-y-1">
                                {topic.subTopics.map(sub => {
                                  const isSubChecked = filterSubTopics.has(sub);
                                  const subCount = questions.filter(q => q.subTopic === sub).length;
                                  return (
                                    <label key={sub} className="flex items-center justify-between p-1.5 hover:bg-slate-800/60 rounded-lg cursor-pointer group">
                                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                        <input
                                          type="checkbox"
                                          checked={isSubChecked}
                                          onChange={() => toggleSubTopicCheck(sub)}
                                          className="w-3.5 h-3.5 bg-slate-800 border-slate-600 rounded accent-blue-500 shrink-0 cursor-pointer"
                                        />
                                        <span className={cn("text-[11px] leading-snug transition-colors cursor-pointer", isSubChecked ? "text-blue-400 font-bold" : "text-slate-400 group-hover:text-slate-200")}>
                                          {sub}
                                        </span>
                                      </div>
                                      {subCount > 0 && <span className="text-[9px] text-slate-600 font-bold shrink-0">{subCount}</span>}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── CỘT PHẢI: NỘI DUNG ── */}
          <div className="flex-1 space-y-4 min-w-0">

            {/* ── Lọc theo Phần + Mức độ ── */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Phần */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                {(['All', 1, 2, 3] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setFilterPart(p)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      filterPart === p 
                        ? "bg-white/10 border-white/20 text-white" 
                        : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {p === 'All' ? 'Tất cả Phần' : `Phần ${p === 1 ? 'I · TNKQ' : p === 2 ? 'II · Đ/S' : 'III · TLN'}`}
                  </button>
                ))}
              </div>

              {/* Mức độ (multi-select) */}
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-slate-500" />
                {(['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'] as const).map(level => {
                  const colors: Record<string, string> = {
                    'Nhận biết': 'bg-green-600 border-green-600 text-white',
                    'Thông hiểu': 'bg-blue-600 border-blue-600 text-white',
                    'Vận dụng': 'bg-amber-600 border-amber-600 text-white',
                    'Vận dụng cao': 'bg-red-600 border-red-600 text-white',
                  };
                  return (
                    <button
                      key={level}
                      onClick={() => toggleLevel(level)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                        filterLevels.has(level)
                          ? colors[level]
                          : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>

              {/* Thời gian upload */}
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {([
                  { key: 'All', label: 'Tất cả' },
                  { key: '1h', label: '⚡ Vừa upload' },
                  { key: 'today', label: 'Hôm nay' },
                  { key: '7d', label: '7 ngày' },
                  { key: '30d', label: '30 ngày' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilterTime(key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      filterTime === key
                        ? "bg-cyan-600 border-cyan-600 text-white shadow-lg shadow-cyan-600/20"
                        : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Trạng thái duyệt */}
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                {([
                  { key: 'All', label: 'Mọi trạng thái' },
                  { key: 'published', label: 'Đã duyệt' },
                  { key: 'draft', label: 'Nháp' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilterStatus(key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      filterStatus === key
                        ? "bg-fuchsia-600 border-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20"
                        : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ══════════ THANH KẾT QUẢ + RESET ══════════ */}
            <div className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-2.5 border border-slate-800">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleSelectAll}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                    selectedIds.size === paginatedQuestions.length && paginatedQuestions.length > 0
                      ? "bg-red-600 border-red-600 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                  )}
                  disabled={paginatedQuestions.length === 0}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors",
                    selectedIds.size > 0 ? "border-white bg-white text-red-600" : "border-slate-500"
                  )}>
                    {selectedIds.size > 0 && <Check className="w-2.5 h-2.5" />}
                  </div>
                  Chọn tất cả ({currentPage})
                </button>
                <span className="text-xs text-slate-400 font-bold">
                  {hasActiveFilters ? (
                    <>Tìm thấy <span className="text-red-400 text-sm font-black">{filtered.length}</span> / {questions.length} câu hỏi</>
                  ) : (
                    <>Hiển thị tất cả <span className="text-white font-black">{questions.length}</span> câu hỏi</>
                  )}
                  {totalPages > 1 && (
                    <span className="ml-2 text-slate-500">· Trang {currentPage}/{totalPages}</span>
                  )}
                </span>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={resetAllFilters}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-600/10 hover:bg-amber-600/20 px-3 py-1.5 rounded-lg border border-amber-600/20 transition-all"
                >
                  <RotateCcw className="w-3 h-3" /> Xóa bộ lọc
                </button>
              )}
            </div>

            {/* ── Danh sách câu hỏi ── */}
            {loading ? (
              <div className="py-20 text-center animate-pulse text-slate-500">Đang tải kho dữ liệu...</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                {filtered.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center space-y-6 border-2 border-dashed border-slate-800 rounded-[2.5rem] bg-slate-950/30">
                    <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-800">
                      <BookOpen className="text-slate-700 w-10 h-10" />
                    </div>
                    <div className="max-w-xs">
                      <h4 className="text-white font-bold uppercase tracking-widest">Không có câu hỏi</h4>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        {hasActiveFilters
                          ? 'Không tìm thấy câu hỏi nào phù hợp với bộ lọc hiện tại.'
                          : <>Thầy hãy sử dụng tính năng <span className="text-red-500 font-bold">"Số hóa đề"</span> để bắt đầu xây dựng ngân hàng câu hỏi thông minh.</>
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  paginatedQuestions.map((q) => {
                    const isSelected = selectedIds.has(q.id!);
                    return (
                    <div key={q.id} className={cn(
                      "bg-slate-950 border p-6 rounded-2xl space-y-4 relative group transition-all",
                      hasImageIssue(q) ? "border-red-600/30" : isSelected ? "border-red-500 bg-slate-900 border-2" : "border-slate-800",
                      editingId === q.id && "ring-2 ring-blue-500/50"
                    )}>
                      
                      {/* ── Checkbox Chọn ── */}
                      <button
                        onClick={() => {
                          const next = new Set(selectedIds);
                          if (next.has(q.id!)) next.delete(q.id!); else next.add(q.id!);
                          setSelectedIds(next);
                        }}
                        className={cn(
                          "absolute top-4 left-4 w-5 h-5 rounded border-2 flex items-center justify-center transition-all focus:outline-none z-10",
                          isSelected ? "bg-red-600 border-red-600" : "border-slate-600 hover:border-slate-400"
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>

                      {/* ── Action buttons ── */}
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => editingId === q.id ? cancelEdit() : startEdit(q)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            editingId === q.id 
                              ? "bg-slate-700 text-white" 
                              : "bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white"
                          )}
                          title={editingId === q.id ? 'Hủy sửa' : 'Sửa câu hỏi'}
                        >
                          {editingId === q.id ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => deleteQuestion(q.id!)}
                          className="p-2 bg-red-600/10 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-all"
                          title="Xóa câu hỏi"
                        >
                          <LogOut className="w-4 h-4 rotate-180" />
                        </button>
                      </div>
                      
                      {/* ── Badges ── */}
                      <div className="flex items-center gap-2 flex-wrap pl-6 md:pl-8">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded",
                          q.part === 1 ? "bg-blue-600 text-white" : q.part === 2 ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"
                        )}>
                          Phần {q.part === 1 ? 'I' : q.part === 2 ? 'II' : 'III'}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 px-2 py-1 rounded text-slate-400">
                          {q?.topic || 'Chưa phân loại'} - {q?.level || '—'}
                        </span>
                        {q.groupId && (
                          <span className="text-[10px] font-bold bg-purple-600/20 text-purple-400 px-2 py-1 rounded border border-purple-600/30" title="Câu kép — dùng chung đề bài">
                            🔗 Cặp {q.groupId}
                          </span>
                        )}
                        {hasImageIssue(q) && (
                          <span className="text-[10px] font-bold bg-red-600/20 text-red-400 px-2 py-1 rounded animate-pulse">
                            ⚠️ Cần bổ sung ảnh
                          </span>
                        )}
                        <button
                          onClick={() => toggleStatus(q)}
                          className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded transition-all flex items-center gap-1 cursor-pointer hover:opacity-80 border",
                            (q.status || 'published') === 'draft' 
                              ? "bg-slate-700/50 text-slate-300 border-slate-600" 
                              : "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
                          )}
                          title="Bấm để đổi trạng thái"
                        >
                          {(q.status || 'published') === 'draft' ? (
                            <><Clock className="w-3 h-3" /> Đang nháp</>
                          ) : (
                            <><CheckCircle2 className="w-3 h-3" /> Đã duyệt</>
                          )}
                        </button>
                      </div>

                      {/* ── EDIT FORM ── */}
                      {editingId === q.id ? (
                        <div className="space-y-4">
                          {/* Logic Câu Lừa */}
                          <div className="flex items-center gap-4 mb-2">
                             <label className="flex items-center gap-3 text-sm font-bold cursor-pointer bg-red-500/10 hover:bg-red-500/20 px-4 py-3 rounded-xl border border-red-500/30 transition-colors w-full sm:w-auto text-red-400">
                                <input 
                                  type="checkbox" 
                                  checked={editIsTrap} 
                                  onChange={(e) => setEditIsTrap(e.target.checked)} 
                                  className="w-4 h-4 text-red-500 rounded bg-slate-900 border-red-500/50 focus:ring-red-500/50 focus:ring-offset-slate-900 cursor-pointer"
                                />
                                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                                Đánh dấu đây là "Câu Lừa / Bẫy Sai Ngu"
                             </label>
                          </div>

                          {/* Nội dung câu hỏi */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Nội dung câu hỏi</label>
                              <button 
                                onClick={() => handleImageInsert('content')}
                                className="flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                <ImagePlus className="w-3 h-3" /> Chèn ảnh
                              </button>
                            </div>
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 font-mono min-h-[120px] focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none resize-y"
                            />
                          </div>

                          {/* ── Phần I: Sửa đáp án A/B/C/D ── */}
                          {q.part === 1 && editOptions.length > 0 && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Các phương án (chọn đáp án đúng)</label>
                              <div className="space-y-2">
                                {editOptions.map((opt, idx) => (
                                  <div key={idx} className={cn(
                                    "flex items-center gap-3 p-2 rounded-xl border transition-all",
                                    editCorrectAnswer === idx ? "border-green-600/50 bg-green-600/5" : "border-slate-800 bg-slate-900/50"
                                  )}>
                                    <button
                                      onClick={() => setEditCorrectAnswer(idx)}
                                      className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 font-black text-[10px] transition-all",
                                        editCorrectAnswer === idx
                                          ? "border-green-500 bg-green-500 text-white"
                                          : "border-slate-600 text-slate-600 hover:border-green-400"
                                      )}
                                      title="Chọn làm đáp án đúng"
                                    >
                                      {String.fromCharCode(65 + idx)}
                                    </button>
                                    <textarea
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...editOptions];
                                        newOpts[idx] = e.target.value;
                                        setEditOptions(newOpts);
                                      }}
                                      className="flex-1 bg-transparent text-sm text-slate-200 outline-none border-b border-slate-700 focus:border-blue-500 pb-0.5 font-mono min-h-[40px] resize-none"
                                      placeholder={`Phương án ${String.fromCharCode(65 + idx)}...`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ── Phần II: Sửa ý a/b/c/d + Đúng/Sai ── */}
                          {q.part === 2 && editOptions.length > 0 && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Các ý a/b/c/d (click để đổi Đúng↔Sai)</label>
                              <div className="space-y-2">
                                {editOptions.map((opt, idx) => {
                                  const isTrue = Array.isArray(editCorrectAnswer) ? editCorrectAnswer[idx] === true : false;
                                  return (
                                    <div key={idx} className={cn(
                                      "flex items-start gap-3 p-2 rounded-xl border transition-all",
                                      isTrue ? "border-green-600/50 bg-green-600/5" : "border-red-600/30 bg-red-600/5"
                                    )}>
                                      <button
                                        onClick={() => {
                                          if (!Array.isArray(editCorrectAnswer)) return;
                                          const next = [...editCorrectAnswer];
                                          next[idx] = !next[idx];
                                          setEditCorrectAnswer(next);
                                        }}
                                        className={cn(
                                          "mt-0.5 flex-shrink-0 w-14 h-6 rounded-full text-[9px] font-black uppercase border transition-all",
                                          isTrue
                                            ? "bg-green-600/20 border-green-600/50 text-green-400"
                                            : "bg-red-600/20 border-red-600/30 text-red-400"
                                        )}
                                        title="Click để đổi Đúng/Sai"
                                      >
                                        {isTrue ? '✓ Đúng' : '✗ Sai'}
                                      </button>
                                      <span className="text-red-400 font-black text-xs mt-1 flex-shrink-0">
                                        {String.fromCharCode(97 + idx)}.
                                      </span>
                                      <textarea
                                        value={opt}
                                        onChange={(e) => {
                                          const newOpts = [...editOptions];
                                          newOpts[idx] = e.target.value;
                                          setEditOptions(newOpts);
                                        }}
                                        className="flex-1 bg-transparent text-sm text-slate-200 outline-none border-b border-slate-700 focus:border-blue-500 min-h-[40px] resize-none font-mono"
                                        placeholder={`Ý ${String.fromCharCode(97 + idx)}...`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Phần III: Sửa đáp số ── */}
                          {q.part === 3 && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Đáp án số</label>
                              <input
                                type="number"
                                step="any"
                                value={editCorrectAnswer ?? ''}
                                onChange={(e) => setEditCorrectAnswer(e.target.value)}
                                className="w-40 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                                placeholder="0.00"
                              />
                            </div>
                          )}

                          {/* Lời giải */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Lời giải</label>
                              <button 
                                onClick={() => handleImageInsert('explanation')}
                                className="flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                <ImagePlus className="w-3 h-3" /> Chèn ảnh
                              </button>
                            </div>
                            <textarea
                              value={editExplanation}
                              onChange={(e) => setEditExplanation(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 font-mono min-h-[80px] focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none resize-y"
                            />
                          </div>
                          {/* Preview */}
                          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Xem trước nội dung:</p>
                            <div className="text-sm text-slate-200"><MathRenderer content={editContent} /></div>
                          </div>
                          <div className="flex gap-3">
                            <button 
                              onClick={() => saveEdit(q)}
                              disabled={editSaving}
                              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </button>
                            <button 
                              onClick={cancelEdit}
                              className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-all"
                            >
                              <X className="w-3.5 h-3.5" /> Hủy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-200 text-sm leading-relaxed">
                          <MathRenderer content={q?.content || 'Chưa có nội dung câu hỏi.'} />
                        </div>
                      )}

                      <AnimatePresence>
                        {expandedId === q.id && editingId !== q.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden space-y-6 pt-4 border-t border-slate-800"
                          >
                            {q.tags?.includes('__needs_answer_review') && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-3">
                                <span className="text-amber-400 text-xs font-bold">⚠️ Đáp án chưa chắc chắn — Cần kiểm tra thủ công</span>
                              </div>
                            )}

                            {q.part === 1 && q.options && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {q.options.map((opt, idx) => (
                                  <div 
                                    key={idx} 
                                    className={cn(
                                      "p-3 rounded-xl border text-sm flex items-center gap-3",
                                      idx === (q.correctAnswer as number) 
                                        ? "bg-green-600/10 border-green-600/50 text-green-400" 
                                        : "bg-slate-900 border-slate-800 text-slate-400"
                                    )}
                                  >
                                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black">
                                      {String.fromCharCode(65 + idx)}
                                    </span>
                                    <div className="text-base md:text-lg flex-1 overflow-x-auto min-w-0 break-words whitespace-normal">
                                      <MathRenderer content={opt} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {q.part === 2 && q.options && (
                              <div className="space-y-2">
                                {q.options.map((opt, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
                                    <div className="flex items-center gap-3 text-sm text-slate-300">
                                      <span className="text-red-500 font-bold">{String.fromCharCode(97 + idx)}.</span>
                                      <MathRenderer content={opt} />
                                    </div>
                                    <span className={cn(
                                      "text-[10px] font-bold uppercase px-2 py-1 rounded",
                                      (q.correctAnswer as boolean[])[idx] ? "bg-green-600/20 text-green-500" : "bg-red-600/20 text-red-500"
                                    )}>
                                      {(q.correctAnswer as boolean[])[idx] ? 'Đúng' : 'Sai'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {q.part === 3 && (
                              <div className="p-4 bg-blue-600/10 border border-blue-600/30 rounded-xl flex items-center justify-between">
                                <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">Đáp án ngắn:</span>
                                <span className="text-xl font-black text-white">{String(q.correctAnswer).replace('.', ',')}</span>
                              </div>
                            )}

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                                <BrainCircuit className="w-3 h-3" /> Hướng dẫn giải chi tiết
                              </p>
                              <div className="text-sm text-slate-400 italic leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                                <MathRenderer content={q?.explanation || 'Chưa có lời giải chi tiết.'} />
                              </div>
                            </div>

                            {(q.resources?.length || q.simulationUrl) && (
                              <div className="space-y-4 pt-4 border-t border-slate-800">
                                <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                                  <Info className="w-3 h-3" /> Học liệu & Mô phỏng đi kèm
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {q.simulationUrl && (
                                    <div className="flex items-center gap-3 p-3 bg-red-600/5 border border-red-600/20 rounded-xl">
                                      <FlaskConical className="w-4 h-4 text-red-500" />
                                      <span className="text-xs text-slate-300 font-medium">Có mô phỏng thí nghiệm ảo</span>
                                    </div>
                                  )}
                                  {q.resources?.map((res, ri) => (
                                    <div key={ri} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                                      {res.type === 'video' ? <Video className="w-4 h-4 text-red-500" /> : <BookOpen className="w-4 h-4 text-blue-500" />}
                                      <span className="text-xs text-slate-400 truncate">{res.title}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                        <div className="flex gap-1 flex-wrap">
                          {q.tags?.map(tag => (
                            <span key={tag} className="text-[9px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">#{tag}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* ── Nút chèn ảnh nhanh — LUÔN HIỆN ── */}
                          {editingId !== q.id && (
                            <button 
                              onClick={() => handleQuickImageInsert(q)}
                              disabled={quickImgSaving === q.id}
                              className={cn(
                                "text-[10px] font-bold flex items-center gap-1 transition-colors",
                                quickImgSaving === q.id
                                  ? "text-amber-400 animate-pulse"
                                  : "text-indigo-400 hover:text-indigo-300"
                              )}
                            >
                              <ImagePlus className="w-3 h-3" />
                              {quickImgSaving === q.id ? 'Đang lưu...' : 'Chèn ảnh'}
                            </button>
                          )}
                          {editingId !== q.id && (
                            <button 
                              onClick={() => startEdit(q)}
                              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" /> Sửa
                            </button>
                          )}
                          <button 
                            onClick={() => setExpandedId(expandedId === q.id ? null : q.id!)}
                            className="text-[10px] font-bold text-red-500 hover:underline"
                          >
                            {expandedId === q.id ? 'Thu gọn' : 'Xem chi tiết & Lời giải'}
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ══════════ PAGINATION ══════════ */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Trước
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (currentPage <= 4) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      page = totalPages - 6 + i;
                    } else {
                      page = currentPage - 3 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          "w-9 h-9 rounded-xl text-xs font-bold transition-all",
                          page === currentPage
                            ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                        )}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Sau <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          </div>{/* end CỘT PHẢI */}
        </div>{/* end LAYOUT 2 CỘT */}
      </div>{/* end flex-col gap-4 wrapper */}

      {/* ══════════ FLOATING BULK DELETE BAR ══════════ */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl shadow-black/50"
          >
            <div className="flex items-center gap-2 px-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-600/20 text-red-500 font-black text-[10px]">
                {selectedIds.size}
              </span>
              <span className="text-sm font-bold text-slate-300">câu đã chọn</span>
            </div>
            
            <div className="w-px h-8 bg-slate-700 hidden md:block"></div>
            
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={deleteSelectedQuestions}
              disabled={isDeletingBulk}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
            >
              {isDeletingBulk ? 'Đang xóa...' : (
                <>
                  <LogOut className="w-4 h-4 rotate-180" /> Xóa {selectedIds.size} câu
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ExamGenerator = ({ user, onExportPDF }: { user: UserProfile, onExportPDF: (exam: Exam) => void }) => {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [generatedExam, setGeneratedExam] = useState<Exam | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genType, setGenType] = useState<'AI' | 'Matrix'>('AI');

  useEffect(() => {
    // Fetch students — 1 lần, cache-first
    const fetchStudents = async () => {
      try {
        const sQuery = query(collection(db, 'users'), where('role', '==', 'student'));
        const snap = await getDocs(sQuery);
        setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      } catch (err) {
        console.warn('[ExamGenerator] Lỗi fetch students:', err);
      }
    };
    fetchStudents();

    // Fetch all questions — Cache-first để tiết kiệm quota
    const fetchQ = async () => {
      try {
        const qQuery = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(qQuery);
        // TUYỆT ĐỐI XÓA BỎ các câu đang đóng dấu "draft"
        setAllQuestions(
          snap.docs.map(d => ({ ...d.data(), id: d.id } as Question))
                   .filter(q => q.status !== 'draft')
        );
      } catch (err) {
        console.warn('[ExamGenerator] Lỗi fetch questions:', err);
      }
    };
    fetchQ();
  }, []);

  const generateExam = async () => {
    if (allQuestions.length < 28) {
      toast.error(`Kho câu hỏi hiện tại chỉ có ${allQuestions.length} câu. Cần tối thiểu 28 câu để tạo đề chuẩn 2026.`);
      return;
    }

    setIsGenerating(true);

    try {
      // ═══════════════════════════════════════════════════════════════
      //  SPRINT 2: TRUE ADAPTIVE ENGINE — CHỐNG HỌC VẸT
      //  1. Fetch pastAttempts cho student được chọn
      //  2. Build Blacklist (câu đã đúng trong 7 ngày)
      //  3. pick() 3 tầng ưu tiên: Blacklist → redZones → Random
      // ═══════════════════════════════════════════════════════════════

      // ── Bước 1: Fetch lịch sử thi của học sinh (nếu có) ──
      let blacklist = new Set<string>(); // O(1) lookup
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - SEVEN_DAYS_MS;

      if (selectedStudent) {
        try {
          const attemptsQuery = query(
            collection(db, 'attempts'),
            where('userId', '==', selectedStudent.uid)
          );
          const attemptsSnap = await getDocs(attemptsQuery);
          const pastAttempts = attemptsSnap.docs.map(d => d.data());

          // ── Bước 2: Tạo Blacklist — câu đã đúng trong 7 ngày gần nhất ──
          // Hiệu năng: Duyệt 1 lần qua pastAttempts, dùng Set để O(1) insert & lookup
          for (const attempt of pastAttempts) {
            // Kiểm tra thời gian: chỉ lấy bài thi trong 7 ngày qua
            const attemptTime = attempt.timestamp?.toMillis?.() 
              ?? attempt.timestamp?.seconds * 1000 
              ?? 0;
            if (attemptTime < cutoffTime) continue;

            // Duyệt answers: tìm câu nào đã trả lời đúng
            const answers = attempt.answers || {};
            for (const qId of Object.keys(answers)) {
              const question = allQuestions.find(q => q.id === qId);
              if (!question) continue;

              const studentAns = answers[qId];
              let isCorrect = false;

              if (question.part === 1) {
                isCorrect = studentAns === question.correctAnswer;
              } else if (question.part === 2) {
                // Đúng/Sai: đúng tất cả 4 ý mới tính
                if (Array.isArray(studentAns) && Array.isArray(question.correctAnswer)) {
                  isCorrect = studentAns.length === 4 && 
                    studentAns.every((ans: any, i: number) => ans === (question.correctAnswer as boolean[])[i]);
                }
              } else if (question.part === 3) {
                const sVal = parseFloat(String(studentAns ?? '0').replace(',', '.'));
                const cVal = parseFloat(String(question.correctAnswer ?? '0').replace(',', '.'));
                isCorrect = !isNaN(sVal) && Math.abs(sVal - cVal) < 0.01;
              }

              if (isCorrect) blacklist.add(qId);
            }
          }
        } catch (e) {
          console.warn('[generateExam] Không thể fetch pastAttempts, bỏ qua blacklist:', e);
        }
      }

      // ── Phân loại theo Part ──
      const p1 = allQuestions.filter(q => q.part === 1);
      const p2 = allQuestions.filter(q => q.part === 2);
      const p3 = allQuestions.filter(q => q.part === 3);

      if (p1.length < 18 || p2.length < 4 || p3.length < 6) {
        toast.error("Không đủ câu hỏi cho từng phần (Cần 18 câu Phần I, 4 câu Phần II, 6 câu Phần III).");
        setIsGenerating(false);
        return;
      }

      // AI Diagnosis: Prioritize topics student is weak in (redZones)
      const redZones = selectedStudent?.redZones || [];

      // ── Bước 3: pick() — Thuật toán 3 tầng ưu tiên ──
      const pick = (source: Question[], count: number): Question[] => {
        // Tầng 1: Lọc bỏ câu trong Blacklist
        const fresh = source.filter(q => !blacklist.has(q.id || ''));
        
        // Nếu kho câu "tươi" đủ → dùng, nếu không → fallback lấy lại từ blacklist
        const pool = fresh.length >= count ? fresh : [...source];

        // Tầng 2 + 3: Sắp xếp ưu tiên redZones, random phần còn lại
        // Score: redZone = +1000 (đảm bảo luôn đứng trước), random phụ tránh trùng thứ tự
        const scored = pool.map(q => ({
          question: q,
          score: (redZones.includes(q.topic) ? 1000 : 0) 
               + (!blacklist.has(q.id || '') ? 500 : 0) // Ưu tiên câu chưa từng đúng
               + Math.random() * 100 // Yếu tố ngẫu nhiên
        }));

        // Sort giảm dần theo score → lấy top `count`
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, count).map(s => s.question);
      };

      const selected: Question[] = [
        ...pick(p1, 18),
        ...pick(p2, 4),
        ...pick(p3, 6)
      ];

      const newExam: Exam = {
        title: `ĐỀ TRỊ BỆNH: ${selectedStudent?.displayName || 'HỌC SINH'} - ${new Date().toLocaleDateString('vi-VN')}`,
        questions: selected,
        createdAt: Timestamp.now(),
        createdBy: user.uid,
        type: genType === 'AI' ? 'AI_Diagnosis' : 'Matrix',
        targetStudentId: selectedStudent?.uid
      };

      const docRef = await addDoc(collection(db, 'exams'), newExam);
      setGeneratedExam({ ...newExam, id: docRef.id });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'exams');
    } finally {
      setIsGenerating(false);
    }
  };

  const prescribeExam = async () => {
    if (!generatedExam || !selectedStudent) return;
    
    const prescription: Prescription = {
      id: Math.random().toString(36).substr(2, 9),
      examId: generatedExam.id!,
      title: generatedExam.title,
      assignedAt: Timestamp.now(),
      status: 'pending'
    };

    const newNotification: AppNotification = {
      id: 'presc_' + Date.now(),
      title: 'Đề thi đặc biệt!',
      message: `Thầy Hậu đã gửi cho em một đề đặc biệt: "${generatedExam.title}". Hãy làm ngay nhé!`,
      type: 'info',
      read: false,
      timestamp: Timestamp.now()
    };

    try {
      const updatedPrescriptions = [...(selectedStudent.prescriptions || []), prescription];
      const updatedNotifications = [newNotification, ...(selectedStudent.notifications || [])].slice(0, 20);
      await setDoc(doc(db, 'users', selectedStudent.uid), { 
        prescriptions: updatedPrescriptions,
        notifications: updatedNotifications 
      }, { merge: true });
      // alert replaced with a more subtle feedback if needed, but for now just the notification is fine
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'users');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black text-white">TRUNG TÂM LUYỆN ĐỀ "TRỊ BỆNH" AI</h3>
          <p className="text-slate-400 text-sm">Tạo đề thi 28 câu chuẩn cấu hình 2026, cá nhân hóa theo từng học sinh.</p>
        </div>
        <div className="bg-blue-600/10 p-3 rounded-2xl">
          <Trophy className="text-blue-600 w-8 h-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase">1. Phương thức tạo đề</p>
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button 
                onClick={() => setGenType('AI')}
                className={cn(
                  "flex-1 py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                  genType === 'AI' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <BrainCircuit className="w-4 h-4" /> AI Chẩn đoán
              </button>
              <button 
                onClick={() => setGenType('Matrix')}
                className={cn(
                  "flex-1 py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                  genType === 'Matrix' ? "bg-slate-700 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Target className="w-4 h-4" /> Theo Ma trận
              </button>
            </div>
          </div>

          {genType === 'AI' && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase">2. Chọn học sinh cần "Trị bệnh"</p>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {students.map(s => (
                  <button
                    key={s.uid}
                    onClick={() => setSelectedStudent(s)}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-all",
                      selectedStudent?.uid === s.uid ? "bg-blue-600/10 border-blue-600" : "bg-slate-800 border-slate-700 hover:border-slate-600"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center font-black text-blue-500">
                        {s.displayName[0]}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-white">{s.displayName}</p>
                        <p className="text-[10px] text-slate-500">{s.targetGroup || 'Chưa phân nhóm'}</p>
                      </div>
                    </div>
                    {s.redZones && s.redZones.length > 0 && (
                      <div className="flex gap-1">
                        {s.redZones.slice(0, 2).map(z => (
                          <span key={z} className="text-[8px] bg-red-600/20 text-red-500 px-2 py-0.5 rounded-full font-bold">Lỗ hổng: {z}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={generateExam}
            disabled={isGenerating || (genType === 'AI' && !selectedStudent)}
            className="cta-shimmer w-full bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:from-blue-500 hover:via-cyan-500 hover:to-blue-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:from-slate-800 disabled:to-slate-800 text-white py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-900/30"
          >
            {isGenerating ? (
              <>
                <BrainCircuit className="animate-spin w-5 h-5" /> AI ĐANG PHÂN TÍCH LỖ HỔNG & TẠO ĐỀ...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" /> BẮT ĐẦU TẠO ĐỀ THI
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-24 h-24 bg-slate-900 rounded-[2rem] flex items-center justify-center border border-slate-800 shadow-2xl">
            <BookOpen className="text-slate-700 w-12 h-12" />
          </div>
          <div className="max-w-xs">
            <h4 className="text-white font-black uppercase tracking-widest">Cấu trúc đề chuẩn 2026</h4>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">
              Hệ thống sẽ tự động bốc tách câu hỏi từ kho dữ liệu để tạo đề thi chuẩn cấu trúc mới nhất của Bộ GD&ĐT.
            </p>
            <div className="mt-6 p-4 bg-slate-900/50 rounded-2xl border border-slate-800 text-left space-y-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">• Phần I: 18 câu trắc nghiệm</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">• Phần II: 4 câu Đúng/Sai</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">• Phần III: 6 câu trả lời ngắn</p>
            </div>
          </div>
          {allQuestions.length < 28 && (
            <div className="p-4 bg-red-600/10 border border-red-600/20 rounded-2xl">
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest">
                Cảnh báo: Kho hiện có {allQuestions.length}/28 câu. Hãy bổ sung thêm câu hỏi!
              </p>
            </div>
          )}
        </div>
      </div>

      {generatedExam && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8 pt-8 border-t border-slate-800"
        >
          <div className="flex justify-between items-center bg-blue-600 p-6 rounded-3xl text-white shadow-2xl shadow-blue-900/40">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter">{generatedExam.title}</h2>
              <p className="text-blue-100 text-xs font-bold mt-1">Cấu trúc: 28 câu | Thời gian: 50 phút | Độ khó: AI Adaptive</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={prescribeExam}
                className="bg-white text-blue-600 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-lg"
              >
                <FlaskConical className="w-4 h-4" /> Kê đơn cho học sinh
              </button>
              <button 
                onClick={() => onExportPDF(generatedExam!)}
                className="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-xl transition-all flex items-center gap-2 text-white text-xs font-bold"
              >
                <Download className="w-4 h-4" /> Xuất PDF
              </button>
            </div>
          </div>

          <div className="space-y-12">
            {/* Part I */}
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="bg-red-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase">Phần I</span>
                <h4 className="text-lg font-bold text-white">Câu trắc nghiệm nhiều phương án lựa chọn</h4>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {generatedExam.questions.filter(q => q.part === 1).map((q, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="text-blue-500 font-black text-sm">Câu {i + 1}:</span>
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-1 rounded font-bold">{q?.topic || ''}</span>
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      <MathRenderer content={q?.content || 'Chưa có nội dung.'} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {q.options?.map((opt, idx) => (
                        <div key={idx} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center font-black text-[10px]">{String.fromCharCode(65 + idx)}</span>
                          <MathRenderer content={opt} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Part II */}
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="bg-red-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase">Phần II</span>
                <h4 className="text-lg font-bold text-white">Câu trắc nghiệm Đúng/Sai</h4>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {generatedExam.questions.filter(q => q.part === 2).map((q, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="text-blue-500 font-black text-sm">Câu {i + 19}:</span>
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-1 rounded font-bold">{q?.topic || ''}</span>
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      <MathRenderer content={q?.content || 'Chưa có nội dung.'} />
                    </div>
                    <div className="space-y-2">
                      {q.options?.map((opt, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span className="text-red-500 font-bold">{String.fromCharCode(97 + idx)}.</span>
                            <MathRenderer content={opt} />
                          </div>
                          <div className="flex gap-2">
                            <span className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500">Đ</span>
                            <span className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500">S</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Part III */}
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="bg-red-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase">Phần III</span>
                <h4 className="text-lg font-bold text-white">Câu trắc nghiệm trả lời ngắn</h4>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {generatedExam.questions.filter(q => q.part === 3).map((q, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <div className="flex justify-between items-start">
                      <span className="text-blue-500 font-black text-sm">Câu {i + 23}:</span>
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-1 rounded font-bold">{q?.topic || ''}</span>
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      <MathRenderer content={q?.content || 'Chưa có nội dung.'} />
                    </div>
                    <div className="h-12 w-32 border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-700 font-bold text-xs">
                      Đáp số: ............
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

const PerformanceChart = ({ data }: { data: { name: string, score: number, total: number }[] }) => {
  const chartData = data.map(d => ({
    ...d,
    missing: Math.max(0, d.total - d.score),
    labelTotal: `${d.score} / ${d.total} đ`
  }));

  return (
    <div className="h-72 w-full mt-8 bg-slate-950/30 p-6 rounded-2xl border border-slate-800">
      <h4 className="text-sm font-bold text-slate-400 uppercase mb-6 tracking-wider">Phân tích theo phần đề thi</h4>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#64748b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
            domain={[0, 'dataMax']}
          />
          <RechartsTooltip 
            cursor={{ fill: '#1e293b' }}
            contentStyle={{ 
              backgroundColor: '#0f172a', 
              border: '1px solid #334155', 
              borderRadius: '12px',
              fontSize: '12px'
            }}
            itemStyle={{ color: '#ef4444' }}
          />
          <Bar dataKey="score" stackId="a" barSize={40}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-score-${index}`} 
                fill={entry.score === entry.total ? '#10b981' : '#ef4444'} 
                radius={(entry.missing === 0 ? [6, 6, 0, 0] : [0, 0, 0, 0]) as any}
              />
            ))}
          </Bar>
          <Bar dataKey="missing" stackId="a" fill="#1e293b" radius={[6, 6, 0, 0]} barSize={40}>
            <LabelList dataKey="labelTotal" position="top" fill="#cbd5e1" fontSize={12} fontWeight="bold" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const ResourceCard = ({ title, type, url, description }: { title: string, type: 'video' | 'pdf' | 'link', url: string, description: string }) => (
  <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] hover:border-red-600/50 transition-all group">
    <div className={cn(
      "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110",
      type === 'video' ? "bg-red-600/10 text-red-600" : type === 'pdf' ? "bg-blue-600/10 text-blue-600" : "bg-green-600/10 text-green-600"
    )}>
      {type === 'video' ? <Video className="w-6 h-6" /> : type === 'pdf' ? <BookOpen className="w-6 h-6" /> : <ExternalLink className="w-6 h-6" />}
    </div>
    <h4 className="font-black text-white mb-2 uppercase text-sm tracking-tight">{title}</h4>
    <p className="text-xs text-slate-500 mb-6 leading-relaxed">{description}</p>
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
    >
      Xem ngay <ChevronRight className="w-3 h-3" />
    </a>
  </div>
);

const SimulationModal = ({ isOpen, onClose, title, description, simulationUrl }: { isOpen: boolean, onClose: () => void, title: string, description: string, simulationUrl: string }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        >
          <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center text-red-600">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{title}</h3>
                <p className="text-sm text-slate-400 font-medium">{description}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          
          <div className="flex-1 bg-slate-950 relative min-h-[500px]">
            <iframe 
              src={simulationUrl} 
              className="absolute inset-0 w-full h-full border-none"
              title={title}
              allowFullScreen
            />
          </div>
          
          <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nguồn: PhET Interactive Simulations | University of Colorado Boulder</p>
            <button 
              onClick={onClose}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-600/20"
            >
              Đóng mô phỏng
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const Navbar = ({ user, onSignOut, onReset, onSignIn }: { user: UserProfile | null, onSignOut: () => void, onReset: () => void, onSignIn: () => void }) => {
  const scrollTo = (id: string) => {
    onReset();
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <nav className="sticky top-0 z-[100] w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl px-6 py-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="bg-red-600 p-2 rounded-xl shadow-lg shadow-red-600/20">
            <Target className="text-white w-6 h-6" />
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-slate-950 rounded-full animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-xl tracking-tighter text-white leading-none">PHYS-9+</span>
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-[0.2em] mt-0.5">Pro Edition 2026</span>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="hidden lg:flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <button onClick={() => scrollTo('diagnosis')} className="hover:text-white transition-colors">Chẩn đoán</button>
          <button onClick={() => scrollTo('treatment')} className="hover:text-white transition-colors">Điều trị</button>
          <button onClick={() => scrollTo('resources')} className="hover:text-white transition-colors">Học liệu</button>
        </div>

        {user ? (
          <div className="flex items-center gap-4 pl-6 border-l border-slate-800">
            {(user.streak ?? 0) > 1 && (
              <span className="hidden md:inline text-[10px] font-black text-orange-400 bg-orange-600/10 px-2.5 py-1 rounded-full">
                🔥{user.streak}
              </span>
            )}
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-white">{user.displayName}</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider",
                  (user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') ? "text-red-500" :
                  user.targetGroup === 'Master Physics' ? "text-amber-500" : "text-blue-500"
                )}>
                  {(user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') ? 'Quản trị viên' : (user.targetGroup || 'Chưa phân nhóm')}
                </span>
              </div>
            </div>
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-xl border-2 border-slate-700 object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-slate-500" />
              </div>
            )}
            <button 
              onClick={onSignOut}
              className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl hover:bg-red-600/10 hover:border-red-600/50 transition-all group"
            >
              <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-500" />
            </button>
          </div>
        ) : (
          <button 
            onClick={onSignIn}
            className="bg-white hover:bg-slate-100 text-slate-900 px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xl flex items-center gap-3"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Đăng nhập bằng Google
          </button>
        )}
      </div>
    </nav>
  );
};

const VirtualLabPanel = ({ url }: { url: string }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden h-[500px] shadow-2xl"
  >
    <div className="bg-slate-800 px-6 py-3 flex justify-between items-center">
      <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
        <FlaskConical className="text-red-500 w-4 h-4" />
        Phòng thí nghiệm ảo (Virtual Lab)
      </h3>
      <span className="text-[10px] text-slate-400 font-bold bg-slate-900 px-2 py-1 rounded uppercase">
        Tương tác trực tiếp
      </span>
    </div>
    <iframe 
      src={url} 
      className="w-full h-full border-none" 
      allowFullScreen 
      title="Virtual Lab Simulation"
    />
  </motion.div>
);

const SmartResourceCard = ({ resource }: { resource: { title: string, url: string, type: 'video' | 'document' } }) => (
  <a 
    href={resource.url} 
    target="_blank" 
    rel="noopener noreferrer"
    className="flex items-center gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-red-500/50 hover:bg-slate-900 transition-all group"
  >
    <div className={cn(
      "w-10 h-10 rounded-xl flex items-center justify-center",
      resource.type === 'video' ? "bg-red-600/10 text-red-500" : "bg-blue-600/10 text-blue-500"
    )}>
      {resource.type === 'video' ? <Video className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
    </div>
    <div className="flex-1">
      <p className="text-sm font-bold text-white group-hover:text-red-500 transition-colors">{resource.title}</p>
      <p className="text-[10px] text-slate-500 uppercase font-bold">{resource.type === 'video' ? 'Video bài giảng' : 'Tài liệu tóm tắt'}</p>
    </div>
    <ExternalLink className="w-4 h-4 text-slate-700 group-hover:text-red-500" />
  </a>
);

const PrescriptionCard = ({ title, content, icon: Icon, color }: { title: string, content: any, icon: any, color: string }) => (
  <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl space-y-3">
    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
      <Icon className="w-5 h-5" />
    </div>
    <h4 className="font-bold text-white text-sm uppercase tracking-wider">{title}</h4>
    <div className="text-xs text-slate-400 leading-relaxed">
      {typeof content === 'string' && title === 'Kiến thức hổng' ? (
        <div className="flex flex-wrap">
          {content.split(',').map((item, idx) => {
            const trimmed = item.trim();
            if (!trimmed) return null;
            return (
              <span key={idx} className="inline-block px-3 py-1 m-1 text-sm rounded-full bg-red-900/30 text-red-400 border border-red-500/50">
                {trimmed}
              </span>
            );
          })}
        </div>
      ) : content}
    </div>
  </div>
);

const BehavioralAnalysisChart = ({ careless, fundamental }: { careless: number, fundamental: number }) => {
  const data = [
    { name: 'Lỗi ẩu (Kỹ thuật)', value: careless, color: '#38bdf8' },
    { name: 'Hổng gốc (Bản chất)', value: fundamental, color: '#f43f5e' },
  ];
  const total = careless + fundamental;

  return (
    <div className="h-[250px] w-full relative">
      {/* Center Label inside Donut */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
        <div className="text-center -mt-4">
          <p className="text-3xl font-black text-white">{total}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tổng lỗi</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={85}
            paddingAngle={4}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: `drop-shadow(0 0 6px ${entry.color}40)` }} />
            ))}
          </Pie>
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(15,23,42,0.95)', 
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(100,116,139,0.3)', 
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: '12px 16px',
            }}
            itemStyle={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}
            labelStyle={{ color: '#94a3b8', fontSize: '11px' }}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value) => <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

const BadgeGallery = ({ badges }: { badges?: Badge[] }) => (
  <div className="flex flex-wrap gap-4">
    {badges?.map((badge, i) => (
      <motion.div
        key={i}
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15, delay: i * 0.1 }}
        className="group relative"
      >
        <div className="w-14 h-14 bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 rounded-2xl flex items-center justify-center border-2 border-amber-200/50 shadow-xl shadow-amber-500/20 cursor-help overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <Award className="text-white w-7 h-7 drop-shadow-md" />
        </div>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-40 p-3 bg-slate-950 border border-slate-800 rounded-2xl text-[10px] text-center opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-2xl translate-y-2 group-hover:translate-y-0">
          <p className="font-black text-amber-500 uppercase tracking-widest mb-1">{badge.title}</p>
          <p className="text-slate-400 font-medium leading-relaxed">{badge.description}</p>
          <div className="mt-2 pt-2 border-t border-slate-800 text-[8px] text-slate-600 font-bold uppercase">
            Đạt được: {badge.unlockedAt ? new Date(badge.unlockedAt.seconds * 1000).toLocaleDateString('vi-VN') : 'Mới'}
          </div>
        </div>
      </motion.div>
    ))}
    {(!badges || badges.length === 0) && (
      <div className="flex flex-col items-center justify-center py-4 px-8 border-2 border-dashed border-slate-800 rounded-2xl opacity-30">
        <Award className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Chưa có danh hiệu</p>
      </div>
    )}
  </div>
);

const NotificationCenter = ({ notifications, onRead }: { notifications?: AppNotification[], onRead: (id: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-4 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <h4 className="text-xs font-black text-white uppercase tracking-widest">Thông báo</h4>
              <span className="text-[10px] text-slate-500">{unreadCount} tin mới</span>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {notifications?.map((n, i) => (
                <div 
                  key={i} 
                  onClick={() => { onRead(n.id); setIsOpen(false); }}
                  className={cn(
                    "p-4 border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer",
                    !n.read && "bg-blue-600/5"
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      n.type === 'warning' ? "bg-amber-600/10 text-amber-500" : 
                      n.type === 'success' ? "bg-green-600/10 text-green-500" : "bg-blue-600/10 text-blue-500"
                    )}>
                      {n.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{n.title}</p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                      <p className="text-[8px] text-slate-600 mt-2 uppercase font-bold">
                        {new Date(n.timestamp?.seconds * 1000).toLocaleTimeString('vi-VN')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {(!notifications || notifications.length === 0) && (
                <div className="p-10 text-center text-slate-600 italic text-xs">Không có thông báo nào.</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ProExamExperience = ({ 
  test, 
  answers: initialAnswers, 
  onAnswer, 
  onSubmit, 
  onCancel 
}: { 
  test: { topic: Topic, questions: Question[] }, 
  answers: Record<string, any>, 
  onAnswer: (questionId: string, ans: any) => void, 
  onSubmit: () => void,
  onCancel: () => void
}) => {
  const DRAFT_KEY = `exam_draft_${auth.currentUser?.uid}_${test.topic}`;
  
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.timeLeft > 0) return parsed.timeLeft;
      } catch (e) {}
    }
    return 50 * 60; // 50 minutes
  });
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cheatWarnings, setCheatWarnings] = useState(0);
  const [showCheatAlert, setShowCheatAlert] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [clusterContextCollapsed, setClusterContextCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Object.keys(parsed.answers).length > 0) {
          setShowResumeModal(true);
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (!showResumeModal) {
      // Save state periodically
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        timeLeft,
        answers: initialAnswers,
        timestamp: Date.now()
      }));
    }
  }, [timeLeft, initialAnswers, showResumeModal]);

  useEffect(() => {
    if (showResumeModal) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setCheatWarnings(prev => prev + 1);
        setShowCheatAlert(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showResumeModal]);

  const handleSubmit = () => {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem('phys8_active_exam_session'); // Xóa session key
    onSubmit();
  };

  const handleResumeChoice = (choice: 'resume' | 'reset') => {
    if (choice === 'reset') {
      localStorage.removeItem(DRAFT_KEY);
      setTimeLeft(50 * 60);
      // We'd ideally reset answers here, but parent controls answers.
      // Easiest is to force a rapid cancel and restart but let's just let parent know via onCancel if they want a clean restart
      // Actually, since answers are stored in App.tsx state, to reset we need to clear them.
      // We can emit a clear event, but assuming user only has old answers from the draft in App.tsx state.
    } else {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          Object.keys(parsed.answers).forEach(qid => onAnswer(qid, parsed.answers[qid]));
        } catch (e) {}
      }
    }
    setShowResumeModal(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion = test.questions[currentIndex];

  return (
    <div className={cn(
      "fixed inset-0 bg-slate-950 z-[100] flex flex-col overflow-hidden transition-all duration-1000",
      timeLeft < 300 ? "shadow-[inset_0_0_150px_rgba(220,38,38,0.3)] ring-4 ring-inset ring-red-500/50" : ""
    )}>
      {timeLeft < 300 && (
        <div className="absolute inset-0 pointer-events-none bg-red-500/5 animate-pulse z-0" />
      )}
      
      {/* Exam Header */}
      <header className="relative z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={cn("p-2 rounded-xl transition-all", timeLeft < 300 ? "bg-red-600 animate-bounce" : "bg-blue-600")}>
            <Activity className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className={cn("text-lg md:text-xl font-black uppercase tracking-tighter transition-colors", timeLeft < 300 ? "text-red-400" : "text-white")}>PHÒNG THI ZEN MODE</h2>
            <p className="text-xs md:text-sm text-slate-500 font-bold uppercase">Chủ đề: {test.topic} | {test.questions.length} Câu hỏi</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className={cn(
            "flex items-center gap-3 px-6 py-2 rounded-2xl border font-mono text-xl font-black transition-colors",
            timeLeft < 300 ? "bg-red-600/10 border-red-600 text-red-500 animate-pulse" : "bg-slate-950 border-slate-800 text-white"
          )}>
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
          
          <button 
            onClick={() => {
              if (confirm("Bạn có chắc chắn muốn nộp bài sớm?")) handleSubmit();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20"
          >
            Nộp bài
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Question Navigation */}
        <aside className="w-80 bg-slate-900/50 border-r border-slate-800 p-6 overflow-y-auto custom-scrollbar hidden lg:block">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Danh sách câu hỏi</h4>
          <div className="space-y-1">
            {(() => {
              // ═══ CLUSTER-AWARE SIDEBAR: Nhóm câu cluster visual ═══
              const items: React.ReactNode[] = [];
              let i = 0;
              while (i < test.questions.length) {
                const q = test.questions[i];
                if (q.clusterId) {
                  // Thu thập tất cả câu cùng cluster liền kề
                  const clusterStart = i;
                  const cid = q.clusterId;
                  while (i < test.questions.length && test.questions[i].clusterId === cid) i++;
                  const clusterEnd = i;
                  items.push(
                    <div key={`cluster-${cid}`} className="relative pl-4 py-1 mb-1 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      {/* Vertical accent bar */}
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500/40 rounded-full" />
                      <div className="flex items-center gap-1.5 px-1 py-1 mb-1">
                        <span className="text-[8px]">🔗</span>
                        <span className="text-[8px] font-bold text-amber-500/70 uppercase tracking-wider">Câu chùm</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {Array.from({ length: clusterEnd - clusterStart }, (_, ci) => {
                          const qi = clusterStart + ci;
                          return (
                            <button
                              key={qi}
                              onClick={() => setCurrentIndex(qi)}
                              className={cn(
                                "w-full aspect-square rounded-lg flex items-center justify-center text-xs font-black transition-all border",
                                currentIndex === qi ? "bg-amber-600 border-amber-500 text-white shadow-lg" :
                                initialAnswers[test.questions[qi].id] !== undefined ? "bg-slate-800 border-slate-700 text-slate-300" :
                                "bg-slate-950 border-amber-900/30 text-slate-600 hover:border-amber-600/50"
                              )}
                            >
                              {qi + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                } else {
                  // Câu lẻ
                  const qi = i;
                  items.push(
                    <button
                      key={qi}
                      onClick={() => setCurrentIndex(qi)}
                      className={cn(
                        "w-full aspect-square rounded-xl flex items-center justify-center text-xs font-black transition-all border",
                        currentIndex === qi ? "bg-blue-600 border-blue-500 text-white shadow-lg" :
                        initialAnswers[test.questions[qi].id] !== undefined ? "bg-slate-800 border-slate-700 text-slate-300" :
                        "bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-600"
                      )}
                      style={{ width: 'calc(25% - 6px)', display: 'inline-flex' }}
                    >
                      {qi + 1}
                    </button>
                  );
                  i++;
                }
              }
              return <div className="flex flex-wrap gap-2">{items}</div>;
            })()}
          </div>

          <div className="mt-10 p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-amber-500">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase">Chống gian lận</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">Hệ thống sẽ ghi nhận mỗi khi bạn rời khỏi tab này. Số lần cảnh báo: <span className="text-red-500 font-bold">{cheatWarnings}</span></p>
          </div>
        </aside>

        {/* Question Content */}
        <main className="flex-1 bg-slate-950 p-8 md:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-10">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <span className="bg-slate-900 text-slate-400 px-4 py-1 rounded-full text-xs md:text-sm font-black uppercase border border-slate-800">
                Phần {currentQuestion.part}
              </span>
              <span className="text-slate-600 font-bold text-xs md:text-sm">Độ khó: {currentQuestion.level}</span>
            </div>

            <div className="space-y-6">
              {/* ═══ [CLUSTER] Hiển thị ngữ cảnh chung cho câu chùm ═══ */}
              {(() => {
                if (!currentQuestion.clusterId) return null;
                // Tìm ngữ cảnh chung: từ tag __cluster_context hoặc content câu đầu
                const headQuestion = test.questions.find(
                  q => q.clusterId === currentQuestion.clusterId && (q.clusterOrder ?? 0) === 0
                );
                const clusterTag = headQuestion?.tags?.find(t => t.startsWith('__cluster_context:'));
                const sharedCtx = clusterTag
                  ? clusterTag.replace('__cluster_context:', '')
                  : (currentQuestion.clusterOrder === 0 ? null : headQuestion?.content);

                // Câu đầu (clusterOrder: 0): luôn hiện đầy đủ (đây LÀ dữ kiện chung)
                if (currentQuestion.clusterOrder === 0 && clusterTag) {
                  const ctx = clusterTag.replace('__cluster_context:', '');
                  return (
                    <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-6 mb-4">
                      <div className="flex items-center gap-2 text-amber-500 mb-3">
                        <Info className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-wider">Dữ kiện chung — Câu hỏi chùm</span>
                      </div>
                      <div className="text-amber-100/90 text-fluid-base">
                        <MathRenderer content={ctx} />
                      </div>
                    </div>
                  );
                }

                // Câu con (clusterOrder > 0): Collapsible inline context
                if ((currentQuestion.clusterOrder ?? 0) > 0 && sharedCtx) {
                  return (
                    <div className="bg-amber-950/20 border border-amber-700/30 rounded-2xl overflow-hidden mb-4">
                      <button
                        onClick={() => setClusterContextCollapsed(!clusterContextCollapsed)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-900/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-amber-500">
                          <Info className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-wider">📎 Dữ kiện chung — Câu hỏi chùm</span>
                        </div>
                        <ChevronRight className={cn(
                          "w-4 h-4 text-amber-500 transition-transform",
                          clusterContextCollapsed ? "" : "rotate-90"
                        )} />
                      </button>
                      {!clusterContextCollapsed && (
                        <div className="px-6 pb-5 text-amber-100/90 text-fluid-base border-t border-amber-700/20 pt-4">
                          <MathRenderer content={sharedCtx} />
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              <h3 className="text-fluid-lg font-bold text-white leading-loose break-words whitespace-normal min-w-0">
                <span className="text-blue-500 mr-2">Câu {currentIndex + 1}:</span>
                <MathRenderer content={currentQuestion.content} />
              </h3>

              <div className="space-y-4 pt-6">
                {currentQuestion.part === 1 && currentQuestion.options?.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => onAnswer(currentQuestion.id, idx)}
                    className={cn(
                      "w-full p-4 md:p-6 rounded-2xl border text-left transition-all flex flex-row items-center gap-4 md:gap-6 group touch-target",
                      initialAnswers[currentQuestion.id] === idx 
                        ? "bg-blue-600/10 border-blue-600 shadow-lg shadow-blue-900/10" 
                        : "bg-slate-900 border-slate-800 hover:border-slate-600"
                    )}
                  >
                    <span className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors",
                      initialAnswers[currentQuestion.id] === idx ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500 group-hover:bg-slate-700"
                    )}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <div className="text-lg text-slate-200">
                      <MathRenderer content={opt} />
                    </div>
                  </button>
                ))}

                {currentQuestion.part === 2 && (
                  <div className="space-y-4">
                    {currentQuestion.options?.map((opt, idx) => (
                      <div key={idx} className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="text-lg text-slate-200 flex-1">
                          <MathRenderer content={opt} />
                        </div>
                        <div className="flex gap-2">
                          {[true, false].map(val => (
                            <button
                              key={val.toString()}
                              onClick={() => {
                                const current = initialAnswers[currentQuestion.id] || [null, null, null, null];
                                const next = [...current];
                                next[idx] = val;
                                onAnswer(currentQuestion.id, next);
                              }}
                              className={cn(
                                "px-4 py-3 md:px-6 md:py-2 rounded-xl text-xs md:text-sm font-black uppercase tracking-widest transition-all border touch-target flex-1 md:flex-none text-center min-w-[70px]",
                                (initialAnswers[currentQuestion.id] || [])[idx] === val
                                  ? (val ? "bg-green-600 border-green-500 text-white" : "bg-red-600 border-red-500 text-white")
                                  : "bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-600"
                              )}
                            >
                              {val ? 'Đúng' : 'Sai'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {currentQuestion.part === 3 && (
                  <div className="space-y-4 pt-6">
                    <p className="text-xs md:text-sm text-slate-500 font-bold uppercase">Nhập kết quả số của bạn:</p>
                    <input 
                      type="text"
                      inputMode="decimal"
                      value={initialAnswers[currentQuestion.id] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^-?\d*[,.]?\d*$/.test(val)) {
                          onAnswer(currentQuestion.id, val);
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-2xl font-black text-white focus:border-blue-600 outline-none transition-all placeholder:text-slate-800"
                      placeholder="0.00"
                    />
                    <p className="text-xs md:text-sm text-slate-600 italic">* Lưu ý quy tắc làm tròn số theo yêu cầu của đề bài.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-12 border-t border-slate-900">
              <button 
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-2 text-slate-500 hover:text-white disabled:opacity-0 transition-colors font-bold"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
                Câu trước
              </button>
              <button 
                onClick={() => setCurrentIndex(prev => Math.min(test.questions.length - 1, prev + 1))}
                disabled={currentIndex === test.questions.length - 1}
                className="flex items-center gap-2 text-blue-500 hover:text-blue-400 disabled:opacity-0 transition-colors font-bold"
              >
                Câu tiếp theo
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Cheat Alert Modal */}
      <AnimatePresence>
        {showCheatAlert && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-red-600/50 p-8 rounded-3xl max-w-md text-center space-y-6 shadow-2xl shadow-red-900/20"
            >
              <div className="w-20 h-20 bg-red-600/10 rounded-full flex items-center justify-center mx-auto">
                <ShieldAlert className="text-red-600 w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">CẢNH BÁO GIAN LẬN</h3>
              <p className="text-slate-400 leading-relaxed">
                Bạn vừa rời khỏi tab phòng thi. Hệ thống đã ghi nhận hành vi này. 
                Vui lòng tập trung tuyệt đối vào bài làm để đảm bảo tính công bằng.
              </p>
              <button 
                onClick={() => setShowCheatAlert(false)}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
              >
                Tôi đã hiểu và quay lại thi
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resume Draft Modal */}
      <AnimatePresence>
        {showResumeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-[300] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Archive className="text-blue-500 w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">BÀI LÀM ĐANG DỞ</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Bạn có một phiên làm bài chưa nộp cho chuyên đề <strong className="text-white">{test.topic}</strong>. Bạn muốn tiếp tục làm hay bắt đầu lại từ đầu?
              </p>
              
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button 
                  onClick={() => handleResumeChoice('reset')}
                  className="bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold transition-all text-sm uppercase tracking-widest"
                >
                  Bắt đầu lại
                </button>
                <button 
                  onClick={() => handleResumeChoice('resume')}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold transition-all text-sm uppercase tracking-widest shadow-lg shadow-blue-500/20"
                >
                  Làm tiếp
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Confetti celebration animation (pure CSS, no extra library) ──
const ConfettiCelebration = ({ show, onComplete }: { show: boolean; onComplete: () => void }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onComplete, 4000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1,
    duration: 2 + Math.random() * 2,
    size: 6 + Math.random() * 8,
    color: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899'][Math.floor(Math.random() * 6)],
    rotation: Math.random() * 360,
  }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] pointer-events-none overflow-hidden"
      >
        {particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ y: -20, x: `${p.left}vw`, opacity: 1, rotate: 0 }}
            animate={{ y: '110vh', opacity: 0, rotate: p.rotation + 720 }}
            transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              left: `${p.left}%`,
            }}
          />
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        >
          <p className="text-6xl mb-4">🎉</p>
          <p className="text-3xl font-black text-white uppercase tracking-widest">THĂNG CẤP!</p>
          <p className="text-sm text-slate-400 mt-2">Chúc mừng bạn đã lên hạng mới!</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── User Rank Card Component ──
const UserRankCard = ({ user }: { user: UserProfile }) => {
  const stars = user.stars || 0;
  const rank = getCurrentRank(stars);
  const nextRank = getNextRank(stars);
  const progress = getRankProgress(stars);

  return (
    <div className={cn(
      "bg-gradient-to-r p-[1px] rounded-3xl",
      rank.bgColor.replace('from-', 'from-').includes('via-')
        ? "bg-gradient-to-r from-amber-500/40 via-rose-500/40 to-purple-500/40"
        : `bg-gradient-to-r ${rank.bgColor.replace('/20', '/40').replace('/10', '/30')}`
    )}>
      <div className="bg-slate-950 rounded-3xl p-6 space-y-4">
        {/* Rank Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-gradient-to-br border",
              rank.bgColor,
              rank.borderColor
            )}>
              {rank.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hạng hiện tại</p>
              <h3 className={cn("text-2xl font-black", rank.color)}>
                {rank.name}
              </h3>
              <p className="text-[10px] text-slate-500 italic">{rank.description}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Tổng sao</p>
            <p className={cn("text-3xl font-black", rank.color)}>⭐ {stars}</p>
          </div>
        </div>

        {/* Progress Bar */}
        {nextRank ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500">{rank.icon} {rank.name}</span>
              <span className="text-[10px] font-bold text-slate-500">{nextRank.icon} {nextRank.name}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress.percent}%` }}
                transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
                className={cn(
                  "h-full rounded-full bg-gradient-to-r relative",
                  rank.id >= 8 ? "from-red-600 via-orange-500 to-amber-400" :
                  rank.id >= 5 ? "from-blue-600 via-purple-500 to-rose-400" :
                  "from-slate-600 via-slate-500 to-slate-400"
                )}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </motion.div>
            </div>
            <p className="text-[10px] text-slate-400 text-center">
              Bạn đang có <span className="text-white font-bold">{stars} Sao</span>. 
              Chỉ cần <span className={cn("font-bold", nextRank.color)}>{progress.starsNeeded} Sao</span> nữa để thăng cấp <span className={cn("font-bold", nextRank.color)}>{nextRank.icon} {nextRank.name}</span>!
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-lg font-black bg-gradient-to-r from-amber-300 via-rose-400 to-purple-500 bg-clip-text text-transparent">
              🌟 HUYỀN THOẠI BẤT TỬ — ĐỈNH CAO VẬT LÝ 🌟
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Bạn đã đạt cấp bậc cao nhất!</p>
          </div>
        )}

        {/* Mini Rank Progress Overview */}
        <div className="flex gap-1 items-center">
          {RANKS.map((r, i) => (
            <div key={r.id} className="flex-1 group relative">
              <div className={cn(
                "h-1.5 rounded-full transition-all",
                stars >= r.minStars ? "bg-gradient-to-r from-red-500 to-orange-400 opacity-100" : "bg-slate-800 opacity-40"
              )} />
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-[9px] text-white px-2 py-1 rounded whitespace-nowrap z-10">
                {r.icon} {r.name} ({r.minStars}⭐)
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const StudentDashboard = ({ user, attempts, onStartPrescription, onStartExam }: { user: UserProfile, attempts: Attempt[], onStartPrescription: (topic: Topic, examId: string) => void, onStartExam: (exam: Exam) => void }) => {
  const studentStats = useStudentStats(user, attempts);

  const stats = useMemo(() => {
    if (attempts.length === 0) return null;
    const totalScore = attempts.reduce((acc, a) => acc + a.score, 0);
    const avgScore = (totalScore / attempts.length).toFixed(1);

    
    // Topic performance for Radar Chart
    const topicData: Record<string, { total: number, score: number }> = {};
    attempts.forEach(a => {
      if (!topicData[a.testId]) topicData[a.testId] = { total: 0, score: 0 };
      topicData[a.testId].total += 1;
      topicData[a.testId].score += a.score;
    });

    const radarData = Object.entries(topicData).map(([name, data]) => ({
      subject: name,
      A: (data.score / (data.total * 3)) * 100, // Assuming 3 questions per test for simplicity
      fullMark: 100
    }));

    const progressData = attempts.slice().reverse().map(a => ({
      date: new Date(a.timestamp?.seconds * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      score: (a.score / 3) * 10 // Scale to 10
    }));

    return { avgScore, radarData, progressData };
  }, [attempts]);

  return (
    <div className="space-y-10">
      {/* ── Header: Avatar + Info + Streak ── */}
      <div className="relative overflow-hidden bg-slate-900/50 backdrop-blur-md border border-slate-700/50 p-4 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-600/5 blur-3xl rounded-full translate-y-1/2 -translate-x-1/4 pointer-events-none" />
        <div className="flex items-center gap-6 relative z-10">
          {user.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl border-2 border-cyan-500/30 object-cover shadow-lg shadow-cyan-500/10" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-20 h-20 bg-cyan-600/10 rounded-3xl flex items-center justify-center border border-cyan-600/20">
              <UserIcon className="text-cyan-500 w-10 h-10" />
            </div>
          )}
          <div>
            <h2 className="text-xl sm:text-2xl md:text-4xl font-black font-headline tracking-tight mb-1 text-gradient-cyber">CHÀO CHIẾN BINH, {user.displayName}</h2>
            <p className="text-slate-400 font-medium font-sans leading-7">Hệ thống đã chuẩn bị lộ trình huấn luyện hôm nay.</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                Nhóm: {user.targetGroup}
              </span>
              <span className="bg-green-600/10 text-green-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                Trạng thái: Đang điều trị
              </span>
              {(user.streak ?? 0) > 0 && (
                <span className="bg-orange-600/10 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest animate-pulse">
                  🔥 Streak: {user.streak} ngày
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="text-center bg-slate-800/50 px-5 py-3 rounded-2xl border border-slate-700">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Streak</p>
            <p className="text-2xl font-black text-orange-400">🔥 {user.streak || 0}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Ngày nhập viện</p>
            <p className="text-white font-bold">{new Date(user.createdAt?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
          </div>
        </div>
      </div>

      {/* ── Motivational Motivation Area ── */}
      <div className="flex flex-col items-center justify-center space-y-4 bg-slate-900/80 border border-slate-800 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group mb-8">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-red-600/5 to-transparent pointer-events-none" />
        <div className="absolute top-6 right-6 z-20">
          <BackgroundMusic />
        </div>
        <CountdownTimer />
        <MotivationalQuote />
      </div>

      <ExamsList onStartExam={onStartExam} />

      {/* ── Rank Card ── */}
      <UserRankCard user={user} />

      {/* ── ATTEMPTS PROGRESS BAR (Monetization) ── */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden">
        {user.tier === 'vip' || user.isUnlimited ? (
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />
        ) : null}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 z-10">
            <Target className={cn("w-4 h-4", user.tier === 'vip' || user.isUnlimited ? "text-amber-500" : "text-blue-500")} />
            Lượt Làm Bài (API)
            {user.tier === 'vip' || user.isUnlimited ? (
               <span className="ml-2 bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">VIP</span>
            ) : null}
          </h3>
          <span className={cn("text-xs font-black z-10", user.tier === 'vip' || user.isUnlimited ? "text-amber-500 text-lg" : "text-blue-500")}>
            {user.tier === 'vip' || user.isUnlimited ? '∞' : `${user.usedAttempts || 0} / ${user.maxAttempts || 30}`}
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden relative z-10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: user.tier === 'vip' || user.isUnlimited ? '100%' : `${Math.min(100, ((user.usedAttempts || 0) / (user.maxAttempts || 30)) * 100)}%` }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className={cn(
               "h-full rounded-full bg-gradient-to-r relative",
               user.tier === 'vip' || user.isUnlimited ? "from-amber-500 via-yellow-400 to-amber-300" : "from-blue-600 via-blue-500 to-cyan-400"
            )}
          >
            {user.tier === 'vip' || user.isUnlimited ? (
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
            ) : null}
          </motion.div>
        </div>
        <div className="flex justify-between mt-2 z-10 relative">
          <p className="text-[10px] text-slate-500">
            {user.tier === 'vip' || user.isUnlimited 
              ? '✨ Quyền lực tuyệt đối! Không giới hạn số đề ôn luyện.'
              : 'Nâng cấp VIP để mở khóa Vô Hạn lượt thi.'}
          </p>
          {user.tier !== 'vip' && !user.isUnlimited && (
             <a href="https://zalo.me/0962662736?text=Em%20ch%C3%A0o%20Th%E1%BA%A7y%20H%E1%BA%ADu%2C%20em%20mu%E1%BB%91n%20n%C3%A2ng%20c%E1%BA%A5p%20t%C3%A0i%20kho%E1%BA%A3n%20VIP%20PHY8%2B" target="_blank" className="text-[10px] font-bold text-amber-500 hover:text-amber-400 uppercase">
               Nâng cấp ngay »
             </a>
          )}
        </div>
      </div>

      {/* ── Learning Path Progress Bar ── */}
      {user.learningPath && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-red-500" />
              Lộ trình Chinh phục 8.0+
            </h3>
            <span className="text-xs font-black text-red-500">{Math.round(user.learningPath.overallProgress)}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${user.learningPath.overallProgress}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400"
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-[10px] text-slate-500">
              {user.learningPath.completedTopics.length > 0 
                ? `✅ ${user.learningPath.completedTopics.length} chủ đề hoàn thành`
                : 'Chưa hoàn thành chủ đề nào'
              }
            </p>
            {user.learningPath.weaknesses.length > 0 && (
              <p className="text-[10px] text-red-400">
                ⚠️ {user.learningPath.weaknesses.length} điểm yếu cần khắc phục
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Chỉ số Sức khỏe (GPA)', value: studentStats.gpa, icon: Trophy, color: 'text-amber-500', glow: 'hover:border-amber-500/40 hover:shadow-amber-500/10' },
          { label: 'Liều thuốc đã dùng', value: `${studentStats.completedTests} Đề`, icon: BookOpen, color: 'text-blue-500', glow: 'hover:border-blue-500/40 hover:shadow-blue-500/10' },
          { label: 'Chuỗi ngày học', value: `${studentStats.streak} Ngày`, icon: History, color: 'text-orange-500', glow: 'hover:border-orange-500/40 hover:shadow-orange-500/10' },
          { label: 'Vùng Đỏ (Nguy kịch)', value: studentStats.redZoneCount.toString(), icon: AlertTriangle, color: 'text-red-500', glow: 'hover:border-red-500/40 hover:shadow-red-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn("bg-slate-900/50 backdrop-blur-md border border-slate-700/50 p-6 rounded-3xl transition-all duration-300 hover:-translate-y-0.5", stat.glow)}
            style={{ boxShadow: 'none' }}
            whileHover={{ boxShadow: '0 0 20px rgba(0,0,0,0.2)' }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-3 rounded-2xl bg-slate-800/80", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-5">{stat.label}</p>
            <p className="text-3xl font-black text-white mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Progress Chart */}
        <div className="lg:col-span-2 bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2 font-headline">
              <History className="text-cyan-400" />
              Tiến Độ Lộ Trình
            </h3>
          </div>
          
          <div className="h-[300px] w-full">
            {studentStats.progressData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={studentStats.progressData}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15,23,42,0.95)', 
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(100,116,139,0.3)', 
                      borderRadius: '16px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                      padding: '12px 16px',
                    }}
                    itemStyle={{ color: '#06b6d4', fontWeight: 700, fontSize: '14px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}
                    formatter={(value: any) => [`${Number(value).toFixed(1)} điểm`, 'Điểm']}
                    cursor={{ stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#06b6d4" 
                    fillOpacity={1} 
                    fill="url(#colorScore)" 
                    strokeWidth={3}
                    dot={{ fill: '#06b6d4', strokeWidth: 2, stroke: '#0f172a', r: 5 }}
                    activeDot={{ fill: '#06b6d4', strokeWidth: 3, stroke: '#0f172a', r: 7, style: { filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.5))' } }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 italic text-sm">
                Chưa đủ dữ liệu để vẽ tiến trình.
              </div>
            )}
          </div>
        </div>

        {/* Behavioral Analysis */}
        <div className="space-y-8">
          <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/8 rounded-full blur-3xl pointer-events-none" />
            <h3 className="text-2xl font-bold text-white flex items-center gap-2 mb-8 font-headline relative z-10">
              <BrainCircuit className="text-fuchsia-400" />
              Phân Tích Hành Vi
            </h3>
            <BehavioralAnalysisChart 
              careless={user.behavioralSummary?.careless || 0} 
              fundamental={user.behavioralSummary?.fundamental || 0} 
            />
            <div className="mt-6 space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Lỗi ẩu (Kỹ thuật)</span>
                <span className="text-blue-500 font-bold">{user.behavioralSummary?.careless || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Hổng gốc (Bản chất)</span>
                <span className="text-red-500 font-bold">{user.behavioralSummary?.fundamental || 0}</span>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-800">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Award className="w-3 h-3" />
                Danh hiệu đạt được
              </h4>
              <BadgeGallery badges={user.badges} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
              <Activity className="text-green-500 w-4 h-4" />
              Hoạt động gần đây
            </h3>
            <div className="space-y-4">
              {attempts.slice(0, 3).map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  <p className="text-xs text-slate-400">
                    Đã hoàn thành đề <span className="text-white font-bold">{a.testId}</span> với <span className="text-red-500">{a.score.toFixed(1)}đ</span>
                  </p>
                </div>
              ))}
              {attempts.length === 0 && <p className="text-xs text-slate-600 italic">Chưa có hoạt động nào.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-700/50 rounded-3xl p-8 mb-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <h3 className="text-3xl font-black flex items-center gap-3 mb-8 font-headline tracking-tight text-gradient-ocean">
          <BrainCircuit className="text-cyan-400 w-8 h-8" />
          Bài Tập & Kiểm Tra
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <TopicCard topic="Vật lí nhiệt" displayName="Chương 1: Vật Lý Nhiệt" isLocked={false} onClick={() => onStartPrescription('Vật lí nhiệt', '')} color="#f97316" />
          <TopicCard topic="Khí lí tưởng" displayName="Chương 2: Khí Lý Tưởng" isLocked={false} onClick={() => onStartPrescription('Khí lí tưởng', '')} color="#3b82f6" />
          <TopicCard topic="Từ trường" displayName="Chương 3: Từ Trường" isLocked={false} onClick={() => onStartPrescription('Từ trường', '')} color="#8b5cf6" />
          <TopicCard topic="Vật lí hạt nhân" displayName="Chương 4: VL Hạt Nhân" isLocked={false} onClick={() => onStartPrescription('Vật lí hạt nhân', '')} color="#10b981" />
          <div className="lg:col-span-4">
            <TopicCard topic="THPT" displayName="🔴 THI THỬ THPT QG MÔ PHỎNG" isLocked={false} onClick={() => onStartPrescription('THPT', '')} color="#e11d48" />
          </div>
        </div>
      </div>

      {/* ── Kho Ôn Tập (Knowledge Gap Bucket) ── */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-[2rem] p-8 mb-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 relative z-10">
          <div>
            <h3 className="font-headline font-bold text-3xl text-white flex items-center gap-3">
              <Archive className="text-orange-500 w-8 h-8" />
              Kho Ôn Tập
            </h3>
            <p className="text-slate-400 text-sm mt-2 font-medium">Knowledge Gap Bucket: Các câu hỏi AI đề xuất dựa trên lỗ hổng kiến thức hiện tại.</p>
          </div>
          <button 
            onClick={() => {
              if (user.knowledgeGapVault && user.knowledgeGapVault.length > 0) {
                // start a quiz based on vault questions (simplified for now, full implementation pending)
                toast.info(`Bạn có ${user.knowledgeGapVault.length} câu hỏi trong kho. Tính năng bốc thuốc từ Kho đang phát triển.`);
              } else {
                toast.info("Kho ôn tập của bạn đang trống!");
              }
            }} 
            className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 active:scale-95 duration-200"
          >
            Luyện Tập Ngay
          </button>
        </div>
        
        {/* Render Knowledge Gap Vault */}
        <KnowledgeGapGallery vaultIds={user.knowledgeGapVault || []} />
      </div>

      <div id="treatment" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Prescription History */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="text-2xl font-bold text-white flex items-center gap-2 font-headline relative z-10">
            <FlaskConical className="text-amber-500" />
            Lịch Sử Kê Đơn (Treatment Log)
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {user.prescriptions?.map((p, i) => (
              <div 
                key={i} 
                onClick={p.status === 'pending' ? () => onStartPrescription(p.title as Topic, p.examId) : undefined}
                className={cn(
                  "flex items-center justify-between p-4 border rounded-2xl transition-all",
                  p.status === 'pending' 
                    ? "bg-amber-600/5 border-amber-600/20 hover:border-amber-500 cursor-pointer" 
                    : "bg-slate-950/50 border-slate-800"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    p.status === 'completed' ? "bg-green-600/10 text-green-500" : "bg-amber-600/10 text-amber-500"
                  )}>
                    {p.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <History className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{p.title}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Giao ngày: {new Date(p.assignedAt?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
                    p.status === 'completed' ? "bg-green-600/10 text-green-500" : "bg-amber-600/10 text-amber-500"
                  )}>
                    {p.status === 'completed' ? `Đạt ${p.score?.toFixed(1)}đ` : 'Uống thuốc ngay'}
                  </span>
                </div>
              </div>
            ))}
            {(!user.prescriptions || user.prescriptions.length === 0) && (
              <div className="text-center py-10 text-slate-600 italic text-xs">Chưa có đơn thuốc nào được kê.</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="text-2xl font-bold text-white flex items-center gap-2 font-headline relative z-10">
            <History className="text-blue-500" />
            Hoạt Động Gần Đây
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {attempts.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-slate-600 transition-colors cursor-pointer">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg",
                  a.score >= 2 ? "bg-green-600/10 text-green-500" : "bg-red-600/10 text-red-500"
                )}>
                  {a.score.toFixed(1)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white truncate">{a.testId}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">{new Date(a.timestamp?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </div>
            ))}
            {attempts.length === 0 && (
              <div className="text-center py-10 text-slate-600 italic text-xs">Chưa có hoạt động nào.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TopicCard = ({ topic, displayName, isLocked, onClick, color }: { topic: Topic, displayName?: string, isLocked: boolean, onClick: () => void, color?: string }) => (
  <motion.div 
    whileHover={!isLocked ? { y: -4, scale: 1.01 } : {}}
    whileTap={!isLocked ? { scale: 0.98 } : {}}
    onClick={!isLocked ? onClick : undefined}
    className={cn(
      "relative p-8 rounded-[2rem] border transition-all duration-300 cursor-pointer group overflow-hidden",
      isLocked 
        ? "bg-slate-900/50 border-slate-800 grayscale opacity-60 cursor-not-allowed" 
        : "bg-slate-900/50 backdrop-blur-md border-slate-700/50"
    )}
    style={!isLocked ? { 
      // Dynamic hover glow handled via CSS custom property
    } : {}}
    onMouseEnter={(e) => {
      if (!isLocked && color) {
        const el = e.currentTarget;
        el.style.borderColor = `${color}60`;
        el.style.boxShadow = `0 0 24px ${color}15, 0 8px 32px rgba(0,0,0,0.3)`;
      }
    }}
    onMouseLeave={(e) => {
      if (!isLocked) {
        const el = e.currentTarget;
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }
    }}
  >
    <div className="absolute top-0 right-0 w-32 h-32 blur-3xl -z-10 transition-opacity opacity-0 group-hover:opacity-100"
      style={{ backgroundColor: `${color || '#dc2626'}15` }} />
    
    <div className="flex justify-between items-start mb-6">
      <div className={cn(
        "p-4 rounded-2xl transition-all duration-500",
        isLocked ? "bg-slate-800" : "text-white"
      )}
        style={!isLocked ? { backgroundColor: `${color || '#dc2626'}18` } : {}}
      >
        {topic === 'THPT' ? <Settings className="w-6 h-6" /> : <BookOpen className="w-6 h-6" />}
      </div>
      {isLocked && (
        <div className="flex items-center gap-1 text-amber-500 text-[10px] font-bold uppercase bg-amber-500/10 px-2 py-1 rounded-full animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          Vùng Đỏ
        </div>
      )}
    </div>

    <h4 className="text-xl font-black text-white mb-2 tracking-tight transition-colors"
      style={{ color: undefined }}
    >
      {displayName || topic}
    </h4>
    <p className="text-xs text-slate-500 font-medium leading-6 mb-6">
      {isLocked 
        ? "Đang trong vùng đỏ. Cần hoàn thành phác đồ điều trị để mở khóa." 
        : topic === 'THPT' 
          ? "Kiểm tra tổng hợp 4 chương chuẩn theo cấu trúc Bộ GD&ĐT 2026" 
          : "Luyện tập cấu trúc 3 phần: Trắc nghiệm, Đúng/Sai, Trả lời ngắn."}
    </p>

    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-600">
        <span>Cấu trúc</span>
        <span className="text-slate-400">18 - 4 - 6</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full w-0 group-hover:w-full transition-all duration-1000 rounded-full"
          style={{ backgroundColor: color || '#dc2626' }} />
      </div>
    </div>
  </motion.div>
);

// --- Main App ---

// ── Wrapper tự fetch questions cho DuplicateReviewHub — ONE-SHOT ──
const DuplicateReviewHubWrapper = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  useEffect(() => {
    const fetchQ = async () => {
      try {
        const snap = await getDocs(collection(db, 'questions'));
        setQuestions(snap.docs.map(d => ({ ...d.data(), id: d.id } as Question)));
      } catch (err) {
        console.warn('[DuplicateHub] Lỗi fetch questions:', err);
      }
    };
    fetchQ();
  }, []);
  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'questions', id));
    // Fix: Cập nhật local state ngay sau khi xóa thành công
    setQuestions(prev => prev.filter(q => q.id !== id));
  };
  return <DuplicateReviewHub questions={questions} onDeleteQuestion={handleDelete} />;
};

const UpgradeModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border-2 border-amber-500/30 w-full max-w-md rounded-[2rem] p-8 shadow-2xl flex flex-col items-center text-center overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-500/10 blur-[100px] rounded-full pointer-events-none" />
        
        {/* Icon Header */}
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/40 border border-amber-300">
          <Target className="w-10 h-10 text-white" />
        </div>

        <h2 className="text-2xl font-black text-white mb-2">Đã hết lượt làm bài!</h2>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Bạn đã sử dụng hết lượt làm bài của tài khoản Miễn phí. Hãy nâng cấp lên hạng <strong className="text-amber-400">VIP</strong> để mở khóa đặc quyền vô cực (Unlimited) và truy cập toàn bộ kho đề thi, lộ trình chuyên sâu!
        </p>

        {/* Cấu trúc báo giá tượng trưng (nếu muốn) hoặc Call to Action */}
        <div className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 mb-6">
          <ul className="text-left text-sm space-y-3">
            <li className="flex items-center gap-3 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Không giới hạn lượt thi</li>
            <li className="flex items-center gap-3 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Ưu tiên chấm điểm AI siêu tốc</li>
            <li className="flex items-center gap-3 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Mở khóa Lộ trình Hổng kiến thức</li>
          </ul>
        </div>

        {/* Nút Call to Action */}
        <a 
          href="https://zalo.me/0962662736?text=Em%20ch%C3%A0o%20Th%E1%BA%A7y%20H%E1%BA%ADu%2C%20em%20mu%E1%BB%91n%20n%C3%A2ng%20c%E1%BA%A5p%20t%C3%A0i%20kho%E1%BA%A3n%20VIP%20PHY8%2B"
          target="_blank" 
          rel="noreferrer"
          className="w-full relative group overflow-hidden bg-white text-slate-900 font-black rounded-xl p-4 flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all duration-300"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
          Nâng cấp VIP qua Zalo ngay <ChevronRight className="w-5 h-5" />
        </a>

        <button 
          onClick={onClose}
          className="mt-6 text-xs text-slate-500 font-bold hover:text-white transition-colors"
        >
          Đóng cửa sổ
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [adminTab, setAdminTab] = useState<'Digitize' | 'Bank' | 'Matrix' | 'Generator' | 'SimLab' | 'Duplicates' | 'Sanitizer' | 'Reports' | 'Classroom' | 'Directory' | 'Library'>('Digitize');
  const [activeView, setActiveView] = useState<SidebarTab>('dashboard');

  // ── Unified navigation handler: student tabs vs admin tabs ──
  const handleSidebarNavigate = (tab: SidebarTab) => {
    setActiveView(tab);
    // Nếu là admin tab → sync với adminTab state
    if ((ADMIN_TABS as readonly string[]).includes(tab)) {
      setAdminTab(tab as any);
    }
    // Reset test state khi chuyển tab
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
  const [submissionResult, setSubmissionResult] = useState<{ score: number; earnedXP: number; show: boolean } | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  // ═══ [SESSION PERSISTENCE] Lưu & khôi phục phiên thi khi bị văng ra ═══
  const SESSION_KEY = 'phys8_active_exam_session';

  // Lưu phiên thi vào localStorage mỗi khi activeTest hoặc answers thay đổi
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

  // Xóa phiên thi khi đã nộp bài (results có giá trị) hoặc hủy bài
  const clearExamSession = () => {
    localStorage.removeItem(SESSION_KEY);
    // Cũng xóa draft key cũ của ProExamExperience
    if (auth.currentUser?.uid && activeTest?.topic) {
      localStorage.removeItem(`exam_draft_${auth.currentUser.uid}_${activeTest.topic}`);
    }
  };

  // Khôi phục phiên thi sau khi user login lại
  const restoreExamSession = () => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (!saved) return false;
      const session = JSON.parse(saved);
      // Kiểm tra tính hợp lệ: phải có questions và chưa quá 2 giờ
      if (!session.questions || !Array.isArray(session.questions) || session.questions.length === 0) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }
      const elapsed = Date.now() - (session.savedAt || 0);
      if (elapsed > 2 * 60 * 60 * 1000) { // Quá 2 giờ → xóa session cũ
        localStorage.removeItem(SESSION_KEY);
        return false;
      }
      // Khôi phục!
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
    const fetchSims = async () => {
      try {
        const snap = await getDocs(collection(db, 'simulations'));
        const simsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Simulation));
        setSimulations(simsData.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
      } catch (error) {
        console.error("Lỗi khi load simulations:", error);
      }
    };
    fetchSims();
  }, []);

  // Auth Listener
  useEffect(() => {
    let uSub: (() => void) | null = null;
    let aSub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const ADMIN_EMAILS = ['haunn.vietanhschool@gmail.com', 'thayhauvatly@gmail.com'];
          const isAdmin = ADMIN_EMAILS.includes(firebaseUser.email ?? '');
          let userDoc: any;
          try {
            userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          } catch (fetchErr: any) {
            console.warn("Lỗi lấy dữ liệu user từ server, thử đọc từ cache...", fetchErr);
            try {
              userDoc = await getDocFromCache(doc(db, 'users', firebaseUser.uid));
            } catch (cacheErr) {
              console.warn("Lỗi đọc cache rỗng, tạo dữ liệu ảo tạm:", cacheErr);
              userDoc = { exists: () => false, data: () => undefined };
            }
          }
          
          let currentUserData: UserProfile;
          const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

          // ── Streak calculation helper ──
          const calcStreak = (prevStreak?: number, lastDate?: string): { streak: number; lastStreakDate: string } => {
            if (!lastDate) return { streak: 1, lastStreakDate: today };
            if (lastDate === today) return { streak: prevStreak || 1, lastStreakDate: today };
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);
            if (lastDate === yesterdayStr) return { streak: (prevStreak || 0) + 1, lastStreakDate: today };
            return { streak: 1, lastStreakDate: today }; // Reset streak
          };

          if (userDoc.exists()) {
            // ── Email cũ: cập nhật lastActive + streak ──
            currentUserData = userDoc.data() as UserProfile;
            // Cập nhật photoURL nếu thay đổi
            if (firebaseUser.photoURL && currentUserData.photoURL !== firebaseUser.photoURL) {
              currentUserData.photoURL = firebaseUser.photoURL;
            }
            if (isAdmin && currentUserData.role !== 'admin') {
              currentUserData.role = 'admin';
            }
            const { streak, lastStreakDate } = calcStreak(currentUserData.streak, currentUserData.lastStreakDate);
            currentUserData.streak = streak;
            currentUserData.lastStreakDate = lastStreakDate;
            currentUserData.lastActive = Timestamp.now();
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                role: currentUserData.role,
                photoURL: currentUserData.photoURL || null,
                streak,
                lastStreakDate,
                lastActive: Timestamp.now(),
              }, { merge: true });
            } catch (writeErr) {
              console.warn('[Sync] Không thể cập nhật streak (có thể do lỗi quota):', writeErr);
            }
          } else {
            // ── Email mới: tạo UserProfile đầy đủ ──
            currentUserData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Học sinh',
              photoURL: firebaseUser.photoURL || undefined,
              role: isAdmin ? 'admin' : 'student',
              targetGroup: 'Chống Sai Ngu',
              redZones: [],
              createdAt: Timestamp.now(),
              lastActive: Timestamp.now(),
              streak: 1,
              lastStreakDate: today,
              learningPath: {
                completedTopics: [],
                topicProgress: {},
                overallProgress: 0,
                weaknesses: [],
              },
            };
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), currentUserData);
            } catch (writeErr) {
              console.warn('[Sync] Không thể tạo user mới trên server:', writeErr);
            }
          }

          // ── Ghi LoginLog ──
          try {
            const loginLog: Omit<LoginLog, 'id'> = {
              userId: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              timestamp: Timestamp.now(),
              userAgent: navigator.userAgent,
              action: 'login',
            };
            await addDoc(collection(db, 'loginLogs'), loginLog);
          } catch (e) {
            console.warn('[LoginLog] Không ghi được log:', e);
          }

          setUser(currentUserData);

          // ═══ [SESSION RESTORE] Sau khi user đã sẵn sàng → khôi phục phiên thi đang dở ═══
          if (!activeTest) {
            restoreExamSession();
          }

          // Real-time user profile
          uSub = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
            if (snap.exists()) {
              setUser(snap.data() as UserProfile);
            }
          });

          // Real-time attempts
          const aQuery = query(collection(db, 'attempts'), where('userId', '==', firebaseUser.uid));
          aSub = onSnapshot(aQuery, async (snap) => {
            const sortedAttempts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Attempt)).sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds);
            setAttempts(sortedAttempts);

            // Daily Reminder logic using latest snapshot data
            const today = new Date().toDateString();
            const lastAttempt = sortedAttempts[0];
            const lastAttemptDate = lastAttempt?.timestamp?.toDate().toDateString();
            
            // We need the latest user data for notification check
            try {
              const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
              const latestUser = userSnap.data() as UserProfile;

              if (lastAttemptDate !== today && !latestUser.notifications?.find(n => n.title === 'Nhắc nhở hàng ngày' && n.timestamp.toDate().toDateString() === today)) {
                const reminder: AppNotification = {
                  id: 'daily_' + Date.now(),
                  title: 'Nhắc nhở hàng ngày',
                  message: 'Hôm nay em chưa uống thuốc Vật lý đâu nhé! Hãy làm một đề để duy trì phong độ.',
                  type: 'warning',
                  read: false,
                  timestamp: Timestamp.now()
                };
                const updatedNotifications = [reminder, ...(latestUser.notifications || [])].slice(0, 20);
                await setDoc(doc(db, 'users', firebaseUser.uid), { notifications: updatedNotifications }, { merge: true });
              }
            } catch (err) {
              console.warn("Không thể check daily reminder (có thể do quota)", err);
            }
          });
        } else {
          setUser(null);
          setAttempts([]);
          if (uSub) uSub();
          if (aSub) aSub();
        }
      } catch (err: any) {
        console.error("Auth State Error:", err);
        // Error handling fallback 
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
           setAuthError(`Server đang quá tải tạm thời. Bạn đang xem chế độ Offline từ bộ nhớ đệm.`);
           // Lỗi quota: không reset user(null) vì có thể dữ liệu cache đang dùng tốt
           // Chỉ reset nếu thât sự user chưa được fetch
           setUser((prev) => prev); // Giữ nguyên
        } else {
           setAuthError(`Lỗi đồng bộ dữ liệu: ${err?.message || 'Không xác định'}`);
           setUser(null); // Lỗi khác (mạng, corrupt,...) -> logout
        }
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (uSub) uSub();
      if (aSub) aSub();
    };
  }, []);

  const markNotificationAsRead = async (id: string) => {
    if (!user) return;
    const updatedNotifications = user.notifications?.map(n => n.id === id ? { ...n, read: true } : n);
    await setDoc(doc(db, 'users', user.uid), { notifications: updatedNotifications }, { merge: true });
    setUser(prev => prev ? { ...prev, notifications: updatedNotifications } : null);
  };

  const exportExamToPDF = async (exam: Exam) => {
    const pdfDoc = new jsPDF();
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();
    const marginBottom = 20;
    
    // Header
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

    // ═══ HELPER: Ước tính chiều cao một câu hỏi ═══
    const estimateQuestionHeight = (q: Question, label: string): number => {
      const contentLines = pdfDoc.splitTextToSize(`${label}: ${q.content.replace(/\$|\$\$/g, '')}`, pageWidth - 40);
      let h = contentLines.length * 5 + 5;
      if (q.options) {
        h += (q.part === 1 ? Math.ceil(q.options.length / 2) : q.options.length) * 7 + 5;
      }
      return h;
    };

    // ═══ HELPER: Render một câu (trả về y mới) ═══
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

    // ═══ HELPER: Tạo blocks (câu lẻ + câu chùm) ═══
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

    // ═══ RENDER PER PART ═══
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
          // ═══ CLUSTER BLOCK ═══
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

          // Page-break-inside: avoid — nếu block không vừa trang → addPage trước
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

    pdfDoc.save(`${exam.title}.pdf`);
  };
  const startTest = async (topic: Topic, examId?: string) => {
    if (!user) {
      toast.error("Vui lòng đăng nhập để bắt đầu bài thi.");
      return;
    }
    
    setLoading(true);
    
    try {
      // ═══ KIỂM TRA & TRỪ LƯỢT VIP ═══
      try {
        await startExamAttempt(user.uid, user.role === 'admin');
      } catch (err: any) {
        setLoading(false);
        if (err.message === 'EXCEEDED_LIMIT') {
           setShowUpgradeModal(true);
           return;
        } else {
           toast.error("Có lỗi xảy ra khi kiểm tra lượt làm bài: " + (err.message || 'Chưa rõ.'));
           return;
        }
      }

      // ═══ [SESSION CHECK] Kiểm tra phiên thi đang dở trước khi tạo đề mới ═══
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (savedSession && !examId) {
        try {
          const session = JSON.parse(savedSession);
          const elapsed = Date.now() - (session.savedAt || 0);
          // Nếu cùng topic VÀ chưa quá 2 giờ → khôi phục phiên cũ
          if (session.topic === topic && session.questions?.length > 0 && elapsed < 2 * 60 * 60 * 1000) {
            console.info(`[startTest] ♻️ Khôi phục phiên thi đang dở: ${topic}`);
            setActiveTest({ topic: session.topic, questions: session.questions, examId: session.examId });
            setAnswers(session.answers || {});
            setCurrentQuestionIndex(session.currentQuestionIndex || 0);
            setResults(null);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('[startTest] Lỗi đọc session cũ, tạo đề mới:', e);
        }
      }

      if (examId) {
        const examDoc = await getDoc(doc(db, 'exams', examId));
        if (examDoc.exists()) {
          const examData = examDoc.data() as Exam;
          setActiveTest({ topic: examData.questions[0].topic, questions: examData.questions, examId: examDoc.id });
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
      
      let allQuestions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)).filter(q => (q.status || 'published') === 'published');

      // --- DYNAMIC TEST GENERATOR ---
      // Cấu trúc: 18 - 4 - 6. Cấp độ: NB(~40%), TH(~30%), VD/VDC(~30%)
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

      const pick = (part: 1|2|3, expectedNb: number, expectedTh: number, expectedVd: number, total: number) => {
        const result: Question[] = [];
        
        const take = (cat: 'NB'|'TH'|'VD', count: number) => {
          const taken = buckets[part][cat].splice(0, count);
          result.push(...taken);
        };
        
        take('NB', expectedNb);
        take('TH', expectedTh);
        take('VD', expectedVd);
        
        // Fill shortfalls with whatever is left in that part
        const remainingInPart = [...buckets[part].NB, ...buckets[part].TH, ...buckets[part].VD];
        shuffle(remainingInPart);
        
        const needed = total - result.length;
        if (needed > 0 && remainingInPart.length > 0) {
          result.push(...remainingInPart.splice(0, Math.min(needed, remainingInPart.length)));
        }
        
        return result;
      };

      // Target quotas
      const p1 = pick(1, 7, 6, 5, 18);
      const p2 = pick(2, 2, 1, 1, 4);
      const p3 = pick(3, 2, 1, 3, 6);

      let finalQuestions = [...p1, ...p2, ...p3];

      // ═══ [CLUSTER] Đảm bảo câu chùm luôn đi cùng nhau + BLOCK-SHUFFLE ═══
      const selectedClusterIds = new Set<string>();
      for (const q of finalQuestions) {
        if (q.clusterId) selectedClusterIds.add(q.clusterId);
      }
      // Kéo siblings vào đề nếu thiếu
      if (selectedClusterIds.size > 0) {
        for (const cid of selectedClusterIds) {
          const siblings = allQuestions.filter(
            q => q.clusterId === cid && !finalQuestions.find(fq => fq.id === q.id)
          );
          if (siblings.length > 0) finalQuestions.push(...siblings);
        }
        // Fetch sharedContext từ collection 'clusters'
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

      // ═══ BLOCK-SHUFFLE: Nhóm cluster = khối nguyên tử, trộn giữa khối ═══
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
        
        // Sort nội bộ cluster theo clusterOrder
        for (const [, group] of clusterMap) {
          group.sort((a, b) => (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0));
        }
        
        // Tạo mảng blocks: mỗi câu lẻ = 1 block, mỗi cluster = 1 block (array)
        const blocks: (Question | Question[])[] = [
          ...standalones,
          ...Array.from(clusterMap.values())
        ];
        
        // Shuffle các blocks
        blocks.sort(() => Math.random() - 0.5);
        
        // Mở phẳng
        return blocks.flatMap(b => Array.isArray(b) ? b : [b]);
      };

      // Áp dụng block-shuffle theo từng phần (giữ phần I → phần II → phần III)
      const part1Qs = finalQuestions.filter(q => q.part === 1);
      const part2Qs = finalQuestions.filter(q => q.part === 2);
      const part3Qs = finalQuestions.filter(q => q.part === 3);
      finalQuestions = [...blockShuffle(part1Qs), ...blockShuffle(part2Qs), ...blockShuffle(part3Qs)];

      // If no questions in DB, use fallback mock
      if (finalQuestions.length === 0) {
        finalQuestions = [
          {
            id: 'q1',
            part: 1,
            topic,
            level: 'Thông hiểu',
            content: 'Trong quá trình đẳng nhiệt của một lượng khí lí tưởng nhất định, nếu áp suất tăng lên 2 lần thì thể tích của khối khí sẽ:',
            options: ['Tăng 2 lần', 'Giảm 2 lần', 'Tăng 4 lần', 'Không đổi'],
            correctAnswer: 1,
            explanation: 'Theo định luật Boyle: $pV = const$. Nếu $p$ tăng 2 thì $V$ giảm 2.'
          },
          {
            id: 'q2',
            part: 2,
            topic,
            level: 'Vận dụng',
            content: 'Xét một khối khí lí tưởng thực hiện chu trình biến đổi trạng thái. Các phát biểu sau đây đúng hay sai?',
            options: [
              'a) Trong quá trình đẳng tích, độ biến thiên nội năng bằng nhiệt lượng mà khí nhận được.',
              'b) Trong quá trình đẳng áp, công mà khí thực hiện tỉ lệ thuận với độ biến thiên nhiệt độ.',
              'c) Trong quá trình đẳng nhiệt, khí không trao đổi nhiệt với môi trường.',
              'd) Một chu trình kín luôn có tổng công thực hiện bằng 0.'
            ],
            correctAnswer: [true, true, false, false],
            explanation: 'a) Đúng ($Q = \\Delta U + A, A=0$). b) Đúng ($A = p\\Delta V = nR\\Delta T$). c) Sai ($Q = A$). d) Sai ($A_{total} = \\text{Diện tích chu trình}$).'
          },
          {
            id: 'q3',
            part: 3,
            topic,
            level: 'Vận dụng cao',
            content: 'Một xi lanh chứa 0,1 mol khí lí tưởng ở áp suất $10^5$ Pa và nhiệt độ 27°C. Nén khí đẳng nhiệt đến áp suất $2.10^5$ Pa. Tính thể tích cuối cùng của khối khí theo đơn vị lít (L). Làm tròn đến 2 chữ số thập phân.',
            correctAnswer: 1.25,
            explanation: '$V_1 = \\frac{nRT}{p_1} = \\frac{0.1 \\cdot 8.31 \\cdot 300}{10^5} = 0.002493 \\text{ m}^3 = 2.493 \\text{ L}$. $V_2 = V_1 \\cdot \\frac{p_1}{p_2} = 2.493 / 2 = 1.2465 \\text{ L}$. Làm tròn -> 1.25 L.'
          }
        ];
      }

      setActiveTest({ topic, questions: finalQuestions });
      setCurrentQuestionIndex(0);
      setAnswers({});
      setResults(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'questions');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionId: string, answer: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const submitTest = async () => {
    if (!activeTest || !user) return;
    setIsAnalyzing(true);
    
    // ── Chấm điểm chuẩn 10 điểm (18P1 × 0.25 + 4P2 × 1.0 + 6P3 × 0.25) ──
    let totalScore = 0;
    const errorTracking: Record<string, any> = {};
    const normalizeDecimal = (v: any) => parseFloat(String(v ?? '0').replace(',', '.'));
    
    // ── Khởi tạo bộ nhớ 70-30 ──
    const newFailedQuestionIds = new Set(user.failedQuestionIds || []);

    for (const q of activeTest.questions) {
      const studentAns = answers[q.id];
      let isCorrect = false;

      if (q.part === 1) {
        isCorrect = studentAns === q.correctAnswer;
        if (isCorrect) totalScore += 0.25;
      } else if (q.part === 2) {
        let correctCount = 0;
        for (let i = 0; i < 4; i++) {
          if (Array.isArray(studentAns) && studentAns[i] !== undefined && studentAns[i] === (q.correctAnswer as boolean[])[i]) {
            correctCount++;
          }
        }
        if (correctCount === 4) { isCorrect = true; totalScore += 1.0; }
        else if (correctCount === 3) totalScore += 0.5;
        else if (correctCount === 2) totalScore += 0.25;
        else if (correctCount === 1) totalScore += 0.1;
      } else if (q.part === 3) {
        const studentVal = normalizeDecimal(studentAns);
        const correctVal = normalizeDecimal(q.correctAnswer);
        isCorrect = !isNaN(studentVal) && Math.abs(studentVal - correctVal) < 0.01;
        if (isCorrect) totalScore += 0.25;
      }
      
      // ── Cập nhật bộ nhớ 70-30 ──
      if (q.id) {
        if (!isCorrect) {
          newFailedQuestionIds.add(q.id); // Lưu vào hồ sơ bệnh án
        } else {
          newFailedQuestionIds.delete(q.id); // Đã làm đúng, gỡ khỏi hồ sơ
        }
      }
    }

    const redZones = totalScore < 6.0 ? [activeTest.topic] : [];

    const attempt: Attempt = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.uid,
      testId: activeTest.topic,
      answers,
      score: totalScore,
      timestamp: Timestamp.now()
    };

    try {
      await addDoc(collection(db, 'attempts'), attempt);
      
      const updatedUser = { ...user };
      const newBadges: Badge[] = [...(user.badges || [])];
      const newNotifications: AppNotification[] = [...(user.notifications || [])];

      // Award "Bậc thầy" badge (Max Score is 10.0)
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
      
      if (redZones.length > 0) {
        updatedUser.redZones = Array.from(new Set([...(user.redZones || []), ...redZones]));
      }

      // Prescriptions
      if (user.prescriptions) {
        updatedUser.prescriptions = user.prescriptions.map(p => {
          if (p.status === 'pending' && p.title === activeTest.topic) {
            return { ...p, status: 'completed', completedAt: Timestamp.now(), score: totalScore };
          }
          return p;
        });
      }

      // ═══════════════════════════════════════════════════════════════
      //  SPRINT 2: GAMIFICATION HOOKS — XP + STREAK ENGINE
      // ═══════════════════════════════════════════════════════════════

      // ── 1. Tính XP (Stars) theo công thức mới ──
      // Công thức: Cứ 0.25 điểm = +10 XP | Bonus +100 XP nếu > 8.0
      const scoreXP = Math.floor(totalScore / 0.25) * 10; // e.g. 7.5đ → 30 slots × 10 = 300 XP
      const bonusXP = totalScore > 8.0 ? 100 : 0;         // Thưởng nóng
      const earnedXP = scoreXP + bonusXP;

      const prevStars = user.stars || 0;
      const prevRank = getCurrentRank(prevStars);
      updatedUser.stars = prevStars + earnedXP;

      // Giữ lại rewards system cũ cho streak milestones
      const rewards = calculateTestRewards(totalScore, user.streak || 0);
      const streakBonusStars = rewards
        .filter(r => r.action.startsWith('daily_streak'))
        .reduce((sum, r) => sum + r.stars, 0);
      updatedUser.stars += streakBonusStars;

      // ── 2. Cập nhật Streak (Chuỗi ngày học) ──
      const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
      const lastDate = user.lastStreakDate;
      let newStreak = 1;

      if (lastDate) {
        if (lastDate === today) {
          // Cùng ngày → giữ nguyên streak
          newStreak = user.streak || 1;
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().slice(0, 10);

          if (lastDate === yesterdayStr) {
            // Ngày hôm qua → streak += 1
            newStreak = (user.streak || 0) + 1;
          } else {
            // Cách quá 2 ngày → reset streak = 1
            newStreak = 1;
          }
        }
      }

      updatedUser.streak = newStreak;
      updatedUser.lastStreakDate = today;
      updatedUser.lastActive = Timestamp.now();

      // ── 3. Kiểm tra thăng cấp ──
      const newRank = getCurrentRank(updatedUser.stars);
      if (newRank.id > prevRank.id) {
        setShowConfetti(true); // 🎉 Trigger confetti!
        newNotifications.push({
          id: `rank_up_${Date.now()}`,
          title: `🎉 Thăng cấp ${newRank.icon} ${newRank.name}!`,
          message: `Chúc mừng! Bạn đã thăng lên ${newRank.name} với ${updatedUser.stars} ⭐ (+${earnedXP} XP bài thi${bonusXP > 0 ? ' + 🔥100 XP thưởng nóng' : ''})!`,
          type: 'success',
          read: false,
          timestamp: Timestamp.now(),
        });
        updatedUser.notifications = newNotifications;
      }

      await setDoc(doc(db, 'users', user.uid), updatedUser, { merge: true });
      setUser(updatedUser);

      setSubmissionResult({ score: totalScore, earnedXP, show: true });
      setResults(attempt);
      clearExamSession(); // Xóa session — bài thi đã nộp xong
      setShowVirtualLab(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'attempts');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDiagnosis = async () => {
    if (!results || !activeTest || !user) return;
    setIsAnalyzing(true);
    try {
      const skippedRecords: { question: any, studentAnswer: any, isCorrect: boolean }[] = [];
      const incorrectRecords: { question: any, studentAnswer: any, isCorrect: boolean }[] = [];

      activeTest.questions.forEach(q => {
        const studentAns = results.answers[q.id || ''];
        
        // Xác định câu hỏi bị bỏ trống
        const isSkipped = 
          studentAns === undefined || 
          studentAns === null || 
          studentAns === '' || 
          (q.part === 2 && Array.isArray(studentAns) && studentAns.filter(val => val !== undefined && val !== null).length === 0);

        if (isSkipped) {
          skippedRecords.push({ question: q, studentAnswer: studentAns, isCorrect: false });
          return;
        }

        // Logic check sai
        let isIncorrect = false;
        if (q.part === 1) isIncorrect = studentAns !== q.correctAnswer;
        else if (q.part === 2) {
          isIncorrect = Array.from({ length: 4 }).some((_, i) => !Array.isArray(studentAns) || studentAns[i] !== (q.correctAnswer as boolean[])[i]);
        }
        else if (q.part === 3) isIncorrect = Math.abs(parseFloat(studentAns) - (q.correctAnswer as number)) >= 0.01;

        if (isIncorrect) {
          incorrectRecords.push({ question: q, studentAnswer: studentAns, isCorrect: false });
        }
      });

      const analysisRaw = await diagnoseUserExam(incorrectRecords, skippedRecords);
      const analysisData = {
        errorTracking: {}, // Bỏ qua do batch diagnosis không mapping từng ID
        feedback: analysisRaw.feedback,
        redZones: analysisRaw.redZones,
        remedialMatrix: analysisRaw.remedialMatrix,
        behavioralAnalysis: analysisRaw.behavioralAnalysis,
        skippedCount: skippedRecords.length
      };
      
      const newResults = { ...results, analysis: analysisData };
      setResults(newResults);
      await setDoc(doc(db, 'attempts', results.id), newResults, { merge: true });

      const updatedUser = { ...user };
      if (analysisRaw.redZones.length > 0) {
        updatedUser.redZones = Array.from(new Set([...(user.redZones || []), ...analysisRaw.redZones]));
      }
      updatedUser.behavioralSummary = {
        careless: (user.behavioralSummary?.careless || 0) + analysisRaw.behavioralAnalysis.carelessCount,
        fundamental: (user.behavioralSummary?.fundamental || 0) + analysisRaw.behavioralAnalysis.fundamentalCount
      };

      await setDoc(doc(db, 'users', user.uid), updatedUser, { merge: true });
      setUser(updatedUser);
    } catch (e) {
      console.error(e);
      alert("Lỗi chẩn đoán bằng AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAdaptiveTestFix = async () => {
    if (!results || !results.analysis || !user) return;
    const matrix = results.analysis.remedialMatrix;
    if (!matrix || matrix.length === 0) {
      toast.error("Hệ thống chưa tạo được ma trận khắc phục. Hãy thử phân tích lại.");
      return;
    }
    
    setLoading(true);
    try {
      const resultQuestions: Question[] = [];
      const qRef = collection(db, 'questions');
      
      for (const item of matrix) {
        if (item.count <= 0) continue;
        const qQuery = query(qRef, where('topic', '==', item.topic));
        const snapshot = await getDocs(qQuery);
        let qs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)).filter(q => (q.status || 'published') === 'published');
        
        // Shuffle and pick exactly 'count' questions
        qs = qs.sort(() => Math.random() - 0.5);
        resultQuestions.push(...qs.slice(0, item.count));
      }

      if (resultQuestions.length === 0) {
        toast.error("Xin lỗi, ngân hàng đề chưa đủ câu hỏi cho các chủ đề này.");
        setLoading(false);
        return;
      }

      // Sort questions so that it flows logically (Part 1 -> Part 2 -> Part 3)
      resultQuestions.sort((a, b) => a.part - b.part);

      // ═══ [CLUSTER] Kéo câu cùng cluster vào đề khắc phục ═══
      const clusterIds = new Set<string>();
      for (const q of resultQuestions) {
        if (q.clusterId) clusterIds.add(q.clusterId);
      }
      if (clusterIds.size > 0) {
        const allPickedIds = new Set(resultQuestions.map(q => q.id));
        for (const cid of clusterIds) {
          const sibSnap = await getDocs(query(qRef, where('clusterId', '==', cid)));
          const siblings = sibSnap.docs
            .map(d => ({ ...d.data(), id: d.id } as Question))
            .filter(q => !allPickedIds.has(q.id));
          resultQuestions.push(...siblings);
        }
        // Re-sort with cluster grouping
        resultQuestions.sort((a, b) => {
          if (a.clusterId && b.clusterId && a.clusterId === b.clusterId)
            return (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0);
          return a.part - b.part;
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

  const handleSaveToVault = async () => {
    if (!results || !activeTest || !user) return;
    try {
      const incorrectIds = activeTest.questions.filter(q => {
        const studentAns = results.answers[q.id || ''];
        if (studentAns === undefined || studentAns === null || studentAns === '') return true;
        if (q.part === 1) return studentAns !== q.correctAnswer;
        if (q.part === 2) {
          return Array.from({ length: 4 }).some((_, i) => !Array.isArray(studentAns) || studentAns[i] !== (q.correctAnswer as boolean[])[i]);
        }
        if (q.part === 3) return Math.abs(parseFloat(studentAns) - (q.correctAnswer as number)) >= 0.01;
        return false;
      }).map(q => q.id as string).filter(id => id);

      const updatedVault = Array.from(new Set([...(user.knowledgeGapVault || []), ...incorrectIds]));
      
      await updateDoc(doc(db, 'users', user.uid), {
        knowledgeGapVault: updatedVault
      });
      setUser({ ...user, knowledgeGapVault: updatedVault });
      toast.success("Đã lưu " + incorrectIds.length + " câu sai vào Kho Ôn Tập thành công!");
    } catch (error) {
      console.error(error);
      toast.error("Lỗi khi lưu vào Kho Ôn Tập");
    }
  };


  const adminStats = useDashboardStats();

  // ═══ Module 4: Projector View Detection ═══
  const projectorExamId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('projector');
  }, []);

  if (projectorExamId) {
    return <ProjectorLeaderboard classExamId={projectorExamId} />;
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-fuchsia-500/30 flex flex-col md:flex-row relative">
      <ToastProvider />
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}
      <ConfettiCelebration show={showConfetti} onComplete={() => setShowConfetti(false)} />
      {activeSimulationViewer && (
        <SimulationViewer 
          simulation={activeSimulationViewer} 
          onClose={() => setActiveSimulationViewer(null)} 
        />
      )}
      
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

      {/* ══════ MOBILE TOP BAR (hiện trên mobile, ẩn trên desktop) ══════ */}
      {user && (
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
        user ? (isSidebarCollapsed ? "md:ml-[80px]" : "md:ml-[260px]") : "",
        user ? "pt-[56px] md:pt-0" : ""
      )}>
        <main className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-12">
        {!user ? (
          <div className="relative py-20 overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-red-600/10 blur-[120px] rounded-full -z-10 pointer-events-none" />
            
            <div className="flex flex-col items-center justify-center text-center">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="max-w-4xl"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-8">
                  <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  Hệ thống luyện thi Vật lý 2026
                </div>
                
                <h1 className="text-4xl sm:text-5xl md:text-8xl font-black text-white mb-6 md:mb-8 leading-[0.9] tracking-tighter">
                  CHINH PHỤC <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-amber-500">8.0+ VẬT LÝ</span>
                </h1>
                
                <p className="text-base sm:text-lg md:text-2xl text-slate-400 mb-8 md:mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
                  Hệ thống luyện thi chiến thuật tích hợp <span className="text-white">AI chẩn đoán sư phạm</span>, 
                  giúp bạn tối ưu hóa điểm số theo cấu trúc đề thi mới nhất của Bộ GD&ĐT.
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <button 
                      onClick={handleSignIn}
                      className="group relative bg-red-600 hover:bg-red-700 text-white px-12 py-5 rounded-2xl font-black text-lg uppercase tracking-widest transition-all shadow-2xl shadow-red-600/40 flex items-center gap-3 overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                      <Play className="w-6 h-6 fill-current" /> Bắt đầu ngay
                    </button>
                    {authError && (
                      <div className="max-w-md text-center px-4 py-3 bg-red-600/10 border border-red-600/40 rounded-xl text-xs text-red-400 font-medium leading-relaxed">
                        ⚠️ {authError}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex -space-x-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="w-12 h-12 rounded-full border-4 border-slate-950 bg-slate-800 flex items-center justify-center overflow-hidden">
                        <img src={`https://picsum.photos/seed/user${i}/100/100`} alt="User" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                    <div className="w-12 h-12 rounded-full border-4 border-slate-950 bg-slate-900 flex items-center justify-center text-[10px] font-black text-slate-400">
                      +2K
                    </div>
                  </div>
                </div>

                <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                  {[
                    { title: 'AI Chẩn đoán', desc: 'Phát hiện chính xác lỗ hổng kiến thức qua từng câu trả lời.', icon: BrainCircuit },
                    { title: 'Đề thi chuẩn', desc: 'Cập nhật liên tục theo cấu trúc đề thi 2026 của Bộ GD&ĐT.', icon: Target },
                    { title: 'Bệnh án học tập', desc: 'Theo dõi tiến trình hồi phục điểm số như một hồ sơ y tế.', icon: Activity },
                  ].map((feature, i) => (
                    <div key={i} className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl hover:border-red-600/30 transition-colors">
                      <feature.icon className="w-8 h-8 text-red-600 mb-4" />
                      <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                      <p className="text-sm text-slate-500 leading-relaxed">{feature.desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        ) : activeTest ? (
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              {isReviewing && results ? (
                <ReviewExam 
                  test={activeTest}
                  answers={results.answers}
                  onBack={() => setIsReviewing(false)}
                />
              ) : !results ? (
                <ProExamExperience 
                  test={activeTest}
                  answers={answers}
                  onAnswer={handleAnswer}
                  onSubmit={submitTest}
                  onCancel={() => { clearExamSession(); setActiveTest(null); }}
                />
              ) : submissionResult?.show ? (
                <motion.div 
                  key="victory-modal"
                  initial={{ opacity: 0, scale: 0.8, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -50 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                  className="w-full max-w-xl mx-auto flex flex-col pt-10"
                >
                  <div className={`relative flex flex-col items-center justify-center p-12 rounded-[3rem] border shadow-2xl overflow-hidden ${
                    submissionResult.score >= 8.0 
                      ? 'bg-gradient-to-b from-amber-500/20 to-slate-900 border-amber-500/50 shadow-amber-500/20' 
                      : submissionResult.score >= 6.0 
                        ? 'bg-gradient-to-b from-blue-500/20 to-slate-900 border-blue-500/50 shadow-blue-500/20'
                        : 'bg-gradient-to-b from-red-600/30 to-slate-900 border-red-500/50 shadow-red-600/30'
                  }`}>
                    {/* Background Animation Element */}
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
                    <motion.div 
                      animate={submissionResult.score < 6.0 ? { scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className={`absolute inset-0 opacity-30 bg-radial-gradient ${submissionResult.score < 6.0 ? 'from-red-600' : 'from-transparent'} to-transparent`}
                    />
                    
                    <div className="relative z-10 flex flex-col items-center w-full">
                      <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
                        className={`w-32 h-32 rounded-[2rem] flex items-center justify-center shadow-2xl mb-8 ${
                          submissionResult.score >= 8.0 
                            ? 'bg-gradient-to-br from-amber-400 to-orange-600 shadow-amber-500/50 text-white' 
                            : submissionResult.score >= 6.0 
                              ? 'bg-gradient-to-br from-blue-400 to-indigo-600 shadow-blue-500/50 text-white'
                              : 'bg-gradient-to-br from-red-500 to-rose-700 shadow-red-600/50 text-white'
                        }`}
                      >
                        {submissionResult.score >= 8.0 ? <Trophy className="w-14 h-14" /> : submissionResult.score >= 6.0 ? <CheckCircle2 className="w-14 h-14" /> : <AlertTriangle className="w-14 h-14" />}
                      </motion.div>

                      <motion.h2 
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className={`text-3xl sm:text-4xl font-black text-center mb-3 uppercase tracking-tight ${
                           submissionResult.score >= 8.0 ? 'text-amber-400' : submissionResult.score >= 6.0 ? 'text-blue-400' : 'text-red-400'
                        }`}
                      >
                        {submissionResult.score >= 8.0 
                          ? 'XUẤT SẮC - MASTER!' 
                          : submissionResult.score >= 6.0 
                            ? 'KHÁ - ĐÃ HOÀN THÀNH!' 
                            : '🚨 CẢNH BÁO BỆNH ÁN!'}
                      </motion.h2>

                      <motion.p 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                        className="text-slate-300 text-center mb-8 text-lg font-medium px-4"
                      >
                        {submissionResult.score >= 8.0 
                          ? 'Mức độ thông hiểu của bạn sặc mùi thủ khoa. Tuyệt vời!' 
                          : submissionResult.score >= 6.0 
                            ? 'Làm tốt lắm. Giữ vững phong độ để bứt phá thêm nhé!' 
                            : 'Hệ thống AI đã phát hiện lỗ hổng nghiêm trọng ở chuyên đề này. Vùng kiến thức này đã được đưa vào Danh sách Cách Ly Đỏ!'}
                      </motion.p>

                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: 'spring' }}
                        className="bg-slate-950/80 border border-slate-700 p-6 rounded-3xl w-full max-w-[280px] flex items-center justify-between shadow-inner mb-10"
                      >
                         <div>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest pl-1 mb-1">XP Thu Thập</p>
                            <p className="text-3xl font-black text-amber-400">+{submissionResult.earnedXP} XP</p>
                         </div>
                         <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center">
                            <Star className="w-6 h-6 text-amber-400" />
                         </div>
                      </motion.div>

                      <motion.button
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                        onClick={() => setSubmissionResult({ ...submissionResult, show: false })}
                        className={`w-full py-4 sm:py-5 rounded-2xl font-black text-white text-lg transition-all active:scale-95 shadow-xl flex items-center justify-center gap-3 ${
                           submissionResult.score >= 6.0 
                             ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20' 
                             : 'bg-red-600 hover:bg-red-500 shadow-red-600/30 animate-pulse'
                        }`}
                      >
                        {submissionResult.score >= 6.0 ? 'NHẬN THƯỞNG & XEM LỜI GIẢI' : 'CHẤP NHẬN BỆNH ÁN & CHỮA LỖI'}
                        <ArrowRight className="w-5 h-5" />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-10 shadow-2xl max-w-5xl mx-auto"
                >
                  <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
                    <div className="text-center md:text-left">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-600/10 text-red-600 mb-4">
                        <Trophy className="w-10 h-10" />
                      </div>
                      <h2 className="text-4xl font-black text-white mb-2 tracking-tight">KẾT QUẢ CHẨN ĐOÁN</h2>
                      <p className="text-slate-400 font-medium">Chuyên đề: <span className="text-white">{activeTest.topic}</span></p>
                    </div>
                    <div className="flex gap-4">
                      <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 text-center min-w-[140px]">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Điểm số</p>
                        <p className="text-4xl font-black text-white">{results.score.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500 mt-1">trên 10 điểm</p>
                      </div>
                      <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 text-center min-w-[140px]">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Xếp loại</p>
                        <p className={cn(
                          "text-2xl font-black",
                          results.score >= 8.0 ? "text-amber-500" : results.score >= 6.0 ? "text-blue-500" : "text-red-500"
                        )}>
                          {results.score >= 8.0 ? 'MASTER' : results.score >= 6.0 ? 'KHÁ' : 'CẦN ÔN TẬP'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">Thang 10</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12">
                    <div className="space-y-8">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <BrainCircuit className="text-red-500" />
                        PHÂN TÍCH CHI TIẾT
                      </h3>
                      {(() => {
                        const partScores: Record<number, { score: number, total: number }> = {
                          1: { score: 0, total: 0 },
                          2: { score: 0, total: 0 },
                          3: { score: 0, total: 0 }
                        };
                        const normalizeDecimal2 = (v: any) => parseFloat(String(v ?? '0').replace(',', '.'));

                        activeTest.questions.forEach(q => {
                          const studentAns = results.answers[q.id];
                          
                          if (q.part === 1) {
                            partScores[1].total += 0.25;
                            if (studentAns === q.correctAnswer) partScores[1].score += 0.25;
                          } else if (q.part === 2) {
                            partScores[2].total += 1.0;
                            let correctCount = 0;
                            for (let i = 0; i < 4; i++) {
                              if (Array.isArray(studentAns) && studentAns[i] !== undefined && studentAns[i] === (q.correctAnswer as boolean[])[i]) {
                                correctCount++;
                              }
                            }
                            if (correctCount === 4) partScores[2].score += 1.0;
                            else if (correctCount === 3) partScores[2].score += 0.5;
                            else if (correctCount === 2) partScores[2].score += 0.25;
                            else if (correctCount === 1) partScores[2].score += 0.1;
                          } else if (q.part === 3) {
                            partScores[3].total += 0.25;
                            const sv = normalizeDecimal2(studentAns);
                            const cv = normalizeDecimal2(q.correctAnswer);
                            if (!isNaN(sv) && Math.abs(sv - cv) < 0.01) partScores[3].score += 0.25;
                          }
                        });

                        const chartData = [
                          { name: 'Phần I (4.5đ)', score: partScores[1].score, total: partScores[1].total },
                          { name: 'Phần II (4.0đ)', score: partScores[2].score, total: partScores[2].total },
                          { name: 'Phần III (1.5đ)', score: partScores[3].score, total: partScores[3].total }
                        ];

                        return <PerformanceChart data={chartData} />;
                      })()}
                    </div>

                    <div className="space-y-8">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <FlaskConical className="text-blue-500" />
                        AI CHẨN ĐOÁN & ĐIỀU TRỊ
                      </h3>
                      {!results.analysis ? (
                        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col items-center justify-center space-y-6 flex-1 h-[300px]">
                            <BrainCircuit className="text-slate-600 w-16 h-16" />
                            <p className="text-slate-400 text-center max-w-sm">
                              Hệ thống chưa thực hiện chẩn đoán. Bấm nút dưới đây để AI phân tích chi tiết lỗ hổng và nhận phác đồ điều trị cá nhân hóa.
                            </p>
                            <button
                              onClick={handleDiagnosis}
                              disabled={isAnalyzing}
                              className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-full font-black text-sm uppercase tracking-widest transition-all shadow-lg flex items-center gap-3 disabled:opacity-50"
                            >
                              {isAnalyzing ? <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin" /> : <BrainCircuit />}
                              Tiến hành Chẩn đoán
                            </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <PrescriptionCard 
                            title="Kiến thức hổng"
                            content={results.analysis.redZones.length > 0 ? results.analysis.redZones.join(', ') : 'Không phát hiện lỗ hổng lớn.'}
                            icon={AlertTriangle}
                            color="bg-red-500/10 text-red-500"
                          />
                          <PrescriptionCard 
                            title="Lỗi kỹ/Ẩu"
                            content={`${results.analysis.behavioralAnalysis.carelessCount} lỗi`}
                            icon={Target}
                            color="bg-amber-500/10 text-amber-500"
                          />
                          <PrescriptionCard 
                            title="Lỗi bản chất"
                            content={`${results.analysis.behavioralAnalysis.fundamentalCount} lỗi`}
                            icon={BrainCircuit}
                            color="bg-purple-500/10 text-purple-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {results.analysis && results.analysis.remedialMatrix && (
                    <div className="space-y-6 mt-12 mb-12">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2 font-headline uppercase tracking-widest">
                        <Target className="text-blue-500" />
                        MA TRẬN ĐỀ KHẮC PHỤC CÁ NHÂN HÓA
                      </h3>
                      <div className="bg-slate-950/50 p-8 rounded-3xl border border-slate-800">
                        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                          Dựa vào lỗ hổng kiến thức, AI Architect đã bốc thuốc một phác đồ {results.analysis.remedialMatrix.reduce((acc, curr) => acc + curr.count, 0)} câu hỏi đánh thẳng vào các điểm yếu của bạn:
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {results.analysis.remedialMatrix.map((item, idx) => (
                            <div key={idx} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                              <span className="text-3xl font-black text-blue-500 mb-2">{item.count}</span>
                              <span className="text-[10px] text-slate-500 font-bold uppercase text-center">{item.topic}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {results.analysis && (
                    <div className="space-y-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Settings className="text-slate-500" />
                        NHẬN XÉT CỦA AI ARCHITECT
                      </h3>
                      <div className="prose prose-invert max-w-none bg-slate-800/50 backdrop-blur-sm rounded-xl p-5 border border-slate-700 leading-relaxed text-slate-300 [&>ul]:list-disc [&>ul]:ml-5 [&>li]:mb-2 [&_strong]:text-red-400 [&_strong]:font-bold">
                        <ReactMarkdown>{results.analysis.feedback}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Suggested Resources Section */}
                  {(() => {
                    const incorrectQuestions = activeTest.questions.filter(q => {
                      const studentAns = results.answers[q.id || ''];
                      if (q.part === 1) return studentAns !== q.correctAnswer;
                      if (q.part === 2) {
                        return Array.from({ length: 4 }).some((_, i) => !Array.isArray(studentAns) || studentAns[i] !== (q.correctAnswer as boolean[])[i]);
                      }
                      if (q.part === 3) return Math.abs(parseFloat(studentAns || '0') - (q.correctAnswer as number)) >= 0.01;
                      return false;
                    });

                    const suggestedResources = Array.from(new Set(
                      incorrectQuestions.flatMap(q => q.resources || [])
                    ));

                    if (suggestedResources.length === 0) return null;

                    return (
                      <div className="space-y-6 mt-12">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <BookOpen className="text-blue-500" />
                          HỌC LIỆU ÔN TẬP ĐỀ XUẤT
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {suggestedResources.map((res, i) => (
                            <SmartResourceCard key={i} resource={res} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mt-12 flex flex-col md:flex-row gap-4">
                    <button 
                      onClick={() => { clearExamSession(); setActiveTest(null); }}
                      className="px-8 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                    >
                      Trang chủ
                    </button>
                    <button 
                      onClick={() => setIsReviewing(true)}
                      className="px-8 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all gap-2 flex items-center justify-center"
                    >
                      <Info className="w-4 h-4"/> Lời giải
                    </button>
                    <button 
                      onClick={handleSaveToVault}
                      className="flex-1 bg-slate-900 border border-blue-500/50 hover:bg-blue-900/20 text-blue-400 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all gap-2 flex items-center justify-center"
                    >
                      <Save className="w-4 h-4" /> Kho ôn tập
                    </button>
                    <button 
                      onClick={handleAdaptiveTestFix}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-105 duration-300 hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] group"
                      disabled={!results.analysis?.remedialMatrix}
                    >
                      <Activity className="w-4 h-4 group-hover:animate-pulse"/> Luyện tập ngay
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="space-y-12 relative z-10">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
              <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
                  CHÀO THẦY THUỐC, <span className="text-red-600">{user.displayName.toUpperCase()}</span>
                </h2>
                <p className="text-slate-500 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Hệ thống đang trực tuyến. Sẵn sàng chẩn đoán kiến thức.
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
                    <span className="text-sm font-bold text-red-500">
                      {(attempts.reduce((acc, a) => acc + a.score, 0) / (attempts.length || 1)).toFixed(1)}
                    </span>
                  </div>
                </div>
                <NotificationCenter 
                  notifications={user.notifications} 
                  onRead={markNotificationAsRead} 
                />
                <button 
                  onClick={signOut}
                  className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-red-600/10 hover:border-red-600/50 transition-all group"
                >
                  <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-500" />
                </button>
              </div>
            </header>

            {/* ──── CONTENT AREA: Render dựa trên activeView ──── */}
            {activeView === 'liveExam' && (
              <LiveClassExam user={user} />
            )}

            {activeView === 'adaptive' && (
              <AdaptiveDashboard user={user} attempts={attempts} />
            )}

            {(activeView === 'dashboard' || (['dashboard', 'tasks', 'history'] as string[]).includes(activeView)) && activeView !== 'liveExam' && activeView !== 'adaptive' && (
              <>
                <StudentDashboard 
                  user={user} 
                  attempts={attempts} 
                  onStartPrescription={(topic, examId) => startTest(topic, examId)}
                  onStartExam={(exam) => startTest(exam.title, exam.id)}
                />
                <section id="diagnosis" className="mt-16">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <BrainCircuit className="text-red-500" />
                      CHẨN ĐOÁN & ĐIỀU TRỊ
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(['Vật lí nhiệt', 'Khí lí tưởng', 'Từ trường', 'Vật lí hạt nhân'] as Topic[]).map(topic => (
                      <TopicCard 
                        key={topic} 
                        topic={topic} 
                        isLocked={user.redZones?.includes(topic) || false}
                        onClick={() => startTest(topic)}
                      />
                    ))}
                  </div>
                </section>

                <section id="treatment" className="mt-16">
                  {/* This section is handled by StudentDashboard's Prescription History */}
                </section>

                <section className="mt-16">
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Settings className="text-red-500" />
                      CẤU HÌNH CHIẾN THUẬT
                    </h3>
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-6 max-w-2xl">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase mb-3">Nhóm mục tiêu</p>
                        <div className="flex gap-2">
                          {(['Chống Sai Ngu', 'Master Physics'] as TargetGroup[]).map(group => (
                            <button
                              key={group}
                              onClick={async () => {
                                const updatedUser = { ...user, targetGroup: group };
                                await setDoc(doc(db, 'users', user.uid), updatedUser);
                                setUser(updatedUser);
                              }}
                              className={cn(
                                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                                user.targetGroup === group 
                                  ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20" 
                                  : "bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500"
                              )}
                            >
                              {group}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="p-4 bg-red-600/5 border border-red-600/20 rounded-2xl">
                        <p className="text-xs text-red-500 font-medium leading-relaxed">
                          {user.targetGroup === 'Chống Sai Ngu' 
                            ? "Chiến thuật: Tập trung 100% vào Phần I và II để lấy chắc 7.0 - 8.0 điểm." 
                            : "Chiến thuật: Tấn công trực diện Phần III và các bài toán tích hợp để đạt > 8.5."}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeView === 'simulations' && (
              <div className="space-y-12">
                <section className="space-y-6">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <FlaskConical className="text-red-500" />
                    VIRTUAL LAB & THỰC TẾ
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div 
                      onClick={() => setActiveSimulation({
                        title: 'Máy chụp MRI',
                        description: 'Ứng dụng từ trường mạnh và hiện tượng cộng hưởng từ hạt nhân.',
                        url: 'https://phet.colorado.edu/sims/html/mri/latest/mri_all.html'
                      })}
                      className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:bg-slate-800 transition-colors cursor-pointer group"
                    >
                      <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500 mb-4">
                        <BrainCircuit className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-white mb-2">Máy chụp MRI</h4>
                      <p className="text-sm text-slate-400">Ứng dụng từ trường mạnh và hiện tượng cộng hưởng từ hạt nhân.</p>
                    </div>
                    <div 
                      onClick={() => setActiveSimulation({
                        title: 'Định luật Boyle',
                        description: 'Phân tích dữ liệu thực nghiệm từ bộ thí nghiệm áp kế.',
                        url: 'https://phet.colorado.edu/sims/html/gas-properties/latest/gas-properties_all.html'
                      })}
                      className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:bg-slate-800 transition-colors cursor-pointer group"
                    >
                      <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-500 mb-4">
                        <FlaskConical className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-white mb-2">Định luật Boyle</h4>
                      <p className="text-sm text-slate-400">Phân tích dữ liệu thực nghiệm từ bộ thí nghiệm áp kế.</p>
                    </div>
                  </div>
                </section>

                <section id="resources" className="space-y-8">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Beaker className="text-blue-500" />
                      KHO HỌC LIỆU MÔ PHỎNG SỐ
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {simulations.map(sim => (
                      <div key={sim.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 group hover:border-blue-500/50 transition-colors flex flex-col">
                        <div className="text-4xl mb-4">{sim.thumbnail}</div>
                        <h4 className="text-lg font-black text-white mb-2 line-clamp-2">{sim.title}</h4>
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3">{sim.category}</p>
                        <p className="text-sm text-slate-400 mb-6 flex-1 line-clamp-3">{sim.description}</p>
                        <button 
                          onClick={() => setActiveSimulationViewer(sim)}
                          className="w-full bg-slate-950 border border-slate-800 hover:bg-blue-600 hover:border-blue-500 hover:text-white text-slate-300 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex justify-center items-center gap-2"
                        >
                          <Play className="w-4 h-4" />
                          Bắt đầu thí nghiệm
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <SimulationModal 
                  isOpen={!!activeSimulation}
                  onClose={() => setActiveSimulation(null)}
                  title={activeSimulation?.title || ''}
                  description={activeSimulation?.description || ''}
                  simulationUrl={activeSimulation?.url || ''}
                />
              </div>
            )}

            {(user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') && (ADMIN_TABS as readonly string[]).includes(activeView) && (
              <section className="space-y-10 mt-12 pt-12 border-t border-slate-800/50">
                {/* ── Admin Header ── */}
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
                      <div className={cn("p-2 rounded-xl bg-slate-800/80 shrink-0", s.color)}>
                        <s.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-5 line-clamp-1 truncate">{s.label}</p>
                        {s.value !== null ? (
                          <p className="text-lg font-black text-white truncate">{s.value}</p>
                        ) : (
                          <div className="mt-1"><SkeletonNumber width="60px" height="20px" /></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
                  <h3 className="text-lg sm:text-xl md:text-2xl font-black flex items-center gap-2 md:gap-3 text-gradient-fire font-headline">
                    <Settings className="text-cyan-400 w-5 h-5 md:w-7 md:h-7" />
                    HỆ THỐNG QUẢN TRỊ PHYS-9+
                  </h3>
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
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setAdminTab(tab.id as any)}
                        className={cn(
                          "flex-none whitespace-nowrap px-3 sm:px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider md:tracking-widest transition-all flex items-center justify-center gap-1.5 md:gap-2",
                          adminTab === tab.id 
                            ? "bg-red-600 text-white shadow-lg shadow-red-600/20" 
                            : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <motion.div
                  key={adminTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {adminTab === 'Digitize' && <DigitizationDashboard onQuestionsAdded={() => { setAdminTab('Bank'); adminStats.refetch(); }} />}
                  {adminTab === 'Bank' && <QuestionBank onCountChanged={(delta) => adminStats.adjustCount(delta)} onQuestionsLoaded={(n) => adminStats.setCount(n)} />}
                  {adminTab === 'Matrix' && <ExamMatrixGenerator />}
                  {adminTab === 'Generator' && <ExamGenerator user={user} onExportPDF={exportExamToPDF} />}
                  {adminTab === 'SimLab' && <SimulationAdminBoard onPlay={(sim) => setActiveSimulationViewer(sim)} />}
                  {adminTab === 'Duplicates' && <DuplicateReviewHubWrapper />}
                  {adminTab === 'Sanitizer' && <DataSanitizer />}
                  {adminTab === 'Reports' && <ReportHub />}
                  {adminTab === 'Classroom' && <ClassManager user={user} />}
                  {adminTab === 'Directory' && <StudentDirectory />}
                  {adminTab === 'Library' && <ExamLibrary />}
                </motion.div>
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-4">
          <p className="text-slate-500 font-bold">© 2026 PHYS-9+ Xây dựng bởi Thầy Hậu Vật lý & AI</p>
          <div className="flex items-center justify-center gap-6 text-sm font-medium">
            <a href="https://www.facebook.com/thayhauvatlydian/about?locale=vi_VN" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-500 transition-colors">Facebook</a>
            <a href="https://www.youtube.com/@thayhauvatlydian7396" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-red-500 transition-colors">YouTube</a>
            <a href="https://www.tiktok.com/@thayhauvatly" target="_blank" rel="noopener noreferrer" className="text-slate-400 text-slate-400 hover:text-slate-200 transition-colors">TikTok</a>
            <a href="https://zalo.me/0962662736" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-400 transition-colors">Zalo: 0962662736</a>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
