import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  BookOpen, 
  History, 
  CheckCircle2, 
  Play, 
  Beaker, 
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Target,
  ShieldAlert,
  Flag,
  Radio,
  Users,
  Contact,
  BrainCircuit,
  FolderOpen,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

// ── Tất cả tab IDs hợp lệ trong hệ thống ──
export type SidebarTab = 
  | 'dashboard' | 'tasks' | 'history' | 'liveExam' | 'adaptive' | 'simulations' // Student tabs
  | 'Digitize' | 'Bank' | 'Generator' | 'SimLab' | 'Duplicates' | 'Sanitizer' | 'Reports' | 'Classroom' | 'Directory' | 'Library'; // Admin tabs

export const STUDENT_TABS = ['dashboard', 'tasks', 'history', 'liveExam', 'adaptive', 'simulations'] as const;
export const ADMIN_TABS = ['Digitize', 'Bank', 'Generator', 'SimLab', 'Duplicates', 'Sanitizer', 'Reports', 'Classroom', 'Directory', 'Library'] as const;

export const Sidebar = ({ 
  user, 
  isAdmin, 
  isCollapsed, 
  setIsCollapsed,
  activeTab,
  setActiveTab,
  soundEnabled,
  setSoundEnabled,
  isMobileOpen,
  setIsMobileOpen
}: {
  user: UserProfile | null;
  isAdmin: boolean;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: SidebarTab) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
}) => {

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen]);

  const studentMenu = [
    { id: 'dashboard' as SidebarTab, label: 'Bảng Điều Khiển', icon: Home },
    { id: 'tasks' as SidebarTab, label: 'Nhiệm Vụ', icon: Target },
    { id: 'history' as SidebarTab, label: 'Lịch Sử Nháp', icon: History },
    { id: 'liveExam' as SidebarTab, label: 'Phòng Thi', icon: Radio },
    { id: 'adaptive' as SidebarTab, label: 'Lộ Trình Cá Nhân', icon: BrainCircuit },
    { id: 'simulations' as SidebarTab, label: 'Phòng Thí Nghiệm', icon: Beaker },
  ];

  const adminMenu = [
    { id: 'Digitize' as SidebarTab, label: 'Số Hoá AI', icon: CheckCircle2 },
    { id: 'Bank' as SidebarTab, label: 'Kho Câu Hỏi', icon: BookOpen },
    { id: 'Generator' as SidebarTab, label: 'Tạo Đề', icon: Play },
    { id: 'SimLab' as SidebarTab, label: 'Mô Phỏng', icon: Beaker },
    { id: 'Duplicates' as SidebarTab, label: 'Duyệt Trùng', icon: ArrowLeftRight },
    { id: 'Sanitizer' as SidebarTab, label: 'Bảo Trì Dữ Liệu', icon: ShieldAlert },
    { id: 'Reports' as SidebarTab, label: 'Duyệt Báo Lỗi', icon: Flag },
    { id: 'Library' as SidebarTab, label: 'Thư Mục Đề Thi', icon: FolderOpen },
    { id: 'Classroom' as SidebarTab, label: 'Phòng Thi', icon: Users },
    { id: 'Directory' as SidebarTab, label: 'Danh Bạ Học Viên', icon: Contact },
  ];

  if (!user) return null;

  const handleTabClick = (tab: SidebarTab) => {
    setActiveTab(tab);
    // Auto-close drawer on mobile after selecting
    setIsMobileOpen(false);
  };

  const sidebarContent = (
    <>
      {/* ── Header Logo + Toggle ── */}
      <div className="p-4 flex items-center justify-between border-b border-slate-800/50 h-[72px]">
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-headline font-black text-white text-xl tracking-tighter"
            >
              PHYS<span className="text-fuchsia-500 text-glow-neon">9+</span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Desktop: collapse/expand toggle. Mobile: close button */}
        <button 
          onClick={() => {
            if (window.innerWidth < 768) {
              setIsMobileOpen(false);
            } else {
              setIsCollapsed(!isCollapsed);
            }
          }}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer active:scale-90 mx-auto"
        >
          {window.innerWidth < 768 ? (
            <X size={20} />
          ) : (
            isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />
          )}
        </button>
      </div>

      {/* ── Menu Items ── */}
      <div className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-8 custom-scrollbar scrolling-touch">
        {/* Học Sinh Menu */}
        <div className="space-y-1.5">
          {(!isCollapsed || window.innerWidth < 768) && <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Khu vực Học sinh</p>}
          {studentMenu.map(item => (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              title={item.label}
              className={cn(
                "w-full flex items-center p-3 rounded-2xl transition-all duration-200 cursor-pointer relative group touch-target",
                activeTab === item.id 
                  ? "bg-fuchsia-600/15 text-fuchsia-400 border border-fuchsia-500/30 shadow-[0_0_20px_-3px_rgba(192,38,211,0.3)]" 
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-white border border-transparent hover:border-slate-700/50"
              )}
            >
              {/* Active indicator bar */}
              {activeTab === item.id && (
                <motion.div 
                  layoutId="activeIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-fuchsia-500 rounded-r-full"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                />
              )}
              <item.icon size={20} className={cn(
                "shrink-0 transition-transform duration-200 group-hover:scale-110", 
                (isCollapsed && window.innerWidth >= 768) ? "mx-auto" : ""
              )} />
              {(!isCollapsed || window.innerWidth < 768) && (
                <span className="ml-3 text-sm font-semibold whitespace-nowrap">{item.label}</span>
              )}
            </button>
          ))}
        </div>

        {/* Admin Menu */}
        {isAdmin && (
          <div className="space-y-1.5">
            {(!isCollapsed || window.innerWidth < 768) && <p className="px-3 text-[10px] font-bold text-cyan-500/50 uppercase tracking-widest mb-4">Trạm Admin</p>}
            {adminMenu.map(item => (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                title={item.label}
                className={cn(
                  "w-full flex items-center p-3 rounded-2xl transition-all duration-200 cursor-pointer relative group touch-target",
                  activeTab === item.id 
                    ? "bg-cyan-600/15 text-cyan-400 border border-cyan-500/30 shadow-[0_0_20px_-3px_rgba(8,145,178,0.3)]" 
                    : "text-slate-400 hover:bg-slate-800/80 hover:text-white border border-transparent hover:border-slate-700/50"
                )}
              >
                {/* Active indicator bar */}
                {activeTab === item.id && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-cyan-500 rounded-r-full"
                    transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                  />
                )}
                <item.icon size={20} className={cn(
                  "shrink-0 transition-transform duration-200 group-hover:scale-110", 
                  (isCollapsed && window.innerWidth >= 768) ? "mx-auto" : ""
                )} />
                {(!isCollapsed || window.innerWidth < 768) && (
                  <span className="ml-3 text-sm font-semibold whitespace-nowrap">{item.label}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer: Sound Toggle ── */}
      <div className="p-4 border-t border-slate-800/50">
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title="Bật/Tắt Âm thanh"
          className="w-full flex items-center p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer active:scale-95 touch-target"
        >
          {soundEnabled ? <Volume2 size={20} className={cn("shrink-0 text-fuchsia-400", (isCollapsed && window.innerWidth >= 768) ? "mx-auto" : "")} /> : <VolumeX size={20} className={cn("shrink-0", (isCollapsed && window.innerWidth >= 768) ? "mx-auto" : "")} />}
          {(!isCollapsed || window.innerWidth < 768) && <span className="ml-3 text-sm font-semibold whitespace-nowrap">{soundEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT'}</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* ══════ DESKTOP SIDEBAR (md and above) ══════ */}
      <motion.div 
        initial={false}
        animate={{ width: isCollapsed ? 80 : 260 }}
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 bg-slate-950/95 backdrop-blur-xl border-r border-slate-800/50 flex-col"
        style={{ pointerEvents: 'auto' }}
      >
        {sidebarContent}
      </motion.div>

      {/* ══════ MOBILE DRAWER (below md) ══════ */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="md:hidden fixed left-0 top-0 bottom-0 z-[100] w-[280px] bg-slate-950/98 backdrop-blur-xl border-r border-slate-800/50 flex flex-col safe-area-inset"
              style={{ pointerEvents: 'auto' }}
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
