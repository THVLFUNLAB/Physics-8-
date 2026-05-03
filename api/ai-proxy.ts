/* ═══════════════════════════════════════════════════════════════
 *  AI PROXY — Vercel Serverless Function
 *  File: api/ai-proxy.ts
 *
 *  ✅ API key nằm hoàn toàn trên server (GEMINI_API_KEY)
 *  ✅ Chỉ user đã đăng nhập Firebase mới gọi được (Bearer token)
 *  ✅ Rate limit: tối đa 30 req/phút/user
 *  ✅ Hỗ trợ cả text prompt và multimodal (PDF/image base64)
 * ═══════════════════════════════════════════════════════════════ */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Rate Limiter đơn giản (in-memory, reset mỗi khi cold start) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT    = 30;   // req/phút
const RATE_WINDOW   = 60_000; // 1 phút

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Xác thực Firebase ID Token ─────────────────────────────────
async function verifyFirebaseToken(idToken: string): Promise<string | null> {
  try {
    // Dùng Firebase Auth REST API để verify (không cần firebase-admin)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.error('[ai-proxy] FIREBASE_PROJECT_ID not set');
      return null;
    }
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data?.users?.[0]?.localId ?? null;
  } catch (err) {
    console.error('[ai-proxy] Token verify error:', err);
    return null;
  }
}

// ── Main handler ───────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.phy9plus.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Xác thực Bearer token ──
  const authHeader = req.headers['authorization'] as string || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }

  const uid = await verifyFirebaseToken(idToken);
  if (!uid) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }

  // ── 2. Rate limiting ──
  if (!checkRateLimit(uid)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  // ── 3. Lấy API key server-side ──
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: missing API key' });
  }

  // ── 4. Parse request body ──
  const { model, contents, config } = req.body as {
    model: string;
    contents: any;
    config?: any;
  };

  if (!model || !contents) {
    return res.status(400).json({ error: 'Missing required fields: model, contents' });
  }

  // Whitelist models được phép dùng
  const ALLOWED_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
  if (!ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: `Model not allowed: ${model}` });
  }

  // ── 5. Gọi Gemini API với key server-side ──
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Build request body theo Google Generative Language API format
    const geminiBody: any = {
      contents: Array.isArray(contents)
        ? contents
        : [{ role: 'user', parts: [{ text: contents }] }],
    };

    if (config) {
      geminiBody.generationConfig = {
        ...(config.responseMimeType && { responseMimeType: config.responseMimeType }),
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.maxOutputTokens && { maxOutputTokens: config.maxOutputTokens }),
      };
      if (config.responseSchema) {
        geminiBody.generationConfig.responseSchema = config.responseSchema;
      }
      // ✅ FIX: Forward systemInstruction — bắt buộc cho voiceAITutor & các AI có persona
      if (config.systemInstruction) {
        geminiBody.systemInstruction = {
          parts: [{ text: config.systemInstruction }]
        };
      }
    }

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[ai-proxy] Gemini error:', geminiRes.status, errText.substring(0, 200));
      return res.status(geminiRes.status).json({
        error: `Gemini API error: ${geminiRes.status}`,
        detail: errText.substring(0, 200),
      });
    }

    const geminiData = await geminiRes.json() as any;

    // Trích text từ response
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return res.status(200).json({ text });
  } catch (err: any) {
    console.error('[ai-proxy] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err?.message });
  }
}
