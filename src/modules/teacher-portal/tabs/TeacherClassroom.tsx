import React, { useState } from 'react';
import { Plus, Users, Copy, Check, BookOpen } from 'lucide-react';
import type { useTeacherPortal } from '../useTeacherPortal';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; }

const TeacherClassroom: React.FC<Props> = ({ portal }) => {
  const { classes, loading, handleCreateClass, selectedClassId, setSelectedClassId } = portal;
  const [showForm, setShowForm] = useState(false);
  const [className, setClassName] = useState('');
  const [grade, setGrade] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;
    setCreating(true);
    try {
      await handleCreateClass(className.trim(), grade === '' ? undefined : grade);
      setClassName(''); setGrade(''); setShowForm(false);
    } finally { setCreating(false); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="tp-section-header">
        <h3 className="tp-section-title"><Users /> Quản Lý Lớp Học</h3>
        <button className="tp-btn-primary" onClick={() => setShowForm(v => !v)}>
          <Plus className="w-4 h-4" /> Tạo lớp mới
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-slate-900/60 border border-emerald-500/20 rounded-xl p-5 space-y-4">
          <p className="text-sm font-bold text-slate-300">Thông tin lớp học mới</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tên lớp *</label>
              <input type="text" value={className} onChange={e => setClassName(e.target.value)}
                placeholder="VD: 12A1 — Vật lý THPT" required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Khối lớp</label>
              <select value={grade} onChange={e => setGrade(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors">
                <option value="">Tất cả khối</option>
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" className="tp-btn-ghost" onClick={() => setShowForm(false)}>Hủy</button>
            <button type="submit" className="tp-btn-primary" disabled={creating}>
              {creating ? 'Đang tạo...' : 'Tạo lớp'}
            </button>
          </div>
        </form>
      )}

      {loading.classes ? (
        <div className="tp-class-grid">
          {[1,2,3].map(i => <div key={i} className="tp-skeleton h-40 rounded-xl" />)}
        </div>
      ) : classes.length === 0 ? (
        <div className="tp-empty">
          <Users />
          <p className="tp-empty-title">Chưa có lớp học nào</p>
          <p className="tp-empty-desc">Tạo lớp đầu tiên để bắt đầu quản lý và theo dõi học sinh.</p>
        </div>
      ) : (
        <div className="tp-class-grid">
          {classes.map(cls => (
            <div key={cls.id}
              className={`tp-class-card ${selectedClassId === cls.id ? 'selected' : ''}`}
              onClick={() => setSelectedClassId(cls.id ?? null)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="tp-class-name">{cls.name}</p>
                  {cls.grade && <span className="text-xs text-slate-500">Khối {cls.grade}</span>}
                </div>
                <span className="tp-class-badge">{cls.studentCount} HS</span>
              </div>
              <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2 mb-3">
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Mã tham gia</p>
                  <p className="text-lg font-black text-emerald-400 tracking-widest">{cls.code}</p>
                </div>
                <button className="tp-btn-ghost"
                  onClick={e => { e.stopPropagation(); copyCode(cls.code); }} title="Copy mã lớp">
                  {copiedCode === cls.code
                    ? <Check className="w-4 h-4 text-emerald-400" />
                    : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <button className="tp-btn-primary flex-1 text-xs py-1.5"
                  onClick={e => { e.stopPropagation(); setSelectedClassId(cls.id ?? null); portal.setActiveTab('students'); }}>
                  Xem học sinh
                </button>
                <button className="tp-btn-ghost px-2.5"
                  onClick={e => { e.stopPropagation(); portal.setActiveTab('exam-hub'); }}
                  title="Phát đề cho lớp này">
                  <BookOpen className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherClassroom;
