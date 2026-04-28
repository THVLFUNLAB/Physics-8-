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
 *  Fix v2:
 *    - Offline-first: đọc tag __cluster_context: trong memory trước
 *    - Skip Firestore query cho __temp_cluster_ IDs (câu từ AI/AzotaParser)
 *    - Dùng getClusterOrder() từ clusterUtils (0-indexed chuẩn)
 *
 *  Thiết kế: Pure async function — không side-effect ngoài Firestore reads.
 * ═══════════════════════════════════════════════════════════════════
 */

import { collection, getDocs, getDoc, doc, query, where, Firestore } from 'firebase/firestore';
import { Question } from '../types';
import { getClusterOrder, isTempClusterId, CLUSTER_CONTEXT_TAG_PREFIX } from './clusterUtils';

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
  // (Chỉ cho câu chùm có clusterId thật, không phải __temp_cluster_)
  const existingIds = new Set(questions.map(q => q.id).filter(Boolean));
  const siblingsToAdd: Question[] = [];

  for (const cid of clusterIds) {
    // Câu tạm (từ AI/AzotaParser) — không có doc Firestore, bỏ qua bước này
    if (isTempClusterId(cid)) continue;

    try {
      const sibSnap = await getDocs(
        query(collection(db, 'questions'), where('clusterId', '==', cid)),
      );

      sibSnap.forEach(d => {
        if (!existingIds.has(d.id)) {
          siblingsToAdd.push({ ...d.data(), id: d.id } as Question);
          existingIds.add(d.id);
        }
      });
    } catch (err) {
      console.warn(`[ClusterIntegrity] Không lấy được siblings của cluster ${cid}:`, err);
    }
  }

  const merged = [...questions, ...siblingsToAdd];

  // ── Bước 3: Gắn dữ kiện chung (sharedContext) vào câu đầu tiên mỗi chùm ──
  //
  // Thứ tự ưu tiên (offline-first):
  //   A) Câu đầu chùm đã có tag __cluster_context: → skip (idempotent)
  //   B) __temp_cluster_ ID → tìm tag trên bất kỳ câu nào trong cluster
  //   C) Câu chùm thật → query clusters/{cid} để lấy sharedContext
  //
  for (const cid of clusterIds) {
    const firstQ = merged.find(
      q => q.clusterId === cid && getClusterOrder(q) === 0,
    );
    if (!firstQ) {
      console.warn(`[ClusterIntegrity] Không tìm được câu đầu (clusterOrder=0) cho cluster ${cid}`);
      continue;
    }

    // A) Đã có tag → skip
    const alreadyTagged = firstQ.tags?.some((t: string) => t.startsWith(CLUSTER_CONTEXT_TAG_PREFIX));
    if (alreadyTagged) continue;

    // B) Temp cluster → tìm tag trong tất cả câu cùng chùm
    if (isTempClusterId(cid)) {
      const anyTaggedQ = merged.find(
        q => q.clusterId === cid &&
          q.tags?.some((t: string) => t.startsWith(CLUSTER_CONTEXT_TAG_PREFIX)),
      );
      if (anyTaggedQ) {
        const tag = anyTaggedQ.tags!.find((t: string) => t.startsWith(CLUSTER_CONTEXT_TAG_PREFIX))!;
        firstQ.tags = [...(firstQ.tags ?? []), tag];
      }
      continue;
    }

    // C) Query Firestore clusters collection
    try {
      const clusterDoc = await getDoc(doc(db, 'clusters', cid));
      if (!clusterDoc.exists()) continue;

      const { sharedContext } = clusterDoc.data() as { sharedContext?: string };
      if (!sharedContext) continue;

      firstQ.tags = [...(firstQ.tags ?? []), `${CLUSTER_CONTEXT_TAG_PREFIX}${sharedContext}`];
    } catch (err) {
      console.warn(`[ClusterIntegrity] Không lấy được sharedContext của cluster ${cid}:`, err);
    }
  }

  // ── Bước 4: Deduplicate + Sort theo part → clusterOrder ──
  const deduped = Array.from(
    new Map(merged.map(q => [q.id, q])).values(),
  );

  deduped.sort((a, b) => {
    if (a.part !== b.part) return (a.part ?? 0) - (b.part ?? 0);
    if (a.clusterId || b.clusterId) {
      if (a.clusterId === b.clusterId) {
        return getClusterOrder(a) - getClusterOrder(b);
      }
      const idA = a.clusterId || '';
      const idB = b.clusterId || '';
      return idA.localeCompare(idB);
    }
    return 0;
  });

  return deduped;
}
