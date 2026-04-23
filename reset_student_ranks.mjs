/**
 * reset_student_ranks.mjs
 * Script reset XP (stars), rank và learningPath của toàn bộ học sinh.
 * 
 * Chạy: node reset_student_ranks.mjs
 * 
 * ⚠️  CHỈ DÙNG KHI CÓ SỰ ĐỒNG Ý CỦA ADMIN. KHÔNG THỂ HOÀN TÁC.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// ── Load service account ──
// Thầy cần đặt file service account JSON vào cùng thư mục (tải từ Firebase Console > Settings > Service accounts)
const SERVICE_ACCOUNT_PATH = './firebase-service-account.json';

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
} catch (e) {
  console.error('❌ Không tìm thấy file service account:', SERVICE_ACCOUNT_PATH);
  console.error('   Tải tại: Firebase Console → Project Settings → Service accounts → Generate new private key');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Các field cần reset về 0 / null ──
const RESET_FIELDS = {
  stars: 0,                    // XP / sao tích lũy
  streak: 0,                   // Chuỗi ngày học liên tục
  lastStreakDate: null,
  usedAttempts: 0,             // Lượt thi đã dùng (reset để HS có thêm lượt)
  behavioralSummary: {
    careless: 0,
    fundamental: 0,
  },
  learningPath: {              // Reset tiến trình học tập
    completedTopics: [],
    topicProgress: {},
    overallProgress: 0,
    weaknesses: [],
    weaknessProfile: null,
    lastAssessmentDate: null,
  },
  redZones: [],                // Xóa các zone đỏ cũ
  failedQuestionIds: [],       // Xóa bộ nhớ câu sai
};

async function resetAllStudents() {
  console.log('\n🚀 PHYS-9+ System Upgrade — Reset Student Ranks');
  console.log('================================================\n');

  const usersSnap = await db.collection('users').where('role', '==', 'student').get();

  if (usersSnap.empty) {
    console.log('⚠️  Không tìm thấy học sinh nào trong database.');
    return;
  }

  console.log(`📋 Tìm thấy ${usersSnap.size} học sinh. Bắt đầu reset...\n`);

  let success = 0;
  let failed = 0;

  // Dùng batch để tối ưu (tối đa 500 writes mỗi batch)
  const BATCH_SIZE = 400;
  const docs = usersSnap.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const docSnap of chunk) {
      const data = docSnap.data();
      batch.update(docSnap.ref, {
        ...RESET_FIELDS,
        // Giữ nguyên: uid, email, displayName, role, tier, className, grade, photoURL
      });
      console.log(`  ✅ Reset: ${data.displayName || data.email || docSnap.id}`);
    }

    await batch.commit();
    success += chunk.length;
    console.log(`\n  [Batch ${Math.floor(i / BATCH_SIZE) + 1}] Đã commit ${chunk.length} records.\n`);
  }

  console.log('================================================');
  console.log(`✅ Hoàn thành! Reset ${success} học sinh. Lỗi: ${failed}`);
  console.log('\n📢 Nhớ tăng RESET_VERSION trong ResetNoticeModal.tsx để modal thông báo hiển thị lại!\n');
}

resetAllStudents().catch(err => {
  console.error('❌ Lỗi khi reset:', err);
  process.exit(1);
});
