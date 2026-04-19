/**
 * reset_attempts.mjs
 * ─────────────────────────────────────────────────
 * Reset usedAttempts = 0 cho TOÀN BỘ học sinh (role !== 'admin')
 * Dùng Firestore REST API — không cần firebase-admin
 *
 * Cách chạy:
 *   node reset_attempts.mjs
 */

const PROJECT_ID = "gen-lang-client-0765259986";
const API_KEY    = "AIzaSyBeJul-y-01bMr-UzqGou2icn3tL6YiSCU";
const DATABASE_ID = "(default)";

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

// ── Lấy toàn bộ documents trong collection users ──
async function listAllUsers() {
  const allDocs = [];
  let nextPageToken = null;

  do {
    let url = `${BASE_URL}/users?key=${API_KEY}&pageSize=300`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Lỗi đọc users: ${resp.status} — ${body.substring(0, 120)}`);
    }

    const data = await resp.json();
    if (data.documents) allDocs.push(...data.documents);
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return allDocs;
}

// ── Patch 1 field usedAttempts = 0 cho document ──
async function resetUserAttempts(docId) {
  // updateMask chỉ update đúng field usedAttempts, không đụng field khác
  const url = `${BASE_URL}/users/${docId}?key=${API_KEY}&updateMask.fieldPaths=usedAttempts`;

  const body = JSON.stringify({
    fields: {
      usedAttempts: { integerValue: "0" }
    }
  });

  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`PATCH lỗi ${resp.status}: ${errBody.substring(0, 80)}`);
  }
  return true;
}

// ── Lấy role từ fields ──
function getFieldStr(fields, key) {
  return fields?.[key]?.stringValue || fields?.[key]?.integerValue || null;
}

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  🔄 RESET LƯỢT THI — usedAttempts = 0");
  console.log(`  ⏰ Thời điểm: ${new Date().toLocaleString('vi-VN')}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  console.log("📥 Đang lấy danh sách tất cả học sinh...");
  const docs = await listAllUsers();
  console.log(`   → Tìm thấy ${docs.length} accounts\n`);

  let resetted = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const doc of docs) {
    const docId = doc.name.split("/").pop();
    const fields = doc.fields || {};
    const role  = getFieldStr(fields, "role");
    const email = getFieldStr(fields, "email");
    const used  = parseInt(getFieldStr(fields, "usedAttempts") || "0");

    // Bỏ qua admin
    if (role === "admin" || email === "haunn.vietanhschool@gmail.com" || email === "thayhauvatly@gmail.com") {
      console.log(`  ⚙️  ADMIN bỏ qua: ${email}`);
      skipped++;
      continue;
    }

    // Reset
    try {
      await resetUserAttempts(docId);
      resetted++;
      console.log(`  ✅ RESET: ${email || docId} (${used} → 0)`);
    } catch (err) {
      failed++;
      console.error(`  ❌ Lỗi ${email || docId}: ${err.message}`);
    }

    // Tránh rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  📊 KẾT QUẢ RESET");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ✅ Đã reset  : ${resetted} học sinh`);
  console.log(`  ⚙️  Bỏ qua    : ${skipped} admin`);
  if (failed > 0)
  console.log(`  ❌ Thất bại  : ${failed} accounts`);
  console.log(`  ⏰ Hoàn thành: ${new Date().toLocaleString('vi-VN')}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n  🎉 Từ giờ, tất cả học sinh bắt đầu lại từ 0 / 30 lượt!\n");
}

main().catch(err => {
  console.error("\n💥 LỖI NGHIÊM TRỌNG:", err.message);
  process.exit(1);
});
