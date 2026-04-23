import React from 'react';

interface HealthScoreGaugeProps {
  score: number; // 0 to 100
  isDarkMode: boolean;
}

export const HealthScoreGauge: React.FC<HealthScoreGaugeProps> = ({ score, isDarkMode }) => {
  const normalizedScore = Math.min(100, Math.max(0, score));
  
  // SVG Arc parameters
  const size = 160;
  const strokeWidth = 18; // Slightly thinner for smaller size
  const radius = (size - strokeWidth) / 2 - 5;
  const centerX = size / 2;
  const centerY = size / 2 + 20; // Shift down to fit the semicircle
  
  // Semicircle circumference (180 degrees)
  const circumference = Math.PI * radius;
  // Progress offset (0 to circumference)
  const offset = circumference - (normalizedScore / 100) * circumference;

  const getStatusText = (val: number) => {
    if (val >= 98) return "Excelência Máxima";
    if (val >= 90) return "Nível Excelente";
    if (val >= 80) return "Nível Operacional";
    if (val >= 70) return "Divergência Moderada";
    return "Necessita Saneamento";
  };

  const getStatusColor = (val: number) => {
    if (val >= 98) return '#10b981'; // Emerald
    if (val >= 90) return '#22c55e'; // Green
    if (val >= 80) return '#f59e0b'; // Amber
    if (val >= 70) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  return (
    <div className="w-full h-[100px] relative flex flex-col items-center justify-center overflow-hidden">
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${size} ${size - 40}`} 
        className="transform -rotate-0"
      >
        <defs>
          <linearGradient id="iccGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />    {/* Red */}
            <stop offset="50%" stopColor="#f59e0b" />   {/* Yellow/Orange */}
            <stop offset="100%" stopColor="#10b981" />  {/* Green */}
          </linearGradient>
          
          {/* Shadow for the progress arc */}
          <filter id="arcShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background Arc (Gray) */}
        <path
          d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
          fill="none"
          stroke={isDarkMode ? "#1e293b" : "#e2e8f0"}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
        />

        {/* Progress Arc (Gradient) */}
        <path
          d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
          fill="none"
          stroke="url(#iccGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter="url(#arcShadow)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      
      {/* Centered Value */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
        <div className="flex flex-col items-center">
          <span 
            className="text-xl font-black font-mono tracking-tighter drop-shadow-sm"
            style={{ color: getStatusColor(score) }}
          >
            {score.toFixed(1)}%
          </span>
          <div className={`h-px w-8 my-0.5 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest text-center px-2">
            {getStatusText(score)}
          </span>
        </div>
      </div>
    </div>
  );
};
