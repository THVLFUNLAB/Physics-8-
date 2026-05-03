/**
 * ActivityChart.tsx
 * Biểu đồ hoạt động 7 ngày — dùng Recharts (đã có sẵn trong dự án)
 */
import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DayActivity } from './adminStatsService';

interface ActivityChartProps {
  data: DayActivity[];
}

// Custom tooltip bám đúng style slate của hệ thống
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 shadow-2xl">
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm font-bold">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-300">{entry.name}:</span>
          <span className="text-white">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export const ActivityChart: React.FC<ActivityChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
        Chưa có dữ liệu hoạt động
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradAttempts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="gradSims" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="#475569"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#64748b', fontWeight: 700 }}
        />
        <YAxis
          stroke="#475569"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tick={{ fill: '#64748b', fontWeight: 700 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', paddingTop: '8px' }}
        />

        <Area
          type="monotone"
          dataKey="attempts"
          name="Lượt thi"
          stroke="#06b6d4"
          strokeWidth={2}
          fill="url(#gradAttempts)"
          dot={{ fill: '#06b6d4', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#0e7490' }}
        />
        <Area
          type="monotone"
          dataKey="simulations"
          name="Mô phỏng"
          stroke="#a855f7"
          strokeWidth={2}
          fill="url(#gradSims)"
          dot={{ fill: '#a855f7', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: '#7e22ce' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
