/**
 * cleanup_questions.mjs
 * ─────────────────────────────────────────────────
 * Script xóa trực tiếp câu hỏi "Chưa phân loại" khỏi Firestore
 * thông qua REST API (bypass hoàn toàn Firebase SDK).
 *
 * Cách chạy: node cleanup_questions.mjs <FIREBASE_ID_TOKEN>
 *
 * Lấy token: Mở console trình duyệt tại localhost:3000, chạy:
 *   (await firebase.auth().currentUser.getIdToken(true))
 */

const PROJECT_ID = "gen-lang-client-0765259986";
const DATABASE_ID = "ai-studio-bcba3130-d40a-41ac-adf2-90526578a2ea";
const COLLECTION = "questions";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

// ── Lấy token từ argument hoặc env ──
const TOKEN = process.argv[2] || process.env.FIREBASE_TOKEN;
if (!TOKEN) {
  console.error("❌ Cần token! Chạy: node cleanup_questions.mjs <ID_TOKEN>");
  console.error("   Lấy token: Mở console trình duyệt → chạy lệnh trên");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

// ── Step 1: Load toàn bộ documents ──
async function listAllDocs() {
  let allDocs = [];
  let nextPageToken = null;

  do {
    let url = `${BASE_URL}/${COLLECTION}?pageSize=300`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`List lỗi ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    if (data.documents) allDocs.push(...data.documents);
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return allDocs;
}

// ── Step 2: Phân loại docs ──
function classifyDocs(docs) {
  const toDelete = [];
  const toKeep = [];

  for (const doc of docs) {
    const fields = doc.fields || {};
    const topic = fields.topic?.stringValue || "";
    const hasCreatedAt = !!fields.createdAt;
    const content = fields.content?.stringValue || "";
    
    // Tiêu chí xóa: topic = "Chưa phân loại" hoặc topic trống
    const isUncategorized = topic === "Chưa phân loại" || topic === "" || !topic;
    
    if (isUncategorized) {
      toDelete.push({
        name: doc.name,
        id: doc.name.split("/").pop(),
        topic,
        hasCreatedAt,
        contentPreview: content.substring(0, 60),
      });
    } else {
      toKeep.push({ topic, id: doc.name.split("/").pop() });
    }
  }

  return { toDelete, toKeep };
}

// ── Step 3: Xóa từng doc qua REST ──
async function deleteDoc(docName) {
  const url = `https://firestore.googleapis.com/v1/${docName}`;
  const resp = await fetch(url, { method: "DELETE", headers });
  if (!resp.ok && resp.status !== 404) {
    const err = await resp.text();
    throw new Error(`DELETE lỗi ${resp.status} cho ${docName}: ${err}`);
  }
  return resp.ok || resp.status === 404;
}

// ── Main ──
async function main() {
  console.log("🔍 Đang tải toàn bộ câu hỏi từ Firestore...");
  const allDocs = await listAllDocs();
  console.log(`📊 Tổng số documents trong collection: ${allDocs.length}`);

  const { toDelete, toKeep } = classifyDocs(allDocs);

  // Thống kê topics giữ lại
  const topicStats = {};
  toKeep.forEach(d => {
    topicStats[d.topic] = (topicStats[d.topic] || 0) + 1;
  });

  console.log(`\n✅ GIỮ LẠI: ${toKeep.length} câu`);
  Object.entries(topicStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([topic, count]) => console.log(`   • ${topic}: ${count} câu`));

  console.log(`\n🗑️  CẦN XÓA: ${toDelete.length} câu "Chưa phân loại"`);
  // Show vài sample
  toDelete.slice(0, 5).forEach(d =>
    console.log(`   • [${d.id}] topic="${d.topic}" | "${d.contentPreview}..."`)
  );
  if (toDelete.length > 5) console.log(`   ... và ${toDelete.length - 5} câu nữa`);

  if (toDelete.length === 0) {
    console.log("\n✨ Không có câu nào cần xóa!");
    return;
  }

  // Xác nhận
  console.log(`\n⚠️  SẮP XÓA VĨNH VIỄN ${toDelete.length} câu hỏi!`);
  console.log(`   Sau khi xóa, kho ngân hàng còn lại: ${toKeep.length} câu`);
  console.log(`   Nhấn Ctrl+C trong 5 giây để hủy...`);
  await new Promise(r => setTimeout(r, 5000));

  // Xóa tuần tự
  let deleted = 0;
  let failed = 0;
  for (const doc of toDelete) {
    try {
      await deleteDoc(doc.name);
      deleted++;
      if (deleted % 20 === 0 || deleted === toDelete.length) {
        console.log(`   🗑️  Đã xóa ${deleted}/${toDelete.length}...`);
      }
    } catch (err) {
      failed++;
      console.error(`   ❌ Lỗi xóa ${doc.id}: ${err.message}`);
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ HOÀN TẤT!`);
  console.log(`   Đã xóa: ${deleted} câu`);
  console.log(`   Lỗi: ${failed} câu`);
  console.log(`   Còn lại: ${toKeep.length} câu`);
  console.log(`════════════════════════════════════════`);

  // Kiểm tra lại
  console.log(`\n🔍 Đang kiểm tra lại...`);
  const remaining = await listAllDocs();
  console.log(`📊 Số documents thực tế còn trong Firestore: ${remaining.length}`);
}

main().catch(err => {
  console.error("💥 LỖI NGHIÊM TRỌNG:", err.message);
  process.exit(1);
});
