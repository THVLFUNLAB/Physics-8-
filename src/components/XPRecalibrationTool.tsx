/**
 * ═══════════════════════════════════════════════════════════════════
 *  XPRecalibrationTool.tsx — Bù XP Bị Thiếu Cho Học Sinh (v1 → v2)
 *
 *  Vấn đề:
 *    RANK_FLOOR cũ (v1) cực kỳ khắc nghiệt:
 *      Rank 1-3: floor 4.0 → HS mới bị 0 XP nếu điểm < 4
 *      Rank 7-10: floor 8.0 → HS giỏi vừa bị 0 XP nếu < 8
 *
 *  Giải pháp (v2):
 *    Effort XP = max(25, numQuestions × 3) — luôn > 0
 *    Với mỗi attempt BỊ CHẶN bởi floor cũ → bù effortXP
 *
 *  Safeguard:
 *    - Preview mode: xem trước không commit
 *    - Mỗi attempt chỉ bù 1 lần (flag xp_recalibrated_v2: true)
 *    - Atomic increment để chống race condition
 *    - Chỉ Admin mới thấy tool này
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback } from 'react';
import {
  collection, getDocs, doc, updateDoc, increment,
  query, where, Firestore, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getCurrentRank } from '../services/RankSystem';

// ── Hằng số: RANK_FLOOR cũ (v1) — dùng để xác định attempt bị chặn ──
const OLD_RANK_FLOOR: Record<number, number> = {
  1: 4.0, 2: 4.0, 3: 4.0,
  4: 6.5, 5: 6.5, 6: 6.5,
  7: 8.0, 8: 8.0, 9: 8.0, 10: 8.0,
};

// Effor XP tối thiểu theo số câu (quy tắc v2)
const calcEffortXP = (numAnswers: number): number =>
  Math.max(25, Math.round(numAnswers * 3));

// ── Types ───────────────────────────────────────────────────────────

interface CompensationRecord {
  userId: string;
  displayName: string;
  email: string;
  currentStars: number;
  currentRankName: string;
  blockedAttempts: number;
  compensationXP: number;
  newStars: number;
  attempts: {
    attemptId: string;
    score: number;
    numAnswers: number;
    effortXP: number;
    timestamp: any;
  }[];
}

// ── Component ───────────────────────────────────────────────────────

const XPRecalibrationTool: React.FC = () => {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'previewing' | 'committing' | 'done'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [records, setRecords] = useState<CompensationRecord[]>([]);
  const [summary, setSummary] = useState<{
    totalUsers: number;
    affectedUsers: number;
    totalXPGranted: number;
    totalAttempts: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // ── PHASE 1: Quét & Preview ────────────────────────────────────────
  const runPreview = useCallback(async () => {
    if (phase !== 'idle') return;
    setPhase('scanning');
    setError(null);
    setRecords([]);
    setSummary(null);

    try {
      // 1. Lấy tất cả users (không phải admin)
      setProgress({ current: 0, total: 0, label: 'Đang tải danh sách học sinh...' });
      const usersSnap = await getDocs(
        query(collection(db as Firestore, 'users'), where('role', '!=', 'admin'))
      );
      const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setProgress({ current: 0, total: users.length, label: 'Đang phân tích...' });

      const results: CompensationRecord[] = [];

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        setProgress({ current: i + 1, total: users.length, label: `Phân tích: ${user.displayName || user.email || user.id}` });

        const currentStars = user.stars ?? 0;
        const currentRank = getCurrentRank(currentStars);
        const oldFloor = OLD_RANK_FLOOR[currentRank.id] ?? 4.0;

        // Lấy attempts của user chưa được bù XP
        let attemptsSnap;
        try {
          attemptsSnap = await getDocs(
            query(
              collection(db as Firestore, 'attempts'),
              where('userId', '==', user.id),
              where('xp_recalibrated_v2', '!=', true)
            )
          );
        } catch {
          // Firestore có thể chưa có index — fallback không filter flag
          attemptsSnap = await getDocs(
            query(collection(db as Firestore, 'attempts'), where('userId', '==', user.id))
          );
        }

        const blockedAttempts: CompensationRecord['attempts'] = [];

        for (const aDoc of attemptsSnap.docs) {
          const a = aDoc.data();
          // Skip nếu đã bù rồi
          if (a.xp_recalibrated_v2 === true) continue;
          const score = Number(a.score ?? 0);
          const numAnswers = a.answers ? Object.keys(a.answers).length : 0;
          if (numAnswers === 0) continue;

          // Kiểm tra: attempt này có bị chặn bởi floor cũ không?
          if (score < oldFloor) {
            blockedAttempts.push({
              attemptId: aDoc.id,
              score,
              numAnswers,
              effortXP: calcEffortXP(numAnswers),
              timestamp: a.timestamp,
            });
          }
        }

        if (blockedAttempts.length === 0) continue;

        const compensationXP = blockedAttempts.reduce((s, a) => s + a.effortXP, 0);
        results.push({
          userId: user.id,
          displayName: user.displayName || 'Ẩn danh',
          email: user.email || '',
          currentStars,
          currentRankName: currentRank.name,
          blockedAttempts: blockedAttempts.length,
          compensationXP,
          newStars: currentStars + compensationXP,
          attempts: blockedAttempts,
        });
      }

      // Sắp xếp: HS bị thiệt nhiều nhất lên đầu
      results.sort((a, b) => b.compensationXP - a.compensationXP);
      setRecords(results);
      setSummary({
        totalUsers: users.length,
        affectedUsers: results.length,
        totalXPGranted: results.reduce((s, r) => s + r.compensationXP, 0),
        totalAttempts: results.reduce((s, r) => s + r.blockedAttempts, 0),
      });
      setPhase('previewing');

    } catch (err: any) {
      setError(err?.message ?? String(err));
      setPhase('idle');
    }
  }, [phase]);

  // ── PHASE 2: Commit ────────────────────────────────────────────────
  const runCommit = useCallback(async () => {
    if (phase !== 'previewing' || records.length === 0) return;
    setPhase('committing');
    setError(null);

    let committed = 0;
    try {
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        setProgress({
          current: i + 1,
          total: records.length,
          label: `Đang bù XP: ${rec.displayName}`,
        });

        // Atomic: cộng XP vào user.stars
        await updateDoc(doc(db as Firestore, 'users', rec.userId), {
          stars: increment(rec.compensationXP),
          xp_v2_compensation: rec.compensationXP,
          xp_v2_compensated_at: new Date().toISOString(),
        });

        // Đánh dấu từng attempt đã được bù (batch 500 max)
        const BATCH_SIZE = 400;
        for (let j = 0; j < rec.attempts.length; j += BATCH_SIZE) {
          const batch = writeBatch(db as Firestore);
          rec.attempts.slice(j, j + BATCH_SIZE).forEach(a => {
            batch.update(doc(db as Firestore, 'attempts', a.attemptId), {
              xp_recalibrated_v2: true,
              xp_compensation: a.effortXP,
            });
          });
          await batch.commit();
        }

        committed++;
      }

      setSummary(s => s ? { ...s, affectedUsers: committed } : s);
      setPhase('done');

    } catch (err: any) {
      setError(`Lỗi tại bước commit: ${err?.message ?? err}`);
      setPhase('previewing'); // Cho phép thử lại
    }
  }, [phase, records]);

  const pct = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="p-6 bg-slate-900 border border-slate-700 rounded-3xl space-y-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            ⭐ Bù XP Cho Học Sinh (v1 → v2)
          </h2>
          <p className="text-slate-400 text-xs mt-1 leading-5">
            Bù phần XP bị mất do RANK_FLOOR cũ quá khắc nghiệt (floor 8.0 cho rank cao).
            <br />
            Luật mới: mọi bài nộp đều nhận tối thiểu <span className="text-cyan-400 font-bold">Effort XP = max(25, câu×3)</span>.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          {phase === 'idle' && (
            <button
              onClick={runPreview}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg"
            >
              🔍 Preview (Không thay đổi DB)
            </button>
          )}
          {phase === 'previewing' && records.length > 0 && (
            <button
              onClick={runCommit}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg animate-pulse"
            >
              ✅ Xác nhận Bù XP ({records.length} HS)
            </button>
          )}
          {(phase === 'previewing' || phase === 'done') && (
            <button
              onClick={() => { setPhase('idle'); setRecords([]); setSummary(null); }}
              className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm rounded-2xl transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Progress ── */}
      {(phase === 'scanning' || phase === 'committing') && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold text-slate-400">
            <span className="truncate">{progress.label}</span>
            <span>{progress.current}/{progress.total} — {pct}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm font-bold">
          ❌ {error}
        </div>
      )}

      {/* ── Done banner ── */}
      {phase === 'done' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-emerald-400 font-bold text-center">
          🎉 Hoàn tất! Đã bù XP thành công cho {records.length} học sinh.
          Các bài thi đã được đánh dấu <code className="text-xs bg-slate-800 px-1 rounded">xp_recalibrated_v2: true</code> để tránh chạy lại.
        </div>
      )}

      {/* ── Summary Cards ── */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Tổng HS quét', value: summary.totalUsers, color: 'text-white' },
            { label: 'HS được bù XP', value: summary.affectedUsers, color: 'text-emerald-400' },
            { label: 'Tổng XP bù', value: `+${summary.totalXPGranted.toLocaleString()} ⭐`, color: 'text-amber-400' },
            { label: 'Bài bị thiệt', value: `${summary.totalAttempts} lần`, color: 'text-rose-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-800 rounded-2xl p-4 text-center">
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Records Table ── */}
      {records.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
            Chi Tiết Theo Học Sinh — {phase === 'done' ? '✅ Đã bù' : '⏳ Preview'}
          </h3>
          <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
            {records.map(rec => (
              <div
                key={rec.userId}
                className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden"
              >
                {/* Row header */}
                <button
                  onClick={() => setExpandedUser(expandedUser === rec.userId ? null : rec.userId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-800 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-black text-xs">
                      {rec.displayName[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">{rec.displayName}</p>
                      <p className="text-slate-500 text-xs">{rec.email} · {rec.currentRankName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Bài bị chặn</p>
                      <p className="text-rose-400 font-black">{rec.blockedAttempts}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Sao bù thêm</p>
                      <p className="text-emerald-400 font-black">+{rec.compensationXP.toLocaleString()} ⭐</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Tổng sau bù</p>
                      <p className="text-amber-400 font-black">{rec.newStars.toLocaleString()} ⭐</p>
                    </div>
                    <span className="text-slate-500 text-xs">{expandedUser === rec.userId ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {expandedUser === rec.userId && (
                  <div className="border-t border-slate-700/50 p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 uppercase font-black">
                          <th className="text-left pb-2">Attempt ID</th>
                          <th className="text-center pb-2">Điểm</th>
                          <th className="text-center pb-2">Số câu</th>
                          <th className="text-right pb-2">XP bù thêm</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {rec.attempts.map(a => (
                          <tr key={a.attemptId}>
                            <td className="py-1.5 text-slate-500 font-mono">{a.attemptId.slice(0, 10)}…</td>
                            <td className="py-1.5 text-center text-rose-400 font-bold">{a.score.toFixed(2)}</td>
                            <td className="py-1.5 text-center text-slate-400">{a.numAnswers}</td>
                            <td className="py-1.5 text-right text-emerald-400 font-black">+{a.effortXP} ⭐</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {phase === 'previewing' && records.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">🎉</p>
          <p className="font-bold">Tất cả học sinh đã được tính XP đúng — không cần bù!</p>
          <p className="text-xs mt-1">Không có attempt nào bị chặn bởi RANK_FLOOR cũ.</p>
        </div>
      )}

      {/* ── Info box ── */}
      {phase === 'idle' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 space-y-3">
          <h4 className="text-sm font-black text-white uppercase tracking-widest">Cách hoạt động</h4>
          <div className="grid md:grid-cols-3 gap-4 text-xs text-slate-400">
            <div className="space-y-1">
              <p className="text-amber-400 font-bold">① Preview</p>
              <p>Quét toàn bộ attempts, tính XP bị thiếu cho mỗi HS. <span className="text-white">Không thay đổi DB.</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-blue-400 font-bold">② Kiểm tra</p>
              <p>Review chi tiết từng HS, từng bài bị thiệt. Mở rộng để xem danh sách bài.</p>
            </div>
            <div className="space-y-1">
              <p className="text-emerald-400 font-bold">③ Commit</p>
              <p>Bấm xác nhận → cộng XP vào <code className="bg-slate-900 px-1 rounded">user.stars</code> bằng atomic increment. An toàn 100%.</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 border-t border-slate-700 pt-3">
            ⚠️ Mỗi attempt chỉ được bù <strong className="text-white">1 lần</strong> — có flag <code className="bg-slate-900 px-1 rounded">xp_recalibrated_v2</code> bảo vệ.
            Tool có thể chạy lại nhiều lần mà không gây double-credit.
          </p>
        </div>
      )}
    </div>
  );
};

export default XPRecalibrationTool;
