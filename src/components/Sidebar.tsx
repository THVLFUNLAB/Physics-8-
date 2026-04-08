import React from 'react';
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
  Contact
} from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

// ── Tất cả tab IDs hợp lệ trong hệ thống ──
export type SidebarTab = 
  | 'dashboard' | 'tasks' | 'history' | 'liveExam'                                        // Student tabs
  | 'Digitize' | 'Bank' | 'Generator' | 'SimLab' | 'Duplicates' | 'Sanitizer' | 'Reports' | 'Classroom' | 'Directory'; // Admin tabs

export const STUDENT_TABS = ['dashboard', 'tasks', 'history', 'liveExam'] as const;
export const ADMIN_TABS = ['Digitize', 'Bank', 'Generator', 'SimLab', 'Duplicates', 'Sanitizer', 'Reports', 'Classroom', 'Directory'] as const;

export const Sidebar = ({ 
  user, 
  isAdmin, 
  isCollapsed, 
  setIsCollapsed,
  activeTab,
  setActiveTab,
  soundEnabled,
  setSoundEnabled
}: {
  user: UserProfile | null;
  isAdmin: boolean;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: SidebarTab) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
}) => {

  const studentMenu = [
    { id: 'dashboard' as SidebarTab, label: 'Bảng Điều Khiển', icon: Home },
    { id: 'tasks' as SidebarTab, label: 'Nhiệm Vụ', icon: Target },
    { id: 'history' as SidebarTab, label: 'Lịch Sử Nháp', icon: History },
    { id: 'liveExam' as SidebarTab, label: 'Phòng Thi', icon: Radio },
  ];

  const adminMenu = [
    { id: 'Digitize' as SidebarTab, label: 'Số Hoá AI', icon: CheckCircle2 },
    { id: 'Bank' as SidebarTab, label: 'Kho Câu Hỏi', icon: BookOpen },
    { id: 'Generator' as SidebarTab, label: 'Tạo Đề', icon: Play },
    { id: 'SimLab' as SidebarTab, label: 'Mô Phỏng', icon: Beaker },
    { id: 'Duplicates' as SidebarTab, label: 'Duyệt Trùng', icon: ArrowLeftRight },
    { id: 'Sanitizer' as SidebarTab, label: 'Bảo Trì Dữ Liệu', icon: ShieldAlert },
    { id: 'Reports' as SidebarTab, label: 'Duyệt Báo Lỗi', icon: Flag },
    { id: 'Classroom' as SidebarTab, label: 'Phòng Thi', icon: Users },
    { id: 'Directory' as SidebarTab, label: 'Danh Bạ Học Viên', icon: Contact },
  ];

  if (!user) return null;

  return (
    <motion.div 
      initial={false}
      animate={{ width: isCollapsed ? 80 : 260 }}
      className="fixed left-0 top-0 bottom-0 z-50 bg-slate-950/95 backdrop-blur-xl border-r border-slate-800/50 flex flex-col"
      style={{ pointerEvents: 'auto' }}
    >
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
              PHYS<span className="text-fuchsia-500 text-glow-neon">8+</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer active:scale-90 mx-auto"
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* ── Menu Items ── */}
      <div className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-8 custom-scrollbar">
        {/* Học Sinh Menu */}
        <div className="space-y-1.5">
          {!isCollapsed && <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Khu vực Học sinh</p>}
          {studentMenu.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
              className={cn(
                "w-full flex items-center p-3 rounded-2xl transition-all duration-200 cursor-pointer relative group",
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
                isCollapsed ? "mx-auto" : ""
              )} />
              {!isCollapsed && (
                <span className="ml-3 text-sm font-semibold whitespace-nowrap">{item.label}</span>
              )}
            </button>
          ))}
        </div>

        {/* Admin Menu */}
        {isAdmin && (
          <div className="space-y-1.5">
            {!isCollapsed && <p className="px-3 text-[10px] font-bold text-cyan-500/50 uppercase tracking-widest mb-4">Trạm Admin</p>}
            {adminMenu.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                className={cn(
                  "w-full flex items-center p-3 rounded-2xl transition-all duration-200 cursor-pointer relative group",
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
                  isCollapsed ? "mx-auto" : ""
                )} />
                {!isCollapsed && (
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
          className="w-full flex items-center p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer active:scale-95"
        >
          {soundEnabled ? <Volume2 size={20} className={cn("shrink-0 text-fuchsia-400", isCollapsed ? "mx-auto" : "")} /> : <VolumeX size={20} className={cn("shrink-0", isCollapsed ? "mx-auto" : "")} />}
          {!isCollapsed && <span className="ml-3 text-sm font-semibold whitespace-nowrap">{soundEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT'}</span>}
        </button>
      </div>
    </motion.div>
  );
};
