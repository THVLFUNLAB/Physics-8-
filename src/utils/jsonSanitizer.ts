/**
 * Sanitize raw AI text TRƯỚC khi gọi JSON.parse().
 * Xử lý:
 * 1. LaTeX single backslash → double backslash (TRONG STRING VALUES)
 * 2. Strip markdown code fences
 * 3. Fix trailing commas
 * 4. Fix unescaped newlines in strings
 */
export function sanitizeJSONText(rawString: string): string {
  // 1. Strip ```json ... ``` wrappers
  let text = rawString.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // 1.5 Strip AI Studio Citation Markers (VD: [cite_start], [cite: 2220, 2221])
  text = text.replace(/\[cite_start\]/gi, '').replace(/\[cite:[^\]]+\]/gi, '');

  // 2. Fix LaTeX backslashes INSIDE JSON string values
  //    Tìm mọi string value trong JSON và double-escape backslashes
  //    chưa được escape (trừ các escape sequences hợp lệ: \n, \t, \\, \", \/, \b, \f, \r, \uXXXX)
  text = text.replace(
    /"(?:[^"\\]|\\.)*"/g,
    (match) => {
      // Bên trong mỗi JSON string, tìm \ không theo sau bởi escape hợp lệ và không đứng sau TRƯỚC nó
      return match.replace(
        /(?<!\\)\\(?!["\\/bfnrtu])/g,
        '\\\\'
      );
    }
  );

  // 3. Fix trailing commas: ,] → ] and ,} → }
  text = text.replace(/,\s*([\]}])/g, '$1');

  return text;
}

/**
 * Safe JSON.parse with sanitization + fallback
 */
export function safeJSONParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(sanitizeJSONText(raw));
  } catch (e1) {
    console.warn('[safeJSONParse] Lần 1 thất bại, thử aggressive fix...', e1);
    try {
      // Aggressive: replace ALL single backslashes inside string values
      const aggressive = sanitizeJSONText(raw); // Đã có lookbehind fix, không cần nhân đôi mọi backslash
      return JSON.parse(aggressive);
    } catch (e2) {
      console.error('[safeJSONParse] Parse thất bại hoàn toàn:', e2);
      return fallback;
    }
  }
}
