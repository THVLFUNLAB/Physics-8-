import React, { useState, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, Timestamp } from '../firebase';
import { db, auth } from '../firebase';
import { Question, Topic, QuestionLevel, Exam } from '../types';
import { toast } from './Toast';
import { parseMatrixImage, ParsedMatrixResult } from '../services/geminiService';
import { 
  Plus, 
  Trash2, 
  Target, 
  BrainCircuit, 
  AlertTriangle,
  Upload,
  ImagePlus,
  Sparkles,
  CheckCircle2,
  X,
  FileText,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

// Constants — Danh sách topic chuẩn Vật lý THPT
const ALL_TOPICS: Topic[] = [
  'Dao động cơ', 'Sóng cơ', 'Điện xoay chiều', 'Sóng điện từ', 'Lượng tử ánh sáng', 'Quang hình học', 'Lý thuyết tương đối',
  'Từ trường', 'Cảm ứng điện từ', 'Vật lí nhiệt', 'Khí lí tưởng', 'Vật lí hạt nhân', 'Động học chất điểm', 'Động lực học', 'Năng lượng', 'Dòng điện', 'Chuyên đề học tập', 'Lớp 10', 'Lớp 11'
];

type LevelCount = {
  'Nhận biết': number;
  'Thông hiểu': number;
  'Vận dụng': number;
  'Vận dụng cao': number;
};

const DEFAULT_LEVELS: LevelCount = {
  'Nhận biết': 0,
  'Thông hiểu': 0,
  'Vận dụng': 0,
  'Vận dụng cao': 0,
};

interface TopicMatrixConfig {
  id: string; // unique internal ID
  topic: Topic | '';
  part1: LevelCount;
  part2: LevelCount;
  part3: LevelCount;
}

export default function ExamMatrixGenerator() {
  const [examTitle, setExamTitle] = useState('');
  const [topicsConfig, setTopicsConfig] = useState<TopicMatrixConfig[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);

  // ── Upload ma trận state ──
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const matrixFileRef = useRef<HTMLInputElement>(null);
  
  // Tổng câu hỏi hiện tại
  const totalCount = topicsConfig.reduce((acc, config) => {
    let t = 0;
    ['part1', 'part2', 'part3'].forEach(p => {
      const partCfg = config[p as 'part1' | 'part2' | 'part3'];
      Object.values(partCfg).forEach(v => t += v);
    });
    return acc + t;
  }, 0);

  const addTopic = () => {
    setTopicsConfig([
      ...topicsConfig, 
      {
        id: Math.random().toString(36).substr(2, 9),
        topic: '',
        part1: { ...DEFAULT_LEVELS },
        part2: { ...DEFAULT_LEVELS },
        part3: { ...DEFAULT_LEVELS }
      }
    ]);
  };

  const removeTopic = (id: string) => {
    setTopicsConfig(topicsConfig.filter(t => t.id !== id));
  };

  const updateCount = (id: string, part: 'part1' | 'part2' | 'part3', level: keyof LevelCount, val: string) => {
    const num = parseInt(val) || 0;
    setTopicsConfig(topicsConfig.map(t => {
      if (t.id === id) {
        return {
          ...t,
          [part]: {
            ...t[part],
            [level]: Math.max(0, num)
          }
        }
      }
      return t;
    }));
  };

  const updateTopicName = (id: string, topic: Topic) => {
    setTopicsConfig(topicsConfig.map(t => t.id === id ? { ...t, topic } : t));
  };

  // Helper shuffle array
  function shuffleArray<T>(array: T[]): T[] {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  }

  // Preset BGD 2025
  const applyBGD2025 = () => {
    setExamTitle('Đề Tham Khảo BGD 2025 - Vật Lí');
    setTopicsConfig([
      {
        id: Math.random().toString(),
        topic: 'Vật lí nhiệt',
        part1: { 'Nhận biết': 2, 'Thông hiểu': 1, 'Vận dụng': 1, 'Vận dụng cao': 0 },
        part2: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 0, 'Vận dụng cao': 0 }, 
        part3: { 'Nhận biết': 0, 'Thông hiểu': 0, 'Vận dụng': 0, 'Vận dụng cao': 0 }
      },
      {
        id: Math.random().toString(),
        topic: 'Khí lí tưởng',
        part1: { 'Nhận biết': 2, 'Thông hiểu': 0, 'Vận dụng': 1, 'Vận dụng cao': 0 },
        part2: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 0, 'Vận dụng cao': 0 },
        part3: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 1, 'Vận dụng cao': 0 }
      },
      {
        id: Math.random().toString(),
        topic: 'Từ trường',
        part1: { 'Nhận biết': 4, 'Thông hiểu': 1, 'Vận dụng': 0, 'Vận dụng cao': 0 },
        part2: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 0, 'Vận dụng cao': 0 },
        part3: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 1, 'Vận dụng cao': 0 }
      },
      {
        id: Math.random().toString(),
        topic: 'Vật lí hạt nhân',
        part1: { 'Nhận biết': 3, 'Thông hiểu': 1, 'Vận dụng': 0, 'Vận dụng cao': 0 },
        part2: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 0, 'Vận dụng cao': 0 },
        part3: { 'Nhận biết': 0, 'Thông hiểu': 0, 'Vận dụng': 2, 'Vận dụng cao': 0 }
      },
      {
        id: Math.random().toString(),
        topic: 'Chuyên đề học tập',
        part1: { 'Nhận biết': 1, 'Thông hiểu': 0, 'Vận dụng': 1, 'Vận dụng cao': 0 },
        part2: { 'Nhận biết': 0, 'Thông hiểu': 0, 'Vận dụng': 0, 'Vận dụng cao': 0 },
        part3: { 'Nhận biết': 0, 'Thông hiểu': 0, 'Vận dụng': 0, 'Vận dụng cao': 0 }
      }
    ]);
    toast.success('Đã áp dụng cấu trúc Ma trận BGD 2025!');
  };

  // ═══════════════════════════════════════════════════════════════
  //  UPLOAD MA TRẬN — AI đọc ảnh/PDF và auto-fill form
  // ═══════════════════════════════════════════════════════════════

  const handleMatrixUpload = async (file: File) => {
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isPDF = file.name.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPDF) {
      toast.error('Vui lòng chọn file ảnh (PNG, JPG) hoặc PDF chứa bảng ma trận.');
      return;
    }

    // Check API key availability
    try {
      if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
        await (window as any).aistudio.openSelectKey();
      }
    } catch (err) {
      console.warn('Error checking API key:', err);
    }

    setIsUploading(true);
    setUploadProgress('Khởi tạo...');

    try {
      const result: ParsedMatrixResult = await parseMatrixImage(
        file,
        (status) => setUploadProgress(status)
      );

      // Auto-fill exam title
      if (result.examTitle && !examTitle.trim()) {
        setExamTitle(result.examTitle);
      }

      // Convert ParsedMatrixRow[] → TopicMatrixConfig[]
      const newConfigs: TopicMatrixConfig[] = result.rows.map((row) => ({
        id: Math.random().toString(36).substr(2, 9),
        topic: row.topic as Topic,
        part1: {
          'Nhận biết': row.part1['Nhận biết'] || 0,
          'Thông hiểu': row.part1['Thông hiểu'] || 0,
          'Vận dụng': row.part1['Vận dụng'] || 0,
          'Vận dụng cao': row.part1['Vận dụng cao'] || 0,
        },
        part2: {
          'Nhận biết': row.part2['Nhận biết'] || 0,
          'Thông hiểu': row.part2['Thông hiểu'] || 0,
          'Vận dụng': row.part2['Vận dụng'] || 0,
          'Vận dụng cao': row.part2['Vận dụng cao'] || 0,
        },
        part3: {
          'Nhận biết': row.part3['Nhận biết'] || 0,
          'Thông hiểu': row.part3['Thông hiểu'] || 0,
          'Vận dụng': row.part3['Vận dụng'] || 0,
          'Vận dụng cao': row.part3['Vận dụng cao'] || 0,
        },
      }));

      setTopicsConfig(newConfigs);
      toast.success(`🎯 AI đã tự động nhập ${newConfigs.length} chủ đề từ ma trận! Thầy kiểm tra lại rồi bấm "Sinh Đề".`);
    } catch (e: any) {
      console.error('[MatrixUpload]', e);
      toast.error(e.message || 'Lỗi đọc ma trận.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (matrixFileRef.current) matrixFileRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleMatrixUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleMatrixUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // ═══════════════════════════════════════════════════════════════
  //  SINH ĐỀ — Query Firestore theo ma trận
  // ═══════════════════════════════════════════════════════════════

  const handleGenerate = async () => {
    if (!examTitle.trim()) {
      toast.error('Vui lòng nhập Tên/Tiêu đề đề thi.');
      return;
    }
    if (topicsConfig.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 chủ đề vào cấu trúc ma trận.');
      return;
    }
    const emptyTopics = topicsConfig.filter(t => !t.topic);
    if (emptyTopics.length > 0) {
      toast.error('Vui lòng chọn tên chủ đề cho tất cả các phần cấu trúc.');
      return;
    }
    if (totalCount === 0) {
      toast.error('Ma trận đang trống (0 câu hỏi).');
      return;
    }

    setIsGenerating(true);
    setErrors([]);
    setGenStatus('Đang quét Kho câu hỏi...');
    
    try {
      const selectedQuestions: Question[] = [];
      const errorLog: string[] = [];

      for (let i = 0; i < topicsConfig.length; i++) {
        const cfg = topicsConfig[i];
        
        for (const part of [1, 2, 3] as const) {
          const partKey = `part${part}` as 'part1' | 'part2' | 'part3';
          const levels = cfg[partKey];

          for (const level of Object.keys(levels) as (keyof LevelCount)[]) {
            const requiredCount = levels[level];
            if (requiredCount > 0) {
              setGenStatus(`Đang tìm Part ${part} - ${level} - ${cfg.topic} (${requiredCount} câu)`);
              
              // Query Firestore
              const qRef = query(
                collection(db, 'questions'),
                where('topic', '==', cfg.topic),
                where('part', '==', part),
                where('level', '==', level)
              );
              
              const snapshot = await getDocs(qRef);
              let qs = snapshot.docs.map(doc => { 
                const d = doc.data(); 
                // Tránh status nháp
                if (d.status === 'draft') return null;
                return { ...d, id: doc.id } as Question; 
              }).filter(q => q !== null) as Question[];

              if (qs.length < requiredCount) {
                errorLog.push(`Thiếu câu hỏi: Chủ đề "${cfg.topic}", Phần ${part}, Mức "${level}". Yêu cầu ${requiredCount}, trong kho chỉ có ${qs.length}.`);
              }

              // Lấy ngẫu nhiên
              const shuffled = shuffleArray(qs);
              const picked = shuffled.slice(0, requiredCount);
              selectedQuestions.push(...picked);
            }
          }
        }
      }

      if (errorLog.length > 0) {
        setErrors(errorLog);
        toast.info('⚠️ Ma trận có lỗi thiếu hụt nguồn câu hỏi. Đề thi vẫn được tạo với các câu khả dụng.');
      } else {
        toast.success(`Đã trích xuất đủ ${selectedQuestions.length} câu hoàn hảo cho ma trận!`);
      }

      setGenStatus('Đang lưu bài thi vào hệ thống...');
      
      const newExam: Exam = {
        title: examTitle.trim(),
        questions: selectedQuestions.map((q: any) => {
          const {id, ...rest} = q;
          return { ...rest }; 
        }),
        createdAt: Timestamp.now(),
        createdBy: auth.currentUser?.uid || 'admin',
        type: 'Matrix',
      };

      await addDoc(collection(db, 'exams'), newExam);
      
      setGenStatus('');
      setIsGenerating(false);
      toast.success('🚀 Đã sinh đề thi chung thành công! Thầy có thể tổ chức thi ngay ở Phòng Thi.');
    } catch (e: any) {
      console.error(e);
      toast.error('Có lỗi xảy ra: ' + e.message);
      setIsGenerating(false);
      setGenStatus('');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8 relative overflow-hidden">
      
      {/* Nền trang trí */}
      <div className="absolute top-0 right-0 p-16 pointer-events-none opacity-5">
         <Target className="w-96 h-96 text-cyan-500 transform rotate-12" />
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3 tracking-tighter">
            <BrainCircuit className="text-cyan-500" /> GENERATOR: MA TRẬN ĐỀ
          </h3>
          <p className="text-slate-400 text-sm mt-1">Xây dựng kiến trúc đề thi hoàn hảo, chuẩn hóa theo THPT 2025.</p>
        </div>
        <div className="bg-cyan-900/40 text-cyan-400 px-6 py-3 rounded-2xl border border-cyan-800 flex flex-col items-center justify-center transform transition-all shadow-[0_0_30px_-5px_rgba(8,145,178,0.3)]">
           <span className="text-3xl font-black">{totalCount}</span>
           <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Tổng Số Câu</span>
        </div>
      </div>

      {/* ═══ UPLOAD MA TRẬN AI ═══ */}
      <div className="relative z-10">
        <input 
          type="file" 
          ref={matrixFileRef}
          onChange={handleFileChange}
          accept="image/*,.pdf"
          className="hidden"
        />
        
        <div
          onClick={() => !isUploading && matrixFileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "w-full py-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group",
            isDragging
              ? "border-amber-400 bg-amber-500/10 scale-[1.01]"
              : "border-slate-700 hover:border-amber-500/50 hover:bg-amber-500/5",
            isUploading && "pointer-events-none opacity-70"
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-amber-400 rounded-full border-t-transparent animate-spin" />
              <span className="text-amber-400 font-bold text-sm">{uploadProgress}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/30 group-hover:bg-amber-500/20 transition-all">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700 group-hover:border-slate-600 transition-all">
                  <Upload className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-amber-400 font-bold text-sm">Upload Ma Trận (AI Tự Đọc)</p>
                <p className="text-slate-500 text-xs mt-0.5">Kéo thả hoặc bấm để chọn ảnh / PDF chứa bảng ma trận đề thi</p>
              </div>
            </>
          )}
        </div>

        {/* Nút Preset BGD 2025 */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={applyBGD2025}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-bold rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Áp dụng Ma trận BGD 2025
          </button>
        </div>
      </div>

      {/* ═══ DIVIDER ═══ */}
      <div className="flex items-center gap-4 relative z-10">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">hoặc nhập tay bên dưới</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      <div className="space-y-4 relative z-10">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tiêu đề Kỳ thi *</label>
        <input 
          type="text" 
          placeholder="VD: Kiểm tra cuối kì 1 — Khối 12"
          value={examTitle}
          onChange={(e) => setExamTitle(e.target.value)}
          className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-5 py-4 text-base text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all shadow-inner"
        />
      </div>

      {errors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 space-y-3 relative z-10">
           <div className="flex items-center gap-2 text-red-400 font-bold">
              <AlertTriangle className="w-5 h-5" /> <span>Hệ thống báo cáo thiếu dữ liệu Kho</span>
           </div>
           <ul className="list-disc pl-5 text-sm text-red-300">
             {errors.map((err, i) => <li key={i}>{err}</li>)}
           </ul>
        </div>
      )}

      {/* Danh sách các cấu trúc Topic */}
      <div className="space-y-6 relative z-10">
        <AnimatePresence>
          {topicsConfig.map((cfg, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={cfg.id} 
              className="bg-slate-800 border border-slate-700/80 rounded-2xl p-6 space-y-6 block shadow-lg relative overflow-hidden group"
            >
              {/* Delete Button */}
              <button 
                onClick={() => removeTopic(cfg.id)}
                className="absolute top-4 right-4 p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all z-20"
                title="Xóa cấu trúc chủ đề này"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              <div className="pr-12">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chọn Chủ Đề *</label>
                <select 
                  value={cfg.topic}
                  onChange={(e) => updateTopicName(cfg.id, e.target.value as Topic)}
                  className="w-full mt-1 bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white focus:border-cyan-500 outline-none appearance-none"
                >
                  <option value="" disabled>-- Chọn chủ đề vật lý --</option>
                  {ALL_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Ma trận Parts */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                 {/* Part 1 */}
                 <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <div className="text-center mb-4">
                       <span className="text-xs font-black text-white bg-slate-700 px-3 py-1 rounded-lg uppercase tracking-wider">PHẦN I (TNKQ)</span>
                    </div>
                    <div className="space-y-3">
                       {['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'].map((level) => (
                         <div key={level} className="flex justify-between items-center text-sm">
                           <span className="text-slate-400 font-medium">{level}</span>
                           <input 
                             type="number" 
                             min="0"
                             value={cfg.part1[level as keyof LevelCount] || ''}
                             onChange={(e) => updateCount(cfg.id, 'part1', level as keyof LevelCount, e.target.value)}
                             className="w-16 bg-slate-800 border fill-border border-slate-600 rounded px-2 py-1 text-center text-white outline-none focus:border-cyan-500"
                           />
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* Part 2 */}
                 <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <div className="text-center mb-4">
                       <span className="text-xs font-black text-amber-400 bg-amber-900/20 border border-amber-900/50 px-3 py-1 rounded-lg uppercase tracking-wider">PHẦN II (Đúng/Sai)</span>
                    </div>
                    <div className="space-y-3">
                       {['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'].map((level) => (
                         <div key={level} className="flex justify-between items-center text-sm">
                           <span className="text-slate-400 font-medium">{level}</span>
                           <input 
                             type="number" 
                             min="0"
                             value={cfg.part2[level as keyof LevelCount] || ''}
                             onChange={(e) => updateCount(cfg.id, 'part2', level as keyof LevelCount, e.target.value)}
                             className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center text-white outline-none focus:border-cyan-500"
                           />
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* Part 3 */}
                 <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <div className="text-center mb-4">
                       <span className="text-xs font-black text-emerald-400 bg-emerald-900/20 border border-emerald-900/50 px-3 py-1 rounded-lg uppercase tracking-wider">PHẦN III (Trả Lời Ngắn)</span>
                    </div>
                    <div className="space-y-3">
                       {['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'].map((level) => (
                         <div key={level} className="flex justify-between items-center text-sm">
                           <span className="text-slate-400 font-medium">{level}</span>
                           <input 
                             type="number" 
                             min="0"
                             value={cfg.part3[level as keyof LevelCount] || ''}
                             onChange={(e) => updateCount(cfg.id, 'part3', level as keyof LevelCount, e.target.value)}
                             className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center text-white outline-none focus:border-cyan-500"
                           />
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <button 
          onClick={addTopic}
          className="w-full py-4 border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all font-bold"
        >
          <Plus className="w-5 h-5" /> Thêm Chủ Đề Vào Ma Trận
        </button>
      </div>

      <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center relative z-10 gap-4">
         {/* Nút reset */}
         {topicsConfig.length > 0 && (
            <button 
              onClick={() => { setTopicsConfig([]); setExamTitle(''); setErrors([]); }}
              className="px-5 py-3 text-slate-500 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all flex items-center gap-2 text-sm font-bold"
            >
              <RotateCcw className="w-4 h-4" /> Xóa toàn bộ
            </button>
         )}
         <button 
           disabled={isGenerating}
           onClick={handleGenerate}
           className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 rounded-2xl font-black text-sm text-white transition-all transform active:scale-95 shadow-[0_0_20px_-3px_rgba(8,145,178,0.5)] flex items-center gap-3 uppercase tracking-widest disabled:opacity-50 ml-auto"
         >
           {isGenerating ? (
             <>
               <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin"/>
               {genStatus}
             </>
             ) : (
             <>
               <Target className="w-5 h-5" />
               Bắt Đầu Sinh Đề
             </>
           )}
         </button>
      </div>
    </div>
  );
}
