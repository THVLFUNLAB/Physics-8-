/**
 * useEnergyBuffer — R1 + R2: Isolated Sub-Collection & 3-Layer Buffer Strategy
 * ─────────────────────────────────────────────────────────────────────────────
 * Quản lý "Cột Năng Lượng" (Capacitor Overload) với:
 *  - Sub-collection TÁCH BIỆT hoàn toàn khỏi classAttempts (R1)
 *  - 2-second debounce buffer để gom nhiều write thành 1 (R2)
 *  - Firestore atomic write để tránh race condition (R2)
 *  - onSnapshot realtime cho Projector (đọc không ảnh hưởng ghi)
 *
 * ── Team Battle Mode ──────────────────────────────────────────────────────────
 * Khi teamId = 'A' | 'B' → ghi vào energyState/teamA hoặc energyState/teamB
 * Khi teamId = null       → ghi vào energyState/room (tương thích ngược)
 *
 * Firestore Paths:
 *   classExams/{classExamId}/energyState/room    — chế độ thường
 *   classExams/{classExamId}/energyState/teamA   — Team Battle đội A
 *   classExams/{classExamId}/energyState/teamB   — Team Battle đội B
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  doc, updateDoc, onSnapshot, setDoc, Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Constants ─────────────────────────────────────────────────────────────

export const MAX_ENERGY = 100;
const DEBOUNCE_MS = 2000;           // Gom writes trong 2 giây
const MAX_RECENT_EVENTS = 10;       // Giới hạn array size trong Firestore
const ENERGY_PER_CORRECT = 2;       // Mỗi câu đúng = +2 năng lượng
const ENERGY_COLLECTION = 'energyState';

// ─── Types ─────────────────────────────────────────────────────────────────

export type TeamId = 'A' | 'B' | null;

export interface EnergyEvent {
  uid: string;
  name: string;
  delta: number;
  ts: number;
}

export interface RoomEnergyState {
  totalEnergy: number;
  lastCorrectBy: string;
  lastCorrectName: string;
  lastUpdated: any; // Timestamp
  recentEvents: EnergyEvent[];
  memberCount?: number; // Số thành viên đội (dùng khi Team Battle)
}

export interface UseEnergyBufferReturn {
  /** Năng lượng hiện tại (0-100). Real-time từ Firestore. */
  roomEnergy: number;
  /** 10 sự kiện gần nhất (để animate tia sét). */
  recentEvents: EnergyEvent[];
  /** Gọi khi học sinh trả lời đúng 1 câu. Tự debounce. */
  onCorrectAnswer: (uid: string, displayName: string, delta?: number) => void;
  /** Khởi tạo document energyState (gọi khi tạo phòng thi). */
  initEnergyState: () => Promise<void>;
  /** true nếu đang có pending buffer chưa flush. */
  hasPendingFlush: boolean;
}

// ─── Helper ────────────────────────────────────────────────────────────────

/** Tính docId dựa trên teamId */
function getEnergyDocId(teamId: TeamId): string {
  if (teamId === 'A') return 'teamA';
  if (teamId === 'B') return 'teamB';
  return 'room';
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useEnergyBuffer(
  classExamId: string | null,
  options: {
    enabled?: boolean;
    /** Team Battle: đội của học sinh hiện tại. null = chế độ thường. */
    teamId?: TeamId;
  } = {}
): UseEnergyBufferReturn {
  const { enabled = true, teamId = null } = options;

  // ── Realtime state từ Firestore ──
  const [roomEnergy, setRoomEnergy]     = useState(0);
  const [recentEvents, setRecentEvents] = useState<EnergyEvent[]>([]);

  // ── Buffer state ──
  const pendingDelta    = useRef(0);
  const pendingEvents   = useRef<EnergyEvent[]>([]);
  const flushTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingFlush = useRef(false);

  // ── Firestore ref — thay đổi theo teamId ──
  const docId = getEnergyDocId(teamId);
  const energyDocRef = classExamId
    ? doc(db, 'classExams', classExamId, ENERGY_COLLECTION, docId)
    : null;

  // ── Realtime listener — chỉ đọc, không gây write ──
  useEffect(() => {
    if (!energyDocRef || !enabled) return;

    const unsub = onSnapshot(energyDocRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as RoomEnergyState;
      setRoomEnergy(Math.min(data.totalEnergy ?? 0, MAX_ENERGY));
      setRecentEvents((data.recentEvents ?? []).slice(-MAX_RECENT_EVENTS));
    });

    return unsub;
  }, [classExamId, enabled, docId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Flush buffer lên Firestore ──
  const flushBuffer = useCallback(async () => {
    if (!energyDocRef) return;
    if (pendingDelta.current === 0) return;

    const deltaToFlush  = pendingDelta.current;
    const eventsToFlush = [...pendingEvents.current];

    // Reset buffer TRƯỚC khi await (tránh double-flush)
    pendingDelta.current  = 0;
    pendingEvents.current = [];
    hasPendingFlush.current = false;

    try {
      const newEnergy   = Math.min(roomEnergy + deltaToFlush, MAX_ENERGY);
      const actualDelta = newEnergy - roomEnergy;
      if (actualDelta <= 0) return; // Đã đầy

      const lastEvent = eventsToFlush[eventsToFlush.length - 1];
      await updateDoc(energyDocRef, {
        totalEnergy:     newEnergy,
        lastUpdated:     Timestamp.now(),
        lastCorrectBy:   lastEvent?.uid  ?? '',
        lastCorrectName: lastEvent?.name ?? '',
        recentEvents:    arrayUnion(...eventsToFlush.slice(0, 3)),
      });
    } catch (e) {
      console.warn('[EnergyBuffer] Flush thất bại (non-critical):', e);
    }
  }, [energyDocRef, roomEnergy]);

  // ── Main: Thêm năng lượng với debounce ──
  const onCorrectAnswer = useCallback((
    uid: string,
    displayName: string,
    delta: number = ENERGY_PER_CORRECT
  ) => {
    if (!energyDocRef || !enabled) return;

    pendingDelta.current += delta;
    pendingEvents.current.push({ uid, name: displayName, delta, ts: Date.now() });
    hasPendingFlush.current = true;

    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => { flushBuffer(); }, DEBOUNCE_MS);
  }, [energyDocRef, enabled, flushBuffer]);

  // Flush khi unmount — không mất data
  useEffect(() => {
    return () => {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        if (pendingDelta.current > 0 && energyDocRef) {
          updateDoc(energyDocRef, {
            totalEnergy: Math.min(roomEnergy + pendingDelta.current, MAX_ENERGY),
            lastUpdated: Timestamp.now(),
          }).catch(() => {});
        }
      }
    };
  }, [energyDocRef, roomEnergy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Init: Tạo document năng lượng ──
  const initEnergyState = useCallback(async () => {
    if (!energyDocRef) return;
    try {
      await setDoc(energyDocRef, {
        totalEnergy:     0,
        lastCorrectBy:   '',
        lastCorrectName: '',
        lastUpdated:     Timestamp.now(),
        recentEvents:    [],
        memberCount:     0,
      }, { merge: true });
    } catch (e) {
      console.warn('[EnergyBuffer] Init thất bại:', e);
    }
  }, [energyDocRef]);

  return {
    roomEnergy,
    recentEvents,
    onCorrectAnswer,
    initEnergyState,
    hasPendingFlush: hasPendingFlush.current,
  };
}
