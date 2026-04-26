import React, { useMemo } from 'react';
import { UserProfile, Attempt } from '../types';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { Trophy, TrendingUp, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { isVipUser } from '../lib/userUtils';

interface AdminStudentProfileProps {
  user: UserProfile;
  attempts: Attempt[];
  onClose?: () => void;
}

const AdminStudentProfile: React.FC<AdminStudentProfileProps> = ({ user, attempts, onClose }) => {
  // Compute GPA and metrics
  const avgScore = useMemo(() => {
    if (attempts.length === 0) return 0;
    const total = attempts.reduce((acc, a) => acc + (a.score || 0), 0);
    return (total / attempts.length).toFixed(1);
  }, [attempts]);

  // Compute real topic mastery
  const topicMastery = useMemo(() => {
    if (attempts.length === 0) return [];

    const topicMap: Record<string, { total: number; correct: number }> = {};

    for (const attempt of attempts) {
      // The testId holds the topic name
      const topic = attempt.testId || 'Chưa phân loại';

      if (!topicMap[topic]) topicMap[topic] = { total: 0, correct: 0 };

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

  // Compute Radar Chart data based on dynamic real Attempt history domains
  const radarData = useMemo(() => {
    if (topicMastery.length === 0) {
      // Default spider web if no data to keep the layout pretty
      return [
        { subject: 'Chưa có data', A: 0, fullMark: 100 },
        { subject: 'Làm thêm bài', A: 0, fullMark: 100 },
        { subject: 'Để mở khoá', A: 0, fullMark: 100 },
      ];
    }
    return topicMastery.map(m => ({
      subject: m.topic.length > 20 ? m.topic.substring(0, 20) + '…' : m.topic,
      A: m.correctRate,
      fullMark: 100,
    }));
  }, [topicMastery]);

  const redZones = useMemo(() => {
    return topicMastery
      .filter(m => m.correctRate < 50 && m.totalQuestions >= 2)
      .sort((a, b) => a.correctRate - b.correctRate)
      .slice(0, 3);
  }, [topicMastery]);

  // Top 10 bài gần nhất
  const recents = [...attempts].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

  return (
    <div className="flex flex-col gap-6 w-full text-slate-100">
      
      {/* ── TREMOR STYLE: HEADER CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Định danh */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-center min-h-[140px]">
          <div className="absolute -top-4 -right-4 p-4 opacity-5">
            <Trophy className="w-32 h-32" />
          </div>
          <p className="text-sm font-medium text-slate-400">Hồ sơ học sinh</p>
          <p className="text-2xl font-semibold mt-1 truncate z-10">{user.displayName || 'Học viên ẩn danh'}</p>
          <div className="mt-4 flex items-center gap-2 z-10">
            <span className={cn(
              "px-2.5 py-1 text-xs font-bold rounded-md", 
              user.tier === 'vip' || user.isUnlimited ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"
            )}>
              {isVipUser(user) ? '💎 Gói Pro/VIP' : 'Gói Cơ bản'}
            </span>
            <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-800 text-slate-300">
              {user.className || 'Chưa cập nhật Lớp'}
            </span>
          </div>
        </div>

        {/* Card 2: Limit Đã Dùng */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm flex flex-col justify-center min-h-[140px]">
          <p className="text-sm font-medium text-slate-400">Số lượt thử đã dùng</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl font-semibold text-white">{isVipUser(user) ? '∞' : user.usedAttempts || 0}</p>
            <p className="text-sm text-slate-500">/ {isVipUser(user) ? '∞' : user.maxAttempts || 30}</p>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-4">
            <div 
              className={cn("h-1.5 rounded-full transition-all duration-1000", isVipUser(user) ? 'bg-amber-500' : 'bg-indigo-500')} 
              style={{ width: isVipUser(user) ? '100%' : `${Math.min(((user.usedAttempts || 0) / (user.maxAttempts || 30)) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 3: GPA */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm flex flex-col justify-center min-h-[140px]">
          <p className="text-sm font-medium text-slate-400 mb-2">Điểm trung bình (GPA)</p>
          <p className={cn(
             "text-3xl font-semibold", 
             Number(avgScore) >= 8 ? "text-emerald-400" : Number(avgScore) >= 5 ? "text-amber-400" : "text-red-400"
          )}>
            {avgScore} <span className="text-sm text-slate-500 font-normal">/ 10.0</span>
          </p>
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
             <TrendingUp className="w-3 h-3" /> Được tính từ {attempts.length} bài thi.
          </p>
        </div>
      </div>

      {/* ── TREMOR STYLE: MAIN CONTENT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CHART: Diagnosis Radar */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm flex flex-col">
          <h3 className="text-base font-semibold border-b border-slate-800 pb-4 mb-4">Mạng lưới năng lực (Tỉ lệ đúng)</h3>
          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Tỉ lệ làm đúng" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {redZones.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Mất gốc mức báo động:</span>
              {redZones.map((z, idx) => (
                <div key={idx} className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg flex gap-3 items-start">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">
                    <strong className="text-red-400 block">{z.topic}</strong> 
                    Độ chính xác chỉ đạt {z.correctRate}% (Sai {z.totalQuestions - z.correctCount}/{z.totalQuestions} câu).
                  </p>
                </div>
              ))}
            </div>
          )}
          {redZones.length === 0 && topicMastery.length > 0 && (
             <div className="mt-4 p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-lg flex gap-3 items-start">
               <Trophy className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
               <p className="text-xs text-emerald-200">
                 Học viên hiện chưa có mảng kiến thức nào bị hổng nặng. Tiếp tục phát huy!
               </p>
             </div>
          )}
        </div>

        {/* TABLE: Lịch sử làm bài */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 pb-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
            <h3 className="text-base font-semibold">10 Lượt làm bài gần nhất</h3>
            <span className="text-xs text-slate-500">Tự động cập nhật Real-time</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-800/50 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Tên Chuyên Đề / Bài Thi</th>
                  <th className="px-6 py-4 text-center">Điểm Đạt</th>
                  <th className="px-6 py-4">Thời Lượng</th>
                  <th className="px-6 py-4">Ngày Nộp Bài</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {recents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 italic">
                      Học sinh này chưa tham gia làm bất kỳ bài kiểm tra nào.
                    </td>
                  </tr>
                ) : (
                  recents.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-200 max-w-[200px] truncate" title={att.testId || att.topic}>
                        {att.testId || att.topic || 'Đề kiểm tra định kì'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-black",
                          (att.score || 0) >= 8 ? "bg-emerald-500/10 text-emerald-400" :
                          (att.score || 0) >= 6.5 ? "bg-cyan-500/10 text-cyan-400" :
                          (att.score || 0) >= 5 ? "bg-amber-500/10 text-amber-400" :
                          "bg-red-500/10 text-red-400"
                        )}>
                          {(att.score || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs font-mono">
                         {Math.floor((att.timeSpent || 0)/60)}p {(att.timeSpent || 0)%60}s
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {new Date(att.timestamp).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminStudentProfile;
