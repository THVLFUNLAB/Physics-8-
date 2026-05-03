import { db, collection, query, where, getDocs } from '../../../firebase';
import type { UserProfile } from '../../../types';

/**
 * Lấy danh sách hồ sơ học sinh dựa trên mảng studentIds.
 * Tự động chia mảng thành các chunk 10 phần tử để tránh giới hạn 'in' của Firestore.
 */
export async function getStudentsByClass(studentIds: string[]): Promise<UserProfile[]> {
  if (!studentIds || studentIds.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += 10) {
    chunks.push(studentIds.slice(i, i + 10));
  }

  const results: UserProfile[] = [];

  // Lấy dữ liệu song song từ các chunks
  await Promise.all(
    chunks.map(async (chunk) => {
      const q = query(
        collection(db, 'users'),
        where('uid', 'in', chunk)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(doc => {
        results.push(doc.data() as UserProfile);
      });
    })
  );

  return results;
}
