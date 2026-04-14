/**
 * migrate_to_default_db.mjs
 * ─────────────────────────────────────────────────
 * Script di chuyển TOÀN BỘ dữ liệu từ database AI Studio 
 * sang database (default). Có cơ chế chờ quota tự động.
 * 
 * Cách chạy:
 *   node migrate_to_default_db.mjs
 * 
 * Script sẽ tự động:
 *   1. Kiểm tra quota database cũ
 *   2. Nếu hết quota → hiển thị countdown chờ quota reset
 *   3. Khi quota reset → bắt đầu migrate
 */

const PROJECT_ID = "gen-lang-client-0765259986";
const API_KEY = "AIzaSyBeJul-y-01bMr-UzqGou2icn3tL6YiSCU";
const OLD_DATABASE_ID = "ai-studio-bcba3130-d40a-41ac-adf2-90526578a2ea";
const NEW_DATABASE_ID = "(default)";

const COLLECTIONS = [
  "questions",
  "clusters", 
  "users",
  "exams",
  "attempts",
  "classAttempts",
  "classes",
  "classExams",
  "metadata",
  "motivational_quotes",
  "reportedQuestions",
  "simulations",
  "loginLogs",
];

function getBaseUrl(dbId) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${dbId}/documents`;
}

// ── Kiểm tra quota ──
async function checkQuota() {
  const url = `${getBaseUrl(OLD_DATABASE_ID)}/metadata?key=${API_KEY}&pageSize=1`;
  const resp = await fetch(url);
  if (resp.status === 429 || resp.status === 400) {
    const body = await resp.text();
    if (body.includes('Quota') || body.includes('quota')) return false;
  }
  return true;
}

// ── Chờ quota reset với countdown ──
async function waitForQuota() {
  console.log("⏳ Database cũ đang HẾT QUOTA. Kiểm tra lại mỗi 60 giây...");
  console.log("   (Quota thường reset vào khoảng 14-15h VN)");
  console.log("");
  
  let attempt = 0;
  while (true) {
    attempt++;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN');
    process.stdout.write(`   [${timeStr}] Lần kiểm tra #${attempt}... `);
    
    const available = await checkQuota();
    if (available) {
      console.log("✅ QUOTA ĐÃ RESET! Bắt đầu migrate...");
      return;
    }
    
    console.log("❌ Vẫn hết quota. Đợi 60s...");
    await new Promise(r => setTimeout(r, 60_000));
  }
}

// ── Đọc documents với retry ──
async function listAllDocs(dbId, collectionName, maxRetries = 3) {
  const allDocs = [];
  let nextPageToken = null;

  do {
    let url = `${getBaseUrl(dbId)}/${collectionName}?key=${API_KEY}&pageSize=300`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;

    let lastError;
    for (let retry = 0; retry <= maxRetries; retry++) {
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.documents) allDocs.push(...data.documents);
        nextPageToken = data.nextPageToken;
        lastError = null;
        break;
      }
      
      if (resp.status === 404) return allDocs;
      
      lastError = await resp.text();
      if (resp.status === 429 || resp.status === 400) {
        const wait = (retry + 1) * 10;
        console.log(`\n   ⏳ Rate limit — đợi ${wait}s (retry ${retry + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, wait * 1000));
        continue;
      }
      throw new Error(`Lỗi ${resp.status}: ${lastError.substring(0, 150)}`);
    }
    
    if (lastError) throw new Error(`Hết retry: ${lastError.substring(0, 100)}`);
  } while (nextPageToken);

  return allDocs;
}

// ── Ghi document ──
async function writeDoc(collectionName, docId, fields) {
  const url = `${getBaseUrl(NEW_DATABASE_ID)}/${collectionName}?documentId=${docId}&key=${API_KEY}`;
  
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (resp.status === 409) {
    const patchUrl = `${getBaseUrl(NEW_DATABASE_ID)}/${collectionName}/${docId}?key=${API_KEY}`;
    const patchResp = await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!patchResp.ok) throw new Error(`Patch lỗi: ${(await patchResp.text()).substring(0, 80)}`);
    return "updated";
  }

  if (!resp.ok) throw new Error(`Create lỗi: ${(await resp.text()).substring(0, 80)}`);
  return "created";
}

function extractDocId(name) {
  return name.split("/").pop();
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  🔄 MIGRATE DATABASE");
  console.log("  AI Studio → Default (Blaze Plan)");
  console.log("═══════════════════════════════════════════════════");
  console.log("");

  // ── Bước 0: Kiểm tra quota ──
  const quotaOk = await checkQuota();
  if (!quotaOk) {
    await waitForQuota();
  } else {
    console.log("✅ Quota khả dụng! Bắt đầu migrate ngay...");
  }
  console.log("");

  // ── Bắt đầu migrate ──
  let totalMigrated = 0;
  let totalFailed = 0;
  const summary = [];

  for (const col of COLLECTIONS) {
    process.stdout.write(`📦 ${col}: `);
    
    try {
      const docs = await listAllDocs(OLD_DATABASE_ID, col);
      
      if (docs.length === 0) {
        console.log("(trống)");
        summary.push({ col, count: 0 });
        continue;
      }

      console.log(`${docs.length} docs → migrating...`);
      let ok = 0, fail = 0;

      for (const doc of docs) {
        const docId = extractDocId(doc.name);
        try {
          await writeDoc(col, docId, doc.fields || {});
          ok++;
          if (ok % 50 === 0) {
            console.log(`   ⏳ ${ok}/${docs.length}...`);
            await new Promise(r => setTimeout(r, 100));
          }
        } catch (err) {
          fail++;
          if (fail <= 5) console.error(`   ❌ ${docId}: ${err.message.substring(0, 60)}`);
        }
      }

      console.log(`   ✅ ${ok}/${docs.length}${fail > 0 ? ` (${fail} lỗi)` : ""}`);
      totalMigrated += ok;
      totalFailed += fail;
      summary.push({ col, count: ok, fail });
    } catch (err) {
      console.log(`❌ ${err.message.substring(0, 80)}`);
      summary.push({ col, count: 0, error: true });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // ── Kết quả ──
  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("  📊 KẾT QUẢ MIGRATION");
  console.log("═══════════════════════════════════════════════════");
  for (const s of summary) {
    const icon = s.count > 0 ? "✅" : s.error ? "❌" : "⬜";
    console.log(`  ${icon} ${s.col}: ${s.count} docs${s.fail ? ` (${s.fail} lỗi)` : ""}`);
  }
  console.log(`\n  📦 TỔNG: ${totalMigrated} documents migrated`);
  if (totalFailed > 0) console.log(`  ⚠️  ${totalFailed} documents bị lỗi`);
  console.log("═══════════════════════════════════════════════════");
  
  if (totalMigrated > 0) {
    console.log("\n  🎉 THÀNH CÔNG! Mở localhost:3000 → Kho Câu Hỏi");
    console.log("     để kiểm tra dữ liệu.\n");
  }
}

main().catch(err => {
  console.error("💥", err.message);
  process.exit(1);
});
