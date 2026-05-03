/**
 * InteractiveMascot.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * THVL-bot: a "Talking Tom"-style mascot widget for the PHYS-9+ Dashboard.
 *
 * Behavior
 * ────────
 *  • GREETING  – plays once per calendar day on first mount (8 s, then → IDLE)
 *  • IDLE      – mascot floats gently with a y-oscillation loop
 *  • POKED     – clicking the mascot triggers a dizzy animation + cyberpunk
 *                chat bubble showing a random physics quote (3.5 s, then → IDLE)
 *
 * Assets (place in /public/mascot/ as GIFs  OR  reuse existing MP4s)
 * ────────────────────────────────────────────────────────────────────
 *  idle.gif   → /mascot-idle.mp4   (fallback: inline CSS placeholder)
 *  greet.gif  → /mascot-wave.mp4
 *  poked.gif  → /mascot-dizzy.mp4
 *
 * To switch to GIFs just drop them in /public/mascot/ and update ASSET_SRCS.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

type MascotState = 'IDLE' | 'GREETING' | 'POKED';

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'last_greet_date';
const GREETING_DURATION_MS = 8_000;
const POKED_DURATION_MS = 3_500;

/**
 * Map each mascot state to its WebM video source.
 *
 * ✅ BANDWIDTH OPTIMIZATION (2026-05-02):
 * GIF files (~130MB) have been converted to WebM video (~9.7MB total).
 * Tiết kiệm 92.5% bandwidth Vercel — mascot animation giữ nguyên 100%.
 *
 * Conversion: node convert_mascot_gifs.mjs  (ffmpeg-static)
 * WebM  → primary  (Chrome, Firefox, Edge, Android)
 * MP4   → fallback (Safari, iOS)
 */
const WEBM_SRCS: Record<MascotState, string> = {
  IDLE:     '/mascot/idle.webm',
  GREETING: '/mascot/greet.webm',
  POKED:    '/mascot/poked.webm',
};

const MP4_FALLBACKS: Record<MascotState, string> = {
  IDLE:     '/mascot/idle.mp4',
  GREETING: '/mascot/greet.mp4',
  POKED:    '/mascot/poked.mp4',
};

/** Physics easter-egg quotes shown on poke (Vietnamese) */
const PHYSICS_QUOTES: readonly string[] = [
  'Ái chà! Lực tương tác của em làm sai lệch quỹ đạo của thầy rồi!',
  'Đừng để điểm số rơi tự do! Tập trung luyện đề ngay nào.',
  'Năng lượng không tự sinh ra, nó chỉ chuyển từ đề bài sang não em thôi!',
  'Gia tốc học tập đang giảm! Bấm vào "Vá lỗ hổng" để tăng tốc nhé!',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function hasGreetedToday(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === todayISO();
  } catch {
    return false;
  }
}

function markGreetedToday(): void {
  try {
    localStorage.setItem(LS_KEY, todayISO());
  } catch {
    // localStorage unavailable — degrade gracefully
  }
}

function pickRandomQuote(): string {
  return PHYSICS_QUOTES[Math.floor(Math.random() * PHYSICS_QUOTES.length)];
}

// ─── Sub-component: MascotMedia ───────────────────────────────────────────────
// Renders <video> với WebM (primary) + MP4 (Safari fallback).
// key prop từ parent buộc video restart từ đầu mỗi lần đổi state.

interface MascotMediaProps {
  webmSrc: string;
  mp4Src:  string;
  /** Gọi khi video kết thúc (dùng cho GREETING / POKED → auto → IDLE) */
  onEnded?: () => void;
  /** state hiện tại để quyết định loop hay không */
  mascotState: MascotState;
}

const MascotMedia: React.FC<MascotMediaProps> = ({
  webmSrc,
  mp4Src,
  onEnded,
  mascotState,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Mỗi khi webmSrc thay đổi (state change) → reload + play
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    v.play().catch(() => undefined);
  }, [webmSrc]);

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    // Đảm bảo nền trong suốt hiển thị đúng
    background: 'transparent',
  };

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      preload="none"
      // IDLE loop vô tận; GREETING / POKED chạy 1 lần rồi goIdle
      loop={mascotState === 'IDLE'}
      onEnded={mascotState !== 'IDLE' ? onEnded : undefined}
      style={mediaStyle}
      aria-hidden="true"
      aria-label="THVL-bot mascot animation"
    >
      {/* WebM — tất cả trình duyệt hiện đại */}
      <source src={webmSrc} type="video/webm" />
      {/* MP4 — Safari / iOS fallback */}
      <source src={mp4Src}  type="video/mp4"  />
    </video>
  );
};

// ─── Sub-component: ChatBubble ────────────────────────────────────────────────

interface ChatBubbleProps {
  text: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ text }) => (
  <motion.div
    key="chat-bubble"
    initial={{ opacity: 0, y: 12, scale: 0.88 }}
    animate={{ opacity: 1, y: 0,  scale: 1 }}
    exit={{   opacity: 0, y: 12,  scale: 0.88 }}
    transition={{ type: 'spring', stiffness: 340, damping: 24 }}
    style={{
      position: 'relative',
      maxWidth: '220px',
      background: 'rgba(10, 18, 40, 0.88)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(0, 240, 255, 0.40)',
      borderRadius: '18px',
      padding: '10px 14px 12px',
      boxShadow: [
        '0 0 0 1px rgba(0,240,255,0.06)',
        '0 8px 32px rgba(0,0,0,0.55)',
        '0 0 28px rgba(0,240,255,0.12)',
      ].join(', '),
      pointerEvents: 'none',
    }}
  >
    {/* Neon top accent */}
    <div
      style={{
        position: 'absolute',
        top: 0, left: 14, right: 14,
        height: '1.5px',
        background:
          'linear-gradient(90deg, transparent, #00F0FF 40%, #8B5CF6 80%, transparent)',
        borderRadius: '999px',
      }}
    />

    {/* Quote text */}
    <p
      style={{
        margin: 0,
        fontSize: '0.725rem',
        lineHeight: 1.6,
        color: '#ffffff',
        textShadow: '0 0 8px rgba(0,240,255,0.5)',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        fontWeight: 500,
      }}
    >
      {text}
    </p>

    {/* Bubble tail — outer (border colour) */}
    <div
      style={{
        position: 'absolute',
        bottom: '-9px',
        right: '26px',
        width: 0,
        height: 0,
        borderLeft: '9px solid transparent',
        borderRight: '9px solid transparent',
        borderTop: '9px solid rgba(0,240,255,0.40)',
      }}
    />
    {/* Bubble tail — inner (fill colour) */}
    <div
      style={{
        position: 'absolute',
        bottom: '-7px',
        right: '27px',
        width: 0,
        height: 0,
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '8px solid rgba(10,18,40,0.88)',
      }}
    />
  </motion.div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const InteractiveMascot: React.FC = () => {
  const [state, setState] = useState<MascotState>('IDLE');
  const [quote, setQuote]   = useState<string>('');
  // mediaKey forces the <img> key to change → GIF restarts from frame 0
  const [mediaKey, setMediaKey] = useState<number>(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Clear pending timers safely ─────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Go IDLE (shared transition) ─────────────────────────────────────────
  const goIdle = useCallback(() => {
    clearTimer();
    setState('IDLE');
    setQuote('');
    setMediaKey(k => k + 1);
  }, [clearTimer]);

  // ── Daily greeting on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!hasGreetedToday()) {
      markGreetedToday();
      setState('GREETING');
      setMediaKey(k => k + 1);
      timerRef.current = setTimeout(goIdle, GREETING_DURATION_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs only on mount

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  // ── Click handler (poke) ────────────────────────────────────────────────
  const handlePoke = useCallback(() => {
    if (state === 'POKED') return; // debounce rapid clicks

    clearTimer();
    setQuote(pickRandomQuote());
    setState('POKED');
    setMediaKey(k => k + 1); // restart poked GIF from frame 0

    timerRef.current = setTimeout(goIdle, POKED_DURATION_MS);
  }, [state, clearTimer, goIdle]);

  // ── Video ended handler (fallback for MP4 non-looping states) ──────────
  const handleVideoEnded = useCallback(() => {
    if (state === 'GREETING' || state === 'POKED') goIdle();
  }, [state, goIdle]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const showBubble = state === 'POKED' && quote !== '';

  return (
    <div
      id="interactive-mascot-root"
      style={{
        position: 'fixed',
        // Above mobile bottom-nav (typically 64px), with extra breathing room
        bottom: 'var(--mascot-bottom, 5.5rem)',
        right: '1rem',
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        // Pass pointer events only to children that need them
        pointerEvents: 'none',
      }}
    >
      {/* ── Chat Bubble ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBubble && (
          <div style={{ pointerEvents: 'none' }}>
            <ChatBubble text={quote} />
          </div>
        )}
      </AnimatePresence>

      {/* ── Mascot Body ─────────────────────────────────────────────────── */}
      <motion.div
        id="interactive-mascot-body"
        /**
         * Floating idle animation runs continuously.
         * POKED gets an extra jolt via whileTap + animate override.
         */
        animate={
          state === 'POKED'
            ? {
                y:      [0, -14, 6, -8, 0],
                rotate: [0, -5, 5, -3, 0],
                scale:  [1, 1.1, 0.95, 1.05, 1],
              }
            : {
                // Gentle float loop (spec: y: [0, -10, 0])
                y: [0, -10, 0],
              }
        }
        transition={
          state === 'POKED'
            ? { duration: 0.5, ease: 'easeOut' }
            : {
                duration: 3.2,
                repeat: Infinity,
                repeatType: 'loop',
                ease: 'easeInOut',
              }
        }
        onClick={handlePoke}
        title="Chọc THVL-bot để xem phản ứng!"
        aria-label="Mascot THVL-bot — nhấn để tương tác"
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handlePoke()}
        whileHover={{ scale: 1.06 }}
        style={{
          pointerEvents: 'auto',
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          // Desktop: 150 px | Mobile (<768 px): 120 px via CSS var
          width: 'var(--mascot-size, 150px)',
          height: 'calc(var(--mascot-size, 150px) * 1.5)',
          filter: [
            'drop-shadow(0 6px 18px rgba(0,0,0,0.65))',
            state === 'POKED'
              ? 'drop-shadow(0 0 18px rgba(255,80,80,0.5))'
              : 'drop-shadow(0 0 14px rgba(0,240,255,0.25))',
          ].join(' '),
          transition: 'filter 0.3s ease',
        }}
      >
        {/*
          key={mediaKey} ensures the <img> tag is re-mounted on every state
          transition, which forces GIF animations to restart from frame 0
          (especially important for poked.gif).
        */}
        <MascotMedia
          key={mediaKey}
          webmSrc={WEBM_SRCS[state]}
          mp4Src={MP4_FALLBACKS[state]}
          onEnded={handleVideoEnded}
          mascotState={state}
        />
      </motion.div>

      {/* ── Responsive CSS ──────────────────────────────────────────────── */}
      <style>{`
        #interactive-mascot-root {
          --mascot-size: 150px;
          --mascot-bottom: 5.5rem;
        }
        @media (max-width: 767px) {
          #interactive-mascot-root {
            --mascot-size: 75px;
            --mascot-bottom: 4.5rem;
          }
        }
        /* Keyboard focus ring */
        #interactive-mascot-body:focus-visible {
          outline: 2px solid #00F0FF;
          outline-offset: 4px;
          border-radius: 12px;
        }
        /*
         * Safari / iOS fallback: WebM VP9 alpha không được hỗ trợ trên Safari.
         * mix-blend-mode: multiply loại bỏ nền trắng trên nền tối (dark theme).
         * Chrome/Firefox/Edge/Android dùng alpha channel thật từ WebM VP9.
         */
        #interactive-mascot-body video {
          mix-blend-mode: multiply;
        }
        /* Trên nền tối, multiply = transparent. Disable nếu nền sáng */
        @supports (mix-blend-mode: normal) {
          #interactive-mascot-body video {
            mix-blend-mode: multiply;
          }
        }
      `}</style>
    </div>
  );
};

export default InteractiveMascot;
