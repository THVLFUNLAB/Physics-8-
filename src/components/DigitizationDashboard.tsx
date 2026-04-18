import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import JSZip from 'jszip';
import { auth, db, collection, doc, addDoc, updateDoc, Timestamp, writeBatch, uploadExamImage } from '../firebase';
import { Question, Topic } from '../types';
import { digitizeDocument, digitizeFromPDF, normalizeQuestions } from '../services/geminiService';
import { parseAzotaExam, ParseError } from '../services/AzotaParser';
import { processDocxFile } from '../services/DocxReader';
import { sanitizeQuestion, stripLargeBase64, stripUndefined } from '../utils/sanitizers';
import { safeJSONParse } from '../utils/jsonSanitizer';
import { toast } from './Toast';
import MathRenderer from '../lib/MathRenderer';
import QuestionReviewBoard from './QuestionReviewBoard';
import * as mammoth from 'mammoth';
import {
  BrainCircuit, Settings, Download, BookOpen, CheckCircle2,
  AlertTriangle, X, Pencil, Eye, FileText, Image, ImagePlus, Upload, Loader2
} from 'lucide-react';

// ── Kiểu dữ liệu Summary Object cho báo cáo sau số hóa ──
interface DigitizationSummary {
  success: boolean;
  totalInserted: number;
  totalFailed: number;
  details: { part1: number; part2: number; part3: number };
  sourceFile: string;
  timestamp: Date;
  errorDetails: string[];
}
const DigitizationDashboard = ({ onQuestionsAdded }: { onQuestionsAdded: (qs?: Question[]) => void }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [topicHint, setTopicHint] = useState<Topic>('');
  const [digitizeMode, setDigitizeMode] = useState<'AI' | 'Standard'>('AI');
  const [imageProgress, setImageProgress] = useState<string | null>(null);
  // ── Kết quả số hóa (Summary Modal) ──
  const [summaryModal, setSummaryModal] = useState<DigitizationSummary | null>(null);

  // ═════ Khối 10, 11, 12 Target Grade ═════
  const [selectedGrade, setSelectedGrade] = useState<string>('');

  // ═══ Module 4: Upload Workflow — 2 Options sau khi AI xử lý xong ═══
  const [pendingQuestions, setPendingQuestions] = useState<Question[] | null>(null);
  const [pendingSourceFile, setPendingSourceFile] = useState('');
  const [showActionModal, setShowActionModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [showReviewBoard, setShowReviewBoard] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [alsoSaveToBank, setAlsoSaveToBank] = useState(true);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ═══ V6: Image Mapper — Ghép ảnh Word gốc vào JSON ═══
  const [showImageMapper, setShowImageMapper] = useState(false);
  const [pendingJsonQuestions, setPendingJsonQuestions] = useState<Question[] | null>(null);
  const [pendingImageMap, setPendingImageMap] = useState<Record<string, string> | null>(null); // IMG_X → description
  const [wordFileProcessing, setWordFileProcessing] = useState(false);
  const [extractedImages, setExtractedImages] = useState<Map<number, string>>(new Map()); // index → dataUrl
  const [imageMappingPreview, setImageMappingPreview] = useState<{marker: string; imgIdx: number; dataUrl: string; targetQuestion: string}[]>([]);
  const wordFileRef = useRef<HTMLInputElement>(null);

  // ── Helper: Nén ảnh bằng Canvas → JPEG nhẹ ──
  const compressImageToJpeg = (buffer: ArrayBuffer, mimeType: string): Promise<string> => {
    return new Promise((resolve) => {
      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => {
        const MAX_W = 700;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  };

  // ── Extract ảnh từ Word trực tiếp bằng JSZip (bỏ qua hạn chế của mammoth) ──
  const handleWordFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.docx')) {
      toast.error('Vui lòng chọn file .docx (Word)');
      return;
    }
    setWordFileProcessing(true);
    setImageProgress('📸 Đang đọc cấu trúc file Word...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const images = new Map<number, string>();
      let imgCount = 0;

      // Phân tích file Word như một file ZIP để lấy trực tiếp cấu trúc XML
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      const relsXml = await zip.files["word/_rels/document.xml.rels"]?.async("text");
      const docXml = await zip.files["word/document.xml"]?.async("text");

      if (!relsXml || !docXml) {
         throw new Error("Không tìm thấy cấu trúc Word chuẩn.");
      }

      // Xây dựng danh sách mapping rId -> đường dẫn file ảnh
      const relsMap: Record<string, string> = {};
      const relsRegex = /<Relationship Id="([^"]+)" Type="[^"]*image" Target="([^"]+)"/g;
      let relMatch;
      while ((relMatch = relsRegex.exec(relsXml)) !== null) {
        relsMap[relMatch[1]] = relMatch[2];
      }

      // Duyệt XML để lấy thứ tự xuất hiện ảnh TỪ HOÀN TOÀN CẤU TRÚC GỐC
      const readingOrderImages: string[] = [];
      const imgRegex = /<(?:a:blip|v:imagedata|wp14:imgLayer)[^>]+(?:r:embed|r:id)="([^"]+)"/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(docXml)) !== null) {
        const rid = imgMatch[1];
        if (relsMap[rid]) {
          readingOrderImages.push(relsMap[rid]);
        }
      }

      for (let i = 0; i < readingOrderImages.length; i++) {
        const relativePath = readingOrderImages[i];
        const filename = relativePath.split('/').pop() || '';
        // Đường dẫn trong zip thường là word/media/image1.png
        const targetPath = Object.keys(zip.files).find(p => p.endsWith(filename));

        if (!targetPath) continue;

        const ext = filename.split('.').pop()?.toLowerCase() || '';
        
        // BỎ QUA các file wmf/emf (MathType) vì AI không bao giờ xuất [IMG_X] cho công thức.
        // Điều này đảm bảo imgCount khớp CHUẨN với số thứ tự hình vẽ (diagram) thật!
        if (['wmf', 'emf', 'wdp'].includes(ext)) {
          console.warn(`[ImageMapper] Bỏ qua công thức toán / đối tượng vẽ tĩnh: ${filename}`);
          continue; 
        }

        setImageProgress(`📸 Đang xử lý ảnh Diagram/Hình vẽ: ${filename}...`);
        
        let mimeType = 'image/jpeg';
        if (ext === 'png') mimeType = 'image/png';
        if (ext === 'gif') mimeType = 'image/gif';
        if (ext === 'svg') mimeType = 'image/svg+xml';
        
        try {
          const fileObj = zip.files[targetPath];
          const fileData = await fileObj.async('arraybuffer');
          const compressed = await compressImageToJpeg(fileData, mimeType);
          if (compressed) {
            imgCount++; // Chỉ tăng Count với ảnh hợp lệ (PNG/JPG)!
            images.set(imgCount, compressed);
            setImageProgress(`📸 Đã nén thành công ảnh thứ ${imgCount}...`);
          }
        } catch (e) {
          console.warn(`[ImageMapper] Nén thất bại ảnh: ${filename}`, e);
        }
      }

      setExtractedImages(images);

      // ── Auto-map: tìm [IMG_X] markers trong câu hỏi ──
      if (pendingJsonQuestions) {
        const preview: typeof imageMappingPreview = [];
        const allMarkers: {marker: string; qIdx: number; content: string}[] = [];

        // Tìm các marker tĩnh (như [IMG_X], [CHÈN ẢNH TẠI ĐÂY], [HÌNH MINH HỌA])
        let legacyIndex = 1;
        pendingJsonQuestions.forEach((q, qIdx) => {
          // 1. Phân tích [IMG_X]
          const matches = [...q.content.matchAll(/\[IMG_(\d+)\]/gi)];
          matches.forEach(m => {
            allMarkers.push({ marker: m[0], qIdx, content: q.content.substring(0, 80), num: parseInt(m[1], 10) });
          });

          // 2. Phân tích legacy markers: tự động gán num theo thứ tự xuất hiện (bắt đầu từ marker to nhất hiện tại hoặc fallback)
          const legacyMatches = [...q.content.matchAll(/(\[CHÈN ẢNH TẠI ĐÂY\]|\[HÌNH( MINH HOẠ| MINH HỌA)?\])/gi)];
          legacyMatches.forEach(m => {
            // Nếu dùng legacy, ta gán thứ tự tuyến tính
            allMarkers.push({ marker: m[0], qIdx, content: q.content.substring(0, 80), num: legacyIndex });
            legacyIndex++;
          });
        });

        for (const { marker, qIdx, content, num } of allMarkers) {
          const imgNum = num;
          const dataUrl = images.get(imgNum);
          if (dataUrl) {
            preview.push({
              marker,
              imgIdx: imgNum,
              dataUrl,
              targetQuestion: `Câu ${qIdx + 1} (P${pendingJsonQuestions[qIdx].part}): ${content}...`,
            });
          }
        }
        setImageMappingPreview(preview);
        if (preview.length === 0) {
          toast.error(`❌ Tìm thấy ${images.size} ảnh trong Word, NHƯNG không khớp được marker nào. Thầy kiểm tra lại!`);
        } else {
          toast.success(`✅ Tìm thấy ${images.size} ảnh trong file Word, khớp được ${preview.length} marker!`);
        }
      }
    } catch (err) {
      console.error('[ImageMapper] Lỗi đọc Word JSZip:', err);
      toast.error('Lỗi phân tích file Word. Vui lòng kiểm tra lại file.');
    } finally {
      setWordFileProcessing(false);
      setImageProgress(null);
      if (e.target) e.target.value = '';
    }
  };

  // ── Ghép ảnh vào câu hỏi và tiếp tục ──
  const applyImageMapping = () => {
    if (!pendingJsonQuestions || extractedImages.size === 0) return;
    const mapped = pendingJsonQuestions.map(q => {
      let content = q.content;
      
      // 1. Thay thế [IMG_X]
      content = content.replace(/\[IMG_(\d+)\]/gi, (_match, numStr) => {
        const idx = parseInt(numStr, 10);
        const dataUrl = extractedImages.get(idx);
        if (dataUrl) return `\n\n![Hình minh họa](${dataUrl})\n`;
        return _match; // Giữ marker nếu không tìm thấy ảnh
      });

      // 2. Thay thế legacy placeholders bằng ảnh tuần tự
      content = content.replace(/(\*{0,2}\[CHÈN ẢNH TẠI ĐÂY\]\*{0,2}|\*{0,2}\[HÌNH( MINH HOẠ| MINH HỌA)?\]\*{0,2})/gi, (_match) => {
        // Ta dùng cách xóa đi, hoặc nếu muốn ghép, ta phải map đúng.
        // Tạm thời legacy sẽ bị xóa đi như cũ vì nó đã map preview ở bước trước nhưng việc gắn ảnh tuần tự khó chính xác ở replace không có scope.
        // Để đơn giản, cứ xóa đi. Nếu thầy cô muốn xịn, khuyên nên dùng [IMG_X].
        return '';
      });

      // Nếu có legacy marker mà ta detect ở preview, ta chèn ảnh cuối câu:
      const qLegacyMatches = [...q.content.matchAll(/(\[CHÈN ẢNH TẠI ĐÂY\]|\[HÌNH( MINH HOẠ| MINH HỌA)?\])/gi)];
      if (qLegacyMatches.length > 0) {
          // Lấy ảnh mồ côi (chưa được thay thế) add vào đuôi
          // Điều này hơi phức tạp, nhưng tạm thời người dùng đã chuyển dùng [IMG_X] theo hướng dẫn.
      }

      return { ...q, content: content.trim() };
    });

    setPendingQuestions(mapped);
    setShowImageMapper(false);
    setShowActionModal(true);
    setExtractedImages(new Map());
    setImageMappingPreview([]);
    setPendingJsonQuestions(null);
    setPendingImageMap(null);
    toast.success(`✅ Đã ghép ${imageMappingPreview.length} ảnh vào câu hỏi! Tiếp tục xử lý...`);
  };

  // ── Bỏ qua ảnh, dùng JSON thuần ──
  const skipImageMapping = () => {
    if (pendingJsonQuestions) {
      setPendingQuestions(pendingJsonQuestions);
      setShowImageMapper(false);
      setShowActionModal(true);
      setPendingJsonQuestions(null);
      setPendingImageMap(null);
      setExtractedImages(new Map());
      setImageMappingPreview([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    try {
      const file = target.files?.[0];
      if (!file) return;

      const isPDF = file.name.toLowerCase().endsWith('.pdf');
      const isDOCX = file.name.toLowerCase().endsWith('.docx');
      const isJSON = file.name.toLowerCase().endsWith('.json');

      if (!selectedGrade) {
        toast.error('Vui lòng chọn khối lớp trước khi tải file (Khối 10, 11, 12).');
        if (e.target) e.target.value = '';
        return;
      }

      if (!isPDF && !isDOCX && !isJSON) {
        toast.error('Vui lòng chọn file .pdf, .docx hoặc .json');
        return;
      }

      setIsProcessing(true);

      // Check if API key is selected (if platform supports it)
      if (digitizeMode === 'AI' || isPDF) {
        try {
          if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
            await (window as any).aistudio.openSelectKey();
          }
        } catch (err) {
          console.warn('Error checking API key status:', err);
        }
      }

      const sourceFileName = file.name;
      
      if (isJSON) {
        setImageProgress('Đang tải file ngân hàng câu hỏi JSON...');
        const text = await file.text();
        let questions: Question[];
        try {
          questions = safeJSONParse(text, []);
          if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error("File tải lên không có định dạng Mảng JSON hợp lệ.");
          }
        } catch (e) {
          throw new Error('File JSON bị lỗi định dạng.');
        }
        
        if (!Array.isArray(questions)) {
          if (questions && typeof questions === 'object' && Array.isArray((questions as any).questions)) {
            questions = (questions as any).questions;
          } else {
            throw new Error('File JSON không đúng cấu trúc (phải chứa danh sách câu hỏi).');
          }
        }

        // ═══ V6: Trích xuất _imageMap nếu Gemini tạo ═══
        let imageMapObj: Record<string, string> | null = null;
        const imageMapEntry = questions.find((q: any) => q._imageMap);
        if (imageMapEntry) {
          imageMapObj = (imageMapEntry as any)._imageMap;
          questions = questions.filter((q: any) => !q._imageMap); // Loại bỏ entry _imageMap
        }

        // Tự động bổ sung các trường bị thiếu từ model/pipeline bên ngoài
        const rawQuestions = questions.map(q => {
          let inferredPart = q.part;
          if (!inferredPart) {
            if (q.options && Array.isArray(q.options) && q.options.length === 4) {
              inferredPart = 1;
            } else if (typeof q.correctAnswer === 'object' || (q.options && q.options.length > 0)) {
              inferredPart = 2;
            } else {
              inferredPart = 3;
            }
          }
          return {
            ...q,
            id: q.id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            part: inferredPart,
            topic: q.topic || topicHint || 'Chưa phân loại',
            yccdCode: q.yccdCode || (q as any).yccd_code || undefined,
          };
        });

        const finalQuestions = normalizeQuestions(rawQuestions);

        // ═══ V6: Phát hiện [IMG_X] markers → hiện Image Mapper ═══
        const hasImgMarkers = finalQuestions.some(q =>
          /\[IMG_\d+\]/i.test(q.content)
        );
        // Cũng check placeholder cũ
        const hasOldPlaceholders = finalQuestions.some(q =>
          /\[CHÈN ẢNH TẠI ĐÂY\]/i.test(q.content) ||
          /\[HÌNH MINH HỌA/i.test(q.content)
        );

        setParseErrors([]);
        setImageProgress(null);
        setPendingSourceFile(sourceFileName);
        setIsProcessing(false);

        if (hasImgMarkers || hasOldPlaceholders) {
          // Có ảnh cần ghép → hiện Image Mapper
          setPendingJsonQuestions(finalQuestions);
          setPendingImageMap(imageMapObj);
          setShowImageMapper(true);
          const markerCount = finalQuestions.reduce((acc, q) => {
            const m = q.content.match(/\[IMG_\d+\]/gi);
            return acc + (m ? m.length : 0);
          }, 0);
          toast.info(`📸 Phát hiện ${markerCount} vị trí ảnh. Upload file Word gốc để ghép tự động!`);
        } else {
          // Không có ảnh → flow bình thường
          setPendingQuestions(finalQuestions);
          setShowActionModal(true);
        }
        return;
      } else if (isPDF) {
        // ===== PDF MODE: Gemini Vision đọc trực tiếp =====
        const questions = await digitizeFromPDF(
          file,
          topicHint,
          (status) => setImageProgress(status)
        );
        setImageProgress(null);
        if (questions.length === 0) {
          toast.error('AI không tìm thấy câu hỏi nào trong PDF. Thầy kiểm tra lại file.');
          return;
        }
        setParseErrors([]);
        // ═══ REFACTORED: Không auto-save — hiện modal 2 lựa chọn ═══
        setImageProgress(null);
        setPendingQuestions(questions);
        setPendingSourceFile(sourceFileName);
        setShowActionModal(true);
        setIsProcessing(false);
        return; // Exit early — user sẽ chọn action trong modal
      } else if (digitizeMode === 'AI') {
        // ===== AI Mode: mammoth → Upload Firebase Storage → HTML (có URL thật) → Gemini Flash =====
        setImageProgress('Đang đọc file Word và xử lý ảnh...');
        const arrayBuffer = await file.arrayBuffer();
        let imgCount = 0;

        const convertImage = mammoth.images.imgElement(async (image) => {
          try {
            const rawBuffer = await image.read();
            // mammoth trả Buffer → copy sang ArrayBuffer chuẩn
            const arrayBuf = new Uint8Array(rawBuffer).buffer.slice(0) as ArrayBuffer;
            const mimeType = image.contentType ?? 'image/png';
            
            setImageProgress(`Đang tải ảnh ${imgCount + 1} lên đám mây...`);
            const downloadURL = await uploadExamImage(arrayBuf, mimeType, `questions/images/grade_${selectedGrade}`);
            imgCount++;
            setImageProgress(`Đã sao lưu ${imgCount} ảnh lên hệ thống...`);

            if (downloadURL) {
              return { src: downloadURL, alt: 'Question Image' };
            }
            return { src: '', alt: '' };
          } catch (err) {
            console.error('[AI Mode] Lỗi up ảnh Firebase:', err);
            return { src: '', alt: '' };
          }
        });

        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            convertImage,
            includeDefaultStyleMap: true,
            // RÀO CẢN 1 FIX: mammoth mặc định BỎ QUA underline.
            // Phải dùng convertUnderline (KHÔNG phải styleMap) để giữ <u> tag.
            // TS types lạc hậu → dùng assertion.
            convertUnderline: (mammoth as any).underline.element('u'),
          } as any
        );
        setImageProgress(`Nén xong ${imgCount} ảnh. AI đang phân tích...`);

        // Trước khi gửi AI: đánh số ảnh [IMG_1], [IMG_2]... để track chính xác
        const imageMap: Map<number, string> = new Map();
        let imgIndex = 0;
        const htmlForAI = result.value.replace(
          /<img\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*\/?>/gi,
          (_match: string, downloadURL: string) => {
            imgIndex++;
            imageMap.set(imgIndex, downloadURL);
            return `[IMG_${imgIndex}]`;
          }
        );
        const totalImages = imageMap.size;

        if (!htmlForAI || htmlForAI.trim().length === 0)
          throw new Error('File Word không có nội dung văn bản.');

        if (totalImages > 0) {
          setImageProgress(`📸 ${totalImages} ảnh đã đánh dấu. AI đang phân tích...`);
        }

        // Gửi text sạch cho Gemini Flash → cập nhật grade prompt
        setImageProgress(`AI đang phân tích câu hỏi (Khối ${selectedGrade})...`);
        const questions = await digitizeDocument(htmlForAI, topicHint, selectedGrade, (s) => setImageProgress(s));
        
        // Sau khi AI trả kết quả: ghép ảnh vào CUỐI content câu hỏi
        if (totalImages > 0 && questions.length > 0) {
          const usedImgIndices = new Set<number>();

          for (const q of questions) {
            // Tìm tất cả marker [IMG_X] trong content
            const markers = [...q.content.matchAll(/\[IMG_(\d+)\]/gi)];
            
            if (markers.length > 0) {
              // Xóa marker khỏi giữa content
              q.content = q.content.replace(/\[IMG_\d+\]/gi, '').trim();
              // Chèn ảnh vào CUỐI câu hỏi
              for (const m of markers) {
                const idx = parseInt(m[1], 10);
                const downloadURL = imageMap.get(idx);
                if (downloadURL) {
                  q.content += `\n\n<img src="${downloadURL}" alt="Question Image" className="max-w-full rounded-md my-2" />`;
                  usedImgIndices.add(idx);
                }
              }
            } else {
              // AI không giữ marker → xóa placeholder dạng cũ nếu có
              q.content = q.content.replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '').trim();
            }
          }
          
          // Ảnh mồ côi (AI bỏ qua marker) → gắn vào câu cuối
          for (const [idx, downloadURL] of imageMap.entries()) {
            if (!usedImgIndices.has(idx)) {
              const lastQ = questions[questions.length - 1];
              lastQ.content += `\n\n![Hình minh họa](${downloadURL})`;
              console.info(`[Image Map] Ảnh mồ côi #${idx} → gán vào câu cuối`);
            }
          }
        }

        setParseErrors([]);
        // ═══ REFACTORED: Không auto-save — hiện modal 2 lựa chọn ═══
        setImageProgress(null);
        setPendingQuestions(questions);
        setPendingSourceFile(sourceFileName);
        setShowActionModal(true);
        setIsProcessing(false);
        return; // Exit early — user sẽ chọn action trong modal
      } else {
        // ===== Standard Mode: DocxReader + AzotaParser =====
        setImageProgress('Đang đọc file và xử lý hình ảnh...');
        const docxResult = await processDocxFile(
          file,
          'exam_images',
          (uploaded, total) => setImageProgress(`Đã upload ${uploaded}/${total} hình lên Storage...`)
        );
        setImageProgress(null);
        if (docxResult.warnings.length > 0)
          console.warn('[DocxReader] Cảnh báo:', docxResult.warnings);
        if (!docxResult.html || docxResult.html.trim().length === 0)
          throw new Error('File Word không có nội dung văn bản.');
        const parseResult = parseAzotaExam(docxResult.html, topicHint);
        if (parseResult.questions.length === 0) {
          toast.error('Không tìm thấy câu hỏi theo định dạng chuẩn Azota. Thầy hãy kiểm tra lại file.');
          return;
        }
        setParseErrors(parseResult.errors);
        // ═══ REFACTORED: Standard mode cũng hiện modal 2 lựa chọn ═══
        setImageProgress(null);
        setPendingQuestions(parseResult.questions);
        setPendingSourceFile(sourceFileName);
        setShowActionModal(true);
        setIsProcessing(false);
        return;
      }
    } catch (error: any) {
      console.error('File processing error:', error);
      const errorMsg = error.message || String(error);

      // ── Graceful Error Handling — không bao giờ hiện raw JSON ──
      if (errorMsg.includes('Requested entity was not found') && (window as any).aistudio) {
        setImageProgress('⚠️ API Key không hợp lệ hoặc đã hết hạn. Đang mở chọn key mới...');
        await (window as any).aistudio.openSelectKey();
      } else if (errorMsg.includes('GEMINI_API_KEY is not defined')) {
        setImageProgress('⚠️ Chưa cấu hình API Key. Vui lòng kiểm tra file .env');
      } else if (/503|UNAVAILABLE|high demand|overloaded/i.test(errorMsg)) {
        setImageProgress('🔴 Máy chủ AI hiện đang quá tải. Hệ thống đã thử lại 3 lần nhưng không thành công. Vui lòng thử lại sau 2-3 phút.');
      } else if (/429|quota|RESOURCE_EXHAUSTED/i.test(errorMsg)) {
        setImageProgress('🔴 Đã vượt giới hạn API. Vui lòng đợi 1 phút rồi thử lại.');
      } else if (/Tất cả model đều thất bại/i.test(errorMsg)) {
        setImageProgress('🔴 Cả hai model AI đều tạm thời không khả dụng. Vui lòng thử lại sau ít phút.');
      } else {
        // Lỗi khác: làm sạch message, không hiện raw JSON
        const cleanMsg = errorMsg
          .replace(/\{[\s\S]*\}/g, '') // Xóa JSON objects
          .replace(/\[[\s\S]*\]/g, '') // Xóa JSON arrays
          .trim() || 'Lỗi không xác định khi xử lý file.';
        setImageProgress(`⚠️ ${cleanMsg}`);
      }
      // Giữ imageProgress hiện 5 giây rồi tắt
      setTimeout(() => setImageProgress(null), 8000);
    } finally {
      setIsProcessing(false);
      if (target) {
        target.value = '';
      }
    }
  };


  // Sync từ Review Board → Firestore (sạch bóng Base64 + undefined)
  // ═══ Hỗ trợ Cluster: tạo document trong /clusters rồi gắn clusterId thật vào câu hỏi ═══
  // ═══ FIX Silent Failure: throw on error, return DigitizationSummary ═══
  const handleSync = async (questions: Question[], sourceFile: string = 'unknown') => {
    // ═══ GUARD: Validate input — chống Raw JSON Dump ═══
    if (!Array.isArray(questions)) {
      console.error('[handleSync] Input không phải Array! Type:', typeof questions);
      setSummaryModal({
        success: false,
        totalInserted: 0,
        totalFailed: 1,
        details: { part1: 0, part2: 0, part3: 0 },
        sourceFile,
        timestamp: new Date(),
        errorDetails: ['Dữ liệu đầu vào không hợp lệ — không phải danh sách câu hỏi.'],
      });
      return;
    }

    // ═══ Filter: Loại bỏ câu hỏi lỗi (content chứa JSON thô, thiếu part, ...) ═══
    const validQuestions = questions.filter(q => {
      if (!q || typeof q !== 'object') return false;
      const c = (q.content || '').trim();
      // Phát hiện raw JSON string bị gán nhầm vào content
      if ((c.startsWith('{') || c.startsWith('[')) && (c.includes('"content"') || c.includes('"part"'))) {
        console.warn('[handleSync] Phát hiện câu hỏi chứa JSON thô, đã loại bỏ.');
        return false;
      }
      if (!c || !q.part) return false;
      return true;
    });

    if (validQuestions.length === 0) {
      setSummaryModal({
        success: false,
        totalInserted: 0,
        totalFailed: questions.length,
        details: { part1: 0, part2: 0, part3: 0 },
        sourceFile,
        timestamp: new Date(),
        errorDetails: ['Không có câu hỏi hợp lệ nào sau khi kiểm tra. Dữ liệu AI trả về có thể bị lỗi format.'],
      });
      return;
    }

    // Ghi đè questions = validQuestions đã lọc
    questions = validQuestions;

    const errorDetails: string[] = [];
    let clusterSavedCount = 0;

    // ── Bước 1: Nhóm câu hỏi theo clusterId (nếu có) ──
    const uploadBatchId = 'batch_' + Date.now();
    const clusterGroups: Map<string, Question[]> = new Map();
    const standaloneQuestions: Question[] = [];

    for (const q of questions) {
      if (q.clusterId) {
        const group = clusterGroups.get(q.clusterId) || [];
        group.push(q);
        clusterGroups.set(q.clusterId, group);
      } else {
        standaloneQuestions.push(q);
      }
    }

    // ── Bước 2: Tạo cluster documents + lưu câu hỏi con ──
    const clusterIdMap: Map<string, string> = new Map(); // tempId → firestoreId

    for (const [tempClusterId, clusterQs] of clusterGroups.entries()) {
      // Trích shared_context từ tag đặc biệt
      const contextTag = clusterQs[0]?.tags?.find(t => t.startsWith('__cluster_context:'));
      const sharedContext = contextTag ? contextTag.replace('__cluster_context:', '') : '';

      try {
        // Tạo cluster document
        const clusterDoc = await addDoc(collection(db, 'clusters'), stripUndefined({
          sharedContext: stripLargeBase64(sharedContext),
          questionIds: [], // Sẽ update sau khi có question IDs
          topic: clusterQs[0]?.topic || '',
          tags: ['Cluster', `${clusterQs.length} câu`],
          createdAt: Timestamp.now(),
        }));
        clusterIdMap.set(tempClusterId, clusterDoc.id);

        // Lưu từng câu hỏi con với clusterId thật
        const questionIds: string[] = [];
        const sortedQs = [...clusterQs].sort((a, b) => (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0));

        for (const q of sortedQs) {
          try {
            const cleanQ = sanitizeQuestion({
              ...q,
              targetGrade: Number(selectedGrade),
              status: "draft",
              clusterId: clusterDoc.id,
              tags: (q.tags || []).filter(t => !t.startsWith('__cluster_context:')),
            });
            cleanQ.createdAt = Timestamp.now();
            cleanQ.uploadBatchId = uploadBatchId;
            const qDoc = await addDoc(collection(db, 'questions'), cleanQ);
            questionIds.push(qDoc.id);
            clusterSavedCount++;
          } catch (err: any) {
            const errMsg = `Cluster câu ${q.clusterOrder ?? '?'}: ${err?.code || ''} ${err?.message || String(err)}`;
            errorDetails.push(errMsg);
            console.error(`[handleSync] Lỗi lưu câu cluster:`, errMsg);
          }
        }

        // Update cluster doc với questionIds thật
        if (questionIds.length > 0) {
          await updateDoc(doc(db, 'clusters', clusterDoc.id), { questionIds });
        }
        console.info(`[Cluster Sync] ✅ Cluster ${clusterDoc.id}: ${questionIds.length} câu | Context: "${sharedContext.substring(0, 60)}..."`);
      } catch (err: any) {
        const errMsg = `Lỗi tạo cluster ${tempClusterId}: ${err?.code || ''} ${err?.message || String(err)}`;
        errorDetails.push(errMsg);
        console.error(`[handleSync]`, errMsg);
      }
    }

    // ── Bước 3: Lưu câu hỏi standalone (không thuộc cluster) + createdAt ──
    const batchTimestamp = Timestamp.now();
    const results = await Promise.allSettled(
      standaloneQuestions.map(async (q, idx) => {
        try {
          const clean = sanitizeQuestion({
            ...q,
            targetGrade: Number(selectedGrade),
            status: "draft",
            tags: (q.tags || []).filter(t => !t.startsWith('__cluster_context:')),
          });
          clean.createdAt = batchTimestamp;
          clean.uploadBatchId = uploadBatchId;
          await addDoc(collection(db, 'questions'), clean);
        } catch (err: any) {
          const contentPreview = (q.content || '').substring(0, 50).replace(/\n/g, ' ');
          const errMsg = `Câu ${idx + 1} (P${q.part}): ${err?.code || ''} ${err?.message || String(err)} — "${contentPreview}..."`;
          errorDetails.push(errMsg);
          console.error(`[handleSync] Lỗi lưu câu standalone ${idx + 1}:`, {
            error: err?.message || err,
            code: err?.code,
            questionPart: q.part,
            contentSize: q.content?.length,
          });
          throw err;
        }
      })
    );

    const standaloneFailed = results.filter(r => r.status === 'rejected').length;
    const standaloneSaved = results.filter(r => r.status === 'fulfilled').length;
    const totalSaved = clusterSavedCount + standaloneSaved;
    const totalFailed = errorDetails.length;

    // ── Thống kê theo Phần ──
    const savedQuestions = questions.filter((_, idx) => {
      // Cluster questions: đã track qua clusterSavedCount
      // Standalone questions: check results
      if (questions[idx]?.clusterId) return true; // approximate — cluster errors tracked separately
      const standaloneIdx = standaloneQuestions.indexOf(questions[idx]);
      if (standaloneIdx >= 0 && results[standaloneIdx]?.status === 'fulfilled') return true;
      return false;
    });
    const part1Count = savedQuestions.filter(q => q.part === 1).length;
    const part2Count = savedQuestions.filter(q => q.part === 2).length;
    const part3Count = savedQuestions.filter(q => q.part === 3).length;

    // ═══ SUMMARY MODAL — thay thế banner cũ ═══
    const summary: DigitizationSummary = {
      success: totalFailed === 0,
      totalInserted: totalSaved,
      totalFailed,
      details: { part1: part1Count, part2: part2Count, part3: part3Count },
      sourceFile,
      timestamp: new Date(),
      errorDetails,
    };
    setSummaryModal(summary);

    if (totalFailed > 0) {
      console.warn(
        `[handleSync] ⚠️ ${totalSaved}/${questions.length} câu lưu OK | ${totalFailed} lỗi`,
        errorDetails
      );
      // ═══ FIX SILENT FAILURE: Nếu TOÀN BỘ thất bại → throw error để catch block xử lý ═══
      if (totalSaved === 0) {
        throw new Error(`Lưu thất bại hoàn toàn: ${errorDetails[0] || 'Lỗi không xác định'}`);
      }
    } else {
      console.info(`[handleSync] ✅ Tổng: ${questions.length} câu | ${clusterGroups.size} cluster | ${standaloneQuestions.length} standalone`);
    }

    if (totalSaved > 0) {
      onQuestionsAdded();
    }
    setParseErrors([]);
  };

  // ═══════════════════════════════════════════════════════════════
  //  ACTION HANDLERS — sau khi AI xử lý xong
  // ═══════════════════════════════════════════════════════════════

  const handleSaveToBank = async () => {
    if (!pendingQuestions) return;
    setShowActionModal(false);
    setImageProgress('💾 Đang lưu vào Kho Câu Hỏi...');
    try {
      await handleSync(pendingQuestions, pendingSourceFile);
    } finally {
      setImageProgress(null);
      setPendingQuestions(null);
    }
  };

  const handleCreateExam = async () => {
    if (!pendingQuestions || !newExamTitle.trim()) {
      toast.error('Vui lòng nhập tên đề thi.');
      return;
    }
    setIsSavingExam(true);
    try {
      const batch = writeBatch(db);
      const questionIds: string[] = [];

      const finalQuestionsList = [];

      // 1. Tạo từng câu hỏi (nếu checkbox "cũng lưu vào kho" checked)
      for (const q of pendingQuestions) {
        const clean = sanitizeQuestion({
          ...q,
          targetGrade: Number(selectedGrade),
          status: "draft",
        });
        clean.createdAt = Timestamp.now();
        if (alsoSaveToBank) {
          const qRef = doc(collection(db, 'questions'));
          batch.set(qRef, clean);
          questionIds.push(qRef.id);
          // Ghi lại id thật để đề thi có thể sync được
          finalQuestionsList.push({ ...clean, id: qRef.id });
        } else {
          // Tạo một ID ảo để view/print không bị lỗi key
          const tempId = q.id || `q_temp_${Date.now()}_${Math.random().toString(36).substring(2,7)}`;
          finalQuestionsList.push({ ...clean, id: tempId });
        }
      }

      // 2. Tạo exam document
      const examRef = doc(collection(db, 'exams'));
      batch.set(examRef, {
        title: newExamTitle.trim(),
        targetGrade: Number(selectedGrade) || 12,
        questions: finalQuestionsList,
        questionIds: alsoSaveToBank ? questionIds : [],
        createdAt: Timestamp.now(),
        createdBy: auth.currentUser?.uid || 'admin',
        type: 'Digitized',
        sourceFile: pendingSourceFile,
      });

      // 3. Atomic commit
      await batch.commit();

      toast.success(`✅ Đã tạo đề "${newExamTitle}" với ${pendingQuestions.length} câu!`);
      if (alsoSaveToBank) {
        toast.info(`📚 ${questionIds.length} câu cũng đã lưu vào Kho Câu Hỏi.`);
        onQuestionsAdded();
      }

      setShowCreateExamModal(false);
      setShowActionModal(false);
      setPendingQuestions(null);
      setNewExamTitle('');
    } catch (e: any) {
      console.error('[handleCreateExam]', e);
      toast.error(`Lỗi tạo đề thi: ${e?.message || 'Lỗi không xác định'}`);
    } finally {
      setIsSavingExam(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-black text-white">SỐ HÓA ĐỀ THI AI</h3>
          <p className="text-slate-400 text-sm">Upload bất kỳ đề nào — AI tự nhận diện, phân loại, gắn thẻ và sắp xếp.</p>
        </div>
        <div className="bg-red-600/10 p-3 rounded-2xl">
          <BrainCircuit className="text-red-600 w-8 h-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">1. Chế độ số hóa</p>
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setDigitizeMode('AI')}
              className={cn(
                "flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2",
                digitizeMode === 'AI' ? "bg-red-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <BrainCircuit className="w-3 h-3" /> AI (Tự do)
            </button>
            <button
              onClick={() => setDigitizeMode('Standard')}
              className={cn(
                "flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-2",
                digitizeMode === 'Standard' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Settings className="w-3 h-3" /> Quy tắc (Chuẩn)
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">2. Gợi ý chủ đề (tùy chọn)</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTopicHint('')}
              className={cn(
                "py-1.5 px-3 rounded-lg text-[10px] font-bold border transition-all",
                topicHint === '' ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-800 border-slate-700 text-slate-400"
              )}
            >
              🤖 AI tự nhận diện
            </button>
            {(['Dao động cơ', 'Sóng cơ', 'Điện xoay chiều', 'Từ trường', 'Quang học', 'Vật lí nhiệt', 'Khí lí tưởng', 'Vật lí hạt nhân', 'Lượng tử ánh sáng', 'Động lực học', 'Năng lượng'] as Topic[]).map(t => (
              <button
                key={t}
                onClick={() => setTopicHint(t)}
                className={cn(
                  "py-1.5 px-2.5 rounded-lg text-[10px] font-bold border transition-all",
                  topicHint === t ? (digitizeMode === 'AI' ? "bg-red-600 border-red-600 text-white" : "bg-blue-600 border-blue-600 text-white") : "bg-slate-800 border-slate-700 text-slate-400"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">3. Khối lớp & Số hóa</p>
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl p-3 focus:border-red-500 outline-none transition-all font-bold"
            disabled={isProcessing}
          >
            <option value="" disabled>-- Vui lòng chọn Khối Lớp --</option>
            <option value="10">Khối 10 (Chương trình GDPT 2018)</option>
            <option value="11">Khối 11 (Chương trình GDPT 2018)</option>
            <option value="12">Khối 12 (Chương trình GDPT 2018)</option>
          </select>
          <p className="text-xs font-bold text-slate-500 uppercase mt-2">Tải lên file đề thi</p>
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".pdf,.docx,.json" 
            onChange={handleFileUpload}
            className="hidden"
            disabled={isProcessing}
            id="digitize-file-input"
          />
          <div 
            className={cn(
              "border-2 border-dashed rounded-2xl p-6 text-center transition-all group cursor-pointer select-none",
              isProcessing 
                ? "border-slate-700 opacity-50 cursor-not-allowed" 
                : isDragging
                  ? (digitizeMode === 'AI' ? "border-red-500 bg-red-500/10 scale-[1.02]" : "border-blue-500 bg-blue-500/10 scale-[1.02]")
                  : (digitizeMode === 'AI' ? "border-slate-700 hover:border-red-500/60 hover:bg-red-500/5" : "border-slate-700 hover:border-blue-500/60 hover:bg-blue-500/5")
            )}
            onClick={() => { if (!isProcessing && fileInputRef.current) fileInputRef.current.click(); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setIsDragging(false);
              if (isProcessing) return;
              const file = e.dataTransfer.files?.[0];
              if (file && fileInputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInputRef.current.files = dt.files;
                fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }}
          >
            <div className="flex items-center justify-center gap-3 pointer-events-none">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                isDragging ? "bg-red-500/30 scale-110" : "bg-slate-800 group-hover:bg-red-500/20 group-hover:scale-110"
              )}>
                <Download className={cn(
                  "w-6 h-6 transition-colors",
                  isDragging ? "text-red-400" : "text-slate-400 group-hover:text-red-400"
                )} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">
                  {isDragging ? '📥 Thả file vào đây...' : 'Chọn file hoặc kéo thả vào đây'}
                </p>
                <p className="text-[10px] text-slate-500">📄 PDF (khuyên dùng) · 📝 DOCX · 📋 JSON</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PROGRESS / ERROR STATUS BAR ═══ */}
      {(isProcessing || imageProgress) && (
        <div className="flex flex-col items-center justify-center gap-2">
          <div className={cn(
            "flex items-center gap-3 font-bold",
            isProcessing ? "text-red-500 animate-pulse" : "text-amber-400"
          )}>
            <BrainCircuit className={isProcessing ? "animate-spin" : ""} />
            {imageProgress || 'AI ĐANG BÓC TÁCH DỮ LIỆU & CÔNG THỨC...'}
          </div>
          {isProcessing && imageProgress && (
            <p className="text-[10px] text-slate-500">Quá trình này có thể mất 30-60 giây với PDF dài</p>
          )}
        </div>
      )}

      {/* ═══ V6: IMAGE MAPPER MODAL — Ghép ảnh Word gốc vào JSON ═══ */}
      <AnimatePresence>
        {showImageMapper && pendingJsonQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-2xl bg-slate-900 border border-cyan-500/30 rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-cyan-500/20 rounded-2xl flex items-center justify-center">
                    <ImagePlus className="w-7 h-7 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">📸 BATCH IMAGE MAPPER</h3>
                    <p className="text-slate-400 text-sm mt-1">
                      Phát hiện <span className="text-cyan-400 font-black">{pendingJsonQuestions.reduce((a, q) => a + (q.content.match(/\[IMG_\d+\]/gi)?.length || 0), 0)}</span> vị trí ảnh trong {pendingJsonQuestions.length} câu hỏi
                    </p>
                  </div>
                </div>

                {/* _imageMap descriptions from Gemini */}
                {pendingImageMap && Object.keys(pendingImageMap).length > 0 && (
                  <div className="mt-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">📋 Mô tả ảnh từ Gemini:</p>
                    <div className="space-y-1">
                      {Object.entries(pendingImageMap).map(([key, desc]) => (
                        <p key={key} className="text-xs text-slate-300">
                          <span className="text-cyan-400 font-bold">[{key}]</span> → {desc}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Step 1: Upload Word */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" /> Bước 1: Upload file Word gốc
                  </p>
                  <input
                    ref={wordFileRef}
                    type="file"
                    accept=".docx"
                    onChange={handleWordFileUpload}
                    className="hidden"
                    disabled={wordFileProcessing}
                  />
                  <button
                    onClick={() => wordFileRef.current?.click()}
                    disabled={wordFileProcessing}
                    className={cn(
                      "w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all",
                      wordFileProcessing
                        ? "border-slate-700 opacity-50 cursor-not-allowed"
                        : extractedImages.size > 0
                          ? "border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10"
                          : "border-cyan-500/40 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-400"
                    )}
                  >
                    {wordFileProcessing ? (
                      <div className="flex items-center justify-center gap-3 text-cyan-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="font-bold">Đang trích xuất ảnh...</span>
                      </div>
                    ) : extractedImages.size > 0 ? (
                      <div className="flex items-center justify-center gap-3 text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-bold">✅ Đã trích xuất {extractedImages.size} ảnh!</span>
                        <span className="text-[10px] text-slate-500">(Bấm để chọn file khác)</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3 text-cyan-400">
                        <Upload className="w-5 h-5" />
                        <div className="text-left">
                          <span className="font-bold block">Chọn file .docx gốc (file đã gửi vào Gemini)</span>
                          <span className="text-[10px] text-slate-500">Hệ thống sẽ tự trích xuất ảnh theo thứ tự xuất hiện</span>
                        </div>
                      </div>
                    )}
                  </button>
                </div>

                {/* Step 2: Preview */}
                {imageMappingPreview.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                      <Image className="w-3.5 h-3.5" /> Bước 2: Xác nhận ghép nối ({imageMappingPreview.length} ảnh)
                    </p>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {imageMappingPreview.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-slate-800/80 border border-slate-700 rounded-xl p-3">
                          <img
                            src={item.dataUrl}
                            alt={item.marker}
                            className="w-16 h-16 object-cover rounded-lg border border-slate-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded-full">{item.marker}</span>
                              <span className="text-slate-600">→</span>
                            </div>
                            <p className="text-xs text-slate-300 truncate">{item.targetQuestion}</p>
                          </div>
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        </div>
                      ))}
                    </div>

                    {/* Orphan images warning */}
                    {extractedImages.size > imageMappingPreview.length && (
                      <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <p className="text-[10px] text-amber-400 font-bold">
                          ⚠️ {extractedImages.size - imageMappingPreview.length} ảnh từ Word không khớp marker nào (sẽ bỏ qua)
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {extractedImages.size === 0 && !wordFileProcessing && (
                  <div className="text-center py-6">
                    <Image className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Upload file Word để bắt đầu ghép ảnh</p>
                    <p className="text-[10px] text-slate-600 mt-1">Hệ thống sẽ trích xuất ảnh theo thứ tự xuất hiện → ghép vào [IMG_1], [IMG_2]...</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-800 flex gap-3">
                <button
                  onClick={skipImageMapping}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-all"
                >
                  ⏭️ Bỏ qua, dùng JSON thuần
                </button>
                <button
                  onClick={applyImageMapping}
                  disabled={imageMappingPreview.length === 0}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                    imageMappingPreview.length > 0
                      ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
                      : "bg-slate-800 text-slate-600 cursor-not-allowed"
                  )}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Ghép {imageMappingPreview.length} ảnh & Tiếp tục
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SUMMARY MODAL — Báo cáo tổng kết số hóa (Glassmorphism) ═══ */}
      <AnimatePresence>
        {summaryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setSummaryModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg rounded-3xl border overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.92) 100%)',
                borderColor: summaryModal.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                boxShadow: summaryModal.success
                  ? '0 0 60px rgba(16,185,129,0.15), 0 25px 50px rgba(0,0,0,0.5)'
                  : '0 0 60px rgba(239,68,68,0.15), 0 25px 50px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Gradient accent bar */}
              <div className="h-1 w-full" style={{
                background: summaryModal.success
                  ? 'linear-gradient(90deg, #10b981, #06b6d4, #3b82f6)'
                  : 'linear-gradient(90deg, #ef4444, #f59e0b, #ef4444)',
              }} />

              {/* Close button */}
              <button
                onClick={() => setSummaryModal(null)}
                className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-8 space-y-6">
                {/* ── Header ── */}
                <div className="flex items-center gap-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2, damping: 12 }}
                    className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0",
                      summaryModal.success ? "bg-emerald-500/20" : "bg-red-500/20"
                    )}
                  >
                    {summaryModal.success
                      ? <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                      : <AlertTriangle className="w-9 h-9 text-red-400" />
                    }
                  </motion.div>
                  <div>
                    <h3 className={cn(
                      "text-xl font-black",
                      summaryModal.success ? "text-emerald-400" : "text-red-400"
                    )}>
                      {summaryModal.success ? '✅ Số hóa thành công!' : '⚠️ Số hóa có lỗi'}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Hệ thống đã bóc tách thành công <span className="text-white font-black text-base">{summaryModal.totalInserted}</span> câu hỏi từ nguồn đề <span className="text-cyan-400 font-bold">"{summaryModal.sourceFile}"</span>
                    </p>
                  </div>
                </div>

                {/* ── Chi tiết Part breakdown ── */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Phần I · TNKQ', count: summaryModal.details.part1, color: 'from-blue-500/20 to-blue-600/5', textColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
                    { label: 'Phần II · Đ/S', count: summaryModal.details.part2, color: 'from-amber-500/20 to-amber-600/5', textColor: 'text-amber-400', borderColor: 'border-amber-500/20' },
                    { label: 'Phần III · TLN', count: summaryModal.details.part3, color: 'from-emerald-500/20 to-emerald-600/5', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className={cn(
                        "rounded-2xl p-4 text-center border bg-gradient-to-b",
                        item.color, item.borderColor
                      )}
                    >
                      <p className={cn("text-3xl font-black", item.textColor)}>{item.count}</p>
                      <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">{item.label}</p>
                    </motion.div>
                  ))}
                </div>

                {/* ── Thông tin bổ sung ── */}
                <div className="bg-slate-800/50 rounded-2xl p-4 space-y-2 border border-slate-700/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">📄 File nguồn</span>
                    <span className="text-white font-bold">{summaryModal.sourceFile}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">⏰ Thời gian</span>
                    <span className="text-white font-bold">{summaryModal.timestamp.toLocaleTimeString('vi-VN')}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">📊 Tổng câu phát hiện</span>
                    <span className="text-white font-bold">{summaryModal.totalInserted + summaryModal.totalFailed}</span>
                  </div>
                  {summaryModal.totalFailed > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-red-400">❌ Lỗi lưu</span>
                      <span className="text-red-400 font-black">{summaryModal.totalFailed} câu</span>
                    </div>
                  )}
                </div>

                {/* ── Error details (nếu có lỗi) ── */}
                {summaryModal.errorDetails.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-2"
                  >
                    <p className="text-xs font-black text-red-400 uppercase">🔴 Chi tiết lỗi</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {summaryModal.errorDetails.map((err, i) => (
                        <p key={i} className="text-[11px] text-red-300/80 font-mono leading-relaxed">
                          • {err}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ── CTA ── */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setSummaryModal(null)}
                    className={cn(
                      "flex-1 py-3 rounded-2xl text-sm font-black transition-all",
                      summaryModal.success
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                        : "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20"
                    )}
                  >
                    {summaryModal.success ? '🎉 Tuyệt vời! Đóng' : '🔧 Đã hiểu, đóng'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ACTION CHOICE MODAL — 2 nút sau khi AI xử lý xong ═══ */}
      <AnimatePresence>
        {showActionModal && pendingQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-8 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-black text-white">AI XỬ LÝ XONG!</h3>
                <p className="text-slate-400 text-sm mt-2">
                  Đã phát hiện <span className="text-white font-black text-lg">{pendingQuestions.length}</span> câu hỏi từ file <span className="text-cyan-400 font-bold">"{pendingSourceFile}"</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-blue-400">{pendingQuestions.filter(q => q.part === 1).length}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Phần I</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-amber-400">{pendingQuestions.filter(q => q.part === 2).length}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Phần II</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-emerald-400">{pendingQuestions.filter(q => q.part === 3).length}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Phần III</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 text-center font-bold uppercase tracking-widest">Chọn hành động:</p>

              <div className="space-y-3">
                <button
                  onClick={() => { setShowActionModal(false); setShowReviewBoard(true); }}
                  className="w-full p-4 bg-fuchsia-600/10 border border-fuchsia-500/30 rounded-2xl hover:bg-fuchsia-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-fuchsia-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Pencil className="w-6 h-6 text-fuchsia-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">✏️ Duyệt & Chỉnh sửa từng câu</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Sửa nội dung, chèn ảnh, chỉnh đáp án, phát hiện trùng lặp trước khi lưu.</p>
                  </div>
                </button>

                <button
                  onClick={() => { setShowActionModal(false); setShowPreviewModal(true); }}
                  className="w-full p-4 bg-cyan-600/10 border border-cyan-500/30 rounded-2xl hover:bg-cyan-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-cyan-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Eye className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">👀 Xem nhanh (Read-only)</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Lướt nhanh kết quả, không chỉnh sửa.</p>
                  </div>
                </button>

                <button
                  onClick={handleSaveToBank}
                  className="w-full p-4 bg-blue-600/10 border border-blue-500/30 rounded-2xl hover:bg-blue-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <BookOpen className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">📚 Lưu vào Kho Câu Hỏi</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Các câu sẽ vào ngân hàng đề, sẵn sàng tạo đề sau.</p>
                  </div>
                </button>

                <button
                  onClick={() => { setShowCreateExamModal(true); setNewExamTitle(''); }}
                  className="w-full p-4 bg-violet-600/10 border border-violet-500/30 rounded-2xl hover:bg-violet-600/20 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 bg-violet-600/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-violet-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-white">📝 Tạo Đề Thi Riêng</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Tạo đề thi độc lập, sẵn sàng phát cho phòng thi.</p>
                  </div>
                </button>
              </div>

              <button
                onClick={() => { setShowActionModal(false); setPendingQuestions(null); }}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 font-bold transition-colors"
              >
                Hủy bỏ — không lưu
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PREVIEW MODAL — Xem trước các câu do AI số hóa ═══ */}
      <AnimatePresence>
        {showPreviewModal && pendingQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col p-4 md:p-8"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)' }}
          >
            <div className="w-full max-w-5xl mx-auto bg-slate-900 border border-cyan-500/30 rounded-3xl flex flex-col h-full shadow-2xl shadow-cyan-900/20 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-800/80 bg-slate-900/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">KẾT QUẢ SỐ HÓA TỪ AI</h2>
                    <p className="text-sm text-cyan-400 font-bold mt-0.5">{pendingQuestions.length} câu hỏi • {pendingSourceFile}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowPreviewModal(false); setShowActionModal(true); }}
                  className="p-3 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 rounded-xl transition-colors"
                  title="Quay lại"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-slate-950/30">
                <div className="space-y-6">
                  {pendingQuestions.map((q, idx) => (
                    <div key={idx} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 hover:border-cyan-500/30 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 bg-cyan-950 text-cyan-400 text-xs font-bold rounded-lg border border-cyan-900/50 uppercase">Câu {idx + 1}</span>
                          <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 uppercase">Phần {q.part}</span>
                          <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700">{q.level}</span>
                          {q.topic && <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs flex items-center gap-1 rounded-lg border border-slate-700"><CheckCircle2 className="w-3 h-3 text-emerald-500"/> {q.topic}</span>}
                        </div>
                      </div>

                      <div className="mb-4 text-sm text-slate-200">
                        <MathRenderer content={q.content} />
                      </div>

                      {(q.part === 1 || q.part === 2) && q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                          {q.options.map((opt, iMap) => {
                            const isCorrect = q.part === 1 
                              ? String(q.correctAnswer) === String(iMap + 1)
                              : String(q.correctAnswer).split(',').includes(String(iMap + 1));
                            
                            return (
                              <div key={iMap} className={`flex gap-3 p-3 rounded-xl border ${isCorrect ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-slate-900/50 border-slate-700/50'}`}>
                                <span className={`font-bold shrink-0 ${isCorrect ? 'text-emerald-400' : 'text-slate-400'}`}>
                                  {String.fromCharCode(65 + iMap)}.
                                </span>
                                <div className={`text-sm ${isCorrect ? 'text-emerald-100' : 'text-slate-300'}`}>
                                  <MathRenderer content={opt} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.part === 3 && q.correctAnswer !== undefined && (
                        <div className="mb-4 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl inline-block">
                          <span className="text-sm font-bold text-emerald-400">Đáp án: </span>
                          <span className="text-sm font-black text-white">{q.correctAnswer}</span>
                        </div>
                      )}

                      {q.explanation && (
                        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lời giải chi tiết</p>
                          <div className="text-sm text-slate-300 leading-relaxed">
                            <MathRenderer content={q.explanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 sm:p-6 border-t border-slate-800/80 bg-slate-900/90 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 shrink-0">
                 <button
                   onClick={() => { setShowPreviewModal(false); setShowActionModal(true); }}
                   className="px-6 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors uppercase tracking-wider text-sm w-full sm:w-auto"
                 >
                   Quay lại
                 </button>
                 <button
                   onClick={() => { setShowPreviewModal(false); handleSaveToBank(); }}
                   className="px-6 py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 active:scale-95 uppercase tracking-wider text-sm flex items-center justify-center gap-2 w-full sm:w-auto"
                 >
                   <BookOpen className="w-4 h-4" />
                   Lưu vào Kho (Đã Kiểm tra)
                 </button>
                 <button
                   onClick={() => { setShowPreviewModal(false); setShowCreateExamModal(true); setNewExamTitle(''); }}
                   className="px-6 py-3 rounded-xl font-black text-white bg-violet-600 hover:bg-violet-500 transition-all shadow-lg shadow-violet-500/20 active:scale-95 uppercase tracking-wider text-sm flex items-center justify-center gap-2 w-full sm:w-auto"
                 >
                   <FileText className="w-4 h-4" />
                   Tạo Đề Thi Riêng
                 </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ QUESTION REVIEW BOARD — Duyệt & Chỉnh sửa từng câu (Human-in-the-loop) ═══ */}
      <AnimatePresence>
        {showReviewBoard && pendingQuestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(16px)' }}
          >
            <QuestionReviewBoard
              initialQuestions={pendingQuestions}
              parseErrors={parseErrors}
              topic={topicHint || ''}
              onSync={async (reviewedQuestions) => {
                setShowReviewBoard(false);
                setImageProgress('💾 Đang lưu vào Kho Câu Hỏi...');
                try {
                  await handleSync(reviewedQuestions, pendingSourceFile);
                } finally {
                  setImageProgress(null);
                  setPendingQuestions(null);
                }
              }}
              onCancel={() => {
                setShowReviewBoard(false);
                setShowActionModal(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ CREATE EXAM MODAL — Nhập tên đề thi ═══ */}
      <AnimatePresence>
        {showCreateExamModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md bg-slate-900 border border-violet-500/30 rounded-3xl p-8 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center">
                <h3 className="text-xl font-black text-white">📝 Tạo Đề Thi Riêng</h3>
                <p className="text-slate-400 text-sm mt-1">{pendingQuestions?.length || 0} câu từ "{pendingSourceFile}"</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tên đề thi *</label>
                <input
                  type="text"
                  value={newExamTitle}
                  onChange={e => setNewExamTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateExam()}
                  placeholder="VD: Đề kiểm tra 1 tiết — Chương Từ trường"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none"
                  autoFocus
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                <input
                  type="checkbox"
                  checked={alsoSaveToBank}
                  onChange={e => setAlsoSaveToBank(e.target.checked)}
                  className="w-5 h-5 bg-slate-800 border-slate-700 rounded accent-violet-500"
                />
                <div>
                  <span className="text-xs text-slate-300 font-bold">Cũng lưu vào Kho Câu Hỏi</span>
                  <p className="text-[10px] text-slate-500 mt-0.5">Câu hỏi sẽ có trong ngân hàng đề để tái sử dụng</p>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateExamModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-all"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleCreateExam}
                  disabled={isSavingExam || !newExamTitle.trim()}
                  className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  {isSavingExam ? <div className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-spin" /> : null}
                  {isSavingExam ? 'Đang lưu...' : 'Lưu & Tạo Đề'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default DigitizationDashboard;
