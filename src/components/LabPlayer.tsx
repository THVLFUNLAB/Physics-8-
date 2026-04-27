/**
 * LabPlayer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Component chuyên biệt để chạy các mô phỏng trong môi trường sandbox an toàn.
 *
 * Hỗ trợ 2 nguồn:
 *  • `srcDoc`  — HTML string từ Firestore (local simulation, render bằng srcDoc)
 *  • `src`     — URL ngoài (javalab.org, PhET, v.v., render bằng src)
 *
 * Bảo mật: sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

// ── Props ─────────────────────────────────────────────────────────────────────
interface LabPlayerProps {
  /** Tiêu đề hiển thị trong <iframe title> (accessibility) */
  title: string;
  /**
   * Nguồn nội dung:
   *  - Nếu là URL (http/https) → dùng làm `src`
   *  - Nếu là HTML string      → dùng làm `srcDoc`
   */
  source: string;
  /** className bổ sung cho wrapper container */
  className?: string;
  /** Callback khi iframe load xong thành công */
  onLoad?: () => void;
  /** Callback khi iframe gặp lỗi */
  onError?: () => void;
}

// ── Helper: phân loại source ──────────────────────────────────────────────────
function isExternalUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://') || source.startsWith('//');
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
const LoadingSkeleton: React.FC = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 gap-5 z-10">
    {/* Animated beaker icon */}
    <div className="relative">
      <div className="w-20 h-20 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
      <motion.div
        className="absolute inset-0 rounded-full bg-blue-500/5"
        animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
    <div className="text-center space-y-1">
      <p className="text-white font-bold text-sm">Đang khởi tải mô phỏng...</p>
      <p className="text-slate-500 text-xs">Môi trường sandbox đang được khởi tạo</p>
    </div>
    {/* Skeleton bars */}
    <div className="w-48 space-y-2">
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-blue-600/60 rounded-full"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: '50%' }}
        />
      </div>
    </div>
  </div>
);

// ── Error State ───────────────────────────────────────────────────────────────
const ErrorState: React.FC<{ source: string; onRetry: () => void }> = ({ source, onRetry }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 gap-6 p-8 text-center z-10">
    <div className="w-16 h-16 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center">
      <AlertTriangle className="w-8 h-8 text-red-400" />
    </div>
    <div>
      <p className="text-white font-bold text-base mb-1">Không thể tải mô phỏng</p>
      <p className="text-slate-400 text-sm max-w-xs">
        Nguồn nội dung bị chặn hoặc không hợp lệ. Hãy thử mở trong tab mới.
      </p>
    </div>
    <div className="flex items-center gap-3">
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-white font-semibold transition-all"
      >
        <RefreshCw className="w-4 h-4" /> Thử lại
      </button>
      {isExternalUrl(source) && (
        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm text-white font-semibold transition-all"
        >
          <ExternalLink className="w-4 h-4" /> Mở tab mới
        </a>
      )}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
export const LabPlayer: React.FC<LabPlayerProps> = ({
  title,
  source,
  className = '',
  onLoad,
  onError,
}) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const handleLoad = useCallback(() => {
    setStatus('loaded');
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setStatus('error');
    onError?.();
  }, [onError]);

  const handleRetry = useCallback(() => {
    setStatus('loading');
    setRetryKey(k => k + 1);
  }, []);

  const external = isExternalUrl(source);

  return (
    <div className={`relative w-full h-full bg-slate-950 overflow-hidden ${className}`}
      style={{ minHeight: 200 }}>
      {/* ── Loading overlay ── */}
      <AnimatePresence>
        {status === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-10"
          >
            <LoadingSkeleton />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error overlay ── */}
      <AnimatePresence>
        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-10"
          >
            <ErrorState source={source} onRetry={handleRetry} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Iframe Sandbox ── */}
      {status !== 'error' && (
        <iframe
          key={retryKey}
          title={title}
          // External URL → src; HTML string → srcDoc
          {...(external ? { src: source } : { srcDoc: source })}
          // ── SECURITY: Sandbox cô lập hoàn toàn JS khỏi React DOM ──
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="absolute inset-0 w-full h-full"
          style={{
            border: 'none',
            display: 'block',
            // Chỉ hiện iframe sau khi đã load xong để tránh flash trắng
            opacity: status === 'loaded' ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* ── External link badge (UX hint) ── */}
      {external && status === 'loaded' && (
        <motion.a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-xl text-[10px] text-slate-400 hover:text-white font-semibold transition-colors shadow-lg"
        >
          <ExternalLink className="w-3 h-3" />
          Mở toàn màn hình
        </motion.a>
      )}
    </div>
  );
};

export default LabPlayer;
