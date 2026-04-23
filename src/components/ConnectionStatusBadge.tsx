/**
 * ConnectionStatusBadge — R4: 4-Layer Offline Defense, Layer 2 (UI)
 * ──────────────────────────────────────────────────────────────────
 * Badge hiển thị trạng thái mạng. Chỉ visible khi offline hoặc vừa reconnect.
 * Triết lý: không gây hoảng loạn, không chặn UX.
 *
 * Usage:
 *   <ConnectionStatusBadge connectionState={connectionState} />
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ConnectionState } from '../hooks/useConnectionGuard';

interface ConnectionStatusBadgeProps {
  connectionState: ConnectionState;
}

export const ConnectionStatusBadge: React.FC<ConnectionStatusBadgeProps> = ({
  connectionState,
}) => {
  const { isOnline, offlineDurationSec, justReconnected } = connectionState;
  const isVisible = !isOnline || justReconnected;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed top-[70px] left-1/2 -translate-x-1/2 z-[9999] md:top-4 md:right-4 md:left-auto md:translate-x-0"
          aria-live="polite"
          aria-label={isOnline ? 'Đã kết nối lại' : 'Mất kết nối mạng'}
        >
          {!isOnline ? (
            /* ── Offline Badge ── */
            <div className="flex items-center gap-2 px-4 py-2 rounded-full
                            bg-amber-600/95 text-white text-xs font-bold
                            shadow-lg backdrop-blur-md border border-amber-500/50">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
              <span>
                Mất kết nối — Bài đang lưu tạm
                {offlineDurationSec > 5 && (
                  <span className="ml-1 opacity-80">({offlineDurationSec}s)</span>
                )}
              </span>
            </div>
          ) : justReconnected ? (
            /* ── Reconnected Badge ── */
            <div className="flex items-center gap-2 px-4 py-2 rounded-full
                            bg-green-600/95 text-white text-xs font-bold
                            shadow-lg backdrop-blur-md border border-green-500/50">
              <span className="text-base">✓</span>
              <span>Đã kết nối lại</span>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConnectionStatusBadge;
