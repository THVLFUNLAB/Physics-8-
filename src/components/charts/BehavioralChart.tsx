import React from 'react';
import {
  PieChart, Pie, Cell,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';

export const BehavioralAnalysisChart = ({ careless, fundamental }: { careless: number, fundamental: number }) => {
  const data = [
    { name: 'Lỗi ẩu (Kỹ thuật)', value: careless, color: '#38bdf8' },
    { name: 'Hổng gốc (Bản chất)', value: fundamental, color: '#f43f5e' },
  ];
  const total = careless + fundamental;

  return (
    <div className="h-[250px] w-full relative">
      {/* Center Label inside Donut */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
        <div className="text-center -mt-4">
          <p className="text-3xl font-black text-white">{total}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tổng lỗi</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={85}
            paddingAngle={4}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} style={{ filter: `drop-shadow(0 0 6px ${entry.color}40)` }} />
            ))}
          </Pie>
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(15,23,42,0.95)', 
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(100,116,139,0.3)', 
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: '12px 16px',
            }}
            itemStyle={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}
            labelStyle={{ color: '#94a3b8', fontSize: '11px' }}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value) => <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BehavioralAnalysisChart;
