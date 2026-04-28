import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, onSnapshot, query, orderBy, limit } from '../firebase';
import { Exam } from '../types';
import { Play, ChevronDown, BookOpen, Zap, Brain, FlaskConical, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ExamsListProps {
  onStartExam: (exam: Exam) => void;
  /** Khi truyền vào, ExamsList sẽ tự lock cứng vào khối đó và ẩn bộ tab filter */
  gradeFilter?: number;
}

// ── Xác định nhóm và icon cho từng loại đề ──
const getExamGroup = (exam: Exam): string => {
  const type = exam.type || '';
  const title = (exam.title || '').toLowerCase();

  if (type === 'AI_Diagnosis') return 'Đề AI Chẩn Đoán';
  if (type === 'Dynamic') return 'Đề Thích Ứng';
  if (title.includes('kiểm tra') || title.includes('kiem tra')) return 'Kiểm Tra';
  if (title.includes('thpt') || title.includes('tốt nghiệp')) return 'Luyện Thi THPT';
  if (title.includes('chương') || title.includes('chuong')) return 'Ôn Tập Chương';
  if (type === 'Matrix') return 'Đề Ma Trận';
  if (type === 'Digitized') return 'Đề Số Hóa';
  return 'Bài Kiểm Tra';
};

const groupIcons: Record<string, React.ElementType> = {
  'Đề AI Chẩn Đoán': Brain,
  'Đề Thích Ứng': Zap,
  'Kiểm Tra': FileText,
  'Luyện Thi THPT': BookOpen,
  'Ôn Tập Chương': FlaskConical,
  'Đề Ma Trận': FileText,
  'Đề Số Hóa': FileText,
  'Bài Kiểm Tra': FileText,
};

const groupColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  'Đề AI Chẩn Đoán': { bg: 'bg-fuchsia-500/5', border: 'border-fuchsia-500/20', text: 'text-fuchsia-400', badge: 'bg-fuchsia-500' },
  'Đề Thích Ứng': { bg: 'bg-cyan-500/5', border: 'border-cyan-500/20', text: 'text-cyan-400', badge: 'bg-cyan-500' },
  'Kiểm Tra': { bg: 'bg-red-500/5', border: 'border-red-500/20', text: 'text-red-400', badge: 'bg-red-500' },
  'Luyện Thi THPT': { bg: 'bg-amber-500/5', border: 'border-amber-500/20', text: 'text-amber-400', badge: 'bg-amber-500' },
  'Ôn Tập Chương': { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-400', badge: 'bg-emerald-500' },
  'Đề Ma Trận': { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', badge: 'bg-blue-500' },
  'Đề Số Hóa': { bg: 'bg-violet-500/5', border: 'border-violet-500/20', text: 'text-violet-400', badge: 'bg-violet-500' },
  'Bài Kiểm Tra': { bg: 'bg-slate-500/5', border: 'border-slate-500/20', text: 'text-slate-400', badge: 'bg-slate-500' },
};

export const ExamsList: React.FC<ExamsListProps> = ({ onStartExam, gradeFilter }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<number | null>(gradeFilter ?? null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Listen for exams in realtime, ordered by creation time
    const q = query(collection(db, 'exams'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedExams: Exam[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Chỉ hiển thị đề đã phát hành (published=true) hoặc đề cũ chưa có trường published
        if (data.published === true || data.published === undefined) {
          fetchedExams.push({ id: doc.id, ...data } as Exam);
        }
      });
      setExams(fetchedExams);
      setLoading(false);
    }, (error) => {
      console.error("Lỗi lấy danh sách bài kiểm tra:", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Nếu gradeFilter được truyền từ props → lock cứng, không cho user chuyển tab
  const activeFilter = gradeFilter ?? selectedGradeFilter;
  const filteredExams = activeFilter 
    ? exams.filter(e => e.targetGrade === activeFilter)
    : exams;

  // Nhóm exams theo loại
  const groupedExams = useMemo(() => {
    const groups: Record<string, Exam[]> = {};
    for (const exam of filteredExams) {
      const group = getExamGroup(exam);
      if (!groups[group]) groups[group] = [];
      groups[group].push(exam);
    }
    return groups;
  }, [filteredExams]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Auto-expand first group on initial load
  useEffect(() => {
    const groups = Object.keys(groupedExams);
    if (groups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set([groups[0]]));
    }
  }, [groupedExams]);

  return (
    <div className="mt-16 space-y-8 relative z-10 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-widest font-headline">
          <span className="w-2 h-8 bg-red-600 rounded-full" />
          Danh sách bài kiểm tra
        </h3>
        
        {/* Chỉ hiển thị bộ tab lọc khi KHÔNG có gradeFilter cứng từ props */}
        {!gradeFilter && (
          <div className="flex bg-slate-800/50 p-1.5 rounded-xl border border-slate-700/50 overflow-x-auto w-full md:w-auto">
            {[
              { label: 'Tất cả', value: null },
              { label: 'Khối 12', value: 12 },
              { label: 'Khối 11', value: 11 },
              { label: 'Khối 10', value: 10 }
            ].map(tab => (
              <button
                key={tab.label}
                onClick={() => setSelectedGradeFilter(tab.value)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex-1 md:flex-none",
                  selectedGradeFilter === tab.value 
                    ? "bg-red-600 text-white shadow-lg shadow-red-600/20" 
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl text-center text-slate-500">
          Chưa có bài kiểm tra nào được phát hành cho khối này.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedExams).map(([groupName, groupExams]) => {
            const isExpanded = expandedGroups.has(groupName);
            const Icon = groupIcons[groupName] || FileText;
            const colors = groupColors[groupName] || groupColors['Bài Kiểm Tra'];

            return (
              <div key={groupName} className={cn(
                "rounded-2xl border overflow-hidden transition-all duration-300",
                isExpanded ? colors.border : "border-slate-800",
                isExpanded ? colors.bg : "bg-slate-900/60"
              )}>
                {/* Accordion Header */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className={cn(
                    "w-full flex items-center justify-between px-5 py-4 transition-all group/header",
                    "hover:bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center border transition-colors",
                      isExpanded ? `${colors.bg} ${colors.border}` : "bg-slate-800/80 border-slate-700"
                    )}>
                      <Icon className={cn("w-5 h-5", isExpanded ? colors.text : "text-slate-500")} />
                    </div>
                    <div className="text-left">
                      <h4 className={cn(
                        "font-black text-sm uppercase tracking-wider transition-colors",
                        isExpanded ? "text-white" : "text-slate-300"
                      )}>
                        {groupName}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                        {groupExams.length} đề
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-black text-white",
                      colors.badge
                    )}>
                      {groupExams.length}
                    </span>
                    <ChevronDown className={cn(
                      "w-5 h-5 text-slate-500 transition-transform duration-300",
                      isExpanded && "rotate-180"
                    )} />
                  </div>
                </button>

                {/* Accordion Content */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-1.5">
                        {groupExams.map((exam, i) => (
                          <motion.div
                            key={exam.id || i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className={cn(
                              "flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all group/item cursor-pointer",
                              "bg-slate-950/50 border-slate-800/60 hover:border-slate-600 hover:bg-slate-900/80"
                            )}
                            onClick={() => onStartExam(exam)}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Index Badge */}
                              <span className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-400 shrink-0">
                                {i + 1}
                              </span>
                              {/* Title + Meta */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-200 truncate group-hover/item:text-white transition-colors">
                                  {exam.title || exam.type || 'ĐỀ KIỂM TRA'}
                                </p>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-[10px] text-slate-500 font-bold">
                                    {exam.questions?.length || 0} câu
                                  </span>
                                  {exam.targetGrade && (
                                    <span className="text-[10px] text-yellow-500/80 font-bold">
                                      Khối {exam.targetGrade}
                                    </span>
                                  )}
                                  {i === 0 && (
                                    <span className="text-[9px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Mới
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* CTA */}
                            <button
                              onClick={(e) => { e.stopPropagation(); onStartExam(exam); }}
                              className={cn(
                                "shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                "bg-slate-800 border border-slate-700 text-slate-300",
                                "hover:bg-red-600 hover:border-red-500 hover:text-white hover:shadow-lg hover:shadow-red-600/20"
                              )}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span className="hidden sm:inline">Làm bài</span>
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
