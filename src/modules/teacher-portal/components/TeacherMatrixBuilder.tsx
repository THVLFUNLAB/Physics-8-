/**
 * TeacherMatrixBuilder.tsx — Giao diện tạo ma trận đề thi cho GV
 * Phase 3: Tích hợp Question Pool Cache + generateDynamicExam engine
 *
 * Luồng:
 *  1. GV chọn hoặc tạo ma trận (title, grade, duration)
 *  2. GV cấu hình số câu per (Part × Level) + topic filter (optional)
 *  3. Bấm "Sinh đề" → generateDynamicExam với cache → preview câu mẫu
 *  4. GV đặt tên đề → Lưu vào Firestore (exams collection)
 */
import React, { useState, useCallback } from 'react';
import { Sparkles, Plus, Minus, Save, RefreshCw, Eye, ChevronDown } from 'lucide-react';
import type { UserProfile, DynamicMatrixFormula, Question, QuestionLevel } from '../../../types';
import type { useTeacherPortal } from '../useTeacherPortal';
import { generateDynamicExam } from '../../../services/examGeneratorService';
import { fetchQuestionPoolCached, clearQuestionPoolCache, saveTeacherMatrix } from '../services/teacherClassService';
import { addDoc, collection, Timestamp, db } from '../../../firebase';
import { toast } from '../../../components/Toast';

type Portal = ReturnType<typeof useTeacherPortal>;

interface Props {
  portal: Portal;
  user: UserProfile;
  onClose?: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────
const LEVELS: QuestionLevel[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
const PARTS = [1, 2, 3] as const;

const PART_INFO = {
  1: { label: 'Phần I', desc: 'Trắc nghiệm 4 lựa chọn (chọn 1 đáp án)', color: 'emerald' },
  2: { label: 'Phần II', desc: 'Đúng/Sai (4 ý a/b/c/d)', color: 'cyan' },
  3: { label: 'Phần III', desc: 'Trả lời ngắn (điền số)', color: 'violet' },
} as const;

// Mặc định chuẩn THPT 2025: 18+4+6 = 28 câu
const DEFAULT_COUNTS: Record<number, Record<QuestionLevel, number>> = {
  1: { 'Nhận biết': 5, 'Thông hiểu': 7, 'Vận dụng': 4, 'Vận dụng cao': 2 },
  2: { 'Nhận biết': 2, 'Thông hiểu': 2, 'Vận dụng': 0, 'Vận dụng cao': 0 },
  3: { 'Nhận biết': 2, 'Thông hiểu': 2, 'Vận dụng': 2, 'Vận dụng cao': 0 },
};

const ACCENT_MAP = {
  emerald: 'border-emerald-500/30 bg-emerald-500/8',
  cyan:    'border-cyan-500/30 bg-cyan-500/8',
  violet:  'border-violet-500/30 bg-violet-500/8',
};

const ACCENT_BADGE = {
  emerald: 'bg-emerald-500/15 text-emerald-400',
  cyan:    'bg-cyan-500/15 text-cyan-400',
  violet:  'bg-violet-500/15 text-violet-400',
};

// ─────────────────────────────────────────────────────────────────────────────

const TeacherMatrixBuilder: React.FC<Props> = ({ portal, user, onClose }) => {
  // ── Form state ────────────────────────────────────────────────────────────
  const [matrixTitle, setMatrixTitle] = useState('Ma trận của tôi');
  const [targetGrade, setTargetGrade] = useState(12);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [saveMatrix, setSaveMatrix] = useState(false);

  // Số câu per (Part × Level): counts[part][level] = n
  const [counts, setCounts] = useState<Record<number, Record<QuestionLevel, number>>>(
    JSON.parse(JSON.stringify(DEFAULT_COUNTS))
  );

  // Topic filter per part (optional, empty = bất kỳ)
  const [topicFilters, setTopicFilters] = useState<Record<number, string>>({
    1: '', 2: '', 3: '',
  });

  // ── Generate state ────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[] | null>(null);
  const [examTitle, setExamTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [cacheHint, setCacheHint] = useState<string | null>(null);

  // ── Computed: tổng số câu ─────────────────────────────────────────────────
  const totalByPart = PARTS.map(p =>
    LEVELS.reduce((sum, l) => sum + (counts[p][l] || 0), 0)
  );
  const totalAll = totalByPart.reduce((a, b) => a + b, 0);

  // ── Update count ──────────────────────────────────────────────────────────
  const updateCount = (part: number, level: QuestionLevel, delta: number) => {
    setCounts(prev => {
      const val = Math.max(0, (prev[part][level] || 0) + delta);
      return { ...prev, [part]: { ...prev[part], [level]: val } };
    });
  };

  // ── Core: Sinh đề từ ma trận (dùng Question Pool Cache) ──────────────────
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGeneratedQuestions(null);
    setCacheHint(null);

    try {
      const allQuestions: Question[] = [];
      let cachedCount = 0;
      let freshCount = 0;

      for (const part of PARTS) {
        const topicFilter = topicFilters[part]
          ? topicFilters[part].split(',').map(t => t.trim()).filter(Boolean)
          : undefined;

        for (const level of LEVELS) {
          const needed = counts[part][level];
          if (needed <= 0) continue;

          // Dùng fetchQuestionPoolCached — tự quản lý sessionStorage TTL
          const t0 = Date.now();
          const pool = await fetchQuestionPoolCached(part, level, targetGrade, topicFilter);
          const elapsed = Date.now() - t0;

          // Phân biệt cache hit (< 50ms) vs fresh fetch (> 200ms)
          if (elapsed < 50) cachedCount++;
          else freshCount++;

          // Fisher-Yates shuffle
          const shuffled = [...pool];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          // Lấy đúng số câu cần, đánh tag part
          const picked = shuffled.slice(0, needed).map(q => ({ ...q, part }));

          if (picked.length < needed) {
            toast.error(`Phần ${part} - ${level}: Chỉ có ${picked.length}/${needed} câu trong kho. Sẽ lấy toàn bộ.`);
          }

          allQuestions.push(...picked);
        }
      }

      if (allQuestions.length === 0) {
        toast.error('Kho câu hỏi trống cho cấu hình này. Kiểm tra lại khối lớp và bộ lọc chủ đề.');
        return;
      }

      setGeneratedQuestions(allQuestions);
      setExamTitle(`${matrixTitle} — Khối ${targetGrade} — ${new Date().toLocaleDateString('vi-VN')}`);
      setCacheHint(`✅ Đã sinh ${allQuestions.length} câu. Cache: ${cachedCount} pool hits, ${freshCount} Firestore reads mới.`);
      setShowPreview(true);
      toast.success(`Sinh đề thành công! ${allQuestions.length} câu hỏi.`);
    } catch (err: any) {
      console.error('[TeacherMatrixBuilder] Error:', err);
      toast.error('Lỗi khi sinh đề: ' + (err?.message ?? 'Không xác định'));
    } finally {
      setIsGenerating(false);
    }
  }, [counts, targetGrade, topicFilters, matrixTitle]);

  // ── Save exam to Firestore ────────────────────────────────────────────────
  const handleSaveExam = useCallback(async () => {
    if (!generatedQuestions || !examTitle.trim()) return;
    setIsSaving(true);
    try {
      // Lưu ma trận (nếu GV muốn tái sử dụng)
      if (saveMatrix) {
        await saveTeacherMatrix(user.uid, {
          title: matrixTitle,
          description: `Ma trận ${totalAll} câu, Khối ${targetGrade}`,
          targetGrade,
          targetCompetency: '8+', // Default
          isTeacherFormula: true,
          ownerTeacherId: user.uid,
          matrixVisibility: 'private',
          isActive: true,
          structure2025: {
            part1: {
              questionCount: totalByPart[0],
              levels: counts[1] as any,
            },
            part2: {
              questionCount: totalByPart[1],
              levels: counts[2] as any,
            },
            part3: {
              questionCount: totalByPart[2],
              levels: counts[3] as any,
            },
          },
        } as any);
      }

      // Lưu đề thi
      await addDoc(collection(db, 'exams'), {
        title: examTitle.trim(),
        targetGrade,
        questions: generatedQuestions,
        questionIds: generatedQuestions.map(q => q.id).filter(Boolean),
        createdAt: Timestamp.now(),
        createdBy: user.uid,
        ownerTeacherId: user.uid,
        visibility: 'private',
        published: false,
        type: 'Dynamic',
        durationMinutes,
      });

      toast.success('Đã lưu đề thi thành công!');
      portal.refreshExams();

      // Reset
      setGeneratedQuestions(null);
      setShowPreview(false);
      if (onClose) onClose();
    } catch (err: any) {
      toast.error('Lỗi lưu đề: ' + (err?.message ?? 'Không xác định'));
    } finally {
      setIsSaving(false);
    }
  }, [generatedQuestions, examTitle, saveMatrix, matrixTitle, counts, targetGrade, durationMinutes, user, portal, totalAll, totalByPart, onClose]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="tp-section-title">
            <Sparkles className="text-amber-400" /> Sinh Đề Từ Ma Trận
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Cấu hình số câu mỗi cấp độ → Bấm sinh đề → Hệ thống bốc ngẫu nhiên từ kho
          </p>
        </div>
        <button className="tp-btn-ghost text-xs" onClick={() => clearQuestionPoolCache()}>
          <RefreshCw className="w-3.5 h-3.5" /> Xóa cache
        </button>
      </div>

      {/* Config row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Tên ma trận
          </label>
          <input type="text" value={matrixTitle} onChange={e => setMatrixTitle(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Khối lớp</label>
          <select value={targetGrade} onChange={e => setTargetGrade(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value={10}>Lớp 10</option>
            <option value={11}>Lớp 11</option>
            <option value={12}>Lớp 12</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Thời gian (phút)</label>
          <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))}
            min={15} max={180} step={5}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
        </div>
      </div>

      {/* Matrix grid per part */}
      {PARTS.map(part => {
        const info = PART_INFO[part];
        const accent = ACCENT_MAP[info.color];
        const badge = ACCENT_BADGE[info.color];
        return (
          <div key={part} className={`border ${accent} rounded-xl p-4 space-y-3`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge} mr-2`}>
                  {info.label}
                </span>
                <span className="text-xs text-slate-500">{info.desc}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-slate-300">{totalByPart[part - 1]}</span>
                <span className="text-xs text-slate-600 ml-1">câu</span>
              </div>
            </div>

            {/* Level rows */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LEVELS.map(level => (
                <div key={level} className="space-y-1">
                  <p className="text-xs text-slate-500 font-semibold truncate">{level}</p>
                  <div className="flex items-center gap-1">
                    <button
                      className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 flex items-center justify-center text-sm transition-colors"
                      onClick={() => updateCount(part, level, -1)}>
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center font-black text-white text-sm">
                      {counts[part][level]}
                    </span>
                    <button
                      className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 flex items-center justify-center text-sm transition-colors"
                      onClick={() => updateCount(part, level, 1)}>
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Topic filter */}
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                Lọc chủ đề (không bắt buộc, cách nhau bằng dấu phẩy):
              </label>
              <input type="text" value={topicFilters[part]}
                onChange={e => setTopicFilters(prev => ({ ...prev, [part]: e.target.value }))}
                placeholder="VD: Dao động cơ, Sóng cơ"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50" />
            </div>
          </div>
        );
      })}

      {/* Summary & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800">
        <div className="text-sm">
          <span className="text-slate-400">Tổng: </span>
          <span className="font-black text-white text-base">{totalAll} câu</span>
          <span className="text-slate-600 mx-2">·</span>
          <span className="text-slate-400">{durationMinutes} phút</span>
          <span className="text-slate-600 mx-2">·</span>
          <span className="text-slate-400">Khối {targetGrade}</span>
        </div>
        <div className="flex gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={saveMatrix} onChange={e => setSaveMatrix(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500" />
            Lưu ma trận để dùng lại
          </label>
          <button
            className="tp-btn-primary"
            onClick={handleGenerate}
            disabled={isGenerating || totalAll === 0}>
            {isGenerating
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang sinh đề...</>
              : <><Sparkles className="w-4 h-4" /> Sinh đề ngay</>
            }
          </button>
        </div>
      </div>

      {/* Cache hint */}
      {cacheHint && (
        <p className="text-xs text-emerald-600 bg-emerald-900/10 border border-emerald-800/20 rounded-lg px-3 py-2">
          {cacheHint}
        </p>
      )}

      {/* Preview & Save */}
      {generatedQuestions && (
        <div className="bg-slate-900/60 border border-emerald-500/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="font-bold text-slate-300 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              Preview — {generatedQuestions.length} câu đã sinh
            </h4>
            <button className="tp-btn-ghost text-xs" onClick={() => setShowPreview(v => !v)}>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPreview ? 'rotate-180' : ''}`} />
              {showPreview ? 'Thu gọn' : 'Xem câu mẫu'}
            </button>
          </div>

          {showPreview && (
            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
              {generatedQuestions.slice(0, 5).map((q, i) => (
                <div key={q.id || i} className="bg-slate-800/60 rounded-lg px-3 py-2.5 text-xs">
                  <div className="flex gap-2 items-start">
                    <span className="text-slate-600 font-mono shrink-0">{i + 1}.</span>
                    <div>
                      <p className="text-slate-300 line-clamp-2">{q.content || (q as any).question || '(Không có nội dung)'}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-slate-600">Phần {q.part}</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-emerald-600">{q.level}</span>
                        {q.topic && <><span className="text-slate-600">·</span><span className="text-cyan-600">{q.topic}</span></>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {generatedQuestions.length > 5 && (
                <p className="text-center text-xs text-slate-600 py-2">
                  ... và {generatedQuestions.length - 5} câu nữa
                </p>
              )}
            </div>
          )}

          {/* Đặt tên & Lưu */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Tên đề thi *
              </label>
              <input type="text" value={examTitle} onChange={e => setExamTitle(e.target.value)}
                placeholder="VD: Đề kiểm tra 45p - Dao động cơ - Lớp 12A1"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="flex gap-3 justify-end">
              <button className="tp-btn-ghost" onClick={() => { setGeneratedQuestions(null); setShowPreview(false); }}>
                Sinh lại
              </button>
              <button className="tp-btn-primary" onClick={handleSaveExam}
                disabled={isSaving || !examTitle.trim()}>
                {isSaving
                  ? 'Đang lưu...'
                  : <><Save className="w-4 h-4" /> Lưu đề thi</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherMatrixBuilder;
