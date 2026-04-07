/**
 * ═══════════════════════════════════════════════════════════════
 *  SkeletonLoader — Hiệu ứng Skeleton Loading nhấp nháy
 *  Dùng khi dữ liệu đang được fetch từ Firestore
 * ═══════════════════════════════════════════════════════════════
 */

import React from 'react';

/** Skeleton thanh text — dùng thay cho label text */
export const SkeletonText = ({ width = '60%', height = '12px' }: { width?: string; height?: string }) => (
  <div
    className="skeleton-shimmer rounded"
    style={{ width, height, minHeight: height }}
  />
);

/** Skeleton số lớn — dùng thay cho stat numbers */
export const SkeletonNumber = ({ width = '80px', height = '28px' }: { width?: string; height?: string }) => (
  <div
    className="skeleton-shimmer rounded-lg"
    style={{ width, height, minHeight: height }}
  />
);

/** Skeleton card — dùng thay cho card container */
export const SkeletonCard = ({ className = '' }: { className?: string }) => (
  <div className={`bg-slate-900/50 border border-slate-700/50 p-4 rounded-2xl flex items-center gap-4 ${className}`}>
    <div className="skeleton-shimmer w-9 h-9 rounded-xl flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <SkeletonText width="50%" height="10px" />
      <SkeletonNumber width="70px" height="22px" />
    </div>
  </div>
);

/** Skeleton cho stat value inline — render trong card admin */
export const SkeletonStatValue = () => (
  <div className="skeleton-shimmer rounded-lg" style={{ width: '60px', height: '22px' }} />
);

export default { SkeletonText, SkeletonNumber, SkeletonCard, SkeletonStatValue };
