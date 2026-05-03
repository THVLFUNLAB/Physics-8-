/**
 * useTeacherPortal.ts — Master Hook cho Teacher Portal
 * Quản lý toàn bộ state: classes, assignments, exams, materials.
 * Dùng lazy-loading: chỉ fetch khi tab được mở lần đầu.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UserProfile, Exam, LearningMaterial, DynamicMatrixFormula } from '../../types';
import type { TeacherClassSummary, AssignmentWithMeta, TeacherOverviewStats, TeacherTabId } from './types';
import {
  getTeacherClasses,
  getTeacherAssignments,
  getTeacherExams,
  getTeacherMaterials,
  getTeacherMatrices,
  createTeacherClass,
  assignExamToClass,
  closeAssignment,
  saveTeacherMatrix,
  saveMaterialMetadata,
  shareMaterialToClasses,
  requestPublicApproval,
} from './services/teacherClassService';
import { toast } from '../../components/Toast';

// ─── State Shape ──────────────────────────────────────────────────────────────
interface TeacherPortalState {
  // Navigation
  activeTab: TeacherTabId;

  // Data
  classes: TeacherClassSummary[];
  selectedClassId: string | null;
  assignments: AssignmentWithMeta[];
  exams: Exam[];
  materials: LearningMaterial[];
  matrices: DynamicMatrixFormula[];

  // Loading flags per section (lazy-load)
  loading: {
    classes: boolean;
    assignments: boolean;
    exams: boolean;
    materials: boolean;
    matrices: boolean;
  };

  // Derived stats (computed from classes + assignments)
  overviewStats: TeacherOverviewStats;
}

// ─── Initial State ─────────────────────────────────────────────────────────────
const INITIAL_LOADING = {
  classes: false,
  assignments: false,
  exams: false,
  materials: false,
  matrices: false,
};

export function useTeacherPortal(user: UserProfile) {
  const teacherId = user.uid;

  const [activeTab, setActiveTab] = useState<TeacherTabId>('overview');
  const [classes, setClasses] = useState<TeacherClassSummary[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithMeta[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [matrices, setMatrices] = useState<DynamicMatrixFormula[]>([]);
  const [loading, setLoading] = useState({ ...INITIAL_LOADING });

  // Tracker: đã fetch section nào (tránh fetch lại khi switch tab)
  const fetched = useRef<Set<string>>(new Set());

  // ── Derived overview stats ──────────────────────────────────────────────────
  const overviewStats: TeacherOverviewStats = {
    totalClasses: classes.length,
    totalStudents: classes.reduce((acc, c) => acc + c.studentCount, 0),
    activeAssignments: assignments.filter(a => a.status === 'active').length,
    submissionsToday: assignments.reduce((acc, a) => acc + (a.submittedCount ?? 0), 0),
    isLoading: loading.classes || loading.assignments,
  };

  // ── Fetch classes (luôn fetch khi mount) ─────────────────────────────────────
  const fetchClasses = useCallback(async () => {
    if (fetched.current.has('classes')) return;
    setLoading(prev => ({ ...prev, classes: true }));
    try {
      const data = await getTeacherClasses(teacherId);
      setClasses(data);
      if (data.length > 0 && !selectedClassId) {
        setSelectedClassId(data[0].id ?? null);
      }
      fetched.current.add('classes');
    } catch (e) {
      console.error('[TeacherPortal] Lỗi load classes:', e);
      toast.error('Không thể tải danh sách lớp.');
    } finally {
      setLoading(prev => ({ ...prev, classes: false }));
    }
  }, [teacherId, selectedClassId]);

  // ── Fetch assignments (khi mở tab exam-hub hoặc overview) ─────────────────
  const fetchAssignments = useCallback(async () => {
    if (fetched.current.has('assignments')) return;
    setLoading(prev => ({ ...prev, assignments: true }));
    try {
      const data = await getTeacherAssignments(teacherId);
      setAssignments(data);
      fetched.current.add('assignments');
    } catch (e) {
      console.error('[TeacherPortal] Lỗi load assignments:', e);
    } finally {
      setLoading(prev => ({ ...prev, assignments: false }));
    }
  }, [teacherId]);

  // ── Fetch exams (lazy: khi mở tab exam-hub) ──────────────────────────────
  const fetchExams = useCallback(async () => {
    if (fetched.current.has('exams')) return;
    setLoading(prev => ({ ...prev, exams: true }));
    try {
      const data = await getTeacherExams(teacherId);
      setExams(data);
      fetched.current.add('exams');
    } catch (e) {
      console.error('[TeacherPortal] Lỗi load exams:', e);
      toast.error('Không thể tải danh sách đề thi.');
    } finally {
      setLoading(prev => ({ ...prev, exams: false }));
    }
  }, [teacherId]);

  // ── Fetch materials (lazy: khi mở tab materials) ─────────────────────────
  const fetchMaterials = useCallback(async () => {
    if (fetched.current.has('materials')) return;
    setLoading(prev => ({ ...prev, materials: true }));
    try {
      const data = await getTeacherMaterials(teacherId);
      setMaterials(data);
      fetched.current.add('materials');
    } catch (e) {
      console.error('[TeacherPortal] Lỗi load materials:', e);
      toast.error('Không thể tải kho học liệu.');
    } finally {
      setLoading(prev => ({ ...prev, materials: false }));
    }
  }, [teacherId]);

  // ── Fetch matrices (lazy: khi mở tab exam-hub) ────────────────────────────
  const fetchMatrices = useCallback(async (grade?: number) => {
    if (fetched.current.has('matrices')) return;
    setLoading(prev => ({ ...prev, matrices: true }));
    try {
      const data = await getTeacherMatrices(teacherId, grade);
      setMatrices(data);
      fetched.current.add('matrices');
    } catch (e) {
      console.error('[TeacherPortal] Lỗi load matrices:', e);
    } finally {
      setLoading(prev => ({ ...prev, matrices: false }));
    }
  }, [teacherId]);

  // ── Auto-fetch theo tab đang active ─────────────────────────────────────────
  useEffect(() => {
    fetchClasses();
    fetchAssignments(); // Cần cho overview stats
  }, [fetchClasses, fetchAssignments]);

  useEffect(() => {
    if (activeTab === 'exam-hub') {
      fetchExams();
      fetchMatrices();
    }
    if (activeTab === 'personalized') {
      fetchExams();
    }
    if (activeTab === 'materials') {
      fetchMaterials();
    }
  }, [activeTab, fetchExams, fetchMatrices, fetchMaterials]);

  // ═══ ACTIONS ════════════════════════════════════════════════════════════════

  /** Tạo lớp mới */
  const handleCreateClass = useCallback(async (name: string, grade?: number) => {
    try {
      const id = await createTeacherClass(teacherId, name, grade);
      toast.success(`Đã tạo lớp "${name}" thành công!`);
      // Refresh classes
      fetched.current.delete('classes');
      await fetchClasses();
      return id;
    } catch (e) {
      toast.error('Không thể tạo lớp. Vui lòng thử lại.');
      throw e;
    }
  }, [teacherId, fetchClasses]);

  /** Phát đề cho lớp */
  const handleAssignExam = useCallback(async (params: Parameters<typeof assignExamToClass>[0]) => {
    try {
      const id = await assignExamToClass(params);
      toast.success('Đã phát đề thành công!');
      fetched.current.delete('assignments');
      await fetchAssignments();
      return id;
    } catch (e) {
      toast.error('Không thể phát đề. Vui lòng thử lại.');
      throw e;
    }
  }, [fetchAssignments]);

  /** Đóng assignment */
  const handleCloseAssignment = useCallback(async (assignmentId: string) => {
    try {
      await closeAssignment(assignmentId);
      setAssignments(prev =>
        prev.map(a => a.id === assignmentId ? { ...a, status: 'closed' } : a)
      );
      toast.success('Đã đóng bài kiểm tra.');
    } catch {
      toast.error('Không thể đóng bài kiểm tra.');
    }
  }, []);

  /** Lưu ma trận mới */
  const handleSaveMatrix = useCallback(async (
    matrix: Omit<DynamicMatrixFormula, 'id' | 'createdAt' | 'createdBy'>
  ) => {
    try {
      await saveTeacherMatrix(teacherId, matrix);
      toast.success('Đã lưu ma trận đề thi!');
      fetched.current.delete('matrices');
      await fetchMatrices();
    } catch {
      toast.error('Không thể lưu ma trận.');
    }
  }, [teacherId, fetchMatrices]);

  /** Lưu học liệu mới */
  const handleSaveMaterial = useCallback(async (material: Omit<LearningMaterial, 'id'>) => {
    try {
      const id = await saveMaterialMetadata(material);
      toast.success('Đã lưu học liệu!');
      fetched.current.delete('materials');
      await fetchMaterials();
      return id;
    } catch {
      toast.error('Không thể lưu học liệu.');
      throw new Error('Save material failed');
    }
  }, [fetchMaterials]);

  /** Chia sẻ học liệu cho lớp */
  const handleShareMaterial = useCallback(async (materialId: string, classIds: string[]) => {
    try {
      await shareMaterialToClasses(materialId, classIds);
      toast.success('Đã chia sẻ học liệu với lớp!');
      fetched.current.delete('materials');
      await fetchMaterials();
    } catch {
      toast.error('Không thể chia sẻ học liệu.');
    }
  }, [fetchMaterials]);

  /** Xin duyệt public */
  const handleRequestPublic = useCallback(async (materialId: string) => {
    try {
      await requestPublicApproval(materialId);
      toast.success('Đã gửi yêu cầu duyệt tới Admin!');
      setMaterials(prev =>
        prev.map(m => m.id === materialId
          ? { ...m, visibility: 'public', approvalStatus: 'pending' }
          : m
        )
      );
    } catch {
      toast.error('Không thể gửi yêu cầu duyệt.');
    }
  }, []);

  return {
    // State
    activeTab,
    setActiveTab,
    classes,
    selectedClassId,
    setSelectedClassId,
    assignments,
    exams,
    materials,
    matrices,
    loading,
    overviewStats,

    // Actions
    handleCreateClass,
    handleAssignExam,
    handleCloseAssignment,
    handleSaveMatrix,
    handleSaveMaterial,
    handleShareMaterial,
    handleRequestPublic,

    // Manual refresh
    refreshClasses: () => { fetched.current.delete('classes'); fetchClasses(); },
    refreshAssignments: () => { fetched.current.delete('assignments'); fetchAssignments(); },
    refreshExams: () => { fetched.current.delete('exams'); fetchExams(); },
    refreshMaterials: () => { fetched.current.delete('materials'); fetchMaterials(); },
  };
}
