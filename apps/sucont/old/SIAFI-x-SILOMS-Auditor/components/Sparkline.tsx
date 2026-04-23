import React from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color: string;
}

export const Sparkline: React.FC<SparklineProps> = ({ data, color }) => {
  // Map data to recharts format
  const chartData = data.map((val, i) => ({ value: val, index: i }));

  return (
    <div className="w-full h-10 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#gradient-${color})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
