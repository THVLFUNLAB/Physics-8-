/**
 * ═══════════════════════════════════════════════════════════════════
 *  CapabilityRadarChart.tsx — Biểu đồ Radar Năng Lực 4 Trục
 *
 *  Hiển thị 4 mạch nội dung cốt lõi thi THPTQG theo Thông tư 32:
 *    1. Vật lí nhiệt
 *    2. Khí lí tưởng
 *    3. Từ trường
 *    4. Hạt nhân & Phóng xạ
 *
 *  Màu sắc cảnh báo:
 *    < 40%  → Đỏ (Nguy hiểm)
 *    40–70% → Vàng (Cần cố gắng)
 *    > 70%  → Xanh (Giỏi)
 *
 *  Component ĐỘC LẬP — không import geminiService, VoiceTutorButton.
 *  Dùng Recharts đã có sẵn trong project (recharts ^3.x).
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { RADAR_TOPICS } from '../services/profileUpdater';

// ─── Kiểu Props ───────────────────────────────────────────────────────

export interface RadarAxisData {
  /** Tên mạch nội dung (một trong 4 mạch cốt lõi) */
  subject: string;
  /** Tỷ lệ đúng 0–100 (đã nhân 100 từ correctRate) */
  score: number;
  /** Luôn = 100 (Recharts yêu cầu) */
  fullMark: 100;
}

interface CapabilityRadarChartProps {
  /** Mảng 4 điểm tương ứng 4 trục — phải đúng thứ tự RADAR_TOPICS */
  data: RadarAxisData[];
  /** Màu accent theo grade ('10' → cyan, '11' → fuchsia, '12' → red) */
  accentColor?: string;
}

// ─── Helper: màu theo % ──────────────────────────────────────────────

function getZoneColor(score: number): string {
  if (score < 40) return '#ef4444';  // Đỏ — nguy hiểm
  if (score < 70) return '#f59e0b';  // Vàng — cần cố gắng
  return '#10b981';                  // Xanh — giỏi
}

// ─── Custom Label tại đầu mút trục ──────────────────────────────────

interface CustomLabelProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  /** Được bơm từ data để render % */
  scoreBySubject?: Record<string, number>;
}

const CustomAxisLabel: React.FC<CustomLabelProps> = ({
  x = 0, y = 0, payload, scoreBySubject = {},
}) => {
  // Recharts truyền x/y có thể là string — ép kiểu an toàn
  const nx = Number(x);
  const ny = Number(y);
  if (!payload?.value) return null;
  const subject = payload.value;
  const score   = scoreBySubject[subject] ?? 0;
  const color   = getZoneColor(score);

  const shortLabel: Record<string, string> = {
    'Vật lí nhiệt':     'Nhiệt',
    'Khí lí tưởng':     'Khí',
    'Từ trường':         'Từ',
    'Vật lí hạt nhân':  'Hạt nhân',
  };
  const label = shortLabel[subject] ?? subject;

  return (
    <g>
      <text
        x={nx}
        y={ny - 4}
        textAnchor="middle"
        dominantBaseline="auto"
        fill="rgba(255,255,255,0.65)"
        fontSize={10}
        fontWeight={700}
      >
        {label}
      </text>
      <text
        x={nx}
        y={ny + 12}
        textAnchor="middle"
        dominantBaseline="auto"
        fill={color}
        fontSize={12}
        fontWeight={900}
      >
        {score}%
      </text>
    </g>
  );
};

// ─── Custom Tooltip ──────────────────────────────────────────────────

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { subject, score } = payload[0].payload as RadarAxisData;
  const color = getZoneColor(score);
  const label =
    score < 40  ? '🔴 Nguy hiểm — cần khắc phục ngay' :
    score < 70  ? '🟡 Cần cố gắng thêm'               :
                  '🟢 Giỏi — tiếp tục duy trì';

  return (
    <div
      style={{
        background: 'rgba(10,15,30,0.95)',
        border: `1px solid ${color}40`,
        borderRadius: 12,
        padding: '8px 14px',
        backdropFilter: 'blur(12px)',
      }}
    >
      <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
        {subject}
      </p>
      <p style={{ color, fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
        {score}%
      </p>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 }}>{label}</p>
    </div>
  );
};

// ─── Màu fill gradient theo trạng thái tổng hợp ──────────────────────

function getOverallStrokeColor(data: RadarAxisData[], accentColor?: string): string {
  if (accentColor) return accentColor;
  const avg = data.reduce((s, d) => s + d.score, 0) / Math.max(data.length, 1);
  return getZoneColor(avg);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────

const CapabilityRadarChart: React.FC<CapabilityRadarChartProps> = ({ data, accentColor }) => {
  // Map subject → score để truyền vào CustomAxisLabel
  const scoreBySubject = React.useMemo(
    () => Object.fromEntries(data.map(d => [d.subject, d.score])),
    [data],
  );

  const strokeColor = getOverallStrokeColor(data, accentColor);

  return (
    <div className="relative h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
          <defs>
            <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={strokeColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.05} />
            </radialGradient>
          </defs>

          {/* Lưới nhện */}
          <PolarGrid
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="4 4"
          />

          {/* Trục góc — custom label có % */}
          <PolarAngleAxis
            dataKey="subject"
            tick={(props) => (
              <CustomAxisLabel {...props} scoreBySubject={scoreBySubject} />
            )}
          />

          {/* Vùng radar */}
          <Radar
            name="Năng lực"
            dataKey="score"
            stroke={strokeColor}
            strokeWidth={2.5}
            fill="url(#radarFill)"
            fillOpacity={1}
          />

          {/* Tooltip khi hover */}
          <RechartsTooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend màu sắc — góc dưới */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-4 pb-1">
        {[
          { color: '#ef4444', label: '< 40%' },
          { color: '#f59e0b', label: '40–70%' },
          { color: '#10b981', label: '> 70%' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[9px] font-bold" style={{ color }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CapabilityRadarChart;

// ─── Helper: Tạo RadarAxisData từ topicProgress của UserProfile ──────

/**
 * Tính 4 điểm radar từ `topicProgress` được lưu trong Firestore.
 *
 * Công thức correctRate mới: correctCount / totalQuestions
 * Fallback: (bestScore + lastScore) / 20 nếu thiếu correctCount
 * (Backward compatible với data cũ trước khi triển khai refreshTopicProgress)
 */
export function buildRadarData(
  topicProgress: Record<string, {
    bestScore: number;
    lastScore: number;
    totalAttempts: number;
    correctCount?: number;
    totalQuestions?: number;
  }> | undefined,
): RadarAxisData[] {
  return RADAR_TOPICS.map((topic) => {
    const prog = topicProgress?.[topic];
    let score = 0;

    if (prog) {
      if (
        typeof prog.correctCount  === 'number' &&
        typeof prog.totalQuestions === 'number' &&
        prog.totalQuestions > 0
      ) {
        // ── Công thức MỚI (chính xác) ──
        score = Math.round((prog.correctCount / prog.totalQuestions) * 100);
      } else if (prog.totalAttempts > 0) {
        // ── Fallback backward-compat ──
        score = Math.round(((prog.bestScore + prog.lastScore) / 20) * 100);
      }
    }

    return {
      subject:  topic,
      score:    Math.min(100, Math.max(0, score)),
      fullMark: 100,
    };
  });
}
