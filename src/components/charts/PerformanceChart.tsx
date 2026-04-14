import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';

export const PerformanceChart = ({ data }: { data: { name: string, score: number, total: number }[] }) => {
  const chartData = data.map(d => ({
    ...d,
    missing: Math.max(0, d.total - d.score),
    labelTotal: `${d.score} / ${d.total} đ`
  }));

  return (
    <div className="h-72 w-full mt-8 bg-slate-950/30 p-6 rounded-2xl border border-slate-800">
      <h4 className="text-sm font-bold text-slate-400 uppercase mb-6 tracking-wider">Phân tích theo phần đề thi</h4>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#64748b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
            domain={[0, 'dataMax']}
          />
          <RechartsTooltip 
            cursor={{ fill: '#1e293b' }}
            contentStyle={{ 
              backgroundColor: '#0f172a', 
              border: '1px solid #334155', 
              borderRadius: '12px',
              fontSize: '12px'
            }}
            itemStyle={{ color: '#ef4444' }}
          />
          <Bar dataKey="score" stackId="a" barSize={40}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-score-${index}`} 
                fill={entry.score === entry.total ? '#10b981' : '#ef4444'} 
                radius={(entry.missing === 0 ? [6, 6, 0, 0] : [0, 0, 0, 0]) as any}
              />
            ))}
          </Bar>
          <Bar dataKey="missing" stackId="a" fill="#1e293b" radius={[6, 6, 0, 0]} barSize={40}>
            <LabelList dataKey="labelTotal" position="top" fill="#cbd5e1" fontSize={12} fontWeight="bold" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PerformanceChart;
