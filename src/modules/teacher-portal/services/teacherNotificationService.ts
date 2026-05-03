/**
 * teacherNotificationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Quản lý thông báo từ GV gửi đến HS trong lớp.
 * Collection: `notifications/{notifId}`
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  db, collection, addDoc, getDocs, updateDoc,
  query, where, orderBy, limit, Timestamp, doc,
} from '../../../firebase';

export interface TeacherNotification {
  id?: string;
  teacherId: string;
  teacherName: string;
  title: string;
  body: string;
  type: 'announcement' | 'reminder' | 'alert' | 'achievement';
  targetClassIds: string[];   // [] = tất cả lớp của GV
  targetClassNames: string[];
  readBy: string[];           // array of studentUIDs đã đọc
  createdAt: any;             // Firestore Timestamp
  pinned: boolean;
}

/**
 * Gửi thông báo mới đến 1 hoặc nhiều lớp.
 */
export async function sendNotification(
  params: Omit<TeacherNotification, 'id' | 'createdAt' | 'readBy'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'teacherNotifications'), {
    ...params,
    readBy: [],
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

/**
 * Lấy danh sách thông báo GV đã gửi (mới nhất trước).
 */
export async function getTeacherNotifications(
  teacherId: string,
  pageLimit = 30
): Promise<TeacherNotification[]> {
  const q = query(
    collection(db, 'teacherNotifications'),
    where('teacherId', '==', teacherId),
    limit(pageLimit)
  );
  const snap = await getDocs(q);
  const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as TeacherNotification));
  // Sort client-side to avoid composite index
  return results.sort((a, b) => {
    const ta = a.createdAt?.seconds ?? 0;
    const tb = b.createdAt?.seconds ?? 0;
    return tb - ta;
  });
}

/**
 * Pin/unpin một thông báo.
 */
export async function togglePinNotification(
  notifId: string,
  pinned: boolean
): Promise<void> {
  await updateDoc(doc(db, 'teacherNotifications', notifId), { pinned });
}
