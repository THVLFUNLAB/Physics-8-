/**
 * ═══════════════════════════════════════════════════════════════
 *  HỆ THỐNG RANK E-SPORTS — CHINH PHỤC 8.0+ VẬT LÝ
 *  13 Cấp độ Rank — Cập nhật v2.0 (Phương Án D)
 *
 *  Thay đổi v2.0:
 *  - Thêm 3 hạng mới: Chinh Phục, Huyền Thoại, Siêu Việt
 *  - Chia nhỏ khoảng cách 50K (Quán Quân → Bất Tử) thành milestone 20K
 *  - Siêu Việt = Prestige tier dành cho người đạt đỉnh cao tuyệt đối
 * ═══════════════════════════════════════════════════════════════
 */

// ── Rank Definition ──────────────────────────────────────────

export interface RankDef {
  id: number;
  name: string;
  minStars: number;
  color: string;          // Tailwind text color class
  bgColor: string;        // Tailwind bg/gradient class
  borderColor: string;    // Border accent
  icon: string;           // Emoji icon
  description: string;    // Mô tả rank
  isPrestige?: boolean;   // Hạng Prestige đặc biệt
}

export const RANKS: RankDef[] = [
  {
    id: 1,
    name: 'Đồng Đoàn',
    minStars: 0,
    color: 'text-amber-700',
    bgColor: 'from-amber-900/30 to-amber-800/10',
    borderColor: 'border-amber-700/40',
    icon: '🥉',
    description: 'Khởi đầu hành trình Vật Lý',
  },
  {
    id: 2,
    name: 'Bạc Đoàn',
    minStars: 2500,
    color: 'text-slate-300',
    bgColor: 'from-slate-500/20 to-slate-600/10',
    borderColor: 'border-slate-400/40',
    icon: '🥈',
    description: 'Đã nắm được nền tảng',
  },
  {
    id: 3,
    name: 'Vàng Đoàn',
    minStars: 7500,
    color: 'text-yellow-400',
    bgColor: 'from-yellow-600/20 to-yellow-700/10',
    borderColor: 'border-yellow-500/40',
    icon: '🥇',
    description: 'Chiến binh Vật Lý thực thụ',
  },
  {
    id: 4,
    name: 'Bạch Kim',
    minStars: 15000,
    color: 'text-cyan-300',
    bgColor: 'from-cyan-600/20 to-cyan-700/10',
    borderColor: 'border-cyan-400/40',
    icon: '💎',
    description: 'Kỹ năng vượt trội',
  },
  {
    id: 5,
    name: 'Kim Cương',
    minStars: 25000,
    color: 'text-blue-300',
    bgColor: 'from-blue-500/20 to-blue-600/10',
    borderColor: 'border-blue-400/40',
    icon: '💠',
    description: 'Đẳng cấp Kim Cương',
  },
  {
    id: 6,
    name: 'Tinh Anh',
    minStars: 40000,
    color: 'text-purple-400',
    bgColor: 'from-purple-600/20 to-purple-700/10',
    borderColor: 'border-purple-400/40',
    icon: '🔮',
    description: 'Tinh hoa Vật Lý',
  },
  {
    id: 7,
    name: 'Cao Thủ',
    minStars: 60000,
    color: 'text-rose-400',
    bgColor: 'from-rose-600/20 to-rose-700/10',
    borderColor: 'border-rose-400/40',
    icon: '⚔️',
    description: 'Bậc thầy giải đề',
  },
  {
    id: 8,
    name: 'Thách Đấu',
    minStars: 90000,
    color: 'text-red-400',
    bgColor: 'from-red-600/20 to-red-700/10',
    borderColor: 'border-red-500/40',
    icon: '🏆',
    description: 'Nắm trùm — Top 10% toàn hệ thống',
  },
  {
    id: 9,
    name: 'Quán Quân',
    minStars: 125000,
    color: 'text-amber-300',
    bgColor: 'from-amber-500/20 to-amber-400/10',
    borderColor: 'border-amber-400/40',
    icon: '👑',
    description: 'Vô địch Vật Lý — Top 5%',
  },
  // ── v2.0: 3 hạng mới chia nhỏ khoảng cách 50K ──────────────
  {
    id: 10,
    name: 'Chinh Phục',
    minStars: 145000,
    color: 'text-sky-300',
    bgColor: 'from-sky-500/20 to-cyan-400/10',
    borderColor: 'border-sky-400/50',
    icon: '🚀',
    description: 'Vươn tới đỉnh cao — Top 3%',
  },
  {
    id: 11,
    name: 'Huyền Thoại',
    minStars: 162000,
    color: 'text-violet-300',
    bgColor: 'from-violet-600/20 to-purple-400/10',
    borderColor: 'border-violet-400/50',
    icon: '🌙',
    description: 'Huyền thoại sống — Top 1%',
  },
  {
    id: 12,
    name: 'Bất Tử',
    minStars: 175000,
    color: 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-400 to-purple-500',
    bgColor: 'from-amber-500/20 via-rose-500/20 to-purple-500/20',
    borderColor: 'border-amber-400/60',
    icon: '🌟',
    description: 'Huyền thoại bất diệt — Đỉnh cao Vật Lý',
  },
  {
    id: 13,
    name: 'Siêu Việt',
    minStars: 220000,
    color: 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-violet-400 via-rose-300 to-amber-300',
    bgColor: 'from-cyan-500/20 via-violet-500/20 to-amber-500/20',
    borderColor: 'border-violet-300/70',
    icon: '✨',
    description: 'Prestige — Vượt giới hạn con người',
    isPrestige: true,
  },
];

// ── Utility Functions ────────────────────────────────────────

/**
 * Lấy Rank hiện tại từ tổng sao
 */
export function getCurrentRank(stars: number): RankDef {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (stars >= r.minStars) rank = r;
    else break;
  }
  return rank;
}

/**
 * Lấy Rank tiếp theo (null nếu đã max)
 */
export function getNextRank(stars: number): RankDef | null {
  const current = getCurrentRank(stars);
  const idx = RANKS.findIndex(r => r.id === current.id);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

/**
 * Tính % tiến độ thăng cấp
 * Trả về: { percent, starsNeeded, starsInCurrentTier }
 */
export function getRankProgress(stars: number): {
  percent: number;
  starsNeeded: number;
  starsInCurrentTier: number;
  totalStarsInTier: number;
} {
  const current = getCurrentRank(stars);
  const next = getNextRank(stars);

  if (!next) {
    // Đã max rank
    return { percent: 100, starsNeeded: 0, starsInCurrentTier: 0, totalStarsInTier: 0 };
  }

  const tierSize = next.minStars - current.minStars;
  const starsInTier = stars - current.minStars;
  const percent = Math.min(100, Math.round((starsInTier / tierSize) * 100));
  const starsNeeded = next.minStars - stars;

  return { percent, starsNeeded, starsInCurrentTier: starsInTier, totalStarsInTier: tierSize };
}

// ── Star Earning Actions ─────────────────────────────────────

export type StarAction =
  | 'complete_test'       // Hoàn thành 1 bài test
  | 'high_score'          // Đạt >= 8.0 điểm
  | 'perfect_score'       // Đạt 10/10 điểm
  | 'daily_streak_3'      // Streak 3 ngày
  | 'daily_streak_7'      // Streak 7 ngày
  | 'daily_streak_14'     // Streak 14 ngày
  | 'daily_streak_30'     // Streak 30 ngày
  | 'master_topic'        // Master 1 chủ đề (bestScore >= 8.0)
  | 'first_login'         // Đăng nhập lần đầu
  | 'daily_login';        // Đăng nhập mỗi ngày

const STAR_REWARDS: Record<StarAction, { stars: number; label: string }> = {
  complete_test:    { stars: 100,  label: 'Hoàn thành bài test' },
  high_score:       { stars: 150,  label: 'Đạt điểm cao (≥8.0)' },
  perfect_score:    { stars: 500, label: 'Đạt điểm tuyệt đối!' },
  daily_streak_3:   { stars: 250,  label: 'Streak 3 ngày 🔥' },
  daily_streak_7:   { stars: 500, label: 'Streak 7 ngày 🔥🔥' },
  daily_streak_14:  { stars: 1000, label: 'Streak 14 ngày 🔥🔥🔥' },
  daily_streak_30:  { stars: 2500, label: 'Streak 30 ngày 🔥👑' },
  master_topic:     { stars: 750, label: 'Master chủ đề mới!' },
  first_login:      { stars: 250,  label: 'Chào mừng tân binh!' },
  daily_login:      { stars: 50,  label: 'Đăng nhập hàng ngày' },
};

/**
 * Tính số sao thưởng cho một hành động
 */
export function getStarReward(action: StarAction): { stars: number; label: string } {
  return STAR_REWARDS[action];
}

/**
 * Tính sao sau khi hoàn thành 1 bài test
 * @param score Điểm test (thang 10)
 * @param streak Streak hiện tại
 * @returns Danh sách các phần thưởng
 */
export function calculateTestRewards(score: number, streak: number): { action: StarAction; stars: number; label: string }[] {
  const rewards: { action: StarAction; stars: number; label: string }[] = [];

  // Hoàn thành bài test
  rewards.push({ action: 'complete_test', ...STAR_REWARDS.complete_test });

  // Điểm cao
  if (score >= 10.0) {
    rewards.push({ action: 'perfect_score', ...STAR_REWARDS.perfect_score });
  } else if (score >= 8.0) {
    rewards.push({ action: 'high_score', ...STAR_REWARDS.high_score });
  }

  // Streak bonuses (chỉ thưởng milestone cao nhất)
  if (streak >= 30) {
    rewards.push({ action: 'daily_streak_30', ...STAR_REWARDS.daily_streak_30 });
  } else if (streak >= 14) {
    rewards.push({ action: 'daily_streak_14', ...STAR_REWARDS.daily_streak_14 });
  } else if (streak >= 7) {
    rewards.push({ action: 'daily_streak_7', ...STAR_REWARDS.daily_streak_7 });
  } else if (streak >= 3) {
    rewards.push({ action: 'daily_streak_3', ...STAR_REWARDS.daily_streak_3 });
  }

  return rewards;
}
