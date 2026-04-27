/**
 * useSubmitWithRetry — R4: 4-Layer Offline Defense, Layer 3
 * ──────────────────────────────────────────────────────────
 * Submit bài thi với exponential backoff retry (tối đa 5 lần).
 * Điểm được tính và lưu localStorage TRƯỚC khi gửi lên Firestore.
 * Nếu thất bại sau 5 lần: hiện điểm locally + hướng dẫn báo thầy.
 *
 * QUAN TRỌNG: Hook này KHÔNG thay thế handleSubmit() hoàn toàn.
 * Nó bọc lại phần "ghi Firestore" với retry logic — score calculation
 * vẫn nằm trong LiveClassExam.tsx như cũ (không động vào business logic).
 */

import { useCallback, useRef } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from '../components/Toast';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SubmitPayload {
  attemptId: string;
  answers: Record<string, any>;
  score: number;
  totalAnswered: number;
}

export interface UseSubmitWithRetryReturn {
  /** Gọi hàm này thay vì updateDoc trực tiếp trong handleSubmit. */
  submitWithRetry: (payload: SubmitPayload) => Promise<'success' | 'local_fallback'>;
  /** true nếu đang trong quá trình retry. */
  isRetrying: boolean;
  /** Số lần đã retry (hiển thị trong UI nếu cần). */
  retryCount: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_RETRY = 5;
const BASE_DELAY_MS = 1000;
const FINAL_SAVE_KEY_PREFIX = 'phy8_final_';

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useSubmitWithRetry(): UseSubmitWithRetryReturn {
  const isRetryingRef = useRef(false);
  const retryCountRef = useRef(0);

  // Dùng ref thay vì state để tránh re-render trong khi đang retry
  const [isRetrying, setIsRetrying] = [false, (_: boolean) => {}];
  const [retryCount, setRetryCount] = [0, (_: number) => {}];

  const submitWithRetry = useCallback(async (
    payload: SubmitPayload
  ): Promise<'success' | 'local_fallback'> => {
    const { attemptId, answers, score, totalAnswered } = payload;
    const finalKey = `${FINAL_SAVE_KEY_PREFIX}${attemptId}`;

    // ── [COST FIX] Idempotency Guard: đã commit thành công → không retry ──
    try {
      const existing = localStorage.getItem(finalKey);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed.synced === true) {
          console.info('[SubmitRetry] Idempotency hit: bài đã commit, skip retry loop.');
          return 'success';
        }
      }
    } catch { /* localStorage không khả dụng — tiếp tục bình thường */ }

    // ── Layer A: Lưu điểm vào localStorage NGAY LẬP TỨC (đồng bộ) ──
    try {
      localStorage.setItem(finalKey, JSON.stringify({
        score,
        answers,
        totalAnswered,
        submittedAt: Date.now(),
        attemptId,
        synced: false,
      }));
    } catch {
      // LocalStorage đầy — tiếp tục sync online bình thường
      console.warn('[SubmitRetry] Không thể lưu local backup');
    }

    isRetryingRef.current = true;
    retryCountRef.current = 0;

    // ── Layer B: Retry loop với exponential backoff ──
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      retryCountRef.current = attempt;

      if (attempt > 0) {
        // Delay: 1s, 2s, 4s, 8s, 16s (capped at 16s)
        const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 16000);
        await new Promise(r => setTimeout(r, delayMs));
      }

      try {
        const timeoutMs = 8000;
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Firebase offline/timeout')), timeoutMs)
        );

        await Promise.race([
          updateDoc(doc(db, 'classAttempts', attemptId), {
            answers,
            score,
            totalAnswered,
            status: 'submitted',
            submittedAt: Timestamp.now(),
          }),
          timeoutPromise
        ]);

        // ── Thành công: dọn sạch local backup ──
        try {
          const saved = localStorage.getItem(finalKey);
          if (saved) {
            const parsed = JSON.parse(saved);
            parsed.synced = true;
            localStorage.setItem(finalKey, JSON.stringify(parsed));
            // Xóa hẳn sau 30 giây (đủ để hiển thị kết quả)
            setTimeout(() => {
              try { localStorage.removeItem(finalKey); } catch {}
            }, 30000);
          }
        } catch {}

        isRetryingRef.current = false;
        return 'success';

      } catch (e) {
        console.warn(`[SubmitRetry] Lần ${attempt + 1}/${MAX_RETRY} thất bại:`, e);

        if (attempt === 1) {
          // Thông báo nhẹ nhàng từ lần retry thứ 2
          toast.info('⚡ Đang kết nối lại máy chủ...');
        }
      }
    }

    // ── Tất cả retry thất bại: Fallback graceful ──
    isRetryingRef.current = false;
    toast.error(
      '⚠️ Không thể đồng bộ điểm với máy chủ. ' +
      'Điểm của em đã lưu tạm trên thiết bị. ' +
      'Vui lòng báo thầy/cô để cộng điểm thủ công.'
    );
    return 'local_fallback';
  }, []);

  return {
    submitWithRetry,
    isRetrying: isRetryingRef.current,
    retryCount: retryCountRef.current,
  };
}

// ─── Recovery Utility (dùng khi handleJoin - Layer 4) ──────────────────────

/**
 * Kiểm tra xem có điểm nộp bài chưa sync không.
 * Gọi trong handleJoin() khi học sinh quay lại sau khi mất mạng.
 */
export function getUnsyncedSubmission(attemptId: string): {
  score: number;
  answers: Record<string, any>;
  submittedAt: number;
} | null {
  try {
    const key = `${FINAL_SAVE_KEY_PREFIX}${attemptId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.synced) return null; // Đã sync rồi, bỏ qua
    return {
      score: parsed.score,
      answers: parsed.answers,
      submittedAt: parsed.submittedAt,
    };
  } catch {
    return null;
  }
}
