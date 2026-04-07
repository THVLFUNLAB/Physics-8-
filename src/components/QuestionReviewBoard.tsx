/**
 * QuestionReviewBoard.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Giao diện "Human-in-the-loop" để giáo viên hiệu chỉnh kết quả bóc tách
 * từ AzotaParser trước khi đồng bộ lên Firestore.
 *
 * Tính năng:
 *  - Rich text editor (MDEditor) với live KaTeX preview cho từng trường
 *  - Radio button chọn đáp án Phần I
 *  - Checkbox Đúng/Sai cho Phần II
 *  - Number input (styled) cho Phần III
 *  - Nút "Đồng bộ lên Kho Dữ Liệu" để push lên Firestore
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { cn } from '../lib/utils';
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Upload,
  BrainCircuit,
  Pencil,
  Eye,
  Tag,
  Hash,
  ImagePlus,
  Image,
  TableProperties,
  ShieldAlert,
  Copy,
  Trash2,
} from 'lucide-react';
import { Question, Topic, QuestionLevel, Part } from '../types';
import { ParseError } from '../services/AzotaParser';
import { checkAgainstBank, prepareBankVectors, BankDuplicateMatch } from '../services/DuplicateDetector';
import { normalizeQuestions } from '../services/geminiService';
import MathRenderer from '../lib/MathRenderer';

// ─── Helper: phát hiện placeholder trong nội dung ─────────────────────────
const hasImagePlaceholder = (text: string) =>
  /\[HÌNH MINH HỌA/i.test(text);
const hasTablePlaceholder = (text: string) =>
  /\[BẢNG SỐ LIỆU/i.test(text);

// ─── Props ────────────────────────────────────────────────────────────────

interface QuestionReviewBoardProps {
  initialQuestions: Question[];
  parseErrors: ParseError[];
  topic: Topic;
  onSync: (questions: Question[]) => Promise<void>;
  onCancel: () => void;
  bankQuestions?: Question[];   // Ngân hàng hiện tại — dùng để phát hiện trùng
}

// ─── Constants ────────────────────────────────────────────────────────────

const LEVELS: QuestionLevel[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
const TOPICS: Topic[] = ['Vật lí nhiệt', 'Khí lí tưởng', 'Từ trường', 'Vật lí hạt nhân'];

const PART_COLORS: Record<Part, string> = {
  1: 'bg-red-600 text-white',
  2: 'bg-amber-500 text-white',
  3: 'bg-blue-500 text-white',
};

const LEVEL_COLORS: Record<QuestionLevel, string> = {
  'Nhận biết': 'bg-green-600/20 text-green-400 border-green-600/40',
  'Thông hiểu': 'bg-blue-600/20 text-blue-400 border-blue-600/40',
  'Vận dụng': 'bg-amber-600/20 text-amber-400 border-amber-600/40',
  'Vận dụng cao': 'bg-red-600/20 text-red-400 border-red-600/40',
};

// KaTeX options injected into MDEditor
const PREVIEW_OPTIONS = {
  rehypePlugins: [[rehypeKatex]] as any,
  remarkPlugins: [[remarkMath]] as any,
};

// ─── Sub-component: MathToolbar ───────────────────────────────────────────
// Thanh công cụ chèn nhanh ký hiệu toán học / LaTeX vào nội dung

interface ToolbarItem {
  label: string;
  insert: string;
  title: string;
}

interface ToolbarGroup {
  groupName: string;
  items: ToolbarItem[];
}

const MATH_TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    groupName: 'Công thức',
    items: [
      { label: '$…$', insert: '$  $', title: 'Công thức cùng dòng (inline)' },
      { label: '$$…$$', insert: '$$  $$', title: 'Công thức tách dòng (display)' },
      { label: 'a/b', insert: '\\frac{a}{b}', title: 'Phân số' },
      { label: '√x', insert: '\\sqrt{x}', title: 'Căn bậc hai' },
      { label: 'ⁿ√', insert: '\\sqrt[n]{x}', title: 'Căn bậc n' },
      { label: 'xⁿ', insert: 'x^{n}', title: 'Lũy thừa / Chỉ số trên' },
      { label: 'xₙ', insert: 'x_{n}', title: 'Chỉ số dưới' },
    ],
  },
  {
    groupName: 'Hy Lạp',
    items: [
      { label: 'Δ', insert: '\\Delta ', title: 'Delta (Δ)' },
      { label: 'ω', insert: '\\omega ', title: 'Omega (ω)' },
      { label: 'π', insert: '\\pi ', title: 'Pi (π)' },
      { label: 'α', insert: '\\alpha ', title: 'Alpha (α)' },
      { label: 'β', insert: '\\beta ', title: 'Beta (β)' },
      { label: 'λ', insert: '\\lambda ', title: 'Lambda (λ)' },
      { label: 'μ', insert: '\\mu ', title: 'Mu (μ)' },
      { label: 'φ', insert: '\\varphi ', title: 'Phi (φ)' },
      { label: 'θ', insert: '\\theta ', title: 'Theta (θ)' },
      { label: 'ε', insert: '\\varepsilon ', title: 'Epsilon (ε)' },
      { label: 'γ', insert: '\\gamma ', title: 'Gamma (γ)' },
      { label: 'Ω', insert: '\\Omega ', title: 'Omega hoa (Ω)' },
    ],
  },
  {
    groupName: 'Vật lý',
    items: [
      { label: 'vec', insert: '\\vec{F}', title: 'Vector (F)' },
      { label: '→AB', insert: '\\overrightarrow{AB}', title: 'Vector AB' },
      { label: '≈', insert: '\\approx ', title: 'Xấp xỉ' },
      { label: '≤', insert: '\\leq ', title: 'Nhỏ hơn hoặc bằng' },
      { label: '≥', insert: '\\geq ', title: 'Lớn hơn hoặc bằng' },
      { label: '≠', insert: '\\neq ', title: 'Khác' },
      { label: '±', insert: '\\pm ', title: 'Cộng trừ' },
      { label: '·', insert: '\\cdot ', title: 'Phép nhân (dấu chấm)' },
      { label: '×', insert: '\\times ', title: 'Phép nhân (dấu x)' },
      { label: '∞', insert: '\\infty ', title: 'Vô cùng' },
      { label: '°', insert: '^{\\circ}', title: 'Độ (°)' },
    ],
  },
  {
    groupName: 'Nâng cao',
    items: [
      { label: '∫', insert: '\\int_{a}^{b}', title: 'Tích phân' },
      { label: 'Σ', insert: '\\sum_{i=1}^{n}', title: 'Tổng (Sigma)' },
      { label: 'lim', insert: '\\lim_{x \\to a}', title: 'Giới hạn' },
      { label: 'sin', insert: '\\sin ', title: 'Sin' },
      { label: 'cos', insert: '\\cos ', title: 'Cos' },
      { label: 'tan', insert: '\\tan ', title: 'Tan' },
      { label: 'log', insert: '\\log ', title: 'Logarit' },
      { label: 'ln', insert: '\\ln ', title: 'Logarit tự nhiên' },
      { label: 'text', insert: '\\text{nội dung}', title: 'Chữ thường trong công thức' },
    ],
  },
];

interface MathToolbarProps {
  onInsert: (text: string) => void;
}

const MathToolbar: React.FC<MathToolbarProps> = ({ onInsert }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-white hover:bg-slate-700/50 transition-all"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-red-500 text-sm">∑</span> Thanh công cụ Toán học
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="p-3 pt-0 space-y-2.5 border-t border-slate-700/50">
          {MATH_TOOLBAR_GROUPS.map((group) => (
            <div key={group.groupName}>
              <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.15em] mb-1.5 mt-2">
                {group.groupName}
              </p>
              <div className="flex flex-wrap gap-1">
                {group.items.map((item) => (
                  <button
                    key={item.insert}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsert(item.insert)}
                    title={item.title}
                    className="px-2 py-1 bg-slate-900 hover:bg-red-600/20 border border-slate-700 hover:border-red-600/50 rounded-lg text-xs text-slate-300 hover:text-red-400 font-mono font-bold transition-all duration-150 active:scale-90"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[9px] text-slate-600 italic pt-1">
            💡 Click nút → chèn mã LaTeX vào cuối nội dung. Sau đó thầy sửa trực tiếp trong trình soạn thảo.
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Sub-component: MathField ─────────────────────────────────────────────
// Rich dual-pane editor cho một trường văn bản/LaTeX + Equation Toolbar

interface MathFieldProps {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  minHeight?: number;
}

const MathField: React.FC<MathFieldProps> = ({ value, onChange, label, minHeight = 80 }) => {
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const editorWrapRef = useRef<HTMLDivElement>(null);
  // FIX VĐ3: Cache vị trí cursor — giữ nguyên khi textarea bị blur do click toolbar
  const cursorPosRef = useRef<{ start: number; end: number }>({
    start: (value || '').length,
    end: (value || '').length,
  });

  // Attach blur/select listener vào textarea của MDEditor khi nó mount
  React.useEffect(() => {
    if (mode !== 'edit') return;

    const attachListeners = () => {
      const textarea = editorWrapRef.current?.querySelector(
        'textarea.w-md-editor-text-input'
      ) as HTMLTextAreaElement | null;
      if (!textarea) return false;

      const saveCursor = () => {
        cursorPosRef.current = {
          start: textarea.selectionStart ?? (value || '').length,
          end: textarea.selectionEnd ?? (value || '').length,
        };
      };
      textarea.addEventListener('blur', saveCursor);
      textarea.addEventListener('select', saveCursor);
      textarea.addEventListener('keyup', saveCursor);
      textarea.addEventListener('click', saveCursor);

      // Cleanup
      return () => {
        textarea.removeEventListener('blur', saveCursor);
        textarea.removeEventListener('select', saveCursor);
        textarea.removeEventListener('keyup', saveCursor);
        textarea.removeEventListener('click', saveCursor);
      };
    };

    // MDEditor mount async — chờ textarea xuất hiện
    let cleanup: (() => void) | undefined;
    const timer = setTimeout(() => {
      const result = attachListeners();
      if (typeof result === 'function') cleanup = result;
    }, 100);

    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [mode]);

  // Chèn tại vị trí cursor đã cache — KHÔNG phụ thuộc vào focus hiện tại
  const handleToolbarInsert = (text: string) => {
    const { start, end } = cursorPosRef.current;
    const current = value || '';
    const safStart = Math.min(start, current.length);
    const safEnd = Math.min(end, current.length);
    const before = current.substring(0, safStart);
    const after = current.substring(safEnd);
    const newVal = before + text + after;
    onChange(newVal);

    // Cập nhật cursor position cho lần chèn tiếp theo
    const newPos = safStart + text.length;
    cursorPosRef.current = { start: newPos, end: newPos };

    // Khôi phục focus + cursor sau React re-render
    requestAnimationFrame(() => {
      const textarea = editorWrapRef.current?.querySelector(
        'textarea.w-md-editor-text-input'
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      }
    });
  };

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
          <div className="flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setMode('preview')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase transition-all',
                mode === 'preview' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Eye className="w-2.5 h-2.5" /> Preview
            </button>
            <button
              onClick={() => setMode('edit')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase transition-all',
                mode === 'edit' ? 'bg-red-600 text-white' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Pencil className="w-2.5 h-2.5" /> Sửa
            </button>
          </div>
        </div>
      )}

      <div
        ref={editorWrapRef}
        data-color-mode="dark"
        className="rounded-xl overflow-visible border border-slate-700 focus-within:border-fuchsia-500/60 focus-within:shadow-[0_0_15px_-3px_rgba(192,38,211,0.3)] transition-all duration-300"
      >
        {/* FIX VĐ3: MathToolbar TRONG editorWrapRef — chỉ hiện khi đang chỉnh sửa */}
        {mode === 'edit' && (
          <MathToolbar onInsert={handleToolbarInsert} />
        )}

        {mode === 'edit' ? (
          <MDEditor
            value={value}
            onChange={(v) => onChange(v ?? '')}
            preview="edit"
            height={minHeight}
            previewOptions={PREVIEW_OPTIONS}
            style={{ background: '#0f172a' }}
          />
        ) : (
          <MDEditor.Markdown
            source={value || '*Chưa có nội dung...*'}
            rehypePlugins={[[rehypeKatex]]}
            remarkPlugins={[[remarkMath]]}
            style={{
              background: '#0f172a',
              padding: '12px 16px',
              minHeight: `${minHeight}px`,
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#e2e8f0',
            }}
          />
        )}
      </div>
    </div>
  );
};

// ─── Sub-component: QuestionCard ──────────────────────────────────────────

interface QuestionCardProps {
  question: Question;
  index: number;
  onChange: (updated: Question) => void;
  onRemove: () => void;
  duplicateWarning?: BankDuplicateMatch | null; // Cảnh báo trùng với ngân hàng
}

// ─── Sub-component: ImageInserter ─────────────────────────────────────────
// Upload ảnh và tự động thay thế placeholder trong content

interface ImageInserterProps {
  content: string;
  onContentChange: (newContent: string) => void;
}

const ImageInserter: React.FC<ImageInserterProps> = ({ content, onContentChange }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  // Nén ảnh bằng Canvas → JPEG nhẹ, lưu thẳng Firestore (miễn phí)
  const compressToJpeg = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const MAX_W = 600; // Max width px
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4); // Quality 40%
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadStatus('idle');
    try {
      // Nén ảnh offline → JPEG nhẹ (5-20KB), KHÔNG cần Firebase Storage
      const compressedUrl = await compressToJpeg(file);

      // Xóa placeholder [HÌNH MINH HỌA...] rồi chèn ảnh vào CUỐI nội dung
      const newContent = content
        .replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '')
        .trim() + `\n\n![](${compressedUrl})`;

      onContentChange(newContent);
      setUploadStatus('success');
    } catch (err) {
      console.error('[ImageInserter] Nén ảnh thất bại:', err);
      alert('Không thể xử lý ảnh. Kiểm tra file.');
      setUploadStatus('error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border',
          uploading
            ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-indigo-600/10 border-indigo-600/40 text-indigo-400 hover:bg-indigo-600/20 hover:border-indigo-500'
        )}
      >
        {uploading ? (
          <><BrainCircuit className="w-3.5 h-3.5 animate-spin" /> Đang nén ảnh...</>
        ) : (
          <><ImagePlus className="w-3.5 h-3.5" /> Chèn ảnh vào câu</>  
        )}
      </button>
      {uploadStatus === 'success' && (
        <span className="text-[9px] text-green-500 font-bold flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> ✅ Đã nén & chèn!
        </span>
      )}
    </div>
  );
};

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index, onChange, onRemove, duplicateWarning }) => {
  const [expanded, setExpanded] = useState(true);
  const [showDupDetail, setShowDupDetail] = useState(false);

  const updateField = useCallback(
    <K extends keyof Question>(key: K, value: Question[K]) => {
      onChange({ ...question, [key]: value });
    },
    [question, onChange]
  );

  const updateOption = (optIdx: number, val: string) => {
    const newOpts = [...(question.options ?? [])];
    newOpts[optIdx] = val;
    updateField('options', newOpts);
  };

  const updateP2Answer = (subIdx: number, val: boolean) => {
    // Deep copy mảng boolean hiện tại (tránh stale closure từ useCallback)
    const currentAnswers = Array.isArray(question.correctAnswer)
      ? [...(question.correctAnswer as boolean[])]
      : [false, false, false, false];
    currentAnswers[subIdx] = val;
    // Gọi onChange trực tiếp, bypass updateField memoized
    onChange({ ...question, correctAnswer: currentAnswers });
  };

  const updateOptionText = (optIdx: number, val: string) => {
    const newOpts = [...(question.options ?? [])];
    newOpts[optIdx] = val;
    updateField('options', newOpts);
  };

  const needsImage = hasImagePlaceholder(question.content) || hasImagePlaceholder(question.explanation);
  const needsTable = hasTablePlaceholder(question.content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group bg-slate-900 border rounded-2xl overflow-hidden transition-all duration-500',
        needsImage ? 'border-indigo-700/60 shadow-[0_0_15px_-3px_rgba(79,70,229,0.3)]' : expanded ? 'border-fuchsia-600/50 shadow-[0_0_15px_-3px_rgba(192,38,211,0.15)] z-10 relative scale-[1.01]' : 'border-slate-800 hover:border-slate-600'
      )}
    >
      {/* Card Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-slate-500 font-mono text-sm font-bold">#{index + 1}</span>
          <span className={cn('text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest', PART_COLORS[question.part as Part])}>
            Phần {question.part === 1 ? 'I' : question.part === 2 ? 'II' : 'III'}
          </span>
          <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide', LEVEL_COLORS[question.level])}>
            {question.level}
          </span>
          {/* Badge cảnh báo trùng với ngân hàng */}
          {duplicateWarning && (
            <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-600/20 border border-red-600/40 text-red-400 uppercase tracking-wide animate-pulse">
              <ShieldAlert className="w-2.5 h-2.5" /> Nghi trùng {Math.round(duplicateWarning.similarity * 100)}%
            </span>
          )}
          {/* Badge cảnh báo cần chèn ảnh */}
          {needsImage && (
            <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-600/20 border border-indigo-600/40 text-indigo-400 uppercase tracking-wide">
              <Image className="w-2.5 h-2.5" /> Cần chèn ảnh
            </span>
          )}
          {needsTable && (
            <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-600/20 border border-amber-600/40 text-amber-400 uppercase tracking-wide">
              <TableProperties className="w-2.5 h-2.5" /> Cần điền bảng
            </span>
          )}
          <span className="text-sm text-slate-300 font-medium truncate max-w-[300px]">
            {question.content.replace(/\$[^$]*\$/g, '[LaTeX]').replace(/\[HÌNH MINH HỌA[^\]]*\]/gi, '📷').replace(/\[BẢNG SỐ LIỆU[^\]]*\]/gi, '📊').slice(0, 80)}
            {question.content.length > 80 ? '…' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1.5 text-slate-600 hover:text-red-500 hover:bg-red-600/10 rounded-lg transition-all"
            title="Xóa câu hỏi"
          >
            <XCircle className="w-4 h-4" />
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Card Body */}
      {expanded && (
        <div className="p-6 pt-0 space-y-6 border-t border-slate-800">

          {/* ── Cảnh báo trùng lặp (collapsible) ── */}
          {duplicateWarning && (
            <div className="mt-4 bg-red-600/5 border border-red-600/30 rounded-2xl overflow-hidden">
              <button
                onClick={(e) => { e.stopPropagation(); setShowDupDetail(!showDupDetail); }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-600/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-black text-red-400 uppercase tracking-wider">
                    ⚠️ Phát hiện câu tương tự trong Ngân hàng ({Math.round(duplicateWarning.similarity * 100)}% giống)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-white bg-red-600/20 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-all"
                    title="Xóa câu này khỏi lô chờ duyệt"
                  >
                    <Trash2 className="w-3 h-3" /> Xóa câu trùng
                  </button>
                  {showDupDetail ? <ChevronUp className="w-3.5 h-3.5 text-red-500" /> : <ChevronDown className="w-3.5 h-3.5 text-red-500" />}
                </div>
              </button>
              {showDupDetail && (
                <div className="px-4 pb-4 space-y-3 border-t border-red-600/20">
                  <div className="flex items-center gap-2 pt-3">
                    <Copy className="w-3 h-3 text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Câu gốc trong ngân hàng · P{duplicateWarning.bankPart} · {duplicateWarning.bankTopic}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 leading-relaxed max-h-[250px] overflow-y-auto">
                    <MathRenderer content={duplicateWarning.bankContent} />
                  </div>
                  <p className="text-[9px] text-slate-600 italic">
                    💡 Nếu nội dung thực sự trùng, nhấn "Xóa câu trùng" ở trên để loại khỏi lô trước khi đồng bộ.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Meta Row */}
          <div className="flex flex-wrap gap-3 pt-4">
            {/* Topic selector */}
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-slate-600 uppercase">Chuyên đề</p>
              <select
                value={question.topic}
                onChange={(e) => updateField('topic', e.target.value as Topic)}
                className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-red-600 transition-colors"
              >
                {TOPICS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Level selector */}
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-slate-600 uppercase">Mức độ</p>
              <select
                value={question.level}
                onChange={(e) => updateField('level', e.target.value as QuestionLevel)}
                className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-red-600 transition-colors"
              >
                {LEVELS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Tags input */}
            <div className="space-y-1 flex-1">
              <p className="text-[9px] font-bold text-slate-600 uppercase flex items-center gap-1">
                <Tag className="w-2.5 h-2.5" /> Tags (cách nhau bởi dấu phẩy)
              </p>
              <input
                type="text"
                value={(question.tags ?? []).join(', ')}
                onChange={(e) =>
                  updateField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))
                }
                className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-red-600 transition-colors placeholder:text-slate-600"
                placeholder="VD: Phần I, Azota, Chương 3"
              />
            </div>
          </div>

          {/* Content Editor + Image Inserter */}
          <div className="space-y-2">
            <MathField
              label="Nội dung câu hỏi"
              value={question.content}
              onChange={(v) => updateField('content', v)}
              minHeight={100}
            />
            {/* Hiển thị ImageInserter nếu có placeholder ảnh */}
            {needsImage && (
              <div className="flex items-center gap-3 p-3 bg-indigo-600/5 border border-indigo-600/20 rounded-xl">
                <Image className="w-4 h-4 text-indigo-400 shrink-0" />
                <p className="text-[10px] text-indigo-400 font-bold flex-1">
                  Câu này có hình minh họa — upload ảnh để tự động thay thế placeholder:
                </p>
                <ImageInserter
                  content={question.content}
                  onContentChange={(v) => updateField('content', v)}
                />
              </div>
            )}
            {/* Cảnh báo bảng số liệu */}
            {needsTable && (
              <div className="flex items-center gap-3 p-3 bg-amber-600/5 border border-amber-600/20 rounded-xl">
                <TableProperties className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-[10px] text-amber-400 font-bold">
                  Câu này có bảng số liệu — hãy click "Sửa" ở trên và copy nội dung bảng vào vị trí placeholder.
                </p>
              </div>
            )}
          </div>

          {/* ── PHẦN I: Options + Radio ── */}
          {question.part === 1 && question.options && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Phương án lựa chọn (☑ = Đáp án đúng)
              </p>
              {question.options.map((opt, idx) => {
                const isCorrect = question.correctAnswer === idx;
                return (
                  <div key={idx} className={cn(
                    'flex items-start gap-3 p-3 rounded-xl border transition-all',
                    isCorrect
                      ? 'bg-green-600/10 border-green-600/40'
                      : 'bg-slate-800/50 border-slate-700'
                  )}>
                    {/* Radio button */}
                    <button
                      onClick={() => updateField('correctAnswer', idx)}
                      className="mt-1 shrink-0"
                      title={`Đặt làm đáp án đúng: ${String.fromCharCode(65 + idx)}`}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                        isCorrect ? 'border-green-500 bg-green-500' : 'border-slate-600'
                      )}>
                        {isCorrect && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </button>

                    <span className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5',
                      isCorrect ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
                    )}>
                      {String.fromCharCode(65 + idx)}
                    </span>

                    <div className="flex-1">
                      <MathField
                        value={opt}
                        onChange={(v) => updateOptionText(idx, v)}
                        minHeight={56}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PHẦN II: Sub-items + Checkbox ── */}
          {question.part === 2 && question.options && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Các ý con (☑ = Đúng, ☐ = Sai)
              </p>
              {question.options.map((opt, idx) => {
                const answers = (question.correctAnswer as boolean[]) ?? [];
                const isTrue = answers[idx] === true;
                return (
                  <div key={idx} className={cn(
                    'flex items-start gap-3 p-3 rounded-xl border transition-all',
                    isTrue ? 'bg-green-600/10 border-green-600/40' : 'bg-red-600/5 border-red-600/20'
                  )}>
                    {/* Checkbox custom */}
                    <button
                      onClick={() => updateP2Answer(idx, !isTrue)}
                      className="mt-1 shrink-0"
                    >
                      <div className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                        isTrue ? 'border-green-500 bg-green-500' : 'border-slate-600'
                      )}>
                        {isTrue && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>

                    <span className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5',
                      isTrue ? 'bg-green-600 text-white' : 'bg-red-600/30 text-red-400'
                    )}>
                      {String.fromCharCode(97 + idx)}
                    </span>

                    <div className="flex-1">
                      <MathField
                        value={opt}
                        onChange={(v) => updateOption(idx, v)}
                        minHeight={56}
                      />
                    </div>

                    <span className={cn(
                      'mt-1 shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-full',
                      isTrue ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                    )}>
                      {isTrue ? 'Đúng' : 'Sai'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PHẦN III: số đáp án ── */}
          {question.part === 3 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Hash className="w-3 h-3" /> Đáp án số
              </p>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={String(question.correctAnswer ?? '')}
                    onChange={(e) => updateField('correctAnswer', parseFloat(e.target.value) || 0)}
                    className="w-48 bg-slate-800 border-2 border-slate-700 text-white text-2xl font-black rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-700 text-center"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                  Nhập kết quả số. Parser đã tự map từ bảng đáp án — thầy chỉ cần kiểm tra lại.
                </p>
              </div>
            </div>
          )}

          {/* Explanation Editor */}
          <MathField
            label="Lời giải chi tiết"
            value={question.explanation}
            onChange={(v) => updateField('explanation', v)}
            minHeight={120}
          />
        </div>
      )}
    </motion.div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────

const QuestionReviewBoard: React.FC<QuestionReviewBoardProps> = ({
  initialQuestions,
  parseErrors,
  topic,
  onSync,
  onCancel,
  bankQuestions,
}) => {
  // ── Normalize correctAnswer ngay khi nhận initialQuestions ──
  const normalizedInitial = useMemo(() => normalizeQuestions(initialQuestions), [initialQuestions]);
  const [questions, setQuestions] = useState<Question[]>(normalizedInitial);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showErrors, setShowErrors] = useState(parseErrors.length > 0);
  const [syncDone, setSyncDone] = useState(false);
  // ── Duplicate check state ──
  const [duplicateMap, setDuplicateMap] = useState<Map<number, BankDuplicateMatch>>(new Map());
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [dupCheckDone, setDupCheckDone] = useState(false);

  // ── Pre-compute bank vectors (1 lần khi mount) ──
  const preparedBank = useMemo(() => {
    if (!bankQuestions || bankQuestions.length === 0) return [];
    return prepareBankVectors(
      bankQuestions.map(q => ({
        id: q.id!,
        content: q.content,
        options: q.options,
        part: q.part,
        topic: q.topic,
        level: q.level,
      }))
    );
  }, [bankQuestions]);

  // ── Quét trùng khi mount (nếu có bank) ──
  useEffect(() => {
    if (preparedBank.length === 0 || dupCheckDone) return;
    setIsCheckingDuplicates(true);

    // Chạy async để không block UI
    requestAnimationFrame(() => {
      setTimeout(() => {
        const map = new Map<number, BankDuplicateMatch>();
        for (let i = 0; i < initialQuestions.length; i++) {
          const q = initialQuestions[i];
          const match = checkAgainstBank(
            { content: q.content, options: q.options },
            preparedBank,
            0.7 // threshold 70%
          );
          if (match) {
            map.set(i, match);
          }
        }
        setDuplicateMap(map);
        setIsCheckingDuplicates(false);
        setDupCheckDone(true);
      }, 50);
    });
  }, [preparedBank, initialQuestions, dupCheckDone]);

  const handleChange = useCallback((index: number, updated: Question) => {
    setQuestions(prev => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const handleRemove = useCallback((index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSync(questions);
      setSyncDone(true);
    } catch (e) {
      console.error('[ReviewBoard] Sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const stats = {
    p1: questions.filter(q => q.part === 1).length,
    p2: questions.filter(q => q.part === 2).length,
    p3: questions.filter(q => q.part === 3).length,
  };

  return (
    <div className="w-full space-y-6" data-color-mode="dark">

      {/* ── Header ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter">
              BẢNG HIỆU CHỈNH CÂU HỎI
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {questions.length} câu sẵn sàng · 
              <span className="text-red-400 font-bold"> Phần I: {stats.p1}</span> · 
              <span className="text-amber-400 font-bold"> Phần II: {stats.p2}</span> · 
              <span className="text-blue-400 font-bold"> Phần III: {stats.p3}</span>
              {duplicateMap.size > 0 && (
                <> · <span className="text-red-500 font-bold">⚠️ {duplicateMap.size} câu nghi trùng</span></>
              )}
              {isCheckingDuplicates && (
                <> · <span className="text-yellow-500 font-bold animate-pulse">🔍 Đang kiểm tra trùng lặp...</span></>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest hover:text-white hover:border-slate-500 transition-all"
            >
              Hủy
            </button>
            <button
              onClick={handleSync}
              disabled={isSyncing || syncDone || questions.length === 0}
              className={cn(
                'flex items-center gap-2 px-8 py-2.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-xl',
                syncDone
                  ? 'bg-green-600 text-white shadow-green-900/30 cursor-default'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isSyncing ? (
                <>
                  <BrainCircuit className="w-4 h-4 animate-spin" />
                  Đang đồng bộ...
                </>
              ) : syncDone ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Đã đồng bộ thành công!
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Đồng bộ lên Kho Dữ Liệu ({questions.length} câu)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Parse errors banner */}
        {parseErrors.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowErrors(!showErrors)}
              className="flex items-center gap-2 text-amber-500 text-xs font-bold hover:text-amber-400 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              {parseErrors.length} cảnh báo từ parser — click để {showErrors ? 'ẩn' : 'xem'}
            </button>
            {showErrors && (
              <div className="mt-3 bg-amber-600/5 border border-amber-600/20 rounded-2xl p-4 space-y-2 max-h-48 overflow-y-auto">
                {parseErrors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-400">
                    <span className="font-mono font-bold shrink-0 text-amber-600">Dòng {err.line}:</span>
                    <span>{err.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Question Cards ── */}
      {questions.length === 0 ? (
        <div className="text-center py-20 text-slate-600 italic">
          Không có câu hỏi nào để hiệu chỉnh.
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <QuestionCard
              key={`${q.part}-${i}`}
              question={q}
              index={i}
              onChange={(updated) => handleChange(i, updated)}
              onRemove={() => handleRemove(i)}
              duplicateWarning={duplicateMap.get(i) ?? null}
            />
          ))}
        </div>
      )}

      {/* ── Bottom Sticky Sync Bar ── */}
      {questions.length > 0 && (
        <div className="sticky bottom-6 z-50">
          <button
            onClick={handleSync}
            disabled={isSyncing || syncDone}
            className={cn(
              'w-full flex items-center justify-center gap-3 py-5 rounded-2xl font-black text-lg uppercase tracking-widest transition-all shadow-2xl',
              syncDone
                ? 'bg-green-600 text-white shadow-green-900/50'
                : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-red-900/50 disabled:opacity-60 disabled:cursor-not-allowed'
            )}
          >
            {isSyncing ? (
              <>
                <BrainCircuit className="w-6 h-6 animate-spin" />
                Đang xử lý và đồng bộ {questions.length} câu hỏi lên Firebase...
              </>
            ) : syncDone ? (
              <>
                <CheckCircle2 className="w-6 h-6" />
                Đồng bộ hoàn tất! Đã thêm {questions.length} câu vào Kho Dữ Liệu.
              </>
            ) : (
              <>
                <Upload className="w-6 h-6" />
                Đồng bộ lên Kho Dữ Liệu · {questions.length} câu · 
                P1:{stats.p1} · P2:{stats.p2} · P3:{stats.p3}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default QuestionReviewBoard;
