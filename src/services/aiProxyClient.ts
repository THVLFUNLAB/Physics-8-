/* ═══════════════════════════════════════════════════════════════
 *  AI PROXY CLIENT — Gọi /api/ai-proxy thay vì Gemini trực tiếp
 *
 *  Tự động lấy Firebase ID token → gửi kèm mỗi request.
 *  API key KHÔNG bao giờ xuất hiện ở browser.
 * ═══════════════════════════════════════════════════════════════ */

import { auth } from '../firebase';

const PROXY_URL = '/api/ai-proxy';

export interface ProxyGenerateOptions {
  model: string;
  contents: string | any[];   // string = text prompt, array = multimodal parts
  config?: {
    responseMimeType?: string;
    responseSchema?: any;
    temperature?: number;
    maxOutputTokens?: number;
  };
}

/**
 * Gọi Gemini qua proxy server-side (API key ẩn hoàn toàn).
 * Trả về text response từ model.
 */
export async function proxyGenerateContent(options: ProxyGenerateOptions): Promise<{ text: string }> {
  // Lấy Firebase ID token của user đang đăng nhập
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Chưa đăng nhập. Vui lòng đăng nhập để sử dụng AI.');
  }

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    throw new Error('Không lấy được token xác thực. Vui lòng đăng nhập lại.');
  }

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      model: options.model,
      contents: options.contents,
      config: options.config,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: 'Unknown error' })) as any;
    const status = response.status;

    if (status === 401) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    if (status === 429) throw new Error('Quá nhiều yêu cầu. Vui lòng đợi 1 phút rồi thử lại.');
    if (status === 503) throw new Error('AI đang bận. Vui lòng thử lại sau vài giây.');

    throw new Error(`AI proxy error ${status}: ${errData?.error || 'Unknown'}`);
  }

  return response.json() as Promise<{ text: string }>;
}
