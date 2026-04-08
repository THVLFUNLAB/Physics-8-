import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';

// ─── Helper: Bảo vệ ảnh hợp lệ trước khi dọn base64 rác ────────────────
// Tạm thay ảnh Markdown ![...](data:image/...) bằng placeholder an toàn,
// chạy regex dọn rác, rồi khôi phục ảnh lại.
function cleanLeakedBase64(str: string): string {
  const backup: string[] = [];
  // Bảo vệ ảnh Markdown hợp lệ
  let result = str.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, (m) => {
    backup.push(m);
    return `__PROTECT_IMG_${backup.length - 1}__`;
  });
  // Bảo vệ ảnh HTML hợp lệ <img src="data:image/...">
  result = result.replace(/<img\s+[^>]*src=["']data:image\/[^"']+["'][^>]*\/?>/gi, (m) => {
    backup.push(m);
    return `__PROTECT_IMG_${backup.length - 1}__`;
  });
  // Giờ mới xóa base64 rác (ảnh hợp lệ đã an toàn)
  result = result.replace(/\(?data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]{20,}\)?/g, '');
  // Khôi phục ảnh hợp lệ
  return result.replace(/__PROTECT_IMG_(\d+)__/g, (_, i) => backup[parseInt(i)]);
}

const MathRenderer = ({ content, block }: { content: string, block?: boolean }) => {
  // ── Pre-clean: Loại bỏ rác trước khi render ──────────────────────────────
  let cleaned = content ?? '';

  // [FIX #1] Xóa triệt để mọi dạng "HÌNH MINH HỌA" (label, placeholder, badge)
  cleaned = cleaned.replace(/<[^>]*>\s*HÌNH\s+MINH\s+HỌA[^<]*<\/[^>]*>/gi, '');
  cleaned = cleaned.replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '');
  cleaned = cleaned.replace(/HÌNH\s+MINH\s+HỌA\s*[^\n]*/gi, '');
  cleaned = cleaned.replace(/Hình minh họa đề thi/g, '');

  // [FIX #2] Xóa chuỗi base64 rác — BẢO VỆ ảnh hợp lệ trước
  cleaned = cleanLeakedBase64(cleaned);

  // Step 1: Tách các thẻ <img> ra khỏi nội dung trước khi xóa HTML  
  // để không mất ảnh Base64 / URL đã chèn
  const imgTagMap: Record<string, string> = {};
  let imgCounter = 0;
  let processedContent = cleaned.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (_match, src) => {
    if (!src || src === '' || src === 'data:image/png;base64,ERROR') return '';

    const placeholder = `__IMG_PLACEHOLDER_${imgCounter}__`;
    imgTagMap[placeholder] = src;
    imgCounter++;
    return placeholder;
  });

  // Step 2: Xóa các HTML tag còn lại (do AI sinh ra) — nhưng giữ nguyên placeholder ảnh
  processedContent = processedContent.replace(/<[^>]*>?/gm, '');

  // Step 2b: Dọn base64 rác lần cuối (bảo vệ markdown img + placeholder)
  const mdImgBackup: string[] = [];
  processedContent = processedContent.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, (m) => {
    mdImgBackup.push(m);
    return `__MD_SAFE_${mdImgBackup.length - 1}__`;
  });
  processedContent = processedContent.replace(/\(?data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]{20,}\)?/g, '');
  processedContent = processedContent.replace(/__MD_SAFE_(\d+)__/g, (_, i) => mdImgBackup[parseInt(i)]);
  processedContent = processedContent.replace(/\s{3,}/g, ' ').trim();

  // Step 3: Tách nội dung thành các phần (ảnh Markdown, placeholder ảnh, LaTeX, text thường)
  const parts = processedContent.split(
    /(!\[[^\]]*\]\([^)]+\)|__IMG_PLACEHOLDER_\d+__|\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\\\\[\[\s\S]+?\\\\]|\\\\[\(\s\S]+?\\\\\))/g
  );
  
  return (
    <span className="break-words whitespace-normal min-w-0">
      {parts.map((part, i) => {
        if (!part || !part.trim()) return null;

        // Ảnh dạng Markdown: ![alt](url)
        const mdImgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (mdImgMatch) {
          const imgSrc = mdImgMatch[2];
          if (!imgSrc || imgSrc.includes('base64,ERROR')) return null;
          return (
            <div key={i} className="w-full overflow-x-auto block">
              <img
                src={imgSrc}
                alt={mdImgMatch[1] || 'Hình minh họa'}
                className="max-w-full h-auto rounded-xl border border-slate-700 my-2 object-contain bg-white/5"
                loading="lazy"
              />
            </div>
          );
        }

        // Ảnh dạng <img> tag đã trích ra trước đó
        if (part.startsWith('__IMG_PLACEHOLDER_') && imgTagMap[part]) {
          return (
            <div key={i} className="w-full overflow-x-auto block">
              <img
                src={imgTagMap[part]}
                alt="Hình minh họa"
                className="max-w-full h-auto rounded-xl border border-slate-700 my-2 object-contain bg-white/5"
                loading="lazy"
              />
            </div>
          );
        }

        // [FIX #1] Xóa bất kỳ [HÌNH MINH HỌA...] còn sót lại
        if (/^\[?HÌNH\s+MINH\s+HỌA/i.test(part)) {
          return null;
        }

        if (part.startsWith('$$')) {
          return <BlockMath key={i} math={part.slice(2, -2)} />;
        } else if (part.startsWith('$')) {
          return <InlineMath key={i} math={part.slice(1, -1)} />;
        } else if (part.startsWith('\\[')) {
          return <BlockMath key={i} math={part.slice(2, -2)} />;
        } else if (part.startsWith('\\(')) {
          return <InlineMath key={i} math={part.slice(2, -2)} />;
        }

        // [FIX #2] Lọc cuối: nếu part chứa chuỗi base64 rác → ẩn
        if (/data:image\/[a-zA-Z+]+;base64,/i.test(part)) {
          return null;
        }

        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

export default MathRenderer;
