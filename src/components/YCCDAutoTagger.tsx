/**
 * ═══════════════════════════════════════════════════════════════
 *  YCCDAutoTagger.tsx — Review Hub for Auto-Tagging YCCĐ
 *  Giao diện Admin để duyệt và phê duyệt YCCĐ tự động
 * ═══════════════════════════════════════════════════════════════
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  db, collection, getDocs, getDocsFromServer, updateDoc, doc, writeBatch
} from '../firebase';
import { Question } from '../types';
import { batchMatchYCCD } from '../services/yccdMatcher';
import { getYCCDByCode } from '../data/yccdData';
import { SearchableYCCDDropdown } from './common/SearchableYCCDDropdown';
import { toast } from './Toast';
import MathRenderer from '../lib/MathRenderer';
import {
  BrainCircuit, Play, CheckCircle2, XCircle, RefreshCw,
  ChevronDown, ChevronRight, Loader2, Check, X, Search,
  Target, Zap, Filter, ChevronLeft, Save
} from 'lucide-react';

interface TagSuggestion {
  questionId: string;
  question: Question;
  suggestions: {
    yccdCode: string;
    score: number;
    yccd: { code: string; grade: string; topic: string; content: string };
    matchedKeywords: string[];
  }[];
  selectedCode: string;       // YCCĐ đã chọn (mặc định = top suggestion)
  status: 'pending' | 'approved' | 'skipped';
}

const ITEMS_PER_PAGE = 20;

const YCCDAutoTagger = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<TagSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterScore, setFilterScore] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // ── Stats ──
  const stats = useMemo(() => {
    const total = questions.length;
    const tagged = questions.filter(q => q.yccdCode && q.yccdCode.trim() !== '').length;
    const untagged = total - tagged;
    const approved = results.filter(r => r.status === 'approved').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const pending = results.filter(r => r.status === 'pending').length;
    return { total, tagged, untagged, approved, skipped, pending, scanned: results.length };
  }, [questions, results]);

  // ── Load questions ──
  const loadQuestions = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocsFromServer(collection(db, 'questions'));
      const qs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Question));
      setQuestions(qs);
      toast.success(`Đã tải ${qs.length} câu hỏi.`);
    } catch (err) {
      console.error('[YCCD] Load error:', err);
      toast.error('Lỗi tải câu hỏi từ database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadQuestions(); }, []);

  // ── Run Auto-Tagging (LOCAL, FREE) ──
  const runAutoTag = () => {
    setScanning(true);
    // Run in setTimeout to not block UI
    setTimeout(() => {
      try {
        const batchResults = batchMatchYCCD(questions);
        const tagSuggestions: TagSuggestion[] = batchResults.map(r => ({
          questionId: r.questionId,
          question: r.question,
          suggestions: r.suggestions,
          selectedCode: r.suggestions[0]?.yccdCode || '',
          status: 'pending' as const,
        }));

        // Sort by highest confidence first
        tagSuggestions.sort((a, b) => (b.suggestions[0]?.score || 0) - (a.suggestions[0]?.score || 0));

        setResults(tagSuggestions);
        setCurrentPage(1);
        toast.success(`Phân tích xong! Tìm thấy ${tagSuggestions.length} câu hỏi cần gắn YCCĐ.`);
      } catch (err) {
        console.error('[YCCD] Auto-tag error:', err);
        toast.error('Lỗi khi phân tích câu hỏi.');
      } finally {
        setScanning(false);
      }
    }, 100);
  };

  // ── Filter & Paginate ──
  const filtered = useMemo(() => {
    let items = results;

    // Score filter
    if (filterScore === 'high') items = items.filter(r => (r.suggestions[0]?.score || 0) >= 60);
    else if (filterScore === 'medium') items = items.filter(r => { const s = r.suggestions[0]?.score || 0; return s >= 30 && s < 60; });
    else if (filterScore === 'low') items = items.filter(r => (r.suggestions[0]?.score || 0) < 30);

    // Search
    if (searchQuery.trim()) {
      const needle = searchQuery.toLowerCase();
      items = items.filter(r =>
        r.question.content.toLowerCase().includes(needle) ||
        r.question.topic?.toLowerCase().includes(needle) ||
        r.selectedCode.toLowerCase().includes(needle)
      );
    }

    return items;
  }, [results, filterScore, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  // ── Actions ──
  const approveItem = (id: string) => {
    setResults(prev => prev.map(r => r.questionId === id ? { ...r, status: 'approved' as const } : r));
  };

  const skipItem = (id: string) => {
    setResults(prev => prev.map(r => r.questionId === id ? { ...r, status: 'skipped' as const } : r));
  };

  const changeSelectedCode = (id: string, code: string) => {
    setResults(prev => prev.map(r => r.questionId === id ? { ...r, selectedCode: code } : r));
  };

  const approveAll = () => {
    setResults(prev => prev.map(r => r.status === 'pending' ? { ...r, status: 'approved' as const } : r));
    toast.success('Đã duyệt tất cả câu đang chờ!');
  };

  const resetAll = () => {
    setResults(prev => prev.map(r => ({ ...r, status: 'pending' as const })));
  };

  // ── Save approved to Firestore ──
  const saveApproved = async () => {
    const approvedItems = results.filter(r => r.status === 'approved' && r.selectedCode);
    if (approvedItems.length === 0) {
      toast.error('Chưa có câu nào được duyệt!');
      return;
    }

    setSaving(true);
    try {
      // Batch write (500 max per batch in Firestore)
      const batchSize = 400;
      let savedCount = 0;

      for (let i = 0; i < approvedItems.length; i += batchSize) {
        const chunk = approvedItems.slice(i, i + batchSize);
        const batch = writeBatch(db);

        for (const item of chunk) {
          batch.update(doc(db, 'questions', item.questionId), { yccdCode: item.selectedCode });
        }

        await batch.commit();
        savedCount += chunk.length;
      }

      toast.success(`✅ Đã lưu YCCĐ cho ${savedCount} câu hỏi!`);

      // Remove saved items from results
      setResults(prev => prev.filter(r => r.status !== 'approved'));

      // Reload questions to reflect changes
      loadQuestions();
    } catch (err) {
      console.error('[YCCD] Save error:', err);
      toast.error('Lỗi khi lưu vào database. Kiểm tra kết nối.');
    } finally {
      setSaving(false);
    }
  };

  // ── Score color ──
  const getScoreColor = (score: number) => {
    if (score >= 60) return 'text-green-400 bg-green-600/15 border-green-600/30';
    if (score >= 30) return 'text-amber-400 bg-amber-600/15 border-amber-600/30';
    return 'text-red-400 bg-red-600/15 border-red-600/30';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <BrainCircuit className="w-7 h-7 text-cyan-400" />
            PHÂN LOẠI YCCĐ TỰ ĐỘNG
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            Quét & gắn Yêu cầu cần đạt (GDPT 2018) cho ngân hàng câu hỏi — <span className="text-green-400 font-bold">MIỄN PHÍ</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadQuestions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 transition-all disabled:opacity-40"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Tải lại
          </button>
          <button
            onClick={runAutoTag}
            disabled={scanning || questions.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 shadow-lg shadow-cyan-600/20"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {scanning ? 'Đang quét...' : 'Quét & Phân loại'}
          </button>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Tổng câu hỏi', value: stats.total, color: 'text-white' },
          { label: 'Đã có YCCĐ', value: stats.tagged, color: 'text-green-400' },
          { label: 'Chưa có YCCĐ', value: stats.untagged, color: 'text-amber-400' },
          { label: 'Đã quét', value: stats.scanned, color: 'text-cyan-400' },
          { label: 'Đã duyệt', value: stats.approved, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl text-center">
            <p className={cn("text-2xl font-black", s.color)}>{s.value}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Results ── */}
      {results.length > 0 && (
        <>
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800/40 rounded-xl px-4 py-3 border border-slate-800">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder="Tìm câu hỏi..."
                  className="bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white w-48 outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Score Filter */}
              <div className="flex gap-1">
                {([
                  { key: 'all', label: 'Tất cả' },
                  { key: 'high', label: '🟢 Cao' },
                  { key: 'medium', label: '🟡 TB' },
                  { key: 'low', label: '🔴 Thấp' },
                ] as const).map(f => (
                  <button
                    key={f.key}
                    onClick={() => { setFilterScore(f.key); setCurrentPage(1); }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      filterScore === f.key
                        ? "bg-cyan-600 border-cyan-600 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-500 hover:text-white"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-500">{filtered.length} kết quả</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={approveAll}
                disabled={stats.pending === 0}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all disabled:opacity-40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt tất cả ({stats.pending})
              </button>
              <button
                onClick={resetAll}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold rounded-lg transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset
              </button>
              <button
                onClick={saveApproved}
                disabled={saving || stats.approved === 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-40 shadow-lg shadow-cyan-600/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Lưu {stats.approved} câu đã duyệt
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence>
              {paginated.map((item, idx) => {
                const topSuggestion = item.suggestions[0];
                const isExpanded = expandedId === item.questionId;

                return (
                  <motion.div
                    key={item.questionId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className={cn(
                      "bg-slate-950 border rounded-2xl overflow-hidden transition-all",
                      item.status === 'approved' ? "border-emerald-600/30 bg-emerald-950/20" :
                      item.status === 'skipped' ? "border-slate-800 opacity-50" :
                      "border-slate-800"
                    )}
                  >
                    <div className="p-4 flex items-start gap-4">
                      {/* Status indicator */}
                      <div className="shrink-0 mt-1">
                        {item.status === 'approved' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : item.status === 'skipped' ? (
                          <XCircle className="w-5 h-5 text-slate-600" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-600" />
                        )}
                      </div>

                      {/* Question Content */}
                      <div className="flex-1 min-w-0">
                        {/* Badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={cn(
                            "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                            item.question.part === 1 ? "bg-blue-600 text-white" :
                            item.question.part === 2 ? "bg-amber-600 text-white" :
                            "bg-emerald-600 text-white"
                          )}>
                            P{item.question.part}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">{item.question.topic}</span>
                          <span className="text-[10px] text-slate-600">•</span>
                          <span className="text-[10px] text-slate-500">{item.question.level}</span>

                          {/* Confidence Score */}
                          {topSuggestion && (
                            <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded border", getScoreColor(topSuggestion.score))}>
                              {topSuggestion.score}% tin cậy
                            </span>
                          )}
                        </div>

                        {/* Content preview */}
                        <div className="text-sm text-slate-300 line-clamp-2">
                          <MathRenderer content={item.question.content.substring(0, 200)} />
                        </div>

                        {/* Top suggestion */}
                        {topSuggestion && (
                          <div className="mt-3 p-3 bg-cyan-600/5 border border-cyan-600/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                              <Target className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="text-[10px] font-bold text-cyan-400 uppercase">YCCĐ đề xuất</span>
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{item.selectedCode}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                              {getYCCDByCode(item.selectedCode)?.content || 'N/A'}
                            </p>
                            {topSuggestion.matchedKeywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {topSuggestion.matchedKeywords.slice(0, 5).map(kw => (
                                  <span key={kw} className="text-[9px] bg-cyan-600/10 text-cyan-500 px-1.5 py-0.5 rounded">{kw}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Expand: show alternative suggestions */}
                        {isExpanded && item.suggestions.length > 1 && (
                          <div className="mt-3 space-y-2 pl-4 border-l-2 border-slate-800">
                            <p className="text-[10px] font-bold text-slate-500">Gợi ý thay thế:</p>
                            {item.suggestions.slice(1).map(s => (
                              <button
                                key={s.yccdCode}
                                onClick={() => changeSelectedCode(item.questionId, s.yccdCode)}
                                className={cn(
                                  "w-full text-left p-2 rounded-lg border transition-all text-[11px]",
                                  item.selectedCode === s.yccdCode
                                    ? "border-cyan-500/50 bg-cyan-600/10 text-cyan-300"
                                    : "border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                                )}
                              >
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border mr-2", getScoreColor(s.score))}>
                                  {s.score}%
                                </span>
                                [{s.yccd.grade}] {s.yccd.content.substring(0, 80)}...
                              </button>
                            ))}

                            {/* Manual override */}
                            <div className="mt-2">
                              <p className="text-[10px] font-bold text-slate-500 mb-1">Hoặc chọn thủ công:</p>
                              <SearchableYCCDDropdown
                                value={item.selectedCode}
                                onChange={(code) => changeSelectedCode(item.questionId, code)}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex flex-col gap-2">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.questionId)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                          title="Xem chi tiết"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => approveItem(item.questionId)}
                          disabled={item.status === 'approved'}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            item.status === 'approved'
                              ? "bg-emerald-600 text-white"
                              : "bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600 hover:text-white"
                          )}
                          title="Duyệt"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => skipItem(item.questionId)}
                          disabled={item.status === 'skipped'}
                          className="p-2 bg-red-600/10 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-all"
                          title="Bỏ qua"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Trước
              </button>
              <span className="text-xs text-slate-500 font-bold">Trang {currentPage}/{totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-all"
              >
                Sau <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {results.length === 0 && !scanning && (
        <div className="py-16 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-950/30">
          <Zap className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h4 className="text-white font-bold text-lg mb-2">SẴN SÀNG QUÉT</h4>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            Bấm <span className="text-cyan-400 font-bold">"Quét & Phân loại"</span> để hệ thống tự động phân tích
            toàn bộ {stats.untagged} câu hỏi chưa có YCCĐ và đề xuất YCCĐ phù hợp nhất.
          </p>
          <p className="text-[10px] text-slate-600 mt-3">💡 100% xử lý offline — Không tốn API — Không mất phí</p>
        </div>
      )}
    </div>
  );
};

export default YCCDAutoTagger;
