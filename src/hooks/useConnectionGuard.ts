/**
 * useConnectionGuard — R4: 4-Layer Offline Defense, Layer 2
 * ──────────────────────────────────────────────────────────
 * Theo dõi trạng thái kết nối mạng và cung cấp UI indicator.
 * Dùng navigator.onLine + window events 'online'/'offline'.
 *
 * Triết lý UX: "Không gây hoảng loạn cho học sinh"
 *  - Khi offline: chỉ hiện badge nhỏ ở góc màn hình, KHÔNG toast error.
 *  - Khi online trở lại: tự ẩn sau 3 giây.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ConnectionState {
  isOnline: boolean;
  /** Số giây đã offline (0 nếu đang online). Dùng để hiện thời gian. */
  offlineDurationSec: number;
  /** true nếu vừa reconnect (trong vòng 3 giây). Dùng để hiện "✓ Đã kết nối lại". */
  justReconnected: boolean;
}

export interface UseConnectionGuardReturn {
  connectionState: ConnectionState;
  /** Callback để trigger khi mất mạng (ví dụ: lưu vault ngay lập tức). */
  onOfflineCallback: React.MutableRefObject<(() => void) | null>;
  /** Callback khi có mạng trở lại (ví dụ: flush pending writes). */
  onOnlineCallback: React.MutableRefObject<(() => void) | null>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useConnectionGuard(): UseConnectionGuardReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [offlineDurationSec, setOfflineDurationSec] = useState(0);
  const [justReconnected, setJustReconnected] = useState(false);

  // Ref callbacks — caller có thể thay thế bất kỳ lúc nào
  const onOfflineCallback = useRef<(() => void) | null>(null);
  const onOnlineCallback  = useRef<(() => void) | null>(null);
  const reconnectedTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationInterval  = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setOfflineSince(Date.now());
    setJustReconnected(false);
    onOfflineCallback.current?.();
  }, []);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setOfflineSince(null);
    setOfflineDurationSec(0);
    setJustReconnected(true);
    onOnlineCallback.current?.();

    // Ẩn "Đã kết nối lại" sau 3 giây
    if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
    reconnectedTimer.current = setTimeout(() => setJustReconnected(false), 3000);
  }, []);

  // Đồng hồ đếm thời gian offline
  useEffect(() => {
    if (!isOnline && offlineSince !== null) {
      durationInterval.current = setInterval(() => {
        setOfflineDurationSec(Math.floor((Date.now() - offlineSince) / 1000));
      }, 1000);
    } else {
      if (durationInterval.current) clearInterval(durationInterval.current);
    }
    return () => {
      if (durationInterval.current) clearInterval(durationInterval.current);
    };
  }, [isOnline, offlineSince]);

  // Event listeners
  useEffect(() => {
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectedTimer.current) clearTimeout(reconnectedTimer.current);
      if (durationInterval.current) clearInterval(durationInterval.current);
    };
  }, [handleOnline, handleOffline]);

  return {
    connectionState: { isOnline, offlineDurationSec, justReconnected },
    onOfflineCallback,
    onOnlineCallback,
  };
}
