import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  db, auth, collection, doc, getDocs, addDoc, updateDoc,
  Timestamp, writeBatch, query, where, orderBy, setDoc
} from '../firebase';
import { Question, UserProfile, Topic, Part, Exam, Prescription, AppNotification } from '../types';
import { PHYSICS_TOPICS, matchesTopic } from '../utils/physicsTopics';
import { sanitizeQuestion } from '../utils/sanitizers';

import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Bar, Cell, LabelList } from 'recharts';
import { toast } from './Toast';
import MathRenderer from '../lib/MathRenderer';
import {
  BookOpen, Play, Target, Settings, BrainCircuit,
  ChevronRight, Check, X, Download, Filter,
  AlertTriangle, CheckCircle2, FileText, Save,
  Trophy, FlaskConical
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
const ExamGenerator = ({ user, onExportPDF }: { user: UserProfile, onExportPDF: (exam: Exam) => void }) => {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [generatedExam, setGeneratedExam] = useState<Exam | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genType, setGenType] = useState<'AI' | 'Matrix'>('AI');
  const [selectedGrade, setSelectedGrade] = useState<'all' | 10 | 11 | 12>('all');

  const getQuestionGrade = (q: Question) => {
    if (q.targetGrade) return q.targetGrade;
    // Fallback: check topic against PHYSICS_TOPICS
    if (PHYSICS_TOPICS[0].topics.some(t => matchesTopic(q.topic, t.name))) return 10;
    if (PHYSICS_TOPICS[1].topics.some(t => matchesTopic(q.topic, t.name))) return 11;
    if (PHYSICS_TOPICS[2].topics.some(t => matchesTopic(q.topic, t.name))) return 12;
    return null;
  };

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

      // ── Lọc theo Khối (Grade) nếu có chọn ──
      let poolOfQuestions = allQuestions;
      if (selectedGrade !== 'all') {
        const targetG = Number(selectedGrade);
        poolOfQuestions = allQuestions.filter(q => {
          const g = getQuestionGrade(q);
          return g === targetG;
        });
      }

      // ── Phân loại theo Part ──
      const p1 = poolOfQuestions.filter(q => q.part === 1);
      const p2 = poolOfQuestions.filter(q => q.part === 2);
      const p3 = poolOfQuestions.filter(q => q.part === 3);

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
        title: `ĐỀ ${genType === 'AI' ? 'TRỊ BỆNH' : 'THEO MA TRẬN'}: ${selectedGrade !== 'all' ? `KHỐI ${selectedGrade} - ` : ''}${selectedStudent?.displayName || 'CHUNG'} - ${new Date().toLocaleDateString('vi-VN')}`,
        questions: selected,
        createdAt: Timestamp.now(),
        createdBy: user.uid,
        published: false,
        type: genType === 'AI' ? 'AI_Diagnosis' : 'Matrix',
        targetStudentId: selectedStudent?.uid
      };

      const docRef = await addDoc(collection(db, 'exams'), newExam);
      setGeneratedExam({ ...newExam, id: docRef.id });
    } catch (e) {
      console.error(e);
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
      console.error(e);
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

          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase">{genType === 'AI' ? '3' : '2'}. PHẠM VI KIẾN THỨC (KHỐI LỚP)</p>
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              {(['all', 10, 11, 12] as const).map(grade => (
                <button 
                  key={grade}
                  onClick={() => setSelectedGrade(grade)}
                  className={cn(
                    "flex-1 py-3 rounded-lg text-xs font-bold transition-all",
                    selectedGrade === grade ? "bg-fuchsia-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {grade === 'all' ? 'Tất cả' : `Khối ${grade}`}
                </button>
              ))}
            </div>
          </div>

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

export default ExamGenerator;
