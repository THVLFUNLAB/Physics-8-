/**
 * TeacherReports.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Báo cáo tổng quan lớp học: điểm TB, phân phối, HS yếu/giỏi, chủ đề lỗ hổng.
 * PDF export dùng jsPDF (đã có trong dependencies).
 * ✅ Standalone — không sửa file hiện có.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3, Download, RefreshCw, TrendingUp, TrendingDown,
  Users, Award, AlertTriangle, BookOpen, Loader2, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { useTeacherPortal } from '../useTeacherPortal';
import { generateClassReport, type ClassReport, type StudentReportEntry } from '../services/teacherReportService';
import { toast } from '../../../components/Toast';

type Portal = ReturnType<typeof useTeacherPortal>;
interface Props { portal: Portal; }

// ─── Colour palette for score bars ───────────────────────────────────────────
const DIST_COLORS: Record<string, string> = {
  '0-2': '#ef4444', '2-4': '#f97316', '4-6': '#f59e0b',
  '6-8': '#10b981', '8-10': '#6366f1',
};

// ─── Small components ─────────────────────────────────────────────────────────
const StatPill: React.FC<{ label: string; value: string | number; color: string; icon: React.FC<any> }> = ({
  label, value, color, icon: Icon,
}) => (
  <div
    className="flex-1 min-w-[120px] p-4 rounded-2xl"
    style={{ background: `${color}10`, border: `1px solid ${color}30` }}
  >
    <Icon className="w-4 h-4 mb-2" style={{ color }} />
    <p className="text-xl font-black text-white">{value}</p>
    <p className="text-[11px] text-slate-500 font-medium">{label}</p>
  </div>
);

const StudentRow: React.FC<{ student: StudentReportEntry; rank?: number; variant: 'top' | 'weak' }> = ({
  student, rank, variant,
}) => (
  <div
    className="flex items-center gap-3 px-4 py-3 rounded-xl"
    style={{
      background: variant === 'top' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
      border: variant === 'top' ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(239,68,68,0.15)',
    }}
  >
    {rank && (
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
        style={{ background: variant === 'top' ? '#10b981' : '#ef4444' }}
      >
        {rank}
      </span>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-white truncate">{student.displayName}</p>
      <p className="text-[11px] text-slate-500">{student.totalAttempts} bài đã làm</p>
    </div>
    <div className="text-right flex-shrink-0">
      <p className="text-sm font-black" style={{ color: variant === 'top' ? '#10b981' : '#ef4444' }}>
        {student.averageScore.toFixed(1)}
      </p>
      <p className="text-[10px] text-slate-600">điểm TB</p>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const TeacherReports: React.FC<Props> = ({ portal }) => {
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [report, setReport] = useState<ClassReport | null>(null);
  const [loading, setLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const selectedClass = portal.classes.find(c => c.id === selectedClassId);

  const handleGenerate = useCallback(async () => {
    if (!selectedClassId || !selectedClass) {
      toast.error('Vui lòng chọn lớp học.');
      return;
    }
    setLoading(true);
    try {
      const studentIds = (selectedClass as any).studentIds ?? [];
      const data = await generateClassReport(
        selectedClassId,
        selectedClass.name,
        studentIds,
      );
      setReport(data);
    } catch (e) {
      toast.error('Không thể tạo báo cáo. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedClass]);

  const handleDownloadPDF = useCallback(async () => {
    if (!report || !reportRef.current) return;
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#0b0f19',
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height / canvas.width) * w;
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      pdf.save(`BaoCao_${report.className}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.pdf`);
      toast.success('Đã xuất PDF thành công!');
    } catch {
      toast.error('Không thể xuất PDF.');
    }
  }, [report]);

  const distData = report
    ? Object.entries(report.scoreDistribution).map(([range, count]) => ({ range, count }))
    : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="tp-section-header">
        <h3 className="tp-section-title"><BarChart3 /> Báo Cáo Lớp Học</h3>
        {report && (
          <button className="tp-btn-primary" onClick={handleDownloadPDF}>
            <Download className="w-4 h-4" /> Tải PDF
          </button>
        )}
      </div>

      {/* Controls */}
      <div
        className="p-4 rounded-2xl flex flex-wrap items-center gap-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Class selector */}
        <select
          value={selectedClassId}
          onChange={e => { setSelectedClassId(e.target.value); setReport(null); }}
          className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/50 text-white text-sm focus:outline-none focus:border-emerald-500/50"
        >
          <option value="">-- Chọn lớp --</option>
          {portal.classes.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.studentCount} HS)</option>
          ))}
        </select>

        <button
          onClick={handleGenerate}
          disabled={!selectedClassId || loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          {loading ? 'Đang tạo...' : 'Tạo báo cáo'}
        </button>
      </div>

      {/* Report content */}
      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
            ref={reportRef}
          >
            {/* Overview pills */}
            <div className="flex flex-wrap gap-3">
              <StatPill icon={Users}         label="Tổng học sinh"    value={report.totalStudents}  color="#6366f1" />
              <StatPill icon={BookOpen}      label="Đã tham gia"      value={report.activeStudents}  color="#10b981" />
              <StatPill icon={TrendingUp}    label="Điểm TB lớp"      value={`${report.averageScore}/10`} color="#f59e0b" />
              <StatPill icon={AlertTriangle} label="Cần hỗ trợ"       value={report.weakStudents.length} color="#ef4444" />
            </div>

            {/* Score distribution chart */}
            <div
              className="p-5 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-sm font-black text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                Phân phối điểm số
              </p>
              {distData.every(d => d.count === 0) ? (
                <p className="text-slate-500 text-sm text-center py-6">Chưa có dữ liệu điểm số</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={distData} barSize={32}>
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                      formatter={(v: any) => [`${v} học sinh`, 'Số lượng']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {distData.map(entry => (
                        <Cell key={entry.range} fill={DIST_COLORS[entry.range] ?? '#64748b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top & Weak students */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Top 5 */}
              <div
                className="p-4 rounded-2xl"
                style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)' }}
              >
                <p className="text-sm font-black text-emerald-400 mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4" /> Top 5 Học Sinh Xuất Sắc
                </p>
                {report.topStudents.length === 0
                  ? <p className="text-slate-500 text-xs">Chưa có dữ liệu</p>
                  : <div className="space-y-2">
                      {report.topStudents.map((s, i) => (
                        <StudentRow key={s.uid} student={s} rank={i + 1} variant="top" />
                      ))}
                    </div>
                }
              </div>

              {/* Weak students */}
              <div
                className="p-4 rounded-2xl"
                style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <p className="text-sm font-black text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Cần Hỗ Trợ (Điểm TB &lt; 5.0)
                </p>
                {report.weakStudents.length === 0
                  ? <p className="text-slate-500 text-xs">Tất cả HS đang học tốt 🎉</p>
                  : <div className="space-y-2">
                      {report.weakStudents.map((s, i) => (
                        <StudentRow key={s.uid} student={s} rank={i + 1} variant="weak" />
                      ))}
                    </div>
                }
              </div>
            </div>

            {/* Topic heatmap */}
            {report.topicAccuracy.length > 0 && (
              <div
                className="p-4 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p className="text-sm font-black text-white mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  Chủ đề còn lỗ hổng (yếu nhất trước)
                </p>
                <div className="space-y-2">
                  {report.topicAccuracy.map(t => (
                    <div key={t.topic} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-40 truncate flex-shrink-0">{t.topic}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${t.accuracy}%`,
                            background: t.accuracy < 40
                              ? '#ef4444'
                              : t.accuracy < 65
                                ? '#f59e0b'
                                : '#10b981',
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-400 w-10 text-right">{t.accuracy}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generated time */}
            <p className="text-[11px] text-slate-600 text-center">
              Báo cáo được tạo lúc {new Date(report.generatedAt).toLocaleString('vi-VN')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!report && !loading && (
        <div className="tp-empty">
          <BarChart3 />
          <p className="tp-empty-title">Chọn lớp để tạo báo cáo</p>
          <p className="tp-empty-desc">
            Hệ thống sẽ tổng hợp điểm số, phân phối và chủ đề yếu của toàn bộ lớp học.
          </p>
        </div>
      )}
    </div>
  );
};

export default TeacherReports;
