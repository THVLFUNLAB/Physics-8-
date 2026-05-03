/**
 * OnboardingGuide.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Sơ đồ hướng dẫn sử dụng PHYS9+ cho Giáo Viên & Học Sinh.
 * Hiển thị dạng modal với flowchart khối đẹp, click trigger từ landing page.
 *
 * ✅ Hoàn toàn standalone — không ảnh hưởng bất kỳ component hiện có.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, BookOpen, GraduationCap, Users,
  UserPlus, CheckCircle, Building2, Share2,
  ClipboardList, BarChart3, LogIn, Key,
  Library, PenLine, Brain, Trophy,
  ChevronRight, ArrowDown, Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'teacher' | 'student';

interface FlowStep {
  icon: React.FC<any>;
  title: string;
  desc: string;
  badge?: string;
  color: string;        // Tailwind bg class for icon bg
  glowColor: string;   // CSS box-shadow color
}

// ─── Flowchart Data ───────────────────────────────────────────────────────────

const TEACHER_STEPS: FlowStep[] = [
  {
    icon: UserPlus,
    title: 'Đăng ký tài khoản Giáo Viên',
    desc: 'Vào phy9plus.com → Đăng nhập → Chọn "Tôi là Giáo Viên" khi thiết lập hồ sơ lần đầu.',
    badge: 'Bắt đầu',
    color: 'bg-emerald-500/20 border-emerald-500/40',
    glowColor: 'rgba(16,185,129,0.3)',
  },
  {
    icon: CheckCircle,
    title: 'Tài khoản được Admin phê duyệt',
    desc: 'Admin hệ thống sẽ xác nhận vai trò GV trong vòng 24h. Bạn sẽ nhận thông báo qua email.',
    badge: 'Tự động',
    color: 'bg-teal-500/20 border-teal-500/40',
    glowColor: 'rgba(20,184,166,0.3)',
  },
  {
    icon: Building2,
    title: 'Tạo Lớp Học',
    desc: 'Vào tab "Lớp Học" → Tạo lớp mới → Đặt tên lớp. Hệ thống tạo Mã Lớp độc nhất (VD: J3HN4R).',
    color: 'bg-cyan-500/20 border-cyan-500/40',
    glowColor: 'rgba(6,182,212,0.3)',
  },
  {
    icon: Share2,
    title: 'Chia sẻ Mã Lớp cho Học Sinh',
    desc: 'Copy mã lớp và gửi cho HS qua Zalo/nhóm lớp. HS dùng mã này để tham gia lớp của bạn.',
    color: 'bg-blue-500/20 border-blue-500/40',
    glowColor: 'rgba(59,130,246,0.3)',
  },
  {
    icon: ClipboardList,
    title: 'Phát Đề Kiểm Tra',
    desc: 'Tab "Tạo & Phát đề" → Chọn đề từ kho 2500+ câu hoặc tự tạo Ma Trận Đề → Giao cho lớp.',
    color: 'bg-violet-500/20 border-violet-500/40',
    glowColor: 'rgba(139,92,246,0.3)',
  },
  {
    icon: BarChart3,
    title: 'Theo dõi & Phân Tích Kết Quả',
    desc: 'Tab "Phân Tích" → Xem điểm số, heatmap chủ đề yếu, xếp hạng lớp. Hỗ trợ HS kịp thời.',
    badge: 'Hoàn tất',
    color: 'bg-fuchsia-500/20 border-fuchsia-500/40',
    glowColor: 'rgba(217,70,239,0.3)',
  },
];

const STUDENT_STEPS: FlowStep[] = [
  {
    icon: LogIn,
    title: 'Đăng ký / Đăng nhập',
    desc: 'Vào phy9plus.com → Nhấn "Bắt Đầu Chinh Phục" → Đăng nhập bằng tài khoản Google.',
    badge: 'Bắt đầu',
    color: 'bg-violet-500/20 border-violet-500/40',
    glowColor: 'rgba(139,92,246,0.3)',
  },
  {
    icon: Key,
    title: 'Nhập Mã Lớp từ Giáo Viên',
    desc: 'GV sẽ cung cấp Mã Lớp (VD: J3HN4R). Vào "Cài đặt" → "Tham gia lớp học" → Nhập mã.',
    color: 'bg-blue-500/20 border-blue-500/40',
    glowColor: 'rgba(59,130,246,0.3)',
  },
  {
    icon: Library,
    title: 'Vào Kho Đề Luyện Tập',
    desc: 'Hơn 2500 câu hỏi Vật lý THPT phân loại theo chủ đề, mức độ và khối lớp (10/11/12).',
    color: 'bg-cyan-500/20 border-cyan-500/40',
    glowColor: 'rgba(6,182,212,0.3)',
  },
  {
    icon: PenLine,
    title: 'Làm Bài Kiểm Tra',
    desc: 'Chọn đề từ kho hoặc làm đề GV giao. Giao diện chuyên nghiệp, tính giờ, hỗ trợ LaTeX.',
    color: 'bg-teal-500/20 border-teal-500/40',
    glowColor: 'rgba(20,184,166,0.3)',
  },
  {
    icon: Brain,
    title: 'AI Phân Tích Năng Lực',
    desc: 'Sau mỗi bài, Thầy Hậu AI xác định lỗ hổng kiến thức và tạo lộ trình luyện tập riêng cho bạn.',
    color: 'bg-emerald-500/20 border-emerald-500/40',
    glowColor: 'rgba(16,185,129,0.3)',
  },
  {
    icon: Trophy,
    title: 'Xếp Hạng & Tích Luỹ Thành Tích',
    desc: 'Hoàn thành bài → nhận Sao & Huy Hiệu → leo bảng xếp hạng lớp. Học mà vui!',
    badge: 'Hoàn tất',
    color: 'bg-amber-500/20 border-amber-500/40',
    glowColor: 'rgba(245,158,11,0.3)',
  },
];

// ─── FlowStep Card ────────────────────────────────────────────────────────────

interface StepCardProps {
  step: FlowStep;
  index: number;
  isLast: boolean;
}

const StepCard: React.FC<StepCardProps> = ({ step, index, isLast }) => {
  const Icon = step.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: 'easeOut' }}
      className="relative flex gap-4"
    >
      {/* ── Vertical connector line ── */}
      {!isLast && (
        <div
          className="absolute left-[23px] top-[52px] w-[2px] z-0"
          style={{
            height: 'calc(100% - 8px)',
            background: `linear-gradient(to bottom, ${step.glowColor}, transparent)`,
          }}
        />
      )}

      {/* ── Step number + Icon ── */}
      <div className="relative z-10 flex flex-col items-center flex-shrink-0">
        {/* Number badge */}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white mb-1"
          style={{
            background: `radial-gradient(circle, ${step.glowColor} 0%, rgba(0,0,0,0.8) 100%)`,
            border: `1px solid ${step.glowColor}`,
            boxShadow: `0 0 12px ${step.glowColor}`,
          }}
        >
          {index + 1}
        </div>
        {/* Icon circle */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center border ${step.color}`}
          style={{ boxShadow: `0 0 16px ${step.glowColor}` }}
        >
          <Icon className="w-5 h-5 text-white/90" />
        </div>
      </div>

      {/* ── Content block ── */}
      <div
        className={`flex-1 p-4 rounded-2xl border mb-4 backdrop-blur-sm ${step.color} hover:scale-[1.01] transition-transform cursor-default`}
        style={{ boxShadow: `0 2px 20px ${step.glowColor}20` }}
      >
        <div className="flex items-center gap-2 mb-1">
          <p className="font-bold text-white text-sm leading-tight">{step.title}</p>
          {step.badge && (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white/80"
              style={{ background: step.glowColor }}
            >
              {step.badge}
            </span>
          )}
        </div>
        <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
      </div>
    </motion.div>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface OnboardingGuideProps {
  open: boolean;
  onClose: () => void;
}

const OnboardingGuideModal: React.FC<OnboardingGuideProps> = ({ open, onClose }) => {
  const [role, setRole] = useState<Role>('teacher');

  const steps = role === 'teacher' ? TEACHER_STEPS : STUDENT_STEPS;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[1000]"
            onClick={onClose}
          />

          {/* ── Modal Panel ── */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="fixed inset-0 z-[1001] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-3xl overflow-hidden pointer-events-auto"
              style={{
                background: 'linear-gradient(160deg, #0d1525 0%, #0a0f1e 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
              }}
            >
              {/* ── Header ── */}
              <div
                className="flex-shrink-0 p-5 flex items-center justify-between"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'linear-gradient(90deg, rgba(16,185,129,0.06) 0%, rgba(139,92,246,0.06) 100%)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #10b981, #8b5cf6)', boxShadow: '0 0 20px rgba(16,185,129,0.4)' }}
                  >
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h2 className="font-black text-white text-sm tracking-tight">Hướng Dẫn Sử Dụng PHYS9+</h2>
                    <p className="text-slate-500 text-[11px]">Sơ đồ khởi động nhanh cho người dùng mới</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-800/60 hover:bg-slate-700 border border-slate-700/40 transition-all"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {/* ── Role Selector ── */}
              <div className="flex-shrink-0 p-4">
                <div className="flex gap-2 p-1 bg-slate-900/60 rounded-2xl border border-slate-700/30">
                  {([
                    { role: 'teacher' as Role, label: 'Giáo Viên', icon: Users, color: '#10b981' },
                    { role: 'student' as Role, label: 'Học Sinh', icon: GraduationCap, color: '#8b5cf6' },
                  ] as const).map(({ role: r, label, icon: Icon, color }) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all"
                      style={
                        role === r
                          ? {
                              background: `${color}20`,
                              border: `1px solid ${color}50`,
                              color,
                              boxShadow: `0 0 16px ${color}25`,
                            }
                          : { color: '#64748b', border: '1px solid transparent' }
                      }
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Flowchart Body ── */}
              <div className="flex-1 overflow-y-auto px-5 pb-5" style={{ scrollbarWidth: 'none' }}>
                {/* Role intro */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={role}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-5">
                      <Sparkles
                        className="w-4 h-4"
                        style={{ color: role === 'teacher' ? '#10b981' : '#8b5cf6' }}
                      />
                      <span
                        className="text-xs font-black uppercase tracking-[0.15em]"
                        style={{ color: role === 'teacher' ? '#10b981' : '#8b5cf6' }}
                      >
                        {role === 'teacher' ? 'Lộ trình cho Giáo Viên' : 'Lộ trình cho Học Sinh'}
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-r from-slate-700 to-transparent" />
                      <span className="text-[10px] text-slate-600 font-bold">{steps.length} bước</span>
                    </div>

                    {/* Steps */}
                    <div>
                      {steps.map((step, i) => (
                        <StepCard
                          key={step.title}
                          step={step}
                          index={i}
                          isLast={i === steps.length - 1}
                        />
                      ))}
                    </div>

                    {/* Footer tip */}
                    <div
                      className="mt-4 p-4 rounded-2xl flex items-start gap-3"
                      style={{
                        background: role === 'teacher'
                          ? 'rgba(16,185,129,0.06)'
                          : 'rgba(139,92,246,0.06)',
                        border: role === 'teacher'
                          ? '1px solid rgba(16,185,129,0.2)'
                          : '1px solid rgba(139,92,246,0.2)',
                      }}
                    >
                      <ChevronRight
                        className="w-4 h-4 mt-0.5 flex-shrink-0"
                        style={{ color: role === 'teacher' ? '#10b981' : '#8b5cf6' }}
                      />
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {role === 'teacher'
                          ? 'Cần hỗ trợ? Liên hệ Admin qua kênh Zalo hoặc email để được phê duyệt tài khoản GV nhanh nhất.'
                          : 'Không cần mã lớp vẫn có thể luyện đề! Vào "Kho Đề" và bắt đầu học ngay. Mã lớp chỉ cần khi GV giao bài.'}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Trigger Button (đặt trên Landing Page) ──────────────────────────────────

interface OnboardingTriggerProps {
  /** Variant cho landing page */
  variant?: 'landing' | 'inline';
}

export const OnboardingGuide: React.FC<OnboardingTriggerProps> = ({ variant = 'landing' }) => {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* ── Trigger ── */}
      {variant === 'landing' ? (
        // Dạng pill button dưới CTA trên landing page
        <motion.button
          onClick={handleOpen}
          whileHover={{ scale: 1.04, y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl font-bold text-sm transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(226,232,240,0.85)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
          aria-label="Xem hướng dẫn sử dụng PHYS9+"
        >
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <span>Hướng dẫn sử dụng</span>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </motion.button>
      ) : (
        // Dạng link text (dùng trong các trang khác nếu cần)
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors font-semibold underline underline-offset-2"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Xem hướng dẫn sử dụng
        </button>
      )}

      {/* ── Modal ── */}
      <OnboardingGuideModal open={open} onClose={handleClose} />
    </>
  );
};

export default OnboardingGuide;
