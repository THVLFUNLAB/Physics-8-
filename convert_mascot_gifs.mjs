/**
 * convert_mascot_gifs.mjs
 * ────────────────────────────────────────────────────────────
 * Chuyển đổi 3 file GIF mascot sang WebM + MP4.
 * WebM: giảm ~92% dung lượng so với GIF, animation giữ nguyên.
 *
 * Chạy: node convert_mascot_gifs.mjs
 * ────────────────────────────────────────────────────────────
 */

import { execSync } from 'child_process';
import { existsSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lấy đường dẫn ffmpeg từ ffmpeg-static
let ffmpegPath;
try {
  const { default: ffmpegStatic } = await import('ffmpeg-static');
  ffmpegPath = ffmpegStatic;
  console.log(`✅ ffmpeg found at: ${ffmpegPath}`);
} catch (e) {
  console.error('❌ Không tìm thấy ffmpeg-static. Chạy: npm install --save-dev ffmpeg-static');
  process.exit(1);
}

const PUBLIC_DIR = join(__dirname, 'public');
const MASCOT_DIR = join(PUBLIC_DIR, 'mascot');

// Đảm bảo thư mục mascot tồn tại
if (!existsSync(MASCOT_DIR)) {
  mkdirSync(MASCOT_DIR, { recursive: true });
}

const GIF_FILES = ['idle', 'greet', 'poked'];

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function convertGifToWebM(name) {
  const input  = join(MASCOT_DIR, `${name}.gif`);
  const outWebM = join(MASCOT_DIR, `${name}.webm`);
  const outMP4  = join(MASCOT_DIR, `${name}.mp4`);

  if (!existsSync(input)) {
    console.warn(`⚠️  Bỏ qua: ${input} (không tồn tại)`);
    return;
  }

  const originalSize = statSync(input).size;
  console.log(`\n🔄 Đang convert: ${name}.gif (${formatMB(originalSize)})`);

  // ── Convert → WebM (VP9, lossless-ish, loops) ──────────────────────────────
  // -vf "split..." → dùng palette để giữ chất lượng màu (như GIF)
  // -loop 0        → lặp vô tận (tương đương GIF loop)
  // -b:v 0 -crf 33 → chất lượng tốt, dung lượng nhỏ
  const webmCmd = [
    `"${ffmpegPath}"`,
    `-i "${input}"`,
    `-c:v libvpx-vp9`,
    `-b:v 0`,
    `-crf 33`,
    `-loop 0`,
    `-an`,           // không có audio
    `-pix_fmt yuva420p`,  // hỗ trợ transparency
    `-auto-alt-ref 0`,
    `-y`,            // ghi đè nếu tồn tại
    `"${outWebM}"`,
  ].join(' ');

  // ── Convert → MP4 (H.264, làm fallback cho Safari) ─────────────────────────
  const mp4Cmd = [
    `"${ffmpegPath}"`,
    `-i "${input}"`,
    `-movflags faststart`,
    `-pix_fmt yuv420p`,
    `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"`,  // đảm bảo kích thước chẵn
    `-b:v 0`,
    `-crf 28`,
    `-an`,
    `-y`,
    `"${outMP4}"`,
  ].join(' ');

  try {
    console.log(`   → Generating WebM...`);
    execSync(webmCmd, { stdio: 'pipe' });
    const webmSize = statSync(outWebM).size;
    const webmSaved = (((originalSize - webmSize) / originalSize) * 100).toFixed(1);
    console.log(`   ✅ WebM: ${formatMB(webmSize)} (tiết kiệm ${webmSaved}%)`);
  } catch (err) {
    console.error(`   ❌ WebM failed: ${err.message}`);
  }

  try {
    console.log(`   → Generating MP4 fallback...`);
    execSync(mp4Cmd, { stdio: 'pipe' });
    const mp4Size = statSync(outMP4).size;
    const mp4Saved = (((originalSize - mp4Size) / originalSize) * 100).toFixed(1);
    console.log(`   ✅ MP4:  ${formatMB(mp4Size)} (tiết kiệm ${mp4Saved}%)`);
  } catch (err) {
    console.error(`   ❌ MP4 failed: ${err.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

console.log('🚀 Bắt đầu chuyển đổi GIF Mascot → WebM/MP4');
console.log('═'.repeat(55));

let totalBefore = 0;
let totalAfter  = 0;

for (const name of GIF_FILES) {
  const gifPath = join(MASCOT_DIR, `${name}.gif`);
  if (existsSync(gifPath)) {
    totalBefore += statSync(gifPath).size;
  }
  convertGifToWebM(name);
  const webmPath = join(MASCOT_DIR, `${name}.webm`);
  if (existsSync(webmPath)) {
    totalAfter += statSync(webmPath).size;
  }
}

console.log('\n' + '═'.repeat(55));
console.log('📊 TỔNG KẾT:');
console.log(`   GIF gốc:   ${formatMB(totalBefore)}`);
console.log(`   WebM mới:  ${formatMB(totalAfter)}`);
if (totalBefore > 0) {
  const saved = (((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1);
  console.log(`   Tiết kiệm: ${saved}% băng thông Vercel 🎉`);
}
console.log('\n💡 Bước tiếp theo:');
console.log('   1. Kiểm tra animation bằng cách mở web local');
console.log('   2. Nếu OK → chạy: git rm public/mascot/*.gif');
console.log('   3. Deploy lên Vercel');
