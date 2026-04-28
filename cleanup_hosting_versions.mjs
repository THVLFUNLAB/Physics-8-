/**
 * cleanup_hosting_versions.mjs
 * Xóa hàng loạt các phiên bản Firebase Hosting cũ qua REST API.
 * Giữ lại N phiên bản mới nhất (mặc định: 3).
 *
 * Yêu cầu: firebase login đã chạy hoặc GOOGLE_ACCESS_TOKEN được set
 *
 * Cách dùng:
 *   node cleanup_hosting_versions.mjs              → dry-run (chỉ xem)
 *   node cleanup_hosting_versions.mjs --delete     → xóa thật
 *   node cleanup_hosting_versions.mjs --keep 5     → giữ 5 bản mới nhất
 */

import { execSync } from "child_process";

// ─── CẤU HÌNH ───────────────────────────────────────────────────────────────
const PROJECT_ID = "gen-lang-client-0765259986";
const SITE_ID   = PROJECT_ID; // Thường trùng với project ID
const KEEP_COUNT = parseInt(getArg("--keep") ?? "3");
const DRY_RUN    = !process.argv.includes("--delete");
// ─────────────────────────────────────────────────────────────────────────────

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

/** Lấy access token từ firebase CLI đã đăng nhập */
function getAccessToken() {
  try {
    const token = execSync(
      "npx firebase-tools login:ci --no-localhost 2>nul || npx firebase-tools --version",
      { encoding: "utf-8" }
    );
    // Thử lấy token từ gcloud hoặc firebase CLI
    const raw = execSync("npx firebase-tools login:print-token 2>&1", {
      encoding: "utf-8",
    }).trim();
    if (raw && !raw.includes("Error") && !raw.includes("not")) {
      return raw.split("\n").pop().trim();
    }
  } catch {}

  // Thử gcloud fallback
  try {
    const raw = execSync(
      "gcloud auth print-access-token 2>&1",
      { encoding: "utf-8" }
    ).trim();
    if (raw && !raw.startsWith("ERROR")) return raw;
  } catch {}

  return null;
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  console.log("🔑 Đang lấy Access Token...");
  const token = getAccessToken();

  if (!token) {
    console.error(
      "\n❌ Không tìm thấy access token!\n\n" +
      "Hãy chạy một trong các lệnh sau trước:\n" +
      "  npx firebase-tools login\n" +
      "  hoặc: $env:GOOGLE_ACCESS_TOKEN = '<token>'\n"
    );
    process.exit(1);
  }

  console.log("✅ Token OK!\n");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // ── Lấy danh sách tất cả versions ──────────────────────────────────────────
  console.log("🔍 Đang lấy danh sách phiên bản Firebase Hosting...\n");
  const BASE = "https://firebasehosting.googleapis.com/v1beta1";
  let versions = [];
  let pageToken = null;

  do {
    const url =
      `${BASE}/sites/${SITE_ID}/versions?pageSize=100` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const data = await fetchJSON(url, { headers });
    versions = versions.concat(data.versions ?? []);
    pageToken = data.nextPageToken;
  } while (pageToken);

  if (versions.length === 0) {
    console.log("⚠️  Không tìm thấy phiên bản nào.");
    return;
  }

  // Sắp xếp: mới nhất trước
  versions.sort(
    (a, b) =>
      new Date(b.createTime).getTime() - new Date(a.createTime).getTime()
  );

  const toKeep   = versions.slice(0, KEEP_COUNT);
  const toDelete = versions.slice(KEEP_COUNT);

  console.log(`📋 Tổng số phiên bản: ${versions.length}`);
  console.log(`✅ Giữ lại: ${toKeep.length} phiên bản mới nhất`);
  console.log(`🗑️  Sẽ xóa: ${toDelete.length} phiên bản\n`);

  // ── In danh sách giữ lại ───────────────────────────────────────────────────
  console.log("── GIỮ LẠI ─────────────────────────────────────");
  toKeep.forEach((v, i) => {
    const id = v.name.split("/").pop();
    console.log(`  [${i + 1}] ${v.createTime}  (${v.status ?? "?"})  →  ${id}`);
  });

  if (toDelete.length === 0) {
    console.log("\n✅ Không có phiên bản nào cần xóa.");
    return;
  }

  // ── In danh sách sẽ xóa ───────────────────────────────────────────────────
  console.log("\n── SẼ XÓA ──────────────────────────────────────");
  toDelete.forEach((v, i) => {
    const id = v.name.split("/").pop();
    console.log(`  [${i + 1}] ${v.createTime}  (${v.status ?? "?"})  →  ${id}`);
  });

  // ── Dry-run guard ─────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(
      "\n⚠️  CHẾ ĐỘ DRY-RUN: Chưa xóa gì cả.\n" +
      "   Để xóa thật, chạy:\n\n" +
      "   node cleanup_hosting_versions.mjs --delete\n"
    );
    return;
  }

  // ── Thực sự xóa ──────────────────────────────────────────────────────────
  console.log("\n🚀 Đang xóa các phiên bản cũ...\n");
  let ok = 0, fail = 0;

  for (const v of toDelete) {
    const id = v.name.split("/").pop();
    try {
      await fetchJSON(`${BASE}/${v.name}`, { method: "DELETE", headers });
      console.log(`  ✅ Đã xóa: ${v.createTime}  →  ${id}`);
      ok++;
    } catch (err) {
      console.error(`  ❌ Lỗi: ${v.createTime}  →  ${id}`);
      console.error(`     ${err.message}`);
      fail++;
    }
    // Delay nhỏ tránh rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n── KẾT QUẢ ─────────────────────────────────────");
  console.log(`  ✅ Đã xóa: ${ok} phiên bản`);
  if (fail > 0) console.log(`  ❌ Thất bại: ${fail} phiên bản`);
  console.log("────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("\n❌ Lỗi nghiêm trọng:", err.message);
  process.exit(1);
});
