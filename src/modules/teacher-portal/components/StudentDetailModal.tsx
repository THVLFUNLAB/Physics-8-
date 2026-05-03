import React from 'react';
import { X, AlertTriangle, TrendingUp, Award, Flame, Calendar, BookOpen } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import type { UserProfile } from '../../../types';

interface Props {
  student: UserProfile;
  onClose: () => void;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg shadow-xl">
        <p className="text-sm font-bold text-slate-200">{data.subject}</p>
        <p className="text-lg font-black text-emerald-400">{data.A}% <span className="text-xs text-slate-500 font-normal">Độ thành thạo</span></p>
      </div>
    );
  }
  return null;
};

const StudentDetailModal: React.FC<Props> = ({ student, onClose }) => {
  const profile = student.learningPath?.weaknessProfile;
  const progress = student.learningPath?.overallProgress || 0;
  
  // Mặc định nếu chưa có weaknessProfile
  let radarData: any[] = [];
  let redZones: { topic: string; score: number }[] = [];
  
  if (profile?.topicMastery) {
    radarData = Object.entries(profile.topicMastery).map(([topic, stats]) => {
      const score = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      if (score < 50 && stats.total > 0) {
        redZones.push({ topic, score });
      }
      // Rút gọn tên topic để hiển thị radar chart đẹp hơn (VD: Dao động điều hòa -> DĐĐH)
      let shortTopic = topic;
      if (topic.length > 20) {
        shortTopic = topic.split(' ').map(w => w[0]).join('').toUpperCase();
      }

      return {
        subject: shortTopic,
        fullSubject: topic,
        A: score,
        fullMark: 100,
      };
    });
  }

  // Định dạng ngày
  const formatDate = (dateValue: any) => {
    if (!dateValue) return 'Chưa ghi nhận';
    try {
      const d = dateValue?.toDate ? dateValue.toDate() : new Date(dateValue);
      return d.toLocaleDateString('vi-VN');
    } catch {
      return 'Không rõ';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl relative animate-in fade-in zoom-in duration-200 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {student.photoURL ? (
              <img src={student.photoURL} alt="avatar" className="w-14 h-14 rounded-full border-2 border-slate-700" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-xl font-bold text-slate-400 border-2 border-slate-700">
                {student.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                {student.displayName || 'Học sinh ẩn danh'}
                {student.tier === 'vip' && <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-widest">VIP</span>}
              </h2>
              <p className="text-sm text-slate-400">{student.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto">
          
          {/* Cột trái: Tổng quan & Red Zones */}
          <div className="lg:col-span-1 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl text-center">
                <Flame className="w-6 h-6 text-orange-500 mx-auto mb-2 opacity-80" />
                <p className="text-2xl font-black text-white">{student.streak || 0}</p>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">Ngày chuỗi</p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl text-center">
                <Award className="w-6 h-6 text-amber-400 mx-auto mb-2 opacity-80" />
                <p className="text-2xl font-black text-white">{student.stars || 0}</p>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">Tổng Sao</p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl text-center">
                <BookOpen className="w-6 h-6 text-blue-400 mx-auto mb-2 opacity-80" />
                <p className="text-2xl font-black text-white">{progress}%</p>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">Tiến độ</p>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl text-center">
                <Calendar className="w-6 h-6 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-bold text-white mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
                  {formatDate(student.lastActive)}
                </p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-1">Online lần cuối</p>
              </div>
            </div>

            {/* Red Zones */}
            <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
              <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Vùng Nguy Hiểm (&lt;50%)
              </h3>
              
              {redZones.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Học sinh không có chuyên đề nào dưới mức trung bình. Rất tốt!</p>
              ) : (
                <div className="space-y-3">
                  {redZones.sort((a,b) => a.score - b.score).map((rz, idx) => (
                    <div key={idx} className="bg-slate-900/50 rounded-lg p-3 border border-red-900/20">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-slate-200 line-clamp-1" title={rz.topic}>{rz.topic}</span>
                        <span className="text-xs font-black px-2 py-1 rounded bg-red-500/20 text-red-400">
                          {rz.score}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${rz.score}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cột phải: Radar Chart */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5 flex-grow flex flex-col">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Bản đồ Năng lực (Radar Mastery)
              </h3>
              <p className="text-xs text-slate-400 mb-6">Mức độ thành thạo các chuyên đề dựa trên lịch sử làm bài.</p>
              
              <div className="flex-grow min-h-[350px] w-full relative">
                {radarData.length > 2 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Radar name="Học sinh" dataKey="A" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                    <TrendingUp className="w-12 h-12 opacity-20 mb-3" />
                    <p className="text-sm">Chưa đủ dữ liệu bài làm để vẽ biểu đồ.</p>
                    <p className="text-xs mt-1">Cần ít nhất 3 chuyên đề.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default StudentDetailModal;
