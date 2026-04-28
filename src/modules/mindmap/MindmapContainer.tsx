/* ═══════════════════════════════════════════════════════════════════
 *  MINDMAP MODULE — MAIN CONTAINER (COLLAPSIBLE TREE)
 *  Ban đầu chỉ hiện root + nhánh chính.
 *  Click nhánh → xổ ra con. Click lại → co lại.
 *  🔒 LOCAL ONLY — Độc quyền Thầy Hậu Vật lý
 * ═══════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './mindmap.css';

import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, ChevronLeft, Lock, Maximize2, Minimize2, ZoomIn, ZoomOut, Crosshair } from 'lucide-react';

import PhysicsNode from './PhysicsNode';
import { useMindmapStore } from './useMindmapStore';
import { parseChapterToFlow, getNodesWithChildren } from './utils';
import type { MindmapChapter } from './types';
import type { UserProfile } from '../../types';

// ── Custom node types registry ────────────────────────────────────
const nodeTypes = { physicsNode: PhysicsNode };

// ── Grade color configs ───────────────────────────────────────────
const GRADE_COLORS: Record<string, { gradient: string; accent: string; label: string }> = {
  '10': {
    gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
    accent: '#3b82f6',
    label: 'Khối 10',
  },
  '11': {
    gradient: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
    accent: '#8b5cf6',
    label: 'Khối 11',
  },
  '12': {
    gradient: 'linear-gradient(135deg, #ef4444, #f97316)',
    accent: '#ef4444',
    label: 'Khối 12',
  },
};

// ── Watermark overlay (anti-screenshot) ───────────────────────────
const Watermark: React.FC<{ userName: string }> = ({ userName }) => {
  const marks = useMemo(() => {
    const items: { x: number; y: number; key: number }[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 6; col++) {
        items.push({
          x: col * 350 + (row % 2 === 0 ? 0 : 175),
          y: row * 220,
          key: row * 6 + col,
        });
      }
    }
    return items;
  }, []);

  return (
    <div className="mindmap-watermark">
      {marks.map(m => (
        <span
          key={m.key}
          className="mindmap-watermark-text"
          style={{ left: m.x, top: m.y }}
        >
          {userName} — PHY9+
        </span>
      ))}
    </div>
  );
};

// ── Internal Canvas (needs ReactFlowProvider ancestor) ────────────
const MindmapCanvas: React.FC<{
  chapter: MindmapChapter;
  onBack: () => void;
}> = ({ chapter, onBack }) => {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Collapsible state: which nodes are "open" ──
  // Initially only root is expanded → shows root + its direct children
  const rootNode = useMemo(
    () => chapter.nodes.find(n => !n.parent || n.type === 'root'),
    [chapter]
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    return new Set(rootNode ? [rootNode.id] : []);
  });

  const nodesWithChildren = useMemo(
    () => getNodesWithChildren(chapter.nodes),
    [chapter]
  );

  // ── Parse visible nodes/edges based on expandedIds ──
  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => parseChapterToFlow(chapter, expandedIds),
    [chapter, expandedIds]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Sync when expandedIds change → recalc nodes/edges
  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
    // Re-fit view after tree changes
    setTimeout(() => {
      fitView({ padding: 0.3, duration: 350 });
    }, 50);
  }, [flowNodes, flowEdges, setNodes, setEdges, fitView]);

  // Initial fit
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.3, duration: 400 });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // ── Toggle expand/collapse on click ──
  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const nodeId = node.id;
    if (!nodesWithChildren.has(nodeId)) return; // leaf node, nothing to toggle

    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        // Collapse: remove this node AND all its descendants from expanded set
        next.delete(nodeId);
        // Also collapse any expanded children recursively
        const removeDescendants = (parentId: string) => {
          const children = chapter.nodes.filter(n => n.parent === parentId);
          for (const child of children) {
            next.delete(child.id);
            removeDescendants(child.id);
          }
        };
        removeDescendants(nodeId);
      } else {
        // Expand
        next.add(nodeId);
      }
      return next;
    });
  }, [nodesWithChildren, chapter.nodes]);

  // ── Expand all / Collapse all ──
  const expandAll = useCallback(() => {
    setExpandedIds(new Set(chapter.nodes.map(n => n.id)));
  }, [chapter.nodes]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set(rootNode ? [rootNode.id] : []));
  }, [rootNode]);

  const allExpanded = expandedIds.size >= nodesWithChildren.size;

  return (
    <div className="w-full h-full relative">
      {/* Header bar */}
      <div
        className="absolute top-3 left-3 z-20 flex items-center gap-2"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all text-xs font-bold shadow-sm"
        >
          <ChevronLeft size={16} />
          Quay lại
        </button>
        <div className="px-3 py-2 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {GRADE_COLORS[chapter.grade]?.label || `Khối ${chapter.grade}`}
          </span>
          <span className="mx-1.5 text-slate-300">|</span>
          <span className="text-xs font-black text-slate-800">{chapter.chapter}</span>
        </div>
      </div>

      {/* Top-right: expand/collapse toggle + lock badge */}
      <div
        className="absolute top-3 right-3 z-20 flex items-center gap-2"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={allExpanded ? collapseAll : expandAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/90 backdrop-blur-md border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 text-[10px] font-bold shadow-sm transition-all"
        >
          {allExpanded ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
          {allExpanded ? 'Thu gọn' : 'Mở hết'}
        </button>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/90 backdrop-blur-md border border-red-200 text-red-500 text-[10px] font-bold shadow-sm">
          <Lock size={10} />
          Bản quyền
        </div>
      </div>

      {/* Desktop Hint (bottom center) - ẩn trên mobile để không chồng lên mobile hint */}
      <div className="hidden md:block absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur-md border border-slate-200 text-slate-400 text-[10px] font-medium shadow-sm pointer-events-none">
        💡 Click vào nhánh để mở rộng • Click lại để thu gọn
      </div>

      {/* ── Mobile Virtual Controls ──
           Hiển ở bottom-right trên mobile, ẩn trên desktop (màn hình lớn). */}
      <div
        className="md:hidden absolute bottom-14 right-3 z-20 flex flex-col gap-2"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Zoom In */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => zoomIn({ duration: 300 })}
          className="w-11 h-11 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg flex items-center justify-center text-slate-700 active:bg-slate-100 transition-colors"
          aria-label="Zoom In"
        >
          <ZoomIn size={18} />
        </motion.button>

        {/* Zoom Out */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => zoomOut({ duration: 300 })}
          className="w-11 h-11 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg flex items-center justify-center text-slate-700 active:bg-slate-100 transition-colors"
          aria-label="Zoom Out"
        >
          <ZoomOut size={18} />
        </motion.button>

        {/* Reset / Fit View */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => fitView({ padding: 0.3, duration: 400 })}
          className="w-11 h-11 rounded-2xl bg-indigo-600/90 backdrop-blur-md border border-indigo-400/40 shadow-lg shadow-indigo-500/30 flex items-center justify-center text-white active:bg-indigo-700 transition-colors"
          aria-label="Reset View"
        >
          <Crosshair size={18} />
        </motion.button>

        {/* Expand / Collapse All (shortcut for mobile) */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={allExpanded ? collapseAll : expandAll}
          className="w-11 h-11 rounded-2xl bg-fuchsia-600/90 backdrop-blur-md border border-fuchsia-400/40 shadow-lg shadow-fuchsia-500/30 flex items-center justify-center text-white active:bg-fuchsia-700 transition-colors"
          aria-label={allExpanded ? 'Thu gọn tất cả' : 'Mở rộng tất cả'}
        >
          {allExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </motion.button>
      </div>

      {/* Mobile hint */}
      <div className="md:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur-md border border-slate-200 text-slate-400 text-[10px] font-medium shadow-sm pointer-events-none">
        👆 1 ngón để cuộn • 2 ngón để zoom • Nút bên phải để điều hướng
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className="mindmap-canvas"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnScroll={!isMobile}       // desktop: scroll = pan
        zoomOnPinch                    // mobile: 2-finger zoom always on
        panOnDrag={[1, 2]}            // left-click or touch drag = pan
        zoomOnScroll={!isMobile}      // mobile: dùng nút thay vì scroll zoom
        zoomActivationKeyCode={null}  // bỏ "Ctrl+scroll" requirement
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#cbd5e1" />
        {/* Ẩn Controls mặc định trên mobile vì có panel riêng */}
        {!isMobile && <Controls showInteractive={false} />}
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          style={{ width: isMobile ? 100 : 140, height: isMobile ? 65 : 90 }}
        />
      </ReactFlow>
    </div>
  );
};

// ── Chapter selector grid ─────────────────────────────────────────
const ChapterGrid: React.FC<{
  grade: string;
  chapters: MindmapChapter[];
  onSelect: (chapter: MindmapChapter) => void;
}> = ({ grade, chapters, onSelect }) => {
  const gradeConfig = GRADE_COLORS[grade] || GRADE_COLORS['12'];

  if (chapters.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-20"
      >
        <BrainCircuit className="w-14 h-14 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500 text-base font-bold">
          Chưa có sơ đồ tư duy nào cho {gradeConfig.label}
        </p>
        <p className="text-slate-400 text-sm mt-1">
          Admin có thể tạo sơ đồ mới từ trang Quản Lý Mindmap
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5"
    >
      {chapters.map((ch, idx) => {
        const rootNode = ch.nodes.find(n => n.type === 'root');
        const nodeCount = ch.nodes.length;
        const formulaCount = ch.nodes.filter(n => n.type === 'formula').length;
        const imageCount = ch.nodes.filter(n => n.type === 'image').length;

        return (
          <motion.div
            key={`${ch.grade}_${ch.chapter}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="group relative bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 hover:border-fuchsia-500/50 rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(192,38,211,0.25)] overflow-hidden"
            onClick={() => onSelect(ch)}
          >
            {/* Background glow effect on hover */}
            <div className="absolute -inset-10 bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                  style={{ background: `linear-gradient(135deg, ${gradeConfig.accent}40, transparent)`, border: `1px solid ${gradeConfig.accent}50` }}
                >
                  🧠
                </div>
                <div className="flex flex-col gap-1.5 items-end">
                  {formulaCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm flex items-center gap-1">
                      📐 {formulaCount} Công thức
                    </span>
                  )}
                  {imageCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm flex items-center gap-1">
                      🖼️ {imageCount} Hình ảnh
                    </span>
                  )}
                </div>
              </div>

              <h4 className="text-white font-black text-lg mb-1.5 tracking-tight group-hover:text-fuchsia-300 transition-colors" style={{ fontFamily: '"Outfit", sans-serif' }}>
                {rootNode?.label || ch.chapter}
              </h4>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                {nodeCount} Điểm tri thức
              </p>
            </div>

            {/* Bottom Accent Line */}
            <div
              className="absolute bottom-0 left-0 w-full h-1.5 opacity-70 group-hover:opacity-100 group-hover:h-2 transition-all duration-300"
              style={{ background: gradeConfig.gradient }}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
};

// ── Main exported component ───────────────────────────────────────
interface MindmapContainerProps {
  user: UserProfile;
}

const MindmapContainer: React.FC<MindmapContainerProps> = ({ user }) => {
  const store = useMindmapStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // Grade detection
  const userGrade = useMemo(() => {
    const className = user.className || '';
    if (className.startsWith('10')) return '10';
    if (className.startsWith('11')) return '11';
    return '12';
  }, [user.className]);

  const [selectedGrade, setSelectedGrade] = useState(userGrade);
  const [viewingChapter, setViewingChapter] = useState<MindmapChapter | null>(null);

  // 🔒 Grade lock
  const isAdmin = user.role === 'admin' || user.email === 'haunn.vietanhschool@gmail.com';
  const availableGrades = isAdmin ? ['10', '11', '12'] : [userGrade];

  // Load chapters
  useEffect(() => {
    store.loadChaptersByGrade(selectedGrade);
  }, [selectedGrade]);

  // Content protection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const blockContextMenu = (e: MouseEvent) => { e.preventDefault(); return false; };
    const blockShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 's' || e.key === 'c')) {
        e.preventDefault(); return false;
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        container.style.visibility = 'hidden';
        setTimeout(() => { container.style.visibility = 'visible'; }, 500);
        return false;
      }
    };
    const blockDrag = (e: DragEvent) => { e.preventDefault(); return false; };

    container.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockShortcuts);
    container.addEventListener('dragstart', blockDrag);

    return () => {
      container.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockShortcuts);
      container.removeEventListener('dragstart', blockDrag);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="mindmap-protected relative"
      style={{ minHeight: viewingChapter ? '80vh' : 'auto' }}
    >
      <Watermark userName={user.displayName || user.email} />

      <AnimatePresence mode="wait">
        {viewingChapter ? (
          /* ══════ FULL MINDMAP VIEW ══════ */
          <motion.div
            key="canvas"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full rounded-2xl overflow-hidden border border-slate-200 bg-[#f8fafc]"
            style={{ height: '80vh', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
          >
            <ReactFlowProvider>
              <MindmapCanvas
                chapter={viewingChapter}
                onBack={() => {
                  setViewingChapter(null);
                  store.setFocusedNode(null);
                }}
              />
            </ReactFlowProvider>
          </motion.div>
        ) : (
          /* ══════ CHAPTER SELECTOR ══════ */
          <motion.div
            key="selector"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg md:text-2xl font-black text-white tracking-tight" style={{ fontFamily: '"Outfit", sans-serif' }}>
                  SƠ ĐỒ TƯ DUY VẬT LÝ
                </h2>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <Lock size={9} className="text-red-400" />
                  Độc quyền Phy9+ — Thầy Hậu Vật lý
                </p>
              </div>
            </div>

            {/* Grade tabs */}
            <div className="flex gap-2 mb-2">
              {availableGrades.map(grade => {
                const config = GRADE_COLORS[grade];
                const isActive = selectedGrade === grade;
                return (
                  <button
                    key={grade}
                    className="mindmap-grade-tab"
                    data-active={String(isActive)}
                    style={isActive ? { background: config.gradient } : {}}
                    onClick={() => setSelectedGrade(grade)}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>

            {/* Grade lock notice */}
            {!isAdmin && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold mb-3">
                <Lock size={10} />
                Bạn chỉ có thể xem sơ đồ của {GRADE_COLORS[userGrade]?.label}
              </div>
            )}

            {/* Chapters */}
            {store.isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <div className="w-8 h-8 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 text-sm font-medium">Đang tải sơ đồ tư duy...</p>
              </div>
            ) : store.error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-3xl">⚠️</div>
                <div className="text-center">
                  <p className="text-red-400 font-bold text-sm mb-1">{store.error}</p>
                  <p className="text-slate-500 text-xs">Mở F12 → Console để xem chi tiết lỗi</p>
                </div>
                <button
                  onClick={() => store.loadChaptersByGrade(selectedGrade)}
                  className="px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold transition-all flex items-center gap-2"
                >
                  🔄 Thử tải lại
                </button>
              </div>
            ) : (
              <ChapterGrid
                grade={selectedGrade}
                chapters={store.chapters}
                onSelect={ch => setViewingChapter(ch)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MindmapContainer;
