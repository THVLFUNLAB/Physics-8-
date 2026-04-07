/**
 * DuplicateReviewHub — Trạm kiểm duyệt câu hỏi trùng lặp.
 * Quét toàn bộ kho câu hỏi, tìm cặp giống nhau ≥70%, 
 * hiển thị side-by-side với diff highlighting.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Zap,
  ArrowLeftRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  scanForDuplicates,
  computeWordDiff,
  normalizeForComparison,
  DuplicatePair,
  DiffSegment,
} from '../services/DuplicateDetector';
import { Question } from '../types';
import { cn } from '../lib/utils';
import MathRenderer from '../lib/MathRenderer';

interface DuplicateReviewHubProps {
  questions: Question[];
  onDeleteQuestion: (id: string) => Promise<void>;
}

export default function DuplicateReviewHub({ questions, onDeleteQuestion }: DuplicateReviewHubProps) {
  // ── State ──
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanFoundCount, setScanFoundCount] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);
  const [threshold, setThreshold] = useState(70); // 70%
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Lọc bỏ cặp đã dismiss hoặc đã xóa ──
  const activeDuplicates = useMemo(() => {
    const existingIds = new Set(questions.map(q => q.id));
    return duplicates.filter(d => {
      const pairKey = `${d.idA}__${d.idB}`;
      return !dismissedPairs.has(pairKey) && existingIds.has(d.idA) && existingIds.has(d.idB);
    });
  }, [duplicates, dismissedPairs, questions]);

  // ── Quét trùng lặp ──
  const handleScan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(0);
    setScanFoundCount(0);
    setExpandedIdx(null);
    setDismissedPairs(new Set());

    // Chạy trong requestAnimationFrame để không block UI
    requestAnimationFrame(() => {
      setTimeout(() => {
        const results = scanForDuplicates(
          questions.map(q => ({
            id: q.id!,
            content: q.content,
            options: q.options,
            part: q.part,
            topic: q.topic,
            level: q.level,
          })),
          threshold / 100,
          (percent, found) => {
            setScanProgress(percent);
            setScanFoundCount(found);
          }
        );
        setDuplicates(results);
        setIsScanning(false);
        setHasScanned(true);
      }, 50);
    });
  }, [questions, threshold]);

  // ── Xóa câu hỏi ──
  const handleDelete = async (id: string) => {
    if (!window.confirm('Xác nhận xóa câu hỏi này ra khỏi kho?')) return;
    setDeletingId(id);
    try {
      await onDeleteQuestion(id);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Bỏ qua cặp ──
  const dismissPair = (pair: DuplicatePair) => {
    const key = `${pair.idA}__${pair.idB}`;
    setDismissedPairs(prev => new Set(prev).add(key));
    if (expandedIdx !== null) setExpandedIdx(null);
  };

  // ── Map questionId → Question object ──
  const qMap = useMemo(() => {
    const m = new Map<string, Question>();
    for (const q of questions) if (q.id) m.set(q.id, q);
    return m;
  }, [questions]);

  // ── Render diff segments ──
  const DiffView = ({ segments }: { segments: DiffSegment[] }) => (
    <span>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            seg.type === 'same' && '',
            seg.type === 'removed' && 'bg-red-600/30 text-red-300 line-through px-0.5 rounded',
            seg.type === 'added' && 'bg-green-600/30 text-green-300 px-0.5 rounded',
          )}
        >
          {seg.text}{' '}
        </span>
      ))}
    </span>
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <ArrowLeftRight className="text-amber-500 w-7 h-7" />
            KIỂM DUYỆT TRÙNG LẶP
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            AI quét kho câu hỏi, phát hiện cặp giống nhau ≥ {threshold}% để thầy xử lý.
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Tổng câu</p>
            <p className="text-lg font-black text-white">{questions.length}</p>
          </div>
          {hasScanned && (
            <div className="bg-amber-600/10 border border-amber-600/30 rounded-xl px-4 py-2 text-center">
              <p className="text-[10px] font-bold text-amber-500 uppercase">Cặp trùng</p>
              <p className="text-lg font-black text-amber-400">{activeDuplicates.length}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-800">
        {/* Threshold slider */}
        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
          <label className="text-xs font-bold text-slate-400 whitespace-nowrap">Ngưỡng:</label>
          <input
            type="range"
            min={50}
            max={95}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="flex-1 accent-amber-500 h-1.5"
            disabled={isScanning}
          />
          <span className="text-sm font-black text-amber-400 min-w-[40px] text-right">{threshold}%</span>
        </div>

        {/* Scan button */}
        <button
          onClick={handleScan}
          disabled={isScanning || questions.length < 2}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all",
            isScanning
              ? "bg-amber-600/20 text-amber-400 cursor-wait"
              : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 hover:shadow-amber-600/40"
          )}
        >
          <Zap className={cn("w-5 h-5", isScanning && "animate-spin")} />
          {isScanning ? 'Đang quét...' : hasScanned ? 'Quét lại' : 'BẮT ĐẦU QUÉT'}
        </button>
      </div>

      {/* ── Progress bar ── */}
      {isScanning && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400 font-bold">
            <span>Đang so sánh {questions.length} câu hỏi...</span>
            <span>{scanProgress}% · {scanFoundCount} cặp tìm thấy</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-red-600 rounded-full transition-all duration-300"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Kết quả ── */}
      {hasScanned && !isScanning && (
        <div className="space-y-4">
          {activeDuplicates.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-emerald-800/50 rounded-3xl bg-emerald-600/5">
              <CheckCircle2 className="w-16 h-16 text-emerald-500" />
              <div>
                <h4 className="text-white font-black text-lg">SẠCH BÓNG!</h4>
                <p className="text-sm text-slate-400 mt-1">
                  Không phát hiện cặp câu hỏi nào giống nhau ≥ {threshold}%.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                {activeDuplicates.length} cặp trùng lặp — click để xem chi tiết
              </p>

              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
                {activeDuplicates.map((pair, idx) => {
                  const qA = qMap.get(pair.idA);
                  const qB = qMap.get(pair.idB);
                  if (!qA || !qB) return null;
                  const isExpanded = expandedIdx === idx;
                  const simPercent = Math.round(pair.similarity * 100);

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={`${pair.idA}-${pair.idB}`}
                      className={cn(
                        "group bg-slate-950/50 border rounded-2xl overflow-hidden transition-all duration-500 backdrop-blur-xl",
                        simPercent >= 90
                          ? "border-red-600/40 shadow-[0_0_15px_-3px_rgba(220,38,38,0.2)]"
                          : simPercent >= 80
                          ? "border-amber-600/40 shadow-[0_0_15px_-3px_rgba(217,119,6,0.2)]"
                          : "border-slate-800 hover:border-slate-600"
                      )}
                    >
                      {/* ── Collapsed header ── */}
                      <button
                        onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-900/50 transition-colors"
                      >
                        <div
                          className={cn(
                            "flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-sm font-black border",
                            simPercent >= 90
                              ? "bg-red-600/20 text-red-400 border-red-600/30"
                              : simPercent >= 80
                              ? "bg-amber-600/20 text-amber-400 border-amber-600/30"
                              : "bg-blue-600/20 text-blue-400 border-blue-600/30"
                          )}
                        >
                          {simPercent}%
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                              P{qA.part} · {qA.topic}
                            </span>
                            <span className="text-[10px] text-slate-600">vs</span>
                            <span className="text-[10px] font-bold bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                              P{qB.part} · {qB.topic}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 truncate">
                            {normalizeForComparison(qA.content).slice(0, 100)}...
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-500 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-500 flex-shrink-0" />
                        )}
                      </button>

                      {/* ── Expanded: Side-by-side diff ── */}
                      {isExpanded && (
                        <div className="border-t border-slate-800 p-4 space-y-4">
                          {(() => {
                            const normA = normalizeForComparison(qA.content);
                            const normB = normalizeForComparison(qB.content);
                            const { diffA, diffB } = computeWordDiff(normA, normB);
                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Câu A */}
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">
                                      Câu A · P{qA.part} · {qA.level}
                                    </span>
                                    <button
                                      onClick={() => handleDelete(pair.idA)}
                                      disabled={deletingId === pair.idA}
                                      className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-300 bg-red-600/10 hover:bg-red-600/20 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      {deletingId === pair.idA ? 'Đang xóa...' : 'Xóa câu A'}
                                    </button>
                                  </div>
                                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto">
                                    <DiffView segments={diffA} />
                                  </div>
                                  {/* Original with Formulas */}
                                  <details className="group">
                                    <summary className="text-[10px] font-bold text-slate-600 cursor-pointer hover:text-slate-400 flex items-center gap-1">
                                      <Eye className="w-3 h-3" /> Xem bản gốc (có công thức)
                                    </summary>
                                    <div className="mt-2 bg-slate-900/50 border border-slate-800/50 rounded-xl p-3 text-sm text-slate-300 max-h-[200px] overflow-y-auto">
                                      <MathRenderer content={qA.content} />
                                    </div>
                                  </details>
                                </div>

                                {/* Câu B */}
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-green-400 uppercase tracking-wider">
                                      Câu B · P{qB.part} · {qB.level}
                                    </span>
                                    <button
                                      onClick={() => handleDelete(pair.idB)}
                                      disabled={deletingId === pair.idB}
                                      className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-300 bg-red-600/10 hover:bg-red-600/20 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      {deletingId === pair.idB ? 'Đang xóa...' : 'Xóa câu B'}
                                    </button>
                                  </div>
                                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto">
                                    <DiffView segments={diffB} />
                                  </div>
                                  <details className="group">
                                    <summary className="text-[10px] font-bold text-slate-600 cursor-pointer hover:text-slate-400 flex items-center gap-1">
                                      <Eye className="w-3 h-3" /> Xem bản gốc (có công thức)
                                    </summary>
                                    <div className="mt-2 bg-slate-900/50 border border-slate-800/50 rounded-xl p-3 text-sm text-slate-300 max-h-[200px] overflow-y-auto">
                                      <MathRenderer content={qB.content} />
                                    </div>
                                  </details>
                                </div>
                              </div>
                            );
                          })()}

                          {/* ── Action bar ── */}
                          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                            <button
                              onClick={() => dismissPair(pair)}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-all"
                            >
                              <EyeOff className="w-3.5 h-3.5" /> Bỏ qua (giữ cả 2)
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!hasScanned && !isScanning && (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-950/30">
          <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center border border-slate-700">
            <Search className="text-slate-600 w-10 h-10" />
          </div>
          <div className="max-w-sm">
            <h4 className="text-white font-bold">Chưa quét</h4>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Nhấn <span className="text-amber-400 font-bold">"BẮT ĐẦU QUÉT"</span> để AI phân tích 
              toàn bộ kho {questions.length} câu hỏi và phát hiện các cặp trùng lặp.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
