/**
 * studentAssignmentService.ts — Client-side service cho HS truy vấn đề được GV phát.
 *
 * RBAC: HS chỉ thấy assignments có classId trong danh sách lớp mà HS đang theo học.
 * Flow: getDoc user → classIds[] → query teacherExamAssignments where classId in classIds
 */
import {
  db, collection, query, where, getDocs, getDoc, doc, updateDoc, Timestamp,
} from '../firebase';
import type { TeacherExamAssignment, Exam } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface StudentAssignedExam {
  assignmentId: string;
  assignment: TeacherExamAssignment;
  exam: Exam | null;
  hasSubmitted: boolean;
}

// ── Cache key ─────────────────────────────────────────────────────────────────
const CACHE_KEY_PREFIX = 'phys9_student_assignments_';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 phút

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Lấy danh sách đề được GV phát cho HS này.
 * 1. Đọc user document để lấy classId (hoặc classIds[])
 * 2. Query teacherExamAssignments where classId in [...classIds] AND status == 'active'
 * 3. Fetch chi tiết exam và kiểm tra xem HS đã nộp chưa
 */
export async function getStudentAssignedExams(
  studentId: string,
  studentClassId?: string,
): Promise<StudentAssignedExam[]> {
  // ── Cache ──────────────────────────────────────────────────────
  const cacheKey = `${CACHE_KEY_PREFIX}${studentId}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const { data, fetchedAt } = JSON.parse(raw);
      if (Date.now() - fetchedAt < CACHE_TTL_MS) return data;
    }
  } catch {}

  // ── 1. Xác định classIds của HS ───────────────────────────────
  let classIds: string[] = [];
  if (studentClassId) {
    // Nếu có truyền vào trực tiếp → dùng ngay
    classIds = [studentClassId];
  }

  // Đọc thêm từ user document (classIds[] hoặc classId string)
  try {
    const userSnap = await getDoc(doc(db, 'users', studentId));
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (Array.isArray(data.classIds) && data.classIds.length > 0) {
        classIds = Array.from(new Set([...classIds, ...data.classIds]));
      } else if (data.classId) {
        classIds = Array.from(new Set([...classIds, data.classId]));
      }
    }
  } catch {}


  if (classIds.length === 0) {
    // REVERSE LOOKUP: Tìm lớp mà HS thuộc về qua class.studentIds
    // (Trường hợp user doc không có classId/classIds field)
    try {
      const classQ = query(
        collection(db, 'classes'),
        where('studentIds', 'array-contains', studentId),
      );
      const classSnap = await getDocs(classQ);
      classSnap.docs.forEach(d => {
        if (!classIds.includes(d.id)) classIds.push(d.id);
      });
    } catch {}
  }

  // ALSO TRY reverse lookup to catch students in multiple classes
  if (classIds.length > 0) {
    try {
      const classQ = query(
        collection(db, 'classes'),
        where('studentIds', 'array-contains', studentId),
      );
      const classSnap = await getDocs(classQ);
      classSnap.docs.forEach(d => {
        if (!classIds.includes(d.id)) classIds.push(d.id);
      });
    } catch {}
  }

  if (classIds.length === 0) return [];


  // ── 2. Query assignments ──────────────────────────────────────
  // Firestore giới hạn `in` tối đa 30 giá trị
  const chunkSize = 10;
  const allAssignments: TeacherExamAssignment[] = [];

  for (let i = 0; i < classIds.length; i += chunkSize) {
    const chunk = classIds.slice(i, i + chunkSize);
    try {
      const q = query(
        collection(db, 'teacherExamAssignments'),
        where('classId', 'in', chunk),
        where('status', '==', 'active'),
      );
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data() as TeacherExamAssignment;
        // Kiểm tra availableFrom (nếu có) xem đã đến giờ giao chưa
        const nowMs = Date.now();
        const availableFromMs = data.availableFrom?.seconds ? data.availableFrom.seconds * 1000 : 0;
        if (availableFromMs <= nowMs) {
          allAssignments.push({ id: d.id, ...data });
        }
      });
    } catch {}
  }

  if (allAssignments.length === 0) return [];

  // ── 3. Kiểm tra HS đã nộp chưa + fetch exam metadata ─────────
  const results: StudentAssignedExam[] = [];

  for (const assignment of allAssignments) {
    // Kiểm tra submission: query attempts where examId == assignment.examId AND userId == studentId
    let hasSubmitted = false;
    try {
      const attemptQ = query(
        collection(db, 'attempts'),
        where('userId', '==', studentId),
        where('examId', '==', assignment.examId),
      );
      const attemptSnap = await getDocs(attemptQ);
      hasSubmitted = !attemptSnap.empty;
    } catch {}

    // Fetch exam metadata (không lấy toàn bộ questions để tiết kiệm bandwidth)
    let exam: Exam | null = null;
    try {
      const examSnap = await getDoc(doc(db, 'exams', assignment.examId));
      if (examSnap.exists()) {
        const examData = examSnap.data() as Exam;
        // Chỉ lấy metadata, bỏ questions để giảm payload
        exam = {
          id: examSnap.id,
          title: examData.title,
          targetGrade: examData.targetGrade,
          durationMinutes: examData.durationMinutes,
          createdAt: examData.createdAt,
          type: examData.type,
          // Partial object — chỉ lấy metadata để tiết kiệm bandwidth
          questions: [],
          createdBy: examData.createdBy,
        } as Exam;
      }
    } catch {}

    results.push({
      assignmentId: assignment.id!,
      assignment,
      exam,
      hasSubmitted,
    });
  }

  // ── 4. Sort: deadline sắp hết → lên đầu; đã nộp → xuống cuối
  results.sort((a, b) => {
    if (a.hasSubmitted !== b.hasSubmitted) return a.hasSubmitted ? 1 : -1;
    const aDeadline = (a.assignment.deadline as any)?.seconds ?? Infinity;
    const bDeadline = (b.assignment.deadline as any)?.seconds ?? Infinity;
    return aDeadline - bDeadline;
  });

  // ── 5. Cache ──────────────────────────────────────────────────
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ data: results, fetchedAt: Date.now() }));
  } catch {}

  return results;
}

/** Xóa cache assignments của HS (gọi sau khi nộp bài) */
export function clearStudentAssignmentCache(studentId: string): void {
  try {
    sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${studentId}`);
  } catch {}
}
