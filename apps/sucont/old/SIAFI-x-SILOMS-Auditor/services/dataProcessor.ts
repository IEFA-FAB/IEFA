
import { FinancialRecord, RawInputRow, AccountGroup, TimeFilter, ImpactLevel, ProbabilityLevel, RiskLevel } from '../types';
import { UG_MAPPING } from '../ugMapping';

// ... (parseDateString, toShortDate, normalizeData, recalculateDeltas remain same)

// --- RISK CLASSIFICATION ---
export const applyRiskClassification = (data: FinancialRecord[]): FinancialRecord[] => {
  if (!data || data.length === 0) return [];

  // 1. Calculate stats per UG
  const ugStats: Record<string, { months: Set<string>, maxDiff: number, totalDiff: number }> = {};
  
  data.forEach(record => {
    if (!ugStats[record.ug]) {
      ugStats[record.ug] = { months: new Set(), maxDiff: 0, totalDiff: 0 };
    }
    if (record.difference > 0) {
      ugStats[record.ug].months.add(record.date);
    }
    ugStats[record.ug].maxDiff = Math.max(ugStats[record.ug].maxDiff, record.difference);
    ugStats[record.ug].totalDiff += record.difference;
  });

  // 2. Calculate a numerical score for each UG
  // Score = (Impact Factor) * (Probability Factor)
  const allMaxDiffs = Object.values(ugStats).map(s => s.maxDiff);
  const absoluteMaxDiff = Math.max(...allMaxDiffs, 1);

  const ugScores = Object.entries(ugStats).map(([ug, stats]) => {
    // Impact: 0-100 based on max difference relative to absolute max
    const impactScore = (stats.maxDiff / absoluteMaxDiff) * 100;
    // Probability: 0-100 based on months with divergence (max 12)
    const probabilityScore = (stats.months.size / 12) * 100;
    
    // Final Score: Weighted combination (70% impact, 30% probability)
    const finalScore = (impactScore * 0.7) + (probabilityScore * 0.3);
    
    return { ug, score: finalScore, maxDiff: stats.maxDiff, months: stats.months.size };
  });

  // 3. Sort scores to find percentiles for even distribution
  const sortedScores = [...ugScores].map(s => s.score).sort((a, b) => a - b);
  
  const getRiskLevelFromScore = (score: number): RiskLevel => {
    if (sortedScores.length === 0) return RiskLevel.BAIXO;
    const index = sortedScores.findIndex(s => s >= score);
    const percentile = (index / sortedScores.length) * 100;
    
    if (percentile <= 25) return RiskLevel.BAIXO;
    if (percentile <= 50) return RiskLevel.MEDIO;
    if (percentile <= 75) return RiskLevel.ALTO;
    return RiskLevel.CRITICO;
  };

  // Impact and Probability levels for metadata
  const sortedMaxDiffs = [...allMaxDiffs].sort((a, b) => a - b);
  const getImpactLevel = (val: number): ImpactLevel => {
    const index = sortedMaxDiffs.findIndex(v => v >= val);
    const p = (index / sortedMaxDiffs.length) * 100;
    if (p <= 20) return ImpactLevel.INSIGNIFICANTE;
    if (p <= 40) return ImpactLevel.MENOR;
    if (p <= 60) return ImpactLevel.MODERADO;
    if (p <= 80) return ImpactLevel.MAIOR;
    return ImpactLevel.CATASTROFICO;
  };

  const getProbabilityLevel = (months: number): ProbabilityLevel => {
    if (months <= 1) return ProbabilityLevel.RARO;
    if (months <= 3) return ProbabilityLevel.OCASIONAL;
    if (months <= 6) return ProbabilityLevel.RECORRENTE;
    if (months <= 9) return ProbabilityLevel.PERSISTENTE;
    return ProbabilityLevel.CRONICO;
  };

  const ugRiskMap: Record<string, RiskLevel> = {};
  ugScores.forEach(s => {
    ugRiskMap[s.ug] = getRiskLevelFromScore(s.score);
  });

  return data.map(record => {
    const stats = ugStats[record.ug];
    return {
      ...record,
      impactLevel: getImpactLevel(stats.maxDiff),
      probabilityLevel: getProbabilityLevel(stats.months.size),
      riskLevel: ugRiskMap[record.ug],
      monthsWithDivergence: stats.months.size
    };
  });
};

// Helper to safely parse dates in format "MONTH/YEAR", "Mon/Year", "Mon-Year", "YYYY-MM", or ISO strings
export const parseDateString = (dateStr: string): { month: number, year: number, timestamp: number, sortableDate: string } => {
  try {
    if (!dateStr) return { month: 0, year: 0, timestamp: 0, sortableDate: '0000-00' };

    // Handle ISO strings (from Date objects)
    if (dateStr.includes('T') && dateStr.includes('Z')) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        const y = d.getFullYear();
        const monthNum = (m + 1).toString().padStart(2, '0');
        return {
          month: m,
          year: y,
          timestamp: d.getTime(),
          sortableDate: `${y}-${monthNum}`
        };
      }
    }

    // Handle YYYY-MM format directly
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      const [y, m] = dateStr.split('-').map(Number);
      return {
        month: m - 1,
        year: y,
        timestamp: new Date(y, m - 1, 1).getTime(),
        sortableDate: dateStr
      };
    }

    // Handle Excel serial dates (if they come as strings)
    if (/^\d{5}$/.test(dateStr)) {
      const serial = parseInt(dateStr);
      const d = new Date((serial - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        const y = d.getFullYear();
        const monthNum = (m + 1).toString().padStart(2, '0');
        return {
          month: m,
          year: y,
          timestamp: d.getTime(),
          sortableDate: `${y}-${monthNum}`
        };
      }
    }

    // Replace dashes with slashes to handle "NOV-25" style
    const normalizedStr = dateStr.replace(/-/g, '/');
    const parts = normalizedStr.split('/');
    
    if (parts.length < 2) {
      // Try parsing as a full date string
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        const y = d.getFullYear();
        const monthNum = (m + 1).toString().padStart(2, '0');
        return {
          month: m,
          year: y,
          timestamp: d.getTime(),
          sortableDate: `${y}-${monthNum}`
        };
      }
      return { month: 0, year: 0, timestamp: 0, sortableDate: '0000-00' };
    }

    let monthStr = '';
    let yearStr = '';

    // Check if first part is a 4-digit year (YYYY/MM)
    if (/^\d{4}$/.test(parts[0])) {
      yearStr = parts[0];
      monthStr = parts[1];
    } else {
      monthStr = parts[0];
      yearStr = parts[1];
    }

    const months: Record<string, number> = {
      'JANEIRO': 0, 'FEVEREIRO': 1, 'MARÇO': 2, 'MARCO': 2, 'ABRIL': 3, 'MAIO': 4, 'JUNHO': 5,
      'JULHO': 6, 'AGOSTO': 7, 'SETEMBRO': 8, 'OUTUBRO': 9, 'NOVEMBRO': 10, 'DEZEMBRO': 11,
      'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5,
      'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11,
      'DEZ.': 11, 'NOV.': 10, 'OUT.': 9, 'SET.': 8, 'AGO.': 7, 'JUL.': 6,
      'JUN.': 5, 'MAI.': 4, 'ABR.': 3, 'MAR.': 2, 'FEV.': 1, 'JAN.': 0
    };

    const cleanMonth = monthStr.trim().toUpperCase();
    let month = 0;
    
    if (months[cleanMonth] !== undefined) {
      month = months[cleanMonth];
    } else {
      // Try parsing as number
      const mNum = parseInt(cleanMonth);
      if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) {
        month = mNum - 1;
      }
    }
    
    let year = parseInt(yearStr) || new Date().getFullYear();
    
    // FIX: Handle 2-digit years (e.g., "25" -> 2025)
    if (year < 100) {
      year += 2000;
    }
    
    // Normalization to YYYY-MM
    const monthNum = (month + 1).toString().padStart(2, '0');
    const sortableDate = `${year}-${monthNum}`;

    return {
      month,
      year,
      timestamp: new Date(year, month, 1).getTime(),
      sortableDate
    };
  } catch (e) {
    console.error("Date Parse Error", e);
    return { month: 0, year: 0, timestamp: 0, sortableDate: '0000-00' };
  }
};

// Helper to convert long date strings (JANEIRO/2025) to short (JAN/2025)
export const toShortDate = (dateStr: string): string => {
    const { month, year } = parseDateString(dateStr);
    const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const shortYear = year.toString().slice(-2);
    return `${monthNames[month]}/${shortYear}`;
};

// --- DATA NORMALIZATION ---
export const normalizeData = (rawRows: RawInputRow[]): FinancialRecord[] => {
  const normalized: FinancialRecord[] = [];
  if (!rawRows || !Array.isArray(rawRows)) return [];

  rawRows.forEach((row, index) => {
    // Defensive check
    if (!row) return;

    const { month, year, sortableDate } = parseDateString(row.data);
    // CRITICAL FIX: Trim COD and UG to ensure historical matching works even with trailing spaces
    const safeCod = row.cod ? String(row.cod).trim() : '000000';
    const safeUg = row.ug ? String(row.ug).trim() : 'DESCONHECIDO';

    // Helper to process a group safely
    const processGroup = (groupEnum: AccountGroup, siafi: number, siloms: number, explicitDiff: number) => {
      // Logic: Use explicit diff if present (and logically valid), else calc
      const finalDiff = explicitDiff !== 0 ? Math.abs(explicitDiff) : Math.abs(siafi - siloms);
      
      let preponderance: 'SIAFI' | 'SILOMS' | 'EQUAL' = 'EQUAL';
      if (siafi > siloms) preponderance = 'SIAFI';
      if (siloms > siafi) preponderance = 'SILOMS';

      // Unique ID Generator: SAFE against duplicates
      // ID = COD + GROUP + TIMESTAMP + INDEX (to ensure uniqueness if rows duplicate)
      const uniqueId = `${safeCod}-${groupEnum}-${year}${month}-${index}`;

      normalized.push({
        id: uniqueId,
        date: sortableDate, // Normalized to YYYY-MM as requested
        monthIndex: month,
        year: year,
        sortableDate,
        cod: safeCod,
        ug: safeUg,
        orgaoSuperior: UG_MAPPING[safeCod]?.orgaoSuperior || 'N/A',
        ods: UG_MAPPING[safeCod]?.ods || 'N/A',
        group: groupEnum,
        siafiValue: siafi || 0,
        silomsValue: siloms || 0,
        difference: finalDiff || 0,
        preponderance,
        // Init optional fields
        previousDifference: 0,
        previousSiafiValue: 0,
        previousSilomsValue: 0,
        previousDate: '',
        delta: 0
      });
    };

    // STRICT GROUP MAPPING
    processGroup(AccountGroup.CONSUMO, row.g1_siafi, row.g1_siloms, row.g1_diff);
    processGroup(AccountGroup.BMP, row.g2_siafi, row.g2_siloms, row.g2_diff);
    processGroup(AccountGroup.INTANGIVEL, row.g3_siafi, row.g3_siloms, row.g3_diff);
  });

  // CHRONOLOGICAL SORTING (Mandatory)
  return normalized.sort((a, b) => a.sortableDate.localeCompare(b.sortableDate));
};

// --- DELTA RECALCULATION BASED ON TIME FILTER ---
export const recalculateDeltas = (data: FinancialRecord[], timeFilter: TimeFilter): FinancialRecord[] => {
  // 1. Determine the gap in months based on filter
  let monthGap = 1; // Default MENSAL
  if (timeFilter === 'TRIMESTRAL') monthGap = 3;
  if (timeFilter === 'SEMESTRAL') monthGap = 6;
  if (timeFilter === 'ANUAL') monthGap = 12;

  // Helper for short month names
  const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  return data.map(record => {
    // Calculate target previous date
    let targetMonth = record.monthIndex - monthGap;
    let targetYear = record.year;
    
    // Handle year rollover (works for any gap size, including 12)
    // Example: Nov 2025 (Index 10). Gap 12. targetMonth = -2. 
    // Loop: -2 < 0 -> targetMonth = 10 (Nov), targetYear = 2024.
    while (targetMonth < 0) {
      targetMonth += 12;
      targetYear -= 1;
    }

    // Find the comparison record (Previous period)
    const prevRecord = data.find(r => 
      r.cod === record.cod && 
      r.group === record.group && 
      r.monthIndex === targetMonth && 
      r.year === targetYear
    );

    const prevDiff = prevRecord ? prevRecord.difference : 0;
    const prevSiafi = prevRecord ? prevRecord.siafiValue : 0;
    const prevSiloms = prevRecord ? prevRecord.silomsValue : 0;
    
    // Create a meaningful label for "Previous Date"
    let prevDate = 'Sem histórico';
    
    // Format the target date explicitly (e.g., SET/24)
    const shortYear = targetYear.toString().slice(-2);
    const specificPrevLabel = `${monthNames[targetMonth]}/${shortYear}`;

    if (prevRecord) {
      prevDate = specificPrevLabel; // Force consistent formatting
    } else {
      prevDate = specificPrevLabel;
    }
    
    // Delta = Current - Previous
    const delta = record.difference - prevDiff;

    return {
      ...record,
      previousDifference: prevDiff,
      previousSiafiValue: prevSiafi,
      previousSilomsValue: prevSiloms,
      previousDate: prevDate,
      delta
    };
  });
};

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(value || 0);
};

export const formatCompactNumber = (value: number) => {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000) {
    return (value / 1_000_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0Bi';
  }
  if (absValue >= 1_000_000) {
    return (value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0Mi';
  }
  if (absValue >= 1_000) {
    return (value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0mil';
  }
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatFinancial = formatCurrency;

// --- MESSAGE GENERATORS ---

const getFriendlyGroupName = (group: string) => {
    const groupMap: Record<string, string> = {
      [AccountGroup.CONSUMO]: "BENS DE CONSUMO",
      [AccountGroup.BMP]: "BENS MÓVEIS PERMANENTES",
      [AccountGroup.INTANGIVEL]: "BENS INTANGÍVEIS"
    };
    return groupMap[group] || "CONTA EM ANÁLISE";
};

const getAdministrationAgents = (group: string) => {
    if (group === AccountGroup.CONSUMO) {
        return "Dirigente Máximo, Ordenador de Despesas, Agente de Controle Interno, Gestor de Almoxarifado e demais gestores envolvidos.";
    }
    // BMP and INTANGIVEL use Gestor de Patrimônio
    return "Dirigente Máximo, Ordenador de Despesas, Agente de Controle Interno, Gestor de Patrimônio e demais gestores envolvidos.";
};

// 1. RANKING MESSAGE (Snapshot Comparison based on Filter)
const generateRankingMessage = (record: FinancialRecord, msgNumber: string, deadline: string, history: FinancialRecord[] = [], timeFilter: TimeFilter = 'MENSAL'): string => {
    const today = new Date();
    const dateStr = today.toLocaleDateString('pt-BR');
    const timeStr = today.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    const groupText = getFriendlyGroupName(record.group);
    const adminAgents = getAdministrationAgents(record.group);
    
    const scopeMap: Record<TimeFilter, string> = {
        'MENSAL': 'mensal',
        'TRIMESTRAL': 'trimestral',
        'SEMESTRAL': 'semestral',
        'ANUAL': 'anual'
    };
    const scopeText = scopeMap[timeFilter] || 'mensal';
    const scopeUpper = scopeText.toUpperCase();

    const prevLabel = record.previousDate || 'ANTERIOR';
    const currLabel = toShortDate(record.date);
    const increase = record.delta || 0;
    const variationLabel = increase > 0 ? "AUMENTO NO PERÍODO" : (increase < 0 ? "DIMINUIÇÃO NO PERÍODO" : "VARIAÇÃO NO PERÍODO");
    
    const prevDiff = record.previousDifference || 0;
    const currDiff = record.difference;
    const pctVar = prevDiff !== 0 ? ((currDiff - prevDiff) / prevDiff) * 100 : (currDiff > 0 ? 100 : 0);
    const pctStr = `${pctVar > 0 ? '+' : ''}${pctVar.toFixed(2)}%`;

    const fmt = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, ' ');
    const padDate = (d: string) => d.padEnd(10, ' ');
    const fmtPct = (p: string) => p.padStart(30, ' ');

    const headerRow = "DATA".padEnd(10) + " | " + "SIAFI".padStart(15) + " | " + "SILOMS".padStart(15) + " | " + "DIFERENÇA".padStart(15) + " | " + "VAR. EM RELAÇÃO AO MÊS ANTERIOR".padStart(30);
    
    // Sort history and filter for the relevant interval
    const sortedHistory = [...history].sort((a, b) => 
        (a.year * 100 + a.monthIndex) - (b.year * 100 + b.monthIndex)
    );

    const prevDateInfo = parseDateString(record.previousDate);
    const currDateInfo = parseDateString(record.date);
    
    const relevantHistory = sortedHistory.filter(h => {
        const hTime = h.year * 100 + h.monthIndex;
        const startTime = prevDateInfo.year * 100 + prevDateInfo.month;
        const endTime = currDateInfo.year * 100 + currDateInfo.month;
        return hTime >= startTime && hTime <= endTime;
    });

    let table = "";
    if (relevantHistory.length > 1) {
        const rows = relevantHistory.map((h, idx) => {
            const d = toShortDate(h.date);
            const s = fmt(h.siafiValue);
            const m = fmt(h.silomsValue);
            const diff = fmt(h.difference);
            
            let vStr = '-';
            if (idx > 0) {
                const prevVal = relevantHistory[idx - 1].difference;
                const currVal = h.difference;
                const v = prevVal !== 0 ? ((currVal - prevVal) / prevVal) * 100 : (currVal > 0 ? 100 : 0);
                vStr = `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
            }
            const v = fmtPct(vStr);
            return `${padDate(d)} | ${s} | ${m} | ${diff} | ${v}`;
        });
        table = `${headerRow}\n${rows.join('\n')}`;
    } else {
        // Fallback to simple two-row table if history is missing or insufficient
        const prevRow   = `${padDate(prevLabel)} | ${fmt(record.previousSiafiValue || 0)} | ${fmt(record.previousSilomsValue || 0)} | ${fmt(record.previousDifference || 0)} | ${fmtPct('-')}`;
        const currRow   = `${padDate(currLabel)} | ${fmt(record.siafiValue)} | ${fmt(record.silomsValue)} | ${fmt(record.difference)} | ${fmtPct(pctStr)}`;
        table = `${headerRow}\n${prevRow}\n${currRow}`;
    }

    if (increase < 0) {
        // CONGRATULATIONS MESSAGE (Improvement)
        return `${today.getFullYear()}/xxxxxxx Redução de Divergência - ${record.ug} - ${currLabel}

Remetente: xxxxx - SETORIAL DE CONTABILIDADE
Enviado em: ${dateStr} às ${timeStr}
UG destinatárias: ${record.cod} ${record.ug}
Mensagem:

AG DA ADMINISTRAÇÃO: ${adminAgents}

MSG NR ${msgNumber || 'XXX'}/SUCONT-4/${today.toLocaleDateString('pt-BR').replace(/\//g, '')}.

Informo que essa Unidade Gestora apresentou redução significativa na divergência de saldos entre os sistemas SIAFI e SILOMS nas contas de ${groupText.toLowerCase()} no escopo ${scopeText}, conforme demonstrado abaixo:

----------------------------------------------------------------------------------------------------------------------------------
EVOLUÇÃO ${scopeUpper} DO SALDO E DIVERGÊNCIA (SIAFI X SILOMS)
----------------------------------------------------------------------------------------------------------------------------------
${table}
----------------------------------------------------------------------------------------------------------------------------------
REDUÇÃO NO PERÍODO   :   ${formatCurrency(Math.abs(increase))} (${pctStr})
----------------------------------------------------------------------------------------------------------------------------------

Diante do exposto, esta Setorial parabeniza essa Unidade Gestora pelos esforços empreendidos na conciliação dos saldos, os quais resultaram na redução expressiva da divergência identificada entre os sistemas.

Ressalta-se a importância da continuidade das ações de análise e regularização, com vistas à plena equalização dos saldos registrados no SIAFI e no SILOMS.

Por fim, coloco à disposição a Divisão de Acompanhamento Patrimonial para interações julgadas oportunas sobre este assunto.

DIREF/SUCONT/SUCONT-4`;
    }

    // STANDARD MESSAGE (Worsened or No Change)
    const preponderantSystem = record.siafiValue > record.silomsValue ? "SIAFI" : (record.silomsValue > record.siafiValue ? "SILOMS" : "EQUILIBRADO");

    return `${today.getFullYear()}/xxxxxxx Incompatibilidade de saldos nas contas de ${groupText.toLowerCase()} - ${currLabel}

Remetente: xxxxx - SETORIAL DE CONTABILIDADE
Enviado em: ${dateStr} às ${timeStr}
UG destinatárias: ${record.cod} ${record.ug}
Mensagem:

AG DA ADMINISTRAÇÃO: ${adminAgents}

MSG NR ${msgNumber || 'XXX'}/SUCONT-4/${today.toLocaleDateString('pt-BR').replace(/\//g, '')}.

Conforme verificação realizada por esta Setorial na data de hoje, informo que essa UG está com divergência significativa de saldos entre os sistemas SIAFI e SILOMS nas contas de ${groupText.toLowerCase()} no escopo ${scopeText}, conforme detalhado abaixo:

----------------------------------------------------------------------------------------------------------------------------------
EVOLUÇÃO ${scopeUpper} DO SALDO E DIVERGÊNCIA (SIAFI X SILOMS)
----------------------------------------------------------------------------------------------------------------------------------
${table}
----------------------------------------------------------------------------------------------------------------------------------
${variationLabel.padEnd(21)}:   ${formatCurrency(increase)} (${pctStr})
----------------------------------------------------------------------------------------------------------------------------------

SISTEMA PREPONDERANTE (MAIOR SALDO): ${preponderantSystem}

Recomendações:

- Proceder com a conciliação analítica entre os registros contábeis no SIAFI (Notas de Lançamento - NL) e os registros correspondentes no SILOMS (ex.: Termos de Recebimento e Exame de Material - TREM, ou documentos equivalentes), conforme a natureza da conta analisada (BMP, Consumo ou Intangível).

- Instaurar força-tarefa integrada entre os setores de Finanças e de Patrimônio (ou área equivalente), com vistas à identificação de registros contabilizados no SIAFI sem a devida correspondência no SILOMS, bem como eventuais registros pendentes de incorporação, baixa ou reclassificação.

- Priorizar a identificação da causa raiz das divergências, evitando a realização de ajustes meramente corretivos sem a devida rastreabilidade e suporte documental.

- Formalizar resposta a esta Diretoria por meio do Sistema de Atendimento ao Usuário (SAU), até ${deadline || '[PREENCHER]'}, contendo obrigatoriamente:
   - Planilha de conciliação detalhada;
   - Justificativa técnica das divergências remanescentes;

- Estabelecer rotina mensal de conferência prévia ao fechamento contábil, contemplando a validação cruzada entre SIAFI e SILOMS, de forma a prevenir o acúmulo de inconsistências em períodos subsequentes.

Por fim, cabe alertar que a persistência de inconsistências contábeis poderá ensejar apuração de responsabilidade junto aos órgãos de controle, em especial o Tribunal de Contas da União (TCU), à luz das normas vigentes, incluindo o cumprimento dos Anexos aplicáveis (Anexo 13 A - BMP, Anexo 13 B - Intangível e Anexo 13 C - Consumo).

Fundamentação Normativa:
1. Manual G (RADA-e), Módulo 7.
2. Manual D (RADA-e), Item 8.

Esta Diretoria reconhece o esforço da gestão na manutenção da conformidade contábil e permanece à disposição para o suporte técnico necessário.

DIREF/SUCONT/SUCONT-4`;
};

// 2. HEATMAP MESSAGE (Historical Trend Analysis - "Jump" from Lowest Point Logic)
const generateHeatmapMessage = (record: FinancialRecord, msgNumber: string, deadline: string, history: FinancialRecord[]): string => {
    const today = new Date();
    const dateStr = today.toLocaleDateString('pt-BR');
    const timeStr = today.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    const groupText = getFriendlyGroupName(record.group);
    const adminAgents = getAdministrationAgents(record.group);
    const separator = "--------------------------------------------------";

    // 1. Sort history chronologically
    const sortedHistory = [...history].sort((a, b) => 
        (a.year * 100 + a.monthIndex) - (b.year * 100 + b.monthIndex)
    );
    
    // 2. Filter to only include records up to the current one
    const relevantHistory = sortedHistory.filter(h => (h.year * 100 + h.monthIndex) <= (record.year * 100 + record.monthIndex));

    let analysisBlock = "";
    
    // 3. ANALYSIS LOGIC: Find the ABSOLUTE MINIMUM (Baseline) and then trace evolution
    if (relevantHistory.length >= 2) {
        
        // A. Find the index of the absolute minimum value in the relevant history
        let minIndex = 0;
        let minValue = Number.MAX_VALUE;

        for (let i = 0; i < relevantHistory.length; i++) {
            if (relevantHistory[i].difference < minValue) {
                minValue = relevantHistory[i].difference;
                minIndex = i;
            }
        }

        const minRecord = relevantHistory[minIndex];

        // B. Define the "Jump" record (the month immediately following the minimum)
        // If min is the last record, there is no jump yet (it's at its lowest).
        const jumpIndex = Math.min(minIndex + 1, relevantHistory.length - 1);
        const jumpRecord = relevantHistory[jumpIndex];

        // C. Formatting
        const baseVal = formatCurrency(minRecord.difference);
        const baseDate = toShortDate(minRecord.date);
        const jumpVal = formatCurrency(jumpRecord.difference);
        const jumpDate = toShortDate(jumpRecord.date);
        const currentVal = formatCurrency(record.difference);
        const currentDate = toShortDate(record.date);

        // D. Construct Message
        if (minIndex === relevantHistory.length - 1) {
             // Current IS the lowest.
             analysisBlock = `
PONTO DE ATENÇÃO:
O valor atual de ${currentVal} em ${currentDate} representa o menor patamar identificado no histórico analisado. Acompanha-se a manutenção da tendência de queda.`;
        } else {
             // Typical Case: Was low, then jumped, now high.
             // "Evoluiu de 17 (Jun) para 54 (Jul) e agora está em 67 (Nov)"
             analysisBlock = `
PONTO DE ATENÇÃO:
Identificou-se que a divergência evoluiu de ${baseVal} em ${baseDate} (menor valor do período), passando para ${jumpVal} em ${jumpDate}, e chegando ao saldo atual de ${currentVal} em ${currentDate}.

Ressalta-se que, após ${baseDate}, os valores não retornaram ao patamar mínimo identificado, indicando persistência da distorção.`;
        }

    } else {
        // Fallback for insufficient history
        const singleVal = formatCurrency(record.difference);
        const singleDate = toShortDate(record.date);
        analysisBlock = `
PONTO DE ATENÇÃO:
O saldo atual de divergência é de ${singleVal} em ${singleDate}. Solicita-se análise dos lançamentos para identificar a causa raiz.`;
    }

    const evolutionHeader = "DATA".padEnd(10) + " | " + "SIAFI".padStart(15) + " | " + "SILOMS".padStart(15) + " | " + "DIFERENÇA".padStart(15) + " | " + "VAR. %".padStart(10);
    const evolutionTable = `
DETALHAMENTO MÊS A MÊS:
${evolutionHeader}
${sortedHistory.map((h, idx) => {
  const d = toShortDate(h.date); 
  const s = h.siafiValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, ' ');
  const m = h.silomsValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, ' ');
  const diff = h.difference.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, ' ');
  
  let vStr = '-';
  if (idx > 0) {
    const prev = sortedHistory[idx - 1].difference;
    const curr = h.difference;
    const v = prev !== 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);
    vStr = `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
  }
  const v = vStr.padStart(10, ' ');

  return `${d.padEnd(10)} | ${s} | ${m} | ${diff} | ${v}`;
}).join('\n')}
`;

    return `${today.getFullYear()}/xxxxxxx Regularização Contábil - ${record.ug} - ${groupText}

Remetente: xxxxx - SETORIAL DE CONTABILIDADE
Enviado em: ${dateStr} às ${timeStr}
UG destinatária: ${record.cod} ${record.ug}

AG DA ADMINISTRAÇÃO: ${adminAgents}

MSG NR ${msgNumber || 'XXX'}/SUCONT-4/${today.toLocaleDateString('pt-BR').replace(/\//g, '')}.

Em análise da matriz histórica de diferenças desta UG, identificou-se um comportamento atípico nas contas de ${groupText.toLowerCase()}.

${analysisBlock}

${evolutionTable}

${separator}
SISTEMA PREPONDERANTE (MAIOR SALDO): ${record.preponderance}
${separator}

Conclusão:
Diante do exposto, solicita-se ao gestor responsável que providencie a equalização das diferenças até o dia ${deadline || '[PRAZO]'}, considerando o fechamento mensal. Solicita-se, ainda, que seja encaminhada resposta via SAU, apresentando justificativa fundamentada quanto às diferenças identificadas e cronograma de saneamento.

Esta Diretoria reconhece o trabalho realizado pela gestão da Unidade e coloca à disposição a Divisão de Acompanhamento Patrimonial para interações julgadas oportunas.

DIREF/SUCONT/SUCONT-4`;
};


// --- MAIN EXPORT ---
export const generateMessage = (
    type: 'RANKING' | 'HEATMAP', 
    record: FinancialRecord, 
    msgNumber: string, 
    deadline: string, 
    history: FinancialRecord[] = [],
    timeFilter: TimeFilter = 'MENSAL'
): string => {
    try {
        if (type === 'RANKING') {
            return generateRankingMessage(record, msgNumber, deadline, history, timeFilter);
        } else {
            return generateHeatmapMessage(record, msgNumber, deadline, history);
        }
    } catch (error) {
        console.error("Error generating message:", error);
        return "ERRO AO GERAR MENSAGEM. VERIFIQUE OS DADOS.";
    }
};

export const generateSiafiMessageText = (record: FinancialRecord, msgNumber: string, deadline: string, history?: FinancialRecord[]) => 
    generateHeatmapMessage(record, msgNumber, deadline, history || []);
