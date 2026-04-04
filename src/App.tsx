/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  signOut, 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  onAuthStateChanged, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  deleteDoc,
  Timestamp,
  handleFirestoreError,
  OperationType
} from './firebase';
import { UserProfile, Question, Attempt, Topic, Part, TargetGroup, Exam, ExamMatrix, Prescription, Badge, AppNotification } from './types';
import { analyzeAnswer, digitizeDocument, digitizeFromPDF } from './services/geminiService';
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
  Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import { InlineMath, BlockMath } from 'react-katex';
import * as mammoth from 'mammoth';

import { parseAzotaExam, ParseError } from './services/AzotaParser';
import { processDocxFile } from './services/DocxReader';
import QuestionReviewBoard from './components/QuestionReviewBoard';

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
  Legend
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

const MathRenderer = ({ content }: { content: string }) => {
  // First, strip any raw HTML tags that might have been included as text by AI
  let cleanContent = content.replace(/<[^>]*>?/gm, '');
  
  // Handle [HÌNH MINH HỌA] placeholder
  const parts = cleanContent.split(/(\[HÌNH MINH HỌA\]|\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g);
  
  return (
    <span>
      {parts.map((part, i) => {
        if (part === '[HÌNH MINH HỌA]') {
          return (
            <span key={i} className="inline-flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-3 py-1.5 rounded-lg my-2 mx-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <FlaskConical className="w-3 h-3 text-red-500" />
              Hình minh họa
            </span>
          );
        } else if (part.startsWith('$$')) {
          return <BlockMath key={i} math={part.slice(2, -2)} />;
        } else if (part.startsWith('$')) {
          return <InlineMath key={i} math={part.slice(1, -1)} />;
        } else if (part.startsWith('\\[')) {
          return <BlockMath key={i} math={part.slice(2, -2)} />;
        } else if (part.startsWith('\\(')) {
          return <InlineMath key={i} math={part.slice(2, -2)} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

const DigitizationDashboard = ({ onQuestionsAdded }: { onQuestionsAdded: (qs: Question[]) => void }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<Question[] | null>(null);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [topicHint, setTopicHint] = useState<Topic>('');
  const [digitizeMode, setDigitizeMode] = useState<'AI' | 'Standard'>('AI');
  const [imageProgress, setImageProgress] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPDF = file.name.toLowerCase().endsWith('.pdf');
    const isDOCX = file.name.toLowerCase().endsWith('.docx');

    if (!isPDF && !isDOCX) {
      alert('Vui lòng chọn file .pdf hoặc .docx');
      return;
    }

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

    setIsProcessing(true);
    try {
      if (isPDF) {
        // ===== PDF MODE: Gemini Vision đọc trực tiếp =====
        const questions = await digitizeFromPDF(
          file,
          topicHint,
          (status) => setImageProgress(status)
        );
        setImageProgress(null);
        if (questions.length === 0) {
          alert('AI không tìm thấy câu hỏi nào trong PDF. Thầy kiểm tra lại file.');
          return;
        }
        setParseErrors([]);
        setReviewQuestions(questions);
      } else if (digitizeMode === 'AI') {
        // ===== AI Mode: mammoth → HTML → Gemini =====
        const arrayBuffer = await file.arrayBuffer();
        const options = {
          convertImage: mammoth.images.imgElement(() =>
            Promise.resolve({ src: '[HÌNH MINH HỌA]' })
          ),
        };
        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
        const html = result.value;
        if (!html || html.trim().length === 0)
          throw new Error('File Word không có nội dung văn bản.');
        const questions = await digitizeDocument(html, topicHint);
        setParseErrors([]);
        setReviewQuestions(questions);
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
          alert('Không tìm thấy câu hỏi theo định dạng chuẩn Azota. Thầy hãy kiểm tra lại file.');
          return;
        }
        setParseErrors(parseResult.errors);
        setReviewQuestions(parseResult.questions);
      }
    } catch (error: any) {
      console.error('File processing error:', error);
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('Requested entity was not found') && window.aistudio) {
        alert('API Key hiện tại không hợp lệ hoặc đã hết hạn.');
        await window.aistudio.openSelectKey();
      } else if (errorMsg.includes('GEMINI_API_KEY is not defined')) {
        alert('Chưa cấu hình API Key.');
      } else {
        alert(`Có lỗi khi xử lý file: ${errorMsg}`);
      }
    } finally {
      setIsProcessing(false);
      setImageProgress(null);
      e.target.value = '';
    }
  };

  // Sync từ Review Board → Firestore
  const handleSync = async (questions: Question[]) => {
    for (const q of questions) {
      await addDoc(collection(db, 'questions'), q);
    }
    onQuestionsAdded(questions);
    setReviewQuestions(null);
    setParseErrors([]);
  };

  // Nếu đang ở bước Review Board
  if (reviewQuestions !== null) {
    return (
      <QuestionReviewBoard
        initialQuestions={reviewQuestions}
        parseErrors={parseErrors}
        topic={topicHint}
        onSync={handleSync}
        onCancel={() => setReviewQuestions(null)}
      />
    );
  }

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
          <div className={cn(
            "border-2 border-dashed rounded-2xl p-6 text-center transition-all group relative",
            digitizeMode === 'AI' ? "border-slate-800 hover:border-red-600/50" : "border-slate-800 hover:border-blue-600/50"
          )}>
            <input 
              type="file" 
              accept=".pdf,.docx" 
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={isProcessing}
            />
            <div className="flex items-center justify-center gap-3 pointer-events-none">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <History className="text-slate-400 group-hover:text-red-500 w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">Chọn file đề thi</p>
                <p className="text-[10px] text-slate-500">📄 PDF (khuyên dùng) · 📝 .docx</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-3 text-red-500 font-bold animate-pulse">
            <BrainCircuit className="animate-spin" />
            {imageProgress || 'AI ĐANG BÓC TÁCH DỮ LIỆU & CÔNG THỨC...'}
          </div>
          {imageProgress && (
            <p className="text-[10px] text-slate-500">Quá trình này có thể mất 30-60 giây với PDF dài</p>
          )}
        </div>
      )}

    </div>
  );
};

const QuestionBank = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTopic, setFilterTopic] = useState<Topic | 'All'>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const qRef = collection(db, 'questions');
    const unsubscribe = onSnapshot(qRef, (snapshot) => {
      const qs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      setQuestions(qs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'questions');
    });
    return unsubscribe;
  }, []);

  const filtered = filterTopic === 'All' 
    ? questions 
    : questions.filter(q => q.topic === filterTopic);

  const deleteQuestion = async (id: string) => {
    if (!window.confirm('Thầy có chắc chắn muốn xóa câu hỏi này không?')) return;
    try {
      await deleteDoc(doc(db, 'questions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `questions/${id}`);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-white">KHO CÂU HỎI ĐÃ SỐ HÓA</h3>
          <p className="text-slate-400 text-sm">Tổng cộng: {questions.length} câu hỏi trong hệ thống.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {(['All', 'Vật lí nhiệt', 'Khí lí tưởng', 'Từ trường', 'Vật lí hạt nhân'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterTopic(t)}
              className={cn(
                "whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold border transition-all",
                filterTopic === t ? "bg-red-600 border-red-600 text-white" : "bg-slate-800 border-slate-700 text-slate-400"
              )}
            >
              {t === 'All' ? 'Tất cả' : t}
            </button>
          ))}
        </div>
      </div>

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
                <h4 className="text-white font-bold uppercase tracking-widest">Kho câu hỏi đang rỗng</h4>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Thầy hãy sử dụng tính năng <span className="text-red-500 font-bold">"Số hóa đề"</span> để bắt đầu xây dựng ngân hàng câu hỏi thông minh.
                </p>
              </div>
            </div>
          ) : (
            filtered.map((q) => (
              <div key={q.id} className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4 relative group">
                <button 
                  onClick={() => deleteQuestion(q.id!)}
                  className="absolute top-4 right-4 p-2 bg-red-600/10 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 hover:text-white"
                >
                  <LogOut className="w-4 h-4 rotate-180" />
                </button>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-red-600 text-white px-2 py-1 rounded">
                    Phần {q.part}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 px-2 py-1 rounded text-slate-400">
                    {q.topic} - {q.level}
                  </span>
                </div>

                <div className="text-slate-200 text-sm leading-relaxed">
                  <MathRenderer content={q.content} />
                </div>

                <AnimatePresence>
                  {expandedId === q.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-6 pt-4 border-t border-slate-800"
                    >
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
                              <MathRenderer content={opt} />
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
                          <span className="text-xl font-black text-white">{q.correctAnswer as number}</span>
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                          <BrainCircuit className="w-3 h-3" /> Hướng dẫn giải chi tiết
                        </p>
                        <div className="text-sm text-slate-400 italic leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                          <MathRenderer content={q.explanation} />
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
                            {q.resources?.map((res, idx) => (
                              <div key={idx} className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
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
                  <div className="flex gap-1">
                    {q.tags?.map(tag => (
                      <span key={tag} className="text-[9px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">#{tag}</span>
                    ))}
                  </div>
                  <button 
                    onClick={() => setExpandedId(expandedId === q.id ? null : q.id!)}
                    className="text-[10px] font-bold text-red-500 hover:underline"
                  >
                    {expandedId === q.id ? 'Thu gọn' : 'Xem chi tiết & Lời giải'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
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
    // Fetch students
    const sQuery = query(collection(db, 'users'), where('role', '==', 'student'));
    onSnapshot(sQuery, (snap) => {
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });

    // Fetch all questions
    onSnapshot(collection(db, 'questions'), (snap) => {
      setAllQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
    });
  }, []);

  const generateExam = async () => {
    if (allQuestions.length < 28) {
      alert(`Kho câu hỏi hiện tại chỉ có ${allQuestions.length} câu. Cần tối thiểu 28 câu để tạo đề chuẩn 2025.`);
      return;
    }

    setIsGenerating(true);
    // Simulate AI thinking
    await new Promise(r => setTimeout(r, 1500));

    let pool = [...allQuestions];
    let selected: Question[] = [];

    // Logic: 18 Part I, 4 Part II, 6 Part III
    const p1 = pool.filter(q => q.part === 1);
    const p2 = pool.filter(q => q.part === 2);
    const p3 = pool.filter(q => q.part === 3);

    if (p1.length < 18 || p2.length < 4 || p3.length < 6) {
      alert("Không đủ câu hỏi cho từng phần (Cần 18 câu Phần I, 4 câu Phần II, 6 câu Phần III).");
      setIsGenerating(false);
      return;
    }

    // AI Diagnosis: Prioritize topics student is weak in (redZones)
    const redZones = selectedStudent?.redZones || [];
    
    const pick = (source: Question[], count: number) => {
      let sorted = [...source].sort((a, b) => {
        const aInRed = redZones.includes(a.topic) ? 1 : 0;
        const bInRed = redZones.includes(b.topic) ? 1 : 0;
        return bInRed - aInRed || Math.random() - 0.5;
      });
      return sorted.slice(0, count);
    };

    selected = [
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

    try {
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
          <p className="text-slate-400 text-sm">Tạo đề thi 28 câu chuẩn cấu hình 2025, cá nhân hóa theo từng học sinh.</p>
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
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-600 text-white py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20"
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
            <h4 className="text-white font-black uppercase tracking-widest">Cấu trúc đề chuẩn 2025</h4>
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
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-1 rounded font-bold">{q.topic}</span>
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      <MathRenderer content={q.content} />
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
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-1 rounded font-bold">{q.topic}</span>
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      <MathRenderer content={q.content} />
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
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-1 rounded font-bold">{q.topic}</span>
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      <MathRenderer content={q.content} />
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

const PerformanceChart = ({ data }: { data: { name: string, score: number, total: number }[] }) => (
  <div className="h-64 w-full mt-8 bg-slate-950/30 p-4 rounded-2xl border border-slate-800">
    <h4 className="text-sm font-bold text-slate-400 uppercase mb-4 tracking-wider">Phân tích theo phần đề thi</h4>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
          domain={[0, 'dataMax + 1']}
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
        <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={40}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.score === entry.total ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

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
              <X className="w-6 h-6" />
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
          <span className="font-black text-xl tracking-tighter text-white leading-none">PHYS-8+</span>
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-[0.2em] mt-0.5">Pro Edition 2025</span>
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
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-600/20 flex items-center gap-2"
          >
            Đăng nhập <ChevronRight className="w-4 h-4" />
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

const PrescriptionCard = ({ title, content, icon: Icon, color }: { title: string, content: string, icon: any, color: string }) => (
  <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl space-y-3">
    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
      <Icon className="w-5 h-5" />
    </div>
    <h4 className="font-bold text-white text-sm uppercase tracking-wider">{title}</h4>
    <p className="text-xs text-slate-400 leading-relaxed">{content}</p>
  </div>
);

const BehavioralAnalysisChart = ({ careless, fundamental }: { careless: number, fundamental: number }) => {
  const data = [
    { name: 'Lỗi ẩu (Kỹ thuật)', value: careless, color: '#3b82f6' },
    { name: 'Hổng gốc (Bản chất)', value: fundamental, color: '#ef4444' },
  ];

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <RechartsTooltip 
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
            itemStyle={{ color: '#fff' }}
          />
          <Legend verticalAlign="bottom" height={36}/>
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
          <p className="font-black text-amber-500 uppercase tracking-widest mb-1">{badge.name}</p>
          <p className="text-slate-400 font-medium leading-relaxed">{badge.description}</p>
          <div className="mt-2 pt-2 border-t border-slate-800 text-[8px] text-slate-600 font-bold uppercase">
            Đạt được: {new Date(badge.earnedAt.seconds * 1000).toLocaleDateString('vi-VN')}
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
  answers, 
  onAnswer, 
  onSubmit, 
  onCancel 
}: { 
  test: { topic: Topic, questions: Question[] }, 
  answers: Record<string, any>, 
  onAnswer: (ans: any) => void, 
  onSubmit: () => void,
  onCancel: () => void
}) => {
  const [timeLeft, setTimeLeft] = useState(50 * 60); // 50 minutes
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cheatWarnings, setCheatWarnings] = useState(0);
  const [showCheatAlert, setShowCheatAlert] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          onSubmit();
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
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion = test.questions[currentIndex];

  return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col overflow-hidden">
      {/* Exam Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-red-600 p-2 rounded-xl">
            <Activity className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tighter">PHÒNG THI PHYS-8+</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Chủ đề: {test.topic} | {test.questions.length} Câu hỏi</p>
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
              if (confirm("Bạn có chắc chắn muốn nộp bài sớm?")) onSubmit();
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
          <div className="grid grid-cols-4 gap-2">
            {test.questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "w-full aspect-square rounded-xl flex items-center justify-center text-xs font-black transition-all border",
                  currentIndex === i ? "bg-blue-600 border-blue-500 text-white shadow-lg" : 
                  answers[test.questions[i].id] !== undefined ? "bg-slate-800 border-slate-700 text-slate-300" :
                  "bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-600"
                )}
              >
                {i + 1}
              </button>
            ))}
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
            <div className="flex items-center gap-4">
              <span className="bg-slate-900 text-slate-400 px-4 py-1 rounded-full text-[10px] font-black uppercase border border-slate-800">
                Phần {currentQuestion.part}
              </span>
              <span className="text-slate-600 font-bold text-xs">Độ khó: {currentQuestion.level}</span>
            </div>

            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white leading-relaxed">
                <span className="text-blue-500 mr-2">Câu {currentIndex + 1}:</span>
                <MathRenderer content={currentQuestion.content} />
              </h3>

              <div className="space-y-4 pt-6">
                {currentQuestion.part === 1 && currentQuestion.options?.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => onAnswer(idx)}
                    className={cn(
                      "w-full p-6 rounded-2xl border text-left transition-all flex items-center gap-6 group",
                      answers[currentQuestion.id] === idx 
                        ? "bg-blue-600/10 border-blue-600 shadow-lg shadow-blue-900/10" 
                        : "bg-slate-900 border-slate-800 hover:border-slate-600"
                    )}
                  >
                    <span className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors",
                      answers[currentQuestion.id] === idx ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500 group-hover:bg-slate-700"
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
                                const current = answers[currentQuestion.id] || [null, null, null, null];
                                const next = [...current];
                                next[idx] = val;
                                onAnswer(next);
                              }}
                              className={cn(
                                "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border",
                                (answers[currentQuestion.id] || [])[idx] === val
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
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 font-bold uppercase">Nhập kết quả số của bạn:</p>
                    <input 
                      type="number"
                      step="any"
                      value={answers[currentQuestion.id] || ''}
                      onChange={(e) => onAnswer(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-2xl font-black text-white focus:border-blue-600 outline-none transition-all placeholder:text-slate-800"
                      placeholder="0.00"
                    />
                    <p className="text-[10px] text-slate-600 italic">* Lưu ý quy tắc làm tròn số theo yêu cầu của đề bài.</p>
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
    </div>
  );
};

const StudentDashboard = ({ user, attempts, onStartPrescription }: { user: UserProfile, attempts: Attempt[], onStartPrescription: (topic: Topic, examId: string) => void }) => {
  const stats = useMemo(() => {
    if (attempts.length === 0) return null;
    const totalScore = attempts.reduce((acc, a) => acc + a.score, 0);
    const totalQuestions = attempts.reduce((acc, a) => acc + Object.keys(a.answers).length, 0);
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

    return { avgScore, totalQuestions, radarData, progressData };
  }, [attempts]);

  return (
    <div className="space-y-8">
      {/* Medical Record Header */}
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-red-600/10 rounded-3xl flex items-center justify-center border border-red-600/20">
            <Activity className="text-red-500 w-10 h-10" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Hồ sơ Y tế Giáo dục</h2>
            <p className="text-slate-400 font-medium">Bệnh nhân: <span className="text-white">{user.displayName}</span> | ID: {user.uid.slice(0, 8)}</p>
            <div className="flex gap-2 mt-2">
              <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                Nhóm: {user.targetGroup}
              </span>
              <span className="bg-green-600/10 text-green-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                Trạng thái: Đang điều trị
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Ngày nhập viện</p>
            <p className="text-white font-bold">{new Date(user.createdAt?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Chỉ số Sức khỏe (GPA)', value: stats?.avgScore || '0.0', icon: Trophy, color: 'text-amber-500' },
          { label: 'Liều thuốc đã dùng', value: stats?.totalQuestions || '0', icon: BookOpen, color: 'text-blue-500' },
          { label: 'Chu kỳ luyện tập', value: '5 Ngày', icon: History, color: 'text-green-500' },
          { label: 'Vùng Đỏ (Nguy kịch)', value: user.redZones?.length || '0', icon: AlertTriangle, color: 'text-red-500' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-3xl"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-3 rounded-2xl bg-slate-800", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
            <p className="text-3xl font-black text-white mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Progress Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <History className="text-blue-500" />
              BIỂU ĐỒ TIẾN TRÌNH HỒI PHỤC
            </h3>
          </div>
          
          <div className="h-[300px] w-full">
            {stats?.progressData && stats.progressData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.progressData}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#3b82f6" fillOpacity={1} fill="url(#colorScore)" strokeWidth={3} />
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-8">
              <BrainCircuit className="text-red-500" />
              PHÂN TÍCH HÀNH VI
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

      <div id="treatment" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Prescription History */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <FlaskConical className="text-amber-500" />
            LỊCH SỬ KÊ ĐƠN (TREATMENT LOG)
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
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="text-blue-500" />
            HOẠT ĐỘNG GẦN ĐÂY
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

const TopicCard = ({ topic, isLocked, onClick }: { topic: Topic, isLocked: boolean, onClick: () => void }) => (
  <motion.div 
    whileHover={!isLocked ? { y: -5 } : {}}
    whileTap={!isLocked ? { scale: 0.98 } : {}}
    onClick={!isLocked ? onClick : undefined}
    className={cn(
      "relative p-8 rounded-[2rem] border transition-all cursor-pointer group overflow-hidden",
      isLocked 
        ? "bg-slate-900 border-slate-800 grayscale opacity-60 cursor-not-allowed" 
        : "bg-slate-900 border-slate-800 hover:border-red-600/50 hover:bg-slate-800/50"
    )}
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 blur-3xl -z-10 group-hover:bg-red-600/10 transition-colors" />
    
    <div className="flex justify-between items-start mb-6">
      <div className={cn(
        "p-4 rounded-2xl transition-all duration-500",
        isLocked ? "bg-slate-800" : "bg-red-600/10 text-red-600 group-hover:bg-red-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-red-600/40"
      )}>
        <BookOpen className="w-6 h-6" />
      </div>
      {isLocked && (
        <div className="flex items-center gap-1 text-amber-500 text-[10px] font-bold uppercase bg-amber-500/10 px-2 py-1 rounded-full animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          Vùng Đỏ
        </div>
      )}
    </div>

    <h4 className="text-xl font-black text-white mb-2 tracking-tight group-hover:text-red-500 transition-colors">{topic}</h4>
    <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
      {isLocked 
        ? "Đang trong vùng đỏ. Cần hoàn thành phác đồ điều trị để mở khóa." 
        : "Luyện tập cấu trúc 3 phần: Trắc nghiệm, Đúng/Sai, Trả lời ngắn."}
    </p>

    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-600">
        <span>Tiến độ</span>
        <span className="text-slate-400">0%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-red-600 w-0 group-hover:w-[10%] transition-all duration-1000" />
      </div>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState<'Digitize' | 'Bank' | 'Generator'>('Digitize');
  const [activeTest, setActiveTest] = useState<{ topic: Topic, questions: Question[], examId?: string } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [results, setResults] = useState<Attempt | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  const [showVirtualLab, setShowVirtualLab] = useState(false);
  const [activeSimulation, setActiveSimulation] = useState<{ title: string, description: string, url: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Safe sign-in handler with error feedback
  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/unauthorized-domain') {
        setAuthError('Tên miền localhost chưa được cấp phép trong Firebase Console. Thầy vào Authentication → Settings → Authorized domains và thêm "localhost" để đăng nhập.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép popup từ trang này và thử lại.');
      } else if (code === 'auth/popup-closed-by-user') {
        // User closed popup intentionally - not an error
      } else {
        setAuthError(`Đăng nhập thất bại: ${err?.message || 'Lỗi không xác định'}`);
      }
    }
  };

  // Auth Listener
  useEffect(() => {
    let uSub: (() => void) | null = null;
    let aSub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ADMIN_EMAILS = ['haunn.vietanhschool@gmail.com', 'thayhauvatly@gmail.com'];
        const isAdmin = ADMIN_EMAILS.includes(firebaseUser.email ?? '');
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        let currentUserData: UserProfile;

        if (userDoc.exists()) {
          currentUserData = userDoc.data() as UserProfile;
          if (isAdmin && currentUserData.role !== 'admin') {
            currentUserData.role = 'admin';
            await setDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' }, { merge: true });
          }
        } else {
          currentUserData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Học sinh',
            role: isAdmin ? 'admin' : 'student',
            targetGroup: 'Chống Sai Ngu',
            redZones: [],
            createdAt: Timestamp.now()
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), currentUserData);
        }

        setUser(currentUserData);

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
        });
      } else {
        setUser(null);
        setAttempts([]);
        if (uSub) uSub();
        if (aSub) aSub();
      }
      setLoading(false);
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
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(10);
    doc.text("SỞ GIÁO DỤC VÀ ĐÀO TẠO", 20, 20);
    doc.text("TRƯỜNG THPT CHUYÊN PHYS-8+", 20, 25);
    doc.text("ĐỀ THI CHÍNH THỨC", 20, 30);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("KỲ THI TỐT NGHIỆP TRUNG HỌC PHỔ THÔNG NĂM 2025", pageWidth / 2, 45, { align: "center" });
    doc.text(`Bài thi: VẬT LÝ - Mã đề: ${Math.floor(Math.random() * 900) + 100}`, pageWidth / 2, 52, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Thời gian làm bài: 50 phút, không kể thời gian phát đề", pageWidth / 2, 58, { align: "center" });
    
    doc.line(20, 65, pageWidth - 20, 65);
    
    let y = 75;
    
    // Part I
    doc.setFont("helvetica", "bold");
    doc.text("PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.", 20, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    
    exam.questions.filter(q => q.part === 1).forEach((q, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const lines = doc.splitTextToSize(`Câu ${i + 1}: ${q.content.replace(/\$|\$\$/g, '')}`, pageWidth - 40);
      doc.text(lines, 20, y);
      y += lines.length * 5 + 5;
      
      q.options?.forEach((opt, idx) => {
        const label = String.fromCharCode(65 + idx) + ". ";
        doc.text(label + opt.replace(/\$|\$\$/g, ''), 30 + (idx % 2 === 0 ? 0 : 80), y);
        if (idx % 2 === 1) y += 7;
      });
      y += 5;
    });
    
    // Part II
    y += 10;
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.text("PHẦN II. Câu trắc nghiệm Đúng/Sai.", 20, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    
    exam.questions.filter(q => q.part === 2).forEach((q, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const lines = doc.splitTextToSize(`Câu ${i + 1}: ${q.content.replace(/\$|\$\$/g, '')}`, pageWidth - 40);
      doc.text(lines, 20, y);
      y += lines.length * 5 + 5;
      
      q.options?.forEach((opt, idx) => {
        const label = String.fromCharCode(97 + idx) + ") ";
        doc.text(label + opt.replace(/\$|\$\$/g, ''), 30, y);
        y += 7;
      });
      y += 5;
    });

    doc.save(`${exam.title}.pdf`);
  };
  const startTest = async (topic: Topic, examId?: string) => {
    setLoading(true);
    try {
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
      const qQuery = query(qRef, where('topic', '==', topic));
      const snapshot = await getDocs(qQuery);
      
      let questions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
      
      // If no questions in DB, use fallback mock
      if (questions.length === 0) {
        questions = [
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

      setActiveTest({ topic, questions });
      setCurrentQuestionIndex(0);
      setAnswers({});
      setResults(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'questions');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (answer: any) => {
    setAnswers(prev => ({ ...prev, [activeTest!.questions[currentQuestionIndex].id]: answer }));
  };

  const submitTest = async () => {
    if (!activeTest || !user) return;
    setIsAnalyzing(true);
    
    let totalScore = 0;
    const errorTracking: Record<string, any> = {};
    const feedbackList: string[] = [];

    let carelessCount = 0;
    let fundamentalCount = 0;

    for (const q of activeTest.questions) {
      const studentAns = answers[q.id];
      let isCorrect = false;

      if (q.part === 1) {
        isCorrect = studentAns === q.correctAnswer;
        if (isCorrect) totalScore += 1;
      } else if (q.part === 2) {
        const correctCount = (studentAns as boolean[]).filter((a, i) => a === (q.correctAnswer as boolean[])[i]).length;
        if (correctCount === 4) isCorrect = true, totalScore += 1;
        else if (correctCount === 3) totalScore += 0.5;
        else if (correctCount === 2) totalScore += 0.25;
        else if (correctCount === 1) totalScore += 0.1;
      } else if (q.part === 3) {
        isCorrect = Math.abs(parseFloat(studentAns) - (q.correctAnswer as number)) < 0.01;
        if (isCorrect) totalScore += 1;
      }

      // AI Analysis
      const analysis = await analyzeAnswer(q, studentAns, isCorrect);
      errorTracking[q.id] = analysis.analysis.type;
      feedbackList.push(analysis.feedback);

      if (!isCorrect) {
        if (analysis.analysis.type === 'Lỗi hiểu sai bản chất') fundamentalCount++;
        else carelessCount++;
      }
    }

    const redZones = totalScore < activeTest.questions.length * 0.6 ? [activeTest.topic] : [];

    const attempt: Attempt = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.uid,
      testId: activeTest.topic,
      answers,
      score: totalScore,
      analysis: {
        errorTracking,
        feedback: feedbackList.join('\n\n'),
        redZones,
        behavioralAnalysis: {
          carelessCount,
          fundamentalCount
        }
      },
      timestamp: Timestamp.now()
    };

    try {
      await addDoc(collection(db, 'attempts'), attempt);
      
      // Update User Profile (Red Zones, Behavioral Summary, Prescriptions, Badges, Notifications)
      const updatedUser = { ...user };
      const newBadges: Badge[] = [...(user.badges || [])];
      const newNotifications: AppNotification[] = [...(user.notifications || [])];

      // Award "Cẩn thận" badge
      if (carelessCount === 0 && !newBadges.find(b => b.id === 'careful')) {
        newBadges.push({
          id: 'careful',
          title: 'Cẩn thận',
          icon: 'Award',
          description: 'Hoàn thành bài thi không mắc lỗi kỹ thuật nào.',
          unlockedAt: Timestamp.now()
        });
        newNotifications.push({
          id: Math.random().toString(36).substr(2, 9),
          title: 'Danh hiệu mới!',
          message: 'Bạn đã nhận được danh hiệu "Cẩn thận". Chúc mừng!',
          type: 'success',
          read: false,
          timestamp: Timestamp.now()
        });
      }

      // Award "Bậc thầy" badge
      if (totalScore === activeTest.questions.length && !newBadges.find(b => b.id === `master_${activeTest.topic}`)) {
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
      
      // Red Zones
      if (redZones.length > 0) {
        updatedUser.redZones = Array.from(new Set([...(user.redZones || []), ...redZones]));
      }

      // Behavioral Summary
      updatedUser.behavioralSummary = {
        careless: (user.behavioralSummary?.careless || 0) + carelessCount,
        fundamental: (user.behavioralSummary?.fundamental || 0) + fundamentalCount
      };

      // Prescriptions
      if (user.prescriptions) {
        updatedUser.prescriptions = user.prescriptions.map(p => {
          if (p.status === 'pending' && p.title === activeTest.topic) {
            return { ...p, status: 'completed', completedAt: Timestamp.now(), score: totalScore };
          }
          return p;
        });
      }

      await setDoc(doc(db, 'users', user.uid), updatedUser, { merge: true });
      setUser(updatedUser);

      setResults(attempt);
      setShowVirtualLab(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'attempts');
    } finally {
      setIsAnalyzing(false);
    }
  };

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
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-red-500/30">
      <Navbar 
        user={user} 
        onSignOut={signOut}
        onSignIn={handleSignIn}
        onReset={() => {
          setActiveTest(null);
          setResults(null);
        }} 
      />

      <main className="max-w-7xl mx-auto px-6 py-12">
        {!user ? (
          <div className="relative py-20 overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-red-600/10 blur-[120px] rounded-full -z-10" />
            
            <div className="flex flex-col items-center justify-center text-center">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="max-w-4xl"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-8">
                  <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  Hệ thống luyện thi Vật lý 2025
                </div>
                
                <h1 className="text-6xl md:text-8xl font-black text-white mb-8 leading-[0.9] tracking-tighter">
                  CHINH PHỤC <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-amber-500">8.0+ VẬT LÝ</span>
                </h1>
                
                <p className="text-xl md:text-2xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
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
                    { title: 'Đề thi chuẩn', desc: 'Cập nhật liên tục theo cấu trúc đề thi 2025 của Bộ GD&ĐT.', icon: Target },
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
              {!results ? (
                <ProExamExperience 
                  test={activeTest}
                  answers={answers}
                  onAnswer={handleAnswer}
                  onSubmit={submitTest}
                  onCancel={() => setActiveTest(null)}
                />
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
                        <p className="text-4xl font-black text-white">{results.score.toFixed(1)}</p>
                        <p className="text-[10px] text-slate-500 mt-1">trên {activeTest.questions.length}</p>
                      </div>
                      <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 text-center min-w-[140px]">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Xếp loại</p>
                        <p className={cn(
                          "text-2xl font-black",
                          results.score >= activeTest.questions.length * 0.8 ? "text-amber-500" : "text-red-500"
                        )}>
                          {results.score >= activeTest.questions.length * 0.8 ? 'MASTER' : 'CẦN ÔN TẬP'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1">Dựa trên AI</p>
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

                        activeTest.questions.forEach(q => {
                          const studentAns = results.answers[q.id];
                          partScores[q.part].total += 1;
                          
                          if (q.part === 1) {
                            if (studentAns === q.correctAnswer) partScores[q.part].score += 1;
                          } else if (q.part === 2) {
                            const correctCount = (studentAns as boolean[]).filter((a, i) => a === (q.correctAnswer as boolean[])[i]).length;
                            if (correctCount === 4) partScores[q.part].score += 1;
                            else if (correctCount === 3) partScores[q.part].score += 0.5;
                            else if (correctCount === 2) partScores[q.part].score += 0.25;
                            else if (correctCount === 1) partScores[q.part].score += 0.1;
                          } else if (q.part === 3) {
                            if (Math.abs(parseFloat(studentAns) - (q.correctAnswer as number)) < 0.01) partScores[q.part].score += 1;
                          }
                        });

                        const chartData = [
                          { name: 'Phần I', score: partScores[1].score, total: partScores[1].total },
                          { name: 'Phần II', score: partScores[2].score, total: partScores[2].total },
                          { name: 'Phần III', score: partScores[3].score, total: partScores[3].total }
                        ];

                        return <PerformanceChart data={chartData} />;
                      })()}
                    </div>

                    <div className="space-y-8">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <FlaskConical className="text-blue-500" />
                        ĐƠN THUỐC ĐIỀU TRỊ
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <PrescriptionCard 
                          title="Kiến thức hổng"
                          content={results.analysis.redZones.length > 0 ? results.analysis.redZones.join(', ') : 'Không phát hiện lỗ hổng lớn.'}
                          icon={AlertTriangle}
                          color="bg-red-500/10 text-red-500"
                        />
                        <PrescriptionCard 
                          title="Chiến thuật"
                          content={results.score < 5 ? 'Tập trung chắc chắn Phần I để lấy gốc.' : 'Nâng cao kỹ năng tính toán Phần III.'}
                          icon={Target}
                          color="bg-blue-500/10 text-blue-500"
                        />
                        <PrescriptionCard 
                          title="Lộ trình"
                          content="Ôn lại lý thuyết 30p trước khi làm đề tiếp theo."
                          icon={History}
                          color="bg-green-500/10 text-green-500"
                        />
                        <PrescriptionCard 
                          title="Tư vấn AI"
                          content="Bạn đang gặp lỗi kỹ thuật ở các câu trả lời ngắn."
                          icon={BrainCircuit}
                          color="bg-purple-500/10 text-purple-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Settings className="text-slate-500" />
                      NHẬN XÉT CỦA AI ARCHITECT
                    </h3>
                    <div className="prose prose-invert max-w-none bg-slate-950/50 p-8 rounded-3xl border border-slate-800 leading-relaxed text-slate-300">
                      <ReactMarkdown>{results.analysis.feedback}</ReactMarkdown>
                    </div>
                  </div>

                  {/* Suggested Resources Section */}
                  {(() => {
                    const incorrectQuestions = activeTest.questions.filter(q => {
                      const studentAns = results.answers[q.id];
                      if (q.part === 1) return studentAns !== q.correctAnswer;
                      if (q.part === 2) return (studentAns as boolean[]).some((a, i) => a !== (q.correctAnswer as boolean[])[i]);
                      if (q.part === 3) return Math.abs(parseFloat(studentAns) - (q.correctAnswer as number)) >= 0.01;
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

                  <div className="mt-12 flex gap-4">
                    <button 
                      onClick={() => setActiveTest(null)}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-red-600/20"
                    >
                      Quay về Dashboard
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="px-8 bg-slate-800 hover:bg-slate-700 text-white py-5 rounded-2xl font-black uppercase tracking-widest transition-all"
                    >
                      In báo cáo
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="space-y-12">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1">
                <h2 className="text-4xl font-black text-white tracking-tight">
                  CHÀO THẦY THUỐC, <span className="text-red-600">{user.displayName.toUpperCase()}</span>
                </h2>
                <p className="text-slate-500 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Hệ thống đang trực tuyến. Sẵn sàng chẩn đoán kiến thức.
                </p>
              </div>
              <div className="flex items-center gap-4">
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

            <StudentDashboard 
              user={user} 
              attempts={attempts} 
              onStartPrescription={(topic, examId) => startTest(topic, examId)}
            />

            <div className="mt-16 mb-8">
              {/* Removed redundant section header as it's now in diagnosis section */}
            </div>

            {/* Removed redundant TopicCard grid as it's now in diagnosis section */}

            {(user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com') && (
              <section className="space-y-8 mt-12 pt-12 border-t border-slate-900">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
                  {[
                    { label: 'Trạng thái AI', value: 'Sẵn sàng', icon: BrainCircuit, color: 'text-green-500' },
                    { label: 'Tổng số câu hỏi', value: '1,240', icon: BookOpen, color: 'text-blue-500' },
                    { label: 'Lượt thi hôm nay', value: '85', icon: Activity, color: 'text-red-500' },
                    { label: 'Tải hệ thống', value: '12%', icon: Settings, color: 'text-amber-500' },
                  ].map((s, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
                      <div className={cn("p-2 rounded-xl bg-slate-800", s.color)}>
                        <s.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.label}</p>
                        <p className="text-lg font-black text-white">{s.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <h3 className="text-2xl font-black text-white flex items-center gap-3">
                    <Settings className="text-red-600 w-8 h-8" />
                    HỆ THỐNG QUẢN TRỊ PHYS-8+
                  </h3>
                  <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 w-full md:w-auto">
                    {[
                      { id: 'Digitize', label: 'Số hóa đề', icon: History },
                      { id: 'Bank', label: 'Kho câu hỏi', icon: BookOpen },
                      { id: 'Generator', label: 'Tạo đề thi', icon: Play },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setAdminTab(tab.id as any)}
                        className={cn(
                          "flex-1 md:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
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
                  {adminTab === 'Digitize' && <DigitizationDashboard onQuestionsAdded={() => setAdminTab('Bank')} />}
                  {adminTab === 'Bank' && <QuestionBank />}
                  {adminTab === 'Generator' && <ExamGenerator user={user} onExportPDF={exportExamToPDF} />}
                </motion.div>
              </section>
            )}

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

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-16">
              <div className="lg:col-span-2 space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <FlaskConical className="text-red-500" />
                  VIRTUAL LAB & THỰC TẾ
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Settings className="text-red-500" />
                  CẤU HÌNH CHIẾN THUẬT
                </h3>
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-6">
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

            <section id="resources" className="mt-16 space-y-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <BookOpen className="text-blue-500" />
                KHO HỌC LIỆU SỐ
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <ResourceCard 
                  title="Tóm tắt Vật lí nhiệt" 
                  type="pdf" 
                  url="#" 
                  description="Toàn bộ công thức và lý thuyết trọng tâm chương Nhiệt học."
                />
                <ResourceCard 
                  title="Video: Khí lí tưởng" 
                  type="video" 
                  url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" 
                  description="Bài giảng chi tiết về các định luật chất khí và phương trình trạng thái."
                />
                <ResourceCard 
                  title="Mô phỏng Từ trường" 
                  type="link" 
                  url="https://phet.colorado.edu/sims/html/magnets-and-electromagnets/latest/magnets-and-electromagnets_all.html" 
                  description="Trải nghiệm tương tác với nam châm và dòng điện."
                />
                <ResourceCard 
                  title="Đề thi thử 2025" 
                  type="pdf" 
                  url="#" 
                  description="Bộ đề dự đoán cấu trúc mới nhất của Bộ Giáo dục."
                />
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
      </main>

      <footer className="border-t border-slate-900 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-slate-500 text-sm">© 2025 PHYS-8+ | Kiến trúc bởi Thầy Hậu & AI Architect</p>
        </div>
      </footer>
    </div>
  );
}
