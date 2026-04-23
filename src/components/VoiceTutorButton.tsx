import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import { voiceAITutor } from '../services/geminiService';
import { Mic, MicOff, X, Send, MessageCircle } from 'lucide-react';
import MathRenderer from '../lib/MathRenderer';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ── Avatar Thầy Hậu 3D ──
const THAY_HAU_AVATAR = '/thay-hau-avatar.png';

// ============================================================
// VOICE TUTOR BUTTON — Gia sư AI "Thầy Hậu"
// ============================================================
// Chế độ: TEXT-ONLY (không TTS, không đọc giọng)
// 1. Speech-to-Text (Web Speech API) — Ghi nhận giọng nói, hiện thành text
// 2. Text input — Học sinh gõ câu hỏi
// 3. AI Processing via Gemini Flash — Trả lời đầy đủ bằng text + LaTeX
// 4. MathRenderer — Render công thức chuẩn tuyệt đối, không lỗi font
// 5. Firestore logging — Ghi log ai_chat_logs cho Admin theo dõi
// ============================================================

interface VoiceTutorButtonProps {
  questionContent: string;
  detailedSolution?: string | null;
  className?: string;
}

type TutorPhase = 'idle' | 'listening' | 'thinking' | 'error';

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
  const [errorMsg, setErrorMsg] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'student' | 'ai'; text: string }[]>([]);
  const [inputText, setInputText] = useState('');

  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<string>('');

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, phase]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
    };
  }, []);

  const isSpeechSupported = !!SpeechRecognitionAPI;

  // ══════════════════════════════════════════
  //  START LISTENING (STT only — không TTS)
  // ══════════════════════════════════════════
  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setErrorMsg('Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.');
      setPhase('error');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'vi-VN';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setPhase('listening');
      setTranscript('');
      transcriptRef.current = '';
      setErrorMsg('');
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
      const combined = finalText || interimText;
      setTranscript(combined);
      transcriptRef.current = combined;
    };

    recognition.onend = () => {
      const currentTranscript = transcriptRef.current;
      if (currentTranscript.trim()) {
        processWithAI(currentTranscript.trim());
      } else {
        setPhase('idle');
      }
    };

    recognition.onerror = (event: any) => {
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
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      setErrorMsg('Không thể bật mic. Hãy kiểm tra quyền truy cập Microphone.');
      setPhase('error');
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop?.();
  }, []);

  // ══════════════════════════════════════════
  //  PROCESS WITH AI — Text-only response
  // ══════════════════════════════════════════
  const processWithAI = useCallback(async (studentText: string) => {
    setPhase('thinking');
    setTranscript('');
    setChatHistory(prev => [...prev, { role: 'student', text: studentText }]);

    try {
      const response = await voiceAITutor(
        questionContent,
        detailedSolution,
        studentText
      );

      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
      setPhase('idle');

      // ── Ghi log lên Firestore ──
      try {
        const user = auth.currentUser;
        if (user) {
          addDoc(collection(db, 'ai_chat_logs'), {
            studentId: user.uid,
            studentName: user.displayName || user.email || 'Ẩn danh',
            questionContent,
            studentChat: studentText,
            aiResponse: response,
            timestamp: serverTimestamp(),
          });
        }
      } catch (logErr) {
        // Bỏ qua lỗi log, không ảnh hưởng UX
      }
    } catch (error) {
      setErrorMsg('AI đang gặp sự cố. Em thử lại sau nhé!');
      setPhase('error');
    }
  }, [questionContent, detailedSolution]);

  // ══════════════════════════════════════════
  //  CLOSE / RESET
  // ══════════════════════════════════════════
  const handleClose = useCallback(() => {
    recognitionRef.current?.abort?.();
    setPhase('idle');
    setTranscript('');
    setErrorMsg('');
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
      setChatHistory([]);
    }
  }, [isOpen, handleClose]);

  const handleMicClick = useCallback(() => {
    if (phase === 'listening') {
      stopListening();
    } else if (phase === 'idle' || phase === 'error') {
      startListening();
    }
  }, [phase, startListening, stopListening]);

  const handleTextSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || phase === 'thinking') return;
    recognitionRef.current?.stop?.();
    processWithAI(inputText.trim());
    setInputText('');
  }, [inputText, phase, processWithAI]);

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════
  return (
    <>
      {/* ═══ CSS Keyframes ═══ */}
      <style>{`
        @keyframes thinkingDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes voicePulseRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
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

        {/* Pulse ring when listening */}
        {phase === 'listening' && (
          <span
            className="absolute inset-0 rounded-2xl border-2 border-current pointer-events-none"
            style={{ animation: 'voicePulseRing 1.5s ease-out infinite' }}
          />
        )}
      </button>

      {/* ═══ Chat Panel ═══ */}
      {isOpen && (
        <div className="fixed bottom-16 right-2 left-2 md:bottom-24 md:right-8 md:left-auto md:w-[420px] z-[250] max-h-[55vh] md:max-h-[72vh] bg-slate-950/97 backdrop-blur-xl border border-slate-700/60 rounded-3xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 bg-gradient-to-r from-violet-950/40 to-cyan-950/40 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-xl overflow-hidden ring-2 transition-all",
                phase === 'listening' ? "ring-green-500/70" :
                phase === 'thinking' ? "ring-amber-500/70 animate-pulse" :
                "ring-violet-500/40"
              )}>
                <img src={THAY_HAU_AVATAR} alt="Thầy Hậu AI" className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white tracking-tight">Thầy Hậu AI</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  {phase === 'idle' && 'Sẵn sàng hỗ trợ'}
                  {phase === 'listening' && '🎤 Đang nghe...'}
                  {phase === 'thinking' && '🧠 Thầy đang soạn trả lời...'}
                  {phase === 'error' && '⚠️ Có lỗi xảy ra'}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[100px]">
            {/* Trạng thái chào mừng */}
            {chatHistory.length === 0 && phase === 'idle' && (
              <div className="text-center py-6 space-y-3">
                <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden ring-2 ring-violet-500/30 shadow-lg shadow-violet-500/10">
                  <img src={THAY_HAU_AVATAR} alt="Thầy Hậu AI" className="w-full h-full object-cover" />
                </div>
                <p className="text-sm font-bold text-white">Xin chào em! 👋</p>
                <p className="text-xs text-slate-500 leading-relaxed px-4">
                  Gõ câu hỏi hoặc bấm 🎤 để nói — Thầy sẽ giải thích đầy đủ bằng văn bản và công thức.
                </p>
                {!isSpeechSupported && (
                  <p className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 mx-2">
                    ⚠️ Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome / Edge hoặc gõ chữ bên dưới.
                  </p>
                )}
              </div>
            )}

            {/* Lịch sử chat */}
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "max-w-[96%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                  msg.role === 'student'
                    ? "ml-auto bg-violet-600/20 border border-violet-500/30 text-violet-100 rounded-br-md"
                    : "mr-auto bg-slate-800/80 border border-slate-700/50 text-slate-100 rounded-bl-md"
                )}
              >
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <img src={THAY_HAU_AVATAR} alt="" className="w-4 h-4 rounded-full" />
                    <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">Thầy Hậu AI</span>
                  </div>
                )}
                {/* MathRenderer: render LaTeX $...$ và $$...$$ chuẩn tuyệt đối */}
                <div className="[&_.katex]:!text-sm [&_.katex-display]:!my-2 [&_.katex-display]:overflow-x-auto [&_p]:mb-1 [&_p:last-child]:mb-0">
                  <MathRenderer content={msg.text} />
                </div>
              </div>
            ))}

            {/* Thinking dots */}
            {phase === 'thinking' && (
              <div className="mr-auto bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-md px-5 py-4 flex items-center gap-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 bg-amber-400 rounded-full"
                    style={{ animation: `thinkingDot 1.4s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
                <span className="text-xs text-slate-500 ml-1">Thầy đang soạn câu trả lời...</span>
              </div>
            )}

            {/* Live transcript khi đang ghi âm */}
            {phase === 'listening' && transcript && (
              <div className="ml-auto max-w-[85%] px-4 py-3 rounded-2xl rounded-br-md bg-green-600/10 border border-green-500/30 text-green-200 text-sm italic">
                {transcript}…
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
          <div className="border-t border-slate-800/60 p-3 bg-slate-950/80 flex-shrink-0">
            <div className="flex items-center gap-2">

              {/* Mic button */}
              {isSpeechSupported && (
                <button
                  onClick={handleMicClick}
                  disabled={phase === 'thinking'}
                  title={phase === 'listening' ? "Dừng & Gửi" : "Nói câu hỏi"}
                  className={cn(
                    "relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg overflow-hidden border-2",
                    phase === 'listening'
                      ? "border-red-500 bg-red-600/20 shadow-red-500/30 scale-105"
                      : phase === 'thinking'
                        ? "border-slate-700 opacity-50 cursor-wait"
                        : "border-violet-500/50 hover:border-violet-400 hover:scale-105 bg-slate-900"
                  )}
                >
                  <img src={THAY_HAU_AVATAR} alt="Mic" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                  <div className={cn(
                    "relative z-10 w-5 h-5 rounded-full flex items-center justify-center",
                    phase === 'listening' ? "bg-red-600" : "bg-violet-600"
                  )}>
                    {phase === 'listening'
                      ? <MicOff className="w-3 h-3 text-white" />
                      : <Mic className="w-3 h-3 text-white" />
                    }
                  </div>
                  {phase === 'listening' && (
                    <span
                      className="absolute inset-0 rounded-full border-2 border-red-500 pointer-events-none"
                      style={{ animation: 'voicePulseRing 1.5s ease-out infinite' }}
                    />
                  )}
                </button>
              )}

              {/* Text input */}
              <form onSubmit={handleTextSubmit} className="flex-1 relative">
                <input
                  type="text"
                  value={inputText}
                  disabled={phase === 'thinking'}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={phase === 'listening' ? 'Đang nghe giọng nói...' : 'Gõ câu hỏi cho Thầy...'}
                  className="w-full bg-slate-900 border border-slate-700 text-sm text-white px-4 py-2.5 rounded-2xl focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all pr-10"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || phase === 'thinking'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-violet-400 hover:text-violet-300 disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

            <p className="text-[9px] text-slate-600 text-center mt-2 font-medium">
              {phase === 'idle' && 'Câu trả lời hiển thị đầy đủ bằng text + công thức'}
              {phase === 'listening' && <><span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1" />Đang ghi âm... (ấn lại Mic để gửi)</>}
              {phase === 'thinking' && 'Thầy đang soạn câu trả lời chi tiết...'}
              {phase === 'error' && 'Gõ văn bản bên trên nếu Mic bị lỗi'}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default VoiceTutorButton;
