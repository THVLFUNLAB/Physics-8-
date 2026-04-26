/**
 * ═══════════════════════════════════════════════════════════════════
 *  clusterIntegrity.ts — Cluster Integrity Guard
 *
 *  Đảm bảo câu chùm (cluster questions) luôn xuất hiện đầy đủ
 *  trong bất kỳ đề nào: REMEDIAL, GAP VAULT, hay đề thông thường.
 *
 *  Vấn đề cần giải quyết:
 *    Khi bốc câu từ failedQuestionIds / knowledgeGapVault, hệ thống
 *    chỉ lấy đúng câu bị sai. Nếu câu đó thuộc 1 chùm (clusterId),
 *    các câu anh em + dữ kiện chung sẽ bị thiếu → HS không đủ thông
 *    tin để giải.
 *
 *  Giải pháp:
 *    ensureClusterIntegrity() nhận vào mảng câu hỏi đã bốc, phát
 *    hiện clusterId, kéo thêm anh em từ Firestore, gắn sharedContext
 *    vào câu đầu tiên, deduplicate và sort đúng thứ tự.
 *
 *  Thiết kế: Pure async function — không side-effect ngoài Firestore reads.
 * ═══════════════════════════════════════════════════════════════════
 */

import { collection, getDocs, getDoc, doc, query, where, Firestore } from 'firebase/firestore';
import { Question } from '../types';

/**
 * Đảm bảo tính toàn vẹn của câu chùm trong đề thi.
 *
 * @param questions  - Mảng câu hỏi đã bốc (có thể thiếu anh em chùm)
 * @param db         - Firestore instance
 * @returns          - Mảng câu hỏi đầy đủ: anh em chùm được kéo thêm,
 *                     dữ kiện chung được gắn vào câu đầu mỗi chùm,
 *                     sorted theo part → clusterOrder
 */
export async function ensureClusterIntegrity(
  questions: Question[],
  db: Firestore,
): Promise<Question[]> {
  // ── Bước 1: Phát hiện tất cả clusterId trong danh sách câu hiện tại ──
  const clusterIds = new Set<string>();
  for (const q of questions) {
    if (q.clusterId) clusterIds.add(q.clusterId);
  }

  // Không có câu chùm nào → trả về nguyên mảng
  if (clusterIds.size === 0) return questions;

  // ── Bước 2: Kéo thêm câu anh em còn thiếu từ Firestore ──
  const existingIds = new Set(questions.map(q => q.id).filter(Boolean));
  const siblingsToAdd: Question[] = [];

  for (const cid of clusterIds) {
    try {
      // Query tất cả câu cùng clusterId
      const sibSnap = await getDocs(
        query(collection(db, 'questions'), where('clusterId', '==', cid)),
      );

      sibSnap.forEach(d => {
        if (!existingIds.has(d.id)) {
          // Câu anh em chưa có trong danh sách → thêm vào
          siblingsToAdd.push({ ...d.data(), id: d.id } as Question);
          existingIds.add(d.id); // Tránh duplicate nếu cùng clusterId nhiều lần
        }
      });
    } catch (err) {
      // Graceful — không crash đề nếu Firestore lỗi 1 cluster
      console.warn(`[ClusterIntegrity] Không lấy được siblings của cluster ${cid}:`, err);
    }
  }

  // Gộp câu gốc + anh em mới kéo về
  const merged = [...questions, ...siblingsToAdd];

  // ── Bước 3: Gắn dữ kiện chung (sharedContext) vào câu đầu tiên mỗi chùm ──
  for (const cid of clusterIds) {
    try {
      const clusterDoc = await getDoc(doc(db, 'clusters', cid));
      if (!clusterDoc.exists()) continue;

      const { sharedContext } = clusterDoc.data() as { sharedContext?: string };
      if (!sharedContext) continue;

      // Tìm câu đầu tiên (clusterOrder = 0) của chùm này
      const firstQ = merged.find(
        q => q.clusterId === cid && (q.clusterOrder ?? 0) === 0,
      );
      if (!firstQ) continue;

      // Chỉ gắn nếu chưa có tag (idempotent — tránh gắn 2 lần)
      const TAG_PREFIX = '__cluster_context:';
      const alreadyTagged = firstQ.tags?.some((t: string) => t.startsWith(TAG_PREFIX));
      if (!alreadyTagged) {
        firstQ.tags = [...(firstQ.tags ?? []), `${TAG_PREFIX}${sharedContext}`];
      }
    } catch (err) {
      console.warn(`[ClusterIntegrity] Không lấy được sharedContext của cluster ${cid}:`, err);
    }
  }

  // ── Bước 4: Deduplicate + Sort theo part → clusterOrder ──
  // Deduplicate bằng Map (giữ instance đã được mutate gắn tag)
  const deduped = Array.from(
    new Map(merged.map(q => [q.id, q])).values(),
  );

  deduped.sort((a, b) => {
    // Ưu tiên sort theo part (1 → 2 → 3) trước
    if (a.part !== b.part) return (a.part ?? 0) - (b.part ?? 0);
    // Cùng part: câu chùm sort theo clusterOrder
    if (a.clusterId && b.clusterId && a.clusterId === b.clusterId) {
      return (a.clusterOrder ?? 0) - (b.clusterOrder ?? 0);
    }
    return 0;
  });

  return deduped;
}
