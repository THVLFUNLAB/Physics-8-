import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  db, auth, collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, onSnapshot, Timestamp
} from '../firebase';
import { UserProfile, Attempt, Question, Exam, Topic, Prescription } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from './Toast';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  BrainCircuit,
  AlertTriangle,
  Zap,
  Target,
  TrendingUp,
  Shield,
  Pill,
  Loader2,
  CheckCircle2,
  XCircle,
  BookOpen,
  Sparkles,
} from 'lucide-react';

// ══════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════

interface TopicMastery {
  topic: string;
  totalQuestions: number;
  correctCount: number;
  correctRate: number; // 0-100
}

interface AdaptiveDashboardProps {
  user: UserProfile;
  attempts: Attempt[];
  onStartAdaptiveTest?: (questions: Question[], config: any, assessment: any) => void;
}

// ══════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════

const AdaptiveDashboard: React.FC<AdaptiveDashboardProps> = ({ user, attempts, onStartAdaptiveTest }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrescription, setGeneratedPrescription] = useState<string | null>(null);

  // ── Helper: Lấy số khối lớp từ className vì Firestore không lưu riêng trường grade ──
  // Dùng match(/^\d+/) để chỉ lấy phần số ở đầu: "12A1" → "12" → 12
  // KHÔNG dùng replace(/\D/g,'') vì "12A1" → "121" (sai!)
  const gradeNumber: number = user.grade
    ?? parseInt(user.className?.match(/^\d+/)?.[0] || '12', 10);

  // ══════════════════════════════════════════
  //  KHU VỰC 1: RADAR MASTERY
  //  Tính toán tỷ lệ đúng theo từng topic
  // ══════════════════════════════════════════

  const topicMastery: TopicMastery[] = useMemo(() => {
    if (attempts.length === 0) return [];

    const topicMap: Record<string, { total: number; correct: number }> = {};

    for (const attempt of attempts) {
      // Each attempt has an analysis with errorTracking per question
      // The testId is the topic name
      const topic = attempt.testId || 'Chưa phân loại';

      if (!topicMap[topic]) topicMap[topic] = { total: 0, correct: 0 };

      // Count total questions and correct ones from answers
      const answerEntries = Object.entries(attempt.answers || {});
      topicMap[topic].total += answerEntries.length;

      // Use analysis.errorTracking to detect wrong answers
      const errorKeys = new Set(Object.keys(attempt.analysis?.errorTracking || {}));

      for (const [qId] of answerEntries) {
        if (!errorKeys.has(qId)) {
          topicMap[topic].correct += 1;
        }
      }
    }

    return Object.entries(topicMap)
      .map(([topic, data]) => ({
        topic,
        totalQuestions: data.total,
        correctCount: data.correct,
        correctRate: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.totalQuestions - a.totalQuestions);
  }, [attempts]);

  // Radar chart data
  const radarData = useMemo(() => {
    return topicMastery.map(m => ({
      subject: m.topic.length > 12 ? m.topic.substring(0, 12) + '…' : m.topic,
      fullSubject: m.topic,
      mastery: m.correctRate,
      fullMark: 100,
    }));
  }, [topicMastery]);

  // ══════════════════════════════════════════
  //  KHU VỰC 2: RED ZONES
  //  Top 3 topics có tỉ lệ đúng < 50%
  // ══════════════════════════════════════════

  const redZones = useMemo(() => {
    return topicMastery
      .filter(m => m.correctRate < 50 && m.totalQuestions >= 2)
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 3);
  }, [topicMastery]);

  const handleStartTargetExam = useCallback(async (competency: '6+' | '7+' | '8+' | '9+') => {
    // [YÊU CẦU NGHIÊM NGẶT]: Chỉ áp dụng cho lớp 12 nếu là 8+ hoặc 9+
    if ((competency === '8+' || competency === '9+') && gradeNumber !== 12) {
      toast.error('Tính năng Sinh đề Đánh giá năng lực 8+/9+ hiện CHỈ hỗ trợ môn Vật lý lớp 12 (Chương trình GDPT 2018).');
      return;
    }

    setIsGenerating(true);
    setGeneratedPrescription(null);

    try {
      const { generateDynamicExam, generateAdvancedQuestions } = await import('../services/examGeneratorService');
      
      let questions: Question[] = [];
      let config: any;

      if (competency === '8+' || competency === '9+') {
        // [MODULE 2.1]: Sinh đề chuyên sâu Vận dụng / VDC cho lớp 12
        const count = competency === '9+' ? 5 : 10;
        
        // ── [FAILSAFE] Bọc toàn bộ trong try/catch riêng biệt ──
        try {
          questions = await generateAdvancedQuestions(competency, count);
        } catch (genErr: any) {
          console.error(`[generateAdvancedQuestions] Lỗi fetch ${competency}:`, genErr);
          toast.error(`Lỗi truy xuất câu hỏi ${competency}: ${genErr.message || 'Không xác định'}`);
          return;
        }

        // ── [FAILSAFE] Kiểm tra mảng kết quả trước khi dùng ──
        if (!Array.isArray(questions) || questions.length === 0) {
          toast.error(
            competency === '9+'
              ? 'Kho VDC 9+ (Nhiệt/Khí/Từ/Hạt nhân) chưa có câu đủ tiêu chuẩn. Thầy sẽ bổ sung sớm!'
              : `Kho dữ liệu lớp 12 hiện chưa có câu hỏi ${competency} phù hợp.`
          );
          return;
        }

        toast.success(`Đã trích xuất ${questions.length} câu "Ổ khóa" ${competency} (Vật lý 12 - CT 2018)!`);
        
        config = {
          examType: `advanced_${competency}`,
          timeLimit: count * 5, // 5 phút cho mỗi câu VDC
        };
      } else {
        // [MODULE 2]: Sinh đề theo Ma trận chuẩn cho 6+ và 7+
        const matrixFormulaId = `matrix_${competency.replace('+', 'plus')}_grade${gradeNumber}`;
        
        let result: any;
        try {
          result = await generateDynamicExam({
            matrixFormulaId,
            targetGrade: gradeNumber,
            sourceMode: 'flexible'
          });
        } catch (genErr: any) {
          console.error(`[generateDynamicExam] Lỗi tạo đề ${competency}:`, genErr);
          toast.error(`Lỗi sinh đề ${competency}: ${genErr.message || 'Không xác định'}`);
          return;
        }

        // ── [FAILSAFE] Kiểm tra kết quả ──
        if (!result || !Array.isArray(result.questions) || result.questions.length === 0) {
          toast.error(`Không thể tạo đề ${competency}. Kho câu hỏi khối ${gradeNumber} hiện tại chưa đủ. Hãy thử lại sau!`);
          return;
        }

        if (result.warnings && result.warnings.length > 0) {
          console.warn('[ExamGenerator Warnings]:', result.warnings);
        }

        questions = result.questions;
        toast.success(`Hệ thống đã tạo đề mục tiêu ${competency} (Khối ${gradeNumber}) với ${questions.length} câu!`);
        
        config = {
          examType: `dynamic_${competency}`, // e.g., 'dynamic_6+'
          timeLimit: 50, // 50 phút chuẩn 2025
        };
      }

      // ══════════════════════════════════════════════════════
      //  [FAILSAFE TUYỆT ĐỐI] — Triple-check trước khi start
      //  KHÔNG BAO GIỜ gọi onStartAdaptiveTest với mảng rỗng
      //  → nguyên nhân chính gây crash trắng trang
      // ══════════════════════════════════════════════════════
      if (!Array.isArray(questions) || questions.length === 0) {
        console.error('[AdaptiveDashboard] Phát hiện mảng câu hỏi rỗng trước khi start — hủy để tránh crash!');
        toast.error('Không thể khởi động bài thi: Danh sách câu hỏi trống. Vui lòng thử lại.');
        return;
      }

      // Render bài thi ra giao diện
      if (onStartAdaptiveTest) {
        onStartAdaptiveTest(questions, config, null);
      }
    } catch (err: any) {
      console.error('[ExamGenerator]', err);
      toast.error('Lỗi khởi tạo đề: ' + (err.message || 'Không xác định'));
    } finally {
      // LUÔN reset isGenerating dù thành công hay thất bại
      setIsGenerating(false);
    }
  }, [user, gradeNumber, onStartAdaptiveTest]);

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════

  const hasData = attempts.length > 0 && topicMastery.length > 0;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-fuchsia-600/20 to-violet-600/20 rounded-2xl">
              <BrainCircuit className="w-7 h-7 text-fuchsia-400" />
            </div>
            LỘ TRÌNH CÁ NHÂN HÓA
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            AI phân tích lịch sử làm bài → phát hiện vùng yếu → tự động kê đơn luyện tập
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl">
          <BookOpen className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-400">
            {attempts.length} bài đã phân tích
          </span>
        </div>
      </div>

      {!hasData ? (
        /* ── Empty State ── */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center"
        >
          <div className="w-24 h-24 mx-auto bg-slate-800 rounded-3xl flex items-center justify-center mb-6">
            <Target className="w-12 h-12 text-slate-600" />
          </div>
          <h4 className="text-xl font-black text-white mb-2">Chưa có dữ liệu phân tích</h4>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Hãy làm ít nhất 1-2 bài thi để hệ thống có dữ liệu phân tích vùng mạnh/yếu.
            Số liệu càng nhiều, chẩn đoán càng chính xác.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══════════════════════════════════════
              KHU VỰC 1: RADAR MASTERY CHART
          ═══════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-lg font-black text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-fuchsia-400" />
                  Radar Mastery
                </h4>
                <p className="text-xs text-slate-500 mt-1">Tỷ lệ trả lời đúng (%) theo chủ đề</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-fuchsia-600/10 border border-fuchsia-600/30 rounded-xl">
                <Sparkles className="w-3 h-3 text-fuchsia-400" />
                <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest">
                  {topicMastery.length} chủ đề
                </span>
              </div>
            </div>

            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid
                    stroke="#334155"
                    strokeDasharray="3 3"
                  />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickCount={5}
                  />
                  <Radar
                    name="Mastery %"
                    dataKey="mastery"
                    stroke="#c026d3"
                    fill="#c026d3"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#c026d3', strokeWidth: 0 }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value}%`,
                      props.payload?.fullSubject || 'Mastery',
                    ]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Topic Legend */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
              {topicMastery.map(m => (
                <div
                  key={m.topic}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-xl text-xs border",
                    m.correctRate >= 80
                      ? "bg-green-600/5 border-green-600/20 text-green-400"
                      : m.correctRate >= 50
                        ? "bg-blue-600/5 border-blue-600/20 text-blue-400"
                        : "bg-red-600/5 border-red-600/20 text-red-400"
                  )}
                >
                  <span className="font-bold truncate mr-2">{m.topic}</span>
                  <span className="font-black shrink-0">{m.correctRate}%</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ═══════════════════════════════════════
              KHU VỰC 2 + 3: RED ZONES + AUTO REMEDIAL
          ═══════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* ── RED ZONES ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h4 className="text-lg font-black text-white flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Vùng Nguy Hiểm
              </h4>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                Chủ đề &lt; 50% đúng — cần ôn gấp
              </p>

              {redZones.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-bold text-green-400">Tuyệt vời!</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Không có vùng nào dưới 50%. Tiếp tục phát huy!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {redZones.map((rz, idx) => (
                    <motion.div
                      key={rz.topic}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      className="p-4 bg-red-600/5 border border-red-600/20 rounded-2xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs",
                            idx === 0 ? "bg-red-600/20 text-red-400" :
                            idx === 1 ? "bg-orange-600/20 text-orange-400" :
                            "bg-amber-600/20 text-amber-400"
                          )}>
                            {idx + 1}
                          </div>
                          <span className="text-sm font-bold text-white">{rz.topic}</span>
                        </div>
                        <span className="text-xl font-black text-red-400">
                          {rz.correctRate}%
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${rz.correctRate}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className={cn(
                            "h-full rounded-full",
                            rz.correctRate < 25 ? "bg-red-500" :
                            rz.correctRate < 40 ? "bg-orange-500" :
                            "bg-amber-500"
                          )}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {rz.correctCount}/{rz.totalQuestions} câu đúng
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* ── DYNAMIC EXAM GENERATOR 2025 ── */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h4 className="text-lg font-black text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-fuchsia-400" />
                Sinh Đề Ma Trận 2025
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Hệ thống tự động bốc và xáo trộn câu hỏi từ ngân hàng theo đúng cấu trúc Ma trận 2025 của Bộ GD&ĐT (Khối {user.grade || '...'}). 
                Chọn mục tiêu điểm số để bắt đầu:
              </p>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={() => handleStartTargetExam('6+')}
                  disabled={isGenerating}
                  className="p-4 bg-emerald-600/10 border border-emerald-600/20 hover:bg-emerald-600/20 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <span className="text-2xl font-black text-emerald-400">6+</span>
                  <span className="text-[10px] text-emerald-500/70 uppercase font-bold tracking-wider">Tốt Nghiệp</span>
                </button>
                <button
                  onClick={() => handleStartTargetExam('7+')}
                  disabled={isGenerating}
                  className="p-4 bg-blue-600/10 border border-blue-600/20 hover:bg-blue-600/20 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <span className="text-2xl font-black text-blue-400">7+</span>
                  <span className="text-[10px] text-blue-500/70 uppercase font-bold tracking-wider">Khá</span>
                </button>
                <button
                  onClick={() => handleStartTargetExam('8+')}
                  disabled={isGenerating}
                  className="p-4 bg-amber-600/10 border border-amber-600/20 hover:bg-amber-600/20 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <span className="text-2xl font-black text-amber-400">8+</span>
                  <span className="text-[10px] text-amber-500/70 uppercase font-bold tracking-wider">Đại Học</span>
                </button>
                <button
                  onClick={() => handleStartTargetExam('9+')}
                  disabled={isGenerating}
                  className="p-4 bg-rose-600/10 border border-rose-600/20 hover:bg-rose-600/20 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98] relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-rose-600/0 via-white/10 to-rose-600/0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]"></div>
                  <span className="text-2xl font-black text-rose-400 flex items-center gap-1">
                    9+
                    <Zap className="w-4 h-4 text-rose-500" />
                  </span>
                  <span className="text-[10px] text-rose-500/70 uppercase font-bold tracking-wider">Thủ Khoa</span>
                </button>
              </div>

              {isGenerating && (
                <div className="mt-4 p-3 bg-fuchsia-600/10 border border-fuchsia-600/20 rounded-xl flex items-center justify-center gap-2 text-fuchsia-400 text-sm font-bold animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang khởi tạo cấu trúc đề 2025...
                </div>
              )}
            </div>

            {/* ── MASTERY OVERVIEW ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Tổng quan Mastery
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-green-600/5 rounded-xl border border-green-600/20">
                  <p className="text-2xl font-black text-green-400">
                    {topicMastery.filter(m => m.correctRate >= 80).length}
                  </p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">Thạo</p>
                </div>
                <div className="text-center p-3 bg-blue-600/5 rounded-xl border border-blue-600/20">
                  <p className="text-2xl font-black text-blue-400">
                    {topicMastery.filter(m => m.correctRate >= 50 && m.correctRate < 80).length}
                  </p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">Ổn</p>
                </div>
                <div className="text-center p-3 bg-red-600/5 rounded-xl border border-red-600/20">
                  <p className="text-2xl font-black text-red-400">
                    {topicMastery.filter(m => m.correctRate < 50).length}
                  </p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">Yếu</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AdaptiveDashboard;
