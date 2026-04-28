import React, { useEffect, useState } from 'react';

// ── Feature flag: Mindmap module chỉ hiện khi chạy local ──
const MINDMAP_ENABLED = import.meta.env.VITE_ENABLE_MINDMAP === 'true';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home,
  BookOpen,
  BarChart3,
  CheckCircle2,
  Play,
  Beaker,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  X,
  Database,
  Send,
  GraduationCap,
  Eye,
  Sun,
  Moon,
  LayoutDashboard,
  FlaskConical,
  Bot,
  Settings2,
  History,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

export type SidebarTab =
  | 'dashboard' | 'tasks' | 'history' | 'liveExam' | 'adaptive' | 'mindmap' | 'simulations' // Student tabs
  | 'StudentView' | 'Digitize' | 'Bank' | 'Generator' | 'Matrix' | 'SimLab' | 'MindmapAdmin' | 'Duplicates' | 'Sanitizer' | 'Reports' | 'Classroom' | 'Directory' | 'Library' | 'Tracking' | 'Campaign' | 'Migration' | 'YCCD' | 'AIChats'; // Admin tabs

export const STUDENT_TABS = ['dashboard', 'tasks', 'history', 'liveExam', 'adaptive', 'mindmap', 'simulations'] as const;
export const ADMIN_TABS = ['StudentView', 'Digitize', 'Bank', 'Generator', 'Matrix', 'SimLab', 'MindmapAdmin', 'Duplicates', 'Sanitizer', 'Reports', 'Classroom', 'Directory', 'Library', 'Tracking', 'Campaign', 'Migration', 'YCCD', 'AIChats'] as const;

// ── Admin Menu Groups Data Structure ──────────────────────────────────────────
interface MenuItem {
  id: SidebarTab;
  label: string;
  icon: React.ElementType;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string; // Tailwind accent color token for this group
  items: MenuItem[];
}

const adminMenuGroups: MenuGroup[] = [
  {
    id: 'overview',
    label: 'Bảng Điều Khiển',
    icon: LayoutDashboard,
    color: 'cyan',
    items: [
      { id: 'Tracking', label: 'Theo Dõi Tiến Độ', icon: BarChart3 },
      { id: 'Directory', label: 'Danh Bạ Học Viên', icon: Contact },
      { id: 'Classroom', label: 'Phòng Thi', icon: Users },
    ],
  },
  {
    id: 'content',
    label: 'Quản Lý Học Liệu',
    icon: BookOpen,
    color: 'violet',
    items: [
      { id: 'Digitize', label: 'Số Hoá AI', icon: CheckCircle2 },
      { id: 'Bank', label: 'Kho Câu Hỏi', icon: BookOpen },
      { id: 'Library', label: 'Thư Mục Đề Thi', icon: FolderOpen },
      { id: 'Matrix', label: 'Ma Trận Đề', icon: Target },
      { id: 'Generator', label: 'Tạo Đề', icon: Play },
    ],
  },
  {
    id: 'learning',
    label: 'Không Gian Học Tập',
    icon: FlaskConical,
    color: 'emerald',
    items: [
      { id: 'SimLab', label: 'Phòng Thí Nghiệm', icon: Beaker },
      { id: 'adaptive', label: 'Lộ Trình Cá Nhân', icon: BrainCircuit },
      ...(MINDMAP_ENABLED ? [{ id: 'MindmapAdmin' as SidebarTab, label: 'Quản Lý Mindmap', icon: BrainCircuit }] : []),
    ],
  },
  {
    id: 'ai',
    label: 'Trạm AI Control',
    icon: Bot,
    color: 'fuchsia',
    items: [
      { id: 'StudentView', label: 'Góc Nhìn HS', icon: Eye },
      { id: 'Campaign', label: 'Tâm Thư AI', icon: Send },
      { id: 'YCCD', label: 'Phân Loại YCCĐ', icon: GraduationCap },
      { id: 'AIChats', label: 'Log Chat AI', icon: BrainCircuit },
    ],
  },
  {
    id: 'system',
    label: 'Cài Đặt Hệ Thống',
    icon: Settings2,
    color: 'rose',
    items: [
      { id: 'Sanitizer', label: 'Bảo Trì Dữ Liệu', icon: ShieldAlert },
      { id: 'Duplicates', label: 'Duyệt Trùng', icon: ArrowLeftRight },
      { id: 'Reports', label: 'Duyệt Báo Lỗi', icon: Flag },
      { id: 'Migration', label: 'Chuyển Đổi Dữ Liệu', icon: Database },
    ],
  },
];

// ── Helper to find which group contains the active tab ────────────────────────
function findGroupForTab(tab: string): string | null {
  for (const group of adminMenuGroups) {
    if (group.items.some(item => item.id === tab)) return group.id;
  }
  return null;
}

// ── Accent color maps (Tailwind JIT-safe string classes) ─────────────────────
const accentMap: Record<string, { header: string; headerHover: string; border: string; text: string; bg: string; indicator: string; itemActive: string; itemBorder: string; itemShadow: string }> = {
  cyan: {
    header: 'text-cyan-400',
    headerHover: 'hover:bg-cyan-900/30',
    border: 'border-cyan-500/20',
    text: 'text-cyan-400',
    bg: 'bg-cyan-600/15',
    indicator: 'bg-cyan-500',
    itemActive: 'bg-cyan-600/15 text-cyan-400 border-cyan-500/30 shadow-[0_0_18px_-4px_rgba(8,145,178,0.3)]',
    itemBorder: 'border-cyan-500/30',
    itemShadow: '0_0_18px_-4px_rgba(8,145,178,0.3)',
  },
  violet: {
    header: 'text-violet-400',
    headerHover: 'hover:bg-violet-900/30',
    border: 'border-violet-500/20',
    text: 'text-violet-400',
    bg: 'bg-violet-600/15',
    indicator: 'bg-violet-500',
    itemActive: 'bg-violet-600/15 text-violet-400 border-violet-500/30 shadow-[0_0_18px_-4px_rgba(124,58,237,0.3)]',
    itemBorder: 'border-violet-500/30',
    itemShadow: '0_0_18px_-4px_rgba(124,58,237,0.3)',
  },
  emerald: {
    header: 'text-emerald-400',
    headerHover: 'hover:bg-emerald-900/30',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    bg: 'bg-emerald-600/15',
    indicator: 'bg-emerald-500',
    itemActive: 'bg-emerald-600/15 text-emerald-400 border-emerald-500/30 shadow-[0_0_18px_-4px_rgba(16,185,129,0.3)]',
    itemBorder: 'border-emerald-500/30',
    itemShadow: '0_0_18px_-4px_rgba(16,185,129,0.3)',
  },
  fuchsia: {
    header: 'text-fuchsia-400',
    headerHover: 'hover:bg-fuchsia-900/30',
    border: 'border-fuchsia-500/20',
    text: 'text-fuchsia-400',
    bg: 'bg-fuchsia-600/15',
    indicator: 'bg-fuchsia-500',
    itemActive: 'bg-fuchsia-600/15 text-fuchsia-400 border-fuchsia-500/30 shadow-[0_0_18px_-4px_rgba(192,38,211,0.3)]',
    itemBorder: 'border-fuchsia-500/30',
    itemShadow: '0_0_18px_-4px_rgba(192,38,211,0.3)',
  },
  rose: {
    header: 'text-rose-400',
    headerHover: 'hover:bg-rose-900/30',
    border: 'border-rose-500/20',
    text: 'text-rose-400',
    bg: 'bg-rose-600/15',
    indicator: 'bg-rose-500',
    itemActive: 'bg-rose-600/15 text-rose-400 border-rose-500/30 shadow-[0_0_18px_-4px_rgba(225,29,72,0.3)]',
    itemBorder: 'border-rose-500/30',
    itemShadow: '0_0_18px_-4px_rgba(225,29,72,0.3)',
  },
};

// ── Student menu (flat list, kept as-is) ─────────────────────────────────────
const studentMenu: MenuItem[] = [
  { id: 'dashboard', label: 'Bảng Điều Khiển', icon: Home },
  { id: 'tasks', label: 'Nhiệm Vụ', icon: Target },
  { id: 'history', label: 'Lịch Sử Làm Bài', icon: History },
  { id: 'liveExam', label: 'Phòng Thi', icon: Radio },
  { id: 'adaptive', label: 'Lộ Trình Cá Nhân', icon: BrainCircuit },
  ...(MINDMAP_ENABLED ? [{ id: 'mindmap' as SidebarTab, label: 'Sơ Đồ Tư Duy', icon: BrainCircuit }] : []),
  { id: 'simulations', label: 'Phòng Thí Nghiệm', icon: Beaker },
];

// ── Main Component ────────────────────────────────────────────────────────────
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
  setIsMobileOpen,
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

  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('phy9-theme') === 'light';
  });

  // Track which accordion group is open. Initialize to whichever group the current activeTab belongs to.
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    return findGroupForTab(activeTab);
  });

  // When activeTab changes externally, auto-expand the parent group
  useEffect(() => {
    const group = findGroupForTab(activeTab);
    if (group) setExpandedGroup(group);
  }, [activeTab]);

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('theme-light');
      localStorage.setItem('phy9-theme', 'light');
    } else {
      document.documentElement.classList.remove('theme-light');
      localStorage.setItem('phy9-theme', 'dark');
    }
  }, [isLightMode]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen]);

  if (!user) return null;

  const isDesktopCollapsed = isCollapsed && typeof window !== 'undefined' && window.innerWidth >= 768;

  const handleTabClick = (tab: SidebarTab) => {
    setActiveTab(tab);
    setIsMobileOpen(false);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroup(prev => prev === groupId ? null : groupId);
  };

  // ── Shared menu item renderer ─────────────────────────────────────────────
  const renderMenuItem = (
    item: MenuItem,
    accentColor: string,
    indicatorLayoutId: string,
  ) => {
    const accent = accentMap[accentColor] ?? accentMap['cyan'];
    const isActive = activeTab === item.id;

    return (
      <button
        key={item.id}
        onClick={() => handleTabClick(item.id)}
        title={item.label}
        className={cn(
          'w-full flex items-center p-3 rounded-2xl transition-all duration-200 cursor-pointer relative group touch-target',
          isActive
            ? accent.itemActive
            : 'text-slate-400 hover:bg-slate-800/80 hover:text-white border border-transparent hover:border-slate-700/50',
          isActive ? `border ${accent.itemBorder}` : '',
        )}
      >
        {isActive && (
          <motion.div
            layoutId={indicatorLayoutId}
            className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full', accent.indicator)}
            transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
          />
        )}
        <item.icon
          size={18}
          className={cn(
            'shrink-0 transition-transform duration-200 group-hover:scale-110',
            isDesktopCollapsed ? 'mx-auto' : '',
          )}
        />
        {!isDesktopCollapsed && (
          <span className="ml-3 text-sm font-semibold whitespace-nowrap">{item.label}</span>
        )}
      </button>
    );
  };

  // ── Accordion group renderer ──────────────────────────────────────────────
  const renderAccordionGroup = (group: MenuGroup) => {
    const accent = accentMap[group.color] ?? accentMap['cyan'];
    const isOpen = expandedGroup === group.id;
    // Is any item in this group active?
    const hasActiveChild = group.items.some(item => item.id === activeTab);

    if (isDesktopCollapsed) {
      // Collapsed desktop: show group icon only, clicking opens the first child
      return (
        <div key={group.id} className="space-y-0.5">
          {group.items.map(item => renderMenuItem(item, group.color, `activeIndicator-admin`))}
        </div>
      );
    }

    return (
      <div key={group.id} className="space-y-0.5">
        {/* Group Header / Accordion Toggle */}
        <button
          onClick={() => toggleGroup(group.id)}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer group',
            accent.headerHover,
            hasActiveChild && !isOpen ? `${accent.bg} border border-dashed ${accent.border}` : 'border border-transparent',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <group.icon
              size={16}
              className={cn('shrink-0 transition-transform duration-200', accent.header, isOpen && 'scale-110')}
            />
            <span className={cn('text-[11px] font-bold uppercase tracking-wider truncate', accent.header)}>
              {group.label}
            </span>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="shrink-0 ml-1"
          >
            <ChevronDown size={14} className={cn('transition-colors', isOpen ? accent.header : 'text-slate-600')} />
          </motion.div>
        </button>

        {/* Accordion Content */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className={cn('ml-2 pl-3 space-y-0.5 border-l', accent.border, 'py-1')}>
                {group.items.map(item => renderMenuItem(item, group.color, `activeIndicator-admin`))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // ── Sidebar Content ───────────────────────────────────────────────────────
  const sidebarContent = (
    <>
      {/* ── Header Logo + Toggle ── */}
      <div className="p-4 flex items-center justify-between border-b border-slate-800/50 h-[72px]">
        <AnimatePresence>
          {!isDesktopCollapsed && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleTabClick('dashboard')}
              className="font-headline font-black text-white text-xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity text-left"
            >
              PHYS<span className="text-fuchsia-500 text-glow-neon">9+</span>
            </motion.button>
          )}
        </AnimatePresence>
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
      <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6 custom-scrollbar scrolling-touch">

        {/* ── Student Section (always visible) ── */}
        <div className="space-y-1">
          {!isDesktopCollapsed && (
            <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
              Khu vực Học sinh
            </p>
          )}
          {studentMenu.map(item => renderMenuItem(item, 'fuchsia', 'activeIndicator-student'))}
        </div>

        {/* ── Admin Section with Accordion Groups ── */}
        {isAdmin && (
          <div className="space-y-1">
            {!isDesktopCollapsed && (
              <p className="px-3 text-[10px] font-bold text-cyan-500/50 uppercase tracking-widest mb-3">
                Trạm Admin
              </p>
            )}
            <div className={cn('space-y-1', isDesktopCollapsed && 'space-y-0.5')}>
              {adminMenuGroups.map(group => renderAccordionGroup(group))}
            </div>
          </div>
        )}
      </div>

      {/* ── Footer: Toggles ── */}
      <div className="p-4 border-t border-slate-800/50 space-y-2">
        <button
          onClick={() => setIsLightMode(!isLightMode)}
          title="Bật/Tắt Giao diện Sáng"
          className="w-full flex items-center p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer active:scale-95 touch-target"
        >
          {isLightMode
            ? <Moon size={20} className={cn('shrink-0 text-cyan-400', isDesktopCollapsed ? 'mx-auto' : '')} />
            : <Sun size={20} className={cn('shrink-0 text-yellow-400', isDesktopCollapsed ? 'mx-auto' : '')} />
          }
          {!isDesktopCollapsed && (
            <span className="ml-3 text-sm font-semibold whitespace-nowrap">
              {isLightMode ? 'Chế độ Tối' : 'Chế độ Sáng'}
            </span>
          )}
        </button>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title="Bật/Tắt Âm thanh"
          className="w-full flex items-center p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer active:scale-95 touch-target"
        >
          {soundEnabled
            ? <Volume2 size={20} className={cn('shrink-0 text-fuchsia-400', isDesktopCollapsed ? 'mx-auto' : '')} />
            : <VolumeX size={20} className={cn('shrink-0', isDesktopCollapsed ? 'mx-auto' : '')} />
          }
          {!isDesktopCollapsed && (
            <span className="ml-3 text-sm font-semibold whitespace-nowrap">
              {soundEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT'}
            </span>
          )}
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

export default Sidebar;
