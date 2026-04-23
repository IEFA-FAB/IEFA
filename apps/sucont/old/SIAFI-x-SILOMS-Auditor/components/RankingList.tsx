import React, { useState, useMemo } from 'react';
import { FinancialRecord, AccountGroup } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  MessageSquareText, 
  ArrowRight, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowUp, 
  ArrowDown, 
  Activity,
  AlertCircle,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { CurrencyDisplay } from './CurrencyDisplay';

interface RankingListProps {
  data: FinancialRecord[];
  historicalData?: FinancialRecord[];
  isDarkMode: boolean;
  comparisonLabel?: string;
  onSendMessage?: (record: FinancialRecord, type: 'RANKING' | 'HEATMAP') => void;
}

type Category = 'REDUCAO_CONTINUA' | 'REDUCAO_PONTUAL' | 'AUMENTO_CONTINUO' | 'OSCILACAO_ATIPICA' | 'NEUTRO';

interface EnrichedRecord extends FinancialRecord {
  fq: number;
  fa: number;
  volatility: number;
  category: Category;
  tooltipText: string;
}

export const RankingList: React.FC<RankingListProps> = ({ data, historicalData = [], isDarkMode, comparisonLabel, onSendMessage }) => {
  const [categoryFilter, setCategoryFilter] = useState<Category | 'TODOS'>('TODOS');

  const enrichedData = useMemo(() => {
    return data.map(item => {
      // Calculate metrics based on a 6-month window up to the current item's date
      const ugHistory = historicalData
        .filter(d => d.ug === item.ug && d.group === item.group && d.date <= item.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-7); // Last 6 transitions (7 points)

      let fq = 0;
      let fa = 0;
      let volatility = 0;

      if (ugHistory.length > 1) {
        let increases = 0;
        let decreases = 0;
        const variations: number[] = [];

        for (let i = 1; i < ugHistory.length; i++) {
          const prev = ugHistory[i - 1].difference;
          const curr = ugHistory[i].difference;
          const diff = curr - prev;
          
          if (diff > 0) increases++;
          if (diff < 0) decreases++;
          variations.push(diff);
        }

        const totalTransitions = ugHistory.length - 1;
        fa = (increases / totalTransitions) * 100;
        fq = (decreases / totalTransitions) * 100;

        const mean = variations.reduce((sum, val) => sum + val, 0) / variations.length;
        const variance = variations.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / variations.length;
        volatility = Math.sqrt(variance);
      }

      const delta = item.delta ?? 0;
      let category: Category = 'NEUTRO';
      let tooltipText = '';

      // Threshold for "Continuous" lowered to 60% for better sensitivity
      const CONTINUOUS_THRESHOLD = 60;

      if (delta < -100) {
        if (fq >= CONTINUOUS_THRESHOLD) {
          category = 'REDUCAO_CONTINUA';
          tooltipText = `A unidade reduziu o saldo na maioria dos meses recentes, demonstrando trabalho de saneamento constante (Quedas em ${fq.toFixed(0)}% da janela de 6 meses).`;
        } else {
          category = 'REDUCAO_PONTUAL';
          tooltipText = `A redução foi expressiva no período, porém sem constância histórica recente (Quedas em apenas ${fq.toFixed(0)}% da janela de 6 meses).`;
        }
      } else if (delta > 100) {
        if (fa >= CONTINUOUS_THRESHOLD) {
          category = 'AUMENTO_CONTINUO';
          tooltipText = `O problema está crescendo de forma persistente mês a mês (Aumentos em ${fa.toFixed(0)}% da janela de 6 meses).`;
        } else if (fa < 50 || (volatility > 100000 && item.difference < 50000)) {
          category = 'OSCILACAO_ATIPICA';
          tooltipText = `Aumento súbito que não condiz com o histórico ou alta instabilidade operacional (Aumentos em ${fa.toFixed(0)}% da janela de 6 meses).`;
        } else {
          category = 'AUMENTO_CONTINUO';
          tooltipText = `O problema apresentou crescimento frequente (Aumentos em ${fa.toFixed(0)}% da janela de 6 meses).`;
        }
      }

      return { ...item, fq, fa, volatility, category, tooltipText } as EnrichedRecord;
    });
  }, [data, historicalData]);

  const filteredData = useMemo(() => {
    if (categoryFilter === 'TODOS') return enrichedData;
    return enrichedData.filter(d => d.category === categoryFilter);
  }, [enrichedData, categoryFilter]);

  const worsened = filteredData
    .filter(d => (d.delta ?? 0) > 100)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 50);

  const improved = filteredData
    .filter(d => (d.delta ?? 0) < -100)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, 50);

  const getGroupBadgeColor = (group: string) => {
    if (group === AccountGroup.BMP) 
      return isDarkMode 
        ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' 
        : 'bg-orange-50 text-orange-600 border-orange-200';
    if (group === AccountGroup.CONSUMO) 
      return isDarkMode 
        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
        : 'bg-blue-50 text-blue-600 border-blue-200';
    if (group === AccountGroup.INTANGIVEL) 
      return isDarkMode 
        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
        : 'bg-green-50 text-green-600 border-green-200';
    
    return isDarkMode 
      ? 'bg-slate-700/50 text-slate-400 border-slate-600/30' 
      : 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const getCategoryConfig = (category: Category) => {
    switch (category) {
      case 'REDUCAO_CONTINUA':
        return { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', icon: ArrowDownRight, label: 'Redução Contínua' };
      case 'REDUCAO_PONTUAL':
        return { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', icon: ArrowDown, label: 'Redução Pontual' };
      case 'AUMENTO_CONTINUO':
        return { color: 'bg-red-500/10 text-red-500 border-red-500/30', icon: ArrowUpRight, label: 'Aumento Contínuo' };
      case 'OSCILACAO_ATIPICA':
        return { color: 'bg-orange-500/10 text-orange-500 border-orange-500/30', icon: Activity, label: 'Oscilação Atípica' };
      default:
        return { color: 'bg-slate-500/10 text-slate-500 border-slate-500/30', icon: ArrowRight, label: 'Neutro' };
    }
  };

  const renderCard = (item: EnrichedRecord, rank: number, type: 'worse' | 'better') => {
    const isWorse = type === 'worse';
    const catConfig = getCategoryConfig(item.category);
    const Icon = catConfig.icon;
    
    const prevVal = item.previousDifference ?? (item.difference - (item.delta || 0));
    const currVal = item.difference;
    const deltaVal = Math.abs(item.delta || 0);

    const groupLabel = item.group === AccountGroup.CONSUMO ? 'CONSUMO' : item.group === AccountGroup.BMP ? 'BMP' : 'INTANGÍVEL';

    return (
      <div 
        key={item.id} 
        className={`relative p-3 rounded-xl border backdrop-blur-md transition-all group mb-2
          ${isWorse 
            ? isDarkMode ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10' : 'bg-red-50/30 border-red-100 hover:bg-red-50/50' 
            : isDarkMode ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10' : 'bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/50'
          }`}
      >
        {/* Rank Badge */}
        <div className={`absolute -left-1 top-3 w-5 h-5 flex items-center justify-center text-[9px] font-bold rounded shadow-lg z-10
          ${isWorse ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {rank}
        </div>

        <div className="pl-5 flex flex-col gap-1">
          {/* Header: UG + Category Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <h4 className={`font-bold text-sm truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                {item.ug}
              </h4>
              
              <div className="group/tooltip relative flex items-center">
                <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider whitespace-nowrap cursor-help ${catConfig.color}`}>
                  {catConfig.label}
                </span>
                {/* Tooltip */}
                <div className={`absolute bottom-full left-0 mb-2 w-64 p-2 rounded shadow-xl text-[10px] opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-20
                  ${isDarkMode ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200'}`}>
                  {item.tooltipText}
                </div>
              </div>
            </div>

            {onSendMessage && (
              <button 
                onClick={(e) => { e.stopPropagation(); onSendMessage(item, 'RANKING'); }}
                className={`p-1 rounded transition-colors border
                  ${isDarkMode 
                    ? 'bg-slate-800/50 text-slate-400 hover:text-white border-slate-700' 
                    : 'bg-white text-slate-500 hover:text-slate-700 border-slate-200'
                  }`}
              >
                <MessageSquareText className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Subheader: Cod + Group */}
          <div className={`text-[10px] flex items-center gap-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            <span>{item.cod}</span>
            <span className="opacity-50">•</span>
            <span>{groupLabel}</span>
          </div>

          {/* Values Row (Footer) */}
          <div className={`pt-2 mt-1 border-t flex items-center justify-between ${isDarkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
            <div className="flex items-center gap-4">
              {/* Previous Block */}
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Anterior</span>
                <span className={`text-[11px] font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  <CurrencyDisplay value={prevVal} />
                </span>
              </div>

              {/* Divisor Central (Arrow) */}
              <div className={`flex items-center justify-center ${isWorse ? 'text-red-500' : 'text-emerald-500'}`}>
                <Icon className="w-4 h-4" />
              </div>

              {/* Current Block */}
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Atual</span>
                <span className={`text-[11px] font-mono font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  <CurrencyDisplay value={currVal} />
                </span>
              </div>
            </div>

            {/* Variation Block (Delta) */}
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Variação</span>
              <span className={`text-[11px] font-mono font-bold ${isWorse ? 'text-red-500' : 'text-emerald-500'}`}>
                {isWorse ? '+' : '-'}
                <CurrencyDisplay value={deltaVal} />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full gap-4 overflow-hidden">
       {/* Header Controls */}
       <div className="flex items-center justify-between px-2">
         <div className="flex items-center gap-2">
           <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Filtro por Tipo:</span>
           <select
             value={categoryFilter}
             onChange={(e) => setCategoryFilter(e.target.value as Category | 'TODOS')}
             className={`appearance-none pl-3 pr-8 py-1 rounded text-xs font-medium border outline-none cursor-pointer focus:ring-2 focus:ring-blue-500
               ${isDarkMode 
                 ? 'bg-slate-900 border-slate-600 text-slate-300' 
                 : 'bg-slate-50 border-slate-300 text-slate-700'
               }`}
           >
             <option value="TODOS">Todas as Categorias</option>
             <option value="AUMENTO_CONTINUO">Aumento Contínuo</option>
             <option value="OSCILACAO_ATIPICA">Oscilação Atípica</option>
             <option value="REDUCAO_CONTINUA">Redução Contínua</option>
             <option value="REDUCAO_PONTUAL">Redução Pontual</option>
           </select>
         </div>
       </div>

       <div className="flex flex-col lg:flex-row h-full w-full gap-4 overflow-hidden">
         {/* Worsened Column */}
         <div className={`flex-1 flex flex-col overflow-hidden rounded-2xl p-4 border backdrop-blur-sm shadow-xl
           ${isDarkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col gap-1 mb-3 pb-2 border-b border-red-500/20">
               <div className="flex items-center gap-2">
                   <TrendingUp className="w-4 h-4 text-red-500" />
                   <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>Piora no Período</h3>
               </div>
               {comparisonLabel && (
                   <span className={`text-[10px] pl-6 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{comparisonLabel}</span>
               )}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
               {worsened.length === 0 ? <div className={`text-center py-4 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sem registros.</div> : worsened.map((item, idx) => renderCard(item, idx + 1, 'worse'))}
            </div>
         </div>

         {/* Improved Column */}
         <div className={`flex-1 flex flex-col overflow-hidden rounded-2xl p-4 border backdrop-blur-sm shadow-xl
           ${isDarkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col gap-1 mb-3 pb-2 border-b border-emerald-500/20">
               <div className="flex items-center gap-2">
                   <TrendingDown className="w-4 h-4 text-emerald-500" />
                   <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Melhoria no Período</h3>
               </div>
               {comparisonLabel && (
                   <span className={`text-[10px] pl-6 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{comparisonLabel}</span>
               )}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {improved.length === 0 ? <div className={`text-center py-4 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sem registros.</div> : improved.map((item, idx) => renderCard(item, idx + 1, 'better'))}
            </div>
         </div>
       </div>
    </div>
  );
};
