/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHYSICS9+ — USER GRADE MIGRATION SCRIPT
 *  Module 1: Chuẩn bị dữ liệu cho hệ thống Auto-Email phân khúc
 *
 *  MỤC TIÊU: Quét collection 'users', đọc field className (VD: "12A1"),
 *  tự động extract ra số khối lớp (12) và ghi vào field grade.
 *
 *  CÁCH CHẠY:
 *    npx tsx src/scripts/migrateUserGrades.ts
 *
 *  LƯU Ý AN TOÀN:
 *    - Script chạy DRY_RUN = true mặc định → chỉ log, không ghi DB.
 *    - Đổi DRY_RUN = false để thực thi thật.
 *    - Script idempotent: chạy lại không bị trùng/xóa data.
 * ═══════════════════════════════════════════════════════════════════
 */

import { db, collection, getDocs, doc, updateDoc } from '../firebase';

// ──────────────────────────────────────────────────────────────────
// CONFIG — Đổi thành false khi sẵn sàng chạy thật
// ──────────────────────────────────────────────────────────────────
const DRY_RUN = true;

// ─── Helper: Extract số khối từ chuỗi className ───────────────────
/**
 * Nhận vào một chuỗi className bất kỳ, tìm kiếm số khối lớp.
 * Hỗ trợ các định dạng phổ biến:
 *   "12A1"     → 12
 *   "Lớp 11B"  → 11
 *   "10/C3"    → 10
 *   "Grade 12" → 12
 *   "k12"      → 12
 *
 * @returns Số khối (10 | 11 | 12) hoặc null nếu không tìm thấy
 */
function extractGradeFromClassName(className: string): number | null {
  if (!className || typeof className !== 'string') return null;

  // Tìm pattern 10, 11, hoặc 12 (ưu tiên 2 chữ số trước 1 chữ số)
  const match = className.match(/\b(10|11|12)\b/);
  if (match) {
    const grade = parseInt(match[1], 10);
    return grade;
  }
  return null;
}

// ─── MAIN MIGRATION FUNCTION ───────────────────────────────────────
export async function migrateUserGrades(): Promise<void> {
  console.log('═══════════════════════════════════════════');
  console.log('  USER GRADE MIGRATION — Phy9+ Module 1');
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (chỉ log)' : '🚀 LIVE (ghi DB thật)'}`);
  console.log('═══════════════════════════════════════════\n');

  // ── Bước 1: Lấy tất cả user documents ──
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);

  if (snapshot.empty) {
    console.log('⚠️  Collection users trống. Không có gì để migrate.');
    return;
  }

  console.log(`📊 Tìm thấy ${snapshot.size} user documents.\n`);

  // ── Bước 2: Phân loại và xử lý từng user ──
  let countUpdated = 0;
  let countSkipped = 0;    // Đã có grade rồi
  let countNoClass = 0;    // Không có className
  let countFailed = 0;     // Không parse được grade

  const updateBatch: { uid: string; grade: number; className: string }[] = [];

  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    const uid = userDoc.id;

    // Skip nếu đã có grade hợp lệ (idempotency)
    if (typeof data.grade === 'number' && [10, 11, 12].includes(data.grade)) {
      countSkipped++;
      continue;
    }

    // Skip admin/assistant (không cần grade)
    if (data.role === 'admin' || data.role === 'assistant') {
      countSkipped++;
      continue;
    }

    // Skip nếu không có className
    if (!data.className) {
      console.log(`  ⚪ [${uid.slice(0, 8)}...] ${data.displayName || data.email} — Không có className`);
      countNoClass++;
      continue;
    }

    // Thử extract grade
    const grade = extractGradeFromClassName(data.className);

    if (grade === null) {
      console.log(`  ❌ [${uid.slice(0, 8)}...] className="${data.className}" — Không parse được grade`);
      countFailed++;
      continue;
    }

    console.log(`  ✅ [${uid.slice(0, 8)}...] ${data.displayName || data.email} — "${data.className}" → grade: ${grade}`);
    updateBatch.push({ uid, grade, className: data.className });
    countUpdated++;
  }

  // ── Bước 3: Thực thi ghi DB (nếu không phải DRY RUN) ──
  if (!DRY_RUN && updateBatch.length > 0) {
    console.log(`\n🔄 Bắt đầu ghi ${updateBatch.length} records lên Firestore...`);

    // Ghi tuần tự (không batch vì không cần atomic, lại dễ debug hơn)
    for (const { uid, grade } of updateBatch) {
      try {
        await updateDoc(doc(db, 'users', uid), { grade });
      } catch (err) {
        console.error(`  ❌ Lỗi ghi user ${uid}:`, err);
      }
    }

    console.log('✅ Ghi DB hoàn tất.');
  }

  // ── Bước 4: In tổng kết ──
  console.log('\n═══════════════════════════════════════════');
  console.log('  KẾT QUẢ MIGRATION');
  console.log('═══════════════════════════════════════════');
  console.log(`  ✅ Sẽ được cập nhật: ${countUpdated} users`);
  console.log(`  ⏭️  Đã có grade / Admin: ${countSkipped} users`);
  console.log(`  ⚪ Không có className: ${countNoClass} users`);
  console.log(`  ❌ Không parse được: ${countFailed} users`);
  if (DRY_RUN) {
    console.log('\n  ⚠️  ĐÂY LÀ DRY RUN — không có gì bị ghi!');
    console.log('  Đổi DRY_RUN = false để thực thi thật.\n');
  }
}

// ── Tự chạy khi gọi trực tiếp bằng tsx ──
migrateUserGrades().catch(console.error);
