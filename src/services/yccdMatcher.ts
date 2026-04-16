/**
 * ═══════════════════════════════════════════════════════════════
 *  yccdMatcher.ts — Keyword Matching Engine (FREE, NO API)
 *  So khớp câu hỏi với YCCĐ dựa trên từ khóa + topic
 * ═══════════════════════════════════════════════════════════════
 */
import { YCCD_LIST, type YCCD } from '../data/yccdData';
import { TOPIC_ALIASES } from '../utils/physicsTopics';
import type { Question } from '../types';

interface MatchResult {
  yccdCode: string;
  score: number;          // 0-100, điểm tin cậy
  yccd: YCCD;
  matchedKeywords: string[];
}

/**
 * Map tên topic trong câu hỏi sang tên chuẩn GDPT 2018 trong YCCĐ
 * Ví dụ: "Từ trường" → "Trường từ (Từ trường)"
 */
function resolveTopicToGDPT(qTopic: string): string[] {
  const lower = qTopic.toLowerCase().trim();
  const matches: string[] = [];

  // Direct match
  for (const y of YCCD_LIST) {
    if (y.topic.toLowerCase() === lower) {
      matches.push(y.topic);
    }
  }

  // Alias match
  for (const [gdptName, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (gdptName.toLowerCase() === lower || aliases.some(a => a.toLowerCase() === lower)) {
      // Tìm topic YCCĐ tương ứng
      for (const y of YCCD_LIST) {
        if (y.topic.toLowerCase().includes(gdptName.toLowerCase().split('(')[0].trim()) ||
            gdptName.toLowerCase().includes(y.topic.toLowerCase())) {
          matches.push(y.topic);
        }
      }
    }
  }

  // Fuzzy partial match as fallback
  if (matches.length === 0) {
    for (const y of YCCD_LIST) {
      if (y.topic.toLowerCase().includes(lower) || lower.includes(y.topic.toLowerCase())) {
        matches.push(y.topic);
      }
    }
  }

  return [...new Set(matches)];
}

/**
 * Tính điểm so khớp giữa nội dung câu hỏi và một YCCĐ
 * Dựa trên: keyword overlap + topic match + level hints
 */
function calculateMatchScore(question: Question, yccd: YCCD): { score: number; matchedKeywords: string[] } {
  const qContent = (question.content || '').toLowerCase();
  const qExplanation = (question.explanation || '').toLowerCase();
  const qTags = (question.tags || []).map(t => t.toLowerCase());
  const qSubTopic = (question.subTopic || '').toLowerCase();

  const fullText = [qContent, qExplanation, ...qTags, qSubTopic].join(' ');
  const matchedKeywords: string[] = [];

  // ── Phase 1: Topic Match (40 điểm tối đa) ──
  let topicScore = 0;
  const resolvedTopics = resolveTopicToGDPT(question.topic || '');
  if (resolvedTopics.includes(yccd.topic)) {
    topicScore = 40;
  } else if (resolvedTopics.some(t => yccd.topic.includes(t) || t.includes(yccd.topic))) {
    topicScore = 25;
  }

  // ── Phase 2: Keyword Match (50 điểm tối đa) ──
  let keywordHits = 0;
  const uniqueKeywords = yccd.keywords.filter(k => k.length > 3); // Bỏ từ quá ngắn

  for (const keyword of uniqueKeywords) {
    if (fullText.includes(keyword)) {
      keywordHits++;
      matchedKeywords.push(keyword);
    }
  }

  // Normalize: càng nhiều keyword match → điểm càng cao
  const keywordRatio = uniqueKeywords.length > 0 ? keywordHits / Math.min(uniqueKeywords.length, 8) : 0;
  const keywordScore = Math.min(50, Math.round(keywordRatio * 50));

  // ── Phase 3: Grade Match Bonus (10 điểm) ──
  let gradeBonus = 0;
  // Nếu câu hỏi thuộc topic của Lớp 12 mà YCCĐ cũng lớp 12 → bonus
  const gradeHints: Record<string, string[]> = {
    '12': ['Vật lí nhiệt', 'Khí lí tưởng', 'Trường từ (Từ trường)', 'Từ trường', 'Vật lí hạt nhân và phóng xạ', 'Hạt nhân', 'Cảm ứng điện từ'],
    '11': ['Dao động', 'Sóng', 'Trường điện', 'Điện trường', 'Dòng điện, mạch điện', 'Dòng điện'],
    '10': ['Mở đầu', 'Động học', 'Động lực học', 'Công, năng lượng, công suất', 'Động lượng', 'Chuyển động tròn', 'Biến dạng của vật rắn'],
  };

  for (const [grade, topics] of Object.entries(gradeHints)) {
    if (topics.some(t => (question.topic || '').toLowerCase().includes(t.toLowerCase())) && yccd.grade === grade) {
      gradeBonus = 10;
      break;
    }
  }

  const totalScore = Math.min(100, topicScore + keywordScore + gradeBonus);
  return { score: totalScore, matchedKeywords };
}

/**
 * Tìm YCCĐ phù hợp nhất cho một câu hỏi
 * Trả về top N kết quả sắp xếp theo điểm giảm dần
 */
export function matchQuestionToYCCD(question: Question, topN = 3): MatchResult[] {
  const results: MatchResult[] = [];

  for (const yccd of YCCD_LIST) {
    const { score, matchedKeywords } = calculateMatchScore(question, yccd);
    if (score > 15) { // Ngưỡng tối thiểu
      results.push({
        yccdCode: yccd.code,
        score,
        yccd,
        matchedKeywords,
      });
    }
  }

  // Sắp xếp giảm dần theo score
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

/**
 * Batch process: Quét toàn bộ câu hỏi và gợi ý YCCĐ
 * Chỉ xử lý câu hỏi chưa có yccdCode
 */
export function batchMatchYCCD(questions: Question[]): { questionId: string; question: Question; suggestions: MatchResult[] }[] {
  return questions
    .filter(q => q.id && (!q.yccdCode || q.yccdCode.trim() === ''))
    .map(q => ({
      questionId: q.id!,
      question: q,
      suggestions: matchQuestionToYCCD(q, 3),
    }))
    .filter(r => r.suggestions.length > 0);
}
