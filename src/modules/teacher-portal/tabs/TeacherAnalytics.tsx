import React, { useState, useEffect } from 'react';
import { BarChart3, AlertTriangle, Users, Target, Activity, RefreshCw, Trophy, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import type { useTeacherPortal } from '../useTeacherPortal';
import { getAssignmentAnalytics, AssignmentAnalyticsResult } from '../services/teacherAnalyticsService';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; }

const TeacherAnalytics: React.FC<Props> = ({ portal }) => {
  const { classes, selectedClassId, setSelectedClassId, assignments } = portal;
  
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [analytics, setAnalytics] = useState<AssignmentAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Lọc assignments theo lớp đang chọn
  const classAssignments = assignments.filter(a => a.classId === selectedClassId);

  // Tự động reset selected assignment khi đổi lớp
  useEffect(() => {
    setSelectedAssignmentId('');
    setAnalytics(null);
  }, [selectedClassId]);

  const loadAnalytics = async (forceRefresh = false) => {
    if (!selectedClassId || !selectedAssignmentId) return;
    
    const selectedClass = classes.find(c => c.id === selectedClassId);
    const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId);
    
    if (!selectedClass || !selectedAssignment) return;

    setLoading(true);
    try {
      const data = await getAssignmentAnalytics(
        selectedAssignmentId, 
        selectedAssignment.examId, 
        selectedClass, 
        forceRefresh
      );
      setAnalytics(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAssignmentId) {
      loadAnalytics(false);
    }
  }, [selectedAssignmentId]);

  // Hàm hỗ trợ màu Heatmap
  const getHeatmapColor = (frequency: string) => {
    const percent = parseInt(frequency.replace('%', ''));
    if (percent >= 50) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (percent >= 20) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Khối 1: Header & Lọc */}
      <div className="tp-section-header flex-col sm:flex-row gap-4 items-start sm:items-center">
        <h3 className="tp-section-title flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" /> Phân Tích Chuyên Sâu
        </h3>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          {classes.length > 0 && (
            <select 
              value={selectedClassId ?? ''} 
              onChange={e => setSelectedClassId(e.target.value || null)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 flex-1 sm:flex-none min-w-[150px]"
            >
              <option value="">-- Chọn lớp --</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {selectedClassId && (
            <select 
              value={selectedAssignmentId} 
              onChange={e => setSelectedAssignmentId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 flex-1 sm:flex-none min-w-[200px]"
            >
              <option value="">-- Chọn Đề thi / Assignment --</option>
              {classAssignments.map(a => (
                <option key={a.id} value={a.id}>{a.examTitle}</option>
              ))}
            </select>
          )}

          {selectedAssignmentId && (
            <button 
              onClick={() => loadAnalytics(true)}
              disabled={loading}
              className="tp-btn-ghost text-sm px-3 flex items-center gap-2"
              title="Làm mới dữ liệu mới nhất (bỏ qua Cache)"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              Làm mới
            </button>
          )}
        </div>
      </div>

      {!selectedClassId || !selectedAssignmentId ? (
        <div className="p-12 border border-slate-800 border-dashed rounded-2xl text-center space-y-3 bg-slate-900/30">
          <Target className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-slate-400 font-medium text-lg">Vui lòng chọn Lớp học và Đề thi để phân tích.</p>
        </div>
      ) : loading && !analytics ? (
        <div className="p-12 text-center text-slate-500">
          <Activity className="w-8 h-8 mx-auto animate-pulse mb-3" />
          Đang tính toán phân tích phổ điểm & năng lực...
        </div>
      ) : analytics ? (
        <div className="space-y-6">
          
          {/* Khối 2: Overview Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 group-hover:opacity-20 transition-opacity translate-x-4 -translate-y-4">
                <Target className="w-24 h-24" />
              </div>
              <p className="text-slate-400 text-sm font-medium mb-1">Điểm Trung Bình</p>
              <p className="text-3xl font-bold text-white">{analytics.averageScore} <span className="text-base text-slate-500 font-normal">/ 10</span></p>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 group-hover:opacity-20 transition-opacity translate-x-4 -translate-y-4">
                <Users className="w-24 h-24" />
              </div>
              <p className="text-slate-400 text-sm font-medium mb-1">Tỷ Lệ Hoàn Thành</p>
              <p className="text-3xl font-bold text-white">{analytics.submissionRate}%</p>
              <p className="text-xs text-slate-500 mt-1">{analytics.totalSubmissions} lượt nộp bài</p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 relative overflow-hidden group">
              <div className="absolute right-0 top-0 opacity-10 group-hover:opacity-20 transition-opacity translate-x-4 -translate-y-4">
                <Activity className="w-24 h-24" />
              </div>
              <p className="text-slate-400 text-sm font-medium mb-1">Phổ Điểm Cao Nhất</p>
              <p className="text-3xl font-bold text-white">
                {analytics.scoreDistribution.reduce((max, obj) => obj.count > max.count ? obj : max, {range: 'N/A', count: 0}).range}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Khối 3: Biểu đồ Phân Bổ Điểm */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Phân Bổ Điểm Số
              </h4>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.scoreDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="range" stroke="#64748b" tick={{fill: '#94a3b8', fontSize: 12}} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" tick={{fill: '#94a3b8', fontSize: 12}} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      cursor={{fill: '#1e293b', opacity: 0.4}}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                      itemStyle={{ color: '#60a5fa', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="count" name="Số lượng" radius={[4, 4, 0, 0]}>
                      {analytics.scoreDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 4 ? '#10b981' : index === 3 ? '#3b82f6' : index === 2 ? '#eab308' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Khối 4: Heatmap Chủ Đề Yếu */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Heatmap: Chủ Đề Yếu Nhất
              </h4>
              <div className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                {analytics.weakTopics.length > 0 ? analytics.weakTopics.map((item, idx) => (
                  <div key={idx} className={`p-3 rounded-lg border ${getHeatmapColor(item.frequency)} flex justify-between items-center gap-4`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" title={item.topic}>{item.topic}</p>
                      <p className="text-xs opacity-80 mt-0.5">Sai {item.errorCount} lần</p>
                    </div>
                    <div className="font-bold text-lg">
                      {item.frequency}
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Chưa đủ dữ liệu lỗi sai để phân tích chủ đề.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bảng Xếp Hạng */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
             <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Bảng Vinh Danh (Top 5)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/50 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 rounded-l-lg font-medium">Hạng</th>
                      <th className="px-4 py-3 font-medium">Học sinh</th>
                      <th className="px-4 py-3 font-medium">Thời gian</th>
                      <th className="px-4 py-3 rounded-r-lg font-medium text-right">Điểm số</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {analytics.topStudents.length > 0 ? analytics.topStudents.map((student, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                            idx === 0 ? 'bg-yellow-500/20 text-yellow-500' : 
                            idx === 1 ? 'bg-slate-400/20 text-slate-300' :
                            idx === 2 ? 'bg-amber-700/20 text-amber-500' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-white">{student.name}</td>
                        <td className="px-4 py-3 text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {student.timeSpent ? `${Math.floor(student.timeSpent / 60)}p ${student.timeSpent % 60}s` : '--'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-400">{student.score}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">Chưa có học sinh nào nộp bài.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
          </div>
          
        </div>
      ) : null}
    </div>
  );
};

export default TeacherAnalytics;
