import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../lib/utils';
import { voiceAITutor, TutorMessage } from '../services/geminiService';
import { Mic, MicOff, X, Send } from 'lucide-react';
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

  // ── Cooldown giữa các lượt hỏi ──
  const COOLDOWN_SECS = 20;
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Quy định: HS phải xác nhận trước khi bắt đầu ──
  const [rulesAccepted, setRulesAccepted] = useState(false);

  // ── Socratic multi-turn memory ──
  // Lưu lịch sử hội thoại theo định dạng Gemini API (role: user/model).
  // Được reset mỗi khi đóng panel để không lẫn ngữ cảnh giữa các câu hỏi.
  const [apiHistory, setApiHistory] = useState<TutorMessage[]>([]);
  // Ref để processWithAI luôn đọc được history mới nhất (tránh stale closure)
  const apiHistoryRef = useRef<TutorMessage[]>([]);

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
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ── Cooldown countdown ticker ──
  const startCooldown = useCallback(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setCooldownRemaining(COOLDOWN_SECS);
    cooldownRef.current = setInterval(() => {
      setCooldownRemaining(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
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

  // ── Đồng bộ apiHistory → apiHistoryRef để tránh stale closure ──
  useEffect(() => {
    apiHistoryRef.current = apiHistory;
  }, [apiHistory]);

  // ══════════════════════════════════════════
  //  PROCESS WITH AI — Multi-turn Socratic
  // ══════════════════════════════════════════
  const processWithAI = useCallback(async (studentText: string) => {
    setPhase('thinking');
    setTranscript('');

    // Snapshot history tại thời điểm gửi (đọc qua ref, luôn mới nhất)
    const currentHistory = apiHistoryRef.current;

    setChatHistory(prev => [...prev, { role: 'student', text: studentText }]);

    try {
      const response = await voiceAITutor(
        questionContent,
        detailedSolution,
        studentText,
        currentHistory  // ← Truyền lịch sử đa lượt vào API
      );

      // ── Append cặp [user, model] vào lịch sử API ──
      const newUserMsg: TutorMessage = {
        role: 'user',
        parts: [{ text: studentText }],
      };
      const newModelMsg: TutorMessage = {
        role: 'model',
        parts: [{ text: response }],
      };
      setApiHistory(prev => [...prev, newUserMsg, newModelMsg]);

      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
      setPhase('idle');
      startCooldown(); // ← Bắt đầu cooldown sau khi AI trả lời xong

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
            turnCount: currentHistory.length / 2 + 1,  // Số lượt hội thoại
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
  }, [questionContent, detailedSolution, startCooldown]);  // apiHistoryRef đọc qua ref — không cần trong deps

  // ══════════════════════════════════════════
  //  CLOSE / RESET
  // ══════════════════════════════════════════
  const handleClose = useCallback(() => {
    recognitionRef.current?.abort?.();
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setPhase('idle');
    setTranscript('');
    setErrorMsg('');
    setIsOpen(false);
    setCooldownRemaining(0);
    setRulesAccepted(false);
    // Reset Socratic memory khi đóng panel — tránh lẫn ngữ cảnh sang câu hỏi khác
    setApiHistory([]);
    apiHistoryRef.current = [];
  }, []);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
      setChatHistory([]);
      setRulesAccepted(false);
      setCooldownRemaining(0);
      // Đảm bảo history sạch khi mở chat mới
      setApiHistory([]);
      apiHistoryRef.current = [];
    }
  }, [isOpen, handleClose]);

  const handleMicClick = useCallback(() => {
    if (cooldownRemaining > 0) return; // Chặn mic trong cooldown
    if (phase === 'listening') {
      stopListening();
    } else if (phase === 'idle' || phase === 'error') {
      startListening();
    }
  }, [phase, cooldownRemaining, startListening, stopListening]);

  const handleTextSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || phase === 'thinking' || cooldownRemaining > 0) return;
    recognitionRef.current?.stop?.();
    const text = inputText.trim();
    setInputText(''); // Clear ngay để tránh double-submit
    processWithAI(text);
  }, [inputText, phase, cooldownRemaining, processWithAI]);

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
            {/* Trạng thái chào mừng / Banner quy định */}
            {chatHistory.length === 0 && phase === 'idle' && (
              !rulesAccepted ? (
                /* ═══ BANNER QUY ĐỊNH ═══ */
                <div className="px-2 py-4 space-y-4">
                  <div className="flex flex-col items-center gap-2 mb-2">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-violet-500/40 shadow-lg">
                      <img src={THAY_HAU_AVATAR} alt="Thầy Hậu AI" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-sm font-black text-white tracking-tight">Chào em! Thầy Hậu đây 👋</p>
                  </div>

                  <div className="bg-violet-950/60 border border-violet-500/30 rounded-2xl p-4 space-y-2.5">
                    <p className="text-[11px] font-black text-violet-300 uppercase tracking-widest mb-1">📋 Quy định sử dụng</p>
                    <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                      <div className="flex items-start gap-2">
                        <span className="text-violet-400 font-black shrink-0 mt-0.5">①</span>
                        <span>Mỗi lượt hỏi, Thầy cần <strong className="text-white">20 giây</strong> để xử lý xong hoàn toàn trước khi em gửi tiếp. Điều này đảm bảo câu trả lời <strong className="text-white">không bị cắt ngắn giữa chừng</strong>.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-cyan-400 font-black shrink-0 mt-0.5">②</span>
                        <span>Thầy dạy theo phương pháp <strong className="text-white">Socratic</strong> — không đưa đáp án thẳng, mà dẫn dắt em tự suy luận.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-400 font-black shrink-0 mt-0.5">③</span>
                        <span>Công thức Vật lý được hiển thị đầy đủ bằng LaTeX — em có thể <strong className="text-white">copy</strong> để dùng trong bài.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-amber-400 font-black shrink-0 mt-0.5">④</span>
                        <span>Nếu câu hỏi chưa rõ , Thầy sẽ hỏi lại trước — em hãy trả lời để Thầy hiểu đúng điểm em đang bí.</span>
                      </div>
                    </div>
                  </div>

                  {!isSpeechSupported && (
                    <p className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2">
                      ⚠️ Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome / Edge hoặc gõ chữ bên dưới.
                    </p>
                  )}

                  <button
                    onClick={() => setRulesAccepted(true)}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-black tracking-wide hover:from-violet-500 hover:to-cyan-500 transition-all shadow-lg shadow-violet-500/20 active:scale-95"
                  >
                    Đã hiểu, bắt đầu hỏi Thầy! 🚀
                  </button>
                </div>
              ) : (
                /* ═══ WELCOME NGẮN SAU KHI CHẤP NHẬN QUY ĐỊNH ═══ */
                <div className="text-center py-4 space-y-2">
                  <p className="text-sm font-bold text-white">Sẵn sàng! Em hỏi đi Thầy nghe f9d0</p>
                  <p className="text-xs text-slate-500 leading-relaxed px-4">
                    Gõ câu hỏi hoặc bấm 🎤 để nói — Thầy sẽ trả lời đầy đủ không ngắt quãng.
                  </p>
                </div>
              )
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

            {/* Cooldown Bar */}
            {cooldownRemaining > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Đang chuẩn bị cho lượt tiếp theo...
                  </span>
                  <span className="text-[10px] font-black text-amber-300">{cooldownRemaining}s</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-1000"
                    style={{ width: `${(cooldownRemaining / COOLDOWN_SECS) * 100}%` }}
                  />
                </div>
                <p className="text-[9px] text-slate-500 text-center mt-1">
                  Em vui lòng chờ {cooldownRemaining} giây để đảm bảo câu trả lời hoàn chỉnh, không ngắt quãng
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">

              {/* Mic button */}
              {isSpeechSupported && (
                <button
                  onClick={handleMicClick}
                  disabled={phase === 'thinking' || cooldownRemaining > 0 || !rulesAccepted}
                  title={cooldownRemaining > 0 ? `Chờ ${cooldownRemaining}s nữa` : phase === 'listening' ? "Dừng & Gửi" : "Nói câu hỏi"}
                  className={cn(
                    "relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg overflow-hidden border-2",
                    phase === 'listening'
                      ? "border-red-500 bg-red-600/20 shadow-red-500/30 scale-105"
                      : phase === 'thinking' || cooldownRemaining > 0 || !rulesAccepted
                        ? "border-slate-700 opacity-40 cursor-not-allowed"
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
                  disabled={phase === 'thinking' || cooldownRemaining > 0 || !rulesAccepted}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    !rulesAccepted ? 'Hãy đọc và xác nhận quy định trước...'
                    : cooldownRemaining > 0 ? `Đợi ${cooldownRemaining}s rồi hỏi tiếp nhé...`
                    : phase === 'listening' ? 'Đang nghe giọng nói...'
                    : 'Gõ câu hỏi cho Thầy...'
                  }
                  className="w-full bg-slate-900 border border-slate-700 text-sm text-white px-4 py-2.5 rounded-2xl focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all pr-10"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || phase === 'thinking' || cooldownRemaining > 0 || !rulesAccepted}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-violet-400 hover:text-violet-300 disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

            <p className="text-[9px] text-slate-600 text-center mt-2 font-medium">
              {cooldownRemaining > 0 && <><span className="text-amber-500 font-black">⚡ Hệ thống đang chuẩn bị</span> — trả lời tiếp sau {cooldownRemaining}s</>}
              {cooldownRemaining === 0 && phase === 'idle' && 'Câu trả lời hiển thị đầy đủ bằng text + công thức'}
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
