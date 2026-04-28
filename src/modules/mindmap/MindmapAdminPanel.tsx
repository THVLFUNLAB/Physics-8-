/* ═══════════════════════════════════════════════════════════════════
 *  MINDMAP MODULE — ADMIN PANEL (FORM-BASED)
 *  Nhập liệu trực quan: chọn khối, đặt tên chương, thêm node bằng form
 *  Hỗ trợ: tạo mới, sửa, xem JSON, live preview, upload ảnh, lưu Firebase
 *  🔒 LOCAL ONLY — Độc quyền Thầy Hậu Vật lý
 * ═══════════════════════════════════════════════════════════════════ */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Save, AlertTriangle, CheckCircle2, Eye, EyeOff, Upload,
  Trash2, Copy, FileJson, RefreshCw, BrainCircuit, BookOpen,
  PenLine, Code2, FolderOpen, PlusCircle, ChevronDown, List,
} from 'lucide-react';

import MindmapContainer from './MindmapContainer';
import NodeEditor from './NodeEditor';
import { useMindmapStore } from './useMindmapStore';
import { validateMindmapJSON, chapterToSlug } from './utils';
import { SAMPLE_MINDMAP_JSON, type MindmapChapter, type MindmapNodeData } from './types';
import { storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from '../../components/Toast';
import type { UserProfile } from '../../types';
import './mindmap.css';

interface Props { user: UserProfile; }

type EditorMode = 'form' | 'json';

const MindmapAdminPanel: React.FC<Props> = ({ user }) => {
  const store = useMindmapStore();

  // ── Chapter metadata ──
  const [grade, setGrade] = useState<string>('12');
  const [chapterName, setChapterName] = useState('');
  const [nodes, setNodes] = useState<MindmapNodeData[]>([]);

  // ── Editor state ──
  const [mode, setMode] = useState<EditorMode>('form');
  const [jsonText, setJsonText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [uploadingImgId, setUploadingImgId] = useState<string | null>(null);

  // ── Build chapter object from form state ──
  const chapter: MindmapChapter | null = useMemo(() => {
    if (!chapterName.trim() || nodes.length === 0) return null;
    return { grade, chapter: chapterName, nodes };
  }, [grade, chapterName, nodes]);

  // ── Validation ──
  const validation = useMemo(() => {
    if (!chapter) return { valid: false, errors: ['Điền đầy đủ thông tin chương và ít nhất 1 node'] };
    return validateMindmapJSON(chapter);
  }, [chapter]);

  // ── Sync form → JSON when switching to JSON mode ──
  useEffect(() => {
    if (mode === 'json' && chapter) {
      setJsonText(JSON.stringify(chapter, null, 2));
    }
  }, [mode]);

  // ── Parse JSON → form ──
  const applyJsonToForm = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      const v = validateMindmapJSON(parsed);
      if (!v.valid) { toast.error('JSON không hợp lệ: ' + v.errors[0]); return; }
      setGrade(String(parsed.grade));
      setChapterName(parsed.chapter);
      setNodes(parsed.nodes);
      setMode('form');
      toast.success('Đã nhập JSON thành công!');
    } catch (e: any) {
      toast.error('Lỗi parse JSON: ' + e.message);
    }
  }, [jsonText]);

  // ── Load sample ──
  const loadSample = () => {
    setGrade(SAMPLE_MINDMAP_JSON.grade);
    setChapterName(SAMPLE_MINDMAP_JSON.chapter);
    setNodes([...SAMPLE_MINDMAP_JSON.nodes]);
    toast.success('Đã tải mẫu!');
  };

  // ── Load existing chapter from Firebase ──
  const loadExistingChapter = (ch: MindmapChapter) => {
    setGrade(ch.grade);
    setChapterName(ch.chapter);
    setNodes([...ch.nodes]);
    toast.success(`Đã tải "${ch.chapter}"`);
  };

  // ── Save to Firestore ──
  const handleSave = async () => {
    if (!chapter || !validation.valid) {
      toast.error('Dữ liệu chưa hợp lệ');
      return;
    }
    try {
      await store.saveChapter(chapter, user.uid);
      toast.success(`✅ Đã lưu "${chapter.chapter}" (Khối ${chapter.grade})`);
    } catch (err: any) {
      toast.error('Lỗi lưu: ' + (err.message || ''));
    }
  };

  // ── Delete from Firestore ──
  const handleDelete = async () => {
    if (!chapterName.trim()) return;
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN sơ đồ "${chapterName}" (Khối ${grade}) khỏi cơ sở dữ liệu? Hành động này không thể hoàn tác.`)) return;
    try {
      await store.deleteChapter(grade, chapterName);
      toast.success(`🗑️ Đã xóa sơ đồ "${chapterName}"`);
      setChapterName('');
      setNodes([]);
    } catch (err: any) {
      toast.error('Lỗi xóa: ' + (err.message || ''));
    }
  };

  // ── Image upload with Timeout & Error Handling ──
  const handleImageUpload = async (imgId: string, file: File) => {
    setUploadingImgId(imgId);
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File ảnh quá lớn (vượt quá 5MB).');
      }

      const ext = file.name.split('.').pop() || 'png';
      const path = `mindmap_images/${imgId}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      
      console.info(`[Upload] Bắt đầu upload file ${file.name} lên ${path}`);
      
      // Upload with timeout (Firebase Storage sometimes hangs indefinitely if not configured)
      const uploadPromise = uploadBytes(storageRef, file, { contentType: file.type });
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Upload timeout (15s) - Vui lòng kiểm tra lại cấu hình Firebase Storage trong Console hoặc mạng của bạn.')), 15000)
      );
      
      await Promise.race([uploadPromise, timeoutPromise]);
      const url = await getDownloadURL(storageRef);
      
      setNodes(prev => prev.map(n => n.img_id === imgId ? { ...n, img_url: url } : n));
      toast.success(`📷 Upload ảnh thành công!`);
    } catch (err: any) {
      console.error('[Upload] Lỗi:', err);
      toast.error('Lỗi upload: ' + (err.message || 'Chưa bật Storage trên Firebase?'));
    } finally {
      setUploadingImgId(null);
    }
  };

  // ── Stats ──
  const stats = useMemo(() => ({
    total: nodes.length,
    theory: nodes.filter(n => n.type === 'theory').length,
    formula: nodes.filter(n => n.type === 'formula').length,
    image: nodes.filter(n => n.type === 'image').length,
    imageNodes: nodes.filter(n => n.img_id) as MindmapNodeData[],
  }), [nodes]);

  // ── Load chapters for chapter browser ──
  const [showBrowser, setShowBrowser] = useState(false);
  useEffect(() => { store.loadChaptersByGrade(grade); }, [grade]);

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black text-white tracking-tight">QUẢN LÝ SƠ ĐỒ TƯ DUY</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Tạo & chỉnh sửa mindmap cho học sinh</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBrowser(!showBrowser)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all">
            <FolderOpen size={13} /> Mở chương có sẵn
          </button>
          <button onClick={loadSample}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all">
            <FileJson size={13} /> Tải mẫu
          </button>
        </div>
      </div>

      {/* ── CHAPTER BROWSER (existing chapters from Firebase) ── */}
      <AnimatePresence>
        {showBrowser && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2"><List size={14} className="text-cyan-400" /> Chương đã lưu ({store.chapters.length})</h3>
              {store.chapters.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có chương nào cho Khối {grade}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {store.chapters.map(ch => (
                    <button key={`${ch.grade}_${ch.chapter}`}
                      onClick={() => { loadExistingChapter(ch); setShowBrowser(false); }}
                      className="text-left px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all">
                      <p className="text-xs font-bold text-white truncate">{ch.chapter}</p>
                      <p className="text-[10px] text-slate-500">{ch.nodes.length} nút • Khối {ch.grade}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CHAPTER INFO (Grade + Name) ── */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-black text-white flex items-center gap-2"><BookOpen size={14} className="text-violet-400" /> Thông tin chương</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Khối lớp</label>
            <select value={grade} onChange={e => setGrade(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm font-bold bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-500">
              <option value="10">Khối 10</option>
              <option value="11">Khối 11</option>
              <option value="12">Khối 12</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Tên chương</label>
            <input value={chapterName} onChange={e => setChapterName(e.target.value)}
              placeholder="VD: Khí lí tưởng, Động lực học, Sóng cơ..."
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-800 border border-slate-700 text-white outline-none focus:border-cyan-500 placeholder:text-slate-600" />
          </div>
        </div>
      </div>

      {/* ── MODE TOGGLE (Form / JSON) ── */}
      <div className="flex items-center gap-2">
        <button onClick={() => setMode('form')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${mode === 'form' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}>
          <PenLine size={13} /> Nhập bằng Form
        </button>
        <button onClick={() => setMode('json')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${mode === 'json' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}>
          <Code2 size={13} /> Nhập bằng JSON
        </button>
        <div className="flex-1" />
        {/* Stats */}
        {nodes.length > 0 && (
          <div className="flex gap-2 text-[10px] font-bold">
            <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300">{stats.total} nút</span>
            <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400">{stats.theory} LT</span>
            <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400">{stats.formula} CT</span>
            <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400">{stats.image} ẢNH</span>
          </div>
        )}
      </div>

      {/* ── EDITOR AREA ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT: Editor (2/3) */}
        <div className="lg:col-span-2 space-y-3">
          {mode === 'form' ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
              <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
                <PenLine size={14} className="text-indigo-400" /> Danh sách Node ({nodes.length})
              </h3>
              <NodeEditor nodes={nodes} onChange={setNodes} />
            </div>
          ) : (
            <div className="space-y-3">
              <textarea className="mindmap-json-textarea" value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                placeholder='Dán JSON vào đây...' spellCheck={false} />
              <div className="flex gap-2">
                <button onClick={applyJsonToForm}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all">
                  <CheckCircle2 size={13} /> Áp dụng JSON → Form
                </button>
                <button onClick={() => { navigator.clipboard.writeText(jsonText); toast.success('Đã copy!'); }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all">
                  <Copy size={13} /> Copy
                </button>
              </div>
            </div>
          )}

          {/* Validation */}
          <AnimatePresence mode="wait">
            {validation.errors.length > 0 && nodes.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1">
                {validation.errors.slice(0, 3).map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-red-400 text-xs font-medium">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />{err}
                  </div>
                ))}
              </motion.div>
            )}
            {validation.valid && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <CheckCircle2 size={13} /> Dữ liệu hợp lệ — sẵn sàng lưu
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT: Actions + Images (1/3) */}
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <button onClick={handleSave} disabled={!validation.valid || store.isSaving}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20">
              {store.isSaving ? <><RefreshCw size={15} className="animate-spin" /> Đang lưu...</> : <><Save size={15} /> Lưu Firebase</>}
            </button>
            <button onClick={handleDelete} disabled={store.isSaving || !chapterName.trim()}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20">
              <Trash2 size={14} /> Xóa khỏi Firebase
            </button>
          </div>

          {/* Preview toggle */}
          <button onClick={() => setShowPreview(!showPreview)}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 border border-violet-500/30">
            {showPreview ? <><EyeOff size={14} /> Ẩn preview</> : <><Eye size={14} /> Xem trước sơ đồ</>}
          </button>

          {/* Image upload section */}
          {stats.imageNodes.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-black text-white flex items-center gap-2">
                <Upload size={12} className="text-emerald-400" /> Upload ảnh ({stats.imageNodes.length})
              </h3>
              {stats.imageNodes.map(node => (
                <div key={node.img_id} className="flex items-center gap-2 p-2 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                    {node.img_url ? <img src={node.img_url} alt="" className="w-full h-full object-cover" /> : <span className="text-sm">📷</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white truncate">{node.label}</p>
                    <p className="text-[9px] text-slate-500 font-mono">{node.img_id}</p>
                  </div>
                  <label className="shrink-0">
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { 
                        const f = e.target.files?.[0]; 
                        if (f && node.img_id) {
                          handleImageUpload(node.img_id, f);
                        }
                        e.target.value = ''; // Reset để có thể upload lại cùng một file
                      }} />
                    <span className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      uploadingImgId === node.img_id ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : node.img_url ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'}`}>
                      {uploadingImgId === node.img_id ? <><RefreshCw size={10} className="animate-spin" /> ...</>
                       : node.img_url ? <><CheckCircle2 size={10} /> OK</>
                       : <><Upload size={10} /> Up</>}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Quick ref */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-black text-white flex items-center gap-2"><BookOpen size={12} className="text-violet-400" /> Hướng dẫn</h3>
            <div className="text-[10px] text-slate-500 space-y-1 leading-relaxed">
              <p>• <strong className="text-cyan-400">Root</strong>: node gốc (tên chương) — chỉ 1</p>
              <p>• <strong className="text-blue-400">Lý thuyết</strong>: kiến thức chính</p>
              <p>• <strong className="text-amber-400">Công thức</strong>: có KaTeX <code className="text-amber-300">$pV=nRT$</code></p>
              <p>• <strong className="text-emerald-400">Hình ảnh</strong>: cần IMG_ID + upload ảnh</p>
              <p>• Mỗi node phải có <strong>Node cha</strong> (trừ Root)</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── LIVE PREVIEW ── */}
      <AnimatePresence>
        {showPreview && chapter && validation.valid && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="border-t border-slate-800 pt-5">
              <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2"><Eye size={14} className="text-fuchsia-400" /> LIVE PREVIEW</h3>
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-[#f8fafc]" style={{ height: '60vh' }}>
                <MindmapContainer user={user} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MindmapAdminPanel;
