import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FlaskConical, X, ExternalLink, Maximize2 } from 'lucide-react';

export const SimulationModal = ({
  isOpen, onClose, title, description, simulationUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  simulationUrl: string;
}) => {
  const [iframeError, setIframeError] = useState(false);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
          {/* ── Backdrop ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
          />

          {/* ── Modal ── */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="relative w-full sm:max-w-5xl bg-slate-900 border border-slate-800 sm:rounded-[2rem] rounded-t-[2rem] overflow-hidden shadow-2xl flex flex-col"
            style={{
              // Mobile: full screen minus status bar; Desktop: max 90vh
              maxHeight: 'min(100dvh, 92vh)',
              height: 'min(100dvh, 92vh)',
            }}
          >
            {/* ── Header ── */}
            <div className="flex-shrink-0 px-4 sm:px-8 py-3 sm:py-5 border-b border-slate-800 flex items-center gap-3 bg-slate-900/80 backdrop-blur-md">
              <div className="w-9 h-9 sm:w-11 sm:h-11 bg-red-600/10 rounded-xl flex items-center justify-center text-red-500 flex-shrink-0">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-lg font-black text-white uppercase tracking-tight truncate">{title}</h3>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium truncate hidden sm:block">{description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Mở tab mới — fallback cho thiết bị chặn iframe */}
                <a
                  href={simulationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all flex items-center gap-1.5 text-xs font-bold"
                  title="Mở trong tab mới"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">Mở rộng</span>
                </a>
                <button
                  onClick={onClose}
                  className="p-2 sm:p-2.5 bg-slate-800 hover:bg-red-600/20 rounded-xl text-slate-400 hover:text-red-400 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── iFrame Area ── */}
            <div className="flex-1 bg-slate-950 relative overflow-hidden">
              {!iframeError ? (
                <iframe
                  src={simulationUrl}
                  className="absolute inset-0 w-full h-full border-none"
                  title={title}
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-top-navigation"
                  onError={() => setIframeError(true)}
                />
              ) : (
                /* ── Fallback khi iframe bị chặn ── */
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center">
                  <Maximize2 className="w-16 h-16 text-slate-600" />
                  <div>
                    <p className="text-white font-bold text-lg mb-2">Mô phỏng không thể tải trong cửa sổ này</p>
                    <p className="text-slate-400 text-sm">Nhấn nút bên dưới để xem trong tab mới.</p>
                  </div>
                  <a
                    href={simulationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-xl flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Mở mô phỏng
                  </a>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-slate-900 border-t border-slate-800 flex justify-between items-center gap-4">
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase tracking-widest hidden sm:block">
                Nguồn: PhET Interactive Simulations | University of Colorado Boulder
              </p>
              <div className="flex gap-3 ml-auto">
                <a
                  href={simulationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Toàn màn hình
                </a>
                <button
                  onClick={onClose}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-red-600/20"
                >
                  Đóng
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SimulationModal;
