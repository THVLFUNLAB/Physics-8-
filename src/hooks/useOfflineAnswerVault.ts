/**
 * useOfflineAnswerVault — R4: 4-Layer Offline Defense, Layer 1
 * ─────────────────────────────────────────────────────────────
 * Lưu đáp án học sinh vào localStorage sau MỖI lần trả lời.
 * Đảm bảo bài làm không bao giờ mất dù WiFi ngắt, F5, hay trình duyệt crash.
 *
 * INVARIANTS (bảo đảm không vi phạm):
 *  - Không bao giờ throw — mọi lỗi localStorage đều được xử lý im lặng.
 *  - Vault tự hủy sau 6 giờ (quá 1 buổi học) để không chiếm localStorage vĩnh viễn.
 *  - Key bao gồm attemptId → mỗi phiên thi có vault riêng biệt.
 */

import { useCallback, useEffect } from 'react';

// ─── Constants ─────────────────────────────────────────────────────────────

const VAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 giờ
const VAULT_VERSION = 1;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnswerVaultPayload {
  answers: Record<string, any>;
  savedAt: number;       // Date.now() — dùng để TTL check
  attemptId: string;
  version: number;
}

export interface UseOfflineAnswerVaultReturn {
  /** Lưu toàn bộ answers object vào vault. Gọi sau mỗi handleAnswer(). */
  saveToVault: (answers: Record<string, any>) => void;
  /** Đọc answers từ vault. Trả về null nếu không có hoặc đã hết hạn. */
  loadFromVault: () => Record<string, any> | null;
  /** Xóa vault sau khi submit thành công. */
  clearVault: () => void;
  /** Kiểm tra vault có dữ liệu hợp lệ không (để hiện thông báo "Khôi phục"). */
  hasValidVault: () => boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useOfflineAnswerVault(attemptId: string | null): UseOfflineAnswerVaultReturn {
  const vaultKey = attemptId ? `phy8_vault_${attemptId}` : null;

  // Tự dọn vault cũ khi hook mount (housekeeping)
  useEffect(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith('phy8_vault_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed: AnswerVaultPayload = JSON.parse(raw);
        if (Date.now() - parsed.savedAt > VAULT_TTL_MS) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {
      // Housekeeping không được fail
    }
  }, []); // Chạy 1 lần khi component mount

  const saveToVault = useCallback((answers: Record<string, any>) => {
    if (!vaultKey) return;
    try {
      const payload: AnswerVaultPayload = {
        answers,
        savedAt: Date.now(),
        attemptId: attemptId!,
        version: VAULT_VERSION,
      };
      localStorage.setItem(vaultKey, JSON.stringify(payload));
    } catch (e) {
      // localStorage đầy hoặc private mode — im lặng, không block học sinh
      console.warn('[OfflineVault] Không thể lưu vault:', e);
    }
  }, [vaultKey, attemptId]);

  const loadFromVault = useCallback((): Record<string, any> | null => {
    if (!vaultKey) return null;
    try {
      const raw = localStorage.getItem(vaultKey);
      if (!raw) return null;

      const parsed: AnswerVaultPayload = JSON.parse(raw);

      // Version check
      if (parsed.version !== VAULT_VERSION) return null;

      // TTL check
      if (Date.now() - parsed.savedAt > VAULT_TTL_MS) {
        localStorage.removeItem(vaultKey);
        return null;
      }

      // Sanity check
      if (!parsed.answers || typeof parsed.answers !== 'object') return null;

      return parsed.answers;
    } catch {
      return null;
    }
  }, [vaultKey]);

  const clearVault = useCallback(() => {
    if (!vaultKey) return;
    try {
      localStorage.removeItem(vaultKey);
    } catch {
      // Không block nếu clear thất bại
    }
  }, [vaultKey]);

  const hasValidVault = useCallback((): boolean => {
    const answers = loadFromVault();
    return answers !== null && Object.keys(answers).length > 0;
  }, [loadFromVault]);

  return { saveToVault, loadFromVault, clearVault, hasValidVault };
}
