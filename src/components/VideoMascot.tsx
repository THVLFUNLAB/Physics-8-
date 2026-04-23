import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────
type MascotState = 'idle' | 'wave' | 'dizzy';

// ─── Constants ────────────────────────────────────────────────────────────────
const VIDEO_SOURCES: Record<MascotState, string> = {
  idle:  '/mascot-idle.mp4',
  wave:  '/mascot-wave.mp4',
  dizzy: '/mascot-dizzy.mp4',
};

const PHYSICS_QUOTES = [
  'E = mc²... nhưng điểm của em thì = 0 🤔',
  'Newton nói: vật thể ở trạng thái nghỉ thích nghỉ thêm 10 phút!',
  'Theo định lý Pythagore, lười học vẫn là một cạnh tam giác!',
  'Entropy luôn tăng... đặc biệt là trong đầu lúc thi!',
  'Ánh sáng đi 300.000 km/s, mà em vẫn đến lớp trễ!',
  'Điện trở của não tỉ lệ thuận với số giờ không ngủ 😴',
  'F = ma, nhưng Force của em = 0 vào sáng thứ Hai!',
  'Sóng ánh sáng có thể nhiễu xạ... nỗi đau khi thi thì không!',
  'Phy9plus luôn ở đây giúp em chinh phục Vật Lí! 💪',
  'Học như hạt nhân phân hạch — tỏa ra năng lượng khổng lồ! ⚛️',
];

function randomQuote(): string {
  return PHYSICS_QUOTES[Math.floor(Math.random() * PHYSICS_QUOTES.length)];
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const VideoMascot: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mascotState, setMascotState] = useState<MascotState>('idle');
  const [quote, setQuote] = useState<string>('');
  const [isBouncing, setIsBouncing] = useState(false);
  // Keep a ref to avoid stale closure in onEnded
  const mascotStateRef = useRef<MascotState>('idle');

  // ── Sync state ref ────────────────────────────────────────────────────────
  useEffect(() => {
    mascotStateRef.current = mascotState;
  }, [mascotState]);

  // ── Swap video source whenever state changes ───────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const newSrc = VIDEO_SOURCES[mascotState];

    // Only reload if the source actually changed (avoids flicker on re-renders)
    if (video.getAttribute('data-current-src') === newSrc) return;

    video.setAttribute('data-current-src', newSrc);
    video.src = newSrc;
    video.loop = mascotState === 'idle';
    video.load();

    // Play as soon as enough data is buffered
    const tryPlay = () => {
      video.play().catch(() => {
        // Autoplay blocked — silently fail (video still shown)
      });
    };

    video.addEventListener('canplay', tryPlay, { once: true });
    return () => video.removeEventListener('canplay', tryPlay);
  }, [mascotState]);

  // ── onEnded: revert non-idle states back to 'idle' ────────────────────────
  const handleEnded = useCallback(() => {
    if (mascotStateRef.current !== 'idle') {
      setMascotState('idle');
      // Keep the quote visible a beat after reverting
      setTimeout(() => setQuote(''), 400);
    }
  }, []);

  // ── On mount: trigger wave ─────────────────────────────────────────────────
  useEffect(() => {
    // Small delay so the component fully mounts before swapping video
    const t = setTimeout(() => setMascotState('wave'), 300);
    return () => clearTimeout(t);
  }, []);

  // ── Click / Poke ───────────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (mascotState === 'dizzy') return; // Already dizzy — debounce

    setQuote(randomQuote());
    setIsBouncing(true);
    setMascotState('dizzy');

    // Reset bounce flag after animation completes
    setTimeout(() => setIsBouncing(false), 500);
  }, [mascotState]);

  const showBubble = quote !== '' && mascotState !== 'idle';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '5.5rem',   // above the bottom nav bar
        right:  '1rem',
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        // Only capture pointer events when bubble or video is visible
        pointerEvents: 'none',
      }}
    >
      {/* ── Chat Bubble ── */}
      <AnimatePresence>
        {showBubble && (
          <motion.div
            key="chat-bubble"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: 10,  scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            style={{
              pointerEvents: 'auto',
              maxWidth: '210px',
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid rgba(0,240,255,0.35)',
              borderRadius: '16px',
              padding: '10px 14px',
              boxShadow:
                '0 0 0 1px rgba(0,240,255,0.05), 0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(0,240,255,0.1)',
              position: 'relative',
            }}
          >
            {/* Neon top accent */}
            <div
              style={{
                position: 'absolute',
                top: 0, left: 12, right: 12,
                height: '1.5px',
                background:
                  'linear-gradient(90deg, transparent, #00F0FF 40%, #8B5CF6 80%, transparent)',
                borderRadius: '999px',
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: '0.72rem',
                lineHeight: '1.55',
                color: '#ffffff',
                textShadow: '0 0 6px rgba(0,240,255,0.45)',
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
                fontWeight: 500,
              }}
            >
              {quote}
            </p>
            {/* Bubble tail (pointing down-right) */}
            <div
              style={{
                position: 'absolute',
                bottom: '-8px',
                right: '24px',
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '8px solid rgba(0,240,255,0.35)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '-6.5px',
                right: '25px',
                width: 0,
                height: 0,
                borderLeft: '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop: '7px solid rgba(15,23,42,0.88)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Video Container — toàn thân, không crop ── */}
      <motion.div
        animate={
          isBouncing
            ? { scale: [1, 1.18, 0.9, 1.08, 1], rotate: [0, -4, 4, -2, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: 0.45, ease: 'easeOut' }}
        onClick={handleClick}
        title="Chọc mascot để xem phản ứng!"
        style={{
          pointerEvents: 'auto',
          cursor: 'pointer',
          width: '120px',
          height: '180px',
          borderRadius: '0',
          overflow: 'visible',
          background: 'transparent',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(0,240,255,0.2))',
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          onEnded={handleEnded}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          aria-hidden="true"
        />
      </motion.div>
    </div>
  );
};

export default VideoMascot;
