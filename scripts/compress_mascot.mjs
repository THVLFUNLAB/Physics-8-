/**
 * compress_mascot.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-encode mascot MP4 → WebM (VP9 + alpha) để:
 *   1. Loại bỏ nền trắng (chromakey white → transparent)
 *   2. Giảm tối đa dung lượng (CRF 38, 2-pass, scale 75%)
 *   3. Giữ animation + alpha channel cho Chrome/Firefox/Edge/Android
 *
 * Chạy: node scripts/compress_mascot.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require    = createRequire(import.meta.url);
const ffmpeg     = require('ffmpeg-static');

const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'mascot');
const BACKUP_DIR = path.join(PUBLIC_DIR, '_backup_mp4');

// ─── Danh sách file cần xử lý ────────────────────────────────────────────────
const CLIPS = [
  { name: 'idle',  loop: true  },
  { name: 'greet', loop: false },
  { name: 'poked', loop: false },
];

// ─── Màu nền cần loại bỏ (trắng) ─────────────────────────────────────────────
// similarity: 0.1 = chỉ loại màu trắng tinh → tăng nếu viền còn halo
// blend:      0.15 = mép mềm, tránh răng cưa
const CHROMA_WHITE = 'color=white:similarity=0.15:blend=0.15';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sizeMB(file) {
  try {
    return (fs.statSync(file).size / 1024 / 1024).toFixed(2) + ' MB';
  } catch {
    return 'N/A';
  }
}

function run(bin, args, label) {
  console.log(`\n▶ ${label}`);
  console.log('  ', [bin, ...args].join(' '));
  execFileSync(bin, args, { stdio: 'inherit' });
}

// ─── Backup MP4 gốc (chỉ 1 lần) ─────────────────────────────────────────────
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const { name } of CLIPS) {
    const src = path.join(PUBLIC_DIR, `${name}.mp4`);
    const dst = path.join(BACKUP_DIR, `${name}.mp4`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`✅ Backed up: ${name}.mp4`);
    }
  }
}

// ─── Encode từng clip ─────────────────────────────────────────────────────────
for (const { name } of CLIPS) {
  const input  = path.join(BACKUP_DIR, `${name}.mp4`);
  const outWebm = path.join(PUBLIC_DIR, `${name}.webm`);

  if (!fs.existsSync(input)) {
    console.warn(`⚠️  Bỏ qua ${name}.mp4 — không tìm thấy file`);
    continue;
  }

  const beforeWebm = sizeMB(outWebm);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎬 Encoding: ${name}  (before WebM: ${beforeWebm})`);

  /**
   * Filter chain:
   *   [0:v] scale=iw*0.75:-2            → thu nhỏ 75% (giữ tỷ lệ)
   *        colorkey=white:0.15:0.15      → xoá nền trắng → alpha
   *        format=yuva420p               → bắt buộc để VP9 encode alpha
   *
   * VP9 flags:
   *   -c:v libvpx-vp9                    → VP9 codec
   *   -crf 40 -b:v 0                     → constant quality mode, CRF=40
   *   -auto-alt-ref 0                    → bắt buộc khi có alpha channel
   *   -lag-in-frames 0                   → giảm memory (optional)
   *   -deadline good -cpu-used 2         → encode nhanh, chất tốt
   *   -pix_fmt yuva420p                  → alpha output
   *   -an                                → bỏ audio track
   */
  const vfChain = [
    'scale=iw*0.75:-2',
    `colorkey=white:0.15:0.15`,
    'format=yuva420p',
  ].join(',');

  const args = [
    '-y',
    '-i', input,
    '-vf', vfChain,
    '-c:v', 'libvpx-vp9',
    '-crf', '40',
    '-b:v', '0',
    '-auto-alt-ref', '0',
    '-lag-in-frames', '0',
    '-deadline', 'good',
    '-cpu-used', '2',
    '-pix_fmt', 'yuva420p',
    '-an',
    outWebm,
  ];

  run(ffmpeg, args, `VP9-alpha encode → ${name}.webm`);

  const afterWebm = sizeMB(outWebm);
  console.log(`  ✅ ${name}.webm: ${beforeWebm} → ${afterWebm}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('📊 KẾT QUẢ CUỐI:');
let totalAfter = 0;
for (const { name } of CLIPS) {
  const webm = path.join(PUBLIC_DIR, `${name}.webm`);
  if (fs.existsSync(webm)) {
    const mb = fs.statSync(webm).size / 1024 / 1024;
    totalAfter += mb;
    console.log(`   ${name}.webm  →  ${mb.toFixed(2)} MB`);
  }
}
console.log(`   ─────────────────────────`);
console.log(`   TỔNG WebM mới: ${totalAfter.toFixed(2)} MB`);
console.log(`\n✅ Xong! MP4 gốc được backup tại: ${BACKUP_DIR}`);
console.log(`\n⚠️  Lưu ý: WebM VP9+alpha chạy tốt trên Chrome/Firefox/Edge/Android.`);
console.log(`   Safari/iOS KHÔNG hỗ trợ alpha channel WebM.`);
console.log(`   → Fallback MP4 sẽ vẫn có nền trắng trên Safari.`);
console.log(`   → Dùng CSS mix-blend-mode:multiply hoặc isolate cho Safari.`);
