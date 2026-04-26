/**
 * ═══════════════════════════════════════════════════════════════════
 *  ScoreRecalibrationTool.tsx — Công cụ Hiệu chỉnh Điểm
 *
 *  Chạy một lần để cập nhật lại tất cả attempts bị tính sai điểm
 *  do thuật toán cũ (tỷ lệ tuyến tính) khác quy định THPTQG 2025.
 *
 *  Thang điểm CHÍNH XÁC (được dùng làm "New" trong tool này):
 *    Phần 2 (Đ/S): 4/4=1.0đ | 3/4=0.5đ | 2/4=0.25đ | 1/4=0.1đ | 0/4=0đ
 *    Phần 3: Lớp 12=0.25đ/câu | Lớp 10-11=0.5đ/câu
 *
 *  Thuật toán:
 *    1. Quét toàn bộ 'attempts' collection
 *    2. Với mỗi attempt có examId → lấy exam → lấy questions
 *    3. Lấy thông tin khối lớp học sinh (để tính Part 3)
 *    4. Chấm lại theo thang đúng
 *    5. Nếu score thay đổi → updateDoc attempt
 *    6. Báo cáo số bài được cập nhật
 *
 *  ⚠️ CHỈ ADMIN mới thấy component này.
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback } from 'react';
import {
  collection, getDocs, doc, getDoc, updateDoc, query, where, Firestore
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Hàm chấm lại theo thang CHÍNH XÁC (THPTQG 2025) ────────────────

function recalcScore(
  questions: any[],
  answers: Record<string, any>,
  gradeNumber: number,
): { oldScore: number; newScore: number; delta: number } {
  let oldScore = 0;
  let newScore = 0;

  // Thang điểm Part 3 theo khối lớp
  const part3Score = gradeNumber <= 11 ? 0.5 : 0.25;

  for (const q of questions) {
    const studentAns = answers[q.id];
    if (!studentAns) continue;

    if (q.part === 1) {
      // Phần 1: không thay đổi — 0.25đ/câu
      const pts = studentAns === q.correctAnswer ? 0.25 : 0;
      oldScore += pts;
      newScore += pts;
    } else if (q.part === 2) {
      const totalSub = Array.isArray(q.correctAnswer) ? q.correctAnswer.length : 4;
      let correctSub = 0;
      for (let i = 0; i < totalSub; i++) {
        if (Array.isArray(studentAns) && studentAns[i] !== undefined &&
            studentAns[i] === q.correctAnswer[i]) {
          correctSub++;
        }
      }

      // Thang cũ (sai — tỷ lệ tuyến tính):
      oldScore += parseFloat(((correctSub / totalSub) * 1.0).toFixed(4));

      // Thang mới CHÍNH XÁC (THPTQG 2025):
      if (correctSub === totalSub)          newScore += 1.0;
      else if (correctSub === totalSub - 1) newScore += 0.5;
      else if (correctSub === totalSub - 2) newScore += 0.25;
      else if (correctSub === 1)            newScore += 0.1;
      // 0 ý đúng = 0đ
    } else if (q.part === 3) {
      const parseNum = (v: any) => parseFloat(String(v ?? '0').replace(',', '.'));
      const correct = Math.abs(parseNum(studentAns) - parseNum(q.correctAnswer)) < 0.01;
      // Giả định cũ luôn là 0.25 (để an toàn khi rollback)
      oldScore += correct ? 0.25 : 0;
      newScore += correct ? part3Score : 0;
    }
  }

  return {
    oldScore: parseFloat(oldScore.toFixed(2)),
    newScore: parseFloat(newScore.toFixed(2)),
    delta: parseFloat((newScore - oldScore).toFixed(2)),
  };
}

// ─── UI Component ─────────────────────────────────────────────────

interface RecalibLog {
  attemptId: string;
  userId: string;
  testId: string;
  oldScore: number;
  newScore: number;
  delta: number;
  status: 'updated' | 'skipped' | 'error' | 'no_questions';
  error?: string;
}

const ScoreRecalibrationTool: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<RecalibLog[]>([]);
  const [summary, setSummary] = useState<{
    total: number; updated: number; skipped: number;
    errors: number; totalDelta: number;
  } | null>(null);

  const run = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs([]);
    setSummary(null);

    const newLogs: RecalibLog[] = [];
    let updated = 0, skipped = 0, errors = 0, totalDelta = 0;

    try {
      // 1. Lấy toàn bộ attempts
      const attemptsSnap = await getDocs(collection(db as Firestore, 'attempts'));
      const allAttempts = attemptsSnap.docs;
      setProgress({ current: 0, total: allAttempts.length });

      // Cache exam questions để tránh fetch trùng
      const examCache: Record<string, any[]> = {};
      // Cache user grade để tránh fetch trùng
      const gradeCache: Record<string, number> = {};

      for (let i = 0; i < allAttempts.length; i++) {
        const attemptDoc = allAttempts[i];
        const attempt = attemptDoc.data();
        const attemptId = attemptDoc.id;
        setProgress({ current: i + 1, total: allAttempts.length });

        try {
          // 2. Tìm questions: ưu tiên examId, fallback testId
          let questions: any[] = [];
          const cacheKey = attempt.examId || attempt.testId;

          if (cacheKey && examCache[cacheKey]) {
            questions = examCache[cacheKey];
          } else if (attempt.examId) {
            const examSnap = await getDoc(doc(db as Firestore, 'exams', attempt.examId));
            if (examSnap.exists()) {
              questions = examSnap.data()?.questions ?? [];
              examCache[attempt.examId] = questions;
            }
          } else if (attempt.testId) {
            // Fallback: tìm exam theo title/testId nếu không có examId
            const examQ = query(
              collection(db as Firestore, 'exams'),
              where('title', '==', attempt.testId)
            );
            const examSnap = await getDocs(examQ);
            if (!examSnap.empty) {
              questions = examSnap.docs[0].data()?.questions ?? [];
              examCache[attempt.testId] = questions;
            }
          }

          // 3. Không có questions → bỏ qua
          if (questions.length === 0) {
            newLogs.push({
              attemptId, userId: attempt.userId, testId: attempt.testId,
              oldScore: attempt.score, newScore: attempt.score, delta: 0,
              status: 'no_questions'
            });
            skipped++;
            continue;
          }

          // 4. Xác định khối lớp học sinh để tính Part 3
          let gradeNumber = 12;
          if (attempt.userId) {
            if (gradeCache[attempt.userId] !== undefined) {
              gradeNumber = gradeCache[attempt.userId];
            } else {
              try {
                const userSnap = await getDoc(doc(db as Firestore, 'users', attempt.userId));
                if (userSnap.exists()) {
                  const className: string = userSnap.data()?.className || '12';
                  gradeNumber = parseInt(className.replace(/\D/g, '') || '12');
                  gradeCache[attempt.userId] = gradeNumber;
                }
              } catch { /* giữ mặc định 12 */ }
            }
          }

          // 5. Chấm lại
          const { oldScore, newScore, delta } = recalcScore(questions, attempt.answers || {}, gradeNumber);

          // 6. Nếu điểm không thay đổi → bỏ qua
          if (Math.abs(delta) < 0.001) {
            newLogs.push({
              attemptId, userId: attempt.userId, testId: attempt.testId,
              oldScore, newScore, delta: 0, status: 'skipped'
            });
            skipped++;
            continue;
          }

          // 7. Cập nhật attempt trên Firestore
          await updateDoc(doc(db as Firestore, 'attempts', attemptId), {
            score: newScore,
            score_recalibrated: true,
            score_old: oldScore,
            score_recalibrated_at: new Date().toISOString(),
          });

          newLogs.push({
            attemptId, userId: attempt.userId, testId: attempt.testId,
            oldScore, newScore, delta, status: 'updated'
          });
          updated++;
          totalDelta += delta;

        } catch (err: any) {
          newLogs.push({
            attemptId, userId: attempt.userId ?? '?', testId: attempt.testId ?? '?',
            oldScore: attempt.score, newScore: attempt.score, delta: 0,
            status: 'error', error: err?.message ?? String(err)
          });
          errors++;
        }

        // Cập nhật logs real-time theo batch 20
        if (i % 20 === 0 || i === allAttempts.length - 1) {
          setLogs([...newLogs]);
        }
      }

      setSummary({
        total: allAttempts.length,
        updated, skipped, errors,
        totalDelta: parseFloat(totalDelta.toFixed(2)),
      });
      setLogs([...newLogs]);

    } catch (err) {
      console.error('[ScoreRecalibration]', err);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning]);

  const statusColor = (s: RecalibLog['status']) => {
    if (s === 'updated')     return 'text-green-400';
    if (s === 'skipped')     return 'text-slate-500';
    if (s === 'no_questions') return 'text-amber-500';
    return 'text-red-400';
  };

  const pct = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="p-6 bg-slate-900 border border-slate-700 rounded-3xl space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight">
            🔧 Hiệu Chỉnh Điểm (THPTQG 2025)
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Cập nhật lại điểm cho tất cả bài thi bị tính sai theo thang tuyến tính cũ → thang THPTQG đúng
            (P2: 1.0/0.5/0.25/0.1đ | P3: Lớp 12=0.25đ, Lớp 10-11=0.5đ)
          </p>
        </div>
        <button
          onClick={run}
          disabled={isRunning}
          className="px-6 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg"
        >
          {isRunning ? '⏳ Đang chạy...' : '🚀 Chạy Migration'}
        </button>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold text-slate-400">
            <span>Đang xử lý bài {progress.current}/{progress.total}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Tổng bài', value: summary.total, color: 'text-white' },
            { label: '✅ Đã cập nhật', value: summary.updated, color: 'text-green-400' },
            { label: '⏭ Bỏ qua', value: summary.skipped, color: 'text-slate-400' },
            { label: '❌ Lỗi', value: summary.errors, color: 'text-red-400' },
            { label: '📈 Tổng +điểm', value: `+${summary.totalDelta}đ`, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-800 rounded-2xl p-4 text-center">
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Log table */}
      {logs.length > 0 && (
        <div className="max-h-80 overflow-y-auto custom-scrollbar rounded-2xl border border-slate-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-800">
              <tr>
                {['ID Bài', 'Chủ đề', 'Điểm cũ', 'Điểm mới', 'Chênh', 'Trạng thái'].map(h => (
                  <th key={h} className="px-3 py-2 text-slate-400 font-black uppercase text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.filter(l => l.status === 'updated').map(log => (
                <tr key={log.attemptId} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-3 py-2 text-slate-500 font-mono">{log.attemptId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-slate-300 truncate max-w-[120px]">{log.testId}</td>
                  <td className="px-3 py-2 text-red-400 font-bold">{log.oldScore}</td>
                  <td className="px-3 py-2 text-green-400 font-bold">{log.newScore}</td>
                  <td className="px-3 py-2 text-amber-400 font-black">+{log.delta}</td>
                  <td className={`px-3 py-2 font-bold ${statusColor(log.status)}`}>
                    {log.status === 'updated' ? '✅ Cập nhật' :
                     log.status === 'skipped' ? '⏭ Bỏ qua' :
                     log.status === 'no_questions' ? '⚠️ Thiếu đề' : '❌ Lỗi'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && summary.updated === 0 && (
        <p className="text-center text-slate-500 text-sm py-4">
          Không có bài nào cần cập nhật — tất cả đã đúng hoặc không tìm được câu hỏi gốc.
        </p>
      )}
    </div>
  );
};

export default ScoreRecalibrationTool;
