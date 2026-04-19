import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import { voiceAITutor } from '../services/geminiService';
import { Mic, MicOff, X, Volume2, Send } from 'lucide-react';
import MathRenderer from '../lib/MathRenderer';

// ── Avatar Thầy Hậu 3D ──
const THAY_HAU_AVATAR = '/thay-hau-avatar.png';

// ============================================================
// VOICE TUTOR BUTTON — Gia sư AI giọng nói "Thầy Hậu"
// ============================================================
// Tính năng chính:
// 1. Speech-to-Text (Web Speech API) — Ghi nhận giọng nói học sinh
// 2. AI Processing via Gemini Flash — Gợi mở tư duy, không giải hộ
// 3. Text-to-Speech (speechSynthesis) — Đọc phản hồi AI bằng giọng nói
// 4. Audio Visualizer CSS animation — Hiệu ứng sóng âm khi nói
// 5. CustomEvent 'aivoice-active' — Phối hợp tạm dừng BackgroundMusic
// ============================================================

// NÂNG CẤP BỘ LỌC VĂN BẢN (Text Sanitizer)
const sanitizeForSpeech = (text: string) => {
  // Loại bỏ hoàn toàn các ký tự Markdown (**, *, #)
  let clean = text.replace(/[*_#`]/g, '');
  
  // Chuyển đổi các công thức LaTeX cơ bản thành chữ tiếng Việt dễ đọc
  clean = clean.replace(/\$\$?(.*?)\$\$?/g, (_, formula) => {
    return formula
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 chia $2')
      .replace(/\\sqrt\{([^}]+)\}/g, 'căn $1')
      .replace(/\\Delta/g, 'delta')
      .replace(/\\omega/g, 'omega')
      .replace(/\\vec\{([^}]+)\}/g, 'vectơ $1')
      .replace(/=/g, ' bằng ')
      .replace(/\+/g, ' cộng ')
      .replace(/-/g, ' trừ ')
      .replace(/\*/g, ' nhân ')
      .replace(/\//g, ' chia ');
  });

  // Xóa bỏ các ký hiệu gốc nếu còn sót
  clean = clean.replace(/\\frac/g, '').replace(/\\sqrt/g, 'căn').replace(/\$|\\/g, '');

  return clean.replace(/\s+/g, ' ').trim();
};

interface VoiceTutorButtonProps {
  questionContent: string;
  detailedSolution?: string | null;
  className?: string;
}

type TutorPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';


// ── Detect Speech Recognition API ──
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export const VoiceTutorButton: React.FC<VoiceTutorButtonProps> = ({
  questionContent,
  detailedSolution,
  className,
}) => {
  const [phase, setPhase] = useState<TutorPhase>('idle');
  const [isOpen, setIsOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'student' | 'ai'; text: string }[]>([]);
  const [inputText, setInputText] = useState('');

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentCloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudAudioCanceledRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<string>('');
  const didUnlockAudioRef = useRef<boolean>(false);

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // ── Dispatch aivoice-active custom event ──
  const dispatchVoiceEvent = useCallback((active: boolean) => {
    window.dispatchEvent(new CustomEvent('aivoice-active', { detail: { active } }));
  }, []);

  // ── Cleanup on unmount & Load Voices ──
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        setAvailableVoices(window.speechSynthesis.getVoices());
      }
    };
    
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel();
      if (currentCloudAudioRef.current) {
        currentCloudAudioRef.current.pause();
      }
      cloudAudioCanceledRef.current = true;
      dispatchVoiceEvent(false);
    };
  }, [dispatchVoiceEvent]);

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // ── Check browser support ──
  const isSpeechSupported = !!SpeechRecognitionAPI;
  const isSynthSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ══════════════════════════════════════════
  //  START LISTENING
  // ══════════════════════════════════════════
  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setErrorMsg('Trình duyệt không hỗ trợ ghi âm giọng nói. Hãy dùng Chrome hoặc Edge.');
      setPhase('error');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis?.cancel();
    if (currentCloudAudioRef.current) {
      currentCloudAudioRef.current.pause();
    }
    cloudAudioCanceledRef.current = true;

    // Mobile Audio Unlock
    if (!didUnlockAudioRef.current && typeof window !== 'undefined') {
        if (globalAudioRef.current) {
            globalAudioRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            const p = globalAudioRef.current.play();
            if (p !== undefined) {
                 p.then(() => globalAudioRef.current?.pause()).catch(() => {});
            }
        }
        if ('speechSynthesis' in window) {
            const unlockUtterance = new SpeechSynthesisUtterance('');
            unlockUtterance.volume = 0;
            window.speechSynthesis.speak(unlockUtterance);
            window.speechSynthesis.cancel();
        }
        didUnlockAudioRef.current = true;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'vi-VN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setPhase('listening');
      setTranscript('');
      transcriptRef.current = '';
      setErrorMsg('');
      dispatchVoiceEvent(true);
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      setTranscript(finalText || interimText);
      transcriptRef.current = finalText || interimText;
    };

    recognition.onend = () => {
      // Only process if we have transcript and were in listening mode
      if (phase === 'listening' || recognitionRef.current) {
        const currentTranscript = transcriptRef.current;
        if (currentTranscript.trim()) {
          processWithAI(currentTranscript.trim());
        } else {
          setPhase('idle');
          dispatchVoiceEvent(false);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('[VoiceTutor] Speech Recognition Error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMsg('Mic bị chặn. Hãy cho phép truy cập Microphone trong cài đặt trình duyệt.');
      } else if (event.error === 'no-speech') {
        setErrorMsg('Thầy không nghe thấy gì. Em thử nói lại nhé!');
      } else if (event.error === 'network') {
        setErrorMsg('Lỗi mạng khi nhận dạng giọng nói. Kiểm tra kết nối internet.');
      } else {
        setErrorMsg('Có lỗi xảy ra khi ghi âm. Thử lại nhé!');
      }
      setPhase('error');
      dispatchVoiceEvent(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('[VoiceTutor] Failed to start recognition:', e);
      setErrorMsg('Không thể bật mic. Hãy kiểm tra quyền truy cập Microphone.');
      setPhase('error');
      dispatchVoiceEvent(false);
    }
  }, [phase, transcript, dispatchVoiceEvent]);

  // ══════════════════════════════════════════
  //  STOP LISTENING
  // ══════════════════════════════════════════
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop?.();
  }, []);

  // ══════════════════════════════════════════
  //  TEXT-TO-SPEECH — Cloud-first strategy
  //  (Google Translate TTS endpoint is reliable
  //   across all devices including mobile)
  // ══════════════════════════════════════════

  /**
   * Split text into sentences ≤ 180 chars each 
   * (Google TTS endpoint limit is ~200 chars)
   */
  const splitIntoChunks = useCallback((text: string): string[] => {
    // First split by sentence boundaries
    const rawSentences = text.split(/(?<=[.!?。])\s+/).filter(s => s.trim());
    const chunks: string[] = [];

    for (const sentence of rawSentences) {
      if (sentence.length <= 180) {
        chunks.push(sentence);
      } else {
        // Split long sentences by comma/semicolon
        const parts = sentence.split(/(?<=[,;:])\s+/);
        let current = '';
        for (const part of parts) {
          if ((current + ' ' + part).trim().length > 180 && current) {
            chunks.push(current.trim());
            current = part;
          } else {
            current = current ? current + ' ' + part : part;
          }
        }
        if (current.trim()) chunks.push(current.trim());
      }
    }

    return chunks.length > 0 ? chunks : [text.substring(0, 180)];
  }, []);

  /**
   * Cloud TTS (primary) — fetches audio from Google Translate TTS
   * Uses blob preloading to avoid autoplay policy issues
   */
  const speakWithCloudTTS = useCallback(async (text: string) => {
    cloudAudioCanceledRef.current = false;
    const chunks = splitIntoChunks(text);
    
    setPhase('speaking');
    dispatchVoiceEvent(true);

    const getAudioUrl = (sentence: string) => 
      `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=vi&q=${encodeURIComponent(sentence.trim())}`;

    // Preload all chunks as blobs first (avoids CORS/autoplay issues on mobile)
    const preloadAudio = async (sentence: string): Promise<string | null> => {
      try {
        const response = await fetch(getAudioUrl(sentence));
        if (!response.ok) return null;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } catch (e) {
        console.error('[VoiceTutor] Preload failed:', e);
        return null;
      }
    };

    // Preload first chunk immediately
    let nextBlobPromise = preloadAudio(chunks[0]);

    for (let i = 0; i < chunks.length; i++) {
      if (cloudAudioCanceledRef.current) break;

      const blobUrl = await nextBlobPromise;
      
      // Start preloading next chunk while current plays
      if (i + 1 < chunks.length) {
        nextBlobPromise = preloadAudio(chunks[i + 1]);
      }

      if (cloudAudioCanceledRef.current) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        break;
      }

      // Play the audio, with a hard timeout fallback
      const urlToPlay = blobUrl || getAudioUrl(chunks[i]);
      
      await new Promise<void>((resolve) => {
        const audio = globalAudioRef.current;
        if (!audio) {
          resolve();
          return;
        }

        audio.src = urlToPlay;
        audio.volume = 1.0;
        currentCloudAudioRef.current = audio;

        // Watchdog: if audio hasn't started in 5s, skip
        const watchdog = setTimeout(() => {
          console.warn('[VoiceTutor] Audio watchdog triggered — skipping chunk');
          cleanup();
        }, 5000);

        const cleanup = () => {
          clearTimeout(watchdog);
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          currentCloudAudioRef.current = null;
          resolve();
        };

        audio.onended = cleanup;
        audio.onerror = (e) => {
          console.error('[VoiceTutor] Audio error:', e);
          cleanup();
        };

        audio.play().catch(e => {
          console.error('[VoiceTutor] Cloud TTS play blocked:', e);
          cleanup();
        });
      });
    }

    if (!cloudAudioCanceledRef.current) {
      setPhase('idle');
      dispatchVoiceEvent(false);
      currentCloudAudioRef.current = null;
    }
  }, [dispatchVoiceEvent, splitIntoChunks]);

  /**
   * Native TTS fallback — only used if Cloud TTS completely fails
   */
  const speakWithNativeTTS = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const viVoices = availableVoices.filter(v => v.lang.startsWith('vi'));
    if (viVoices.length > 0) {
      let bestVoice = viVoices.find(v => 
        v.name.includes('Natural') || v.name.includes('Online') || 
        v.name.includes('Google') || v.name.includes('HoaiMy')
      );
      if (!bestVoice) bestVoice = viVoices[0];
      utterance.voice = bestVoice;
    }

    utterance.onstart = () => setPhase('speaking');
    utterance.onend = () => { setPhase('idle'); dispatchVoiceEvent(false); };
    utterance.onerror = () => { setPhase('idle'); dispatchVoiceEvent(false); };

    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [dispatchVoiceEvent, availableVoices]);

  // ══════════════════════════════════════════
  //  SPEAK RESPONSE — Entry point
  //  Strategy: Cloud-first, native fallback
  // ══════════════════════════════════════════
  const speakResponse = useCallback((text: string) => {
    window.speechSynthesis?.cancel();
    if (currentCloudAudioRef.current) currentCloudAudioRef.current.pause();
    cloudAudioCanceledRef.current = true;

    const cleanText = sanitizeForSpeech(text);
    
    // Always try Cloud TTS first — more reliable on mobile/cross-platform
    cloudAudioCanceledRef.current = false;
    speakWithCloudTTS(cleanText).catch((err) => {
      console.warn('[VoiceTutor] Cloud TTS failed, trying native:', err);
      // Fallback to native if cloud fails entirely
      if (isSynthSupported) {
        speakWithNativeTTS(cleanText);
      } else {
        setPhase('idle');
        dispatchVoiceEvent(false);
      }
    });
  }, [speakWithCloudTTS, speakWithNativeTTS, isSynthSupported, dispatchVoiceEvent]);

  // ══════════════════════════════════════════
  //  PROCESS WITH AI (Gemini Flash)
  // ══════════════════════════════════════════
  const processWithAI = useCallback(async (studentText: string) => {
    setPhase('thinking');
    setChatHistory(prev => [...prev, { role: 'student', text: studentText }]);

    try {
      const response = await voiceAITutor(
        questionContent,
        detailedSolution,
        studentText
      );

      setAiResponse(response);
      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);

      // ── Text-to-Speech (Cloud-first, always attempt) ──
      speakResponse(response);
    } catch (error) {
      console.error('[VoiceTutor] AI Error:', error);
      setErrorMsg('AI đang gặp sự cố. Em thử lại sau nhé!');
      setPhase('error');
      dispatchVoiceEvent(false);
    }
  }, [questionContent, detailedSolution, speakResponse, dispatchVoiceEvent]);

  // ══════════════════════════════════════════
  //  CLOSE / RESET
  // ══════════════════════════════════════════
  const handleClose = useCallback(() => {
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
    if (currentCloudAudioRef.current) currentCloudAudioRef.current.pause();
    cloudAudioCanceledRef.current = true;
    dispatchVoiceEvent(false);
    setPhase('idle');
    setTranscript('');
    setAiResponse('');
    setErrorMsg('');
    setIsOpen(false);
  }, [dispatchVoiceEvent]);

  // ── Handle toggle of main button ──
  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
      setChatHistory([]);
    }
  }, [isOpen, handleClose]);

  // ── Handle mic button click ──
  const handleMicClick = useCallback(() => {
    // Note: Audio unlock is now handled in startListening using globalAudioRef

    if (phase === 'listening') {
      stopListening();
    } else if (phase === 'idle' || phase === 'error') {
      startListening();
    } else if (phase === 'speaking') {
      window.speechSynthesis?.cancel();
      if (currentCloudAudioRef.current) currentCloudAudioRef.current.pause();
      cloudAudioCanceledRef.current = true;
      setPhase('idle');
      dispatchVoiceEvent(false);
    }
  }, [phase, startListening, stopListening, dispatchVoiceEvent]);

  // ── Handle text submit ──
  const handleTextSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    
    // Stop any ongoing voice operations
    window.speechSynthesis?.cancel();
    if (currentCloudAudioRef.current) currentCloudAudioRef.current.pause();
    cloudAudioCanceledRef.current = true;
    recognitionRef.current?.stop?.();

    processWithAI(inputText.trim());
    setInputText('');
  }, [inputText, processWithAI]);

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════

  return (
    <>
      {/* ═══ CSS Keyframes for Audio Visualizer ═══ */}
      <style>{`
        @keyframes voiceBar1 { 0%,100%{height:6px} 50%{height:22px} }
        @keyframes voiceBar2 { 0%,100%{height:10px} 50%{height:28px} }
        @keyframes voiceBar3 { 0%,100%{height:4px} 50%{height:18px} }
        @keyframes voiceBar4 { 0%,100%{height:8px} 50%{height:24px} }
        @keyframes voiceBar5 { 0%,100%{height:6px} 50%{height:16px} }
        @keyframes voicePulseRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes thinkingDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* ═══ Floating Trigger Button ═══ */}
      <button
        onClick={handleToggle}
        className={cn(
          "group relative flex items-center gap-2 px-2 py-1.5 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all duration-300 border shadow-lg",
          isOpen
            ? "bg-red-600/20 border-red-500/50 text-red-400 hover:bg-red-600/30"
            : "bg-gradient-to-r from-violet-600/20 to-cyan-600/20 border-violet-500/40 text-violet-300 hover:border-violet-400 hover:shadow-violet-500/20 hover:scale-105",
          phase === 'listening' && "animate-pulse border-green-500/50 bg-green-600/20 text-green-400",
          phase === 'speaking' && "border-cyan-500/50 bg-cyan-600/20 text-cyan-400",
          className
        )}
        title={isOpen ? "Đóng Gia sư AI" : "Hỏi Thầy Hậu AI"}
      >
        {isOpen ? (
          <X className="w-4 h-4" />
        ) : (
          <>
            <img src={THAY_HAU_AVATAR} alt="Thầy Hậu" className="w-7 h-7 rounded-full object-cover ring-2 ring-violet-500/50" />
            <span className="hidden sm:inline">Hỏi Thầy AI</span>
          </>
        )}

        {/* Pulse ring when active */}
        {(phase === 'listening' || phase === 'speaking') && (
          <span
            className="absolute inset-0 rounded-2xl border-2 border-current pointer-events-none"
            style={{ animation: 'voicePulseRing 1.5s ease-out infinite' }}
          />
        )}
      </button>

      {/* ═══ Chat Panel (Floating) ═══ */}
      {isOpen && (
        <div className="fixed bottom-16 right-2 left-2 md:bottom-24 md:right-8 md:left-auto md:w-[380px] z-[250] max-h-[45vh] md:max-h-[70vh] bg-slate-950/95 backdrop-blur-xl border border-slate-700/60 rounded-3xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
          <audio ref={globalAudioRef} preload="none" className="hidden" aria-hidden="true" />
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800/60 bg-gradient-to-r from-violet-950/40 to-cyan-950/40">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl overflow-hidden transition-all ring-2",
                phase === 'listening' ? "ring-green-500/60" :
                phase === 'thinking' ? "ring-amber-500/60 animate-pulse" :
                phase === 'speaking' ? "ring-cyan-500/60" :
                "ring-violet-500/40"
              )}>
                <img src={THAY_HAU_AVATAR} alt="Thầy Hậu AI" className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white tracking-tight">Thầy Hậu AI</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  {phase === 'idle' && 'Sẵn sàng hỗ trợ'}
                  {phase === 'listening' && '🎤 Đang nghe em nói...'}
                  {phase === 'thinking' && '🧠 Thầy đang nghĩ...'}
                  {phase === 'speaking' && '🔊 Thầy đang nói...'}
                  {phase === 'error' && '⚠️ Có lỗi xảy ra'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[120px]">
            {chatHistory.length === 0 && phase === 'idle' && (
              <div className="text-center py-6 space-y-3">
                <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden ring-2 ring-violet-500/30 shadow-lg shadow-violet-500/10">
                  <img src={THAY_HAU_AVATAR} alt="Thầy Hậu AI" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-bold text-white">Xin chào em! 👋</p>
                <p className="text-xs text-slate-500 leading-relaxed px-4">
                  Bấm nút bên dưới rồi hỏi Thầy bất kỳ điều gì về câu hỏi này nhé!
                </p>
                {!isSpeechSupported && (
                  <p className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mx-2">
                    ⚠️ Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome / Edge.
                  </p>
                )}
              </div>
            )}

            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "max-w-[95%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                  msg.role === 'student'
                    ? "ml-auto bg-violet-600/20 border border-violet-500/30 text-violet-100 rounded-br-md"
                    : "mr-auto bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-bl-md"
                )}
              >
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <img src={THAY_HAU_AVATAR} alt="" className="w-4 h-4 rounded-full" />
                    <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-wider">Thầy Hậu AI</span>
                  </div>
                )}
                <div className="[&_.katex]:!text-sm [&_.katex-display]:!my-1 [&_p]:mb-0">
                  <MathRenderer content={msg.text} />
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {phase === 'thinking' && (
              <div className="mr-auto bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-md px-5 py-4 flex items-center gap-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 bg-amber-400 rounded-full"
                    style={{ animation: `thinkingDot 1.4s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            )}

            {/* Live transcript */}
            {phase === 'listening' && transcript && (
              <div className="ml-auto max-w-[85%] px-4 py-3 rounded-2xl rounded-br-md bg-green-600/10 border border-green-500/30 text-green-200 text-sm italic">
                {transcript}...
              </div>
            )}

            {/* Error */}
            {phase === 'error' && errorMsg && (
              <div className="mx-auto max-w-[95%] px-4 py-3 rounded-2xl bg-red-600/10 border border-red-500/30 text-red-300 text-xs text-center">
                {errorMsg}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* ═══ Bottom Action Bar ═══ */}
          <div className="border-t border-slate-800/60 p-4 bg-slate-950/80">
            <div className="flex items-center gap-3">
              {/* Text Input Row */}
              <form onSubmit={handleTextSubmit} className="flex-1 relative">
                <input
                  type="text"
                  value={inputText}
                  disabled={phase === 'thinking'}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Hỏi thầy bằng chữ..."
                  className="w-full bg-slate-900 border border-slate-700 text-sm text-white px-4 py-3 rounded-2xl focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all pr-12"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || phase === 'thinking'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-violet-400 hover:text-violet-300 disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {/* Central Action Button — Avatar + Mic overlay (Minimized for layout) */}
              <button
                onClick={handleMicClick}
                title={phase === 'speaking' ? "Dừng Đọc" : "Bật Mic Chấm Hỏi"}
                className={cn(
                  "relative w-[48px] h-[48px] shrink-0 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl overflow-hidden",
                  phase === 'listening'
                    ? "ring-2 ring-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)] scale-105"
                    : phase === 'thinking'
                      ? "ring-2 ring-amber-500/50 cursor-wait opacity-80"
                      : phase === 'speaking'
                        ? "ring-2 ring-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                        : "ring-2 ring-violet-500/50 hover:ring-violet-400 hover:scale-105 active:scale-95 shadow-violet-500/20",
                )}
              >
                {/* Avatar background */}
                <img src={THAY_HAU_AVATAR} alt="Thầy Hậu AI" className="w-full h-full object-cover" />

                {/* State overlay icon */}
                <div className={cn(
                  "absolute bottom-0 right-0 w-4 h-4 rounded-full flex items-center justify-center border border-slate-950",
                  phase === 'listening' ? "bg-red-600" :
                  phase === 'thinking' ? "bg-amber-600 animate-pulse" :
                  phase === 'speaking' ? "bg-cyan-600" :
                  "bg-violet-600"
                )}>
                  {phase === 'listening' ? (
                    <MicOff className="w-2.5 h-2.5 text-white" />
                  ) : phase === 'speaking' ? (
                    <Volume2 className="w-2.5 h-2.5 text-white" />
                  ) : (
                    <Mic className="w-2.5 h-2.5 text-white" />
                  )}
                </div>
              </button>
            </div>

            <p className="text-[9px] text-slate-600 text-center mt-3 font-medium flex items-center justify-center gap-1">
              {phase === 'idle' && 'Gõ chữ hoặc ấn biểu tượng Mic để hỏi'}
              {phase === 'listening' && <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Đang ghi âm (ấn Mic để tắt)</>}
              {phase === 'thinking' && 'Thầy đang suy nghĩ...'}
              {phase === 'speaking' && 'Ấn Mic để tắt tiếng thầy giảng'}
              {phase === 'error' && 'Gõ văn bản nếu Mic bị lỗi'}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default VoiceTutorButton;
