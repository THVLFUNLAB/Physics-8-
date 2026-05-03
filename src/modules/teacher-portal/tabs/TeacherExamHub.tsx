import React, { useState, lazy, Suspense } from 'react';
import { BookOpen, Send, XCircle } from 'lucide-react';
import type { UserProfile } from '../../../types';
import type { useTeacherPortal } from '../useTeacherPortal';

const TeacherMatrixBuilder = lazy(() => import('../components/TeacherMatrixBuilder'));

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; user: UserProfile; }

const TeacherExamHub: React.FC<Props> = ({ portal, user }) => {
  const { exams, assignments, matrices, classes, loading, handleAssignExam, handleCloseAssignment } = portal;
  const [activeSection, setActiveSection] = useState<'assign' | 'matrix'>('assign');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [allowReview, setAllowReview] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const selectedExam = exams.find(e => e.id === selectedExamId);
  const selectedClass = classes.find(c => c.id === selectedClassId);

  const handleAssign = async () => {
    if (!selectedExamId || !selectedClassId || !selectedExam || !selectedClass) return;
    setAssigning(true);
    try {
      await handleAssignExam({
        teacherId: user.uid,
        examId: selectedExamId,
        examTitle: selectedExam.title,
        classId: selectedClassId,
        className: selectedClass.name,
        allowReview,
        showLeaderboard,
      });
      setSelectedExamId(''); setSelectedClassId('');
    } finally { setAssigning(false); }
  };

  return (
    <div className="space-y-6">
      {/* Section Switcher */}
      <div className="flex gap-3 flex-wrap">
        <button
          className={`tp-btn-${activeSection === 'assign' ? 'primary' : 'ghost'}`}
          onClick={() => setActiveSection('assign')}>
          <Send className="w-4 h-4" /> Phát Đề Cho Lớp
        </button>
        <button
          className={`tp-btn-${activeSection === 'matrix' ? 'primary' : 'ghost'}`}
          onClick={() => setActiveSection('matrix')}>
          <BookOpen className="w-4 h-4" /> Ma Trận Sinh Đề
        </button>
      </div>

      {/* ── SECTION: PHÁT ĐỀ ─────────────────────────────────────── */}
      {activeSection === 'assign' && (
        <div className="space-y-5">
          {/* Form phát đề */}
          <div className="bg-slate-900/60 border border-emerald-500/20 rounded-xl p-5 space-y-4">
            <p className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-400" /> Phát đề cho lớp
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Chọn đề thi</label>
                {loading.exams
                  ? <div className="tp-skeleton h-10 rounded-lg" />
                  : <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500">
                      <option value="">-- Chọn đề --</option>
                      {exams.map(e => (
                        <option key={e.id} value={e.id}>{e.title}</option>
                      ))}
                    </select>
                }
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Giao cho lớp</label>
                {loading.classes
                  ? <div className="tp-skeleton h-10 rounded-lg" />
                  : <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500">
                      <option value="">-- Chọn lớp --</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                }
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={allowReview} onChange={e => setAllowReview(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500" />
                <span className="text-slate-300">Cho phép HS xem lại bài</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showLeaderboard} onChange={e => setShowLeaderboard(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500" />
                <span className="text-slate-300">Hiện bảng điểm lớp</span>
              </label>
            </div>
            <div className="flex justify-end">
              <button className="tp-btn-primary" onClick={handleAssign}
                disabled={assigning || !selectedExamId || !selectedClassId}>
                {assigning ? 'Đang phát...' : 'Phát đề ngay'}
              </button>
            </div>
          </div>

          {/* Danh sách assignments */}
          <div>
            <h3 className="tp-section-title mb-4"><BookOpen /> Đề đã phát ({assignments.length})</h3>
            {assignments.length === 0 ? (
              <div className="tp-empty"><BookOpen /><p className="tp-empty-title">Chưa có đề nào được phát</p></div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="tp-table">
                  <thead>
                    <tr>
                      <th>Đề thi</th>
                      <th>Lớp</th>
                      <th>Tiến độ</th>
                      <th>Trạng thái</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id}>
                        <td className="font-semibold max-w-[200px]">
                          <span className="line-clamp-2 text-slate-200">{a.examTitle}</span>
                        </td>
                        <td className="text-slate-400">{a.className}</td>
                        <td className="min-w-[120px]">
                          <div className="tp-progress mb-1">
                            <div className="tp-progress-bar" style={{ width: `${a.progressPercent}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{a.submittedCount}/{a.totalStudents}</span>
                        </td>
                        <td>
                          <span className={`tp-badge tp-badge-${a.status}`}>
                            {a.status === 'active' ? 'Đang mở' : a.status === 'closed' ? 'Đã đóng' : 'Nháp'}
                          </span>
                        </td>
                        <td>
                          {a.status === 'active' && (
                            <button className="tp-btn-ghost text-xs text-red-400 border-red-900/40"
                              onClick={() => a.id && handleCloseAssignment(a.id)}>
                              <XCircle className="w-3.5 h-3.5" /> Đóng
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECTION: MA TRẬN ─────────────────────────────────────── */}
      {activeSection === 'matrix' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <TeacherMatrixBuilder portal={portal} user={user} />
        </Suspense>
      )}
    </div>
  );
};

export default TeacherExamHub;
