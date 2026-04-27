/**
 * migrateUserGrades.mjs
 * ─────────────────────────────────────────────────────────────────
 * Script migration grade học sinh — Phy9+ Module 1
 *
 * CÁCH CHẠY:
 *   node migrateUserGrades.mjs <ID_TOKEN>
 *
 * CÁCH LẤY ID_TOKEN (30 giây):
 *   1. Mở phy9plus.com → đăng nhập bằng tài khoản admin
 *   2. Mở DevTools (F12) → Console
 *   3. Dán lệnh sau:
 *      const u = firebase.auth().currentUser || (await firebase.auth().authStateReady(), firebase.auth().currentUser);
 *      copy(await u.getIdToken(true));
 *      console.log("✅ Đã copy ID Token vào clipboard!");
 *   HOẶC (cách đơn giản hơn với app này dùng modular SDK):
 *      copy(await (await import('firebase/auth')).getAuth().currentUser.getIdToken(true))
 *
 *   Sau đó chạy:
 *      node migrateUserGrades.mjs "ey..."
 *
 * DRY_RUN = true mặc định (chỉ log, không ghi DB)
 * ─────────────────────────────────────────────────────────────────
 */

const PROJECT_ID  = "gen-lang-client-0765259986";
const DATABASE_ID = "(default)";

// ⚠️ Đổi thành false để ghi DB thật
const DRY_RUN = true;

// ── Lấy ID Token từ argument dòng lệnh ────────────────────────────
const ID_TOKEN = process.argv[2];

if (!ID_TOKEN) {
  console.error(`
╔══════════════════════════════════════════════════════════╗
║  ❌ THIẾU ID TOKEN — Script cần quyền admin để chạy      ║
╠══════════════════════════════════════════════════════════╣
║  CÁCH LẤY TOKEN (30 giây):                               ║
║                                                          ║
║  1. Mở phy9plus.com → đăng nhập admin                    ║
║  2. F12 → Console → dán lệnh:                            ║
║                                                          ║
║     copy(await firebase.auth().currentUser               ║
║       .getIdToken(true))                                 ║
║                                                          ║
║     → Token được copy vào clipboard tự động              ║
║                                                          ║
║  3. Chạy lại:                                            ║
║     node migrateUserGrades.mjs "eyJ..."                  ║
╚══════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const HEADERS  = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${ID_TOKEN}`,
};

// ─────────────────────────────────────────────────────────────────
//  HELPER: Extract số khối từ chuỗi className
// ─────────────────────────────────────────────────────────────────
function extractGradeFromClassName(className) {
  if (!className || typeof className !== "string") return null;
  const match = className.match(/\b(10|11|12)\b/);
  return match ? parseInt(match[1], 10) : null;
}

// ─────────────────────────────────────────────────────────────────
//  HELPER: Lấy toàn bộ documents (có pagination)
// ─────────────────────────────────────────────────────────────────
async function listAllDocs(collectionName) {
  const allDocs = [];
  let pageToken = null;

  do {
    let url = `${BASE_URL}/${collectionName}?pageSize=300`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`[${resp.status}] Đọc '${collectionName}' thất bại: ${body.slice(0, 300)}`);
    }
    const data = await resp.json();
    if (data.documents) allDocs.push(...data.documents);
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);

  return allDocs;
}

// ─────────────────────────────────────────────────────────────────
//  HELPER: PATCH field grade (chỉ cập nhật field này, không đụng field khác)
// ─────────────────────────────────────────────────────────────────
async function patchUserGrade(docId, grade) {
  const url = `${BASE_URL}/users/${docId}?updateMask.fieldPaths=grade`;
  const body = {
    fields: {
      grade: { integerValue: String(grade) },
    },
  };

  const resp = await fetch(url, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`[${resp.status}] PATCH user ${docId}: ${err.slice(0, 150)}`);
  }
}

// ─────────────────────────────────────────────────────────────────
//  HELPER: Đọc value từ Firestore REST field format
// ─────────────────────────────────────────────────────────────────
function readField(f) {
  if (!f) return undefined;
  if ("stringValue"  in f) return f.stringValue;
  if ("integerValue" in f) return parseInt(f.integerValue, 10);
  if ("booleanValue" in f) return f.booleanValue;
  return undefined;
}

// ─────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  USER GRADE MIGRATION — Phy9+ Module 1");
  console.log(`  Mode: ${DRY_RUN ? "🔍 DRY RUN (chỉ log, không ghi)" : "🚀 LIVE (ghi DB thật)"}`);
  console.log("═══════════════════════════════════════════════════\n");

  // ── Đọc users ─────────────────────────────────────────────────
  console.log("🔄 Đang đọc collection 'users'...");
  const docs = await listAllDocs("users");
  console.log(`📊 Tổng cộng: ${docs.length} users.\n`);

  if (docs.length === 0) {
    console.log("⚠️  Collection trống.");
    return;
  }

  // ── Phân loại ─────────────────────────────────────────────────
  let countWillUpdate = 0;
  let countSkipped    = 0;
  let countNoClass    = 0;
  let countFailed     = 0;

  const updateBatch = [];

  for (const rawDoc of docs) {
    const docId    = rawDoc.name.split("/").pop();
    const fields   = rawDoc.fields || {};
    const className   = readField(fields.className);
    const role        = readField(fields.role);
    const existGrade  = readField(fields.grade);
    const displayName = readField(fields.displayName) || readField(fields.email) || `[${docId.slice(0, 8)}]`;

    // Skip admin/assistant
    if (role === "admin" || role === "assistant") { countSkipped++; continue; }

    // Idempotency: đã có grade hợp lệ
    if (typeof existGrade === "number" && [10, 11, 12].includes(existGrade)) {
      countSkipped++;
      continue;
    }

    // Không có className
    if (!className) {
      console.log(`  ⚪ ${displayName} — Không có className`);
      countNoClass++;
      continue;
    }

    // Extract
    const grade = extractGradeFromClassName(className);
    if (grade === null) {
      console.log(`  ❌ ${displayName} — "${className}" → Không parse được grade`);
      countFailed++;
      continue;
    }

    console.log(`  ✅ ${displayName} — "${className}" → grade: ${grade}`);
    updateBatch.push({ docId, grade });
    countWillUpdate++;
  }

  // ── Ghi DB ────────────────────────────────────────────────────
  let countWriteOk  = 0;
  let countWriteErr = 0;

  if (!DRY_RUN && updateBatch.length > 0) {
    console.log(`\n🔄 Ghi ${updateBatch.length} records...\n`);
    for (const { docId, grade } of updateBatch) {
      try {
        await patchUserGrade(docId, grade);
        countWriteOk++;
        if (countWriteOk % 10 === 0) {
          process.stdout.write(`   ⏳ ${countWriteOk}/${updateBatch.length}...\n`);
          await new Promise(r => setTimeout(r, 150)); // throttle
        }
      } catch (err) {
        countWriteErr++;
        console.error(`  ❌ Lỗi ghi ${docId}:`, err.message);
      }
    }
  }

  // ── Tổng kết ──────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  KẾT QUẢ");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  📊 Tổng user đã quét      : ${docs.length}`);
  console.log(`  ✅ Sẽ/Đã cập nhật grade   : ${countWillUpdate}`);
  console.log(`  ⏭️  Skip (admin/có grade)  : ${countSkipped}`);
  console.log(`  ⚪ Không có className      : ${countNoClass}`);
  console.log(`  ❌ Không parse được        : ${countFailed}`);
  if (!DRY_RUN) {
    console.log(`  💾 Ghi DB thành công      : ${countWriteOk}`);
    console.log(`  💥 Ghi DB lỗi             : ${countWriteErr}`);
    console.log("\n  🎉 Migration hoàn tất!");
  } else {
    console.log("\n  ⚠️  DRY RUN — Không có gì được ghi!");
    console.log("  Đổi DRY_RUN = false (dòng 23) để ghi thật.");
  }
  console.log("═══════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("\n💥 LỖI FATAL:", err.message);
  process.exit(1);
});
