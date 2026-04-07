import React, { useState, useMemo, useCallback } from 'react';
import { collection, getDocs, deleteDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Question } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  ShieldAlert,
  Scan,
  Trash2,
  Wrench,
  CheckSquare,
  Square,
  AlertTriangle,
  FileWarning,
  BrainCircuit,
  X,
  Save,
  RefreshCcw,
  PackageOpen,
  Loader2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════
//  ERROR TYPES
// ═══════════════════════════════════════════════════

type ErrorType = 'raw_json' | 'empty_content' | 'invalid_structure';

interface CorruptedItem {
  id: string;
  docData: any; // Raw Firestore document data
  errors: { type: ErrorType; label: string; detail: string }[];
  previewContent: string; // Truncated content for display
}

const ERROR_LABELS: Record<ErrorType, { label: string; color: string; icon: typeof ShieldAlert }> = {
  raw_json:          { label: 'Chuỗi JSON thô',   color: 'text-red-400 bg-red-500/10 border-red-500/30',       icon: FileWarning },
  empty_content:     { label: 'Mất nội dung',      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: AlertTriangle },
  invalid_structure: { label: 'Lỗi cấu trúc',      color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30', icon: PackageOpen },
};

// ═══════════════════════════════════════════════════
//  SCAN ALGORITHM
// ═══════════════════════════════════════════════════

function detectErrors(id: string, data: any): CorruptedItem | null {
  const errors: CorruptedItem['errors'] = [];

  // ── 1. Lỗi Type: Toàn bộ document là chuỗi JSON thay vì object ──
  if (typeof data === 'string') {
    errors.push({
      type: 'raw_json',
      label: 'Document là chuỗi JSON',
      detail: `Dữ liệu lưu dưới dạng string (${data.length} ký tự) thay vì Object.`,
    });
    return {
      id,
      docData: data,
      errors,
      previewContent: data.substring(0, 120) + (data.length > 120 ? '…' : ''),
    };
  }

  // ── 2. Content chứa raw JSON string (AI trả lỗi) ──
  const content = (data?.content || '').trim();
  if (content && (content.startsWith('{') || content.startsWith('[')) && 
      (content.includes('"content"') || content.includes('"part"') || content.includes('"options"'))) {
    errors.push({
      type: 'raw_json',
      label: 'Nội dung chứa JSON thô',
      detail: 'Trường content chứa chuỗi JSON chưa được parse — AI trả về lỗi format.',
    });
  }

  // ── 3. Lỗi Rỗng: Mất content ──
  if (!content || content.length < 5) {
    errors.push({
      type: 'empty_content',
      label: 'Đề bài rỗng',
      detail: content ? `Content chỉ có ${content.length} ký tự: "${content}"` : 'Trường content bị undefined hoặc rỗng.',
    });
  }

  // ── 4. Lỗi Cấu trúc: Part, Options, CorrectAnswer ──
  const part = data?.part;
  if (!part || ![1, 2, 3].includes(part)) {
    errors.push({
      type: 'invalid_structure',
      label: 'Thiếu/sai trường part',
      detail: `part = ${JSON.stringify(part)} (kỳ vọng: 1, 2, hoặc 3).`,
    });
  }

  // Part 1 & 2: cần options >= 2
  if (part === 1 || part === 2) {
    const opts = data?.options;
    if (!Array.isArray(opts) || opts.length < 2) {
      errors.push({
        type: 'invalid_structure',
        label: 'Mảng options không hợp lệ',
        detail: `options = ${JSON.stringify(opts)?.substring(0, 80)} — kỳ vọng mảng >= 2 phần tử.`,
      });
    }
  }

  // CorrectAnswer: không được null/undefined
  if (data?.correctAnswer === null || data?.correctAnswer === undefined) {
    errors.push({
      type: 'invalid_structure',
      label: 'Thiếu correctAnswer',
      detail: 'Trường correctAnswer bị null hoặc undefined.',
    });
  }

  if (errors.length === 0) return null;

  return {
    id,
    docData: data,
    errors,
    previewContent: content
      ? content.replace(/<[^>]*>/g, '').substring(0, 120) + (content.length > 120 ? '…' : '')
      : '(Trống)',
  };
}

// ═══════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════

const DataSanitizer = () => {
  // ── State ──
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [totalDocs, setTotalDocs] = useState(0);
  const [corrupted, setCorrupted] = useState<CorruptedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // Repair modal
  const [repairTarget, setRepairTarget] = useState<CorruptedItem | null>(null);
  const [repairContent, setRepairContent] = useState('');
  const [repairPart, setRepairPart] = useState<1 | 2 | 3>(1);
  const [repairOptions, setRepairOptions] = useState(['', '', '', '']);
  const [repairCorrectAnswer, setRepairCorrectAnswer] = useState<any>(0);
  const [repairSaving, setRepairSaving] = useState(false);

  // ── Scan ──
  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanned(false);
    setCorrupted([]);
    setSelected(new Set());

    try {
      const snapshot = await getDocs(collection(db, 'questions'));
      setTotalDocs(snapshot.size);

      const issues: CorruptedItem[] = [];
      snapshot.forEach((docSnap) => {
        const result = detectErrors(docSnap.id, docSnap.data());
        if (result) issues.push(result);
      });

      setCorrupted(issues);
    } catch (err: any) {
      console.error('[DataSanitizer] Scan failed:', err);
      alert('Lỗi khi quét dữ liệu: ' + (err?.message || err));
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }, []);

  // ── Select ──
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === corrupted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(corrupted.map(c => c.id)));
    }
  };

  // ── Bulk Delete ──
  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const confirmText = `Bạn có chắc muốn XÓA VĨNH VIỄN ${selected.size} câu hỏi lỗi này không?\n\nThao tác này KHÔNG THỂ hoàn tác!`;
    if (!window.confirm(confirmText)) return;

    setDeleting(true);
    let deleted = 0;
    const errors: string[] = [];

    for (const id of selected) {
      try {
        await deleteDoc(doc(db, 'questions', id));
        deleted++;
      } catch (err: any) {
        errors.push(`${id}: ${err?.message || err}`);
      }
    }

    // Update UI
    setCorrupted(prev => prev.filter(c => !selected.has(c.id)));
    setSelected(new Set());
    setDeleting(false);

    if (errors.length > 0) {
      alert(`Đã xóa ${deleted} câu. ${errors.length} câu lỗi khi xóa:\n${errors.join('\n')}`);
    } else {
      alert(`✅ Đã xóa thành công ${deleted} câu hỏi lỗi!`);
    }
  }, [selected]);

  // ── Repair Modal ──
  const openRepair = (item: CorruptedItem) => {
    setRepairTarget(item);
    const d = typeof item.docData === 'object' ? item.docData : {};
    setRepairContent(d.content || '');
    setRepairPart(d.part || 1);
    setRepairOptions(Array.isArray(d.options) ? [...d.options] : ['', '', '', '']);
    setRepairCorrectAnswer(d.correctAnswer ?? 0);
  };

  const handleRepairSave = useCallback(async () => {
    if (!repairTarget) return;
    setRepairSaving(true);
    try {
      const updateData: Record<string, any> = {
        content: repairContent,
        part: repairPart,
      };
      if (repairPart === 1 || repairPart === 2) {
        updateData.options = repairOptions.filter(o => o.trim() !== '');
      }
      if (repairPart === 1) {
        updateData.correctAnswer = typeof repairCorrectAnswer === 'number' ? repairCorrectAnswer : 0;
      } else if (repairPart === 2) {
        updateData.correctAnswer = Array.isArray(repairCorrectAnswer)
          ? repairCorrectAnswer
          : [false, false, false, false];
      } else {
        updateData.correctAnswer = parseFloat(String(repairCorrectAnswer)) || 0;
      }

      await updateDoc(doc(db, 'questions', repairTarget.id), updateData);

      // Remove from corrupted list after successful save
      setCorrupted(prev => prev.filter(c => c.id !== repairTarget.id));
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(repairTarget.id);
        return next;
      });
      setRepairTarget(null);
      alert('✅ Đã phục hồi câu hỏi thành công!');
    } catch (err: any) {
      alert('Lỗi khi lưu: ' + (err?.message || err));
    } finally {
      setRepairSaving(false);
    }
  }, [repairTarget, repairContent, repairPart, repairOptions, repairCorrectAnswer]);

  // ── Stats ──
  const stats = useMemo(() => {
    const byType = { raw_json: 0, empty_content: 0, invalid_structure: 0 };
    for (const c of corrupted) {
      for (const e of c.errors) {
        byType[e.type]++;
      }
    }
    return byType;
  }, [corrupted]);

  // ═══════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-red-600/10 p-3 rounded-2xl border border-red-600/20">
            <ShieldAlert className="text-red-500 w-8 h-8" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight">
              Công Cụ Dọn Dẹp Dữ Liệu
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              Quét, phát hiện và xử lý câu hỏi bị lỗi trong kho dữ liệu Firestore.
            </p>
          </div>
        </div>

        <button
          onClick={handleScan}
          disabled={scanning}
          className={cn(
            "flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl",
            scanning
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : "bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-red-500 text-white shadow-red-900/30 hover:scale-[1.02] active:scale-95"
          )}
        >
          {scanning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Đang quét...
            </>
          ) : (
            <>
              <Scan className="w-5 h-5" />
              {scanned ? 'Quét lại' : 'Bắt đầu quét'}
            </>
          )}
        </button>
      </div>

      {/* ── SCAN RESULTS ── */}
      {scanned && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tổng câu hỏi</p>
              <p className="text-2xl font-black text-white mt-1">{totalDocs}</p>
            </div>
            <div className={cn(
              "rounded-2xl p-4 text-center border",
              corrupted.length > 0 ? "bg-red-600/5 border-red-600/30" : "bg-emerald-600/5 border-emerald-600/30"
            )}>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Câu lỗi</p>
              <p className={cn("text-2xl font-black mt-1", corrupted.length > 0 ? "text-red-400" : "text-emerald-400")}>
                {corrupted.length}
              </p>
            </div>
            {Object.entries(ERROR_LABELS).map(([key, meta]) => (
              <div key={key} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{meta.label}</p>
                <p className={cn("text-2xl font-black mt-1", stats[key as ErrorType] > 0 ? meta.color.split(' ')[0] : "text-slate-600")}>
                  {stats[key as ErrorType]}
                </p>
              </div>
            ))}
          </div>

          {corrupted.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-600/10 rounded-3xl flex items-center justify-center mx-auto border border-emerald-600/20">
                <BrainCircuit className="text-emerald-500 w-10 h-10" />
              </div>
              <h4 className="text-xl font-black text-emerald-400 uppercase tracking-tight">
                Kho dữ liệu sạch bong!
              </h4>
              <p className="text-sm text-slate-500">
                Không phát hiện câu hỏi nào bị lỗi cấu trúc hoặc dữ liệu thô.
              </p>
            </div>
          ) : (
            <>
              {/* ── Bulk Actions Bar ── */}
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                  >
                    {selected.size === corrupted.length ? (
                      <CheckSquare className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    {selected.size === corrupted.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                  {selected.size > 0 && (
                    <span className="text-xs font-bold text-cyan-400 bg-cyan-400/10 px-3 py-1 rounded-full">
                      {selected.size} đã chọn
                    </span>
                  )}
                </div>

                <button
                  onClick={handleBulkDelete}
                  disabled={selected.size === 0 || deleting}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all",
                    selected.size > 0 && !deleting
                      ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 hover:scale-[1.02] active:scale-95"
                      : "bg-slate-800 text-slate-600 cursor-not-allowed"
                  )}
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang xóa...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Xóa đã chọn ({selected.size})
                    </>
                  )}
                </button>
              </div>

              {/* ── Quarantine Table ── */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[48px_1fr_200px_140px] bg-slate-950 border-b border-slate-800 px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <div className="flex items-center justify-center">
                    <button onClick={toggleSelectAll} className="hover:text-white transition-colors">
                      {selected.size === corrupted.length ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div>Câu hỏi</div>
                  <div>Trạng thái lỗi</div>
                  <div className="text-right">Thao tác</div>
                </div>

                {/* Table Body */}
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar divide-y divide-slate-800/50">
                  {corrupted.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        "grid grid-cols-[48px_1fr_200px_140px] px-4 py-4 items-center transition-colors",
                        selected.has(item.id) ? "bg-red-600/5" : "hover:bg-slate-900/50"
                      )}
                    >
                      {/* Checkbox */}
                      <div className="flex items-center justify-center">
                        <button onClick={() => toggleSelect(item.id)}>
                          {selected.has(item.id) ? (
                            <CheckSquare className="w-5 h-5 text-cyan-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-600 hover:text-slate-400 transition-colors" />
                          )}
                        </button>
                      </div>

                      {/* Question preview */}
                      <div className="min-w-0 pr-4">
                        <p className="text-[10px] font-mono text-slate-600 mb-1 truncate">
                          ID: {item.id}
                        </p>
                        <p className="text-sm text-slate-300 truncate leading-relaxed">
                          {item.previewContent}
                        </p>
                      </div>

                      {/* Error badges */}
                      <div className="flex flex-wrap gap-1.5">
                        {item.errors.map((err, i) => {
                          const meta = ERROR_LABELS[err.type];
                          return (
                            <span
                              key={i}
                              className={cn(
                                "text-[9px] font-black uppercase px-2 py-1 rounded-lg border whitespace-nowrap",
                                meta.color
                              )}
                              title={err.detail}
                            >
                              {meta.label}
                            </span>
                          );
                        })}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openRepair(item)}
                          className="p-2 bg-blue-600/10 text-blue-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                          title="Sửa / Phục hồi"
                        >
                          <Wrench className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Xóa câu hỏi ${item.id}?`)) {
                              deleteDoc(doc(db, 'questions', item.id)).then(() => {
                                setCorrupted(prev => prev.filter(c => c.id !== item.id));
                                setSelected(prev => {
                                  const next = new Set(prev);
                                  next.delete(item.id);
                                  return next;
                                });
                              });
                            }
                          }}
                          className="p-2 bg-red-600/10 text-red-400 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                          title="Xóa vĩnh viễn"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* ═══ REPAIR MODAL ═══ */}
      <AnimatePresence>
        {repairTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={() => setRepairTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-2xl rounded-3xl border border-blue-500/30 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,41,59,0.95) 100%)',
                boxShadow: '0 0 60px rgba(59,130,246,0.1), 0 25px 50px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Gradient bar */}
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #3b82f6, #06b6d4, #8b5cf6)' }} />

              {/* Close */}
              <button
                onClick={() => setRepairTarget(null)}
                className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600/10 p-3 rounded-2xl">
                    <Wrench className="text-blue-400 w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">Phục Hồi Câu Hỏi</h3>
                    <p className="text-[10px] font-mono text-slate-500 mt-1">ID: {repairTarget.id}</p>
                  </div>
                </div>

                {/* Error summary */}
                <div className="flex flex-wrap gap-2">
                  {repairTarget.errors.map((err, i) => (
                    <span key={i} className={cn("text-[10px] font-bold px-3 py-1.5 rounded-xl border", ERROR_LABELS[err.type].color)}>
                      {err.label}: {err.detail}
                    </span>
                  ))}
                </div>

                {/* Part selector */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Phần</label>
                  <div className="flex gap-2">
                    {([1, 2, 3] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setRepairPart(p)}
                        className={cn(
                          "px-5 py-2 rounded-xl text-xs font-black transition-all border",
                          repairPart === p
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                        )}
                      >
                        Phần {p === 1 ? 'I · TNKQ' : p === 2 ? 'II · Đ/S' : 'III · TLN'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Nội dung câu hỏi</label>
                  <textarea
                    value={repairContent}
                    onChange={(e) => setRepairContent(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 font-mono min-h-[120px] focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none resize-y"
                    placeholder="Nhập lại nội dung đề bài..."
                  />
                </div>

                {/* Options (Part 1 & 2) */}
                {(repairPart === 1 || repairPart === 2) && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">
                      Phương án {repairPart === 1 ? '(Chọn đáp án đúng)' : '(Click Đ/S)'}
                    </label>
                    <div className="space-y-2">
                      {repairOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          {repairPart === 1 ? (
                            <button
                              onClick={() => setRepairCorrectAnswer(idx)}
                              className={cn(
                                "w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all flex-shrink-0",
                                repairCorrectAnswer === idx
                                  ? "border-green-500 bg-green-500 text-white"
                                  : "border-slate-600 text-slate-600 hover:border-green-400"
                              )}
                            >
                              {String.fromCharCode(65 + idx)}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const ca = Array.isArray(repairCorrectAnswer)
                                  ? [...repairCorrectAnswer]
                                  : [false, false, false, false];
                                ca[idx] = !ca[idx];
                                setRepairCorrectAnswer(ca);
                              }}
                              className={cn(
                                "w-14 h-7 rounded-full text-[9px] font-black uppercase border transition-all flex-shrink-0",
                                (Array.isArray(repairCorrectAnswer) ? repairCorrectAnswer[idx] : false)
                                  ? "bg-green-600/20 border-green-600/50 text-green-400"
                                  : "bg-red-600/20 border-red-600/30 text-red-400"
                              )}
                            >
                              {(Array.isArray(repairCorrectAnswer) ? repairCorrectAnswer[idx] : false) ? '✓ Đ' : '✗ S'}
                            </button>
                          )}
                          <input
                            value={opt}
                            onChange={(e) => {
                              const next = [...repairOptions];
                              next[idx] = e.target.value;
                              setRepairOptions(next);
                            }}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                            placeholder={`Phương án ${String.fromCharCode(65 + idx)}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part 3: numeric answer */}
                {repairPart === 3 && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Đáp số</label>
                    <input
                      type="number"
                      step="any"
                      value={repairCorrectAnswer ?? ''}
                      onChange={(e) => setRepairCorrectAnswer(e.target.value)}
                      className="w-40 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono outline-none focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* Save / Cancel */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleRepairSave}
                    disabled={repairSaving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-50"
                  >
                    {repairSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {repairSaving ? 'Đang lưu...' : 'Lưu phục hồi'}
                  </button>
                  <button
                    onClick={() => setRepairTarget(null)}
                    className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-black text-sm transition-all"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DataSanitizer;
