import React, { useState, useEffect, useRef } from 'react';
import { db, doc, onSnapshot } from '../firebase';
import { Volume2, VolumeX, Music, SkipForward, SkipBack, Play, Pause, ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '../lib/utils';

// Danh sách Podcast mặc định. Đã được chuẩn hoá tên file không dấu để chống lỗi 404.
export const DEFAULT_PLAYLIST = [
  { title: "Cách áp dụng để ghi nhớ lâu", url: "/music/cach-ap-dung-e-ghi-nho-lau.m4a" },
  { title: "10 phút để bạn học tập hiệu quả", url: "/music/10-phut-e-ban-hoc-tap-hieu-qua.m4a" },
  { title: "Học đi rồi mai sau tự hào", url: "/music/hoc-i-roi-mai-sau-cau-se-tu-hao-ve-chinh-minh.m4a" },
  { title: "Học và ôn thi đúng cách", url: "/music/hoc-va-on-thi-ung-cach-theo-phuong-phap-khoa-hoc.m4a" },
  { title: "Nhạc thiền thư giãn mỗi ngày", url: "/music/nhac-thien-thu-gian-moi-ngay.m4a" },
  { title: "Ôn thi hiệu quả", url: "/music/on-thi-hieu-qua-phuong-phap-khoa-hoc.m4a" },
  { title: "Playlist nhạc chill lofi", url: "/music/playlist-nhac-chill-e-to-giup-cau.m4a" },
  { title: "Tổng hợp nhạc Trung Hoa tạo động lực", url: "/music/tong-hop-nhac-trung-hoa-tao-ong-luc.m4a" },
  { title: "Học tập khó khăn thế", url: "/music/hoc-tap-kho-khan-the.m4a" },
  { title: "Chẳng lẽ gặp nghịch cảnh mới cố", url: "/music/chang-le-can-nghich-canh-moi-co-len.m4a" },
  { title: "Nhạc quán Cafe Lofi", url: "/music/nhac-chill-quan-cafe-nhung-ca-khuc-lofi.m4a" },
  { title: "Đường đến ngày vinh quang", url: "/music/duong_den_ngay_vinh_quang.mp3" },
];

export const BackgroundMusic = ({ className }: { className?: string }) => {
  const [playlist, setPlaylist] = useState(DEFAULT_PLAYLIST);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Voice Tutor coordination: tạm dừng nhạc khi AI đang lắng nghe/nói ──
  const [voiceTutorActive, setVoiceTutorActive] = useState(false);
  const wasPlayingBeforeVoice = useRef(false);

  useEffect(() => {
    const handleVoiceEvent = (e: Event) => {
      const active = (e as CustomEvent).detail?.active;
      setVoiceTutorActive(active);
      if (active) {
        // Lưu trạng thái đang phát, rồi tạm dừng
        wasPlayingBeforeVoice.current = isPlaying;
        if (audioRef.current && isPlaying) {
          audioRef.current.pause();
        }
      } else {
        // Khôi phục phát nhạc nếu trước đó đang phát
        if (wasPlayingBeforeVoice.current && audioRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    };

    window.addEventListener('aivoice-active', handleVoiceEvent);
    return () => window.removeEventListener('aivoice-active', handleVoiceEvent);
  }, [isPlaying]);

  // Tuỳ chọn ghi đè từ metadata nếu cài đặt từ Admin (vẫn giữ code cũ)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'metadata', 'exam_config'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().music_url) {
        // Nếu admin force 1 bài riêng, ta ưu tiên
        setPlaylist([{ title: "Bài hát tuỳ chỉnh", url: docSnap.data().music_url }]);
        setCurrentIndex(0);
      }
    });
    return () => unsub();
  }, []);

  const currentTrack = playlist[currentIndex];

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => {
          console.error("Lỗi phát nhạc:", e);
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentIndex, playlist]);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsPlaying(!isPlaying);
  };
  
  const nextTrack = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % playlist.length);
    setIsPlaying(true);
  };
  
  const prevTrack = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
    setIsPlaying(true);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const p = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(isNaN(p) ? 0 : p);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProgress = Number(e.target.value);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (newProgress / 100) * audioRef.current.duration;
      setProgress(newProgress);
    }
  };

  return (
    <div className={cn("relative flex items-center justify-end z-[200] transition-all duration-500", className)}>
      {/* Audio Element */}
      <audio 
        ref={audioRef} 
        src={currentTrack?.url} 
        onEnded={nextTrack}
        onTimeUpdate={handleTimeUpdate}
      />
      
      <div 
        className={cn(
          "flex items-center gap-2 bg-slate-950/80 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ease-out group",
          isExpanded ? "w-[280px] sm:w-[320px] p-3 flex-col" : "w-12 h-12 justify-center cursor-pointer hover:bg-slate-800 hover:border-slate-600 shadow-[0_0_20px_-5px_rgba(0,0,0,0.5)]"
        )}
        onClick={() => !isExpanded && setIsExpanded(true)}
      >
        {!isExpanded ? (
          <div className="flex items-center justify-center w-full h-full relative">
             {isPlaying && (
               <div className="absolute inset-0 rounded-2xl border border-cyan-500/30 animate-pulse" />
             )}
             {isPlaying ? <Volume2 className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" /> : <Music className="w-5 h-5 text-slate-400 group-hover:scale-110 transition-transform" />}
          </div>
        ) : (
          <div className="flex flex-col w-full gap-3 animate-in fade-in duration-300 pt-1 pointer-events-auto">
            <div className="flex items-center justify-between w-full">
              {/* Info */}
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <Music className={cn("w-4 h-4 shrink-0", isPlaying ? "text-cyan-400 animate-pulse" : "text-slate-400")} />
                <div className="text-xs font-bold text-slate-200 truncate pr-2 w-full" style={{ maxWidth: '100%' }}>
                  <marquee scrollamount="4">{currentTrack?.title}</marquee>
                </div>
              </div>
              {/* Close Button */}
              <button onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }} className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            {/* Controls */}
            <div className="flex items-center justify-between w-full gap-2">
              <button onClick={prevTrack} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors">
                 <SkipBack className="w-4 h-4" />
              </button>
              
              <button 
                onClick={togglePlay} 
                className="p-2.5 rounded-full bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 hover:text-cyan-300 transition-all shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]"
              >
                 {isPlaying ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" />}
              </button>
              
              <button onClick={nextTrack} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors">
                 <SkipForward className="w-4 h-4" />
              </button>

              {/* Progress Bar scrubber */}
              <div className="flex-1 pl-2 pr-1 flex items-center h-full">
                 <input 
                    type="range" 
                    min="0" max="100" 
                    value={progress} 
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                    style={{ background: `linear-gradient(to right, #22d3ee ${progress}%, #1e293b ${progress}%)` }}
                 />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
