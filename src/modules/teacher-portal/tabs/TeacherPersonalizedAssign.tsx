/**
 * TeacherPersonalizedAssign.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * GV giao bài tập cá nhân hoá cho HS yếu — chọn HS + đề + chủ đề → giao ngay.
 * ✅ Standalone — không sửa file hiện có.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target, UserCheck, BookOpen, Send, Loader2,
  ChevronDown, AlertTriangle, Clock, CheckCircle2,
  GraduationCap, Sparkles, RefreshCw,
} from 'lucide-react';
import type { useTeacherPortal } from '../useTeacherPortal';
import type { UserProfile } from '../../../types';
import {
  createPersonalizedAssignment,
  getPersonalizedAssignments,
  type PersonalizedAssignment,
} from '../services/personalizedAssignmentService';
import { toast } from '../../../components/Toast';
import { db, collection, getDocs, query, where } from '../../../firebase';
import { documentId } from 'firebase/firestore';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; user: UserProfile; }

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { label: 'Chưa làm', color: '#f59e0b', icon: Clock },
  started:   { label: 'Đang làm', color: '#6366f1', icon: RefreshCw },
  completed: { label: 'Hoàn thành', color: '#10b981', icon: CheckCircle2 },
};

// ─── Student selector (lấy từ class) ─────────────────────────────────────────
interface StudentOption {
  uid: string;
  displayName: string;
  email: string;
  averageScore?: number;
}

async function fetchClassStudents(classId: string, studentIds: string[]): Promise<StudentOption[]> {
  if (studentIds.length === 0) return [];
  const BATCH = 30;
  const results: StudentOption[] = [];
  for (let i = 0; i < studentIds.length; i += BATCH) {
    const batch = studentIds.slice(i, i + BATCH);
    const q = query(collection(db, 'users'), where(documentId(), 'in', batch));
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const data = d.data();
      results.push({
        uid: d.id,
        displayName: data.displayName || data.email || d.id.slice(0, 8),
        email: data.email || '',
      });
    });
  }
  return results;
}

// ─── Assignment history row ───────────────────────────────────────────────────
const AssignmentRow: React.FC<{ a: PersonalizedAssignment }> = ({ a }) => {
  const cfg = STATUS_CONFIG[a.status];
  const Icon = cfg.icon;
  const dateStr = a.assignedAt?.seconds
    ? new Date(a.assignedAt.seconds * 1000).toLocaleDateString('vi-VN')
    : '—';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{a.studentName}</p>
        <p className="text-xs text-slate-500 truncate">{a.examTitle}</p>
        {a.targetTopics?.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {a.targetTopics.slice(0, 2).map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/15 text-violet-400">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${cfg.color}20`, color: cfg.color }}>
          {cfg.label}
        </span>
        <p className="text-[10px] text-slate-600 mt-1">{dateStr}</p>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const TeacherPersonalizedAssign: React.FC<Props> = ({ portal, user }) => {
  const [assignments, setAssignments] = useState<PersonalizedAssignment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Form state
  const [selectedClassId, setSelectedClassId] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentUid, setSelectedStudentUid] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  // Load history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await getPersonalizedAssignments(user.uid);
      setAssignments(data);
    } catch { /* silent */ }
    finally { setLoadingHistory(false); }
  }, [user.uid]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Load students when class changes
  useEffect(() => {
    if (!selectedClassId) { setStudents([]); setSelectedStudentUid(''); return; }
    const cls = portal.classes.find(c => c.id === selectedClassId);
    const ids = (cls as any)?.studentIds ?? [];
    setLoadingStudents(true);
    fetchClassStudents(selectedClassId, ids)
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
    setSelectedStudentUid('');
  }, [selectedClassId, portal.classes]);

  const addTopic = () => {
    const t = topicInput.trim();
    if (t && !topics.includes(t)) setTopics(prev => [...prev, t]);
    setTopicInput('');
  };

  const handleAssign = async () => {
    if (!selectedStudentUid || !selectedExamId || !selectedClassId) {
      toast.error('Vui lòng chọn lớp, học sinh và đề thi.');
      return;
    }
    setSending(true);
    try {
      const student = students.find(s => s.uid === selectedStudentUid)!;
      const exam = portal.exams.find(e => e.id === selectedExamId)!;
      const cls = portal.classes.find(c => c.id === selectedClassId)!;

      await createPersonalizedAssignment({
        teacherId: user.uid,
        studentId: selectedStudentUid,
        studentName: student.displayName,
        examId: selectedExamId,
        examTitle: exam.topic || exam.title || '—',
        classId: selectedClassId,
        className: cls.name,
        targetTopics: topics,
        note: note.trim() || undefined,
      });

      toast.success(`Đã giao bài cho ${student.displayName}!`);
      // Reset form
      setSelectedStudentUid(''); setSelectedExamId('');
      setTopics([]); setNote('');
      await loadHistory();
    } catch (e) {
      toast.error('Không thể giao bài. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  const selectedStudent = students.find(s => s.uid === selectedStudentUid);
  const selectedExam = portal.exams.find(e => e.id === selectedExamId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="tp-section-header">
        <h3 className="tp-section-title">
          <Target /> Giao Bài Cá Nhân Hoá
        </h3>
        <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
          <Sparkles className="w-4 h-4" />
          {assignments.length} bài đã giao
        </div>
      </div>

      {/* Form card */}
      <div
        className="p-5 rounded-2xl space-y-4"
        style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}
      >
        <p className="text-sm font-black text-white flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-violet-400" />
          Tạo bài tập mới
        </p>

        {/* Row 1: Class + Student */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Lớp học</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-violet-500/50"
            >
              <option value="">-- Chọn lớp --</option>
              {portal.classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Học sinh {loadingStudents && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
            </label>
            <select
              value={selectedStudentUid}
              onChange={e => setSelectedStudentUid(e.target.value)}
              disabled={!selectedClassId || loadingStudents}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-violet-500/50 disabled:opacity-40"
            >
              <option value="">-- Chọn học sinh --</option>
              {students.map(s => (
                <option key={s.uid} value={s.uid}>{s.displayName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Exam selector */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Đề thi</label>
          <select
            value={selectedExamId}
            onChange={e => setSelectedExamId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-violet-500/50"
          >
            <option value="">-- Chọn đề thi --</option>
            {portal.exams.map(e => (
              <option key={e.id} value={e.id}>{e.topic || e.title}</option>
            ))}
          </select>
        </div>

        {/* Row 3: Topic tags */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Chủ đề cần luyện (tùy chọn)
          </label>
          <div className="flex gap-2">
            <input
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopic(); } }}
              placeholder="VD: Dao động điều hoà..."
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/50 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
            />
            <button
              onClick={addTopic}
              className="px-3 py-2 rounded-xl text-xs font-bold text-violet-300"
              style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}
            >
              + Thêm
            </button>
          </div>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {topics.map(t => (
                <button
                  key={t}
                  onClick={() => setTopics(prev => prev.filter(x => x !== t))}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-violet-500/20 text-violet-300 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                >
                  {t} ×
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Row 4: Note for student */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            Ghi chú cho học sinh (tùy chọn)
          </label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="VD: Em cần ôn kỹ phần này trước khi thi HK2..."
            className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700/50 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50"
            maxLength={200}
          />
        </div>

        {/* Preview */}
        {selectedStudent && selectedExam && (
          <div
            className="p-3 rounded-xl flex items-center gap-3 text-sm"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <UserCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-slate-300">
              Giao <strong className="text-white">{selectedExam.topic || selectedExam.title}</strong>
              {' '}cho <strong className="text-emerald-400">{selectedStudent.displayName}</strong>
              {topics.length > 0 && <> · Chủ đề: {topics.join(', ')}</>}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleAssign}
          disabled={sending || !selectedStudentUid || !selectedExamId}
          className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 24px rgba(99,102,241,0.3)' }}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'Đang giao bài...' : 'Giao Bài Ngay'}
        </button>
      </div>

      {/* Assignment history */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5" /> Lịch sử bài tập đã giao
        </p>
        {loadingHistory ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="tp-skeleton h-16 rounded-xl" />)}
          </div>
        ) : assignments.length === 0 ? (
          <div className="tp-empty" style={{ padding: '1.5rem' }}>
            <Target />
            <p className="tp-empty-title">Chưa có bài tập cá nhân nào</p>
            <p className="tp-empty-desc">Giao bài cho HS yếu để hỗ trợ các em luyện tập có mục tiêu.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map(a => <AssignmentRow key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherPersonalizedAssign;
