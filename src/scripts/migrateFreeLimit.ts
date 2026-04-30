/**
 * ════════════════════════════════════════════════════════
 * MIGRATION SCRIPT: Đổi maxAttempts FREE từ 30 → 20
 * ════════════════════════════════════════════════════════
 * Mục tiêu: Cập nhật tất cả user FREE trong Firestore
 *   - Chỉ cập nhật user có tier === 'free' hoặc không có tier
 *   - BẢO VỆ học sinh đã dùng > 20 lượt: KHÔNG giảm maxAttempts của họ
 *     (để tránh tình trạng họ bị khóa đột ngột)
 *   - User VIP / isUnlimited: BỎ QUA (không chạm vào)
 *
 * CHẠY:
 *   npx ts-node src/scripts/migrateFreeLimit.ts
 * hoặc nếu dùng tsx:
 *   npx tsx src/scripts/migrateFreeLimit.ts
 * ════════════════════════════════════════════════════════
 */

import { initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

// ─── CẤU HÌNH ────────────────────────────────────────────
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../serviceAccountKey.json');
const NEW_MAX_ATTEMPTS = 20;
const OLD_MAX_ATTEMPTS = 30;
// ─────────────────────────────────────────────────────────

async function migrate() {
  // 1. Kiểm tra file service account
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`\n❌ KHÔNG TÌM THẤY FILE SERVICE ACCOUNT:\n   ${SERVICE_ACCOUNT_PATH}`);
    console.error('\n📋 Hướng dẫn lấy file:');
    console.error('   1. Vào Firebase Console → Project Settings → Service Accounts');
    console.error('   2. Click "Generate new private key"');
    console.error('   3. Lưu file JSON vào: serviceAccountKey.json (ở thư mục gốc project)');
    process.exit(1);
  }

  // 2. Khởi tạo Firebase Admin SDK
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  const app: App = initializeApp({ credential: cert(serviceAccount) });
  const db: Firestore = getFirestore(app);

  console.log('\n🚀 Bắt đầu migration: maxAttempts FREE 30 → 20\n');
  console.log('═'.repeat(60));

  // 3. Lấy tất cả user documents
  const snapshot = await db.collection('users').get();
  
  let total = 0;
  let updated = 0;
  let skipped_vip = 0;
  let skipped_protected = 0; // usedAttempts > 20 → không giảm
  let skipped_already = 0;  // đã là 20 rồi
  let errors = 0;

  const BATCH_SIZE = 400; // Firestore limit: 500 ops/batch
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    total++;
    const data = docSnap.data();
    const uid = docSnap.id;

    // Bỏ qua VIP / isUnlimited
    if (data.tier === 'vip' || data.isUnlimited === true) {
      skipped_vip++;
      continue;
    }

    // Bỏ qua user đã có maxAttempts = 20 (đã migrate rồi)
    if (data.maxAttempts === NEW_MAX_ATTEMPTS) {
      skipped_already++;
      continue;
    }

    // BẢO VỆ học sinh đã dùng > 20 lượt (không giảm maxAttempts, để họ tiếp tục)
    const usedAttempts = data.usedAttempts || 0;
    if (usedAttempts > NEW_MAX_ATTEMPTS) {
      console.log(`  ⚠️  [PROTECTED] ${data.displayName || data.email || uid} — đã dùng ${usedAttempts}/${data.maxAttempts || OLD_MAX_ATTEMPTS} lượt → GIỮ NGUYÊN`);
      skipped_protected++;
      continue;
    }

    // Cập nhật maxAttempts → 20
    const ref = db.collection('users').doc(uid);
    batch.update(ref, { maxAttempts: NEW_MAX_ATTEMPTS });
    batchCount++;
    updated++;

    console.log(`  ✅ ${data.displayName || data.email || uid} — ${usedAttempts}/${data.maxAttempts || OLD_MAX_ATTEMPTS} → cập nhật maxAttempts: ${NEW_MAX_ATTEMPTS}`);

    // Commit mỗi BATCH_SIZE operations
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`\n  📦 Đã commit ${batchCount} updates...\n`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit batch cuối
  if (batchCount > 0) {
    try {
      await batch.commit();
    } catch (e: any) {
      console.error('  ❌ Lỗi commit batch cuối:', e.message);
      errors++;
    }
  }

  // 4. Tổng kết
  console.log('\n' + '═'.repeat(60));
  console.log('📊 KẾT QUẢ MIGRATION:');
  console.log(`   Tổng users quét:          ${total}`);
  console.log(`   ✅ Đã cập nhật (30→20):    ${updated}`);
  console.log(`   🌟 Bỏ qua (VIP/Unlimited): ${skipped_vip}`);
  console.log(`   ⚠️  Bảo vệ (dùng >20 lượt): ${skipped_protected}`);
  console.log(`   ⏭️  Đã là 20 (bỏ qua):     ${skipped_already}`);
  if (errors > 0) {
    console.log(`   ❌ Lỗi:                    ${errors}`);
  }
  console.log('═'.repeat(60));
  console.log('\n✨ Migration hoàn tất!\n');
  
  process.exit(0);
}

migrate().catch((err) => {
  console.error('\n❌ MIGRATION THẤT BẠI:', err);
  process.exit(1);
});
