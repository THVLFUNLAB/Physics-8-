import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ResponsiveContainer, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  Radar,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip
} from 'recharts';
import { 
  Home, 
  Dumbbell, 
  LineChart, 
  User, 
  Clock, 
  Play, 
  CheckCircle2, 
  Swords,
  Wrench,
  ShieldAlert,
  Target,
  History,
  Trophy,
  Activity,
  AlertTriangle,
  FlaskConical,
  Award,
  Archive,
  ChevronRight,
  BrainCircuit,
  Zap,
  Star,
  Crown
} from 'lucide-react';

import { cn } from '../lib/utils';
import { getYCCDByGrade, YCCD } from '../data/yccdData';
import { UserProfile, Attempt, Exam } from '../types';
import CapabilityRadarChart, { buildRadarData, RadarAxisData } from './CapabilityRadarChart';

import { UserRankCard } from './UserRankCard';
import { BehavioralAnalysisChart } from './charts/BehavioralChart';
import KnowledgeGapGallery from './KnowledgeGapGallery';
import TeacherMessageModal from './TeacherMessageModal';
import { ExamsList } from './ExamsList';
import { toast } from './Toast';
import { MotivationalQuote } from './MotivationalQuote';
import { BackgroundMusic } from './BackgroundMusic';
import { CountdownTimer } from './CountdownTimer';
import InteractiveMascot from './InteractiveMascot';
import { GradeLeaderboard } from './GradeLeaderboard';
import { isVipUser } from '../lib/userUtils';

// --- SUB-COMPONENTS ---

const RadarChartComponent = ({ data, accentColor }: { data: any[], accentColor: string }) => {
  return (
    <div className="relative h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600 }} 
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke={accentColor}
            strokeWidth={2}
            fill={accentColor}
            fillOpacity={0.4}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

const TopicCard = ({ topic, accentVar, isExpanded, onToggle, onStartPrescription }: any) => {
  return (
    <motion.div 
      layout
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={cn(
        "bg-slate-900/60 backdrop-blur-md border rounded-2xl overflow-hidden min-w-[280px] sm:min-w-[320px] shrink-0",
        topic.isLowest 
          ? "border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]" 
          : "border-slate-700 hover:border-slate-500"
      )}
    >
      <div 
        className="p-5 cursor-pointer relative overflow-hidden"
        onClick={onToggle}
      >
        <div className={cn("absolute inset-0 opacity-10 blur-xl", accentVar)} />
        <div className="flex justify-between items-center relative z-10">
          <h3 className="font-bold text-white text-lg truncate pr-2" title={topic.title}>{topic.title}</h3>
          <span className={cn(
            "text-sm font-black",
            topic.progress < 50 ? "text-red-500" : 
            topic.progress < 80 ? "text-amber-500" : "text-emerald-500"
          )}>
            {topic.progress}%
          </span>
        </div>
        
        {/* Overall Progress Bar */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden relative z-10">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${topic.progress}%` }}
            className={cn(
              "h-full rounded-full",
              topic.progress < 50 ? "bg-red-500" : 
              topic.progress < 80 ? "bg-amber-500" : "bg-emerald-500"
            )}
          />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-800 bg-slate-950/50"
          >
            <div className="px-4 py-3 space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar">
              {topic.yccd.map((y: any) => (
                <div key={y.id} className="flex flex-col gap-1.5">
                  <div className="flex items-start gap-3">
                    {y.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0 mt-0.5" />
                    )}
                    <span className={cn(
                      "text-xs leading-relaxed", 
                      y.completed ? "text-slate-400 line-through" : "text-slate-200"
                    )} title={y.fullContent}>
                      {y.title}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 border-t border-slate-800/50">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onStartPrescription?.(topic.title, '');
                }}
                className={cn(
                  "w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-lg",
                  topic.isLowest 
                    ? "bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30 hover:shadow-red-500/20"
                    : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-500/30 hover:shadow-cyan-500/20"
                )}
              >
                <Play className="w-3.5 h-3.5" fill="currentColor" />
                LUYỆN TẬP CHUYÊN ĐỀ
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- MINI LEADERBOARD PREVIEW (top 3, dùng trên HOME) ---
import { collection, getDocs, query, orderBy, limit, where, getDoc, doc, addDoc, Timestamp } from 'firebase/firestore';
import { db as _db } from '../firebase';
import { getCurrentRank } from '../services/RankSystem';
import { ensureClusterIntegrity } from '../utils/clusterIntegrity';

const MiniLeaderboardPreview = ({ currentUser, onViewAll }: { currentUser: UserProfile; onViewAll: () => void }) => {
  const [top3, setTop3] = React.useState<UserProfile[]>([]);
  const gradePrefix = currentUser.className ? currentUser.className.substring(0, 2) : '12';

  React.useEffect(() => {
    const fetch = async () => {
      try {
        const q = query(collection(_db, 'users'), orderBy('stars', 'desc'), limit(200));
        const snap = await getDocs(q);
        const all = snap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile));
        setTop3(all.filter(u => u.className?.startsWith(gradePrefix)).slice(0, 3));
      } catch {}
    };
    fetch();
  }, [gradePrefix]);

  if (top3.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-400" /> TOP KHỐI {gradePrefix}
        </h2>
        <button onClick={onViewAll} className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
          Xem đầy đủ <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden">
        {top3.map((student, i) => {
          const isMe = student.uid === currentUser.uid;
          const rankInfo = getCurrentRank(student.stars || 0);
          return (
            <motion.div
              key={student.uid}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className={cn(
                'flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 transition-all',
                isMe ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
              )}
            >
              <span className="text-lg w-6 text-center">{medals[i]}</span>
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-sm">
                {student.displayName?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-black truncate', isMe ? 'text-blue-400' : 'text-white')}>
                  {student.displayName} {isMe && <span className="text-[10px] font-bold text-blue-400">(Bạn)</span>}
                </p>
                <p className="text-[10px] text-slate-500 font-bold uppercase">{student.className} · {rankInfo.name}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-black text-amber-400">{student.stars || 0}</span>
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

interface DashboardProps {
  user?: UserProfile;
  attempts?: Attempt[];
  onStartPrescription?: (topic: string, examId?: string) => void;
  onStartExam?: (exam: Exam) => void;
}

export const StudentDashboard = ({ user, attempts = [], onStartPrescription, onStartExam, onDownloadPDF }: DashboardProps) => {
  const defaultGrade = user?.className?.startsWith('12') ? '12' : user?.className?.startsWith('11') ? '11' : '10';
  const [activeGrade, setActiveGrade] = useState<'10' | '11' | '12'>(defaultGrade);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'HOME' | 'GYM' | 'ANALYTICS' | 'PROFILE'>('HOME');
  const [isGeneratingRemedial, setIsGeneratingRemedial] = useState(false);

  // ─── AUTO-REMEDIAL: Bốc câu sai cũ → tạo đề → auto-start ───
  const handleAutoRemedial = useCallback(async () => {
    if (!user || !onStartPrescription) return;
    setIsGeneratingRemedial(true);
    try {
      // 1. Lấy câu đến hạn SM-2
      let dueIds: string[] = [];
      try {
        const dueSnap = await getDocs(
          query(collection(_db, `users/${user.uid}/memoryLogs`), where('nextReviewDate', '<=', Timestamp.now()))
        );
        dueIds = dueSnap.docs.map(d => d.data().questionId as string);
      } catch {}

      // 2. Bổ sung câu sai cũ (failedQuestionIds)
      const legacyIds = Array.from(new Set([...dueIds, ...(user.failedQuestionIds || [])]));
      const selectedIds = legacyIds.sort(() => Math.random() - 0.5).slice(0, 10);

      if (selectedIds.length === 0) {
        toast.info('Chưa có câu sai nào trong hồ sơ! Hãy làm thêm bài để hệ thống phân tích.');
        setIsGeneratingRemedial(false);
        return;
      }

      // 3. Tải chi tiết câu hỏi
      const fetchedQuestions: any[] = [];
      for (let i = 0; i < selectedIds.length; i += 10) {
        const chunk = selectedIds.slice(i, i + 10);
        const snap = await getDocs(query(collection(_db, 'questions'), where('__name__', 'in', chunk)));
        snap.forEach(d => {
          // [FIX] Không lọc theo status — câu hỏi trong failedQuestionIds/SM-2
          // của HS luôn hợp lệ để luyện lại, kể cả khi admin đổi về draft tạm thời
          if (d.exists()) {
            fetchedQuestions.push({ ...d.data(), id: d.id });
          }
        });
      }

      if (fetchedQuestions.length === 0) {
        toast.error('Câu hỏi trong hồ sơ sai đã bị xóa khỏi hệ thống. Hãy làm thêm bài mới để bổ sung!');
        setIsGeneratingRemedial(false);
        return;
      }

      // 4. Cluster Integrity Guard — kéo đủ câu anh em + dữ kiện chung
      //    Đảm bảo HS không bao giờ thấy câu chùm thiếu context
      const intactQuestions = await ensureClusterIntegrity(fetchedQuestions, _db);

      // 5. Tạo exam doc trên Firestore
      const examTitle = `🩺 Vá Lỗ Hổng — ${new Date().toLocaleDateString('vi-VN')}`;
      const examRef = await addDoc(collection(_db, 'exams'), {
        title: examTitle,
        questions: intactQuestions.map(q => {
          const clean: Record<string, any> = { ...q };
          Object.keys(clean).forEach(k => { if (clean[k] === undefined) delete clean[k]; });
          return clean;
        }),
        createdAt: Timestamp.now(),
        createdBy: 'system_adaptive',
        type: 'AI_Diagnosis',
        targetStudentId: user.uid,
      });

      // 6. Auto-start đề thi ngay lập tức
      toast.success(`✅ Đã tạo đề vá lỗ hổng: ${intactQuestions.length} câu!`);
      onStartPrescription(examTitle, examRef.id);
    } catch (err) {
      console.error('[AutoRemedial]', err);
      toast.error('Lỗi tạo đề vá lỗ hổng. Vui lòng thử lại.');
    } finally {
      setIsGeneratingRemedial(false);
    }
  }, [user, onStartPrescription]);

  // ─── GAP VAULT: Bốc câu từ knowledgeGapVault → auto-start ───
  const handleGapVault = useCallback(async () => {
    if (!user || !onStartPrescription) return;
    const vaultIds = user.knowledgeGapVault || [];
    if (vaultIds.length === 0) {
      toast.info('Kho ôn tập trống! Bạn chưa lưu câu sai nào, hoặc đã vượt qua tất cả.');
      return;
    }
    setIsGeneratingRemedial(true);
    try {
      const selectedIds = vaultIds.sort(() => Math.random() - 0.5).slice(0, 10);
      const fetchedQuestions: any[] = [];
      for (let i = 0; i < selectedIds.length; i += 10) {
        const chunk = selectedIds.slice(i, i + 10);
        const snap = await getDocs(query(collection(_db, 'questions'), where('__name__', 'in', chunk)));
        snap.forEach(d => {
          // [FIX] Kho Ôn Tập: không lọc status — câu HS đã đánh dấu trong vault
          // vẫn hợp lệ để luyện dù admin có đổi về draft tạm thời
          if (d.exists()) {
            fetchedQuestions.push({ ...d.data(), id: d.id });
          }
        });
      }

      if (fetchedQuestions.length === 0) {
        toast.error('Câu hỏi trong Kho Ôn Tập đã bị xóa khỏi hệ thống. Hãy làm thêm bài mới để bổ sung!');
        setIsGeneratingRemedial(false);
        return;
      }

      // Cluster Integrity Guard — kéo đủ câu anh em + dữ kiện chung
      const intactQuestions = await ensureClusterIntegrity(fetchedQuestions, _db);

      const examTitle = `📦 Kho Ôn Tập Gap Vault — ${new Date().toLocaleDateString('vi-VN')}`;
      const examRef = await addDoc(collection(_db, 'exams'), {
        title: examTitle,
        questions: intactQuestions.map(q => {
          const clean: Record<string, any> = { ...q };
          Object.keys(clean).forEach(k => { if (clean[k] === undefined) delete clean[k]; });
          return clean;
        }),
        createdAt: Timestamp.now(),
        createdBy: 'system_gap_vault',
        type: 'AI_Diagnosis',
        targetStudentId: user.uid,
      });

      toast.success(`✅ Kho Ôn Tập: ${intactQuestions.length} câu đã sẵn sàng!`);
      onStartPrescription(examTitle, examRef.id);
    } catch (err) {
      console.error('[GapVault]', err);
      toast.error('Lỗi tải Kho Ôn Tập. Vui lòng thử lại.');
    } finally {
      setIsGeneratingRemedial(false);
    }
  }, [user, onStartPrescription]);

  const toggleTopic = (id: string) => {
    setExpandedTopics(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const getAccentConfig = (grade: string) => {
    switch (grade) {
      case '10': return { color: '#00F0FF', hex: 'text-cyan-400', bg: 'bg-cyan-400', border: 'border-cyan-400', glow: 'shadow-[0_0_15px_rgba(0,240,255,0.5)]' };
      case '11': return { color: '#B026FF', hex: 'text-fuchsia-500', bg: 'bg-fuchsia-500', border: 'border-fuchsia-500', glow: 'shadow-[0_0_15px_rgba(176,38,255,0.5)]' };
      case '12': return { color: '#FF3B30', hex: 'text-red-500', bg: 'bg-red-500', border: 'border-red-500', glow: 'shadow-[0_0_15px_rgba(255,59,48,0.5)]' };
      default: return { color: '#00F0FF', hex: 'text-cyan-400', bg: 'bg-cyan-400', border: 'border-cyan-400', glow: '' };
    }
  };

  const accent = getAccentConfig(activeGrade);

  // --- DYNAMIC DATA COMPUTATION ---
  const dynamicData = useMemo(() => {
    // 1. Radar Chart (Lớp 12): Dùng topicProgress từ Firestore qua buildRadarData
    //    → correctCount / totalQuestions (chính xác) thay vì parse testId string
    // Lớp 10/11: Giữ phương thức cũ (parse từ attempts) vì chưa có 4 mạch cố định
    const topicData: Record<string, { total: number, score: number }> = {};
    attempts.forEach(a => {
      let matchedTopic = "Khác";
      if (a.testId?.toLowerCase().includes("động học")) matchedTopic = "Động học";
      else if (a.testId?.toLowerCase().includes("động lực học")) matchedTopic = "Động lực học";
      else if (a.testId?.toLowerCase().includes("năng lượng")) matchedTopic = "Công-Năng lượng";
      else if (a.testId?.toLowerCase().includes("động lượng")) matchedTopic = "Động lượng";
      else if (a.testId?.toLowerCase().includes("dao động")) matchedTopic = "Dao động";
      else if (a.testId?.toLowerCase().includes("sóng")) matchedTopic = "Sóng";
      else if (a.testId?.toLowerCase().includes("điện trường") || a.testId?.toLowerCase().includes("điện thế")) matchedTopic = "Điện trường";
      else if (a.testId?.toLowerCase().includes("dòng điện")) matchedTopic = "Dòng điện";
      else if (a.testId?.toLowerCase().includes("nhiệt")) matchedTopic = "Vật lí nhiệt";
      else if (a.testId?.toLowerCase().includes("khí")) matchedTopic = "Khí lí tưởng";
      else if (a.testId?.toLowerCase().includes("từ")) matchedTopic = "Từ trường";
      else if (a.testId?.toLowerCase().includes("hạt nhân")) matchedTopic = "Hạt nhân";
      else matchedTopic = a.testId || "Chưa phân loại";

      if (!topicData[matchedTopic]) topicData[matchedTopic] = { total: 0, score: 0 };
      topicData[matchedTopic].total += 1;
      topicData[matchedTopic].score += a.score;
    });

    // 2a. Radar lớp 12: dùng CapabilityRadarChart với 4 trục cố định từ topicProgress
    const radarData12: RadarAxisData[] = buildRadarData(user?.learningPath?.topicProgress);

    // 2b. Radar lớp 10/11: Cố định các trục theo chuẩn GDPT 2018
    const grade10Topics = ['Động học', 'Động lực học', 'Công-Năng lượng', 'Động lượng', 'CĐ Tròn'];
    const grade11Topics = ['Dao động', 'Sóng', 'Điện trường', 'Dòng điện'];
    
    let radarMapLegacy: any[] = [];
    if (activeGrade === '10') {
      radarMapLegacy = grade10Topics.map(t => {
        const key = Object.keys(topicData).find(k => k.toLowerCase().includes(t.toLowerCase()) || (t === 'CĐ Tròn' && k.toLowerCase().includes('tròn')));
        const data = key ? topicData[key] : { score: 0, total: 0 };
        return {
          subject: t,
          score: data.total > 0 ? Math.min(100, Math.round((data.score / (data.total * 3)) * 100)) : 0,
          fullMark: 100 as const
        };
      });
    } else if (activeGrade === '11') {
      radarMapLegacy = grade11Topics.map(t => {
        const key = Object.keys(topicData).find(k => k.toLowerCase().includes(t.toLowerCase()));
        const data = key ? topicData[key] : { score: 0, total: 0 };
        return {
          subject: t,
          score: data.total > 0 ? Math.min(100, Math.round((data.score / (data.total * 3)) * 100)) : 0,
          fullMark: 100 as const
        };
      });
    }
    const radarMap = activeGrade === '12' ? radarData12 : radarMapLegacy;

    // 3. Build action path using real YCCD
    const yccdItems = getYCCDByGrade(activeGrade);
    const groupedYccd: Record<string, YCCD[]> = {};
    yccdItems.forEach(y => {
      if (!groupedYccd[y.topic]) groupedYccd[y.topic] = [];
      groupedYccd[y.topic].push(y);
    });

    const topicsList = Object.keys(groupedYccd).map(topicName => {
      const isCompleted = user?.learningPath?.completedTopics?.includes(topicName);
      const isWeakness = user?.learningPath?.weaknesses?.includes(topicName);
      
      // Calculate real deterministic progress based on attempts
      let calcedProgress = 0;
      // Find matching topic in topicData
      const tData = Object.entries(topicData).find(([key]) => topicName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(topicName.toLowerCase()));
      if (tData) {
         calcedProgress = Math.min(99, Math.round((tData[1].score / (tData[1].total * 3)) * 100)); // Cap at 99 unless explicitly completed
      }

      const topicProgress = isCompleted ? 100 : (isWeakness ? 30 : calcedProgress);

      return {
        id: `topic-${topicName}`,
        title: topicName,
        progress: topicProgress,
        isLowest: isWeakness || (topicProgress > 0 && topicProgress < 50),
        yccd: groupedYccd[topicName].map((y, index, array) => {
          // Deterministically check off YCCĐs based on progress percentage
          const threshold = (index + 1) / array.length * 100;
          const isYccdCompleted = isCompleted || (!isWeakness && topicProgress >= threshold);
          
          return {
            id: y.code,
            title: y.content.length > 60 ? y.content.substring(0, 60) + '...' : y.content,
            fullContent: y.content,
            progress: isYccdCompleted ? 100 : (isWeakness ? 30 : 0),
            completed: isYccdCompleted
          };
        })
      };
    });

    const battleModes = [
      {
        id: 'b1', title: 'Lệnh triệu tập hôm nay', desc: 'Kiểm tra năng lực tuần này',
        icon: Swords, color: 'text-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/50', glow: 'shadow-[0_0_15px_rgba(249,115,22,0.3)]',
        action: () => {
          const pending = user?.prescriptions?.find(p => p.status === 'pending');
          if (pending && onStartPrescription) {
            onStartPrescription(pending.title as string, pending.examId);
          } else {
            toast.success('Hiện không có lệnh triệu tập khẩn cấp nào! Hãy tự luyện tập nhé.');
          }
        }
      },
      {
        id: 'b2', title: 'Vá lỗ hổng gốc', desc: 'AI bốc câu sai → tạo đề → thi ngay',
        icon: ShieldAlert, color: 'text-red-500', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/50', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.3)]',
        action: handleAutoRemedial
      },
      {
        id: 'b3', title: 'Luyện đề thực chiến', desc: 'Mô phỏng THPT 2026 — thi ngay',
        icon: Wrench, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/50', glow: 'shadow-[0_0_15px_rgba(6,182,212,0.3)]',
        action: () => {
          if (onStartPrescription) {
            onStartPrescription('THPT', '');
          } else {
            toast.info('Đang tải danh sách Đề THPT phía dưới...');
          }
        }
      }
    ];

    // 4. Progress Area Chart Data
    const progressData = attempts.slice().reverse().map((a: any) => {
      let finalScore = a.score || 0;
      // Heuristic quy chuẩn điểm về hệ số 10: 
      // Nếu số điểm <= 3 (Đề mini 3 câu cũ), thì (score/3)*10
      // Nếu số điểm > 10 (Chấm số lượng câu đúng tuyệt đối, vd 25/40), thì (score/40)*10.
      if (finalScore <= 3 && Number.isInteger(finalScore)) {
         finalScore = (finalScore / 3) * 10;
      } else if (finalScore > 10) {
         finalScore = (finalScore / 40) * 10;
      }
      return {
        date: new Date(a.timestamp?.seconds * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        score: finalScore
      };
    });

    return { radarMap, radarData12, topicsList, battleModes, progressData };
  }, [activeGrade, attempts, user]);


  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden pb-24 relative">
      <InteractiveMascot />
      <BackgroundMusic className="fixed bottom-[90px] right-4" />
      {user && <TeacherMessageModal studentId={user.uid} />}
      {/* 1. TOP BAR: The Vital Zone */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between shadow-lg"
      >
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 mr-2">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden relative">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 relative z-10" />
            )}
            {!user?.photoURL && <div className={cn("absolute inset-0 opacity-20 bg-current", accent.hex)} />}
          </div>
          <div className="flex flex-col justify-center truncate relative z-10 w-[120px] sm:w-[250px] md:w-[350px]">
             <div className="flex items-center gap-2">
               <p className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                 {user?.tier === 'vip' ? '🔥 VIP' : 'Chiến binh'}
               </p>
               {user && user.tier !== 'vip' && (
                 <span className="text-[9px] font-black uppercase bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/30">
                   Lượt: {Math.max(0, (user.maxAttempts || 20) - (user.usedAttempts || 0))}
                 </span>
               )}
             </div>
             <p className="text-sm sm:text-base font-black font-headline truncate">
               {user?.displayName?.toUpperCase() || 'ẢNH VỆ'}
             </p>
          </div>
        </div>

        <div className="relative w-8 h-8 sm:w-10 sm:h-10 shrink-0 ml-2">
          <motion.div 
            animate={{ y: [0, -8, 0] }} 
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="absolute inset-0 flex items-center justify-center filter drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]"
          >
            <img 
              src="/thvl-bot.png" 
              alt="Mascot" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
              className="w-10 h-10 object-contain drop-shadow-xl" 
            />
            {/* Fallback Mascot Placeholder if image missing */}
            <div className="absolute inset-0 w-8 h-8 m-auto bg-cyan-400 rounded-lg flex items-center justify-center font-bold text-[10px] text-slate-950 -z-10">
               THVL
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* =========================================
          TAB: TRẠM CHÍNH (HOME) — Hook → Urgency → Action → Social → Depth
         ========================================= */}
      {activeTab === 'HOME' && (
        <div className="p-4 space-y-5 max-w-lg mx-auto animate-in fade-in duration-300">

          {/* ── TẦNG 1: HOOK — Rank Card ── */}
          {user && <UserRankCard user={user} />}

          {/* ── TẦNG 2: URGENCY — Countdown + Quote gọn ── */}
          <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full pointer-events-none" />
            {/* [FIX] Hiện CountdownTimer cho tất cả khối, không chỉ khối 12
                 Khối 12 thêm label rõ ràng; khối 10/11 cũng được xem đếm ngược để tạo urgency */}
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> ĐẾM NGƯỢC KỲ THI THPT 2026
            </p>
            <CountdownTimer />
            <MotivationalQuote />
          </div>

          {/* ── TẦNG 3: ACTION — 2 nút CTA lớn ── */}
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> NHIỆM VỤ HÔM NAY
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={isGeneratingRemedial}
                onClick={() => {
                  if (onStartPrescription) {
                    onStartPrescription('THPT', '');
                  }
                }}
                className="relative flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-gradient-to-br from-cyan-600/30 to-blue-700/20 border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-cyan-500/30 transition-all overflow-hidden group disabled:opacity-60"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                  <Swords className="w-6 h-6 text-cyan-400" />
                </div>
                <span className="text-xs font-black text-white text-center leading-tight">LUYỆN ĐỀ<br/>THỰC CHIẾN</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={isGeneratingRemedial}
                onClick={handleAutoRemedial}
                className="relative flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-gradient-to-br from-red-600/30 to-orange-700/20 border border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:shadow-red-500/30 transition-all overflow-hidden group disabled:opacity-60"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                  {isGeneratingRemedial ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full" /> : <ShieldAlert className="w-6 h-6 text-red-400" />}
                </div>
                <span className="text-xs font-black text-white text-center leading-tight">{isGeneratingRemedial ? 'ĐANG TẠO...' : <>VÁ LỖ<br/>HỔNG GỐC</>}</span>
              </motion.button>
            </div>
          </div>

          {/* ── TẦNG 4: SOCIAL — Mini Leaderboard Top 3 ── */}
          {user && <MiniLeaderboardPreview currentUser={user} onViewAll={() => setActiveTab('PROFILE')} />}

          {/* ── TẦNG 4b: LEADERBOARD ĐẦY ĐỦ — GradeLeaderboard ── */}
          {/* [FIX] Đây là component bị mất — khôi phục lại đúng vị trí trên tab HOME */}
          {user && <GradeLeaderboard currentUser={user} />}

          {/* ── TẦNG 5: DEPTH — Danh sách đề luyện tập ── */}
          {onStartExam && (
            <div className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" /> ĐỀ LUYỆN TẬP
              </h2>
              <ExamsList onStartExam={onStartExam} onDownloadPDF={onDownloadPDF} gradeFilter={Number(defaultGrade)} />
            </div>
          )}

        </div>
      )}

      {/* =========================================
          TAB: PHÒNG TẬP (GYM)
         ========================================= */}
      {activeTab === 'GYM' && (
        <div className="p-4 space-y-8 max-w-lg mx-auto animate-in fade-in duration-300">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col gap-4 mb-6 relative z-10">
              <div>
                <h3 className="font-headline font-bold text-2xl text-white flex items-center gap-3">
                  <Archive className="text-orange-500 w-6 h-6" />
                  Kho Ôn Tập Gap Vault
                </h3>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">Bộ sưu tập các câu hỏi AI chuyên biệt khôi phục lỗ hổng kiến thức hiện tại của bạn.</p>
              </div>
              <button 
                disabled={isGeneratingRemedial}
                onClick={handleGapVault}
                className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-500 text-white rounded-xl font-bold text-sm shadow-[0_0_15px_rgba(249,115,22,0.4)] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isGeneratingRemedial ? (
                  <>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ĐANG TẢI KHO...
                  </>
                ) : (
                  <>🎯 KHỞI ĐỘNG PHÒNG TẬP ({user?.knowledgeGapVault?.length || 0} câu)</>
                )}
              </button>
            </div>
            {/* Render the shared UI */}
            <KnowledgeGapGallery vaultIds={user?.knowledgeGapVault || []} />
          </div>
        </div>
      )}

      {/* =========================================
          TAB: PHÂN TÍCH (ANALYTICS) — Radar + Charts + Topics
         ========================================= */}
      {activeTab === 'ANALYTICS' && (
        <div className="p-4 space-y-6 max-w-lg mx-auto animate-in fade-in duration-300">

          {/* Grade Selector */}
          <div className="flex p-1 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 relative z-10">
            {['10', '11', '12'].map((grade) => {
              const isActive = activeGrade === grade;
              return (
                <button
                  key={grade}
                  onClick={() => setActiveGrade(grade as any)}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-black relative z-10 transition-colors duration-300",
                    isActive ? "text-slate-950" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="analyticsGradeTab"
                      className={cn("absolute inset-0 rounded-xl", activeGrade === '10' ? 'bg-cyan-400' : activeGrade === '11' ? 'bg-fuchsia-500' : 'bg-red-500')}
                      initial={false}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-20">KHỐI {grade}</span>
                </button>
              );
            })}
          </div>

          {/* Radar Chart */}
          <motion.div
            key={`radar-${activeGrade}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 relative"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Activity className={cn("w-4 h-4", accent.hex)} /> Radar Năng Lực
              </h3>
              <span className={cn("text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-md border", accent.hex, accent.border)}>
                {attempts.length} Lượt thi
              </span>
            </div>
            {activeGrade === '12' ? (
              // Lớp 12: Dùng CapabilityRadarChart 4 trục THPTQG với % chính xác
              <CapabilityRadarChart
                data={dynamicData.radarData12}
                accentColor={accent.color}
              />
            ) : dynamicData.radarMap && dynamicData.radarMap.length > 0 ? (
              // Lớp 10/11: Giữ radar cũ (multi-topic tự do)
              <RadarChartComponent data={dynamicData.radarMap} accentColor={accent.color} />
            ) : (
              <div className="h-[250px] w-full flex items-center justify-center text-slate-500 text-sm">
                Chưa đủ dữ liệu quét
              </div>
            )}
          </motion.div>

          {/* Topic Carousel / Battle mode */}
          <div className="space-y-3">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <Target className={cn("w-4 h-4", accent.hex)} />
              {activeGrade === '12' ? 'BATTLE MODE (THỰC CHIẾN)' : 'MỤC TIÊU HUẤN LUYỆN'}
            </h2>
            {/* Khối 12: Battle Modes */}
            {activeGrade === '12' && (
              <div className="grid grid-cols-1 w-full gap-4 px-1 mb-4">
                {dynamicData.battleModes?.map(mode => (
                  <motion.div
                    onClick={mode.action}
                    whileTap={{ scale: 0.98 }}
                    key={mode.id}
                    className={cn("p-5 rounded-2xl border flex items-center justify-between cursor-pointer backdrop-blur-md", mode.bgColor, mode.borderColor, mode.glow)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-slate-950/50 border", mode.borderColor)}>
                        <mode.icon className={cn("w-6 h-6", mode.color)} />
                      </div>
                      <div>
                        <h3 className="font-bold text-white mb-0.5">{mode.title}</h3>
                        <p className="text-xs text-slate-400">{mode.desc}</p>
                      </div>
                    </div>
                    <Play className={cn("w-5 h-5", mode.color)} />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Tất cả khối: Topic Cards Carousel (khối 12 cũng cần luyện theo chương) */}
            <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory -mx-4 px-4 custom-scrollbar">
              {dynamicData.topicsList?.map((topic) => (
                <div key={topic.id} className="snap-center">
                  <TopicCard
                    topic={topic}
                    accentVar={accent.bg}
                    isExpanded={expandedTopics.includes(topic.id)}
                    onToggle={() => toggleTopic(topic.id)}
                    onStartPrescription={onStartPrescription}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Area Chart — Tiến độ điểm số */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <h3 className="text-lg font-bold text-white flex items-center gap-2 font-headline mb-6 relative z-10">
              <History className="text-cyan-400 w-5 h-5" /> Tiến Độ Điểm Số
            </h3>
            <div className="h-[230px] w-full">
              {dynamicData.progressData && dynamicData.progressData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dynamicData.progressData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(100,116,139,0.3)', borderRadius: '16px' }}
                      itemStyle={{ color: '#06b6d4', fontWeight: 700 }}
                      formatter={(value: any) => [`${Number(value).toFixed(1)} điểm`, 'Điểm']}
                    />
                    <Area type="monotone" dataKey="score" stroke="#06b6d4" fillOpacity={1} fill="url(#colorScore)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 text-sm italic">
                  Chưa đủ dữ liệu. Hoàn thành tối thiểu 1 đề để xem tiến độ!
                </div>
              )}
            </div>
          </div>

          {/* Behavioral Analysis */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-6 font-headline relative z-10">
              <BrainCircuit className="text-fuchsia-400 w-5 h-5" /> Phân Tích Hành Vi Gốc
            </h3>
            <BehavioralAnalysisChart
              careless={user?.behavioralSummary?.careless || 0}
              fundamental={user?.behavioralSummary?.fundamental || 0}
            />
          </div>
        </div>
      )}

      {/* =========================================
          TAB: HỒ SƠ (PROFILE) — Leaderboard trước, rồi rank & info
         ========================================= */}
      {activeTab === 'PROFILE' && user && (
        <div className="p-4 space-y-6 max-w-lg mx-auto animate-in fade-in duration-300">

          {/* 1. Bảng xếp hạng — hấp dẫn nhất, lên trên đầu */}
          <GradeLeaderboard currentUser={user} />

          {/* 2. Rank Card cá nhân */}
          <UserRankCard user={user} />

          {/* 3. Lượt dùng thử */}
          <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl relative overflow-hidden">
            {isVipUser(user) ? (
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />
            ) : null}
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 z-10">
                <Target className={cn("w-4 h-4", isVipUser(user) ? "text-amber-500" : "text-slate-300")} />
                Lượt dùng thử nền tảng
                {isVipUser(user) ? (
                  <span className="ml-2 bg-gradient-to-r from-amber-400 to-amber-600 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">VIP</span>
                ) : null}
              </h3>
              <span className={cn(
                "text-xs font-black z-10",
                isVipUser(user) ? "text-amber-500 text-lg" :
                (user.usedAttempts || 0) > 25 ? "text-red-500" :
                (user.usedAttempts || 0) >= 20 ? "text-amber-500" :
                "text-emerald-500"
              )}>
                {isVipUser(user) ? '∞' : `${user.usedAttempts || 0} / 20`}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden relative z-10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: isVipUser(user) ? '100%' : `${Math.min(100, ((user.usedAttempts || 0) / 20) * 100)}%` }}
                className={cn(
                  "h-full rounded-full relative",
                  isVipUser(user) ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300" :
                  (user.usedAttempts || 0) > 25 ? "bg-gradient-to-r from-red-600 via-red-500 to-rose-400" :
                  (user.usedAttempts || 0) >= 20 ? "bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400" :
                  "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400"
                )}
              />
            </div>
          </div>

          {/* 4. Lịch sử kê đơn */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 font-headline mb-4 relative z-10">
              <FlaskConical className="text-amber-500 w-5 h-5" /> Lịch Sử Kê Đơn Lộ Trình
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {user.prescriptions?.map((p, i) => (
                <div
                  key={i}
                  onClick={p.status === 'pending' ? () => onStartPrescription?.(p.title as string, p.examId) : undefined}
                  className={cn(
                    "flex flex-col p-3 border rounded-2xl transition-all",
                    p.status === 'pending'
                      ? "bg-amber-600/5 border-amber-600/30 hover:border-amber-400 cursor-pointer"
                      : "bg-slate-950/50 border-slate-800"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 shrink-0 rounded-xl flex items-center justify-center", p.status === 'completed' ? "bg-green-600/10 text-green-500" : "bg-amber-600/10 text-amber-500")}>
                      {p.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <History className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 truncate">
                      <p className="text-sm font-bold text-white truncate">{p.title}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">Giao: {new Date(p.assignedAt?.seconds * 1000).toLocaleDateString('vi-VN')}</p>
                    </div>
                  </div>
                </div>
              ))}
              {(!user.prescriptions || user.prescriptions.length === 0) && (
                <div className="text-center py-6 text-slate-600 italic text-sm">Hồ sơ kê đơn trống.</div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800/80 pb-safe pt-2 px-6"
      >
        <div className="max-w-lg mx-auto flex justify-between items-center pb-2">
          {[
            { id: 'HOME', icon: Home, label: 'Trạm chính' },
            { id: 'GYM', icon: Dumbbell, label: 'Phòng Tập' },
            { id: 'ANALYTICS', icon: LineChart, label: 'Phân Tích' },
            { id: 'PROFILE', icon: User, label: 'Hồ Sơ' }
          ].map((item: any) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 w-16 transition-colors",
                  isActive ? accent.hex : "text-slate-500 hover:text-slate-400"
                )}
              >
                <div className={cn("p-1.5 rounded-xl transition-all relative", isActive ? `${accent.bg} bg-opacity-20` : "bg-transparent")}>
                  {isActive && <motion.div layoutId="navIndicator" className="absolute inset-0 bg-current opacity-20 rounded-xl" />}
                  <item.icon className="w-5 h-5 relative z-10" />
                </div>
                <span className={cn("text-[9px] font-bold uppercase", isActive && "tracking-wider")}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

    </div>
  );
};

export default StudentDashboard;
