// ═══════════════════════════════════════════════════════════════════
//  MINDMAP MODULE — ZUSTAND STORE
//  State management for mindmap viewer & admin panel
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type { MindmapChapter } from './types';
import { db, collection, getDocs, query, where, doc, setDoc, deleteDoc, Timestamp } from '../../firebase';
import { chapterToSlug } from './utils';

interface MindmapState {
  // Data
  chapters: MindmapChapter[];
  activeChapter: MindmapChapter | null;
  focusedNodeId: string | null;
  
  // Admin
  isAdminMode: boolean;
  jsonInput: string;
  isSaving: boolean;
  
  // Loading
  isLoading: boolean;
  error: string | null;

  // Actions
  setActiveChapter: (chapter: MindmapChapter | null) => void;
  setFocusedNode: (nodeId: string | null) => void;
  setJsonInput: (json: string) => void;
  setAdminMode: (val: boolean) => void;

  loadChaptersByGrade: (grade: string) => Promise<void>;
  saveChapter: (chapter: MindmapChapter, adminUid: string) => Promise<void>;
  deleteChapter: (grade: string, chapterName: string) => Promise<void>;
}

export const useMindmapStore = create<MindmapState>((set, get) => ({
  chapters: [],
  activeChapter: null,
  focusedNodeId: null,
  isAdminMode: false,
  jsonInput: '',
  isSaving: false,
  isLoading: false,
  error: null,

  setActiveChapter: (chapter) => set({ activeChapter: chapter, focusedNodeId: null }),
  setFocusedNode: (nodeId) => set({ focusedNodeId: nodeId }),
  setJsonInput: (json) => set({ jsonInput: json }),
  setAdminMode: (val) => set({ isAdminMode: val }),

  loadChaptersByGrade: async (grade: string) => {
    set({ isLoading: true, error: null, chapters: [] });
    try {
      console.info(`[Mindmap] Đang tải sơ đồ khối ${grade}...`);
      const q = query(collection(db, 'mindmaps'), where('grade', '==', grade));
      const snap = await getDocs(q);
      console.info(`[Mindmap] Kết quả: ${snap.docs.length} chương`);
      const chapters = snap.docs.map(d => ({
        ...d.data(),
      } as MindmapChapter));
      set({ chapters, isLoading: false });
    } catch (err: any) {
      console.error('[Mindmap] Lỗi load chapters:', err?.code, err?.message, err);
      const isPermission = err?.code === 'permission-denied';
      const isIndex = err?.message?.includes('index') || err?.message?.includes('requires an index');
      const errorMsg = isPermission
        ? 'Không có quyền truy cập. Vui lòng đăng nhập lại.'
        : isIndex
        ? 'Firestore cần tạo index. Vui lòng báo admin.'
        : `Lỗi tải dữ liệu: ${err?.message || 'Không xác định'}`;
      set({ error: errorMsg, isLoading: false });
    }
  },

  saveChapter: async (chapter: MindmapChapter, adminUid: string) => {
    set({ isSaving: true, error: null });
    try {
      const docId = chapterToSlug(chapter.grade, chapter.chapter);
      const docRef = doc(db, 'mindmaps', docId);
      await setDoc(docRef, {
        ...chapter,
        createdBy: adminUid,
        updatedAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      }, { merge: true });
      
      // Reload chapters for current grade
      const { chapters } = get();
      const existingIdx = chapters.findIndex(c => 
        c.grade === chapter.grade && c.chapter === chapter.chapter
      );
      if (existingIdx >= 0) {
        const updated = [...chapters];
        updated[existingIdx] = chapter;
        set({ chapters: updated, isSaving: false });
      } else {
        set({ chapters: [...chapters, chapter], isSaving: false });
      }
    } catch (err: any) {
      console.error('[Mindmap] Lỗi lưu chapter:', err);
      set({ error: 'Lỗi lưu sơ đồ tư duy: ' + (err.message || ''), isSaving: false });
    }
  },

  deleteChapter: async (grade: string, chapterName: string) => {
    set({ isSaving: true, error: null });
    try {
      const docId = chapterToSlug(grade, chapterName);
      await deleteDoc(doc(db, 'mindmaps', docId));
      
      const { chapters } = get();
      set({ 
        chapters: chapters.filter(c => !(c.grade === grade && c.chapter === chapterName)),
        isSaving: false 
      });
    } catch (err: any) {
      console.error('[Mindmap] Lỗi xóa chapter:', err);
      set({ error: 'Lỗi xóa sơ đồ tư duy: ' + (err.message || ''), isSaving: false });
    }
  },
}));
