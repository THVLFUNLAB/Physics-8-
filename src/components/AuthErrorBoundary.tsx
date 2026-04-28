/* ═══════════════════════════════════════════════════════════════════
 *  AUTH ERROR BOUNDARY — Premium offline/error fullscreen overlay
 *  Hiển thị khi: mạng mất, auth lỗi, Firebase quota vượt ngưỡng.
 *  Thay thế hoàn toàn Toast error đơn giản bằng UX đẳng cấp.
 * ═══════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, RefreshCw, ShieldAlert, Wifi, ArrowRight, Zap } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

// ── Animated dot loader ─────────────────────────────────────────────
const PulseDots: React.FC = () => (
  <div className="flex items-center gap-1.5">
    {[0, 1, 2].map(i => (
      <motion.div
        key={i}
        className="w-2 h-2 rounded-full bg-fuchsia-400"
        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
      />
    ))}
  </div>
);

// ── Network status indicator ─────────────────────────────────────────
const NetworkStatusBar: React.FC<{ isOnline: boolean }> = ({ isOnline }) => (
  <motion.div
    layout
    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
      isOnline
        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
        : 'bg-red-500/15 border border-red-500/30 text-red-400'
    }`}
  >
    {isOnline
      ? <><Wifi size={11} /> Đã kết nối lại</>
      : <><WifiOff size={11} /> Mất kết nối</>
    }
  </motion.div>
);

// ── Backdrop animated ring ─────────────────────────────────────────
const PulseRing: React.FC<{ color: string }> = ({ color }) => (
  <>
    {[1, 2, 3].map(i => (
      <motion.div
        key={i}
        className="absolute rounded-full border"
        style={{ borderColor: color, inset: `-${i * 20}px` }}
        animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.2, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4 }}
      />
    ))}
  </>
);

// ── Main overlay component ─────────────────────────────────────────
interface AuthErrorOverlayProps {
  error: string;
  isOffline: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

const AuthErrorOverlay: React.FC<AuthErrorOverlayProps> = ({
  error,
  isOffline,
  onRetry,
  onDismiss,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Đếm ngược tự động retry sau 30s nếu offline
  useEffect(() => {
    if (!isOffline) return;
    setCountdown(30);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOffline]);

  // Auto retry khi countdown hết
  useEffect(() => {
    if (countdown === null && isOffline) {
      handleRetry();
    }
  }, [countdown]);

  // Lắng nghe sự kiện network
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto retry khi mạng quay lại
  useEffect(() => {
    if (isOnline && isOffline) {
      const t = setTimeout(handleRetry, 1500);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  const handleRetry = useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setCountdown(null);
    await new Promise(r => setTimeout(r, 1200));
    onRetry();
    setIsRetrying(false);
  }, [isRetrying, onRetry]);

  const isQuotaError = error.includes('Quota') || error.includes('quá tải');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(20px)' }}
    >
      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(rgba(139,92,246,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(139,92,246,0.5) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      <motion.div
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 22, stiffness: 200 }}
        className="relative w-full max-w-md mx-4"
      >
        {/* Glassmorphic card */}
        <div
          className="relative overflow-hidden rounded-3xl p-8 flex flex-col items-center text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,27,75,0.9))',
            border: '1px solid rgba(139,92,246,0.3)',
            boxShadow: '0 0 60px rgba(139,92,246,0.15), 0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* Top gradient bar */}
          <div
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: isOffline
              ? 'linear-gradient(90deg, #ef4444, #f97316)'
              : 'linear-gradient(90deg, #f59e0b, #eab308)'
            }}
          />

          {/* Icon with pulse rings */}
          <div className="relative mb-6 mt-2">
            <div
              className="relative w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: isOffline
                  ? 'radial-gradient(circle, rgba(239,68,68,0.2), rgba(239,68,68,0.05))'
                  : 'radial-gradient(circle, rgba(245,158,11,0.2), rgba(245,158,11,0.05))',
                border: `1px solid ${isOffline ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
              }}
            >
              <PulseRing color={isOffline ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'} />
              <motion.div
                animate={{ rotate: isRetrying ? 360 : 0 }}
                transition={{ duration: 1, repeat: isRetrying ? Infinity : 0, ease: 'linear' }}
              >
                {isOffline
                  ? <WifiOff size={32} className="text-red-400" />
                  : <ShieldAlert size={32} className="text-amber-400" />
                }
              </motion.div>
            </div>
          </div>

          {/* Network status badge */}
          <div className="mb-4">
            <NetworkStatusBar isOnline={isOnline} />
          </div>

          {/* Title */}
          <h2
            className="text-2xl font-black text-white mb-2 tracking-tight"
            style={{ fontFamily: '"Outfit", sans-serif' }}
          >
            {isOffline ? 'Mất Kết Nối Mạng' : isQuotaError ? 'Server Tạm Quá Tải' : 'Lỗi Xác Thực'}
          </h2>

          {/* Subtitle */}
          <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-sm">
            {isOffline
              ? 'Hệ thống đang hoạt động ở chế độ ngoại tuyến. Bài thi của bạn được lưu cục bộ và sẽ đồng bộ ngay khi có mạng.'
              : isQuotaError
              ? 'Firebase đang chịu tải cao. Dữ liệu được phục vụ từ bộ nhớ đệm. Vui lòng thử lại sau vài giây.'
              : error
            }
          </p>

          {/* Retry section */}
          <div className="w-full space-y-3">
            {isRetrying ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <PulseDots />
                <span className="text-slate-400 text-xs font-medium">Đang kết nối lại...</span>
              </div>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleRetry}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-white text-sm transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #c026d3)',
                    boxShadow: '0 4px 24px rgba(124,58,237,0.4)',
                  }}
                >
                  <RefreshCw size={16} />
                  Thử kết nối lại {countdown !== null ? `(${countdown}s)` : ''}
                </motion.button>

                {countdown !== null && (
                  <div className="w-full bg-slate-800 rounded-full h-1">
                    <motion.div
                      className="h-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      animate={{ width: `${((30 - countdown) / 30) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                )}

                <button
                  onClick={onDismiss}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-slate-500 hover:text-slate-300 text-xs font-semibold transition-colors"
                >
                  Tiếp tục ở chế độ ngoại tuyến <ArrowRight size={12} />
                </button>
              </>
            )}
          </div>

          {/* Bottom tip */}
          <div className="mt-5 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold">
            <Zap size={10} />
            {isOffline
              ? 'Bài làm đang được bảo vệ trong localStorage. Không lo mất dữ liệu!'
              : 'Dữ liệu cục bộ đã được tải sẵn. Bạn vẫn có thể ôn luyện bình thường.'
            }
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Exported hook + wrapper ────────────────────────────────────────
/**
 * Đặt <AuthErrorBoundary /> ngay trong App.tsx (dưới <ToastProvider />).
 * Nó tự lắng nghe authError và isOffline từ useAuthStore và hiện overlay khi cần.
 */
export const AuthErrorBoundary: React.FC = () => {
  const { authError, isOffline, setAuthError } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);
  const authStore = useAuthStore.getState();

  // Reset dismissed state mỗi khi error mới xuất hiện
  useEffect(() => {
    if (authError || isOffline) setDismissed(false);
  }, [authError, isOffline]);

  const shouldShow = !dismissed && (
    (authError !== null) || isOffline
  );

  const handleRetry = useCallback(() => {
    setAuthError(null);
    // Re-trigger auth listener nếu cần
    window.location.reload();
  }, [setAuthError]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setAuthError(null);
  }, [setAuthError]);

  return (
    <AnimatePresence>
      {shouldShow && (
        <AuthErrorOverlay
          error={authError || 'Mất kết nối mạng'}
          isOffline={isOffline}
          onRetry={handleRetry}
          onDismiss={handleDismiss}
        />
      )}
    </AnimatePresence>
  );
};

export default AuthErrorBoundary;
