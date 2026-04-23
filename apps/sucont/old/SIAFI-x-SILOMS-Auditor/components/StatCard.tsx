import React from 'react';
import { LucideIcon } from 'lucide-react';
import { CurrencyDisplay } from './CurrencyDisplay';
import { Sparkline } from './Sparkline';
import { formatCompactNumber } from '../services/dataProcessor';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  bgClass: string; // expects something like "bg-red-500"
  trendData?: number[];
  variation?: string;
  isPositive?: boolean;
}

export const StatCard: React.FC<StatCardProps & { isDarkMode?: boolean }> = ({ 
  title, value, subtitle, icon: Icon, bgClass, trendData = [10, 20, 15, 25, 20, 30], variation = "+2.1% nos últimos 90 dias", isPositive = true, isDarkMode = true
}) => {
  const trendColor = isPositive ? '#10b981' : '#ef4444'; // emerald-500 or red-500

  return (
    <div className={`backdrop-blur-md rounded-lg shadow-lg border p-4 flex flex-col justify-between transition-all group overflow-hidden relative h-[140px]
      ${isDarkMode 
        ? 'bg-[#0f172a]/60 border-slate-800/50 hover:bg-[#0f172a]/80' 
        : 'bg-white border-slate-200 hover:bg-slate-50'
      }
    `}>
      
      {/* Background Sparkline (Line only, at the bottom) */}
      <div className="absolute bottom-2 left-4 right-4 h-8 opacity-40 pointer-events-none">
        <Sparkline data={trendData} color={trendColor} />
      </div>

      <div className="flex justify-between items-start relative z-10">
        <div className="flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 
            ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}
          `}>{title}</p>
          <div className="flex flex-col">
            {typeof value === 'number' ? (
              <h3 className={`text-xl font-black tracking-tight leading-tight
                ${isDarkMode ? 'text-white' : 'text-slate-900'}
              `}>
                R$ {formatCompactNumber(value)}
              </h3>
            ) : (
              <h3 className={`text-xl font-black tracking-tight leading-tight
                ${isDarkMode ? 'text-white' : 'text-slate-900'}
              `}>{value}</h3>
            )}
            
            {subtitle && (
              <p className={`text-[9px] font-bold uppercase tracking-tight mt-0.5 
                ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}
              `}>{subtitle}</p>
            )}
          </div>
        </div>
        
        {/* Icon with Square Rounded Background */}
        <div className={`w-10 h-10 rounded-lg ${bgClass} shadow-lg shadow-black/20 flex items-center justify-center flex-shrink-0 ml-2`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>

      <div className="flex justify-end items-end relative z-10 mt-auto">
        <span className={`text-[9px] font-black ${isPositive ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
          {variation}
        </span>
      </div>
    </div>
  );
};
