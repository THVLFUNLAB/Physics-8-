/**
 * ═══════════════════════════════════════════════════════════════════
 *  PHYSICS9+ — EXAM GENERATOR SERVICE (v1.0)
 *  Module 2: Dynamic Exam Generator theo Ma trận 2025
 *
 *  LUỒNG XỬ LÝ:
 *    1. Nhận matrixFormulaId + targetGrade
 *    2. Đọc DynamicMatrixFormula từ Firestore
 *    3. Với mỗi (Part × Level) trong matrix, truy vấn Firestore
 *       lấy pool câu hỏi có filter targetGrade / examSource / year
 *    4. Áp dụng Fisher-Yates shuffle trên từng pool
 *    5. Bốc đúng số lượng yêu cầu
 *    6. Ghép 3 phần lại, shuffle tổng thể lần cuối
 *    7. Trả về Question[] sẵn sàng render lên UI
 *
 *  THUẬT TOÁN FISHER-YATES:
 *    Độ phức tạp O(n) — mạnh hơn và chuẩn xác hơn .sort(() => Math.random())
 *
 *  THIẾU CÂU HỎI:
 *    Nếu pool không đủ câu → ghi warning log + bổ sung fallback
 *    (fallback: lấy thêm từ cùng Part/Level mà không filter grade/source)
 * ═══════════════════════════════════════════════════════════════════
 */

import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  limit,
} from '../firebase';
import type {
  Question,
  QuestionLevel,
  DynamicMatrixFormula,
  ExamSource,
} from '../types';
import { ensureClusterIntegrity } from '../utils/clusterIntegrity';

// ─── Constants ────────────────────────────────────────────────────
const QUESTION_COLLECTION = 'questions';
const MATRIX_FORMULA_COLLECTION = 'dynamicMatrixFormulas';

/** Hệ số dư khi lấy pool (lấy nhiều hơn để shuffle có ý nghĩa) */
const POOL_MULTIPLIER = 3;

/** Giới hạn tối đa câu lấy mỗi query (Firestore limit) */
const MAX_POOL_FETCH = 200;

// ─── Types nội bộ ─────────────────────────────────────────────────
export interface GeneratorOptions {
  /** ID công thức ma trận trong collection 'dynamicMatrixFormulas' */
  matrixFormulaId: string;
  /** Khối lớp: 10 | 11 | 12 */
  targetGrade: number;
  /**
   * Chế độ nguồn câu hỏi:
   * - 'strict': Chỉ lấy từ allowedSources trong công thức
   * - 'flexible': Nếu không đủ câu thì mở rộng ra tất cả nguồn
   */
  sourceMode?: 'strict' | 'flexible';
  /**
   * Cho phép dùng câu hỏi không có examSource (câu cũ, chưa gán nguồn)
   * Mặc định: true
   */
  includeUntaggedSource?: boolean;
}

export interface GeneratorResult {
  questions: Question[];
  /** Thống kê: số câu thực tế lấy được theo từng phần */
  stats: {
    part1: { requested: number; fetched: number };
    part2: { requested: number; fetched: number };
    part3: { requested: number; fetched: number };
    total: { requested: number; fetched: number };
  };
  /** Cảnh báo nếu thiếu câu hỏi trong kho */
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════
//  THUẬT TOÁN FISHER-YATES SHUFFLE
// ═══════════════════════════════════════════════════════════════════

/**
 * Xáo trộn mảng theo thuật toán Fisher-Yates (Knuth Shuffle).
 * O(n) — mỗi phần tử được hoán đổi đúng một lần.
 * Chuẩn mực hơn `.sort(() => Math.random() - 0.5)` (bị lệch phân phối).
 */
function fisherYatesShuffle<T>(array: T[]): T[] {
  const arr = [...array]; // Không mutate mảng gốc
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ═══════════════════════════════════════════════════════════════════
//  HELPER: LẤY POOL CÂU HỎI TỪ FIRESTORE
// ═══════════════════════════════════════════════════════════════════

/**
 * Lấy pool câu hỏi từ Firestore với các bộ lọc:
 * - part: 1 | 2 | 3
 * - level: QuestionLevel
 * - targetGrade: số khối lớp
 * - examSources: danh sách nguồn được phép (nếu có)
 *
 * Firestore limitation: `in` operator chỉ hỗ trợ tối đa 10 phần tử.
 * Với examSources > 10 phần tử → chạy nhiều query và gộp lại.
 */
async function fetchQuestionPool(
  part: 1 | 2 | 3,
  level: QuestionLevel,
  targetGrade: number,
  examSources: ExamSource[] | null,
  includeUntaggedSource: boolean,
  poolSize: number
): Promise<Question[]> {
  const allResults: Question[] = [];
  const seenIds = new Set<string>();

  // ── Query chính: có filter examSource ──
  if (examSources && examSources.length > 0) {
    const sourceQuery = query(
      collection(db, QUESTION_COLLECTION),
      where('part', '==', part),
      where('level', '==', level),
      where('targetGrade', '==', targetGrade),
      where('status', '==', 'published'),
      where('examSource', 'in', examSources.slice(0, 10)), // Firestore giới hạn 10
      limit(Math.min(poolSize * POOL_MULTIPLIER, MAX_POOL_FETCH))
    );

    const snap = await getDocs(sourceQuery);
    snap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        allResults.push({ id: d.id, ...d.data() } as Question);
      }
    });
  }

  // ── Query phụ: câu chưa được gán examSource (câu cũ) ──
  if (includeUntaggedSource && allResults.length < poolSize) {
    // Firestore không hỗ trợ "field == null" trực tiếp
    // → Query không có filter examSource, lọc trong memory
    const fallbackQuery = query(
      collection(db, QUESTION_COLLECTION),
      where('part', '==', part),
      where('level', '==', level),
      where('targetGrade', '==', targetGrade),
      where('status', '==', 'published'),
      limit(MAX_POOL_FETCH)
    );

    const fallbackSnap = await getDocs(fallbackQuery);
    fallbackSnap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        const data = d.data() as Question;
        // Chỉ lấy câu chưa có examSource hoặc đã trong allowed list
        const sourceOk =
          !data.examSource ||
          (examSources === null) ||
          examSources.includes(data.examSource);
        if (sourceOk) {
          seenIds.add(d.id);
          allResults.push({ id: d.id, ...data });
        }
      }
    });
  }

  // ── Fallback cuối: lấy mà không filter targetGrade (nếu vẫn thiếu) ──
  if (allResults.length < poolSize) {
    const broadQuery = query(
      collection(db, QUESTION_COLLECTION),
      where('part', '==', part),
      where('level', '==', level),
      where('status', '==', 'published'),
      limit(MAX_POOL_FETCH)
    );
    const broadSnap = await getDocs(broadQuery);
    broadSnap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        allResults.push({ id: d.id, ...d.data() } as Question);
      }
    });
  }

  return allResults;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN: GENERATE DYNAMIC EXAM
// ═══════════════════════════════════════════════════════════════════

/**
 * generateDynamicExam — Hàm chính tạo đề động theo công thức ma trận.
 *
 * @param options - Cấu hình bao gồm matrixFormulaId và targetGrade
 * @returns GeneratorResult chứa Question[] đã shuffle sẵn sàng render
 *
 * @example
 * ```ts
 * const result = await generateDynamicExam({
 *   matrixFormulaId: 'matrix_8plus_grade12',
 *   targetGrade: 12,
 *   sourceMode: 'flexible',
 * });
 * setActiveTest({ questions: result.questions });
 * ```
 */
export async function generateDynamicExam(
  options: GeneratorOptions
): Promise<GeneratorResult> {
  const {
    matrixFormulaId,
    targetGrade,
    sourceMode = 'flexible',
    includeUntaggedSource = true,
  } = options;

  const warnings: string[] = [];

  // ── Bước 1: Đọc DynamicMatrixFormula từ Firestore ──────────────
  const formulaRef = doc(db, MATRIX_FORMULA_COLLECTION, matrixFormulaId);
  const formulaSnap = await getDoc(formulaRef);

  if (!formulaSnap.exists()) {
    throw new Error(
      `[ExamGenerator] Không tìm thấy công thức ma trận với ID: "${matrixFormulaId}"`
    );
  }

  const formula = { id: formulaSnap.id, ...formulaSnap.data() } as DynamicMatrixFormula;

  if (!formula.isActive) {
    throw new Error(
      `[ExamGenerator] Công thức "${formula.title}" đang bị tắt (isActive: false).`
    );
  }

  // ── Bước 2: Xác định bộ lọc nguồn câu hỏi ──────────────────────
  const allowedSources: ExamSource[] | null =
    formula.allowedSources && formula.allowedSources.length > 0
      ? formula.allowedSources
      : null; // null = không filter nguồn

  const useStrictSource = sourceMode === 'strict';

  // ── Bước 3: Bốc câu hỏi theo từng (Part × Level) ───────────────
  const part1Questions: Question[] = [];
  const part2Questions: Question[] = [];
  const part3Questions: Question[] = [];

  const { part1, part2, part3 } = formula.structure2025;

  const partConfigs: Array<{
    partNum: 1 | 2 | 3;
    config: DynamicMatrixFormula['structure2025']['part1'];
    targetArray: Question[];
  }> = [
    { partNum: 1, config: part1, targetArray: part1Questions },
    { partNum: 2, config: part2, targetArray: part2Questions },
    { partNum: 3, config: part3, targetArray: part3Questions },
  ];

  for (const { partNum, config, targetArray } of partConfigs) {
    const levels = Object.entries(config.levels) as [QuestionLevel, number][];

    for (const [level, requiredCount] of levels) {
      if (requiredCount <= 0) continue; // Bỏ qua nếu không cần câu nào

      // ── Lấy pool câu hỏi ──
      const pool = await fetchQuestionPool(
        partNum,
        level,
        targetGrade,
        useStrictSource ? allowedSources : null, // strict: filter nguồn; flexible: không filter
        includeUntaggedSource,
        requiredCount
      );

      if (pool.length === 0) {
        warnings.push(
          `⚠️ Part ${partNum} - ${level}: Kho trống, không có câu nào phù hợp!`
        );
        continue;
      }

      if (pool.length < requiredCount) {
        warnings.push(
          `⚠️ Part ${partNum} - ${level}: Yêu cầu ${requiredCount} câu nhưng kho chỉ có ${pool.length} câu.`
        );
      }

      // ── Shuffle pool theo Fisher-Yates → bốc đúng số lượng ──
      const shuffledPool = fisherYatesShuffle(pool);
      const picked = shuffledPool.slice(0, requiredCount);
      targetArray.push(...picked);
    }
  }

  // ── Bước 4: Ghép 3 phần, shuffle tổng thể lần cuối ─────────────
  // Thứ tự trong đề thi: Part 1 → Part 2 → Part 3 (giữ nguyên thứ tự phần)
  // Nhưng bên trong mỗi phần thì đã shuffle rồi → không cần shuffle lại
  const finalQuestions: Question[] = [
    ...part1Questions,
    ...part2Questions,
    ...part3Questions,
  ];

  // ── Bước 5: Tính thống kê ───────────────────────────────────────
  const stats: GeneratorResult['stats'] = {
    part1: { requested: part1.totalCount, fetched: part1Questions.length },
    part2: { requested: part2.totalCount, fetched: part2Questions.length },
    part3: { requested: part3.totalCount, fetched: part3Questions.length },
    total: {
      requested: part1.totalCount + part2.totalCount + part3.totalCount,
      fetched: finalQuestions.length,
    },
  };

  // Ghi log để debug nếu cần
  if (warnings.length > 0) {
    console.warn('[ExamGenerator] Cảnh báo thiếu hụt nguồn câu hỏi:');
    warnings.forEach((w) => console.warn(' ', w));
  }

  console.log(
    `[ExamGenerator] Sinh đề thành công: ${stats.total.fetched}/${stats.total.requested} câu`,
    `(P1:${stats.part1.fetched}, P2:${stats.part2.fetched}, P3:${stats.part3.fetched})`
  );

  return {
    questions: finalQuestions,
    stats,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  HELPER: LẤY DANH SÁCH CÔNG THỨC MA TRẬN ĐANG ACTIVE
// ═══════════════════════════════════════════════════════════════════
//  MODULE 2.1: ADVANCED EXAM GENERATOR (CHUYÊN SÂU 8+, 9+ LỚP 12)
// ═══════════════════════════════════════════════════════════════════

/**
 * generateAdvancedQuestions — Hàm sinh đề chuyên sâu (5-10 câu)
 * YÊU CẦU NGHIÊM NGẶT (STRICT RULES): 
 * 1. Vai trò: TRUY XUẤT VÀ LỌC DỮ LIỆU (Data Retrieval & Filtering). Tuyệt đối KHÔNG tự tạo/sáng tác câu hỏi.
 * 2. CHỈ dành cho khối 12 (Chương trình GDPT 2018).
 * 3. CHỈ tập trung vào mức độ "Vận dụng" và "Vận dụng cao".
 * 4. WHITELIST: Nhiệt học, Khí lý tưởng, Từ trường, Hạt nhân.
 * 5. BLACKLIST: Mạch RLC, Mạch LC, Dao động cơ, Điện xoay chiều.
 */
export async function generateAdvancedQuestions(
  targetCompetency: '8+' | '9+',
  count: number = 10
): Promise<Question[]> {
  const levels: QuestionLevel[] = targetCompetency === '9+' 
    ? ['Vận dụng cao'] 
    : ['Vận dụng', 'Vận dụng cao'];
    
  // ══════════════════════════════════════════════════════════════════
  //  WHITELIST chủ đề chuẩn CT 2018 Vật lý 12 (4 mạch chính)
  //  Quy ước thầy Hậu:
  //  • "Hạt nhân" → bao gồm cả variant "phóng xạ" (gọi chung)
  //  • "Từ trường" → bao gồm Cảm ứng điện từ + Dòng điện xoay chiều
  //    (CT 2018 đặt chung 1 chương, KHÔNG tách riêng như CT cũ)
  // ══════════════════════════════════════════════════════════════════
  const allowedTopics = [
    // Mạch 1: Vật lí nhiệt
    'Vật lí nhiệt',
    'Vật lý nhiệt',
    // Mạch 2: Khí lí tưởng
    'Khí lí tưởng',
    'Khí lý tưởng',
    // Mạch 3: Từ trường (bao gồm Cảm ứng điện từ + DĐXC theo CT 2018)
    'Từ trường',
    'Cảm ứng điện từ',
    'Dòng điện xoay chiều',
    'Từ trường - Cảm ứng điện từ',
    // Mạch 4: Vật lí hạt nhân (bao gồm cả phóng xạ — gọi chung)
    'Vật lí hạt nhân',
    'Vật lý hạt nhân',
    'Vật lí hạt nhân và phóng xạ',
    'Vật lý hạt nhân và phóng xạ',
    'Hạt nhân nguyên tử',
    'Phóng xạ',
  ];

  // Blacklist: loại trừ các chủ đề KHÔNG thuộc CT 2018 chuẩn
  // (RLC/LC là chương trình cũ 2006 — đã bị loại bỏ khỏi CT GDPT 2018)
  const blacklistKeywords = ['RLC', 'mạch LC', 'dao động cơ', 'lò xo', 'con lắc'];
  // LƯU Ý: 'xoay chiều' đã BỎ khỏi blacklist vì CT 2018 vẫn có DĐXC
  // nhưng đặt trong chương Từ trường (whitelist đã bao gồm)

  const allResults: Question[] = [];
  
  // Lưu ý Firestore: Không thể dùng 2 toán tử 'in' cùng lúc.
  // Ta sẽ query bằng targetGrade + level, sau đó filter Whitelist/Blacklist ở Client.
  const q = query(
    collection(db, QUESTION_COLLECTION),
    where('targetGrade', '==', 12),
    where('level', 'in', levels),
    where('status', '==', 'published')
  );

  const snap = await getDocs(q);
  
  snap.forEach(d => {
    const data = d.data() as Question;
    
    // 1. Kiểm tra Whitelist Topic
    const isTopicAllowed = allowedTopics.includes(data.topic);
    
    // 2. Kiểm tra Blacklist trong Content hoặc Topic
    const contentText = (data.content || '').toLowerCase();
    const topicText = (data.topic || '').toLowerCase();
    
    const isBlacklisted = blacklistKeywords.some(kw => 
      contentText.includes(kw.toLowerCase()) || 
      topicText.includes(kw.toLowerCase())
    );

    if (isTopicAllowed && !isBlacklisted) {
      allResults.push({ id: d.id, ...data });
    }
  });

  // Fisher-Yates shuffle để bốc ngẫu nhiên (chỉ chọn từ những câu khớp 100% Yêu cầu cần đạt)
  const shuffled = fisherYatesShuffle(allResults);
  
  // Trích xuất đúng số lượng yêu cầu (chỉ 5 - 10 câu tinh hoa)
  const initialSelection = shuffled.slice(0, count);

  // Đảm bảo tính toàn vẹn của câu chùm (kéo thêm anh em + sharedContext nếu bốc trúng)
  // Đề có thể lố lên 7-10 câu nhưng luôn tuân thủ nguyên tắc "Chùm là chùm"
  const finalQuestions = await ensureClusterIntegrity(initialSelection, db);
  
  return finalQuestions;
}

// ═══════════════════════════════════════════════════════════════════

/**
 * Lấy tất cả DynamicMatrixFormula đang active cho một khối lớp cụ thể.
 * Dùng để hiển thị menu chọn "Đề 6+" / "Đề 7+" / "Đề 8+" / "Đề 9+" trên UI.
 */
export async function getActiveMatrixFormulas(
  targetGrade?: number
): Promise<DynamicMatrixFormula[]> {
  let q;

  if (targetGrade) {
    q = query(
      collection(db, MATRIX_FORMULA_COLLECTION),
      where('isActive', '==', true),
      where('targetGrade', '==', targetGrade)
    );
  } else {
    q = query(
      collection(db, MATRIX_FORMULA_COLLECTION),
      where('isActive', '==', true)
    );
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as DynamicMatrixFormula[];
}

// ═══════════════════════════════════════════════════════════════════
//  PRESET: CÔNG THỨC MA TRẬN MẪU CHO KHỐI 12
//  Dùng để seed dữ liệu vào Firestore lần đầu (chạy 1 lần)
// ═══════════════════════════════════════════════════════════════════

/**
 * Các preset công thức ma trận chuẩn THPT 2025 cho khối 12.
 * Admin có thể seed vào Firestore qua Admin Panel.
 *
 * Cấu trúc đề 2025: 18 (P1) + 4 (P2) + 6 (P3) = 28 câu
 */
export const PRESET_MATRIX_FORMULAS: Omit<DynamicMatrixFormula, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    title: 'Đề 6+ Vật lý 12 - Ma trận 2025',
    description: 'Phù hợp học sinh mục tiêu 6 điểm, tập trung Nhận biết + Thông hiểu',
    targetGrade: 12,
    targetCompetency: '6+',
    structure2025: {
      part1: {
        totalCount: 18,
        levels: { 'Nhận biết': 10, 'Thông hiểu': 6, 'Vận dụng': 2, 'Vận dụng cao': 0 },
      },
      part2: {
        totalCount: 4,
        levels: { 'Nhận biết': 1, 'Thông hiểu': 2, 'Vận dụng': 1, 'Vận dụng cao': 0 },
      },
      part3: {
        totalCount: 6,
        levels: { 'Nhận biết': 2, 'Thông hiểu': 2, 'Vận dụng': 2, 'Vận dụng cao': 0 },
      },
    },
    isActive: true,
    createdBy: 'system',
  },
  {
    title: 'Đề 7+ Vật lý 12 - Ma trận 2025',
    description: 'Phù hợp học sinh mục tiêu 7 điểm, cân bằng Thông hiểu + Vận dụng',
    targetGrade: 12,
    targetCompetency: '7+',
    structure2025: {
      part1: {
        totalCount: 18,
        levels: { 'Nhận biết': 7, 'Thông hiểu': 7, 'Vận dụng': 3, 'Vận dụng cao': 1 },
      },
      part2: {
        totalCount: 4,
        levels: { 'Nhận biết': 0, 'Thông hiểu': 2, 'Vận dụng': 1, 'Vận dụng cao': 1 },
      },
      part3: {
        totalCount: 6,
        levels: { 'Nhận biết': 1, 'Thông hiểu': 2, 'Vận dụng': 2, 'Vận dụng cao': 1 },
      },
    },
    isActive: true,
    createdBy: 'system',
  },
  {
    title: 'Đề 8+ Vật lý 12 - Ma trận 2025',
    description: 'Phù hợp học sinh mục tiêu 8 điểm, ưu tiên Vận dụng + Vận dụng cao',
    targetGrade: 12,
    targetCompetency: '8+',
    structure2025: {
      part1: {
        totalCount: 18,
        levels: { 'Nhận biết': 5, 'Thông hiểu': 6, 'Vận dụng': 5, 'Vận dụng cao': 2 },
      },
      part2: {
        totalCount: 4,
        levels: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 2, 'Vận dụng cao': 1 },
      },
      part3: {
        totalCount: 6,
        levels: { 'Nhận biết': 0, 'Thông hiểu': 2, 'Vận dụng': 2, 'Vận dụng cao': 2 },
      },
    },
    isActive: true,
    createdBy: 'system',
  },
  {
    title: 'Đề 9+ Vật lý 12 - Ma trận 2025',
    description: 'Đề nâng cao dành cho học sinh elite, ưu tiên VDC để phân loại',
    targetGrade: 12,
    targetCompetency: '9+',
    structure2025: {
      part1: {
        totalCount: 18,
        levels: { 'Nhận biết': 3, 'Thông hiểu': 5, 'Vận dụng': 5, 'Vận dụng cao': 5 },
      },
      part2: {
        totalCount: 4,
        levels: { 'Nhận biết': 0, 'Thông hiểu': 0, 'Vận dụng': 2, 'Vận dụng cao': 2 },
      },
      part3: {
        totalCount: 6,
        levels: { 'Nhận biết': 0, 'Thông hiểu': 1, 'Vận dụng': 2, 'Vận dụng cao': 3 },
      },
    },
    isActive: true,
    createdBy: 'system',
  },
];
