/**
 * DuplicateDetector — Phát hiện câu hỏi trùng lặp bằng N-gram Cosine Similarity.
 * Không cần API bên ngoài, chạy hoàn toàn client-side.
 */

// ══════════════════════════════════════════════════════════════
// 1. Chuẩn hóa text
// ══════════════════════════════════════════════════════════════

/** Xóa HTML tags, LaTeX, normalize tiếng Việt, lowercase */
export function normalizeForComparison(raw: string): string {
  let s = raw;
  // Xóa HTML tags
  s = s.replace(/<[^>]*>/g, ' ');
  // Xóa LaTeX inline: $...$, \(...\), $$...$$
  s = s.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  s = s.replace(/\$[^$]+\$/g, ' ');
  s = s.replace(/\\\([\s\S]*?\\\)/g, ' ');
  s = s.replace(/\\\[[\s\S]*?\\\]/g, ' ');
  // Xóa markdown image ![...](...)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  // Xóa ký tự đặc biệt, giữ chữ và số
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  // Normalize Unicode + bỏ dấu
  s = s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
  // Gộp khoảng trắng
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ══════════════════════════════════════════════════════════════
// 2. N-gram Tokenizer (Trigrams)
// ══════════════════════════════════════════════════════════════

/** Tạo word-level bigrams từ text đã normalize */
function getWordBigrams(text: string): Map<string, number> {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const bigrams = new Map<string, number>();
  
  // Thêm unigrams (từ đơn) cho matching tốt hơn
  for (const word of words) {
    if (word.length >= 2) { // Bỏ từ quá ngắn
      bigrams.set(word, (bigrams.get(word) || 0) + 1);
    }
  }
  
  // Thêm bigrams (2 từ liên tiếp)
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  
  return bigrams;
}

// ══════════════════════════════════════════════════════════════
// 3. Cosine Similarity
// ══════════════════════════════════════════════════════════════

/** Tính Cosine Similarity giữa 2 frequency maps */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Dot product: chỉ tính trên các key chung
  for (const [key, valA] of a) {
    normA += valA * valA;
    const valB = b.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }

  for (const [, valB] of b) {
    normB += valB * valB;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

// ══════════════════════════════════════════════════════════════
// 4. Duplicate Group Detection
// ══════════════════════════════════════════════════════════════

export interface DuplicatePair {
  idA: string;
  idB: string;
  similarity: number; // 0.0 - 1.0
  textA: string;      // Original content
  textB: string;
}

export interface QuestionForScan {
  id: string;
  content: string;
  options?: string[];
  part: number;
  topic: string;
  level: string;
}

/**
 * Quét toàn bộ kho câu hỏi và tìm các cặp trùng lặp ≥ threshold.
 * Sử dụng word bigram + cosine similarity.
 * @param questions Danh sách câu hỏi cần quét
 * @param threshold Ngưỡng similarity (mặc định 0.7 = 70%)
 * @param onProgress Callback cho progress bar (0-100)
 */
export function scanForDuplicates(
  questions: QuestionForScan[],
  threshold: number = 0.7,
  onProgress?: (percent: number, found: number) => void
): DuplicatePair[] {
  const n = questions.length;
  if (n < 2) return [];

  // Pre-compute: normalize text + bigram vectors cho tất cả câu
  // FIX VĐ4: Chuỗi so sánh = content + options (A/B/C/D) để phát hiện trùng chính xác hơn
  const prepared: { id: string; content: string; vec: Map<string, number>; normalized: string }[] = [];
  for (const q of questions) {
    // Build composite text: [Question_Content] + " | A: opt_A | B: ... | D: opt_D"
    let compositeText = q.content;
    if (q.options && q.options.length > 0) {
      const labels = ['A', 'B', 'C', 'D'];
      const optionsStr = q.options
        .map((opt, i) => `${labels[i] || String.fromCharCode(65 + i)}: ${opt}`)
        .join(' | ');
      compositeText += ' | ' + optionsStr;
    }
    const normalized = normalizeForComparison(compositeText);
    if (normalized.length < 10) continue; // Bỏ câu quá ngắn
    prepared.push({
      id: q.id!,
      content: q.content,
      vec: getWordBigrams(normalized),
      normalized,
    });
  }

  const totalComparisons = (prepared.length * (prepared.length - 1)) / 2;
  let comparisonsDone = 0;
  const duplicates: DuplicatePair[] = [];
  const lastProgress = { percent: -1 };

  // So sánh tất cả các cặp
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const sim = cosineSimilarity(prepared[i].vec, prepared[j].vec);
      
      if (sim >= threshold) {
        duplicates.push({
          idA: prepared[i].id,
          idB: prepared[j].id,
          similarity: sim,
          textA: prepared[i].content,
          textB: prepared[j].content,
        });
      }

      comparisonsDone++;
      if (onProgress) {
        const percent = Math.floor((comparisonsDone / totalComparisons) * 100);
        if (percent !== lastProgress.percent) {
          lastProgress.percent = percent;
          onProgress(percent, duplicates.length);
        }
      }
    }
  }

  // Sắp xếp theo similarity giảm dần
  duplicates.sort((a, b) => b.similarity - a.similarity);
  return duplicates;
}

// ══════════════════════════════════════════════════════════════
// 5. Text Diff — Highlight sự khác biệt giữa 2 chuỗi
// ══════════════════════════════════════════════════════════════

export interface DiffSegment {
  text: string;
  type: 'same' | 'added' | 'removed';
}

/** Tính LCS (Longest Common Subsequence) trên mảng từ */
function lcsWords(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  // Optimize: dùng 2 hàng thay vì matrix đầy đủ
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev.fill(0)];
  }
  
  // Backtrack to find LCS
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

/** Tạo diff giữa 2 text cho phần highlight */
export function computeWordDiff(textA: string, textB: string): { diffA: DiffSegment[]; diffB: DiffSegment[] } {
  const wordsA = textA.split(/(\s+)/).filter(s => s.trim().length > 0);
  const wordsB = textB.split(/(\s+)/).filter(s => s.trim().length > 0);
  
  // Giới hạn: nếu 2 text quá dài, chỉ so sánh 200 từ đầu
  const limitA = wordsA.slice(0, 200);
  const limitB = wordsB.slice(0, 200);
  
  const lcs = lcsWords(limitA, limitB);
  
  // Build diff cho A
  const diffA: DiffSegment[] = [];
  let lcsIdx = 0;
  for (const word of limitA) {
    if (lcsIdx < lcs.length && word === lcs[lcsIdx]) {
      diffA.push({ text: word, type: 'same' });
      lcsIdx++;
    } else {
      diffA.push({ text: word, type: 'removed' });
    }
  }
  
  // Build diff cho B
  const diffB: DiffSegment[] = [];
  lcsIdx = 0;
  for (const word of limitB) {
    if (lcsIdx < lcs.length && word === lcs[lcsIdx]) {
      diffB.push({ text: word, type: 'same' });
      lcsIdx++;
    } else {
      diffB.push({ text: word, type: 'added' });
    }
  }
  
  return { diffA, diffB };
}

// ══════════════════════════════════════════════════════════════
// 6. Check New Question Against Existing Bank (1 vs N)
// ══════════════════════════════════════════════════════════════

export interface BankDuplicateMatch {
  bankQuestionId: string;    // ID câu trong ngân hàng
  bankContent: string;       // Nội dung câu ngân hàng (gốc)
  similarity: number;        // 0.0 - 1.0
  bankTopic: string;
  bankPart: number;
}

/** Pre-compute bigram vectors cho toàn bộ ngân hàng (gọi 1 lần, tái sử dụng) */
export function prepareBankVectors(
  bank: QuestionForScan[]
): { id: string; content: string; topic: string; part: number; vec: Map<string, number> }[] {
  const prepared: { id: string; content: string; topic: string; part: number; vec: Map<string, number> }[] = [];
  for (const q of bank) {
    let compositeText = q.content;
    if (q.options && q.options.length > 0) {
      const labels = ['A', 'B', 'C', 'D'];
      compositeText += ' | ' + q.options.map((opt, i) => `${labels[i] || String.fromCharCode(65 + i)}: ${opt}`).join(' | ');
    }
    const normalized = normalizeForComparison(compositeText);
    if (normalized.length < 10) continue;
    prepared.push({
      id: q.id!,
      content: q.content,
      topic: q.topic,
      part: q.part,
      vec: getWordBigrams(normalized),
    });
  }
  return prepared;
}

/**
 * So sánh 1 câu mới vs toàn bộ ngân hàng đã prepare.
 * Trả về câu giống nhất (nếu ≥ threshold), hoặc null.
 */
export function checkAgainstBank(
  newQuestion: { content: string; options?: string[] },
  preparedBank: { id: string; content: string; topic: string; part: number; vec: Map<string, number> }[],
  threshold: number = 0.7
): BankDuplicateMatch | null {
  // Build vector cho câu mới
  let compositeText = newQuestion.content;
  if (newQuestion.options && newQuestion.options.length > 0) {
    const labels = ['A', 'B', 'C', 'D'];
    compositeText += ' | ' + newQuestion.options.map((opt, i) => `${labels[i] || String.fromCharCode(65 + i)}: ${opt}`).join(' | ');
  }
  const normalized = normalizeForComparison(compositeText);
  if (normalized.length < 10) return null;
  const newVec = getWordBigrams(normalized);

  let bestMatch: BankDuplicateMatch | null = null;
  let bestSim = 0;

  for (const bankItem of preparedBank) {
    const sim = cosineSimilarity(newVec, bankItem.vec);
    if (sim >= threshold && sim > bestSim) {
      bestSim = sim;
      bestMatch = {
        bankQuestionId: bankItem.id,
        bankContent: bankItem.content,
        similarity: sim,
        bankTopic: bankItem.topic,
        bankPart: bankItem.part,
      };
    }
  }

  return bestMatch;
}
