import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  db, collection, doc, getDocs, getDocsFromServer, deleteDoc, updateDoc,
  Timestamp, writeBatch, query, where, addDoc
} from '../firebase';
import { Question, Topic, Part } from '../types';
import { PHYSICS_TOPICS, matchesTopic } from '../utils/physicsTopics';
import { normalizeText } from '../utils/textUtils';
import { sanitizeQuestion, stripUndefined } from '../utils/sanitizers';

import { toast } from './Toast';

const ITEMS_PER_PAGE = 30;
import MathRenderer from '../lib/MathRenderer';
import { ReviewExam } from './ReviewExam';
import {
  BookOpen, Search, Filter, ChevronLeft, ChevronRight,
  X, Check, Pencil, Save, Download, AlertTriangle,
  CheckCircle2, XCircle, Star, ArrowRight, RotateCcw,
  ImagePlus, Flag, FileText, BrainCircuit, Eye,
  Target, Clock, LogOut, ShieldAlert, Info, FlaskConical, Video
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
const QuestionBank = ({ onCountChanged, onQuestionsLoaded }: { onCountChanged?: (delta: number) => void; onQuestionsLoaded?: (count: number) => void }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTopics, setFilterTopics] = useState<Set<string>>(new Set());
  const [filterSubTopics, setFilterSubTopics] = useState<Set<string>>(new Set());
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set(['Khối 12']));
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [filterPart, setFilterPart] = useState<Part | 'All'>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // ── Search & Level filter ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevels, setFilterLevels] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  // ── Time filter ──
  const [filterTime, setFilterTime] = useState<'All' | '1h' | 'today' | '7d' | '30d'>('All');
  // ── Status filter ──
  const [filterStatus, setFilterStatus] = useState<'All' | 'draft' | 'published'>('All');
  // ── Inline edit state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editIsTrap, setEditIsTrap] = useState(false);
  const [editExplanation, setEditExplanation] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [quickImgSaving, setQuickImgSaving] = useState<string | null>(null);

  // ── Thêm state cho Bulk Delete & Batch Filter ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [filterBatchId, setFilterBatchId] = useState<string | 'All'>('All');

  // Load danh sách UploadBatchId
  const uploadBatches = useMemo(() => {
    const batches = new Map<string, { id: string, count: number, timestamp: number }>();
    questions.forEach(q => {
      if (q.uploadBatchId && q.createdAt) {
        if (!batches.has(q.uploadBatchId)) {
          const ts = q.createdAt?.toDate ? q.createdAt.toDate().getTime() : new Date(q.createdAt).getTime();
          batches.set(q.uploadBatchId, { id: q.uploadBatchId, count: 1, timestamp: ts });
        } else {
          batches.get(q.uploadBatchId)!.count++;
        }
      }
    });
    return Array.from(batches.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [questions]);

  // ── Fetch questions ONE-SHOT — Bypass cache để sửa lỗi 0 câu hỏi ──
  // [FIX 14/04] Bỏ orderBy('createdAt') vì Firestore sẽ ẨN tất cả documents thiếu trường đó.
  // Thay vào đó: tải TOÀN BỘ rồi sort bằng JS trên client.
  const fetchQuestions = async () => {
    setLoading(true);
    try {
      console.info('[fetchQuestions] 🔄 Đang truy vấn Firestore (không orderBy)...');
      const qRef = query(collection(db, 'questions'));
      const snapshot = await getDocsFromServer(qRef);
      console.info(`[fetchQuestions] 📊 Firestore trả về: ${snapshot.size} documents`);
      
      if (snapshot.size === 0) {
        console.warn('[fetchQuestions] ⚠️ Database TRỐNG — chưa có câu hỏi nào trong collection "questions".');
        console.warn('[fetchQuestions] 💡 Hãy thử số hóa 1 file PDF/Word để tạo câu hỏi đầu tiên.');
      }

      // [FIX] Đặt `id: d.id` SAU `...d.data()` để document ID thật luôn thắng
      const qs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Question));
      
      // Sort giảm dần theo thời gian trên client (mới nhất trước)
      // Fallback: câu hỏi thiếu createdAt sẽ xuống cuối danh sách
      qs.sort((a, b) => {
        const tA = (a.createdAt as any)?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
        const tB = (b.createdAt as any)?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
        return tB - tA;
      });

      setQuestions(qs);
      // Đồng bộ số lượng thực tế lên Header Dashboard
      onQuestionsLoaded?.(qs.length);
      console.info(`[fetchQuestions] ✅ Đã load ${qs.length} câu hỏi thành công.`);
    } catch (error) {
      console.error('[fetchQuestions] ❌ Lỗi khi tải câu hỏi:', error);
      // Không throw — giữ UI hoạt động
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // ── Lọc kết hợp Search + Topic + Part + Level + Time + Batch ──
  const filtered = useMemo(() => {
    let result = questions;
    if (filterBatchId !== 'All') result = result.filter(q => q.uploadBatchId === filterBatchId);
    // Filter topic + subtopic
    if (filterTopics.size > 0 || filterSubTopics.size > 0) {
      result = result.filter(q => {
        const inSub = filterSubTopics.has(q.subTopic || '');
        if (inSub) return true;
        
        const matchedTopicName = Array.from(filterTopics).find(tn => matchesTopic(q.topic, tn));
        if (matchedTopicName) {
           const subTopicsOfThisTopic = PHYSICS_TOPICS.flatMap(g => g.topics).find(t => t.name === matchedTopicName)?.subTopics || [];
           const hasCheckedSubForThisTopic = subTopicsOfThisTopic.some(sub => filterSubTopics.has(sub));
           if (!hasCheckedSubForThisTopic) return true;
        }
        return false;
      });
    }
    // Filter part
    if (filterPart !== 'All') result = result.filter(q => q.part === filterPart);
    // Filter levels (multi-select)
    if (filterLevels.size > 0) result = result.filter(q => filterLevels.has(q.level));
    // Filter status (treat undefined as published)
    if (filterStatus !== 'All') {
      result = result.filter(q => {
        const status = q.status || 'published';
        return status === filterStatus;
      });
    }
    // Filter by upload time
    if (filterTime !== 'All') {
      const now = Date.now();
      const cutoffs: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        'today': (() => {
          const d = new Date(); d.setHours(0, 0, 0, 0); return now - d.getTime();
        })(),
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      const cutoff = cutoffs[filterTime] ?? 0;
      result = result.filter(q => {
        if (!q.createdAt) return false;
        const ts = q.createdAt?.toDate ? q.createdAt.toDate().getTime() : new Date(q.createdAt).getTime();
        return (now - ts) <= cutoff;
      });
    }
    // Full-text search
    if (searchQuery.trim()) {
      const needle = normalizeText(searchQuery);
      result = result.filter(q => {
        const haystack = normalizeText(
          [q.content, q.explanation, ...(q.tags || []), q.topic, q.level].join(' ')
        );
        return haystack.includes(needle);
      });
    }
    // Mặc định luôn sắp xếp mới nhất lên đầu (cho cả old docs chưa có createdAt)
    result = [...result].sort((a, b) => {
      const tsA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tsB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tsB - tsA;
    });
    return result;
  }, [questions, filterTopics, filterSubTopics, filterPart, filterLevels, filterStatus, filterTime, searchQuery]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);
  // Reset page khi filter thay đổi
  useEffect(() => { setCurrentPage(1); }, [filterTopics, filterSubTopics, filterPart, filterLevels, filterStatus, filterTime, filterBatchId, searchQuery]);

  const hasActiveFilters = filterTopics.size > 0 || filterSubTopics.size > 0 || filterPart !== 'All' || filterLevels.size > 0 || filterStatus !== 'All' || filterTime !== 'All' || searchQuery.trim() !== '';
  const resetAllFilters = () => {
    setFilterTopics(new Set());
    setFilterSubTopics(new Set());
    setFilterPart('All');
    setFilterLevels(new Set());
    setFilterStatus('All');
    setFilterTime('All');
    setFilterBatchId('All');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const toggleLevel = (level: string) => {
    setFilterLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  };

  // ── Thống kê ──
  const stats = useMemo(() => {
    const topicSet = new Set(questions.map(q => q.topic));
    const p1 = questions.filter(q => q.part === 1).length;
    const p2 = questions.filter(q => q.part === 2).length;
    const p3 = questions.filter(q => q.part === 3).length;
    const needsImage = questions.filter(q => 
      /\[HÌNH MINH HỌA/i.test(q.content) || 
      /<img[^>]*src=["']\s*["']/i.test(q.content) ||
      /src=["']data:image\/png;base64,ERROR["']/i.test(q.content)
    ).length;
    return { total: questions.length, p1, p2, p3, topics: topicSet.size, needsImage };
  }, [questions]);

  // Hàm hỗ trợ chống kẹt Firebase nếu mất mạng/hết Quota
  const withTimeout = (promise: Promise<any>, ms: number) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
    ]);
  };

  const deleteQuestion = async (id: string) => {
    if (!window.confirm('Thầy có chắc chắn muốn xóa câu hỏi này không?')) return;
    
    // Giao diện chỉ tiến hành báo đang xoá
    toast.info('Đang xóa câu hỏi...');

    // Optimistic UI Update - Xóa ngay trên màn hình
    setQuestions(prev => prev.filter(q => q.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    onCountChanged?.(-1);
    toast.success('Xóa câu hỏi thành công (đang đồng bộ)!');

    // Chạy ngầm xoá dữ liệu trên server
    deleteDoc(doc(db, 'questions', id)).catch(err => {
        console.error('Lỗi khi xoá ngầm:', err);
        // Có thể hiện cảnh báo nhỏ nếu cần, nhưng không block flow của người dùng
    });
  };

  const deleteSelectedQuestions = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Thầy có chắc chắn muốn xóa ${selectedIds.size} câu hỏi đã chọn?`)) return;
    setIsDeletingBulk(true);
    try {
      const idsArray = Array.from(selectedIds);
      let deletedCount = 0;
      toast.info(`Đang xóa ${idsArray.length} câu...`);
      
      // Xóa tuần tự từng câu hỏi bằng Optimistic UI
      for (const id of idsArray) {
        // Cập nhật UI ngay lập tức cho từng câu
        deletedCount++;
        setQuestions(prev => prev.filter(q => q.id !== id));
        setSelectedIds(prev => { 
           const newSet = new Set(prev); 
           newSet.delete(id); 
           return newSet; 
        });

        // Xoá ngầm trên Backend
        deleteDoc(doc(db, 'questions', id)).catch(err => console.error(err));
      }
      
      onCountChanged?.(-deletedCount);
      toast.success(`✅ Xong! Đã xóa ${deletedCount} câu (đang đồng bộ ngầm).`);
    } catch (error: any) {
      console.error('[deleteSelectedQuestions] LỖI:', error);
      toast.error('Có lỗi xảy ra khi xoá đồng loạt (UI).');
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedQuestions.map(q => q.id!)));
    }
  };

  const toggleStatus = async (q: Question) => {
    if (!q.id) return;
    try {
      const newStatus = (q.status || 'published') === 'published' ? 'draft' : 'published';
      
      // Cách 1: Chờ hoàn thành mới báo UI
      await withTimeout(updateDoc(doc(db, 'questions', q.id), { status: newStatus }), 8000);
      
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, status: newStatus } : item));
      toast.success(newStatus === 'published' ? 'Đã duyệt câu hỏi vào thư viện' : 'Đã chuyển thành bản nháp');
    } catch (error: any) {
      if (error.message === 'TIMEOUT') {
        toast.error('🚨 Lỗi Server (Timeout): Server phản hồi quá chậm!');
      } else {
        toast.error('🚨 Lỗi hệ thống, trạng thái vẫn như cũ!');
        console.error(error);
      }
    }
  };

  // ── Inline Edit ──
  const startEdit = (q: Question) => {
    setEditingId(q.id!);
    setEditContent(q.content);
    setEditExplanation(q.explanation || '');
    setEditOptions(q.options ? [...q.options] : []);
    // Đảm bảo đú́ng kiểu: Part 2 correctAnswer phải là boolean[]
    if (q.part === 2) {
      const ca = Array.isArray(q.correctAnswer)
        ? q.correctAnswer.map((v: any) => v === true || v === 'true')
        : [false, false, false, false];
      setEditCorrectAnswer(ca);
    } else {
      setEditCorrectAnswer(q.correctAnswer ?? (q.part === 1 ? 0 : 0));
    }
    setEditIsTrap(q.isTrap || false);
    setExpandedId(q.id!);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditExplanation('');
    setEditOptions([]);
    setEditCorrectAnswer(null);
    setEditIsTrap(false);
  };

  const saveEdit = async (q: Question) => {
    if (!q.id) {
      toast.error('Lỗi: Không tìm thấy ID câu hỏi. Hãy làm mới trang và thử lại.');
      return;
    }
    setEditSaving(true);
    try {
      // [FIX] Không dùng stripLargeBase64 cho saveEdit — quá mạnh, xóa ảnh Admin vừa chèn.
      // Chỉ dùng stripUndefined để đảm bảo Firestore không reject undefined.
      const updateData: any = stripUndefined({
        content: editContent || '',
        explanation: editExplanation || '',
        status: q.status || 'published',
        isTrap: editIsTrap
      });
      if (q.part === 1 || q.part === 2) {
        // Đảm bảo options array không chứa undefined — thay bằng '' để giữ đúng index
        updateData.options = (editOptions || []).map(opt => opt ?? '');
        updateData.correctAnswer = editCorrectAnswer;
      }
      if (q.part === 3) {
        updateData.correctAnswer = Number(editCorrectAnswer) || 0;
      }
      
      // [FIX] Kiểm tra document size trước khi gửi — Firestore reject > 1MB
      const payloadSize = new Blob([JSON.stringify(updateData)]).size;
      if (payloadSize > 900_000) { // 900KB safety margin
        toast.error(`⚠️ Nội dung quá lớn (${Math.round(payloadSize / 1024)}KB). Firestore giới hạn 1MB. Hãy cắt bớt ảnh hoặc nội dung.`);
        setEditSaving(false);
        return;
      }
      
      console.info(`[saveEdit] Lưu câu ${q.id} | Size: ${Math.round(payloadSize / 1024)}KB`);
      
      // Optimistic UI Update
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, ...updateData } : item));
      toast.success('✅ Đã lưu (đang đồng bộ)!');
      setEditingId(null); // Tắt form edit ngay
      
      // Pushing to Firebase in background without blocking UI
      updateDoc(doc(db, 'questions', q.id), updateData).catch((error: any) => {
        console.error('[saveEdit] LỖI đồng bộ ngầm:', error);
        if (error?.message?.includes('TIMEOUT')) {
           toast.error('⚠️ Máy chủ phản hồi chậm hoặc hết Quota. Trạng thái đã lưu offline.');
        } else {
           toast.error(`⚠️ Lỗi đẩy dữ liệu: ${error?.message}`);
        }
      });
      
    } catch (error: any) {
      console.error('[saveEdit] LỖI:', error);
      toast.error('Lỗi khi chuẩn bị dữ liệu lưu.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Nén ảnh (Canvas JPEG 40%, max 600px) — tránh vượt 1MB Firestore ──
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const MAX_W = 600;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không đọc được ảnh'));
      };
      img.src = url;
    });
  };

  // ── Chèn ảnh vào content/explanation (trong edit mode) ──
  const handleImageInsert = (target: 'content' | 'explanation') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        const imgMarkdown = `\n![](${dataUrl})\n`;
        if (target === 'content') {
          setEditContent(prev => prev + imgMarkdown);
        } else {
          setEditExplanation(prev => prev + imgMarkdown);
        }
      } catch (err) {
        toast.error('Không thể đọc ảnh. Kiểm tra file.');
      }
    };
    input.click();
  };

  // ── Chèn ảnh nhanh (không cần edit mode) — lưu thẳng Firestore ──
  const handleQuickImageInsert = (q: Question) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !q.id) return;
      setQuickImgSaving(q.id);
      try {
        const dataUrl = await compressImage(file);
        // Xóa placeholder rồi chèn ảnh vào CUỐI nội dung
        let newContent = q.content
          .replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '')
          .trim();
        newContent = newContent + `\n\n![](${dataUrl})`;
        await updateDoc(doc(db, 'questions', q.id), { content: newContent });
        
        // Cập nhật local state
        setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, content: newContent } : item));
        toast.success('Đã chèn ảnh trực tiếp thành công!');
      } catch (err) {
        toast.error('Lỗi chèn ảnh. Kiểm tra file hoặc kết nối.');
        console.error('[QuickImageInsert]', err);
      } finally {
        setQuickImgSaving(null);
      }
    };
    input.click();
  };

  // ── Kiểm tra câu thiếu ảnh ──
  const hasImageIssue = (q: Question) => {
    return /\[HÌNH MINH HỌA/i.test(q.content) || 
           /<img[^>]*src=["']\s*["']/i.test(q.content) ||
           /src=["']data:image\/png;base64,ERROR["']/i.test(q.content);
  };

  // ── Helper cho TreeView ──
  const toggleGrade = (grade: string) => {
    setExpandedGrades(prev => { const n = new Set(prev); if(n.has(grade)) n.delete(grade); else n.add(grade); return n; });
  };
  const toggleTopicExpand = (topic: string) => {
    setExpandedTopics(prev => { const n = new Set(prev); if(n.has(topic)) n.delete(topic); else n.add(topic); return n; });
  };
  const toggleTopicCheck = (topic: string) => {
    setFilterTopics(prev => { const n = new Set(prev); if(n.has(topic)) n.delete(topic); else n.add(topic); return n; });
  };
  const toggleSubTopicCheck = (sub: string) => {
    setFilterSubTopics(prev => { const n = new Set(prev); if(n.has(sub)) n.delete(sub); else n.add(sub); return n; });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
      {/* ── Header + Thống kê ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-2xl font-black text-white">KHO CÂU HỎI ĐÃ SỐ HÓA</h3>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="text-slate-400 text-sm font-bold">Tổng: {stats.total} câu</span>
              <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">P1: {stats.p1}</span>
              <span className="text-[10px] bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">P2: {stats.p2}</span>
              <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">P3: {stats.p3}</span>
              {stats.needsImage > 0 && (
                <span className="text-[10px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
                  ⚠️ {stats.needsImage} câu thiếu ảnh
                </span>
              )}
            </div>
          </div>
          <button
            onClick={fetchQuestions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition-all disabled:opacity-40"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            )}
            Làm mới
          </button>
        </div>

        {/* ══════════ LAYOUT 2 CỘT ══════════ */}
        <div className="flex flex-col xl:flex-row gap-8">
          
          {/* ── CỘT TRÁI: SIDEBAR FILTER THEO BỘ GDPT ── */}
          <div className="w-full xl:w-80 shrink-0 space-y-4">
            
            {/* THANH TÌM KIẾM */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nội dung, chủ đề, tag..."
                className="w-full bg-slate-800/80 border-2 border-slate-700 hover:border-slate-600 focus:border-red-600/60 rounded-2xl pl-11 pr-11 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* TREE VIEW BỘ GDPT */}
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 max-h-[800px] overflow-y-auto custom-scrollbar">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-1">Cấu trúc GDPT 2018</h4>
              {PHYSICS_TOPICS.map((gradeGroup) => (
                <div key={gradeGroup.grade} className="mb-3">
                  <button 
                    onClick={() => toggleGrade(gradeGroup.grade)}
                    className="w-full flex items-center justify-between p-2.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl transition-all"
                  >
                    <span className={cn("font-bold text-sm", gradeGroup.isSpecialized ? "text-amber-400" : "text-slate-200")}>
                      {gradeGroup.grade}
                    </span>
                    <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expandedGrades.has(gradeGroup.grade) && "rotate-90")} />
                  </button>
                  
                  {expandedGrades.has(gradeGroup.grade) && (
                    <div className="pl-3 mt-2 border-l-2 border-slate-700/50 space-y-1.5 py-1">
                      {gradeGroup.topics.map(topic => {
                        const isTopicChecked = filterTopics.has(topic.name);
                        const isExpanded = expandedTopics.has(topic.name);
                        const qCount = questions.filter(q => matchesTopic(q.topic, topic.name)).length;
                        if (qCount === 0 && !isTopicChecked && gradeGroup.grade !== 'Khối 12') return null; // Ẩn bớt mục trống
                        
                        return (
                          <div key={topic.name}>
                            <div className={cn("flex items-center justify-between hover:bg-slate-800/60 p-1.5 rounded-lg transition-colors group", isExpanded && "bg-slate-800/40")}>
                              <div className="flex flex-1 items-center gap-2">
                                {topic.subTopics.length > 0 ? (
                                  <button onClick={() => toggleTopicExpand(topic.name)} className="p-0.5 hover:bg-slate-700 rounded text-slate-500 hover:text-white">
                                    <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-90")} />
                                  </button>
                                ) : <span className="w-5 h-5 flex-shrink-0" />}
                                
                                <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isTopicChecked}
                                    onChange={() => toggleTopicCheck(topic.name)}
                                    className="w-4 h-4 bg-slate-800 border-slate-600 rounded accent-red-600 shrink-0 cursor-pointer"
                                  />
                                  <span className={cn("text-xs truncate transition-colors cursor-pointer", isTopicChecked ? "text-red-400 font-bold" : "text-slate-300 group-hover:text-white")}>
                                    {topic.name}
                                  </span>
                                </label>
                              </div>
                              <span className="text-[10px] text-slate-500 font-bold ml-2 shrink-0">{qCount}</span>
                            </div>
                            
                            {topic.subTopics.length > 0 && isExpanded && (
                              <div className="pl-9 mt-1 pr-1 space-y-1">
                                {topic.subTopics.map(sub => {
                                  const isSubChecked = filterSubTopics.has(sub);
                                  const subCount = questions.filter(q => q.subTopic === sub).length;
                                  return (
                                    <label key={sub} className="flex items-center justify-between p-1.5 hover:bg-slate-800/60 rounded-lg cursor-pointer group">
                                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                        <input
                                          type="checkbox"
                                          checked={isSubChecked}
                                          onChange={() => toggleSubTopicCheck(sub)}
                                          className="w-3.5 h-3.5 bg-slate-800 border-slate-600 rounded accent-blue-500 shrink-0 cursor-pointer"
                                        />
                                        <span className={cn("text-[11px] leading-snug transition-colors cursor-pointer", isSubChecked ? "text-blue-400 font-bold" : "text-slate-400 group-hover:text-slate-200")}>
                                          {sub}
                                        </span>
                                      </div>
                                      {subCount > 0 && <span className="text-[9px] text-slate-600 font-bold shrink-0">{subCount}</span>}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── CỘT PHẢI: NỘI DUNG ── */}
          <div className="flex-1 space-y-4 min-w-0">

            {/* ── Lọc theo Phần + Mức độ ── */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Phần */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                {(['All', 1, 2, 3] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setFilterPart(p)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      filterPart === p 
                        ? "bg-white/10 border-white/20 text-white" 
                        : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {p === 'All' ? 'Tất cả Phần' : `Phần ${p === 1 ? 'I · TNKQ' : p === 2 ? 'II · Đ/S' : 'III · TLN'}`}
                  </button>
                ))}
              </div>

              {/* Mức độ (multi-select) */}
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-slate-500" />
                {(['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'] as const).map(level => {
                  const colors: Record<string, string> = {
                    'Nhận biết': 'bg-green-600 border-green-600 text-white',
                    'Thông hiểu': 'bg-blue-600 border-blue-600 text-white',
                    'Vận dụng': 'bg-amber-600 border-amber-600 text-white',
                    'Vận dụng cao': 'bg-red-600 border-red-600 text-white',
                  };
                  return (
                    <button
                      key={level}
                      onClick={() => toggleLevel(level)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                        filterLevels.has(level)
                          ? colors[level]
                          : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>

              {/* Thời gian upload */}
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {([
                  { key: 'All', label: 'Tất cả' },
                  { key: '1h', label: '⚡ Vừa upload' },
                  { key: 'today', label: 'Hôm nay' },
                  { key: '7d', label: '7 ngày' },
                  { key: '30d', label: '30 ngày' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilterTime(key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      filterTime === key
                        ? "bg-cyan-600 border-cyan-600 text-white shadow-lg shadow-cyan-600/20"
                        : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Trạng thái duyệt */}
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                {([
                  { key: 'All', label: 'Mọi trạng thái' },
                  { key: 'published', label: 'Đã duyệt' },
                  { key: 'draft', label: 'Nháp' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilterStatus(key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      filterStatus === key
                        ? "bg-fuchsia-600 border-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20"
                        : "bg-slate-800/50 border-slate-800 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ══════════ THANH KẾT QUẢ + RESET ══════════ */}
            <div className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-2.5 border border-slate-800">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleSelectAll}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                    selectedIds.size === paginatedQuestions.length && paginatedQuestions.length > 0
                      ? "bg-red-600 border-red-600 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                  )}
                  disabled={paginatedQuestions.length === 0}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors",
                    selectedIds.size > 0 ? "border-white bg-white text-red-600" : "border-slate-500"
                  )}>
                    {selectedIds.size > 0 && <Check className="w-2.5 h-2.5" />}
                  </div>
                  Chọn tất cả ({currentPage})
                </button>
                <span className="text-xs text-slate-400 font-bold">
                  {hasActiveFilters ? (
                    <>Tìm thấy <span className="text-red-400 text-sm font-black">{filtered.length}</span> / {questions.length} câu hỏi</>
                  ) : (
                    <>Hiển thị tất cả <span className="text-white font-black">{questions.length}</span> câu hỏi</>
                  )}
                  {totalPages > 1 && (
                    <span className="ml-2 text-slate-500">· Trang {currentPage}/{totalPages}</span>
                  )}
                </span>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={resetAllFilters}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-600/10 hover:bg-amber-600/20 px-3 py-1.5 rounded-lg border border-amber-600/20 transition-all"
                >
                  <RotateCcw className="w-3 h-3" /> Xóa bộ lọc
                </button>
              )}
            </div>

            {/* ── Danh sách câu hỏi ── */}
            {loading ? (
              <div className="py-20 text-center animate-pulse text-slate-500">Đang tải kho dữ liệu...</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                {filtered.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center space-y-6 border-2 border-dashed border-slate-800 rounded-[2.5rem] bg-slate-950/30">
                    <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-800">
                      <BookOpen className="text-slate-700 w-10 h-10" />
                    </div>
                    <div className="max-w-xs">
                      <h4 className="text-white font-bold uppercase tracking-widest">Không có câu hỏi</h4>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        {hasActiveFilters
                          ? 'Không tìm thấy câu hỏi nào phù hợp với bộ lọc hiện tại.'
                          : <>Thầy hãy sử dụng tính năng <span className="text-red-500 font-bold">"Số hóa đề"</span> để bắt đầu xây dựng ngân hàng câu hỏi thông minh.</>
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  paginatedQuestions.map((q) => {
                    const isSelected = selectedIds.has(q.id!);
                    return (
                    <div key={q.id} className={cn(
                      "bg-slate-950 border p-6 rounded-2xl space-y-4 relative group transition-all",
                      hasImageIssue(q) ? "border-red-600/30" : isSelected ? "border-red-500 bg-slate-900 border-2" : "border-slate-800",
                      editingId === q.id && "ring-2 ring-blue-500/50"
                    )}>
                      
                      {/* ── Checkbox Chọn ── */}
                      <button
                        onClick={() => {
                          const next = new Set(selectedIds);
                          if (next.has(q.id!)) next.delete(q.id!); else next.add(q.id!);
                          setSelectedIds(next);
                        }}
                        className={cn(
                          "absolute top-4 left-4 w-5 h-5 rounded border-2 flex items-center justify-center transition-all focus:outline-none z-10",
                          isSelected ? "bg-red-600 border-red-600" : "border-slate-600 hover:border-slate-400"
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>

                      {/* ── Action buttons ── */}
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => editingId === q.id ? cancelEdit() : startEdit(q)}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            editingId === q.id 
                              ? "bg-slate-700 text-white" 
                              : "bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white"
                          )}
                          title={editingId === q.id ? 'Hủy sửa' : 'Sửa câu hỏi'}
                        >
                          {editingId === q.id ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => deleteQuestion(q.id!)}
                          className="p-2 bg-red-600/10 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-all"
                          title="Xóa câu hỏi"
                        >
                          <LogOut className="w-4 h-4 rotate-180" />
                        </button>
                      </div>
                      
                      {/* ── Badges ── */}
                      <div className="flex items-center gap-2 flex-wrap pl-6 md:pl-8">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded",
                          q.part === 1 ? "bg-blue-600 text-white" : q.part === 2 ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"
                        )}>
                          Phần {q.part === 1 ? 'I' : q.part === 2 ? 'II' : 'III'}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 px-2 py-1 rounded text-slate-400">
                          {q?.topic || 'Chưa phân loại'} - {q?.level || '—'}
                        </span>
                        {q.groupId && (
                          <span className="text-[10px] font-bold bg-purple-600/20 text-purple-400 px-2 py-1 rounded border border-purple-600/30" title="Câu kép — dùng chung đề bài">
                            🔗 Cặp {q.groupId}
                          </span>
                        )}
                        {q.clusterId && (
                          <span className="text-[10px] font-bold bg-fuchsia-600/20 text-fuchsia-400 px-2 py-1 rounded border border-fuchsia-600/30" title="Câu chùm">
                            📦 Thuộc Câu Chùm
                          </span>
                        )}
                        {hasImageIssue(q) && (
                          <span className="text-[10px] font-bold bg-red-600/20 text-red-400 px-2 py-1 rounded animate-pulse">
                            ⚠️ Cần bổ sung ảnh
                          </span>
                        )}
                        <button
                          onClick={() => toggleStatus(q)}
                          className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded transition-all flex items-center gap-1 cursor-pointer hover:opacity-80 border",
                            (q.status || 'published') === 'draft' 
                              ? "bg-slate-700/50 text-slate-300 border-slate-600" 
                              : "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
                          )}
                          title="Bấm để đổi trạng thái"
                        >
                          {(q.status || 'published') === 'draft' ? (
                            <><Clock className="w-3 h-3" /> Đang nháp</>
                          ) : (
                            <><CheckCircle2 className="w-3 h-3" /> Đã duyệt</>
                          )}
                        </button>
                      </div>

                      {/* ── EDIT FORM ── */}
                      {editingId === q.id ? (
                        <div className="space-y-4">
                          {/* Logic Câu Lừa */}
                          <div className="flex items-center gap-4 mb-2">
                             <label className="flex items-center gap-3 text-sm font-bold cursor-pointer bg-red-500/10 hover:bg-red-500/20 px-4 py-3 rounded-xl border border-red-500/30 transition-colors w-full sm:w-auto text-red-400">
                                <input 
                                  type="checkbox" 
                                  checked={editIsTrap} 
                                  onChange={(e) => setEditIsTrap(e.target.checked)} 
                                  className="w-4 h-4 text-red-500 rounded bg-slate-900 border-red-500/50 focus:ring-red-500/50 focus:ring-offset-slate-900 cursor-pointer"
                                />
                                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                                Đánh dấu đây là "Câu Lừa / Bẫy Sai Ngu"
                             </label>
                          </div>

                          {/* Nội dung câu hỏi */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Nội dung câu hỏi</label>
                              <button 
                                onClick={() => handleImageInsert('content')}
                                className="flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                <ImagePlus className="w-3 h-3" /> Chèn ảnh
                              </button>
                            </div>
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 font-mono min-h-[120px] focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none resize-y"
                            />
                          </div>

                          {/* ── Phần I: Sửa đáp án A/B/C/D ── */}
                          {q.part === 1 && editOptions.length > 0 && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Các phương án (chọn đáp án đúng)</label>
                              <div className="space-y-2">
                                {editOptions.map((opt, idx) => (
                                  <div key={idx} className={cn(
                                    "flex items-center gap-3 p-2 rounded-xl border transition-all",
                                    editCorrectAnswer === idx ? "border-green-600/50 bg-green-600/5" : "border-slate-800 bg-slate-900/50"
                                  )}>
                                    <button
                                      onClick={() => setEditCorrectAnswer(idx)}
                                      className={cn(
                                        "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 font-black text-[10px] transition-all",
                                        editCorrectAnswer === idx
                                          ? "border-green-500 bg-green-500 text-white"
                                          : "border-slate-600 text-slate-600 hover:border-green-400"
                                      )}
                                      title="Chọn làm đáp án đúng"
                                    >
                                      {String.fromCharCode(65 + idx)}
                                    </button>
                                    <textarea
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...editOptions];
                                        newOpts[idx] = e.target.value;
                                        setEditOptions(newOpts);
                                      }}
                                      className="flex-1 bg-transparent text-sm text-slate-200 outline-none border-b border-slate-700 focus:border-blue-500 pb-0.5 font-mono min-h-[40px] resize-none"
                                      placeholder={`Phương án ${String.fromCharCode(65 + idx)}...`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ── Phần II: Sửa ý a/b/c/d + Đúng/Sai ── */}
                          {q.part === 2 && editOptions.length > 0 && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Các ý a/b/c/d (click để đổi Đúng↔Sai)</label>
                              <div className="space-y-2">
                                {editOptions.map((opt, idx) => {
                                  const isTrue = Array.isArray(editCorrectAnswer) ? editCorrectAnswer[idx] === true : false;
                                  return (
                                    <div key={idx} className={cn(
                                      "flex items-start gap-3 p-2 rounded-xl border transition-all",
                                      isTrue ? "border-green-600/50 bg-green-600/5" : "border-red-600/30 bg-red-600/5"
                                    )}>
                                      <button
                                        onClick={() => {
                                          if (!Array.isArray(editCorrectAnswer)) return;
                                          const next = [...editCorrectAnswer];
                                          next[idx] = !next[idx];
                                          setEditCorrectAnswer(next);
                                        }}
                                        className={cn(
                                          "mt-0.5 flex-shrink-0 w-14 h-6 rounded-full text-[9px] font-black uppercase border transition-all",
                                          isTrue
                                            ? "bg-green-600/20 border-green-600/50 text-green-400"
                                            : "bg-red-600/20 border-red-600/30 text-red-400"
                                        )}
                                        title="Click để đổi Đúng/Sai"
                                      >
                                        {isTrue ? '✓ Đúng' : '✗ Sai'}
                                      </button>
                                      <span className="text-red-400 font-black text-xs mt-1 flex-shrink-0">
                                        {String.fromCharCode(97 + idx)}.
                                      </span>
                                      <textarea
                                        value={opt}
                                        onChange={(e) => {
                                          const newOpts = [...editOptions];
                                          newOpts[idx] = e.target.value;
                                          setEditOptions(newOpts);
                                        }}
                                        className="flex-1 bg-transparent text-sm text-slate-200 outline-none border-b border-slate-700 focus:border-blue-500 min-h-[40px] resize-none font-mono"
                                        placeholder={`Ý ${String.fromCharCode(97 + idx)}...`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Phần III: Sửa đáp số ── */}
                          {q.part === 3 && (
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Đáp án số</label>
                              <input
                                type="number"
                                step="any"
                                value={editCorrectAnswer ?? ''}
                                onChange={(e) => setEditCorrectAnswer(e.target.value)}
                                className="w-40 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                                placeholder="0.00"
                              />
                            </div>
                          )}

                          {/* Lời giải */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Lời giải</label>
                              <button 
                                onClick={() => handleImageInsert('explanation')}
                                className="flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                              >
                                <ImagePlus className="w-3 h-3" /> Chèn ảnh
                              </button>
                            </div>
                            <textarea
                              value={editExplanation}
                              onChange={(e) => setEditExplanation(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 font-mono min-h-[80px] focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none resize-y"
                            />
                          </div>
                          {/* Preview */}
                          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Xem trước nội dung:</p>
                            <div className="text-sm text-slate-200"><MathRenderer content={editContent} /></div>
                          </div>
                          <div className="flex gap-3">
                            <button 
                              onClick={() => saveEdit(q)}
                              disabled={editSaving}
                              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                            >
                              <Save className="w-3.5 h-3.5" />
                              {editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </button>
                            <button 
                              onClick={cancelEdit}
                              className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-all"
                            >
                              <X className="w-3.5 h-3.5" /> Hủy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-200 text-sm leading-relaxed">
                          <MathRenderer content={q?.content || 'Chưa có nội dung câu hỏi.'} />
                        </div>
                      )}

                      <AnimatePresence>
                        {expandedId === q.id && editingId !== q.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden space-y-6 pt-4 border-t border-slate-800"
                          >
                            {q.tags?.includes('__needs_answer_review') && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-3">
                                <span className="text-amber-400 text-xs font-bold">⚠️ Đáp án chưa chắc chắn — Cần kiểm tra thủ công</span>
                              </div>
                            )}

                            {q.part === 1 && q.options && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {q.options.map((opt, idx) => (
                                  <div 
                                    key={idx} 
                                    className={cn(
                                      "p-3 rounded-xl border text-sm flex items-center gap-3",
                                      idx === (q.correctAnswer as number) 
                                        ? "bg-green-600/10 border-green-600/50 text-green-400" 
                                        : "bg-slate-900 border-slate-800 text-slate-400"
                                    )}
                                  >
                                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black">
                                      {String.fromCharCode(65 + idx)}
                                    </span>
                                    <div className="text-base md:text-lg flex-1 overflow-x-auto min-w-0 break-words whitespace-normal">
                                      <MathRenderer content={opt} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {q.part === 2 && q.options && (
                              <div className="space-y-2">
                                {q.options.map((opt, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
                                    <div className="flex items-center gap-3 text-sm text-slate-300">
                                      <span className="text-red-500 font-bold">{String.fromCharCode(97 + idx)}.</span>
                                      <MathRenderer content={opt} />
                                    </div>
                                    <span className={cn(
                                      "text-[10px] font-bold uppercase px-2 py-1 rounded",
                                      (q.correctAnswer as boolean[])[idx] ? "bg-green-600/20 text-green-500" : "bg-red-600/20 text-red-500"
                                    )}>
                                      {(q.correctAnswer as boolean[])[idx] ? 'Đúng' : 'Sai'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {q.part === 3 && (
                              <div className="p-4 bg-blue-600/10 border border-blue-600/30 rounded-xl flex items-center justify-between">
                                <span className="text-sm font-bold text-blue-400 uppercase tracking-wider">Đáp án ngắn:</span>
                                <span className="text-xl font-black text-white">{String(q.correctAnswer).replace('.', ',')}</span>
                              </div>
                            )}

                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                                <BrainCircuit className="w-3 h-3" /> Hướng dẫn giải chi tiết
                              </p>
                              <div className="text-sm text-slate-400 italic leading-relaxed bg-slate-900/50 p-4 rounded-xl border border-slate-800/50">
                                <MathRenderer content={q?.explanation || 'Chưa có lời giải chi tiết.'} />
                              </div>
                            </div>

                            {(q.resources?.length || q.simulationUrl) && (
                              <div className="space-y-4 pt-4 border-t border-slate-800">
                                <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                                  <Info className="w-3 h-3" /> Học liệu & Mô phỏng đi kèm
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {q.simulationUrl && (
                                    <div className="flex items-center gap-3 p-3 bg-red-600/5 border border-red-600/20 rounded-xl">
                                      <FlaskConical className="w-4 h-4 text-red-500" />
                                      <span className="text-xs text-slate-300 font-medium">Có mô phỏng thí nghiệm ảo</span>
                                    </div>
                                  )}
                                  {q.resources?.map((res, ri) => (
                                    <div key={ri} className="flex items-center gap-3 p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                                      {res.type === 'video' ? <Video className="w-4 h-4 text-red-500" /> : <BookOpen className="w-4 h-4 text-blue-500" />}
                                      <span className="text-xs text-slate-400 truncate">{res.title}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                        <div className="flex gap-1 flex-wrap">
                          {q.tags?.map(tag => (
                            <span key={tag} className="text-[9px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">#{tag}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* ── Nút chèn ảnh nhanh — LUÔN HIỆN ── */}
                          {editingId !== q.id && (
                            <button 
                              onClick={() => handleQuickImageInsert(q)}
                              disabled={quickImgSaving === q.id}
                              className={cn(
                                "text-[10px] font-bold flex items-center gap-1 transition-colors",
                                quickImgSaving === q.id
                                  ? "text-amber-400 animate-pulse"
                                  : "text-indigo-400 hover:text-indigo-300"
                              )}
                            >
                              <ImagePlus className="w-3 h-3" />
                              {quickImgSaving === q.id ? 'Đang lưu...' : 'Chèn ảnh'}
                            </button>
                          )}
                          {editingId !== q.id && (
                            <button 
                              onClick={() => startEdit(q)}
                              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" /> Sửa
                            </button>
                          )}
                          <button 
                            onClick={() => setExpandedId(expandedId === q.id ? null : q.id!)}
                            className="text-[10px] font-bold text-red-500 hover:underline"
                          >
                            {expandedId === q.id ? 'Thu gọn' : 'Xem chi tiết & Lời giải'}
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ══════════ PAGINATION ══════════ */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Trước
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) {
                      page = i + 1;
                    } else if (currentPage <= 4) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 3) {
                      page = totalPages - 6 + i;
                    } else {
                      page = currentPage - 3 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={cn(
                          "w-9 h-9 rounded-xl text-xs font-bold transition-all",
                          page === currentPage
                            ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                        )}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Sau <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          </div>{/* end CỘT PHẢI */}
        </div>{/* end LAYOUT 2 CỘT */}
      </div>{/* end flex-col gap-4 wrapper */}

      {/* ══════════ FLOATING BULK DELETE BAR ══════════ */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl shadow-black/50"
          >
            <div className="flex items-center gap-2 px-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-600/20 text-red-500 font-black text-[10px]">
                {selectedIds.size}
              </span>
              <span className="text-sm font-bold text-slate-300">câu đã chọn</span>
            </div>
            
            <div className="w-px h-8 bg-slate-700 hidden md:block"></div>
            
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={deleteSelectedQuestions}
              disabled={isDeletingBulk}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
            >
              {isDeletingBulk ? 'Đang xóa...' : (
                <>
                  <LogOut className="w-4 h-4 rotate-180" /> Xóa {selectedIds.size} câu
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default QuestionBank;
