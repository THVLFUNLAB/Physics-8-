/**
 * cleanup_with_apikey.mjs
 * ─────────────────────────────────────────────────
 * Xóa câu hỏi "Chưa phân loại" qua REST API dùng API Key
 * (không cần auth token, chạy trực tiếp trên máy)
 *
 * Cách chạy: node cleanup_with_apikey.mjs
 */

const PROJECT_ID = "gen-lang-client-0765259986";
const DATABASE_ID = "ai-studio-bcba3130-d40a-41ac-adf2-90526578a2ea";
const API_KEY = "AIzaSyBeJul-y-01bMr-UzqGou2icn3tL6YiSCU";
const COLLECTION = "questions";

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

// ── Step 1: Load toàn bộ documents (phân trang) ──
async function listAllDocs() {
  let allDocs = [];
  let nextPageToken = null;
  let page = 0;

  do {
    let url = `${BASE_URL}/${COLLECTION}?key=${API_KEY}&pageSize=300`;
    if (nextPageToken) url += `&pageToken=${encodeURIComponent(nextPageToken)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`List lỗi ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    if (data.documents) allDocs.push(...data.documents);
    nextPageToken = data.nextPageToken;
    page++;
    console.log(`   📄 Trang ${page}: ${data.documents?.length || 0} docs (tổng ${allDocs.length})`);
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
    const content = fields.content?.stringValue || "";
    const hasCreatedAt = !!fields.createdAt;
    
    // Tiêu chí xóa: topic = "Chưa phân loại" hoặc topic trống
    const isUncategorized = topic === "Chưa phân loại" || topic === "" || !topic;
    
    if (isUncategorized) {
      toDelete.push({
        name: doc.name,
        id: doc.name.split("/").pop(),
        topic: topic || "(trống)",
        hasCreatedAt,
        contentPreview: content.substring(0, 80).replace(/\n/g, " "),
      });
    } else {
      toKeep.push({ topic, id: doc.name.split("/").pop() });
    }
  }

  return { toDelete, toKeep };
}

// ── Step 3: Xóa từng doc qua REST ──
async function deleteDoc(docName) {
  const url = `https://firestore.googleapis.com/v1/${docName}?key=${API_KEY}`;
  const resp = await fetch(url, { method: "DELETE" });
  if (!resp.ok && resp.status !== 404) {
    const err = await resp.text();
    // Quota exceeded? Log nhưng đừng crash
    if (resp.status === 429 || err.includes("Quota")) {
      return { ok: false, reason: "QUOTA" };
    }
    if (resp.status === 403) {
      return { ok: false, reason: "PERMISSION" };
    }
    return { ok: false, reason: `HTTP ${resp.status}: ${err.substring(0, 100)}` };
  }
  return { ok: true };
}

// ── Delay helper ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("    🧹 CLEANUP: Xóa câu hỏi 'Chưa phân loại'        ");
  console.log("═══════════════════════════════════════════════════════");
  
  console.log("\n🔍 Đang tải toàn bộ câu hỏi từ Firestore...");
  const allDocs = await listAllDocs();
  console.log(`📊 Tổng documents trong collection: ${allDocs.length}`);

  const { toDelete, toKeep } = classifyDocs(allDocs);

  // Thống kê topics giữ lại
  const topicStats = {};
  toKeep.forEach(d => {
    topicStats[d.topic] = (topicStats[d.topic] || 0) + 1;
  });

  console.log(`\n✅ GIỮ LẠI: ${toKeep.length} câu`);
  console.log("   Phân bố chủ đề:");
  Object.entries(topicStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([topic, count]) => console.log(`     • ${topic}: ${count} câu`));

  console.log(`\n🗑️  CẦN XÓA: ${toDelete.length} câu "Chưa phân loại"`);
  toDelete.slice(0, 5).forEach(d =>
    console.log(`   • [${d.id.substring(0,8)}...] topic="${d.topic}" | "${d.contentPreview}..."`)
  );
  if (toDelete.length > 5) console.log(`   ... và ${toDelete.length - 5} câu nữa`);

  if (toDelete.length === 0) {
    console.log("\n✨ Không có câu nào cần xóa! Kho ngân hàng đã sạch.");
    return;
  }

  console.log(`\n⚠️  SẮP XÓA VĨNH VIỄN ${toDelete.length} câu hỏi!`);
  console.log(`   Sau khi xóa, kho ngân hàng còn lại: ${toKeep.length} câu`);
  console.log(`   Bắt đầu sau 3 giây...`);
  await sleep(3000);

  // Xóa tuần tự với delay nhỏ để tránh rate limit
  let deleted = 0;
  let failed = 0;
  let quotaHit = false;

  for (let i = 0; i < toDelete.length; i++) {
    const doc = toDelete[i];
    
    if (quotaHit) {
      // Nếu đã bị quota, chờ lâu hơn giữa mỗi lần
      await sleep(500);
    }

    const result = await deleteDoc(doc.name);
    
    if (result.ok) {
      deleted++;
    } else if (result.reason === "QUOTA") {
      console.log(`   ⏳ Quota limit — chờ 2s rồi thử lại...`);
      quotaHit = true;
      await sleep(2000);
      // Retry
      const retry = await deleteDoc(doc.name);
      if (retry.ok) {
        deleted++;
        quotaHit = false;
      } else {
        failed++;
        console.error(`   ❌ Không xóa được ${doc.id}: ${retry.reason}`);
      }
    } else if (result.reason === "PERMISSION") {
      console.error(`   ❌ PERMISSION DENIED — dừng lại. Cần auth token.`);
      console.error(`   Thầy hãy mở Console trình duyệt (F12) tại localhost:3000 và chạy:`);
      console.error(`   → copy(await (await import('/src/firebase.ts')).auth.currentUser.getIdToken(true))`);
      console.error(`   Rồi chạy lại: node cleanup_questions.mjs <dán_token_vào_đây>`);
      break;
    } else {
      failed++;
      console.error(`   ❌ ${doc.id}: ${result.reason}`);
    }
    
    // Progress report
    if ((deleted + failed) % 10 === 0 || i === toDelete.length - 1) {
      const progress = Math.round(((deleted + failed) / toDelete.length) * 100);
      console.log(`   🗑️  ${progress}% — Đã xóa: ${deleted} | Lỗi: ${failed} | Tổng: ${toDelete.length}`);
    }
    
    // Delay nhỏ giữa mỗi request để tránh rate limit
    if (i % 5 === 4) await sleep(100);
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ KẾT QUẢ:`);
  console.log(`   Đã xóa thành công: ${deleted} câu`);
  console.log(`   Lỗi: ${failed} câu`);
  console.log(`   Dự kiến còn lại: ${toKeep.length} câu`);
  console.log(`════════════════════════════════════════`);

  if (deleted > 0) {
    // Kiểm tra lại
    console.log(`\n🔍 Đang kiểm tra lại database...`);
    await sleep(2000);
    try {
      const remaining = await listAllDocs();
      console.log(`📊 Số documents thực tế còn trong Firestore: ${remaining.length}`);
      
      const remainingUncategorized = remaining.filter(d => {
        const t = d.fields?.topic?.stringValue || "";
        return t === "Chưa phân loại" || !t;
      }).length;
      
      if (remainingUncategorized === 0) {
        console.log(`✨ HOÀN HẢO! Không còn câu "Chưa phân loại" nào trong database!`);
      } else {
        console.log(`⚠️  Vẫn còn ${remainingUncategorized} câu "Chưa phân loại" (có thể do quota limit).`);
      }
    } catch (e) {
      console.log(`⚠️  Không thể kiểm tra (có thể hết quota đọc): ${e.message}`);
    }
  }
}

main().catch(err => {
  console.error("💥 LỖI:", err.message);
  process.exit(1);
});
