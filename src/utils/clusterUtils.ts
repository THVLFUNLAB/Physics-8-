/**
 * ═══════════════════════════════════════════════════════════════════
 *  clusterUtils.ts — Cluster Question Utility (Single Source of Truth)
 *
 *  Tập trung toàn bộ logic truy xuất + kiểm tra câu hỏi chùm.
 *  Được dùng bởi: ProExamExperience, ReviewExam, QuestionReviewBoard,
 *                 clusterIntegrity.
 *
 *  Quy ước:
 *    - clusterOrder LUÔN bắt đầu từ 0 (câu đầu tiên của chùm = 0)
 *    - sharedContext được lưu dưới dạng tag "__cluster_context:<nội dung>"
 *      TRÊN CÂU ĐẦU TIÊN (clusterOrder = 0) của mỗi chùm
 *    - Câu có clusterId bắt đầu bằng "__temp_cluster_" là câu từ AI/AzotaParser
 *      chưa được sync lên Firestore clusters collection
 * ═══════════════════════════════════════════════════════════════════
 */

import { Question } from '../types';

/** Prefix của tag chứa dữ kiện chung */
export const CLUSTER_CONTEXT_TAG_PREFIX = '__cluster_context:';

/**
 * Trả về clusterOrder đã chuẩn hóa (đảm bảo 0-indexed).
 * - undefined → 0
 * - Bất kỳ giá trị nào khác → giữ nguyên
 */
export function getClusterOrder(q: Question): number {
  return q.clusterOrder ?? 0;
}

/**
 * Kiểm tra câu có phải là câu ĐẦU TIÊN của chùm không (clusterOrder = 0).
 */
export function isClusterHead(q: Question): boolean {
  return Boolean(q.clusterId) && getClusterOrder(q) === 0;
}

/**
 * Lấy sharedContext (dữ kiện chung) của câu chùm theo thứ tự ưu tiên:
 *
 *  1. Tìm trong tags[] của câu đầu chùm (clusterOrder = 0) trong allQuestions
 *     — bao gồm cả chính currentQuestion nếu nó là câu đầu chùm
 *  2. Tìm trong tags[] của chính currentQuestion (fallback khi tags gắn nhầm vào tất cả)
 *  3. Không tìm được → trả về null
 *
 *  KHÔNG dùng headQuestion.content làm fallback (Bug #7).
 *
 * @param currentQuestion  - Câu hỏi đang hiển thị
 * @param allQuestions     - Toàn bộ câu hỏi trong đề
 * @returns  Chuỗi sharedContext, hoặc null nếu không có
 */
export function getClusterContext(
  currentQuestion: Question,
  allQuestions: Question[],
): string | null {
  if (!currentQuestion.clusterId) return null;

  const cid = currentQuestion.clusterId;

  // Tìm câu đầu chùm (clusterOrder = 0) trong mảng toàn đề
  const headQuestion = allQuestions.find(
    q => q.clusterId === cid && getClusterOrder(q) === 0,
  );

  // Ưu tiên 1: tag trên câu đầu chùm
  if (headQuestion) {
    const tag = headQuestion.tags?.find(t =>
      t.startsWith(CLUSTER_CONTEXT_TAG_PREFIX),
    );
    if (tag) {
      const ctx = tag.replace(CLUSTER_CONTEXT_TAG_PREFIX, '').trim();
      if (ctx) return ctx;
    }
  }

  // Ưu tiên 2: tag trên chính câu hiện tại (câu AI-generated đôi khi gắn vào tất cả)
  const selfTag = currentQuestion.tags?.find(t =>
    t.startsWith(CLUSTER_CONTEXT_TAG_PREFIX),
  );
  if (selfTag) {
    const ctx = selfTag.replace(CLUSTER_CONTEXT_TAG_PREFIX, '').trim();
    if (ctx) return ctx;
  }

  // Ưu tiên 3: scan tất cả câu cùng clusterId để tìm tag
  for (const q of allQuestions) {
    if (q.clusterId !== cid) continue;
    const tag = q.tags?.find(t => t.startsWith(CLUSTER_CONTEXT_TAG_PREFIX));
    if (tag) {
      const ctx = tag.replace(CLUSTER_CONTEXT_TAG_PREFIX, '').trim();
      if (ctx) return ctx;
    }
  }

  return null;
}

/**
 * Kiểm tra một clusterId có phải là ID tạm thời (từ AI/AzotaParser, chưa lên Firestore) không.
 * ID tạm bắt đầu bằng "__temp_cluster_".
 */
export function isTempClusterId(clusterId: string): boolean {
  return clusterId.startsWith('__temp_cluster_');
}
