
import React, { useMemo } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend 
} from 'recharts';
import { FinancialRecord, AccountGroup } from '../types';
import { formatCurrency } from '../services/dataProcessor';

interface CompositionDonutsProps {
  data: FinancialRecord[];
  isDarkMode: boolean;
}

export const CompositionDonuts: React.FC<CompositionDonutsProps> = ({ data, isDarkMode }) => {
  const stats = useMemo(() => {
    let totalSiafi = 0;
    let totalSiloms = 0;
    let totalDiff = 0;
    
    const groupDiffs: Record<AccountGroup, number> = {
      [AccountGroup.BMP]: 0,
      [AccountGroup.CONSUMO]: 0,
      [AccountGroup.INTANGIVEL]: 0,
    };

    data.forEach(record => {
      totalSiafi += record.siafiValue;
      totalSiloms += record.silomsValue;
      totalDiff += Math.abs(record.difference);
      groupDiffs[record.group] += Math.abs(record.difference);
    });

    const totalSiafiSiloms = totalSiafi + totalSiloms;
    
    const compositionData = [
      { name: 'SIAFI', value: totalSiafi, color: '#3b82f6' }, // Blue
      { name: 'SILOMS', value: totalSiloms, color: '#10b981' }, // Green
    ];

    const detailData = [
      { name: 'BMP', value: groupDiffs[AccountGroup.BMP], color: '#dc2626' }, // Red
      { name: 'CONSUMO', value: groupDiffs[AccountGroup.CONSUMO], color: '#2563eb' }, // Blue
      { name: 'INTANGÍVEL', value: groupDiffs[AccountGroup.INTANGIVEL], color: '#059669' }, // Emerald
    ];

    return {
      compositionData,
      detailData,
      totalDiff,
      totalSiafi,
      totalSiloms,
      totalSiafiSiloms,
      siafiPct: totalSiafiSiloms > 0 ? (totalSiafi / totalSiafiSiloms) * 100 : 0,
      silomsPct: totalSiafiSiloms > 0 ? (totalSiloms / totalSiafiSiloms) * 100 : 0,
    };
  }, [data]);

  const textColor = isDarkMode ? '#f8fafc' : '#1e293b';
  const subTextColor = isDarkMode ? '#94a3b8' : '#64748b';

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* First Donut: Composition SIAFI x SILOMS */}
      <div className={`flex-1 flex flex-col p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f172a]/40 border-slate-800' : 'bg-white border-slate-100'} shadow-sm`}>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">COMPOSIÇÃO SIAFI x SILOMS (%)</h4>
        <div className="flex-1 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.compositionData}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="80%"
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {stats.compositionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                  borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                  color: textColor,
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          
          {/* Center Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-black" style={{ color: textColor }}>100%</span>
            <span className="text-[8px] font-bold uppercase tracking-tighter" style={{ color: subTextColor }}>TOTAL</span>
          </div>

          {/* Callouts (Simplified as labels next to chart or just legend) */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 flex flex-col items-start">
             <span className="text-[9px] font-black text-blue-400">SIAFI</span>
             <span className="text-xs font-black" style={{ color: textColor }}>{stats.siafiPct.toFixed(0)}%</span>
          </div>
          <div className="absolute top-1/2 -translate-y-1/2 right-0 flex flex-col items-end">
             <span className="text-[9px] font-black text-emerald-400">SILOMS</span>
             <span className="text-xs font-black" style={{ color: textColor }}>{stats.silomsPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="flex justify-center gap-4 mt-2">
           <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-[9px] font-bold text-slate-500 uppercase">SIAFI</span>
           </div>
           <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-[9px] font-bold text-slate-500 uppercase">SILOMS</span>
           </div>
        </div>
      </div>

      {/* Second Donut: Detail Difference */}
      <div className={`flex-1 flex flex-col p-4 rounded-lg border ${isDarkMode ? 'bg-[#0f172a]/40 border-slate-800' : 'bg-white border-slate-100'} shadow-sm`}>
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">DETALHAMENTO DIFERENÇA (R$)</h4>
        <div className="flex-1 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.detailData}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="80%"
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {stats.detailData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                  borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                  color: textColor,
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
            <span className="text-sm font-black leading-tight" style={{ color: textColor }}>
              {formatCurrency(stats.totalDiff)}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-tighter" style={{ color: subTextColor }}>TOTAL DIVERGÊNCIA</span>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
           {stats.detailData.map((item) => (
             <div key={item.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase">{item.name}</span>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};
