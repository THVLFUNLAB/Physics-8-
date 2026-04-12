/**
 * cleanup_rest_v2.mjs — Dùng Firestore REST API v1 + Bearer token
 * URL format chuẩn cho NAMED database (không phải default)
 */

const PROJECT_ID = "gen-lang-client-0765259986";
const DATABASE_ID = "ai-studio-bcba3130-d40a-41ac-adf2-90526578a2ea";
const COLLECTION = "questions";

// Token từ trình duyệt
const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Cần token! Chạy: node cleanup_rest_v2.mjs <TOKEN>");
  process.exit(1);
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

async function apiCall(url, method = "GET") {
  const resp = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  return resp;
}

async function listAll() {
  let allDocs = [];
  let pageToken = null;
  let page = 0;

  do {
    let url = `${BASE}/${COLLECTION}?pageSize=300`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    console.log(`   Trang ${++page}... URL: ${url.substring(0, 80)}...`);
    const resp = await apiCall(url);
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`   HTTP ${resp.status}: ${errText.substring(0, 200)}`);
      
      // Thử alternative URL format
      if (resp.status === 403 || resp.status === 404) {
        console.log("   → Thử format URL khác...");
        return null; // signal to try alt format
      }
      throw new Error(`List failed: ${resp.status}`);
    }

    const data = await resp.json();
    if (data.documents) allDocs.push(...data.documents);
    pageToken = data.nextPageToken;
    console.log(`   ✅ ${data.documents?.length || 0} docs (tổng: ${allDocs.length})`);
  } while (pageToken);

  return allDocs;
}

// ── Thử URL format 2: dùng Firestore REST runQuery ──
async function listViaRunQuery() {
  const url = `${BASE}:runQuery`;
  console.log("   Thử runQuery...");
  
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        limit: 2000,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`   runQuery lỗi ${resp.status}: ${err.substring(0, 300)}`);
    return null;
  }

  const results = await resp.json();
  return results
    .filter(r => r.document)
    .map(r => r.document);
}

async function deleteDocREST(docName) {
  const url = `https://firestore.googleapis.com/v1/${docName}`;
  const resp = await apiCall(url, "DELETE");
  return resp.ok || resp.status === 404;
}

async function main() {
  console.log("🧹 Cleanup via REST API v2");
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Database: ${DATABASE_ID}`);
  console.log(`   Token: ${TOKEN.substring(0, 20)}...`);

  // Thử list documents
  console.log("\n📋 Loading documents...");
  let docs = await listAll();
  
  if (docs === null) {
    console.log("\n📋 Thử runQuery...");
    docs = await listViaRunQuery();
  }

  if (!docs || docs.length === 0) {
    console.log("❌ Không lấy được documents. Kiểm tra:");
    console.log("   1. Token còn hạn? (hạn 1 giờ)");
    console.log("   2. Quota Firestore đã reset?");
    console.log("   3. Firestore rules cho phép đọc?");
    process.exit(1);
  }

  console.log(`\n📊 Tổng: ${docs.length} documents`);

  // Phân loại
  const toDelete = [];
  const toKeep = [];

  for (const d of docs) {
    const fields = d.fields || {};
    const topic = fields.topic?.stringValue || "";
    const isUncategorized = topic === "Chưa phân loại" || !topic;
    
    if (isUncategorized) {
      toDelete.push(d.name);
    } else {
      toKeep.push(topic);
    }
  }

  const topicStats = {};
  toKeep.forEach(t => { topicStats[t] = (topicStats[t] || 0) + 1; });

  console.log(`✅ Giữ: ${toKeep.length} câu`);
  Object.entries(topicStats).sort((a,b) => b[1] - a[1]).forEach(([t,c]) => console.log(`   • ${t}: ${c}`));
  console.log(`🗑️  Xóa: ${toDelete.length} câu "Chưa phân loại"`);

  if (toDelete.length === 0) {
    console.log("✨ Không có gì cần xóa!");
    process.exit(0);
  }

  console.log(`\n⚠️  Bắt đầu xóa ${toDelete.length} câu...`);
  await new Promise(r => setTimeout(r, 3000));

  let ok = 0, fail = 0;
  for (const name of toDelete) {
    const success = await deleteDocREST(name);
    if (success) ok++;
    else {
      fail++;
      console.error(`   ❌ Lỗi: ${name.split("/").pop()}`);
    }
    if ((ok + fail) % 20 === 0) console.log(`   ${ok + fail}/${toDelete.length}... (OK: ${ok}, Fail: ${fail})`);
  }

  console.log(`\n✅ Xong! Đã xóa: ${ok} | Lỗi: ${fail} | Còn lại: ${toKeep.length}`);
  process.exit(0);
}

main().catch(e => { console.error("💥", e.message); process.exit(1); });
