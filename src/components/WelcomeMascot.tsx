import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const LS_KEY = 'phys9_mascot_greeted_date';
const AUTO_CLOSE_MS = 8000;
const GREETING_TEXT =
  'Chào mừng các bạn đến với Phy9plus.com, chúc bạn có một trải nghiệm hiệu quả nhé!';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTodayString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function hasGreetedToday(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === getTodayString();
  } catch {
    return false;
  }
}

function markGreetedToday(): void {
  try {
    localStorage.setItem(LS_KEY, getTodayString());
  } catch {
    // Storage unavailable — degrade gracefully
  }
}

// ─── Sub-component: Typing Effect ─────────────────────────────────────────────
interface TypingTextProps {
  text: string;
  charDelay?: number; // ms between characters
}

const TypingText: React.FC<TypingTextProps> = ({ text, charDelay = 35 }) => {
  const [displayed, setDisplayed] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const indexRef = useRef(0);

  // Typing animation
  useEffect(() => {
    indexRef.current = 0;
    setDisplayed('');

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
      } else {
        clearInterval(interval);
      }
    }, charDelay);

    return () => clearInterval(interval);
  }, [text, charDelay]);

  // Blinking cursor
  useEffect(() => {
    const blink = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(blink);
  }, []);

  return (
    <span
      style={{
        color: '#ffffff',
        textShadow: '0 0 8px rgba(0,240,255,0.7), 0 0 20px rgba(0,240,255,0.35)',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        fontSize: '0.78rem',
        lineHeight: '1.6',
        letterSpacing: '0.01em',
      }}
    >
      {displayed}
      <span
        style={{
          opacity: cursorVisible ? 1 : 0,
          color: '#00F0FF',
          fontWeight: 700,
          transition: 'opacity 0.1s',
        }}
      >
        |
      </span>
    </span>
  );
};

// ─── Sub-component: Progress Bar ──────────────────────────────────────────────
interface ProgressBarProps {
  durationMs: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ durationMs }) => (
  <div
    style={{
      width: '100%',
      height: '2px',
      background: 'rgba(0,240,255,0.15)',
      borderRadius: '999px',
      overflow: 'hidden',
    }}
  >
    <motion.div
      initial={{ width: '100%' }}
      animate={{ width: '0%' }}
      transition={{ duration: durationMs / 1000, ease: 'linear' }}
      style={{
        height: '100%',
        background: 'linear-gradient(90deg, #00F0FF, #8B5CF6)',
        borderRadius: '999px',
      }}
    />
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
export const WelcomeMascot: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-per-day gate
  useEffect(() => {
    if (!hasGreetedToday()) {
      markGreetedToday();
      setVisible(true);
    }
  }, []);

  // Auto-close after 8 s
  useEffect(() => {
    if (!visible) return;

    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, AUTO_CLOSE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const handleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="welcome-mascot"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          // Pointer-events: auto on the card, none on the wrapper so the rest
          // of the dashboard stays fully clickable
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 9998,
          }}
          className="welcome-mascot-root"
          aria-label="Màn hình chào mừng"
          role="dialog"
          aria-modal="false"
        >
          {/* ── Glassmorphism Card ── */}
          <div
            style={{
              width: '240px',
              background: 'rgba(15, 23, 42, 0.72)', // slate-900/72
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid rgba(0,240,255,0.35)',
              borderRadius: '20px',
              boxShadow:
                '0 0 0 1px rgba(0,240,255,0.05), 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,240,255,0.08)',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            {/* ── Neon top accent line ── */}
            <div
              style={{
                height: '2px',
                background:
                  'linear-gradient(90deg, transparent, #00F0FF 40%, #8B5CF6 80%, transparent)',
              }}
            />

            {/* ── Header: close button ── */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '10px 12px 0',
              }}
            >
              <button
                onClick={handleClose}
                aria-label="Đóng lời chào"
                title="Bỏ qua"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(0,240,255,0.07)',
                  border: '1px solid rgba(0,240,255,0.2)',
                  borderRadius: '999px',
                  color: 'rgba(255,255,255,0.55)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  padding: '3px 10px 3px 6px',
                  transition: 'background 0.2s, color 0.2s, border-color 0.2s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget;
                  el.style.background = 'rgba(0,240,255,0.15)';
                  el.style.color = '#00F0FF';
                  el.style.borderColor = 'rgba(0,240,255,0.5)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget;
                  el.style.background = 'rgba(0,240,255,0.07)';
                  el.style.color = 'rgba(255,255,255,0.55)';
                  el.style.borderColor = 'rgba(0,240,255,0.2)';
                }}
              >
                <X size={12} strokeWidth={2.5} />
                Bỏ qua
              </button>
            </div>

            {/* ── Mascot Video ── */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                padding: '6px 0 0',
                position: 'relative',
              }}
            >
              {/* Glow ring beneath the video */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '120px',
                  height: '30px',
                  background: 'radial-gradient(ellipse, rgba(0,240,255,0.22) 0%, transparent 70%)',
                  borderRadius: '50%',
                  filter: 'blur(6px)',
                }}
              />
              <video
                src="/mascot-intro.webm"
                autoPlay
                muted
                playsInline
                preload="none"
                loop={false}
                style={{
                  width: '170px',
                  height: 'auto',
                  display: 'block',
                  // Let the webm alpha channel show through
                  mixBlendMode: 'normal',
                  position: 'relative',
                  zIndex: 1,
                  filter: 'drop-shadow(0 0 12px rgba(0,240,255,0.4))',
                }}
                aria-hidden="true"
              />
            </div>

            {/* ── Subtitle text with typing effect ── */}
            <div
              style={{
                padding: '10px 16px 14px',
                minHeight: '64px',
              }}
            >
              <TypingText text={GREETING_TEXT} charDelay={32} />
            </div>

            {/* ── Auto-close progress bar ── */}
            <div style={{ padding: '0 12px 12px' }}>
              <ProgressBar durationMs={AUTO_CLOSE_MS} />
            </div>
          </div>

          {/* ── Responsive: center on small screens ── */}
          <style>{`
            @media (max-width: 480px) {
              .welcome-mascot-root {
                bottom: 1rem !important;
                right: 50% !important;
                transform: translateX(50%) !important;
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeMascot;
