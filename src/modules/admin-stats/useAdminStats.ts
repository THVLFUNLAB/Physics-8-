/**
 * useAdminStats.ts
 * ════════════════════════════════════════════════════════════════
 * Custom Hook — Fetch dữ liệu thống kê mỗi lần tab Stats được mở.
 *
 * THIẾT KẾ:
 * - Fetch ngay khi component mount (= mỗi lần thầy click vào Stats)
 * - Không cache, không TTL — luôn lấy số liệu mới nhất
 * - Nút "Làm mới" để re-fetch thủ công trong cùng phiên
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchSystemStats, SystemStats } from './adminStatsService';

export interface UseAdminStatsResult {
  stats: SystemStats | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
  refresh: () => void;
}

export function useAdminStats(): UseAdminStatsResult {
  const [stats, setStats]         = useState<SystemStats | null>(null);
  const [loading, setLoading]     = useState(true);   // true ngay từ đầu → hiện skeleton khi vào tab
  const [error, setError]         = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);  // tăng để trigger re-fetch thủ công

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchSystemStats();
        if (!cancelled) {
          setStats(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('[useAdminStats] Lỗi fetch:', err);
          setError(
            err?.code === 'permission-denied'
              ? 'Không có quyền đọc dữ liệu. Kiểm tra Firestore Rules.'
              : `Lỗi tải dữ liệu: ${err?.message || 'Không xác định'}`
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [refreshTick]); // re-run khi mount lần đầu hoặc khi refresh() được gọi

  const refresh = useCallback(() => {
    setStats(null);
    setRefreshTick(t => t + 1);
  }, []);

  const lastFetched = stats?.fetchedAt ? new Date(stats.fetchedAt) : null;

  return { stats, loading, error, lastFetched, refresh };
}
