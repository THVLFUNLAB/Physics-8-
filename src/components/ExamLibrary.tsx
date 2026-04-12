/**
 * ExamLibrary.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Admin module: Thư mục Đề thi — quản lý toàn bộ đề, xem chi tiết,
 * phát hành / ẩn đề, xóa đề lỗi.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  db, collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, Timestamp
} from '../firebase';
import { Exam, Question } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from './Toast';
import MathRenderer from '../lib/MathRenderer';
import {
  FolderOpen, Trash2, Eye, EyeOff, ChevronDown, ChevronUp,
  FileText, Clock, CheckCircle2, AlertTriangle, Search, X,
  BookOpen, BrainCircuit, Zap, Filter
} from 'lucide-react';

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

  // ── Toggle Published ──
  const handleTogglePublish = async (exam: Exam) => {
    if (!exam.id || togglingId) return;
    const newStatus = !(exam.published === true);
    setTogglingId(exam.id);
    try {
      await updateDoc(doc(db, 'exams', exam.id), { published: newStatus });
      toast.success(newStatus
        ? `✅ Đề "${exam.title}" đã được PHÁT HÀNH cho học sinh.`
        : `🔒 Đề "${exam.title}" đã được ẨN khỏi trang học sinh.`
      );
    } catch (err) {
      console.error('[ExamLibrary] Toggle publish error:', err);
      toast.error('Lỗi cập nhật trạng thái đề thi.');
    } finally {
      setTogglingId(null);
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
                      <p className="text-sm font-black text-white truncate">
                        {exam.title || 'Đề không tên'}
                      </p>
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
    </div>
  );
};

export default ExamLibrary;
