import re

file_path = 'src/components/VoiceTutorButton.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace("import { Mic, MicOff, X, Send } from 'lucide-react';", "import { X, Send } from 'lucide-react';")

# 2. Type
content = content.replace("type TutorPhase = 'idle' | 'listening' | 'thinking' | 'error';", "type TutorPhase = 'idle' | 'thinking' | 'error';")

# 3. Detect Speech Recognition API
content = re.sub(r'// ── Detect Speech Recognition API ──.*?const SpeechRecognitionAPI.*?: null;', '', content, flags=re.DOTALL)

# 4. States & Refs
content = re.sub(r'\s*const \[transcript, setTranscript\] = useState\(\'\'\);', '', content)
content = re.sub(r'\s*const recognitionRef = useRef<any>\(null\);', '', content)
content = re.sub(r'\s*const transcriptRef = useRef<string>\(\'\'\);', '', content)
content = re.sub(r'\s*const isSpeechSupported = !!SpeechRecognitionAPI;', '', content)

# 5. Cleanup on unmount
content = content.replace('recognitionRef.current?.abort?.();', '')
content = content.replace('recognitionRef.current?.stop?.();', '')

# 6. startListening and stopListening
content = re.sub(r'// ══════════════════════════════════════════\s*//  START LISTENING \(STT only — không TTS\)\s*// ══════════════════════════════════════════.*?const stopListening = useCallback\(\(\) => \{.*?\}, \[\]\);', '', content, flags=re.DOTALL)

# 7. handleMicClick
content = re.sub(r'const handleMicClick = useCallback\(\(\) => \{.*?\}, \[phase, cooldownRemaining, startListening, stopListening\]\);', '', content, flags=re.DOTALL)

# 8. processWithAI & handleClose
content = content.replace("setTranscript('');", "")

# 9. CSS Keyframes
content = re.sub(r'@keyframes voicePulseRing \{.*?\}', '', content, flags=re.DOTALL)

# 10. Floating Trigger Button
content = content.replace('phase === \'listening\' && "animate-pulse border-green-500/50 bg-green-600/20 text-green-400",', '')
content = re.sub(r'\{\/\* Pulse ring when listening \*\/\}\s*\{phase === \'listening\' && \(.*?\}\)', '', content, flags=re.DOTALL)

# 11. Header / Avatar ring
content = content.replace('phase === \'listening\' ? "ring-green-500/70" :', '')
content = content.replace("{phase === 'listening' && '🎤 Đang nghe...'}", "")

# 12. Banner
content = re.sub(r'\{!isSpeechSupported && \(.*?\)\}', '', content, flags=re.DOTALL)
content = content.replace('Gõ câu hỏi hoặc bấm 🎤 để nói', 'Gõ câu hỏi bên dưới')

# 13. Live transcript
content = re.sub(r'\{\/\* Live transcript khi đang ghi âm \*\/\}\s*\{phase === \'listening\' && transcript && \(.*?\)\}', '', content, flags=re.DOTALL)

# 14. Action Bar / Mic button
content = re.sub(r'\{\/\* Mic button \*\/\}\s*\{isSpeechSupported && \(.*?\)\}', '', content, flags=re.DOTALL)

# 15. Input placeholder
content = re.sub(r'phase === \'listening\' \? \'Đang nghe giọng nói\.\.\.\'\s*:', '', content)

# 16. Bottom text
content = re.sub(r'\{phase === \'listening\' && <><span.*?Đang ghi âm\.\.\. \(ấn lại Mic để gửi\)<\/>\}', '', content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done modifying VoiceTutorButton.tsx')
