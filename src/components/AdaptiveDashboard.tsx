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
}

// ══════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════

const AdaptiveDashboard: React.FC<AdaptiveDashboardProps> = ({ user, attempts }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrescription, setGeneratedPrescription] = useState<string | null>(null);

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

  // ══════════════════════════════════════════
  //  KHU VỰC 3: AUTO-REMEDIAL TRIGGER
  //  Query questions → random 10 → create exam
  // ══════════════════════════════════════════

  const handleAutoRemedial = useCallback(async () => {
    if (redZones.length === 0) {
      toast.info('Chưa phát hiện vùng yếu! Hãy làm thêm bài để hệ thống phân tích.');
      return;
    }

    setIsGenerating(true);
    setGeneratedPrescription(null);

    try {
      // 1. Get weak topics
      const weakTopics = redZones.map(rz => rz.topic);
      const failedIds = new Set(user.failedQuestionIds || []);

      // 2. Collect question IDs that this student already answered correctly
      const correctQuestionIds = new Set<string>();
      for (const attempt of attempts) {
        const errorKeys = new Set(Object.keys(attempt.analysis?.errorTracking || {}));
        for (const [qId] of Object.entries(attempt.answers || {})) {
          if (!errorKeys.has(qId)) {
            correctQuestionIds.add(qId);
          }
        }
      }

      // 3. Query questions from Firestore by weak topics
      const failedCandidates: Question[] = [];
      const newCandidates: Question[] = [];
      
      for (const topic of weakTopics) {
        const qSnap = await getDocs(
          query(collection(db, 'questions'), where('topic', '==', topic))
        );
        qSnap.forEach(d => {
          const q = { id: d.id, ...d.data() } as Question;
          if ((q.status || 'published') === 'draft') return;
          
          if (q.id && failedIds.has(q.id)) {
            failedCandidates.push(q);
          } else if (!correctQuestionIds.has(q.id || '')) {
            newCandidates.push(q);
          }
        });
      }

      if (failedCandidates.length === 0 && newCandidates.length === 0) {
        toast.error('Không tìm thấy câu hỏi mới cho vùng yếu. Hãy đợi thầy bổ sung đề.');
        setIsGenerating(false);
        return;
      }

      // 4. Thuật toán 70-30 (Lấy tối đa 7 câu sai, bù 3 câu mới hoặc cho đến khi đủ 10 câu)
      const shuffledFailed = failedCandidates.sort(() => Math.random() - 0.5);
      const shuffledNew = newCandidates.sort(() => Math.random() - 0.5);
      
      const targetFailedCount = Math.min(7, shuffledFailed.length);
      const selectedFailed = shuffledFailed.slice(0, targetFailedCount);
      
      const remainingSlots = 10 - selectedFailed.length;
      const selectedNew = shuffledNew.slice(0, remainingSlots);
      
      const combined = [...selectedFailed, ...selectedNew];
      const selected = combined.sort(() => Math.random() - 0.5); // Trộn đều vị trí để tránh HS đoán được câu nào là câu quen

      // 5. Create a new Exam document
      const examTitle = `🩺 Đơn thuốc: ${weakTopics.join(' + ')} — ${new Date().toLocaleDateString('vi-VN')}`;
      const examRef = await addDoc(collection(db, 'exams'), {
        title: examTitle,
        questions: selected.map(q => {
          // Strip undefined fields
          const clean: Record<string, any> = { ...q };
          Object.keys(clean).forEach(k => {
            if (clean[k] === undefined) delete clean[k];
          });
          return clean;
        }),
        createdAt: Timestamp.now(),
        createdBy: 'system_adaptive',
        type: 'AI_Diagnosis' as const,
        targetStudentId: user.uid,
      });

      // 6. Add to user's prescriptions
      const newPrescription: Prescription = {
        id: examRef.id,
        examId: examRef.id,
        title: examTitle,
        assignedAt: Timestamp.now(),
        status: 'pending',
      };

      const currentPrescriptions = user.prescriptions || [];
      await updateDoc(doc(db, 'users', user.uid), {
        prescriptions: [...currentPrescriptions, {
          id: newPrescription.id,
          examId: newPrescription.examId,
          title: newPrescription.title,
          assignedAt: newPrescription.assignedAt,
          status: newPrescription.status,
        }],
      });

      setGeneratedPrescription(examTitle);
      toast.success(`✅ Đã tạo đơn thuốc: ${selected.length} câu từ ${weakTopics.length} vùng yếu!`);
    } catch (err) {
      console.error('[AutoRemedial]', err);
      toast.error('Lỗi tạo đơn thuốc. Vui lòng thử lại.');
    } finally {
      setIsGenerating(false);
    }
  }, [redZones, attempts, user]);

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

            {/* ── AUTO-REMEDIAL TRIGGER ── */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h4 className="text-lg font-black text-white flex items-center gap-2">
                <Pill className="w-5 h-5 text-fuchsia-400" />
                Kê Đơn Tự Động
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Hệ thống sẽ phân tích vùng yếu, bốc ngẫu nhiên 10 câu hỏi chưa làm đúng, và tạo bài test riêng cho bạn.
              </p>

              {generatedPrescription && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 bg-green-600/10 border border-green-600/30 rounded-xl"
                >
                  <p className="text-xs font-bold text-green-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Đơn thuốc đã sẵn sàng!
                  </p>
                  <p className="text-[10px] text-green-300 mt-1 truncate">
                    {generatedPrescription}
                  </p>
                </motion.div>
              )}

              <button
                onClick={handleAutoRemedial}
                disabled={isGenerating || redZones.length === 0}
                className={cn(
                  "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-[0.98] shadow-xl",
                  redZones.length === 0
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 text-white shadow-fuchsia-600/20"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    ĐANG KÊ ĐƠN...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    {redZones.length === 0 ? 'CHƯA CÓ VÙNG YẾU' : `KÊ ĐƠN — ${redZones.length} VÙNG YẾU`}
                  </>
                )}
              </button>

              {redZones.length > 0 && (
                <p className="text-[10px] text-slate-500 text-center">
                  Bốc {Math.min(10, redZones.length * 5)} câu từ: {redZones.map(r => r.topic).join(', ')}
                </p>
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
