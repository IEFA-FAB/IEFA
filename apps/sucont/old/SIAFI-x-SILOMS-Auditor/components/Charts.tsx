
import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, TooltipProps, ComposedChart, AreaChart, Area, Brush, Treemap, Cell, LabelList, ReferenceLine
} from 'recharts';
import { FinancialRecord, AccountGroup, RiskLevel, ImpactLevel, TimeFilter } from '../types';
import { formatCurrency, formatCompactNumber, toShortDate } from '../services/dataProcessor';
import { LayoutList, BarChart3, Network, Layers, Building2, User, AlertCircle, AlertTriangle } from 'lucide-react';

interface ChartProps {
  data: FinancialRecord[];
  isDarkMode: boolean;
  isExpanded?: boolean;
  setHierarchy?: (h: 'ODS' | 'ORGAO' | 'UG') => void;
  hierarchyLevel?: 'ODS' | 'ORGAO' | 'UG';
  hierarchyFilter?: string[];
  selectedMonth?: string;
  timeFilter?: TimeFilter;
}

// --- Constants & Styles ---
const TREEMAP_COLORS = {
  base: '#1e293b',
  dark: '#0f172a',
  border: '#0f172a', // Cor do fundo do dashboard para respiro visual (1.5px)
  text: '#ffffff',
};

// Standardized ODS Palette (Solid Military Tones - Deep & Distinct)
const ODS_SOLID_COLORS: Record<string, string> = {
  'SEFA': '#172554',    // Azul Noite Profundo
  'DCTA': '#475569',    // Chumbo / Slate Escuro
  'COMPREP': '#134e4a', // Verde Petróleo/Teal Escuro (Herdado do antigo DCTA)
  'DECEA': '#0c4a6e',   // Azul Oceano Escuro
  'COMGAP': '#7f1d1d',  // Vinho/Bordeaux Fechado
  'COMGEP': '#78350f',  // Bronze/Siena
  'GABAER': '#334155',  // Slate Neutro
  'N/A': '#334155',     // Slate Neutro
};

const getOdsColor = (ods: string) => {
  return ODS_SOLID_COLORS[ods] || ODS_SOLID_COLORS['N/A'];
};

// --- Custom Tooltip (Neon Style) ---
const CustomDetailedTooltip = ({ active, payload, label, isDarkMode, viewMode }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    // Values might come from different properties depending on the chart type
    const diff = data.diff !== undefined ? data.diff : (data.totalDiff !== undefined ? data.totalDiff : data.difference);
    const siafi = data.siafi !== undefined ? data.siafi : (data.totalSiafi !== undefined ? data.totalSiafi : data.siafiValue);
    const siloms = data.siloms !== undefined ? data.siloms : (data.totalSiloms !== undefined ? data.totalSiloms : data.silomsValue);
    const pct = data.accumulatedPct; 
    const icc = data.icc;
    
    const absDiff = Math.abs(siafi - siloms);
    const pctDiff = siafi > 0 ? (absDiff / siafi) * 100 : 0;

    // Fix N/A in tooltip
    const displayName = (data.name && data.name !== 'N/A') ? data.name : (data.ug && data.ug !== 'N/A' ? data.ug : label);
    
    return (
      <div className={`min-w-[260px] p-4 rounded-lg border shadow-2xl backdrop-blur-md z-50 
        ${isDarkMode ? 'bg-[#0f172a]/95 border-slate-700' : 'bg-white/95 border-slate-200'}
      `}>
        <h4 className={`text-sm font-black mb-3 pb-2 border-b uppercase tracking-wider
          ${isDarkMode ? 'text-white border-slate-700' : 'text-slate-900 border-slate-200'}
        `}>
          {displayName}
        </h4>
        
        <div className="space-y-2.5">
           {/* SIAFI */}
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-[#1e40af] shadow-[0_0_8px_rgba(30,64,175,0.4)]"></div>
                 <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Saldo SIAFI:</span>
              </div>
              <span className={`text-xs font-bold font-mono ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{formatCurrency(siafi || 0)}</span>
           </div>

           {/* SILOMS */}
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.4)]"></div>
                 <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Saldo SILOMS:</span>
              </div>
              <span className={`text-xs font-bold font-mono ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>{formatCurrency(siloms || 0)}</span>
           </div>

           <div className="h-px bg-slate-700/50 my-1"></div>

            {/* Absolute Difference */}
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm bg-[#dc2626] shadow-[0_0_8px_rgba(220,38,38,0.3)]"></div>
                  <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Diferença Total:</span>
               </div>
               <span className={`text-xs font-bold font-mono ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                 {formatCurrency(diff)}
               </span>
            </div>

           {/* Breakdown if Pareto Stacked */}
           {data.bmpDiff !== undefined && (
             <div className="pl-4 space-y-1 mt-1 border-l border-slate-700/50">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-sm bg-[#1e40af]"></div>
                   <span className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>BMP</span>
                 </div>
                 <span className={`text-[10px] font-mono font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{formatCurrency(data.bmpDiff)}</span>
               </div>
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-sm bg-[#f97316]"></div>
                   <span className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Consumo</span>
                 </div>
                 <span className={`text-[10px] font-mono font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{formatCurrency(data.consumoDiff)}</span>
               </div>
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-sm bg-[#22c55e]"></div>
                   <span className={`text-[10px] uppercase font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Intangível</span>
                 </div>
                 <span className={`text-[10px] font-mono font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{formatCurrency(data.intangivelDiff)}</span>
               </div>
             </div>
           )}

           {/* Percentage Difference */}
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
                 <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Diferença Percentual:</span>
              </div>
              <span className={`text-xs font-bold font-mono text-orange-400`}>
                {pctDiff.toFixed(2)}%
              </span>
           </div>

           {/* ICC */}
           {icc !== undefined && (
             <div className="flex items-center justify-between pt-1 border-t border-slate-700/30 mt-1">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                  <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>ICC:</span>
               </div>
               <span className="text-xs font-bold font-mono text-emerald-400">
                 {icc.toFixed(2)}%
               </span>
             </div>
           )}

           {/* Accumulated Percentage (Pareto) */}
           {pct !== undefined && (
             <div className="flex items-center justify-between pt-1 border-t border-slate-700/30 mt-1">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"></div>
                  <span className={`text-[11px] font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Acumulado Pareto:</span>
               </div>
               <span className="text-xs font-bold font-mono text-amber-400">
                 {pct.toFixed(2)}%
               </span>
             </div>
           )}
        </div>
      </div>
    );
  }
  return null;
};

// --- Comparison Chart (Pareto vs Composition vs Treemap) ---
export const ComparisonChart: React.FC<ChartProps> = ({ data, isDarkMode, isExpanded, setHierarchy, hierarchyLevel = 'UG', hierarchyFilter = ['TODOS'] }) => {
  const [viewMode, setViewMode] = useState<'composition' | 'ranking' | 'tree'>('ranking');
  const [treeGroupBy, setTreeGroupBy] = useState<'ODS' | 'ORGAO' | 'UG'>('ODS');

  // Sync hierarchy level with parent wrapper
  React.useEffect(() => {
    if (viewMode === 'tree' && setHierarchy) {
      setHierarchy(treeGroupBy);
    }
  }, [viewMode, treeGroupBy, setHierarchy]);

  // Defensive check
  if (!data) return null;

  const aggregated = data.reduce((acc, curr) => {
    // Determine the key based on hierarchyLevel
    let key = curr.ug;
    
    // Check if a specific unit is selected in the hierarchyFilter.
    // If a specific unit is selected, group by UG.
    const isSpecificUnitSelected = hierarchyFilter && hierarchyFilter.length === 1 && hierarchyFilter[0] !== 'TODOS';

    if (isSpecificUnitSelected || hierarchyLevel === 'UG') key = curr.ug;
    else if (hierarchyLevel === 'ODS') key = curr.ods;
    else if (hierarchyLevel === 'ORGAO') key = curr.orgaoSuperior;

    const found = acc.find(item => item.name === key);
    if (found) {
      found.siafi += curr.siafiValue || 0;
      found.siloms += curr.silomsValue || 0;
      found.diff += curr.difference || 0;
      found.netDiff += (curr.silomsValue - curr.siafiValue); 
      
      // Breakdown for stacked Pareto
      if (curr.group === AccountGroup.BMP) found.bmpDiff += curr.difference || 0;
      if (curr.group === AccountGroup.CONSUMO) found.consumoDiff += curr.difference || 0;
      if (curr.group === AccountGroup.INTANGIVEL) found.intangivelDiff += curr.difference || 0;
    } else {
      acc.push({ 
        name: key,
        ug: curr.ug, // Keep original UG for reference if needed
        siafi: curr.siafiValue || 0, 
        siloms: curr.silomsValue || 0, 
        diff: curr.difference || 0,
        netDiff: (curr.silomsValue - curr.siafiValue) || 0,
        orgaoSuperior: curr.orgaoSuperior,
        ods: curr.ods,
        riskLevel: curr.riskLevel,
        bmpDiff: curr.group === AccountGroup.BMP ? (curr.difference || 0) : 0,
        consumoDiff: curr.group === AccountGroup.CONSUMO ? (curr.difference || 0) : 0,
        intangivelDiff: curr.group === AccountGroup.INTANGIVEL ? (curr.difference || 0) : 0,
      });
    }
    return acc;
  }, [] as { 
    name: string,
    ug: string, 
    siafi: number, 
    siloms: number, 
    diff: number, 
    netDiff: number, 
    orgaoSuperior: string, 
    ods: string, 
    riskLevel?: RiskLevel,
    bmpDiff: number,
    consumoDiff: number,
    intangivelDiff: number,
    accumulatedPct?: number 
  }[])
  .filter(item => item.diff > 0);

  // Sort by Magnitude (Difference) for Pareto
  aggregated.sort((a, b) => b.diff - a.diff);
  
  // Calculate Pareto Cumulative Percentage
  const totalAbsDiff = aggregated.reduce((sum, item) => sum + item.diff, 0);
  let accumulated = 0;
  const paretoData = aggregated.map(item => {
    accumulated += item.diff;
    return {
      ...item,
      totalAbsDiffContext: totalAbsDiff,
      accumulatedPct: totalAbsDiff > 0 ? (accumulated / totalAbsDiff) * 100 : 0
    };
  });
  
  // Prepare Treemap Data (Hierarchy based on treeGroupBy)
  const treeData = useMemo(() => {
    if (treeGroupBy === 'UG') {
      // For UG mode, we still show the hierarchy ODS -> Órgão -> UG for better context
      const odsGroups: Record<string, any> = {};
      aggregated.forEach(item => {
        const ods = item.ods || 'N/A';
        const orgao = item.orgaoSuperior || 'N/A';
        if (!odsGroups[ods]) odsGroups[ods] = { name: ods, ods: ods, children: {} };
        if (!odsGroups[ods].children[orgao]) odsGroups[ods].children[orgao] = { name: orgao, ods: ods, children: [] };
        odsGroups[ods].children[orgao].children.push({
          name: item.ug,
          ods: ods,
          size: item.diff,
          siafi: item.siafi,
          siloms: item.siloms,
          diff: item.diff,
          totalAbsDiffContext: totalAbsDiff
        });
      });
      return Object.values(odsGroups).map(ods => ({
        name: ods.name,
        ods: ods.ods,
        children: Object.values(ods.children).map((orgao: any) => ({
          name: orgao.name,
          ods: orgao.ods,
          children: orgao.children
        }))
      }));
    }

    if (treeGroupBy === 'ORGAO') {
      // Aggregate by Órgão (orgaoSuperior)
      const groups: Record<string, any> = {};
      aggregated.forEach(item => {
        const key = item.orgaoSuperior || 'N/A';
        if (!groups[key]) {
          groups[key] = { name: key, ods: item.ods || 'N/A', size: 0, diff: 0, siafi: 0, siloms: 0, totalAbsDiffContext: totalAbsDiff };
        }
        groups[key].size += item.diff;
        groups[key].diff += item.diff;
        groups[key].siafi += item.siafi;
        groups[key].siloms += item.siloms;
      });
      return Object.values(groups);
    }

    // Default: Aggregate by ODS
    const groups: Record<string, any> = {};
    aggregated.forEach(item => {
      const key = item.ods || 'N/A';
      if (!groups[key]) {
        groups[key] = { name: key, ods: key, size: 0, diff: 0, siafi: 0, siloms: 0, totalAbsDiffContext: totalAbsDiff };
      }
      groups[key].size += item.diff;
      groups[key].diff += item.diff;
      groups[key].siafi += item.siafi;
      groups[key].siloms += item.siloms;
    });
    return Object.values(groups);
  }, [aggregated, treeGroupBy]);

  const totalNetDivergence = aggregated.reduce((sum, item) => sum + item.netDiff, 0);

  // Risk KPI Stats
  const criticalRiskUGs = aggregated.filter(item => item.riskLevel === RiskLevel.CRITICO);
  const totalFinancialImpact = aggregated.reduce((sum, item) => sum + item.diff, 0);
  const criticalFinancialImpact = criticalRiskUGs.reduce((sum, item) => sum + item.diff, 0);
  
  // Decide how many items to show based on expansion
  const displayData = isExpanded ? paretoData : paretoData.slice(0, 20);

  if (displayData.length === 0) {
     return <div className="flex items-center justify-center h-full text-slate-500">Sem dados para exibir.</div>;
  }

  // Styles for scrolling logic
  const containerStyle: React.CSSProperties = isExpanded
      ? (viewMode === 'tree' 
          ? { width: '2400px', height: '1600px' } 
          : { width: '100%', height: '100%', minWidth: `${Math.max(displayData.length * 100, 1200)}px` })
      : { width: '100%', height: '100%' };
  
  // Remove the ranking override that was squashing small datasets

  const overflowClass = isExpanded
    ? (viewMode === 'tree' ? 'flex-1 overflow-auto custom-scrollbar' : 'overflow-x-auto custom-scrollbar pb-2')
    : '';

  // Custom XAxis Tick with Risk Indicator
  const CustomizedAxisTick = (props: any) => {
    const { x, y, payload, data, hierarchyLevel } = props;
    const item = data.find((d: any) => d.name === payload.value);
    
    // Only show risk emoji if we are at UG level
    let emoji = '';
    if (hierarchyLevel === 'UG') {
      emoji = '🟢';
      if (item?.riskLevel === RiskLevel.MEDIO) emoji = '🟡';
      if (item?.riskLevel === RiskLevel.ALTO) emoji = '🟠';
      if (item?.riskLevel === RiskLevel.CRITICO) emoji = '🔴';
    }

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={24}
          textAnchor="end"
          fill={isDarkMode ? '#94a3b8' : '#64748b'}
          fontSize={11}
          fontWeight="bold"
          transform="rotate(-45)"
        >
          {payload.value} {emoji}
        </text>
      </g>
    );
  };

  // Custom Treemap Content
  const CustomizedTreemapContent = (props: any) => {
    const { root, depth, x, y, width, height, index, payload, colors, rank, name, diff, ods } = props;
    
    const finalFill = depth === 0 ? 'none' : getOdsColor(ods || name || 'N/A');
    
    // Dynamic text color: Dark for light backgrounds, White for others
    // DCTA is now dark (Chumbo), so it uses white text
    const isLightBg = false; // Resetting as Chumbo is dark
    const textColor = isLightBg ? '#020617' : '#ffffff';
    const textShadow = isLightBg ? 'none' : '0 1px 2px rgba(0,0,0,0.8)';

    return (
      <g className="recharts-treemap-node group cursor-pointer">
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: finalFill,
            stroke: TREEMAP_COLORS.border,
            strokeWidth: 1.5,
            transition: 'all 0.3s ease'
          }}
        />
        {/* Hover Effect: Inner Glow */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={isLightBg ? "black" : "white"}
          fillOpacity={0}
          className="group-hover:fill-opacity-10 transition-all duration-200"
          style={{ pointerEvents: 'none' }}
        />
        
        {/* Always try to render content, even if small */}
        <foreignObject x={x} y={y} width={width} height={height}>
          <div className="w-full h-full flex flex-col items-center justify-center p-0.5 overflow-hidden pointer-events-none">
            <span 
              className="text-[9px] font-bold uppercase tracking-tighter text-center leading-tight break-words px-1" 
              style={{ color: textColor, textShadow, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {name}
            </span>
            {width > 40 && height > 20 && (
              <span 
                className="text-[9px] font-mono font-black tracking-tight" 
                style={{ color: textColor, textShadow }}
              >
                {formatCompactNumber(diff || 0)}
              </span>
            )}
          </div>
        </foreignObject>
      </g>
    );
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      
      {/* Risk KPI Header */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-sm
          ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'}
        `}>
          <div className="flex flex-col text-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Impacto Financeiro Total</span>
            <span className={`text-sm font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(totalFinancialImpact)}</span>
          </div>
        </div>
      </div>

      {/* View Toggle - Moved to the right to avoid overlap */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-4">
        {viewMode === 'tree' && (
          <div className="flex items-center gap-2 mr-4">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Agrupar por:</span>
            <div className={`flex rounded-lg p-0.5 border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              <button
                onClick={() => setTreeGroupBy('ODS')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-md transition-all
                  ${treeGroupBy === 'ODS' 
                    ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                    : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                <Layers className="w-3 h-3" />
                ODS
              </button>
              <button
                onClick={() => setTreeGroupBy('ORGAO')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-md transition-all
                  ${treeGroupBy === 'ORGAO' 
                    ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                    : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                <Building2 className="w-3 h-3" />
                Órgão
              </button>
              <button
                onClick={() => setTreeGroupBy('UG')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-md transition-all
                  ${treeGroupBy === 'UG' 
                    ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                    : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                <User className="w-3 h-3" />
                UG
              </button>
            </div>
          </div>
        )}

        <div className={`flex rounded-lg p-0.5 border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
          <button
            onClick={() => setViewMode('ranking')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all
              ${viewMode === 'ranking' 
                ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <LayoutList className="w-3 h-3" />
            Pareto
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all
              ${viewMode === 'tree' 
                ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <Network className="w-3 h-3" />
            Árvore
          </button>
          <button
            onClick={() => setViewMode('composition')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all
              ${viewMode === 'composition' 
                ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            <BarChart3 className="w-3 h-3" />
            Composição
          </button>
        </div>
      </div>

      {/* Expanded Only Metric */}
      {isExpanded && viewMode === 'composition' && (
        <div className={`mb-2 mr-36 px-3 py-2 rounded-lg border flex items-center justify-between max-w-md
           ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
           <span className="text-xs font-bold uppercase text-slate-400">
             Divergência Líquida
           </span>
           <span className={`text-sm font-mono font-bold
             ${totalNetDivergence > 0 ? 'text-emerald-500' : totalNetDivergence < 0 ? 'text-red-500' : 'text-slate-500'}
           `}>
             {totalNetDivergence > 0 ? '+' : ''}{formatCurrency(totalNetDivergence)}
           </span>
        </div>
      )}

      <div className={`flex-1 w-full mt-2 ${overflowClass}`}>
        <div style={containerStyle} className="w-full h-full relative">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'composition' ? (
              // COMPOSITION VIEW (Vertical Bars, Side-by-Side)
              <BarChart data={displayData} margin={{ top: 40, right: 30, left: 20, bottom: isExpanded ? 120 : 80 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                <XAxis 
                  dataKey="name" 
                  tick={<CustomizedAxisTick data={displayData} hierarchyLevel={hierarchyLevel} />}
                  interval={0}
                  height={isExpanded ? 100 : 60}
                  axisLine={false} 
                  tickLine={false} 
                />
                <YAxis 
                  tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} 
                  tick={{fill: isDarkMode ? '#94a3b8' : '#64748b'}} 
                  axisLine={false} 
                  tickLine={false}
                  domain={[0, 'auto']}
                />
                <Tooltip content={<CustomDetailedTooltip isDarkMode={isDarkMode} />} cursor={{fill: isDarkMode ? '#1e293b' : '#f1f5f9'}} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="siafi" name="SIAFI" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={isExpanded ? 30 : undefined} />
                <Bar dataKey="siloms" name="SILOMS" fill="#10b981" radius={[4, 4, 0, 0]} barSize={isExpanded ? 30 : undefined} />
              </BarChart>
            ) : viewMode === 'ranking' ? (
              // PARETO VIEW (Composed Chart: Bar + Line)
              <ComposedChart data={displayData} margin={{ top: 40, right: 30, left: 20, bottom: isExpanded ? 120 : 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                <XAxis 
                  dataKey="name" 
                  tick={<CustomizedAxisTick data={displayData} hierarchyLevel={hierarchyLevel} />}
                  interval={0}
                  height={isExpanded ? 100 : 60}
                  axisLine={false} 
                  tickLine={false} 
                />
                {/* Left Axis: Values (Hidden as requested) */}
                <YAxis 
                  yAxisId="left"
                  hide={true}
                  domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
                  tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} 
                  tick={{fill: isDarkMode ? '#94a3b8' : '#64748b'}} 
                  axisLine={false} 
                  tickLine={false}
                />
                {/* Right Axis: Percentage */}
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(value) => `${value}%`} 
                  tick={{fill: isDarkMode ? '#fbbf24' : '#d97706'}} 
                  axisLine={false} 
                  tickLine={false}
                  domain={[0, 100]}
                />
                <Tooltip content={<CustomDetailedTooltip isDarkMode={isDarkMode} />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                
                {/* Stacked Impact Bars */}
                <Bar 
                  yAxisId="left"
                  dataKey="bmpDiff" 
                  name="BMP" 
                  stackId="a"
                  fill="#1e40af"
                  radius={[8, 8, 0, 0]}
                  barSize={isExpanded ? 40 : undefined}
                >
                  {displayData.map((entry, index) => (
                    <Cell 
                      key={`cell-bmp-${index}`} 
                      fill="#1e40af" 
                      fillOpacity={entry.accumulatedPct && entry.accumulatedPct <= 80 ? 1 : 0.4}
                    />
                  ))}
                </Bar>
                <Bar 
                  yAxisId="left"
                  dataKey="consumoDiff" 
                  name="Bens de Consumo" 
                  stackId="a"
                  fill="#0ea5e9"
                  radius={[8, 8, 0, 0]}
                  barSize={isExpanded ? 40 : undefined}
                >
                  {displayData.map((entry, index) => (
                    <Cell 
                      key={`cell-consumo-${index}`} 
                      fill="#0ea5e9" 
                      fillOpacity={entry.accumulatedPct && entry.accumulatedPct <= 80 ? 1 : 0.4}
                    />
                  ))}
                </Bar>
                <Bar 
                  yAxisId="left"
                  dataKey="intangivelDiff" 
                  name="Intangíveis" 
                  stackId="a"
                  radius={[8, 8, 0, 0]} 
                  fill="#059669"
                  barSize={isExpanded ? 40 : undefined}
                >
                  <LabelList 
                    dataKey="diff" 
                    position="top" 
                    angle={-90}
                    offset={20}
                    content={(props: any) => {
                      const { x, y, width, value } = props;
                      if (value === undefined || value === null || value === 0) return null;
                      const formattedValue = formatCompactNumber(value);
                      const isDark = isDarkMode;
                      // Only show label if bar is wide enough or in expanded mode
                      if (!isExpanded && width < 20) return null;
                      
                      return (
                        <g transform={`translate(${x + width / 2},${y - 20})`}>
                          <rect
                            x="-14"
                            y="-75"
                            width="28"
                            height="85"
                            fill={isDark ? '#0f172a' : '#f8fafc'}
                            fillOpacity={0.9}
                            rx="8"
                            stroke={isDark ? '#334155' : '#e2e8f0'}
                            strokeWidth={1}
                          />
                          <text
                            x="0"
                            y="0"
                            dy={-8}
                            textAnchor="start"
                            fill={isDark ? '#cbd5e1' : '#475569'}
                            fontSize="12"
                            fontWeight="bold"
                            transform="rotate(-90)"
                          >
                            {formattedValue}
                          </text>
                        </g>
                      );
                    }}
                  />
                  {displayData.map((entry, index) => (
                    <Cell 
                      key={`cell-intangivel-${index}`} 
                      fill="#059669" 
                      fillOpacity={entry.accumulatedPct && entry.accumulatedPct <= 80 ? 1 : 0.4}
                    />
                  ))}
                </Bar>
                
                {/* Accumulated Line */}
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="accumulatedPct" 
                  name="Acumulado %" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            ) : (
              // TREE VIEW (Treemap)
              <Treemap
                data={treeData}
                dataKey="size"
                aspectRatio={2400 / 1600}
                stroke="#fff"
                fill="#8884d8"
                content={<CustomizedTreemapContent />}
              >
                <Tooltip content={<CustomDetailedTooltip isDarkMode={isDarkMode} />} />
              </Treemap>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// --- Evolution Area Chart (Improved with Overlapping Waves & Drag) ---

export const EvolutionChart: React.FC<ChartProps> = ({ data, isDarkMode, selectedMonth, timeFilter = 'MENSAL' }) => {
  const [viewMode, setViewMode] = useState<'total' | 'overlap' | 'icc' | 'comparison'>('total');
  const [brushRange, setBrushRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [isManuallyAdjusted, setIsManuallyAdjusted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  if (!data) return null;
  
  const timeSeries = useMemo(() => {
    // Group by date
    const grouped = data.reduce((acc, curr) => {
      const found = acc.find(item => item.date === curr.date);
      if (found) {
        found.totalDiff += curr.difference;
        found.totalSiafi += curr.siafiValue;
        found.totalSiloms += curr.silomsValue;
      } else {
        acc.push({ 
          date: curr.date, 
          year: curr.year,
          monthIndex: curr.monthIndex,
          totalDiff: curr.difference, 
          totalSiafi: curr.siafiValue,
          totalSiloms: curr.silomsValue,
          timestamp: (curr.year * 100) + curr.monthIndex,
          axisLabel: toShortDate(curr.date)
        });
      }
      return acc;
    }, [] as any[]);

    // Sort by timestamp
    const sorted = grouped.sort((a, b) => a.timestamp - b.timestamp);

    // Apply timeFilter (MENSAL, TRIMESTRAL, SEMESTRAL, ANUAL)
    // We start from the latest month (or selectedMonth) and go backwards by the gap
    let filteredSorted = sorted;
    // Do not apply gap filter if we are in 'comparison' mode, because the comparison mode 
    // already compares each month to its previous year, and filtering the X-axis would make it too sparse.
    if (timeFilter !== 'MENSAL' && sorted.length > 0 && viewMode !== 'comparison') {
      let gap = 1;
      if (timeFilter === 'TRIMESTRAL') gap = 3;
      if (timeFilter === 'SEMESTRAL') gap = 6;
      if (timeFilter === 'ANUAL') gap = 12;

      // Determine the anchor date (either selectedMonth or the latest available)
      let anchorIndex = sorted.length - 1;
      if (selectedMonth && selectedMonth !== 'TODOS') {
        const foundIndex = sorted.findIndex(s => s.date === selectedMonth);
        if (foundIndex >= 0) anchorIndex = foundIndex;
      }

      const anchorItem = sorted[anchorIndex];
      const anchorTotalMonths = anchorItem.year * 12 + anchorItem.monthIndex;

      filteredSorted = sorted.filter(item => {
        const itemTotalMonths = item.year * 12 + item.monthIndex;
        const diffMonths = anchorTotalMonths - itemTotalMonths;
        // Keep items that are exactly a multiple of 'gap' months away from the anchor
        // and only items before or equal to the anchor (if we want to hide future months relative to selection, 
        // but usually we just want the grid to align with the anchor).
        return diffMonths >= 0 && diffMonths % gap === 0;
      });
    }

    // Add ICC and Prev Year Data
    return filteredSorted.map(item => {
      // ICC = 1 - (Diferença / Saldo SIAFI)
      // Align with App.tsx formula
      const icc = item.totalSiafi > 0 
        ? Math.max(0, (1 - (item.totalDiff / item.totalSiafi)) * 100) 
        : (item.totalDiff === 0 ? 100 : 0);
      
      // Find previous year same month
      const prevYear = item.year - 1;
      const prevMonth = item.monthIndex;
      const prevYearItem = sorted.find(s => s.year === prevYear && s.monthIndex === prevMonth);

      return {
        ...item,
        icc: Math.max(0, Math.min(100, icc)),
        diffHighlight: Math.abs(item.totalSiafi - item.totalSiloms),
        prevYearDiff: prevYearItem ? prevYearItem.totalDiff : 0,
        prevYearLabel: prevYearItem ? toShortDate(prevYearItem.date) : 'N/A',
        currentYearLabel: toShortDate(item.date)
      };
    });
  }, [data]);

  // Reset manual adjustment if selectedMonth or viewMode changes, so it centers on the new month
  useEffect(() => {
    setIsManuallyAdjusted(false);
  }, [selectedMonth, viewMode]);

  // Update brush range when selectedMonth or data changes
  useEffect(() => {
    if (timeSeries.length === 0) return;
    
    if (isManuallyAdjusted) {
      // Ensure bounds are valid if data length changed
      setBrushRange(prev => {
        if (prev.end >= timeSeries.length) {
          const size = prev.end - prev.start;
          const end = timeSeries.length - 1;
          const start = Math.max(0, end - size);
          return { start, end };
        }
        return prev;
      });
      return;
    }

    const totalPoints = timeSeries.length;
    const selectedIndex = selectedMonth && selectedMonth !== 'TODOS'
      ? timeSeries.findIndex(t => t.date === selectedMonth) 
      : -1;
      
    const end = selectedIndex >= 0 ? selectedIndex : totalPoints - 1;
    
    // Default to 1 year of data points based on the time filter
    let pointsForOneYear = 12;
    if (viewMode !== 'comparison') {
      if (timeFilter === 'TRIMESTRAL') pointsForOneYear = 4;
      if (timeFilter === 'SEMESTRAL') pointsForOneYear = 2;
      if (timeFilter === 'ANUAL') pointsForOneYear = 1; // Or maybe 2 to show some history? Let's use 3 for annual to show a trend
      if (timeFilter === 'ANUAL') pointsForOneYear = 3;
    }

    const start = Math.max(0, end - (pointsForOneYear - 1));
    
    setBrushRange({ start, end });
    setIsInitialized(true);
  }, [selectedMonth, timeSeries, isManuallyAdjusted, timeFilter, viewMode]);

  if (timeSeries.length === 0) return <div className="flex items-center justify-center h-full text-slate-500">Sem dados.</div>;

  const handleBrushChange = (range: any) => {
    if (range && typeof range.startIndex === 'number' && typeof range.endIndex === 'number') {
      // Only update if indices actually changed to avoid shaking loops
      if (range.startIndex !== brushRange.start || range.endIndex !== brushRange.end) {
        setBrushRange({ start: range.startIndex, end: range.endIndex });
        setIsManuallyAdjusted(true);
      }
    }
  };

  return (
    <div className="w-full h-full min-h-[300px] flex flex-col select-none">
      {/* Toggle Controls */}
      <div className="flex justify-between items-center mb-1 px-2">
        <div className="flex items-center gap-4">
          <div className={`flex rounded-lg p-0.5 border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
            <button
              onClick={() => setViewMode('total')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all
                ${viewMode === 'total' 
                  ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                  : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              Saldos (Total)
            </button>
            <button
              onClick={() => setViewMode('overlap')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all
                ${viewMode === 'overlap' 
                  ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                  : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              SIAFi x SIloms
            </button>
            <button
              onClick={() => setViewMode('icc')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all
                ${viewMode === 'icc' 
                  ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                  : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              ICC (%)
            </button>
            <button
              onClick={() => setViewMode('comparison')}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all
                ${viewMode === 'comparison' 
                  ? isDarkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm' 
                  : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              Comparativo Anual
            </button>
          </div>

          {viewMode === 'comparison' && timeSeries[brushRange.end] && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm ${isDarkMode ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
              <span className={`text-[11px] font-bold uppercase ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                ICC Atual ({timeSeries[brushRange.end].axisLabel}):
              </span>
              <span className={`text-lg font-black ${isDarkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>
                {timeSeries[brushRange.end].icc.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4">
          {viewMode === 'icc' ? (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#10b981]"></div>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Índice de Conciliação</span>
            </div>
          ) : viewMode === 'comparison' ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Ano Anterior</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#6366f1]"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Ano Atual</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#1e40af]"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">SIAFi</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#0ea5e9]"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">SIloms</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#dc2626] opacity-50"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Divergência</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
          {viewMode === 'comparison' ? (
            <BarChart data={timeSeries} margin={{ top: 25, right: 10, left: 10, bottom: 0 }} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#1e293b' : '#e2e8f0'} />
              <XAxis 
                dataKey="axisLabel" 
                tick={{fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10}} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} 
                tick={{fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 10}} 
                axisLine={false} 
                tickLine={false}
                domain={[0, (dataMax: number) => dataMax * 1.5]}
              />
              <Tooltip content={<CustomDetailedTooltip isDarkMode={isDarkMode} viewMode={viewMode} />} />
              <Legend verticalAlign="top" height={20}/>
              <Bar dataKey="prevYearDiff" name="Ano Anterior" fill="#94a3b8" fillOpacity={0.5} radius={[4, 4, 0, 0]}>
                <LabelList 
                  dataKey="prevYearDiff" 
                  position="top" 
                  angle={-90} 
                  offset={15}
                  content={(props: any) => {
                    const { x, y, width, value, index } = props;
                    if (value === undefined || value === null) return null;
                    const formattedValue = formatCompactNumber(value);
                    const isDark = isDarkMode;
                    return (
                      <g transform={`translate(${x + width / 2},${y - 15})`}>
                        <rect
                          x="-11"
                          y="-65"
                          width="22"
                          height="70"
                          fill={isDark ? '#0f172a' : '#f8fafc'}
                          fillOpacity={0.9}
                          rx="4"
                        />
                        <text
                          x="0"
                          y="0"
                          dy={-5}
                          textAnchor="start"
                          fill={isDark ? '#94a3b8' : '#64748b'}
                          fontSize="14"
                          fontWeight="bold"
                          transform="rotate(-90)"
                        >
                          {formattedValue}
                        </text>
                      </g>
                    );
                  }}
                />
              </Bar>
              <Bar dataKey="totalDiff" name="Ano Atual" fill="#6366f1" radius={[4, 4, 0, 0]}>
                <LabelList 
                  dataKey="totalDiff" 
                  position="top" 
                  angle={-90} 
                  offset={15}
                  content={(props: any) => {
                    const { x, y, width, value, index } = props;
                    if (value === undefined || value === null) return null;
                    const formattedValue = formatCompactNumber(value);
                    const isDark = isDarkMode;
                    return (
                      <g transform={`translate(${x + width / 2},${y - 15})`}>
                        <rect
                          x="-11"
                          y="-65"
                          width="22"
                          height="70"
                          fill={isDark ? '#0f172a' : '#f8fafc'}
                          fillOpacity={0.9}
                          rx="4"
                        />
                        <text
                          x="0"
                          y="0"
                          dy={-5}
                          textAnchor="start"
                          fill={isDark ? '#818cf8' : '#4338ca'}
                          fontSize="14"
                          fontWeight="bold"
                          transform="rotate(-90)"
                        >
                          {formattedValue}
                        </text>
                      </g>
                    );
                  }}
                />
              </Bar>
              <Brush 
                dataKey="axisLabel" 
                height={30} 
                stroke={isDarkMode ? '#475569' : '#cbd5e1'}
                fill={isDarkMode ? '#1e293b' : '#f8fafc'}
                startIndex={brushRange.start}
                endIndex={brushRange.end}
                onChange={handleBrushChange}
                travellerWidth={12}
                alwaysShowText={false}
              />
            </BarChart>
          ) : (
            <AreaChart 
              key={`chart-${viewMode}-${timeSeries.length}-${timeSeries[0]?.date}`}
              data={timeSeries} 
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorSiafi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e40af" stopOpacity={0.6}/>
                  <stop offset="95%" stopColor="#1e40af" stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="colorSiloms" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="colorDiff" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorIcc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#1e293b' : '#e2e8f0'} />
              <XAxis 
                dataKey="axisLabel" 
                tick={{fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12}} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tickFormatter={(value) => viewMode === 'icc' ? `${value}%` : `${(value / 1000000).toFixed(0)}M`} 
                tick={{fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12}} 
                axisLine={false} 
                tickLine={false}
                domain={viewMode === 'icc' ? [0, 110] : ['auto', 'auto']}
              />
              <Tooltip content={<CustomDetailedTooltip isDarkMode={isDarkMode} viewMode={viewMode} />} />
              
              {selectedMonth && selectedMonth !== 'TODOS' && (
                <ReferenceLine 
                  x={toShortDate(selectedMonth)} 
                  stroke={isDarkMode ? '#f43f5e' : '#e11d48'} 
                  strokeDasharray="3 3"
                  label={{ 
                    value: 'SELECIONADO', 
                    position: 'top', 
                    fill: isDarkMode ? '#f43f5e' : '#e11d48', 
                    fontSize: 10, 
                    fontWeight: 'bold' 
                  }} 
                />
              )}

              {viewMode === 'icc' && (
                <ReferenceLine 
                  y={100} 
                  stroke={isDarkMode ? '#334155' : '#cbd5e1'} 
                  strokeDasharray="3 3" 
                  label={{ 
                    value: 'META 100%', 
                    position: 'insideBottomRight', 
                    fill: isDarkMode ? '#475569' : '#94a3b8', 
                    fontSize: 10, 
                    fontWeight: 'bold',
                    offset: 10
                  }} 
                />
              )}

              {viewMode === 'overlap' ? (
                <>
                  <Area 
                    type="monotone" 
                    dataKey="diffHighlight" 
                    stroke="none"
                    fill="#ef4444"
                    fillOpacity={0.15}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="totalSiafi" 
                    name="SIAFi" 
                    stroke={isDarkMode ? '#3b82f6' : '#1e40af'} 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorSiafi)" 
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    dot={{ r: 3, fill: '#1e40af', strokeWidth: 1, stroke: isDarkMode ? '#0f172a' : '#fff' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="totalSiloms" 
                    name="SIloms" 
                    stroke={isDarkMode ? '#0ea5e9' : '#0369a1'} 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorSiloms)" 
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 1, stroke: isDarkMode ? '#0f172a' : '#fff' }}
                  />
                </>
              ) : viewMode === 'icc' ? (
                <Area 
                  type="monotone" 
                  dataKey="icc" 
                  name="ICC" 
                  stroke="#10b981" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorIcc)" 
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: isDarkMode ? '#0f172a' : '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 0 }}
                >
                  <LabelList 
                    dataKey="icc" 
                    position="top" 
                    offset={20}
                    formatter={(val: number) => `${val.toFixed(1)}%`}
                    style={{ 
                      fontSize: '16px', 
                      fontWeight: '900', 
                      fill: isDarkMode ? '#34d399' : '#065f46'
                    }}
                  />
                </Area>
              ) : (
                <Area 
                  type="monotone" 
                  dataKey="totalDiff" 
                  name="Divergência" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorDiff)" 
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: isDarkMode ? '#0f172a' : '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                >
                  <LabelList 
                    dataKey="totalDiff" 
                    position="top" 
                    offset={15}
                    formatter={(val: number) => formatCompactNumber(val)}
                    style={{ 
                      fontSize: '14px', 
                      fontWeight: 'bold', 
                      fill: isDarkMode ? '#818cf8' : '#4338ca'
                    }}
                  />
                </Area>
              )}

              <Brush 
                dataKey="axisLabel" 
                height={30} 
                stroke={isDarkMode ? '#475569' : '#cbd5e1'}
                fill={isDarkMode ? '#1e293b' : '#f8fafc'}
                startIndex={brushRange.start}
                endIndex={brushRange.end}
                onChange={handleBrushChange}
                travellerWidth={12}
                alwaysShowText={false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
