import React, { useState } from 'react';
import { GraduationCap, AlertTriangle, Search, Filter, Loader2, ChevronRight, Award, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { useTeacherPortal } from '../useTeacherPortal';
import { getStudentsByClass } from '../services/teacherStudentService';
import StudentDetailModal from '../components/StudentDetailModal';
import type { UserProfile } from '../../../types';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; }

const TeacherStudentList: React.FC<Props> = ({ portal }) => {
  const { classes, selectedClassId, setSelectedClassId } = portal;
  const selectedClass = classes.find(c => c.id === selectedClassId);
  const studentIds = selectedClass?.studentIds || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);

  // Fetch students using React Query with Infinity staleTime (Session Storage logic conceptually handled by React Query cache)
  const { data: students, isLoading, isError } = useQuery({
    queryKey: ['classStudents', selectedClassId],
    queryFn: () => getStudentsByClass(studentIds),
    enabled: !!selectedClassId && studentIds.length > 0,
    staleTime: Infinity, // BẮT BUỘC: Không refetch khi đóng/mở tab
    gcTime: 1000 * 60 * 60, // Giữ trong cache 1 tiếng
  });

  // Filter students
  const filteredStudents = (students || []).filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return s.displayName?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term);
  });

  // Helper to extract 2 weakest topics
  const getWeakestTopics = (student: UserProfile) => {
    const topicMastery = student.learningPath?.weaknessProfile?.topicMastery;
    if (!topicMastery) return [];
    
    return Object.entries(topicMastery)
      .map(([topic, stats]) => ({
        topic,
        score: stats.total > 0 ? (stats.correct / stats.total) * 100 : 100 // Ignored if 0 total
      }))
      .filter(t => t.score < 50)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="tp-section-header">
        <h3 className="tp-section-title"><GraduationCap /> Quản Lý Học Sinh</h3>
        {classes.length > 1 && (
          <select value={selectedClassId ?? ''} onChange={e => setSelectedClassId(e.target.value || null)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500">
            <option value="">-- Chọn lớp --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {!selectedClassId ? (
        <div className="tp-empty">
          <GraduationCap className="w-12 h-12 text-slate-500 mb-4" />
          <p className="tp-empty-title">Chọn lớp để xem danh sách học sinh</p>
          <p className="tp-empty-desc">Bạn có thể chọn ở menu dropdown phía trên hoặc từ tab Quản Lý Lớp Học.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900/80">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm font-bold">
                {selectedClass?.name}
              </span>
              <span className="text-sm text-slate-400 font-medium">
                Sĩ số: <strong className="text-white">{studentIds.length}</strong>
              </span>
            </div>
            
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Tìm tên, email học sinh..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Table / List */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
                <p>Đang tải dữ liệu học sinh...</p>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-20 text-red-400">
                <AlertTriangle className="w-10 h-10 mb-4 opacity-80" />
                <p>Lỗi khi tải dữ liệu. Vui lòng thử lại.</p>
              </div>
            ) : studentIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Users className="w-12 h-12 mb-4 opacity-50" />
                <p className="font-medium text-slate-300">Lớp học này chưa có học sinh nào.</p>
                <p className="text-sm mt-1">Cung cấp mã lớp <strong>{selectedClass?.code}</strong> cho học sinh để tham gia.</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Search className="w-10 h-10 mb-4 opacity-50" />
                <p>Không tìm thấy học sinh phù hợp.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-xs uppercase tracking-widest text-slate-500 font-bold">
                    <th className="px-6 py-4">Học Sinh</th>
                    <th className="px-6 py-4">Chuyên Cần</th>
                    <th className="px-6 py-4">Cảnh Báo (Điểm Yếu)</th>
                    <th className="px-6 py-4 text-right">Chi Tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredStudents.map(student => {
                    const progress = student.learningPath?.overallProgress || 0;
                    const alerts = getWeakestTopics(student);
                    
                    return (
                      <tr 
                        key={student.uid} 
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                        onClick={() => setSelectedStudent(student)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {student.photoURL ? (
                              <img src={student.photoURL} alt="avatar" className="w-10 h-10 rounded-full border border-slate-700" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400 border border-slate-700">
                                {student.displayName?.[0]?.toUpperCase() || '?'}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">
                                {student.displayName || 'Chưa cập nhật tên'}
                              </p>
                              <p className="text-xs text-slate-500">{student.email}</p>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5" title="Số ngày học liên tục">
                              <Flame className="w-4 h-4 text-orange-500" />
                              <span className="text-sm font-bold text-slate-300">{student.streak || 0}</span>
                            </div>
                            <div className="flex items-center gap-1.5" title="Tổng sao">
                              <Award className="w-4 h-4 text-amber-400" />
                              <span className="text-sm font-bold text-slate-300">{student.stars || 0}</span>
                            </div>
                          </div>
                          <div className="mt-2 w-24">
                            <div className="flex justify-between text-[10px] mb-1">
                              <span className="text-slate-500">Tiến độ</span>
                              <span className="text-emerald-400 font-bold">{progress}%</span>
                            </div>
                            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }}></div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {alerts.length === 0 ? (
                            <span className="inline-flex items-center text-xs text-slate-500 italic">
                              Chưa có dữ liệu hoặc điểm tốt
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {alerts.map((alert, i) => (
                                <span key={i} className="inline-flex items-center px-2 py-1 rounded bg-red-500/10 text-red-400 text-[10px] border border-red-500/20 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]" title={alert.topic}>
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  {alert.topic} ({Math.round(alert.score)}%)
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors inline-flex items-center">
                            Xem <ChevronRight className="w-4 h-4 ml-1" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {selectedStudent && (
        <StudentDetailModal 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
        />
      )}
    </div>
  );
};

// Cần import Users icon mà quên import ở trên. Fallback:
import { Users } from 'lucide-react';

export default TeacherStudentList;
