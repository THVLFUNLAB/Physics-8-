/**
 * ═══════════════════════════════════════════════════════════════
 *  TeacherDashboard — Bảng Theo Dõi Tiến Độ Học Sinh
 *  ──────────────────────────────────────────────────────────────
 *  Khu vực 1: Pill Tabs chọn lớp (dựa trên className của UserProfile)
 *  Khu vực 2: Alert Filters (< 50% hoàn thành, Chưa làm đề mới nhất)
 *  Khu vực 3: Ma Trận Tiến Độ (Học sinh × Đề thi, Traffic Light)
 *
 *  Data Flow (tối ưu Reads):
 *    - students: onSnapshot(users, role='student') → 1 listener
 *    - exams:    getDocs(exams, published=true)    → 1 read
 *    - attempts: getDocs(attempts)                 → 1 read
 *    → Tổng ~3 queries, xử lý client-side
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
  Timestamp,
} from '../firebase';
import { UserProfile, Exam, Attempt, Question } from '../types';
import { ReviewExam } from './ReviewExam';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SkeletonText, SkeletonNumber } from './SkeletonLoader';
import {
  BarChart3,
  AlertTriangle,
  FileWarning,
  Users,
  Trophy,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  GraduationCap,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
//  TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════

/** Trạng thái hoàn thành 1 ô giao giữa HS × Đề */
type CellStatus = 'completed' | 'in_progress' | 'not_started';

/** Dữ liệu ô giao HS × Đề */
interface CellData {
  status: CellStatus;
  score?: number;        // Điểm (thang 10), chỉ có khi completed
  attemptCount?: number; // Số lần thử
  bestAttempt?: Attempt; // Thêm Attempt tốt nhất để hiển thị bài làm
}

/** Dữ liệu 1 hàng (1 Học sinh) trong ma trận */
interface StudentRow {
  student: UserProfile;
  cells: Record<string, CellData>; // examId → CellData
  completedCount: number;          // Số đề đã hoàn thành
  totalExams: number;              // Tổng số đề
  overallPercent: number;          // % hoàn thành tổng
  avgScore: number;                // Điểm trung bình
}

/** Filter nhanh */
type AlertFilter = 'none' | 'below50' | 'missingLatest';

// ═══════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

/** Skeleton cho bảng dữ liệu khi loading */
const TableSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div
        key={i}
        className="h-14 bg-slate-900 border border-slate-800 rounded-xl skeleton-shimmer"
        style={{ animationDelay: `${i * 0.1}s` }}
      />
    ))}
  </div>
);

/** Badge Traffic Light cho ô giao */
const StatusBadge = ({ cell }: { cell: CellData }) => {
  if (cell.status === 'completed') {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
          <span className="text-[10px] font-black text-emerald-400">
            {cell.score?.toFixed(1) ?? '✓'}
          </span>
        </div>
        {(cell.attemptCount ?? 0) > 1 && (
          <span className="text-[8px] text-slate-500 font-bold">×{cell.attemptCount}</span>
        )}
      </div>
    );
  }
  if (cell.status === 'in_progress') {
    return (
      <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-lg bg-slate-700/30 border border-slate-700/50 flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-slate-600" />
    </div>
  );
};

/** Master Progress Bar */
const ProgressBar = ({ percent, className = '' }: { percent: number; className?: string }) => {
  const color =
    percent >= 80 ? 'from-emerald-500 to-emerald-400' :
    percent >= 50 ? 'from-amber-500 to-amber-400' :
    percent >= 25 ? 'from-orange-500 to-orange-400' :
                    'from-red-500 to-red-400';

  return (
    <div className={cn('w-full bg-slate-800 rounded-full h-2 overflow-hidden', className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={cn('h-full rounded-full bg-gradient-to-r', color)}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

const TeacherDashboard: React.FC = () => {
  // ── Raw data state ──
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── UI state ──
  const [selectedClass, setSelectedClass] = useState('__all__');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('none');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'progress' | 'score'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [reviewingData, setReviewingData] = useState<{ test: { topic: string, questions: Question[] }, answers: Record<string, any> } | null>(null);

  // ═══════════════════════════════════════════════════════════
  //  DATA FETCHING (tối ưu: 3 queries total)
  // ═══════════════════════════════════════════════════════════

  // 1. Students — realtime listener (sync với StudentDirectory pattern)
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'student'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
        setStudents(data);
      },
      (err) => {
        console.error('[TeacherDashboard] Students listener error:', err);
      }
    );
    return unsub;
  }, []);

  // 2. Exams + Attempts — one-time fetch
  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        // Lấy tất cả đề đã phát hành (published), sắp xếp theo ngày tạo
        const examSnap = await getDocs(
          query(collection(db, 'exams'), where('published', '==', true), orderBy('createdAt', 'desc'))
        );
        const examData = examSnap.docs.map(d => ({ id: d.id, ...d.data() } as Exam));

        // Lấy tất cả attempts (1 query duy nhất)
        const attemptSnap = await getDocs(collection(db, 'attempts'));
        const attemptData = attemptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Attempt));

        if (mounted) {
          setExams(examData);
          setAttempts(attemptData);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[TeacherDashboard] Fetch error:', err);
        if (mounted) setIsLoading(false);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, []);

  // ═══════════════════════════════════════════════════════════
  //  COMPUTED DATA
  // ═══════════════════════════════════════════════════════════

  // Danh sách lớp unique (trích từ className)
  const classGroups = useMemo(() => {
    const groups = new Set<string>();
    students.forEach(s => {
      if (s.className?.trim()) groups.add(s.className.trim());
    });
    return Array.from(groups).sort();
  }, [students]);

  // Map attempts: userId → Map<examId, Attempt[]>
  const attemptMap = useMemo(() => {
    const map = new Map<string, Map<string, Attempt[]>>();
    attempts.forEach(a => {
      if (!a.userId || !a.examId) return;
      if (!map.has(a.userId)) map.set(a.userId, new Map());
      const userMap = map.get(a.userId)!;
      if (!userMap.has(a.examId)) userMap.set(a.examId, []);
      userMap.get(a.examId)!.push(a);
    });
    return map;
  }, [attempts]);

  // Đề mới nhất (để filter "Chưa làm đề mới nhất")
  const latestExam = useMemo(() => exams[0] || null, [exams]);

  // Build ma trận: StudentRow[]
  const matrixRows = useMemo((): StudentRow[] => {
    return students.map(student => {
      const userAttempts = attemptMap.get(student.uid);
      let completedCount = 0;
      let totalScore = 0;
      const cells: Record<string, CellData> = {};

      exams.forEach(exam => {
        const examAttempts = userAttempts?.get(exam.id!) || [];
        if (examAttempts.length === 0) {
          cells[exam.id!] = { status: 'not_started' };
        } else {
          // Tìm best score
          const bestAttempt = examAttempts.reduce((best, curr) =>
            curr.score > best.score ? curr : best
          );
          completedCount++;
          totalScore += bestAttempt.score;
          cells[exam.id!] = {
            status: 'completed',
            score: bestAttempt.score,
            attemptCount: examAttempts.length,
            bestAttempt: bestAttempt,
          };
        }
      });

      const totalExams = exams.length;
      const overallPercent = totalExams > 0 ? Math.round((completedCount / totalExams) * 100) : 0;
      const avgScore = completedCount > 0 ? totalScore / completedCount : 0;

      return { student, cells, completedCount, totalExams, overallPercent, avgScore };
    });
  }, [students, exams, attemptMap]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let rows = matrixRows;

    // Filter theo lớp
    if (selectedClass !== '__all__') {
      rows = rows.filter(r => r.student.className?.trim() === selectedClass);
    }

    // Filter theo search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.student.displayName?.toLowerCase().includes(q) ||
        r.student.email?.toLowerCase().includes(q)
      );
    }

    // Alert filters
    if (alertFilter === 'below50') {
      rows = rows.filter(r => r.overallPercent < 50);
    } else if (alertFilter === 'missingLatest' && latestExam?.id) {
      rows = rows.filter(r => r.cells[latestExam.id!]?.status === 'not_started');
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = (a.student.displayName || '').localeCompare(b.student.displayName || '', 'vi');
      } else if (sortBy === 'progress') {
        cmp = a.overallPercent - b.overallPercent;
      } else if (sortBy === 'score') {
        cmp = a.avgScore - b.avgScore;
      }
      return sortAsc ? cmp : -cmp;
    });

    return rows;
  }, [matrixRows, selectedClass, searchTerm, alertFilter, latestExam, sortBy, sortAsc]);

  // Stats tổng quan
  const stats = useMemo(() => {
    const activeRows = selectedClass === '__all__'
      ? matrixRows
      : matrixRows.filter(r => r.student.className?.trim() === selectedClass);

    const total = activeRows.length;
    const avgCompletion = total > 0
      ? Math.round(activeRows.reduce((s, r) => s + r.overallPercent, 0) / total)
      : 0;
    const avgScore = total > 0
      ? (activeRows.filter(r => r.completedCount > 0).reduce((s, r) => s + r.avgScore, 0) /
         Math.max(activeRows.filter(r => r.completedCount > 0).length, 1))
      : 0;
    const below50 = activeRows.filter(r => r.overallPercent < 50).length;

    return { total, avgCompletion, avgScore, below50 };
  }, [matrixRows, selectedClass]);

  // Toggle sort
  const handleSort = (key: 'name' | 'progress' | 'score') => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(key === 'name'); // name: A→Z, others: low→high
    }
  };

  const SortIcon = ({ field }: { field: typeof sortBy }) => {
    if (sortBy !== field) return null;
    return sortAsc
      ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ══════ HEADER ══════ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-3 bg-indigo-600/20 rounded-2xl">
              <BarChart3 className="w-7 h-7 text-indigo-400" />
            </div>
            THEO DÕI TIẾN ĐỘ HỌC SINH
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Ma trận tiến độ: Học sinh × Đề thi — Cập nhật realtime
          </p>
        </div>
      </div>

      {/* ══════ STATS CARDS ══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Tổng học sinh',
            value: isLoading ? null : stats.total.toString(),
            icon: Users,
            color: 'text-cyan-400',
            bg: 'bg-cyan-600/10 border-cyan-600/20',
          },
          {
            label: 'TB hoàn thành',
            value: isLoading ? null : `${stats.avgCompletion}%`,
            icon: TrendingUp,
            color: 'text-emerald-400',
            bg: 'bg-emerald-600/10 border-emerald-600/20',
          },
          {
            label: 'TB điểm số',
            value: isLoading ? null : stats.avgScore.toFixed(1),
            icon: Trophy,
            color: 'text-amber-400',
            bg: 'bg-amber-600/10 border-amber-600/20',
          },
          {
            label: 'Cần chú ý (<50%)',
            value: isLoading ? null : stats.below50.toString(),
            icon: AlertTriangle,
            color: stats.below50 > 0 ? 'text-red-400' : 'text-slate-400',
            bg: stats.below50 > 0 ? 'bg-red-600/10 border-red-600/20' : 'bg-slate-800 border-slate-700',
          },
        ].map(s => (
          <div key={s.label} className={cn('rounded-2xl p-4 border flex items-center gap-3', s.bg)}>
            <div className={cn('p-2 rounded-xl bg-slate-800/80 shrink-0', s.color)}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{s.label}</p>
              {s.value !== null ? (
                <p className={cn('text-lg font-black', s.color)}>{s.value}</p>
              ) : (
                <SkeletonNumber width="50px" height="20px" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ══════ KHU VỰC 1: PILL TABS CHỌN LỚP ══════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
          <GraduationCap className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          Nhóm lớp
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedClass('__all__')}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 border',
              selectedClass === '__all__'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
            )}
          >
            Tất cả ({students.length})
          </button>
          {classGroups.map(cls => {
            const count = students.filter(s => s.className?.trim() === cls).length;
            return (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 border',
                  selectedClass === cls
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                )}
              >
                {cls} ({count})
              </button>
            );
          })}
          {classGroups.length === 0 && !isLoading && (
            <p className="text-xs text-slate-600 py-2">
              Chưa có lớp nào. Gán lớp cho HS tại Danh Bạ Học Viên.
            </p>
          )}
        </div>
      </div>

      {/* ══════ KHU VỰC 2: ALERT FILTERS + SEARCH ══════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Alert filter buttons */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={() => setAlertFilter(alertFilter === 'below50' ? 'none' : 'below50')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border',
              alertFilter === 'below50'
                ? 'bg-red-600/15 border-red-500/40 text-red-400 shadow-lg shadow-red-600/10'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/30'
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            Hoàn thành &lt; 50%
            {alertFilter === 'below50' && (
              <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                {filteredRows.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setAlertFilter(alertFilter === 'missingLatest' ? 'none' : 'missingLatest')}
            disabled={!latestExam}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border',
              alertFilter === 'missingLatest'
                ? 'bg-amber-600/15 border-amber-500/40 text-amber-400 shadow-lg shadow-amber-600/10'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/30',
              !latestExam && 'opacity-50 cursor-not-allowed'
            )}
          >
            <FileWarning className="w-4 h-4" />
            Chưa làm đề mới nhất
            {alertFilter === 'missingLatest' && (
              <span className="bg-amber-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                {filteredRows.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Tìm theo tên, email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:border-indigo-500 outline-none transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ══════ LEGEND ══════ */}
      <div className="flex flex-wrap gap-4 items-center text-[11px] text-slate-500 font-medium">
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/40" /> Đã xong (kèm điểm)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          </div> Đang làm
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-slate-700/30 border border-slate-700/50 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          </div> Chưa đụng
        </span>
      </div>

      {/* ══════ KHU VỰC 3: MA TRẬN TIẾN ĐỘ ══════ */}
      {isLoading ? (
        <TableSkeleton />
      ) : exams.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 p-12 rounded-3xl text-center">
          <Trophy className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 font-bold">Chưa có đề thi nào được phát hành.</p>
          <p className="text-slate-600 text-sm mt-1">
            Tạo và phát hành đề tại Thư mục Đề Thi để bắt đầu theo dõi.
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 p-12 rounded-3xl text-center">
          <Users className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 font-bold">
            {students.length === 0
              ? 'Chưa có học sinh nào đăng ký.'
              : 'Không tìm thấy học sinh khớp bộ lọc.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto scrolling-touch">
            <table className="w-full text-sm text-left">
              {/* ── HEADER ── */}
              <thead className="bg-slate-800/80 border-b border-slate-700">
                <tr>
                  {/* STT */}
                  <th className="p-3 w-10 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky left-0 bg-slate-800/95 z-20 backdrop-blur-sm">
                    #
                  </th>
                  {/* Tên HS — Sticky */}
                  <th
                    className="p-3 min-w-[200px] text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white transition-colors sticky left-10 bg-slate-800/95 z-20 backdrop-blur-sm"
                    onClick={() => handleSort('name')}
                  >
                    Học sinh <SortIcon field="name" />
                  </th>
                  {/* Tiến Độ */}
                  <th
                    className="p-3 min-w-[120px] text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white transition-colors sticky left-[250px] bg-slate-800/95 z-20 backdrop-blur-sm"
                    onClick={() => handleSort('progress')}
                  >
                    Tiến độ <SortIcon field="progress" />
                  </th>
                  {/* TB Điểm */}
                  <th
                    className="p-3 w-20 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('score')}
                  >
                    TB <SortIcon field="score" />
                  </th>
                  {/* Columns: Đề thi */}
                  {exams.map(exam => (
                    <th
                      key={exam.id}
                      className="p-3 min-w-[60px] text-center"
                      title={exam.title}
                    >
                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider max-w-[80px] truncate mx-auto">
                        {exam.title.length > 12 ? exam.title.slice(0, 12) + '…' : exam.title}
                      </div>
                      {exam.id === latestExam?.id && (
                        <span className="text-[8px] font-bold text-indigo-400 block mt-0.5">MỚI</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── BODY ── */}
              <tbody>
                <AnimatePresence>
                  {filteredRows.map((row, idx) => (
                    <motion.tr
                      key={row.student.uid}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                      className={cn(
                        'border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group',
                        row.overallPercent < 50 && 'bg-red-600/[0.02]'
                      )}
                    >
                      {/* STT */}
                      <td className="p-3 text-xs text-slate-600 font-mono sticky left-0 bg-slate-900/95 z-10 backdrop-blur-sm group-hover:bg-slate-800/30">
                        {idx + 1}
                      </td>
                      {/* Tên HS — Sticky */}
                      <td className="p-3 sticky left-10 bg-slate-900/95 z-10 backdrop-blur-sm group-hover:bg-slate-800/30">
                        <div className="flex items-center gap-2.5">
                          {row.student.photoURL ? (
                            <img src={row.student.photoURL} alt="" className="w-7 h-7 rounded-full shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-[10px] shrink-0">
                              {(row.student.displayName || row.student.email)?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate max-w-[140px]">
                              {row.student.displayName || 'Chưa đặt tên'}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate max-w-[140px]">
                              {row.student.className || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Progress Bar */}
                      <td className="p-3 sticky left-[250px] bg-slate-900/95 z-10 backdrop-blur-sm group-hover:bg-slate-800/30">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={row.overallPercent} className="flex-1" />
                          <span className={cn(
                            'text-[10px] font-black min-w-[32px] text-right',
                            row.overallPercent >= 80 ? 'text-emerald-400' :
                            row.overallPercent >= 50 ? 'text-amber-400' :
                            'text-red-400'
                          )}>
                            {row.overallPercent}%
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-600 mt-0.5">
                          {row.completedCount}/{row.totalExams} đề
                        </p>
                      </td>
                      {/* TB Điểm */}
                      <td className="p-3 text-center">
                        {row.completedCount > 0 ? (
                          <span className={cn(
                            'text-sm font-black',
                            row.avgScore >= 8 ? 'text-emerald-400' :
                            row.avgScore >= 6.5 ? 'text-cyan-400' :
                            row.avgScore >= 5 ? 'text-amber-400' :
                            'text-red-400'
                          )}>
                            {row.avgScore.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      {/* ── CELLS: Traffic Light ── */}
                      {exams.map(exam => {
                        const cell = row.cells[exam.id!] || { status: 'not_started' };
                        return (
                          <td 
                            key={exam.id} 
                            className={cn(
                              "p-2 text-center",
                              cell.status === 'completed' && "cursor-pointer hover:bg-slate-800/80 transition-colors rounded-xl"
                            )}
                            onClick={() => {
                              if (cell.status === 'completed' && cell.bestAttempt && exam.questions) {
                                setReviewingData({
                                  test: { topic: exam.title, questions: exam.questions },
                                  answers: cell.bestAttempt.answers || {}
                                });
                              }
                            }}
                          >
                            <StatusBadge cell={cell} />
                          </td>
                        );
                      })}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {/* ── Footer: row count ── */}
          <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Hiển thị <strong className="text-white">{filteredRows.length}</strong> / {matrixRows.length} học sinh
              {selectedClass !== '__all__' && <> · Lớp <strong className="text-indigo-400">{selectedClass}</strong></>}
            </span>
            <span>{exams.length} đề thi đã phát hành</span>
          </div>
        </div>
      )}

      {/* ══════ MODAL REVIEW BÀI THI ══════ */}
      {reviewingData && (
        <ReviewExam
          test={reviewingData.test as any}
          answers={reviewingData.answers}
          onBack={() => setReviewingData(null)}
        />
      )}
    </div>
  );
};

export default TeacherDashboard;
