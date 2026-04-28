/* ═══════════════════════════════════════════════════════════════════
 *  MINDMAP — NODE EDITOR COMPONENT
 *  Form nhập liệu trực quan cho từng node
 * ═══════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Trash2, ChevronDown, ChevronRight, GripVertical,
  BookOpen, Calculator, Image, StickyNote, Crown,
} from 'lucide-react';
import type { MindmapNodeData, MindmapNodeType } from './types';

const TYPE_OPTIONS: { value: MindmapNodeType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'root', label: 'Gốc (Root)', icon: <Crown size={14} />, color: '#6366f1' },
  { value: 'theory', label: 'Lý thuyết', icon: <BookOpen size={14} />, color: '#3b82f6' },
  { value: 'formula', label: 'Công thức', icon: <Calculator size={14} />, color: '#f59e0b' },
  { value: 'image', label: 'Hình ảnh', icon: <Image size={14} />, color: '#10b981' },
  { value: 'note', label: 'Ghi chú', icon: <StickyNote size={14} />, color: '#94a3b8' },
];

interface NodeEditorProps {
  nodes: MindmapNodeData[];
  onChange: (nodes: MindmapNodeData[]) => void;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ nodes, onChange }) => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const addNode = () => {
    const hasRoot = nodes.some(n => n.type === 'root');
    const newNode: MindmapNodeData = {
      id: `n${Date.now()}`,
      type: hasRoot ? 'theory' : 'root',
      label: hasRoot ? '' : 'Tên chương',
      parent: hasRoot ? nodes[0]?.id : undefined,
    };
    const updated = [...nodes, newNode];
    onChange(updated);
    setExpandedIdx(updated.length - 1);
  };

  const updateNode = (idx: number, patch: Partial<MindmapNodeData>) => {
    const updated = nodes.map((n, i) => i === idx ? { ...n, ...patch } : n);
    onChange(updated);
  };

  const removeNode = (idx: number) => {
    const nodeId = nodes[idx].id;
    // Remove this node + any children referencing it
    const updated = nodes.filter((n, i) => i !== idx && n.parent !== nodeId);
    onChange(updated);
    setExpandedIdx(null);
  };

  // Build parent options (only nodes that come before current)
  const getParentOptions = (idx: number) =>
    nodes.filter((_, i) => i < idx).map(n => ({ id: n.id, label: n.label || n.id }));

  // Get depth for indentation
  const getDepth = (node: MindmapNodeData): number => {
    if (!node.parent) return 0;
    const parent = nodes.find(n => n.id === node.parent);
    return parent ? 1 + getDepth(parent) : 0;
  };

  return (
    <div className="space-y-2">
      {/* Node list */}
      {nodes.map((node, idx) => {
        const isOpen = expandedIdx === idx;
        const depth = getDepth(node);
        const typeOpt = TYPE_OPTIONS.find(t => t.value === node.type);

        return (
          <div key={node.id} style={{ marginLeft: Math.min(depth * 16, 48) }}>
            {/* Collapsed row */}
            <div
              onClick={() => setExpandedIdx(isOpen ? null : idx)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all border"
              style={{
                background: isOpen ? '#f8fafc' : '#ffffff',
                borderColor: isOpen ? typeOpt?.color || '#e2e8f0' : '#f1f5f9',
                boxShadow: isOpen ? `0 0 0 2px ${typeOpt?.color}15` : 'none',
              }}
            >
              <GripVertical size={12} className="text-slate-300 shrink-0" />
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `${typeOpt?.color}15`, color: typeOpt?.color }}
              >
                {typeOpt?.icon}
              </div>
              <span className="flex-1 text-xs font-bold text-slate-700 truncate">
                {node.label || <span className="text-slate-400 italic">Chưa đặt tên...</span>}
              </span>
              {node.math && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-mono shrink-0">fx</span>}
              {node.img_id && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 shrink-0">📷</span>}
              <span className="text-[9px] text-slate-400 font-mono shrink-0">{node.id}</span>
              {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            </div>

            {/* Expanded edit form */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 mt-1 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    {/* Row 1: Type + Parent */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Loại node</label>
                        <select
                          value={node.type}
                          onChange={e => updateNode(idx, { type: e.target.value as MindmapNodeType })}
                          className="w-full px-2.5 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 outline-none focus:border-indigo-400"
                        >
                          {TYPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Node cha</label>
                        <select
                          value={node.parent || ''}
                          onChange={e => updateNode(idx, { parent: e.target.value || undefined })}
                          className="w-full px-2.5 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 outline-none focus:border-indigo-400"
                        >
                          <option value="">— Không (Root) —</option>
                          {getParentOptions(idx).map(p => (
                            <option key={p.id} value={p.id}>{p.label} ({p.id})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Label */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Tiêu đề *</label>
                      <input
                        value={node.label}
                        onChange={e => updateNode(idx, { label: e.target.value })}
                        placeholder="VD: Khí lí tưởng, Đẳng nhiệt (Boyle)..."
                        className="w-full px-3 py-2 rounded-lg text-xs bg-white border border-slate-200 text-slate-700 outline-none focus:border-indigo-400 placeholder:text-slate-300"
                      />
                    </div>

                    {/* Row 3: Math (only for formula) */}
                    {(node.type === 'formula' || node.math) && (
                      <div>
                        <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 block">
                          Công thức KaTeX
                          <span className="text-slate-400 normal-case ml-1">VD: $pV = nRT$</span>
                        </label>
                        <input
                          value={node.math || ''}
                          onChange={e => updateNode(idx, { math: e.target.value || undefined })}
                          placeholder="$\dfrac{p_1 V_1}{T_1} = \dfrac{p_2 V_2}{T_2}$"
                          className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-amber-50 border border-amber-200 text-amber-900 outline-none focus:border-amber-400 placeholder:text-amber-300"
                        />
                      </div>
                    )}

                    {/* Row 4: Image ID (only for image) */}
                    {(node.type === 'image' || node.img_id) && (
                      <div>
                        <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1 block">
                          Image ID
                          <span className="text-slate-400 normal-case ml-1">VD: IMG_DANGNH_PV</span>
                        </label>
                        <input
                          value={node.img_id || ''}
                          onChange={e => updateNode(idx, { img_id: e.target.value || undefined })}
                          placeholder="IMG_CHAPTER_NAME"
                          className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-emerald-50 border border-emerald-200 text-emerald-900 outline-none focus:border-emerald-400 placeholder:text-emerald-300"
                        />
                      </div>
                    )}

                    {/* Row 5: Description */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Mô tả thêm (tùy chọn)</label>
                      <textarea
                        value={node.description || ''}
                        onChange={e => updateNode(idx, { description: e.target.value || undefined })}
                        placeholder="Hiển thị ngay bên dưới tiêu đề..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg text-xs bg-white border border-slate-200 text-slate-700 outline-none focus:border-indigo-400 placeholder:text-slate-300 resize-none"
                      />
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => removeNode(idx)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
                      >
                        <Trash2 size={10} /> Xoá node
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Add node button */}
      <button
        onClick={addNode}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-dashed border-indigo-300 transition-all"
      >
        <Plus size={14} /> Thêm node
      </button>
    </div>
  );
};

export default NodeEditor;
