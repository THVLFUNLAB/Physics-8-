// ═══════════════════════════════════════════════════════════════════════
//  ExamResultGamification.tsx — Gamification Tức thời (0đ API Cost)
//  Component hiển thị Meme + Quote động viên ngay sau khi nộp bài.
//  Chi phí: KHÔNG — 100% Client-side rendering.
// ═══════════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { motion } from 'motion/react';

// ═══════════════════════════════════════════════════════════════════════
//  🎨 CONFIG: ĐƯỜNG DẪN ẢNH MEME CHO TỪNG TIER
//  ┌──────────────────────────────────────────────────────────────┐
//  │  Thầy Hậu: Thay đổi đường dẫn ở đây khi có ảnh thật.       │
//  │  Ví dụ: TIER_S.image = '/assets/memes/tier-s-real.jpg'     │
//  │  Hiện tại đang dùng SVG placeholder tự render.              │
//  └──────────────────────────────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════════════
const MEME_CONFIG = {
  TIER_S: {
    image: '/assets/memes/tier-s.png', // 🏆 8.5 - 10 điểm
    fallbackEmoji: '🏆',
    label: 'HẠNG S — LEGENDARY',
  },
  TIER_A: {
    image: '/assets/memes/tier-a.png', // 💪 7.0 - 8.25 điểm
    fallbackEmoji: '💪',
    label: 'HẠNG A — EXCELLENT',
  },
  TIER_B: {
    image: '/assets/memes/tier-b.png', // 📚 5.0 - 6.75 điểm
    fallbackEmoji: '📚',
    label: 'HẠNG B — KEEP GOING',
  },
  TIER_C: {
    image: '/assets/memes/tier-c.png', // 🚨 < 5.0 điểm
    fallbackEmoji: '🚨',
    label: 'HẠNG C — DANGER ZONE',
  },
};

// ═══════════════════════════════════════════════════════════════════════
//  💬 QUOTES ĐỘNG VIÊN — Hard-coded, không tốn token
// ═══════════════════════════════════════════════════════════════════════
const QUOTES = {
  TIER_S: [
    'Tố chất thủ khoa! Các trường ĐH Top đang chờ con rồi! 🔥',
    'Đây là level mà AI cũng phải ghen tỵ. Cực kỳ ấn tượng!',
    'Con đã vượt qua 95% thí sinh cả nước ở mức điểm này. Đáng tự hào!',
    'Xuất sắc! Kiến thức đã ngấm vào máu rồi. Giữ phong độ này!',
  ],
  TIER_A: [
    'Khá lắm chiến binh! Chỉ cần thêm một chút nữa là chạm đỉnh!',
    'Điểm số cho thấy con đã rất nỗ lực. Thầy tin vào bước đột phá tiếp theo!',
    'Nền tảng vững rồi! Giờ tập trung vào các bài Vận dụng cao để bứt phá.',
    'Tuyệt vời! Con chỉ cách HẠNG S khoảng 1-2 câu. Cố lên!',
  ],
  TIER_B: [
    'Con chưa fail — con đang LEARN! Mỗi sai lầm đều là phí đầu tư cho tương lai.',
    'Nhiều bạn bắt đầu từ 5 điểm rồi lên 8+. Con hoàn toàn có thể!',
    'Đây là điểm xuất phát tốt. Hãy tập trung ôn lại Phần I và II nhé!',
    'Thầy thấy tiềm năng! Luyện thêm 3-5 đề nữa sẽ khác hẳn.',
  ],
  TIER_C: [
    'ĐỪNG BỎ CUỘC! Kỳ thi THPT QG còn đó. Bắt đầu lại từ lý thuyết cơ bản ngay!',
    'Điểm thấp lần này = Biết chính xác điểm yếu. Lần sau sẽ khác!',
    'Thomas Edison thất bại 10.000 lần trước khi thành công. Con mới thất bại 1 lần thôi!',
    'Hãy quay lại làm từng chương một. Thầy sẽ đồng hành cùng con!',
  ],
};

// ═══════════════════════════════════════════════════════════════════════
//  🎨 TIER THEMES
// ═══════════════════════════════════════════════════════════════════════
interface TierTheme {
  tier: 'S' | 'A' | 'B' | 'C';
  colors: { bg: string; border: string; text: string; glow: string; gradient: string };
  config: typeof MEME_CONFIG.TIER_S;
  quotes: string[];
}

function getTierTheme(score: number): TierTheme {
  if (score >= 8.5) return {
    tier: 'S',
    colors: {
      bg: 'from-amber-500/20 via-yellow-500/10 to-slate-900',
      border: 'border-amber-500/50',
      text: 'text-amber-400',
      glow: 'shadow-amber-500/30',
      gradient: 'from-amber-400 to-orange-600',
    },
    config: MEME_CONFIG.TIER_S,
    quotes: QUOTES.TIER_S,
  };
  if (score >= 7.0) return {
    tier: 'A',
    colors: {
      bg: 'from-emerald-500/20 via-green-500/10 to-slate-900',
      border: 'border-emerald-500/50',
      text: 'text-emerald-400',
      glow: 'shadow-emerald-500/30',
      gradient: 'from-emerald-400 to-teal-600',
    },
    config: MEME_CONFIG.TIER_A,
    quotes: QUOTES.TIER_A,
  };
  if (score >= 5.0) return {
    tier: 'B',
    colors: {
      bg: 'from-blue-500/20 via-indigo-500/10 to-slate-900',
      border: 'border-blue-500/50',
      text: 'text-blue-400',
      glow: 'shadow-blue-500/30',
      gradient: 'from-blue-400 to-indigo-600',
    },
    config: MEME_CONFIG.TIER_B,
    quotes: QUOTES.TIER_B,
  };
  return {
    tier: 'C',
    colors: {
      bg: 'from-red-600/20 via-rose-500/10 to-slate-900',
      border: 'border-red-500/50',
      text: 'text-red-400',
      glow: 'shadow-red-500/30',
      gradient: 'from-red-500 to-rose-700',
    },
    config: MEME_CONFIG.TIER_C,
    quotes: QUOTES.TIER_C,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  SVG PLACEHOLDER — Hiển thị khi chưa có ảnh Meme thật
// ═══════════════════════════════════════════════════════════════════════
const MemeVisual: React.FC<{ theme: TierTheme }> = ({ theme }) => {
  const [imgError, setImgError] = React.useState(false);

  if (!imgError) {
    return (
      <img
        src={theme.config.image}
        alt={`Meme ${theme.config.label}`}
        onError={() => setImgError(true)}
        className="w-full h-full object-cover rounded-2xl"
      />
    );
  }

  // ── SVG FALLBACK ──
  const gradients: Record<string, [string, string]> = {
    S: ['#f59e0b', '#ea580c'],
    A: ['#10b981', '#0d9488'],
    B: ['#3b82f6', '#6366f1'],
    C: ['#ef4444', '#e11d48'],
  };
  const [c1, c2] = gradients[theme.tier];

  return (
    <svg viewBox="0 0 200 200" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`tg-${theme.tier}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c2} stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id={`rg-${theme.tier}`} cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor={c1} stopOpacity="0.5" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="200" height="200" rx="24" fill={`url(#tg-${theme.tier})`} />
      <circle cx="100" cy="80" r="45" fill={`url(#rg-${theme.tier})`} />
      <text x="100" y="95" textAnchor="middle" fontSize="48">{theme.config.fallbackEmoji}</text>
      <text x="100" y="155" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" opacity="0.8">
        {theme.config.label}
      </text>
      <text x="100" y="175" textAnchor="middle" fill="white" fontSize="9" opacity="0.5">
        Placeholder — Thay ảnh thật tại memeConfig
      </text>
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
interface ExamResultGamificationProps {
  score: number;
}

export const ExamResultGamification: React.FC<ExamResultGamificationProps> = ({ score }) => {
  const theme = useMemo(() => getTierTheme(score), [score]);
  const quote = useMemo(() => {
    return theme.quotes[Math.floor(Math.random() * theme.quotes.length)];
  }, [theme]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, type: 'spring', damping: 20 }}
      className={`relative bg-gradient-to-b ${theme.colors.bg} ${theme.colors.border} border rounded-3xl p-6 md:p-8 shadow-2xl ${theme.colors.glow} overflow-hidden`}
    >
      {/* ── Glow Effect ── */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 3, repeat: Infinity }}
          className={`absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] rounded-full blur-[80px] bg-gradient-to-r ${theme.colors.gradient}`}
        />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-8">
        {/* ── Meme Visual ── */}
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', damping: 15 }}
          className="w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden shrink-0 border-2 border-white/10 shadow-xl"
        >
          <MemeVisual theme={theme} />
        </motion.div>

        {/* ── Text Content ── */}
        <div className="flex-1 text-center md:text-left">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/60 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${theme.colors.text}`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            {theme.config.label}
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg md:text-xl font-bold text-white leading-relaxed mb-3"
          >
            "{quote}"
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xs text-slate-500 italic"
          >
            — Hệ thống Gamification PHYS-9+ 🎮
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
};

export default ExamResultGamification;
