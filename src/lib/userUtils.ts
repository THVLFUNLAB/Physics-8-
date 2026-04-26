import type { UserProfile } from '../types';

/**
 * Chuẩn duy nhất kiểm tra học sinh có phải VIP không.
 * Thay thế mọi pattern `user.tier === 'vip' || user.isUnlimited` trong codebase.
 * Giữ kiểm tra isUnlimited để tương thích ngược với dữ liệu cũ trong DB.
 */
export const isVipUser = (
  user: Pick<UserProfile, 'tier' | 'isUnlimited'> | null | undefined
): boolean => {
  if (!user) return false;
  return user.tier === 'vip' || user.isUnlimited === true;
};
