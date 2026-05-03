/**
 * ═══════════════════════════════════════════════════════════════════
 *  teacherClassService.ts — Firestore Data Access Layer
 *  Scoped theo teacherId: GV chỉ thấy dữ liệu của lớp mình quản lý.
 *
 *  CHIẾN LƯỢC TỐI ƯU CHI PHÍ FIRESTORE READS:
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  Operation                    │ Kỹ thuật         │ Read cost │
 *  │───────────────────────────────│──────────────────│───────────│
 *  │  Lấy lớp của GV              │ Query teacherId  │ n reads   │
 *  │  Lấy assignments của GV      │ Query teacherId  │ n reads   │
 *  │  Question Pool (sinh đề)     │ sessionStorage   │ 0 (cache) │
 *  │  Lấy attempts theo lớp       │ Query classId    │ n reads   │
 *  └──────────────────────────────────────────────────────────────┘
 * ═══════════════════════════════════════════════════════════════════
 */

import {
  db, collection, query, where, getDocs, getDoc,
  doc, addDoc, setDoc, updateDoc, orderBy, limit, Timestamp,
} from '../../../firebase';
import type {
  ClassRoom, Exam, TeacherExamAssignment, LearningMaterial,
  DynamicMatrixFormula, Question, QuestionLevel,
} from '../../../types';
import type { TeacherClassSummary, AssignmentWithMeta } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────
const POOL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút
const POOL_MULTIPLIER = 3;                  // Lấy nhiều hơn để shuffle có ý nghĩa
const MAX_POOL_SIZE = 200;

// ═══════════════════════════════════════════════════════════════════
//  SECTION 1: CLASS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Lấy tất cả lớp học mà GV này quản lý.
 * Query: classes where teacherId == uid
 */
export async function getTeacherClasses(teacherId: string): Promise<TeacherClassSummary[]> {
  const q = query(
    collection(db, 'classes'),
    where('teacherId', '==', teacherId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = { id: d.id, ...d.data() } as ClassRoom;
    return {
      ...data,
      studentCount: data.studentIds?.length ?? 0,
      activeAssignments: 0, // Lazy-loaded riêng
    } as TeacherClassSummary;
  });
}

/**
 * Tạo lớp học mới cho GV.
 * Tạo mã lớp 6 ký tự ngẫu nhiên (tương tự ClassManager hiện tại).
 */
export async function createTeacherClass(
  teacherId: string,
  name: string,
  grade?: number
): Promise<string> {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const ref = await addDoc(collection(db, 'classes'), {
    code,
    name,
    teacherId,
    grade: grade ?? null,
    studentIds: [],
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 2: EXAM ASSIGNMENTS (GV phát đề cho lớp)
// ═══════════════════════════════════════════════════════════════════

/**
 * Lấy tất cả assignments của GV, kèm exam title và class name (denormalized).
 */
export async function getTeacherAssignments(
  teacherId: string
): Promise<AssignmentWithMeta[]> {
  const q = query(
    collection(db, 'teacherExamAssignments'),
    where('teacherId', '==', teacherId),
    orderBy('assignedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = { id: d.id, ...d.data() } as TeacherExamAssignment;
    const submitted = data.submittedCount ?? 0;
    const total = data.totalStudents ?? 1;
    return {
      ...data,
      examTitle: data.examTitle || '—',
      className: data.className || '—',
      progressPercent: Math.round((submitted / total) * 100),
    } as AssignmentWithMeta;
  });
}

/**
 * GV phát đề cho 1 lớp.
 * Lưu assignment vào 'teacherExamAssignments'.
 * Đồng thời cập nhật allowedClassIds trong exam document.
 */
export async function assignExamToClass(params: {
  teacherId: string;
  examId: string;
  examTitle: string;
  classId: string;
  className: string;
  deadline?: Date;
  allowReview: boolean;
  showLeaderboard: boolean;
  randomizeQuestions?: boolean;
}): Promise<string> {
  const {
    teacherId, examId, examTitle, classId, className,
    deadline, allowReview, showLeaderboard, randomizeQuestions,
  } = params;

  // Lấy số HS trong lớp tại thời điểm phát
  const classDoc = await getDoc(doc(db, 'classes', classId));
  const totalStudents = classDoc.exists()
    ? (classDoc.data()?.studentIds?.length ?? 0)
    : 0;

  const assignment: Omit<TeacherExamAssignment, 'id'> = {
    teacherId,
    examId,
    examTitle,
    classId,
    className,
    status: 'active',
    assignedAt: Timestamp.now(),
    availableFrom: Timestamp.now(),
    deadline: deadline ? Timestamp.fromDate(deadline) : undefined,
    allowReview,
    showLeaderboard,
    randomizeQuestions: randomizeQuestions ?? false,
    submittedCount: 0,
    totalStudents,
  };

  const ref = await addDoc(
    collection(db, 'teacherExamAssignments'),
    assignment
  );

  // Cập nhật exam document: thêm classId vào allowedClassIds
  await updateDoc(doc(db, 'exams', examId), {
    visibility: 'class',
    allowedClassIds: [classId], // NOTE: dùng arrayUnion nếu muốn multi-class
  });

  return ref.id;
}

/**
 * Đóng assignment (không cho HS nộp thêm).
 */
export async function closeAssignment(assignmentId: string): Promise<void> {
  await updateDoc(
    doc(db, 'teacherExamAssignments', assignmentId),
    { status: 'closed' }
  );
}

/**
 * Tăng submittedCount khi HS nộp bài.
 * Gọi từ App.tsx submitTest() sau khi lưu attempt thành công.
 * Tránh double-count bằng cách kiểm tra attempt hiện tại.
 *
 * @param examId  - ID đề thi
 * @param classId - Lớp của HS
 */
export async function incrementAssignmentSubmission(
  examId: string,
  classId: string,
): Promise<void> {
  try {
    const q = query(
      collection(db, 'teacherExamAssignments'),
      where('examId', '==', examId),
      where('classId', '==', classId),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map(d => {
        const current = (d.data().submittedCount as number) ?? 0;
        return updateDoc(d.ref, { submittedCount: current + 1 });
      })
    );
  } catch (err) {
    console.warn('[teacherClassService] incrementAssignmentSubmission error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 3: EXAM LIBRARY (GV xem kho đề của mình + public)
// ═══════════════════════════════════════════════════════════════════

/**
 * Lấy danh sách đề thi của GV (private + class + public của GV đó).
 * Không lấy đề của Admin hay GV khác khi private.
 */
export async function getTeacherExams(teacherId: string): Promise<Exam[]> {
  // Đề do GV này tạo (mọi visibility)
  const ownedQ = query(
    collection(db, 'exams'),
    where('ownerTeacherId', '==', teacherId),
    orderBy('createdAt', 'desc')
  );

  // Đề do Admin tạo và đã public (không có ownerTeacherId)
  const publicAdminQ = query(
    collection(db, 'exams'),
    where('published', '==', true),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  const [ownedSnap, publicSnap] = await Promise.all([
    getDocs(ownedQ),
    getDocs(publicAdminQ),
  ]);

  const seenIds = new Set<string>();
  const results: Exam[] = [];

  ownedSnap.docs.forEach(d => {
    seenIds.add(d.id);
    results.push({ id: d.id, ...d.data() } as Exam);
  });

  publicSnap.docs.forEach(d => {
    if (!seenIds.has(d.id)) {
      const data = d.data() as Exam;
      // Bỏ đề của GV khác (chỉ lấy Admin-created = không có ownerTeacherId)
      if (!data.ownerTeacherId) {
        seenIds.add(d.id);
        results.push({ id: d.id, ...data });
      }
    }
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 4: TEACHER MATRIX FORMULAS
// ═══════════════════════════════════════════════════════════════════

/**
 * Lấy danh sách ma trận của GV (private) + ma trận hệ thống (Admin).
 */
export async function getTeacherMatrices(
  teacherId: string,
  targetGrade?: number
): Promise<DynamicMatrixFormula[]> {
  const constraints: any[] = [where('isActive', '==', true)];
  if (targetGrade) constraints.push(where('targetGrade', '==', targetGrade));

  // Ma trận hệ thống
  const systemQ = query(
    collection(db, 'dynamicMatrixFormulas'),
    ...constraints,
    where('isTeacherFormula', '==', false)
  );

  // Ma trận của GV này
  const teacherQ = query(
    collection(db, 'dynamicMatrixFormulas'),
    where('ownerTeacherId', '==', teacherId),
    where('isActive', '==', true),
    ...(targetGrade ? [where('targetGrade', '==', targetGrade)] : [])
  );

  const [systemSnap, teacherSnap] = await Promise.all([
    getDocs(systemQ).catch(() => ({ docs: [] })),
    getDocs(teacherQ),
  ]);

  const results: DynamicMatrixFormula[] = [];

  systemSnap.docs.forEach(d =>
    results.push({ id: d.id, ...d.data() } as DynamicMatrixFormula)
  );
  teacherSnap.docs.forEach(d =>
    results.push({ id: d.id, ...d.data() } as DynamicMatrixFormula)
  );

  return results;
}

/**
 * GV lưu ma trận tự tạo vào Firestore.
 */
export async function saveTeacherMatrix(
  teacherId: string,
  matrix: Omit<DynamicMatrixFormula, 'id' | 'createdAt' | 'createdBy'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'dynamicMatrixFormulas'), {
    ...matrix,
    isTeacherFormula: true,
    ownerTeacherId: teacherId,
    createdBy: teacherId,
    createdAt: Timestamp.now(),
    isActive: true,
  });
  return ref.id;
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 5: QUESTION POOL CACHE (Tiết kiệm Firestore reads)
//  Dùng sessionStorage — tự clear khi đóng tab
// ═══════════════════════════════════════════════════════════════════

const CACHE_PREFIX = 'phys9_qpool_';

function makeCacheKey(part: number, level: string, grade: number): string {
  return `${CACHE_PREFIX}${part}_${level}_${grade}`;
}

function readPoolCache(key: string): Question[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { questions: Question[]; fetchedAt: number; ttlMs: number };
    if (Date.now() - entry.fetchedAt > entry.ttlMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.questions;
  } catch {
    return null;
  }
}

function writePoolCache(key: string, questions: Question[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({
      questions,
      fetchedAt: Date.now(),
      ttlMs: POOL_CACHE_TTL_MS,
    }));
  } catch {
    // sessionStorage full → bỏ qua (vẫn dùng live data)
  }
}

/**
 * Lấy pool câu hỏi với cache tầng sessionStorage.
 * Hit cache: 0 Firestore reads.
 * Miss cache: query Firestore, lưu vào cache.
 *
 * @param topicFilter - Nếu có, lọc thêm theo topic ở client (tránh 2 `in` operators)
 */
export async function fetchQuestionPoolCached(
  part: 1 | 2 | 3,
  level: QuestionLevel,
  targetGrade: number,
  topicFilter?: string[]
): Promise<Question[]> {
  const cacheKey = makeCacheKey(part, level, targetGrade);

  // ── Cache HIT ──
  const cached = readPoolCache(cacheKey);
  if (cached) {
    console.debug(`[QPoolCache] HIT: ${cacheKey} (${cached.length} câu)`);
    return topicFilter
      ? cached.filter(q => topicFilter.includes(q.topic))
      : cached;
  }

  // ── Cache MISS: Fetch từ Firestore ──
  console.debug(`[QPoolCache] MISS: ${cacheKey} → Firestore query`);
  const q = query(
    collection(db, 'questions'),
    where('part', '==', part),
    where('level', '==', level),
    where('targetGrade', '==', targetGrade),
    where('status', '==', 'published'),
    limit(MAX_POOL_SIZE)
  );

  const snap = await getDocs(q);
  const questions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));

  // Ghi vào cache (toàn bộ pool, chưa filter topic)
  writePoolCache(cacheKey, questions);

  // Trả về sau khi áp topic filter
  return topicFilter
    ? questions.filter(q => topicFilter.includes(q.topic))
    : questions;
}

/** Xóa toàn bộ question pool cache (khi GV cần force-refresh) */
export function clearQuestionPoolCache(): void {
  try {
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(k => sessionStorage.removeItem(k));
    console.info(`[QPoolCache] Đã xóa ${keys.length} cache entries.`);
  } catch { /* silent */ }
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION 6: LEARNING MATERIALS
// ═══════════════════════════════════════════════════════════════════

/**
 * Lấy danh sách học liệu của GV + public materials đã được duyệt.
 */
export async function getTeacherMaterials(
  teacherId: string
): Promise<LearningMaterial[]> {
  // Học liệu của GV này (mọi visibility)
  const ownedQ = query(
    collection(db, 'learningMaterials'),
    where('ownerId', '==', teacherId),
    orderBy('createdAt', 'desc')
  );

  // Public materials đã duyệt (của Admin)
  const publicQ = query(
    collection(db, 'learningMaterials'),
    where('visibility', '==', 'public'),
    where('approvalStatus', '==', 'approved'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  const [ownedSnap, publicSnap] = await Promise.all([
    getDocs(ownedQ),
    getDocs(publicQ).catch(() => ({ docs: [] })),
  ]);

  const seenIds = new Set<string>();
  const results: LearningMaterial[] = [];

  ownedSnap.docs.forEach(d => {
    seenIds.add(d.id);
    results.push({ id: d.id, ...d.data() } as LearningMaterial);
  });
  publicSnap.docs.forEach(d => {
    if (!seenIds.has(d.id)) {
      seenIds.add(d.id);
      results.push({ id: d.id, ...d.data() } as LearningMaterial);
    }
  });

  return results;
}

/**
 * Lưu metadata học liệu sau khi upload xong (hoặc khi chỉ paste link).
 */
export async function saveMaterialMetadata(
  material: Omit<LearningMaterial, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'learningMaterials'), {
    ...material,
    createdAt: Timestamp.now(),
    viewCount: 0,
    downloadCount: 0,
  });
  return ref.id;
}

/**
 * Chia sẻ tài liệu với 1 hoặc nhiều lớp.
 * Đổi visibility thành 'class' và cập nhật allowedClassIds.
 */
export async function shareMaterialToClasses(
  materialId: string,
  classIds: string[]
): Promise<void> {
  await updateDoc(doc(db, 'learningMaterials', materialId), {
    visibility: 'class',
    allowedClassIds: classIds,
  });
}

/**
 * GV xin duyệt public tài liệu → Admin duyệt sau.
 */
export async function requestPublicApproval(materialId: string): Promise<void> {
  await updateDoc(doc(db, 'learningMaterials', materialId), {
    visibility: 'public',
    approvalStatus: 'pending',
  });
}
