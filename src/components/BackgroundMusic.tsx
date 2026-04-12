import React, { useState, useEffect, useRef } from 'react';
import { db, doc, onSnapshot } from '../firebase';
import { Volume2, VolumeX, Music } from 'lucide-react';

export const BackgroundMusic = () => {
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'metadata', 'exam_config'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().music_url) {
        setMusicUrl(docSnap.data().music_url);
      }
    });
    return () => unsub();
  }, []);

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
  }, [isPlaying, musicUrl]);

  const displayMusic = musicUrl || "/music/duong_den_ngay_vinh_quang.mp3";

  return (
    <div className="flex items-center justify-center p-2">
      <audio ref={audioRef} src={displayMusic} loop />
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className={`group relative p-3 rounded-full border transition-all duration-300 ${
          isPlaying 
            ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
            : 'bg-slate-800/80 border-slate-700/50 text-slate-500 hover:text-white'
        }`}
      >
        {isPlaying ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        
        {/* Tooltip */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-slate-900 border border-slate-700 text-[10px] text-white font-bold whitespace-nowrap rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex items-center gap-1 z-50">
          <Music className="w-3 h-3 text-cyan-400" /> Đường đến ngày vinh quang
        </div>
      </button>
    </div>
  );
};
