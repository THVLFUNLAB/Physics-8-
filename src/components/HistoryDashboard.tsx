import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { History, Target, Calendar, Clock, ChevronRight, Hash, Search, ChevronLeft, Filter } from 'lucide-react';
import { Attempt } from '../types';
import { db, collection, getDocs, query, where } from '../firebase';

const PAGE_SIZE = 12;

// ── Fetch exam titles từ Firestore để map testId → title đẹp ──
async function fetchExamTitleMap(examIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(examIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const titleMap: Record<string, string> = {};
  // Batch theo 10 (Firestore 'in' limit)
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    try {
      const snap = await getDocs(
        query(collection(db, 'exams'), where('__name__', 'in', chunk))
      );
      snap.forEach(d => {
        const data = d.data();
        titleMap[d.id] = data.title || d.id;
      });
    } catch { /* Bỏ qua lỗi từng chunk */ }
  }
  return titleMap;
}

export const HistoryDashboard = ({
  attempts,
  onReviewAttempt,
}: {
  attempts: Attempt[];
  onReviewAttempt: (attempt: Attempt) => void;
}) => {
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingTitles, setIsLoadingTitles] = useState(false);

  // ── Fetch tên đề khi attempts thay đổi ──
  useEffect(() => {
    if (attempts.length === 0) return;
    const ids = attempts.map(a => a.testId).filter(Boolean) as string[];
    setIsLoadingTitles(true);
    fetchExamTitleMap(ids)
      .then(map => setTitleMap(map))
      .finally(() => setIsLoadingTitles(false));
  }, [attempts]);

  // ── Lấy tên đề đẹp ──
  const getTitle = (attempt: Attempt): string => {
    if (!attempt.testId) return 'Đề kiểm tra';
    return titleMap[attempt.testId] || attempt.testId;
  };

  // Safe formatters
  const formatScore = (score: any): string => {
    const num = Number(score);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const formatDate = (timestamp: any): string => {
    try {
      if (!timestamp?.seconds) return 'N/A';
      return new Date(timestamp.seconds * 1000).toLocaleDateString('vi-VN');
    } catch { return 'N/A'; }
  };

  const formatTime = (timestamp: any): string => {
    try {
      if (!timestamp?.seconds) return 'N/A';
      return new Date(timestamp.seconds * 1000).toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return 'N/A'; }
  };

  const getAnswerCount = (attempt: Attempt): number => {
    try { return Object.keys(attempt.answers || {}).length; }
    catch { return 0; }
  };

  // ── Lọc + tìm kiếm ──
  const filtered = useMemo(() => {
    return attempts.filter(a => {
      const score = Number(a.score) || 0;
      const title = getTitle(a).toLowerCase();
      const q = searchQuery.toLowerCase();

      const matchSearch = !searchQuery || title.includes(q);
      const matchScore =
        scoreFilter === 'all' ? true :
        scoreFilter === 'high' ? score >= 8.0 :
        scoreFilter === 'mid' ? score >= 5.0 && score < 8.0 :
        score < 5.0;

      return matchSearch && matchScore;
    });
  }, [attempts, titleMap, searchQuery, scoreFilter]);

  // Reset page khi filter thay đổi
  useEffect(() => { setCurrentPage(1); }, [searchQuery, scoreFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const avgScore = attempts.length > 0
    ? (attempts.reduce((acc, a) => acc + (Number(a.score) || 0), 0) / attempts.length)
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      {/* ── HEADER ── */}
      <div className="relative overflow-hidden bg-slate-900/50 backdrop-blur-md border border-slate-700/50 p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-3xl rounded-full translate-x-1/4 -translate-y-1/4 pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-3xl font-black text-white font-headline tracking-tight mb-2 flex items-center gap-3">
            <History className="text-cyan-400 w-8 h-8" />
            Lịch Sử Làm Bài
          </h2>
          <p className="text-slate-400 font-medium">Theo dõi tiến độ, xem lại kết quả và đúc rút bài học kinh nghiệm.</p>
        </div>
        <div className="relative z-10 flex gap-4">
          <div className="bg-slate-800/50 border border-slate-700 px-6 py-4 rounded-2xl flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Tổng lượt</span>
            <span className="text-3xl font-black text-cyan-400">{attempts.length}</span>
          </div>
          {attempts.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700 px-6 py-4 rounded-2xl flex flex-col items-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Điểm TB</span>
              <span className="text-3xl font-black text-emerald-400">{avgScore.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── SEARCH & FILTER BAR ── */}
      {attempts.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên đề thi..."
              className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors text-xs font-bold"
              >✕</button>
            )}
          </div>

          {/* Score filter */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1.5 shrink-0">
            <Filter className="w-4 h-4 text-slate-500 ml-2" />
            {([['all', 'Tất cả'], ['high', '≥8.0'], ['mid', '5–8'], ['low', '<5']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setScoreFilter(val)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  scoreFilter === val
                    ? val === 'high' ? 'bg-amber-500 text-white' :
                      val === 'mid'  ? 'bg-blue-500 text-white' :
                      val === 'low'  ? 'bg-red-500 text-white' :
                      'bg-slate-700 text-white'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── GRID CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoadingTitles && (
          <div className="col-span-full flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {paginated.map((attempt, index) => {
          const score = Number(attempt.score) || 0;
          const answerCount = getAnswerCount(attempt);
          const title = getTitle(attempt);

          return (
            <motion.div
              key={attempt.id || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 hover:border-slate-600 transition-all flex flex-col shadow-lg shadow-black/20 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-2xl ${
                  score >= 8.0 ? 'bg-amber-500/10 text-amber-500' :
                  score >= 5.0 ? 'bg-blue-500/10 text-blue-500' :
                  'bg-red-500/10 text-red-500'
                }`}>
                  <Target className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-black ${
                    score >= 8.0 ? 'text-amber-500' :
                    score >= 5.0 ? 'text-blue-500' :
                    'text-red-500'
                  }`}>
                    {formatScore(score)}
                  </span>
                  <span className="text-xs text-slate-500 font-bold ml-1">/ 10</span>
                </div>
              </div>

              <h3 className="text-base font-bold text-white mb-4 line-clamp-2 min-h-[48px] leading-snug">
                {title}
              </h3>

              <div className="space-y-3 mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 flex-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                    <Calendar className="w-3.5 h-3.5" /> Ngày làm:
                  </span>
                  <span className="text-slate-300 font-bold">{formatDate(attempt.timestamp)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5" /> Giờ nộp:
                  </span>
                  <span className="text-slate-300 font-bold">{formatTime(attempt.timestamp)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                    <Hash className="w-3.5 h-3.5" /> Số câu:
                  </span>
                  <span className="text-slate-300 font-bold">{answerCount} câu</span>
                </div>
              </div>

              <button
                onClick={() => onReviewAttempt(attempt)}
                className="w-full bg-slate-800 hover:bg-cyan-600 text-white rounded-xl py-3.5 font-bold text-sm tracking-wide transition-all shadow-md group-hover:shadow-cyan-500/20 flex items-center justify-center gap-2"
              >
                Xem lại chi tiết
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}

        {filtered.length === 0 && !isLoadingTitles && (
          <div className="col-span-full py-20 text-center bg-slate-900 border border-slate-800 rounded-3xl">
            <History className="w-16 h-16 text-slate-700 mx-auto mb-4" />
            {attempts.length === 0 ? (
              <>
                <h3 className="text-xl font-bold text-slate-400 mb-2">Chưa có lịch sử làm bài</h3>
                <p className="text-slate-500 max-w-md mx-auto">Các đề thi bạn đã nộp sẽ tự động được lưu lại ở đây để bạn dễ dàng theo dõi và rút kinh nghiệm.</p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-slate-400 mb-2">Không tìm thấy kết quả</h3>
                <p className="text-slate-500">Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc điểm số.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── PAGINATION ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && (arr[idx - 1] as number) !== p - 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((item, i) =>
                item === '...' ? (
                  <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-slate-500 text-sm">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item as number)}
                    className={`w-9 h-9 rounded-xl text-sm font-black transition-all ${
                      currentPage === item
                        ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {item}
                  </button>
                )
              )
            }
          </div>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="text-xs text-slate-500 font-bold ml-2">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} / {filtered.length}
          </span>
        </div>
      )}
    </div>
  );
};
