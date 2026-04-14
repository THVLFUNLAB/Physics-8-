import { Question } from '../types';

// ── Sanitizer: Strip undefined + chỉ xóa ảnh Base64 QUÁ LỚN (>100KB) ──
// Ảnh nén JPEG (5-20KB) nằm gọn trong giới hạn 1MB Firestore → giữ lại
export const stripLargeBase64 = (str: string): string => {
  // Chỉ xóa ảnh base64 > ~100KB (tức > 136,000 ký tự sau mã hóa)
  let result = str.replace(
    /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]{136000,})\)/g,
    '' // Xóa hoàn toàn thay vì để placeholder
  ).replace(
    /<img\s+[^>]*src=["'](data:image\/[^"']{136000,})["'][^>]*\/?>/gi,
    '' // Xóa hoàn toàn thay vì để placeholder
  );
  // [FIX #1] Xóa mọi dạng label "HÌNH MINH HỌA" trước khi lưu Firestore
  result = result.replace(/\*{0,2}\[HÌNH\s+MINH\s+HỌA[^\]]*\]\*{0,2}/gi, '');
  result = result.replace(/<[^>]*>\s*HÌNH\s+MINH\s+HỌA[^<]*<\/[^>]*>/gi, '');

  // [FIX #2] Xóa chuỗi base64 "rò rỉ" — BẢO VỆ ảnh hợp lệ trước khi dọn
  // Bước 2a: Tạm thay ảnh Markdown hợp lệ ![...](data:image/...) bằng placeholder
  const imgBackup: string[] = [];
  result = result.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, (match) => {
    imgBackup.push(match);
    return `__SAFE_IMG_${imgBackup.length - 1}__`;
  });
  // Bước 2b: Tạm thay ảnh HTML hợp lệ <img src="data:image/..."> bằng placeholder
  result = result.replace(/<img\s+[^>]*src=["']data:image\/[^"']+["'][^>]*\/?>/gi, (match) => {
    imgBackup.push(match);
    return `__SAFE_IMG_${imgBackup.length - 1}__`;
  });
  // Bước 2c: Giờ mới xóa base64 rác (ảnh hợp lệ đã an toàn trong placeholder)
  result = result.replace(/\(?data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]{20,}\)?/g, '');
  // Bước 2d: Khôi phục ảnh hợp lệ
  result = result.replace(/__SAFE_IMG_(\d+)__/g, (_, idx) => imgBackup[parseInt(idx)]);

  return result.replace(/\s{3,}/g, ' ').trim();
};

// Loại bỏ tất cả key có giá trị undefined (Firestore reject undefined)
export const stripUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(item => stripUndefined(item));
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = stripUndefined(value);
      }
    }
    return clean;
  }
  return obj;
};

export const sanitizeQuestion = (q: Question): Record<string, any> => {
  // [FIX] Tách `id` ra khỏi data trước khi lưu Firestore
  // Lý do: Firestore tự quản lý document ID qua addDoc/doc.
  // Nếu để `id` (VD: "q_123_abc" từ parser) vào data, khi đọc lại
  // `{ id: d.id, ...d.data() }` → temp ID ghi đè document ID thật → mọi update sẽ thất bại.
  const { id: _stripId, ...rest } = q;
  const cleaned = {
    ...rest,
    content: stripLargeBase64(q.content || ''),
    explanation: stripLargeBase64(q.explanation || ''),
    options: q.options?.map(opt => stripLargeBase64(opt ?? '')),
    tags: q.tags ?? [],
    resources: q.resources ?? [],
    status: q.status || 'draft',
  };
  return stripUndefined(cleaned);
};
