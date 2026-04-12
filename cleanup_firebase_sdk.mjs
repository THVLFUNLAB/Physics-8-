/**
 * cleanup_firebase_sdk.mjs
 * ─────────────────────────────────────────────────
 * Xóa câu hỏi "Chưa phân loại" trực tiếp bằng Firebase JS SDK (client)
 * Chạy trong Node.js, không cần trình duyệt.
 *
 * Cách chạy: node cleanup_firebase_sdk.mjs
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { getAuth, signInWithCustomToken } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBeJul-y-01bMr-UzqGou2icn3tL6YiSCU",
  authDomain: "gen-lang-client-0765259986.firebaseapp.com",
  projectId: "gen-lang-client-0765259986",
  storageBucket: "gen-lang-client-0765259986.firebasestorage.app",
  messagingSenderId: "429675495922",
  appId: "1:429675495922:web:6c90e94aa29652d251ab6b",
};

const FIRESTORE_DB_ID = "ai-studio-bcba3130-d40a-41ac-adf2-90526578a2ea";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, FIRESTORE_DB_ID);

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("    🧹 CLEANUP: Xóa câu hỏi 'Chưa phân loại'        ");
  console.log("═══════════════════════════════════════════════════════");

  // ── Step 1: Load all ──
  console.log("\n🔍 Đang tải toàn bộ câu hỏi...");
  const qRef = collection(db, "questions");
  const snapshot = await getDocs(qRef);
  console.log(`📊 Tổng documents: ${snapshot.size}`);

  // ── Step 2: Phân loại ──
  const toDelete = [];
  const toKeep = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const topic = data.topic || "";
    const isUncategorized = topic === "Chưa phân loại" || topic === "" || !topic;

    if (isUncategorized) {
      toDelete.push({ id: docSnap.id, topic: topic || "(trống)", content: (data.content || "").substring(0, 60) });
    } else {
      toKeep.push({ id: docSnap.id, topic });
    }
  });

  // Thống kê
  const topicStats = {};
  toKeep.forEach(d => { topicStats[d.topic] = (topicStats[d.topic] || 0) + 1; });

  console.log(`\n✅ GIỮ LẠI: ${toKeep.length} câu`);
  Object.entries(topicStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([topic, count]) => console.log(`   • ${topic}: ${count} câu`));

  console.log(`\n🗑️  CẦN XÓA: ${toDelete.length} câu "Chưa phân loại"`);
  toDelete.slice(0, 5).forEach(d =>
    console.log(`   • [${d.id.substring(0, 8)}...] "${d.content}..."`)
  );

  if (toDelete.length === 0) {
    console.log("\n✨ Không có câu nào cần xóa!");
    return;
  }

  console.log(`\n⚠️  Bắt đầu xóa ${toDelete.length} câu trong 3 giây...`);
  await new Promise(r => setTimeout(r, 3000));

  // ── Step 3: Xóa ──
  let deleted = 0;
  let failed = 0;

  for (const item of toDelete) {
    try {
      await deleteDoc(doc(db, "questions", item.id));
      deleted++;
    } catch (err) {
      failed++;
      console.error(`   ❌ ${item.id}: ${err.message}`);
    }

    if ((deleted + failed) % 20 === 0 || (deleted + failed) === toDelete.length) {
      console.log(`   🗑️  ${deleted + failed}/${toDelete.length} — Xóa: ${deleted} | Lỗi: ${failed}`);
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ HOÀN TẤT!`);
  console.log(`   Đã xóa: ${deleted}`);
  console.log(`   Lỗi: ${failed}`);
  console.log(`   Còn lại: ${toKeep.length}`);
  console.log(`════════════════════════════════════════`);

  // Kiểm tra lại
  console.log(`\n🔍 Kiểm tra lại...`);
  await new Promise(r => setTimeout(r, 2000));
  const checkSnap = await getDocs(qRef);
  console.log(`📊 Số documents thực tế còn lại: ${checkSnap.size}`);

  const remainingUncategorized = [];
  checkSnap.forEach(d => {
    const t = d.data().topic || "";
    if (t === "Chưa phân loại" || !t) remainingUncategorized.push(d.id);
  });

  if (remainingUncategorized.length === 0) {
    console.log(`✨ HOÀN HẢO! Không còn câu "Chưa phân loại" nào!`);
  } else {
    console.log(`⚠️  Vẫn còn ${remainingUncategorized.length} câu chưa phân loại.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("💥 LỖI:", err.message);
  process.exit(1);
});
