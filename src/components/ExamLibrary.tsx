/**
 * ExamLibrary.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Admin module: Thư mục Đề thi — quản lý toàn bộ đề, xem chi tiết,
 * phát hành / ẩn đề, xóa đề lỗi.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  db, collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, getDoc, getDocs, Timestamp
} from '../firebase';
import { Exam, Question } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from './Toast';
import MathRenderer from '../lib/MathRenderer';
import {
  FolderOpen, Trash2, Eye, EyeOff, ChevronDown, ChevronUp,
  FileText, Clock, CheckCircle2, AlertTriangle, Search, X,
  BookOpen, BrainCircuit, Zap, Filter, Pencil, Save, Printer, RefreshCw, Users
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { PrintableExamView } from './PrintableExamView';
import { ExamResultsModal } from './ExamResultsModal';

// ── Exam type labels ──
const TYPE_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  'Matrix': { label: 'Ma trận', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30', icon: BookOpen },
  'AI_Diagnosis': { label: 'Chẩn đoán AI', color: 'bg-purple-600/20 text-purple-400 border-purple-600/30', icon: BrainCircuit },
  'Custom': { label: 'Tùy chỉnh', color: 'bg-amber-600/20 text-amber-400 border-amber-600/30', icon: Zap },
  'Digitized': { label: 'Số hóa', color: 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30', icon: FileText },
};

interface ExamLibraryProps {
  onCountChanged?: (delta: number) => void;
}

const ExamLibrary: React.FC<ExamLibraryProps> = ({ onCountChanged }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null); // null | examId | '__all__'
  const [selectedExamResults, setSelectedExamResults] = useState<Exam | null>(null);
  
  // ── Print State ──
  const printRef = React.useRef<HTMLDivElement>(null);
  const [printingExam, setPrintingExam] = useState<Exam | null>(null);

  const handlePrintParams = useReactToPrint({
    contentRef: printRef, // useReactToPrint v3 uses contentRef
    // @ts-ignore - TS might complain depending on react-to-print version
    onBeforeGetContent: () => {
      // Xác nhận fix: Delay 800ms để đảm bảo MathRenderer (KaTeX) và Ảnh render xong
      // trước khi mở hộp thoại Print của trình duyệt.
      return new Promise<void>((resolve) => setTimeout(resolve, 800));
    },
    onAfterPrint: () => setPrintingExam(null),
  });

  useEffect(() => {
    if (printingExam && printRef.current) {
      handlePrintParams();
    }
  }, [printingExam, handlePrintParams]);

  // ── Real-time listener ──
  useEffect(() => {
    const q = query(collection(db, 'exams'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() } as Exam)));
      setLoading(false);
    }, (err) => {
      console.error('[ExamLibrary] Firestore error:', err);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Filtered exams ──
  const filtered = useMemo(() => {
    let result = exams;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.type || '').toLowerCase().includes(q) ||
        (e.sourceFile || '').toLowerCase().includes(q)
      );
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(e => e.type === filterType);
    }

    // Status filter
    if (filterStatus === 'published') {
      result = result.filter(e => e.published === true);
    } else if (filterStatus === 'draft') {
      result = result.filter(e => e.published === false || e.published === undefined);
    }

    return result;
  }, [exams, searchQuery, filterType, filterStatus]);

  // ── Stats ──
  const stats = useMemo(() => {
    const published = exams.filter(e => e.published === true).length;
    const draft = exams.length - published;
    const totalQuestions = exams.reduce((sum, e) => sum + (e.questions?.length || 0), 0);
    return { total: exams.length, published, draft, totalQuestions };
  }, [exams]);

  // ── Toggle Published (AUTO-SYNC khi xuất bản) ──
  const handleTogglePublish = async (exam: Exam) => {
    if (!exam.id || togglingId) return;
    const willPublish = !(exam.published === true);
    setTogglingId(exam.id);
    try {
      if (willPublish && exam.questions?.length) {
        // ═══ AUTO-SYNC TỪ KHO TRƯỚC KHI XUẤT BẢN ═══
        const updatedQuestions = [...exam.questions];
        let syncedCount = 0;

        for (let i = 0; i < updatedQuestions.length; i++) {
          const q = updatedQuestions[i];
          if (!q.id) continue;
          try {
            const bankDoc = await getDoc(doc(db, 'questions', q.id));
            if (!bankDoc.exists()) continue;
            const bankQ = bankDoc.data() as Question;
            // Chỉ lấy câu đã duyệt
            if ((bankQ.status || 'draft') === 'draft') continue;
            updatedQuestions[i] = { ...bankQ, id: q.id };
            syncedCount++;
          } catch { /* skip */ }
        }

        await updateDoc(doc(db, 'exams', exam.id), {
          published: true,
          questions: updatedQuestions,
          lastSyncedAt: Timestamp.now()
        });
        toast.success(
          `✅ Đề "${exam.title}" đã được XUẤT BẢN!` +
          (syncedCount > 0 ? ` (Đã đồng bộ ${syncedCount} câu mới nhất từ Kho)` : '')
        );
      } else {
        // Ẩn đề — chỉ toggle published
        await updateDoc(doc(db, 'exams', exam.id), { published: false });
        toast.success(`🔒 Đề "${exam.title}" đã được ẨN khỏi trang học sinh.`);
      }
    } catch (err) {
      console.error('[ExamLibrary] Toggle publish error:', err);
      toast.error('Lỗi cập nhật trạng thái đề thi.');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Rename Exam ──
  const handleStartEdit = (exam: Exam, e: React.MouseEvent) => {
    e.stopPropagation();
    if (exam.id) {
      setEditingId(exam.id);
      setEditTitle(exam.title || '');
    }
  };

  const handleSaveEdit = async (exam: Exam, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!exam.id || !editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateDoc(doc(db, 'exams', exam.id), { title: editTitle.trim() });
      toast.success('Đã lưu tên đề thi mới.');
    } catch (err) {
      console.error('[ExamLibrary] Rename error:', err);
      toast.error('Lỗi khi đổi tên đề thi.');
    } finally {
      setEditingId(null);
      setEditTitle('');
    }
  };

  // ── Delete Exam ──
  const handleDelete = async (exam: Exam) => {
    if (!exam.id || deletingId) return;
    if (!window.confirm(`⚠️ Bạn chắc chắn muốn XÓA VĨNH VIỄN đề "${exam.title}"?\n\nHành động này không thể hoàn tác!`)) return;
    setDeletingId(exam.id);
    try {
      await deleteDoc(doc(db, 'exams', exam.id));
      toast.success(`🗑️ Đã xóa đề "${exam.title}".`);
      onCountChanged?.(-1);
    } catch (err) {
      console.error('[ExamLibrary] Delete error:', err);
      toast.error('Lỗi xóa đề thi.');
    } finally {
      setDeletingId(null);
    }
  };

  // ══════════════════════════════════════════════════════════════════
  // ── ĐỒNG BỘ TỪ KHO NGÂN HÀNG (Chỉ câu đã duyệt) ──
  // ══════════════════════════════════════════════════════════════════

  /** Đồng bộ 1 đề thi: lấy bản mới nhất từ kho `questions`, chỉ cập nhật câu 'published'. */
  const handleSyncFromBank = async (exam: Exam) => {
    if (!exam.id || syncingId) return;
    setSyncingId(exam.id);
    try {
      const updatedQuestions = [...exam.questions];
      let syncedCount = 0;
      let skippedDraft = 0;
      let notFound = 0;

      for (let i = 0; i < updatedQuestions.length; i++) {
        let q = updatedQuestions[i];
        
        // CỨU CÁC ĐỀ CŨ BỊ MẤT ID: Fallback lấy ID từ exam.questionIds
        if ((!q.id || q.id.startsWith('q_temp') || q.id.length < 15) && exam.questionIds && exam.questionIds[i]) {
          q = { ...q, id: exam.questionIds[i] };
          updatedQuestions[i] = q; // Cập nhật lại array
        }

        if (!q.id || q.id.length < 15) { notFound++; continue; } // length < 15 to skip q_temp_...

        try {
          const bankDoc = await getDoc(doc(db, 'questions', q.id));
          if (!bankDoc.exists()) { notFound++; continue; }

          const bankQuestion = bankDoc.data() as Question;

          // ⛔ CHỈ ĐỒNG BỘ CÂU ĐÃ DUYỆT (published) — mặc định 'published' nếu chưa gán status
          if ((bankQuestion.status || 'published') === 'draft') {
            skippedDraft++;
            continue;
          }

          // Thay thế bằng bản mới nhất, giữ nguyên ID
          updatedQuestions[i] = { ...bankQuestion, id: q.id };
          syncedCount++;
        } catch (fetchErr) {
          console.warn(`[Sync] Lỗi đọc câu ${q.id}:`, fetchErr);
        }
      }

      if (syncedCount > 0) {
        await updateDoc(doc(db, 'exams', exam.id), { questions: updatedQuestions });
        toast.success(
          `✅ Đã cập nhật ${syncedCount} câu đã duyệt vào đề "${exam.title}".` +
          (skippedDraft > 0 ? ` (${skippedDraft} câu chưa duyệt — bỏ qua)` : '')
        );
      } else {
        toast.info(
          `Đề "${exam.title}" — không có câu nào cần cập nhật.` +
          (skippedDraft > 0 ? ` (${skippedDraft} câu chưa duyệt — bỏ qua)` : '')
        );
      }
    } catch (err) {
      console.error('[Sync] Error:', err);
      toast.error('Lỗi khi đồng bộ đề thi. Vui lòng thử lại.');
    } finally {
      setSyncingId(null);
    }
  };

  /** Đồng bộ TẤT CẢ đề thi cùng lúc. */
  const handleSyncAll = async () => {
    if (syncingId) return;
    if (!window.confirm(
      `🔄 Đồng bộ TẤT CẢ ${exams.length} đề thi từ Kho Ngân Hàng?\n\n` +
      `Chỉ những câu hỏi ĐÃ DUYỆT (published) mới được cập nhật.\n` +
      `Câu chưa duyệt sẽ được giữ nguyên phiên bản cũ.`
    )) return;

    setSyncingId('__all__');
    let totalSynced = 0;
    let totalExamsUpdated = 0;

    try {
      for (const exam of exams) {
        if (!exam.id || !exam.questions?.length) continue;

        const updatedQuestions = [...exam.questions];
        let examSynced = 0;

        for (let i = 0; i < updatedQuestions.length; i++) {
          let q = updatedQuestions[i];
          
          // CỨU CÁC ĐỀ CŨ: Fallback ID
          if ((!q.id || q.id.startsWith('q_temp') || q.id.length < 15) && exam.questionIds && exam.questionIds[i]) {
            q = { ...q, id: exam.questionIds[i] };
            updatedQuestions[i] = q;
          }

          if (!q.id || q.id.length < 15) continue;

          try {
            const bankDoc = await getDoc(doc(db, 'questions', q.id));
            if (!bankDoc.exists()) continue;
            const bankQuestion = bankDoc.data() as Question;
            if ((bankQuestion.status || 'published') === 'draft') continue;

            updatedQuestions[i] = { ...bankQuestion, id: q.id };
            examSynced++;
          } catch { /* skip */ }
        }

        if (examSynced > 0) {
          await updateDoc(doc(db, 'exams', exam.id), { questions: updatedQuestions });
          totalExamsUpdated++;
          totalSynced += examSynced;
        }
      }

      if (totalSynced > 0) {
        toast.success(`✅ Hoàn tất! Đã cập nhật ${totalSynced} câu hỏi trên ${totalExamsUpdated} đề thi.`);
      } else {
        toast.info('Tất cả đề thi đã đồng bộ — không có câu nào cần cập nhật.');
      }
    } catch (err) {
      console.error('[SyncAll] Error:', err);
      toast.error('Lỗi khi đồng bộ hàng loạt.');
    } finally {
      setSyncingId(null);
    }
  };

  // ── Format date ──
  const formatDate = (ts: any): string => {
    if (!ts) return '—';
    const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="w-full space-y-6">
      {/* ══════ HEADER ══════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter flex items-center gap-3">
              <FolderOpen className="text-fuchsia-500" />
              THƯ MỤC ĐỀ THI
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Quản lý, xem lại và phát hành đề thi cho học sinh.
            </p>
          </div>

          {/* ── Nút Đồng bộ toàn bộ ── */}
          <button
            onClick={handleSyncAll}
            disabled={syncingId !== null || exams.length === 0}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border shadow-lg',
              syncingId === '__all__'
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 cursor-wait'
                : 'bg-gradient-to-r from-blue-600/10 to-fuchsia-600/10 border-blue-600/30 text-blue-400 hover:border-blue-500 hover:shadow-blue-900/20'
            )}
            title="Quét toàn bộ đề thi và cập nhật câu hỏi đã duyệt từ Kho Ngân Hàng"
          >
            <RefreshCw className={cn('w-4 h-4', syncingId === '__all__' && 'animate-spin')} />
            {syncingId === '__all__' ? 'Đang đồng bộ...' : '🔄 Đồng bộ tất cả từ Kho'}
          </button>
        </div>

        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Tổng đề', value: stats.total, color: 'text-white', bg: 'bg-slate-800 border-slate-700' },
            { label: 'Đã phát hành', value: stats.published, color: 'text-emerald-400', bg: 'bg-emerald-600/10 border-emerald-600/30' },
            { label: 'Nháp / Ẩn', value: stats.draft, color: 'text-amber-400', bg: 'bg-amber-600/10 border-amber-600/30' },
            { label: 'Tổng câu hỏi', value: stats.totalQuestions, color: 'text-cyan-400', bg: 'bg-cyan-600/10 border-cyan-600/30' },
          ].map(s => (
            <div key={s.label} className={cn('rounded-2xl p-4 text-center border', s.bg)}>
              <p className={cn('text-2xl font-black', s.color)}>{s.value}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Search + Filters ── */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên đề, loại, file nguồn..."
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl pl-10 pr-10 py-2.5 focus:outline-none focus:border-fuchsia-500/50 transition-colors placeholder:text-slate-600"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
            >
              <option value="all">Tất cả loại</option>
              <option value="Matrix">Ma trận</option>
              <option value="AI_Diagnosis">Chẩn đoán AI</option>
              <option value="Digitized">Số hóa</option>
              <option value="Custom">Tùy chỉnh</option>
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
            >
              <option value="all">Mọi trạng thái</option>
              <option value="published">Đã phát hành</option>
              <option value="draft">Nháp / Ẩn</option>
            </select>
          </div>
        </div>
      </div>

      {/* ══════ EXAM LIST ══════ */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 p-12 rounded-3xl text-center">
          <FolderOpen className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 font-bold">
            {exams.length === 0 ? 'Chưa có đề thi nào. Tạo đề đầu tiên từ AI Số hóa hoặc Tạo Đề!' : 'Không tìm thấy đề khớp bộ lọc.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map((exam, idx) => {
              const isExpanded = expandedId === exam.id;
              const isPublished = exam.published === true;
              const typeInfo = TYPE_LABELS[exam.type] || TYPE_LABELS['Custom'];
              const TypeIcon = typeInfo.icon;

              return (
                <motion.div
                  key={exam.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  className={cn(
                    'bg-slate-900 border rounded-2xl overflow-hidden transition-all duration-300',
                    isExpanded
                      ? 'border-fuchsia-600/50 shadow-[0_0_20px_-5px_rgba(192,38,211,0.2)]'
                      : 'border-slate-800 hover:border-slate-600'
                  )}
                >
                  {/* ── Row Header ── */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-800/40 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : exam.id!)}
                  >
                    {/* Publish Status Indicator */}
                    <div className={cn(
                      'w-3 h-3 rounded-full shrink-0',
                      isPublished ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-600'
                    )} />

                    {/* Type badge */}
                    <span className={cn(
                      'text-[9px] font-black px-2 py-1 rounded-full border uppercase tracking-widest shrink-0',
                      typeInfo.color
                    )}>
                      <TypeIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
                      {typeInfo.label}
                    </span>

                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      {editingId === exam.id ? (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveEdit(exam, e as any);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="bg-slate-800 border border-fuchsia-500/50 text-white text-sm font-black rounded-lg px-3 py-1 focus:outline-none w-full max-w-sm"
                            autoFocus
                          />
                          <button
                            onClick={e => handleSaveEdit(exam, e)}
                            className="p-1.5 text-emerald-400 hover:bg-emerald-400/20 rounded-lg transition-colors"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setEditingId(null); }}
                            className="p-1.5 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-white truncate" title={exam.title}>
                            {exam.title || 'Đề không tên'}
                          </p>
                          <button
                            onClick={e => handleStartEdit(exam, e)}
                            className="p-1 text-slate-500 hover:text-fuchsia-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-slate-800"
                            title="Đổi tên đề thi"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(exam.createdAt)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {exam.questions?.length || 0} câu
                        </span>
                        {exam.sourceFile && (
                          <span className="text-[10px] text-cyan-600 truncate max-w-[120px]">
                            📄 {exam.sourceFile}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      {/* Toggle Publish */}
                      <button
                        onClick={() => handleTogglePublish(exam)}
                        disabled={togglingId === exam.id}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border',
                          isPublished
                            ? 'bg-emerald-600/10 border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/20'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                        )}
                        title={isPublished ? 'Ẩn đề (HS sẽ không thấy)' : 'Phát hành cho HS'}
                      >
                        {togglingId === exam.id ? (
                          <div className="w-3 h-3 border-2 border-current rounded-full border-t-transparent animate-spin" />
                        ) : isPublished ? (
                          <><Eye className="w-3 h-3" /> Đang phát hành</>
                        ) : (
                          <><EyeOff className="w-3 h-3" /> Nháp</>
                        )}
                      </button>

                      {/* Sync from Bank */}
                      <button
                        onClick={() => handleSyncFromBank(exam)}
                        disabled={syncingId !== null}
                        className={cn(
                          'p-1.5 rounded-lg transition-all',
                          syncingId === exam.id
                            ? 'text-blue-400 bg-blue-600/10'
                            : 'text-slate-400 hover:text-blue-400 hover:bg-blue-600/10'
                        )}
                        title="Đồng bộ câu hỏi đã duyệt từ Kho Ngân Hàng"
                      >
                        {syncingId === exam.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>

                      {/* Xem Kết Quả */}
                      <button
                        onClick={() => setSelectedExamResults(exam)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-600/10 rounded-lg transition-all"
                        title="Xem kết quả làm bài của học sinh"
                      >
                        <Users className="w-4 h-4" />
                      </button>

                      {/* Print PDF */}
                      <button
                        onClick={() => setPrintingExam(exam)}
                        className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-600/10 rounded-lg transition-all"
                        title="Xuất PDF Đề Thi"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(exam)}
                        disabled={deletingId === exam.id}
                        className="p-1.5 text-slate-600 hover:text-red-500 hover:bg-red-600/10 rounded-lg transition-all"
                        title="Xóa đề thi"
                      >
                        {deletingId === exam.id ? (
                          <div className="w-4 h-4 border-2 border-red-500 rounded-full border-t-transparent animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Chevron */}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </div>

                  {/* ── Expanded: Question List ── */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="border-t border-slate-800"
                    >
                      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                        {/* Part breakdown */}
                        <div className="flex gap-3 mb-4">
                          {[
                            { label: 'Phần I · TNKQ', count: exam.questions?.filter(q => q.part === 1).length || 0, color: 'text-blue-400 bg-blue-600/10 border-blue-600/20' },
                            { label: 'Phần II · Đ/S', count: exam.questions?.filter(q => q.part === 2).length || 0, color: 'text-amber-400 bg-amber-600/10 border-amber-600/20' },
                            { label: 'Phần III · TLN', count: exam.questions?.filter(q => q.part === 3).length || 0, color: 'text-emerald-400 bg-emerald-600/10 border-emerald-600/20' },
                          ].map(p => (
                            <div key={p.label} className={cn('rounded-xl px-3 py-2 text-center border flex-1', p.color)}>
                              <p className="text-lg font-black">{p.count}</p>
                              <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">{p.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Question cards */}
                        {exam.questions?.map((q, qi) => (
                          <div
                            key={qi}
                            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-2"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-mono font-bold text-slate-500">#{qi + 1}</span>
                              <span className={cn(
                                'text-[9px] font-black px-2 py-0.5 rounded-full uppercase',
                                q.part === 1 ? 'bg-blue-600/20 text-blue-400' :
                                  q.part === 2 ? 'bg-amber-600/20 text-amber-400' :
                                    'bg-emerald-600/20 text-emerald-400'
                              )}>
                                P{q.part}
                              </span>
                              <span className="text-[9px] font-bold text-slate-500">{q.topic}</span>
                              <span className="text-[9px] font-bold text-slate-600">{q.level}</span>
                            </div>
                            <div className="text-sm text-slate-300 leading-relaxed line-clamp-3">
                              <MathRenderer content={q.content.slice(0, 300)} />
                            </div>
                            {q.options && q.options.length > 0 && (
                              <div className="grid grid-cols-2 gap-1.5 mt-1">
                                {q.options.map((opt, oi) => (
                                  <div key={oi} className={cn(
                                    'text-[11px] px-2 py-1 rounded-lg border',
                                    q.part === 1 && q.correctAnswer === oi
                                      ? 'bg-green-600/10 border-green-600/30 text-green-400'
                                      : q.part === 2 && Array.isArray(q.correctAnswer) && q.correctAnswer[oi]
                                        ? 'bg-green-600/10 border-green-600/30 text-green-400'
                                        : 'bg-slate-900/50 border-slate-700/50 text-slate-400'
                                  )}>
                                    <span className="font-bold mr-1">
                                      {q.part === 2 ? String.fromCharCode(97 + oi) + ')' : String.fromCharCode(65 + oi) + '.'}
                                    </span>
                                    {opt.slice(0, 80)}{opt.length > 80 ? '…' : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}

                        {(!exam.questions || exam.questions.length === 0) && (
                          <div className="text-center py-6 text-slate-600">
                            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-600" />
                            <p className="text-sm font-bold">Đề này không có câu hỏi nào.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Hidden layout for PDF Export */}
      <div style={{ display: 'none' }}>
        {printingExam && (
           <PrintableExamView ref={printRef} exam={printingExam} />
        )}
      </div>

      {/* Modal Xem Kết Quả */}
      {selectedExamResults && (
        <ExamResultsModal 
           exam={selectedExamResults} 
           onClose={() => setSelectedExamResults(null)} 
        />
      )}
    </div>
  );
};

export default ExamLibrary;
