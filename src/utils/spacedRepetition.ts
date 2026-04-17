import { db, collection, doc, writeBatch, getDocs, query, where, Timestamp } from '../firebase';
import { MemoryLog } from '../types';

export interface SM2Result {
  interval: number;
  easeFactor: number;
  nextReviewDate: Timestamp;
  consecutiveCorrect: number;
  lastReviewed: Timestamp;
}

/**
 * Thuật toán tính toán Mức độ lặp lại ngắt quãng (SM-2 Algorithm)
 * 
 * Quality:
 * 0-2: Sai (lạc hướng hoàn toàn / quên)
 * 3: Đúng nhưng rất khó khăn
 * 4: Đúng và dễ dàng (Good)
 * 5: Đúng ngay lập tức không cần nghĩ
 */
export const calculateSM2 = (
  quality: number,
  oldInterval: number = 1,
  oldEaseFactor: number = 2.5,
  oldConsecutiveCorrect: number = 0
): SM2Result => {
  let newInterval: number;
  let newEaseFactor: number;
  let newConsecutiveCorrect: number;

  if (quality >= 3) {
    if (oldConsecutiveCorrect === 0) {
      newInterval = 1;
    } else if (oldConsecutiveCorrect === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(oldInterval * oldEaseFactor);
    }
    newConsecutiveCorrect = oldConsecutiveCorrect + 1;
  } else {
    // Answer was incorrect
    newConsecutiveCorrect = 0;
    newInterval = 1;
  }

  // Cập nhật hệ thống trơn tru (Ease factor)
  // Formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  newEaseFactor = oldEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  
  if (newEaseFactor < 1.3) newEaseFactor = 1.3;
  if (newEaseFactor > 2.5) newEaseFactor = 2.5;

  const now = new Date();
  const nextDate = new Date();
  nextDate.setDate(now.getDate() + newInterval);

  return {
    interval: newInterval,
    easeFactor: newEaseFactor,
    nextReviewDate: Timestamp.fromDate(nextDate),
    consecutiveCorrect: newConsecutiveCorrect,
    lastReviewed: Timestamp.fromDate(now)
  };
};

/**
 * Lấy ra bảng ghi nhớ hiện tại của danh sách câu hỏi
 */
export const getMemoryLogs = async (userId: string, questionIds: string[]): Promise<Record<string, MemoryLog>> => {
  if (!questionIds || questionIds.length === 0) return {};
  
  const results: Record<string, MemoryLog> = {};
  
  try {
    // Firestore 'in' query supports max 10 items.
    const chunks = [];
    for (let i = 0; i < questionIds.length; i += 10) {
      chunks.push(questionIds.slice(i, i + 10));
    }
    
    for (const chunk of chunks) {
      const q = query(
        collection(db, `users/${userId}/memoryLogs`),
        where('questionId', 'in', chunk)
      );
      
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data() as MemoryLog;
        results[data.questionId] = { ...data, id: d.id };
      });
    }
  } catch (err) {
    console.error("Error fetching memory logs", err);
  }
  
  return results;
};

/**
 * Kích hoạt đồng bộ điểm & logic SM-2 khi học sinh nộp bài
 * Dùng Batch Write bảo vệ chi phí Database
 */
export const syncMemoryLogs = async (
  userId: string, 
  evaluations: { questionId: string; isCorrect: boolean; topic?: string }[]
) => {
  if (evaluations.length === 0) return;
  
  try {
    const questionIds = evaluations.map(e => e.questionId);
    
    // 1. Fetch current MemoryLogs
    const currentLogs = await getMemoryLogs(userId, questionIds);
    
    // 2. Prepare Batch
    const batch = writeBatch(db);
    
    evaluations.forEach((evalItem) => {
      // Tạm thời nếu phần mềm chưa có tracking time, ta để mặc định:
      // Sai = mức 1, Đúng = mức 4 (Good)
      const quality = evalItem.isCorrect ? 4 : 1;
      
      const oldLog = currentLogs[evalItem.questionId];
      
      const sm2 = calculateSM2(
        quality,
        oldLog?.interval,
        oldLog?.easeFactor,
        oldLog?.consecutiveCorrect
      );
      
      // Dùng questionId làm documentId cho subcollection
      const docRef = doc(db, `users/${userId}/memoryLogs`, evalItem.questionId);
      
      batch.set(docRef, {
        questionId: evalItem.questionId,
        interval: sm2.interval,
        easeFactor: sm2.easeFactor,
        nextReviewDate: sm2.nextReviewDate,
        consecutiveCorrect: sm2.consecutiveCorrect,
        lastReviewed: sm2.lastReviewed,
        topic: evalItem.topic || oldLog?.topic || 'Chưa phân loại'
      }, { merge: true });
    });
    
    // 3. Commit Batch Write
    await batch.commit();
    console.log(`✅ [SM-2] Chẩn đoán thần kinh hoàn tất cho ${evaluations.length} câu hỏi.`);
    
  } catch (err) {
    console.error("❌ [SM-2] Lỗi chạy thuật toán siêu trí nhớ", err);
  }
};
