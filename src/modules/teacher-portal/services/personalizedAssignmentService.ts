/**
 * personalizedAssignmentService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GV giao bài tập cá nhân hoá cho HS yếu.
 * Tạo TeacherExamAssignment targeted 1 HS (studentId field).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  db, collection, addDoc, getDocs,
  query, where, limit, Timestamp,
} from '../../../firebase';
import type { TeacherExamAssignment } from '../../../types';

export interface PersonalizedAssignment {
  id?: string;
  teacherId: string;
  studentId: string;
  studentName: string;
  examId: string;
  examTitle: string;
  classId: string;
  className: string;
  targetTopics: string[];    // Các chủ đề yếu cần luyện
  note?: string;             // GV ghi chú thêm cho HS
  status: 'pending' | 'started' | 'completed';
  assignedAt: any;
  deadline?: any;
  score?: number;
}

/**
 * Tạo một assignment cá nhân hoá cho 1 HS.
 */
export async function createPersonalizedAssignment(
  params: Omit<PersonalizedAssignment, 'id' | 'assignedAt' | 'status'>
): Promise<string> {
  const data: Omit<PersonalizedAssignment, 'id'> = {
    ...params,
    status: 'pending',
    assignedAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, 'personalizedAssignments'), data);

  // Cũng tạo TeacherExamAssignment scoped theo studentId để HS thấy trong dashboard
  await addDoc(collection(db, 'teacherExamAssignments'), {
    teacherId: params.teacherId,
    examId: params.examId,
    examTitle: params.examTitle,
    classId: params.classId,
    className: params.className,
    targetStudentId: params.studentId,   // ← scope cho 1 HS
    status: 'active',
    assignedAt: Timestamp.now(),
    allowReview: true,
    showLeaderboard: false,
    submittedCount: 0,
    totalStudents: 1,
    isPersonalized: true,
    personalizedAssignmentId: ref.id,
  } as Partial<TeacherExamAssignment>);

  return ref.id;
}

/**
 * Lấy danh sách bài tập cá nhân hoá của GV.
 */
export async function getPersonalizedAssignments(
  teacherId: string
): Promise<PersonalizedAssignment[]> {
  const q = query(
    collection(db, 'personalizedAssignments'),
    where('teacherId', '==', teacherId),
    limit(100)
  );
  const snap = await getDocs(q);
  const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as PersonalizedAssignment));
  return results.sort((a, b) => {
    const ta = a.assignedAt?.seconds ?? 0;
    const tb = b.assignedAt?.seconds ?? 0;
    return tb - ta;
  });
}
