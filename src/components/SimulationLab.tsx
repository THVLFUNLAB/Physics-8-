import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, X, Save, Trash2, Code2, LayoutTemplate, Beaker,
  Wand2, Send, Loader2, AlertCircle, Copy, Check, ChevronDown, ChevronUp,
  ExternalLink, Maximize2
} from 'lucide-react';
import { collection, addDoc, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Simulation } from '../types';
import { LabPlayer } from './LabPlayer';

// ─── Giới hạn kích thước: Firestore 1MB per document ─────────────────────
const MAX_CODE_BYTES = 900_000; // 900KB limit to be safe

// ─── Compress / Decompress HTML bằng CompressionStream (hỗ trợ Chrome 80+) ─
async function compressCode(code: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const inputStream = new ReadableStream({
      start(ctrl) { ctrl.enqueue(encoder.encode(code)); ctrl.close(); }
    });
    const compressedStream = inputStream.pipeThrough(new CompressionStream('gzip'));
    const bytes = await new Response(compressedStream).arrayBuffer();
    // Encode to base64 để lưu Firestore
    const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    return '__gzip__' + b64; // Tiền tố để nhận biết đã nén
  } catch {
    return code; // Fallback: lưu thô nếu browser không hỗ trợ
  }
}

export async function decompressCode(stored: string): Promise<string> {
  if (!stored.startsWith('__gzip__')) return stored; // Không nén
  try {
    const b64 = stored.slice(7);
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const decompressedStream = new ReadableStream({
      start(ctrl) { ctrl.enqueue(bytes); ctrl.close(); }
    }).pipeThrough(new DecompressionStream('gzip'));
    return await new Response(decompressedStream).text();
  } catch {
    return stored;
  }
}

// ─── Helper: đếm bytes UTF-8 ─────────────────────────────────────────────
const byteSize = (str: string) => new Blob([str]).size;
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : `${(bytes/1024).toFixed(1)}KB`;

// ==========================================
// 1. Giao diện Cửa sổ xem Mô phỏng (Viewer)
// ==========================================
// ── SimulationViewer: Modal wrapper dùng LabPlayer ───────────────────────────
export const SimulationViewer = ({
  simulation,
  onClose,
}: {
  simulation: Simulation;
  onClose: () => void;
}) => {
  const [htmlSource, setHtmlSource] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(!simulation.sourceUrl);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(() => window.innerWidth > window.innerHeight);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Nếu không có sourceUrl → giải nén html_code để truyền vào LabPlayer dưới dạng srcDoc
  useEffect(() => {
    if (simulation.sourceUrl) {
      setLoadingCode(false); // LabPlayer tự xử lý loading state
      return;
    }
    if (!simulation.html_code) {
      setHtmlSource('<h1 style="color:white;font-family:sans-serif;padding:2rem">Lỗi: Không tìm thấy mã nguồn mô phỏng.</h1>');
      setLoadingCode(false);
      return;
    }
    decompressCode(simulation.html_code)
      .then(c => { setHtmlSource(c); setLoadingCode(false); })
      .catch(() => { setHtmlSource('<h1>Lỗi giải nén mô phỏng.</h1>'); setLoadingCode(false); });
  }, [simulation.sourceUrl, simulation.html_code]);

  // Orientation
  useEffect(() => {
    const handler = () => setTimeout(() => setIsLandscape(window.innerWidth > window.innerHeight), 100);
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => { window.removeEventListener('resize', handler); window.removeEventListener('orientationchange', handler); };
  }, []);

  // Fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await containerRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch { console.warn('[SimViewer] Fullscreen API không hỗ trợ'); }
  };

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Nguồn truyền vào LabPlayer
  const labSource = simulation.sourceUrl ?? htmlSource ?? '';

  // Tính chiều cao header để trừ ra cho iframe container
  const HEADER_H = isMobile && !isLandscape ? 88 : 60; // header + banner hint

  return (
    <AnimatePresence>
      {/* Outer: fixed inset-0 để chiếm toàn bộ viewport — không dùng flex centering */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-sm"
      >
        {/* Inner: full height, rounded chỉ trên desktop */}
        <motion.div
          ref={containerRef}
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full h-full md:max-w-7xl md:max-h-[95vh] md:mx-auto md:my-auto md:absolute md:inset-x-0 md:top-1/2 md:-translate-y-1/2 md:rounded-3xl overflow-hidden bg-slate-900 border-0 md:border md:border-slate-800 shadow-2xl flex flex-col"
          style={{ height: '100%' }}
        >
          {/* ── HEADER ── */}
          <div className="flex items-center justify-between px-3 py-2 md:px-5 md:py-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600/20 flex items-center justify-center rounded-xl border border-blue-500/30 shrink-0">
                <Beaker className="text-blue-400 w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-black text-white truncate">{simulation.title}</h3>
                <p className="text-[10px] text-slate-400 truncate hidden sm:block">{simulation.category}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {simulation.sourceUrl && (
                <a
                  href={simulation.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Mở trong tab mới"
                  className="p-2 hover:bg-blue-500/20 hover:text-blue-400 rounded-xl transition-colors text-slate-400"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
              <button onClick={toggleFullscreen} title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                className="p-2 hover:bg-blue-500/20 hover:text-blue-400 rounded-xl transition-colors text-slate-400">
                <Maximize2 className="w-5 h-5" />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400" title="Đóng">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── LANDSCAPE HINT ── */}
          {isMobile && !isLandscape && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
              <span className="text-amber-400 text-xs font-bold">📱 Xoay ngang để xem tốt hơn!</span>
              {simulation.sourceUrl && (
                <a href={simulation.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-black text-blue-400 underline shrink-0">Mở tab mới</a>
              )}
            </motion.div>
          )}

          {/* ── LAB PLAYER (sandbox iframe) ── */}
          {/* CRITICAL: phải dùng height cứng (100dvh - header), KHÔNG dùng flex-1 min-h-0 trên mobile */}
          <div
            className="relative flex-1"
            style={{
              // iOS 13/14 FIX: dvh không hỗ trợ trước iOS 15.4 → dùng vh thường
              height: isMobile
                ? `calc(100vh - ${HEADER_H}px)`
                : undefined,
              minHeight: isMobile ? 300 : 0,
            }}
          >
            {loadingCode ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
                <p className="text-slate-400 text-sm">Đang giải nén mô phỏng...</p>
              </div>
            ) : (
              <LabPlayer title={simulation.title} source={labSource} className="absolute inset-0 w-full h-full" />
            )}
          </div>

          {/* ── FOOTER (ẩn trên mobile để không chiếm thêm chỗ) ── */}
          <div className="hidden md:flex items-center justify-between px-5 py-3 bg-slate-950 border-t border-slate-800 text-sm text-slate-400 shrink-0">
            <span><strong className="text-slate-300">Mô tả:</strong> {simulation.description}</span>
            <button onClick={toggleFullscreen}
              className="flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
              <Maximize2 className="w-4 h-4" /> Toàn màn hình
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ==========================================
// 2. AI Assistant Panel
// ==========================================
const AI_PROMPT_TEMPLATES = [
  { label: 'Con lắc lò xo', prompt: 'Tạo mô phỏng con lắc lò xo nằm ngang bằng HTML/CSS/JS thuần, có nút Play/Pause, slider điều chỉnh biên độ và tần số, vẽ đồ thị dao động real-time.' },
  { label: 'Sóng âm', prompt: 'Tạo mô phỏng sóng âm lan truyền trong không khí bằng Canvas API, hiển thị sóng nén và sóng dãn, điều chỉnh tần số và biên độ.' },
  { label: 'Từ trường', prompt: 'Tạo mô phỏng đường sức từ trường quanh dây dẫn thẳng mang dòng điện, dùng Canvas 2D, hiển thị chiều dòng điện và hướng từ trường theo quy tắc bàn tay phải.' },
  { label: 'Khúc xạ ánh sáng', prompt: 'Tạo mô phỏng khúc xạ ánh sáng qua 2 môi trường (không khí và kính), dùng Canvas, kéo tia sáng được, hiển thị góc tới và góc khúc xạ, định luật Snell.' },
  { label: 'Mạch RLC', prompt: 'Tạo mô phỏng mạch RLC nối tiếp với dòng điện xoay chiều, hiển thị đồ thị U và I theo thời gian, điều chỉnh R, L, C và tần số f bằng slider.' },
];

interface AISimPanelProps {
  onCodeGenerated: (code: string) => void;
}

const AISimPanel: React.FC<AISimPanelProps> = ({ onCodeGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);

  const callGemini = async (userPrompt: string) => {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!apiKey) { setError('Chưa cấu hình VITE_GEMINI_API_KEY'); return; }

    setLoading(true);
    setError('');
    try {
      const systemInstruction = `Bạn là chuyên gia lập trình mô phỏng Vật lý tương tác.
Tạo file HTML hoàn chỉnh (chứa CSS và JS inline) theo yêu cầu.
YÊU CẦU BẮT BUỘC:
- Chỉ trả về thuần túy mã HTML, KHÔNG thêm markdown, KHÔNG thêm \`\`\`html
- Giao diện dark theme (background #0f172a, text trắng)
- Có nút điều khiển (Play/Pause, Reset) và slider tham số vật lý
- Responsive, hoạt động tốt trong iframe 800x500px
- Dùng Canvas API hoặc CSS animation, KHÔNG dùng thư viện ngoài
- Có chú thích vật lý bằng tiếng Việt
- Code phải chạy được ngay, không lỗi`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      let code = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // Loại bỏ markdown wrapper nếu AI không tuân thủ
      code = code.replace(/^```html\n?/i, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
      if (code) onCodeGenerated(code);
      else throw new Error('AI không trả về code.');
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối AI');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-purple-950/40 to-blue-950/40 border border-purple-600/30 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-black text-purple-300 uppercase tracking-widest hover:bg-purple-600/10 transition-all"
      >
        <span className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-purple-400" /> 
          AI Tạo Mô Phỏng (Gemini)
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-purple-600/20">
          {/* Template shortcuts */}
          <div className="pt-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Mẫu nhanh:</p>
            <div className="flex flex-wrap gap-2">
              {AI_PROMPT_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setPrompt(t.prompt)}
                  className="px-3 py-1.5 text-[10px] font-bold bg-slate-800 hover:bg-purple-600/20 border border-slate-700 hover:border-purple-500/50 rounded-lg text-slate-400 hover:text-purple-300 transition-all"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt input */}
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Mô tả mô phỏng vật lý bạn cần... (VD: Tạo mô phỏng con lắc đơn, cho phép điều chỉnh chiều dài dây và góc ban đầu)"
            rows={4}
            className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:border-purple-500 focus:outline-none resize-none transition-colors"
          />

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-600/10 border border-red-600/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={() => callGemini(prompt)}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> AI đang tạo code...</>
            ) : (
              <><Send className="w-4 h-4" /> Tạo mô phỏng</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. Giao diện Quản trị Mô phỏng (Admin)
// ==========================================
export const SimulationAdminBoard = ({ onPlay }: { onPlay?: (sim: Simulation) => void }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Cơ học');
  const [htmlCode, setHtmlCode] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sizeWarning, setSizeWarning] = useState('');

  const codeBytes = byteSize(htmlCode);

  // Cảnh báo kích thước
  useEffect(() => {
    if (codeBytes === 0) { setSizeWarning(''); return; }
    if (codeBytes > MAX_CODE_BYTES) {
      setSizeWarning(`⚠️ Code quá lớn (${formatSize(codeBytes)}). Sẽ tự động nén khi lưu.`);
    } else {
      setSizeWarning(`✅ Kích thước: ${formatSize(codeBytes)} — phù hợp`);
    }
  }, [codeBytes]);

  // Load existing simulations
  useEffect(() => {
    const fetchSimulations = async () => {
      try {
        const snap = await getDocs(collection(db, 'simulations'));
        const simsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Simulation));
        setSimulations(simsData.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
      } catch (error) {
        console.error("Lỗi khi load simulations:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSimulations();
  }, []);

  const handleSave = async () => {
    if (!title.trim()) return alert("Vui lòng nhập Tên mô phỏng!");
    if (!htmlCode.trim()) return alert("Vui lòng dán code HTML vào ô bên dưới!");
    
    setSaving(true);
    try {
      // Nén code trước khi lưu nếu quá lớn
      let storedCode = htmlCode;
      const rawBytes = byteSize(htmlCode);
      if (rawBytes > 50_000) { // Nén nếu > 50KB
        storedCode = await compressCode(htmlCode);
        console.log(`[SimLab] Nén: ${formatSize(rawBytes)} → ${formatSize(byteSize(storedCode))}`);
      }

      // Kiểm tra sau khi nén
      if (byteSize(storedCode) > MAX_CODE_BYTES) {
        throw new Error(`Code sau khi nén vẫn quá lớn (${formatSize(byteSize(storedCode))}). Hãy tối giản code.`);
      }

      const newSim: Omit<Simulation, 'id'> = {
        title: title.trim(),
        description: description.trim() || 'Mô phỏng vật lý tương tác',
        category,
        html_code: storedCode,
        thumbnail: '🧪',
        createdAt: Timestamp.now(),
      };
      
      const docRef = await addDoc(collection(db, 'simulations'), newSim);
      setSimulations([{ id: docRef.id, ...newSim }, ...simulations]);
      
      // Reset form
      setTitle('');
      setDescription('');
      setHtmlCode('');
      setCategory('Cơ học');
      alert(`✅ Đã lưu mô phỏng "${title}" thành công!`);
    } catch (error: any) {
      console.error("Lỗi khi lưu:", error);
      alert(`❌ Lỗi khi lưu: ${error.message || 'Kiểm tra kết nối mạng và Firebase Rules.'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa mô phỏng này?")) return;
    try {
      await deleteDoc(doc(db, 'simulations', id));
      setSimulations(simulations.filter(s => s.id !== id));
    } catch (error) {
      console.error("Lỗi khi xóa:", error);
      alert('Lỗi khi xóa. Kiểm tra kết nối.');
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(htmlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* ── AI Panel ── */}
      <AISimPanel onCodeGenerated={(code) => {
        setHtmlCode(code);
        // Tự động đặt tiêu đề nếu chưa có
        if (!title) setTitle('Mô phỏng AI tạo');
      }} />

      {/* ── Form Upload thủ công ── */}
      <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl">
        <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-wide mb-6">
          <Code2 className="text-blue-500" /> Thông tin & Mã nguồn
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form metadata */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tên mô phỏng *</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Con lắc lò xo nằm ngang..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Chuyên mục / Nội dung học tập</label>
              <input 
                type="text"
                list="sim-categories"
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Nhập hoặc chọn chuyên mục..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <datalist id="sim-categories">
                <option value="Sóng cơ - Dao động (Cơ học)" />
                <option value="Vật lý Nhiệt (Nhiệt học)" />
                <option value="Điện xoay chiều - Từ trường" />
                <option value="Khúc xạ - Giao thoa (Quang học)" />
                <option value="Vật lý hạt nhân - Lượng tử" />
                <option value="Mạch điện (DC / AC)" />
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Mô tả mục tiêu học tập</label>
              <textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Bài học rút ra từ mô phỏng này là gì?"
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          
          {/* Code area */}
          <div className="space-y-2 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">
                HTML/JS/CSS Code
              </label>
              <div className="flex items-center gap-2">
                {sizeWarning && (
                  <span className={`text-[10px] font-bold ${sizeWarning.startsWith('⚠️') ? 'text-amber-400' : 'text-green-400'}`}>
                    {sizeWarning}
                  </span>
                )}
                {htmlCode && (
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Đã copy' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
            <textarea 
              value={htmlCode} 
              onChange={(e) => setHtmlCode(e.target.value)}
              placeholder="Paste toàn bộ mã nguồn HTML/JS/CSS vào đây (từ Gemini Canvas hoặc AI tạo ở trên)..."
              className="flex-1 min-h-[300px] w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-green-400 font-mono text-xs focus:outline-none focus:border-blue-500 transition-colors resize-y whitespace-pre"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Live Preview */}
        {htmlCode && (
          <div className="mt-8 border-t border-slate-800 pt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <Play className="w-4 h-4 text-green-500" /> Xem trước (Live Preview)
              </h3>
              <span className="text-[10px] text-slate-500">Mô phỏng chạy trong sandbox cô lập</span>
            </div>
            <div className="w-full aspect-video md:aspect-[21/9] bg-white rounded-2xl overflow-hidden border-4 border-slate-800 relative z-0">
              <iframe
                title="preview"
                srcDoc={htmlCode}
                sandbox="allow-scripts allow-same-origin"
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {codeBytes > 50_000 
                  ? `💾 Code sẽ được tự động nén (${formatSize(codeBytes)}) trước khi lưu Firestore`
                  : `💾 Kích thước: ${formatSize(codeBytes)}`
                }
              </p>
              <button
                onClick={handleSave}
                disabled={saving || !title.trim() || !htmlCode.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all flex items-center gap-2"
              >
                {saving 
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Đang nén & lưu...</>
                  : <><Save className="w-5 h-5" /> Lưu Mô Phỏng</>
                }
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Thư viện đã tạo ── */}
      <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl">
        <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-wide mb-6">
          <LayoutTemplate className="text-purple-500" /> Thư viện đã tạo
        </h2>
        
        {loading ? (
          <div className="flex items-center gap-3 text-slate-500 py-8">
            <Loader2 className="w-5 h-5 animate-spin" /> Đang tải danh sách mô phỏng...
          </div>
        ) : simulations.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Chưa có mô phỏng nào. Hãy tạo mô phỏng đầu tiên!</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {simulations.map(sim => (
              <div 
                key={sim.id} 
                className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col cursor-pointer hover:border-slate-600 transition-all group"
                onClick={() => onPlay && onPlay(sim)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="relative">
                    <span className="text-2xl">{sim.thumbnail || '🧪'}</span>
                    {onPlay && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                        <Play className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); sim.id && handleDelete(sim.id); }}
                    className="text-slate-600 hover:text-red-500 transition-colors p-2"
                    title="Xóa mô phỏng"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h4 className="text-white font-bold text-sm mb-1 line-clamp-1 group-hover:text-blue-400 transition-colors">{sim.title}</h4>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2">{sim.category}</p>
                <p className="text-xs text-slate-500 line-clamp-2 flex-1">{sim.description}</p>
                <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-[9px] text-slate-600">
                    {sim.html_code?.startsWith('__gzip__') ? '🗜️ Nén' : '📄 Thô'} · {formatSize(byteSize(sim.html_code || ''))}
                  </span>
                  {!sim.html_code && (
                    <span className="text-[9px] text-red-500 font-bold">⚠️ Lỗi code</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationAdminBoard;
