import React, { useState, useEffect } from 'react';
import { X, Send, Clock, Users, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, getDocs, query, where, db } from '../firebase';
import { assignExamToClass } from '../modules/teacher-portal/services/teacherClassService';
import type { Exam, ClassRoom } from '../types';
import { toast } from './Toast';

interface AssignExamModalProps {
  exam: Exam;
  teacherId: string; // Used to fetch classes
  onClose: () => void;
  onSuccess?: () => void;
}

export const AssignExamModal: React.FC<AssignExamModalProps> = ({ exam, teacherId, onClose, onSuccess }) => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  const [assignType, setAssignType] = useState<'class' | 'grade'>('class');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<number>(12);
  const [autoAssign, setAutoAssign] = useState(true);
  
  // Date strings for input[type="datetime-local"]
  const [availableFromStr, setAvailableFromStr] = useState('');
  const [deadlineStr, setDeadlineStr] = useState('');

  const [allowReview, setAllowReview] = useState(true);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        // Lấy tất cả lớp của user hiện tại (giáo viên hoặc admin)
        const q = query(collection(db, 'classes'), where('teacherId', '==', teacherId));
        const snap = await getDocs(q);
        const cls = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassRoom));
        setClasses(cls);
      } catch (err) {
        console.error('Lỗi khi tải danh sách lớp:', err);
        toast.error('Không thể tải danh sách lớp học');
      } finally {
        setLoading(false);
      }
    };
    
    // Import db lazily if it's not provided via props to avoid circular deps if any. 
    // Actually we can just import db from '../firebase' at the top. Let me add it.
    fetchClasses();
  }, [teacherId]);

  const handleAssign = async () => {
    if (assignType === 'class' && !selectedClassId) {
      toast.error('Vui lòng chọn một lớp cụ thể!');
      return;
    }
    setAssigning(true);
    
    try {
      const availableFromDate = !autoAssign && availableFromStr ? new Date(availableFromStr) : undefined;
      const deadlineDate = deadlineStr ? new Date(deadlineStr) : undefined;

      const baseParams = {
        teacherId,
        examId: exam.id!,
        examTitle: exam.title || 'Đề không tên',
        availableFrom: availableFromDate,
        deadline: deadlineDate,
        allowReview,
        showLeaderboard,
      };

      if (assignType === 'class') {
        const selectedClass = classes.find(c => c.id === selectedClassId);
        if (!selectedClass) throw new Error('Không tìm thấy lớp');
        await assignExamToClass({
          ...baseParams,
          classId: selectedClass.id!,
          className: selectedClass.name,
        });
        toast.success(`Đã giao bài cho lớp ${selectedClass.name}`);
      } else {
        // Giao cho khối
        const targetClasses = classes.filter(c => c.grade === selectedGrade);
        if (targetClasses.length === 0) {
          toast.error(`Không có lớp nào thuộc Khối ${selectedGrade} để giao!`);
          setAssigning(false);
          return;
        }
        
        await Promise.all(
          targetClasses.map(c => 
            assignExamToClass({
              ...baseParams,
              classId: c.id!,
              className: c.name,
            })
          )
        );
        toast.success(`Đã giao bài cho ${targetClasses.length} lớp thuộc Khối ${selectedGrade}`);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Lỗi khi giao bài:', error);
      toast.error('Có lỗi xảy ra khi giao bài. Vui lòng thử lại.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Giao Nhiệm Vụ</h2>
              <p className="text-xs text-slate-400 truncate max-w-[280px]">{exam.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar max-h-[70vh]">
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Assign Type */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4" /> Đối tượng nhận
                </label>
                <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
                  <button 
                    onClick={() => setAssignType('class')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${assignType === 'class' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Một Lớp Cụ Thể
                  </button>
                  <button 
                    onClick={() => setAssignType('grade')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${assignType === 'grade' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Toàn Bộ Khối
                  </button>
                </div>

                {assignType === 'class' ? (
                  <select 
                    value={selectedClassId} 
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chọn một lớp --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} (Khối {c.grade || '?'})</option>
                    ))}
                  </select>
                ) : (
                  <select 
                    value={selectedGrade} 
                    onChange={e => setSelectedGrade(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value={10}>Khối 10</option>
                    <option value={11}>Khối 11</option>
                    <option value={12}>Khối 12</option>
                  </select>
                )}
              </div>

              {/* Time Setup */}
              <div className="space-y-4 pt-4 border-t border-slate-800/80">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Cài đặt thời gian
                </label>

                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox" 
                    id="autoAssign"
                    checked={autoAssign} 
                    onChange={e => setAutoAssign(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                  <label htmlFor="autoAssign" className="text-sm font-bold text-white cursor-pointer select-none">
                    Giao ngay bây giờ
                  </label>
                </div>

                <AnimatePresence>
                  {!autoAssign && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-2"
                    >
                      <label className="block text-xs text-slate-400">Ngày giờ mở đề (Hẹn giờ)</label>
                      <input 
                        type="datetime-local" 
                        value={availableFromStr}
                        onChange={e => setAvailableFromStr(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <label className="block text-xs text-slate-400">Ngày giờ hết hạn (Để trống nếu không giới hạn)</label>
                  <input 
                    type="datetime-local" 
                    value={deadlineStr}
                    onChange={e => setDeadlineStr(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-3 pt-4 border-t border-slate-800/80">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Tùy chọn thêm
                </label>
                
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="mt-0.5">
                      <input 
                        type="checkbox" 
                        checked={allowReview} 
                        onChange={e => setAllowReview(e.target.checked)}
                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer" 
                      />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">Cho phép xem lại bài</div>
                      <div className="text-xs text-slate-500 mt-0.5">Học sinh được xem đáp án chi tiết sau khi nộp</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="mt-0.5">
                      <input 
                        type="checkbox" 
                        checked={showLeaderboard} 
                        onChange={e => setShowLeaderboard(e.target.checked)}
                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer" 
                      />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">Bảng xếp hạng lớp</div>
                      <div className="text-xs text-slate-500 mt-0.5">Hiển thị thanh tiến độ nộp bài của cả lớp</div>
                    </div>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800/80 bg-slate-900 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Hủy
          </button>
          <button 
            onClick={handleAssign}
            disabled={assigning || loading || (assignType === 'class' && !selectedClassId)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
          >
            {assigning ? (
              <><div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" /> Đang giao...</>
            ) : (
              <><Send className="w-4 h-4" /> Xác Nhận Giao</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
