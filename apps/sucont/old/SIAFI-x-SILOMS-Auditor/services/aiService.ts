
import { GoogleGenAI } from "@google/genai";
import { FinancialRecord, TimeFilter } from "../types";
import { recalculateDeltas } from "./dataProcessor";

export const generateAIReport = async (data: FinancialRecord[], selectedMonth: string, timeFilter: string) => {
  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  if (!apiKey) {
    return "Erro: Chave de API não configurada. Por favor, adicione a variável de ambiente 'GEMINI_API_KEY' nas configurações do seu painel de hospedagem.";
  }
  const ai = new GoogleGenAI({ apiKey });

  // 1. Prepare data for the prompt - Calculate multiple trend periods
  const currentMonthData = data.filter(d => d.date === selectedMonth);
  
  // Calculate unique UGs (not records)
  const uniqueUGsCount = new Set(currentMonthData.map(d => d.ug)).size;

  // Calculate trends for different periods to provide a comprehensive view
  const dataMensal = recalculateDeltas(data, 'MENSAL').filter(d => d.date === selectedMonth);
  const dataTrimestral = recalculateDeltas(data, 'TRIMESTRAL').filter(d => d.date === selectedMonth);
  const dataSemestral = recalculateDeltas(data, 'SEMESTRAL').filter(d => d.date === selectedMonth);

  const getTopTrends = (trendData: FinancialRecord[], count: number = 5) => {
    const sorted = [...trendData].filter(d => d.delta !== undefined && d.delta !== 0);
    const worsening = sorted.sort((a, b) => (b.delta || 0) - (a.delta || 0)).slice(0, count);
    const improving = sorted.sort((a, b) => (a.delta || 0) - (b.delta || 0)).slice(0, count);
    
    return {
      worsening: worsening.map(d => ({ 
        UG: d.ug, 
        Cod: d.cod, 
        Grupo: d.group, 
        Delta: d.delta, 
        DeltaPct: d.previousDifference !== 0 ? ((d.delta || 0) / d.previousDifference) * 100 : 100,
        Valor: d.difference 
      })),
      improving: improving.map(d => ({ 
        UG: d.ug, 
        Cod: d.cod, 
        Grupo: d.group, 
        Delta: Math.abs(d.delta || 0), 
        DeltaPct: d.previousDifference !== 0 ? (Math.abs(d.delta || 0) / d.previousDifference) * 100 : 100,
        Valor: d.difference 
      }))
    };
  };

  // Detect potential Inter-OM interactions
  const detectInterOM = (trendData: FinancialRecord[]) => {
    const interactions: any[] = [];
    const significantChanges = trendData.filter(d => Math.abs((d.siafiValue - (d.previousSiafiValue || 0))) > 100000);
    
    for (let i = 0; i < significantChanges.length; i++) {
      for (let j = i + 1; j < significantChanges.length; j++) {
        const a = significantChanges[i];
        const b = significantChanges[j];
        
        const deltaSiafiA = a.siafiValue - (a.previousSiafiValue || 0);
        const deltaSiafiB = b.siafiValue - (b.previousSiafiValue || 0);
        
        const deltaSilomsA = a.silomsValue - (a.previousSilomsValue || 0);
        const deltaSilomsB = b.silomsValue - (b.previousSilomsValue || 0);

        // If SIAFI changes are opposite and similar magnitude, and SILOMS didn't change much
        if (Math.abs(deltaSiafiA + deltaSiafiB) < Math.max(Math.abs(deltaSiafiA), Math.abs(deltaSiafiB)) * 0.05 &&
            Math.abs(deltaSilomsA) < 1000 && Math.abs(deltaSilomsB) < 1000) {
          interactions.push({
            UG_A: a.ug,
            UG_B: b.ug,
            Valor: Math.abs(deltaSiafiA),
            Grupo: a.group === b.group ? a.group : 'DIVERSOS'
          });
        }
      }
    }
    return interactions.slice(0, 3); // Limit to top 3
  };

  const trendsMensal = getTopTrends(dataMensal);
  const trendsTrimestral = getTopTrends(dataTrimestral);
  const trendsSemestral = getTopTrends(dataSemestral);
  const interOMInteractions = detectInterOM(dataMensal);

  const totalDiff = currentMonthData.reduce((acc, curr) => acc + curr.difference, 0);
  const totalSiafi = currentMonthData.reduce((acc, curr) => acc + curr.siafiValue, 0);
  const totalSiloms = currentMonthData.reduce((acc, curr) => acc + curr.silomsValue, 0);

  // Top 20 offenders
  const topOffenders = [...currentMonthData]
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 20)
    .map(d => ({
      UG: d.ug,
      Cod: d.cod,
      Grupo: d.group,
      Diferenca: d.difference,
      SIAFI: d.siafiValue,
      SILOMS: d.silomsValue,
      Preponderancia: d.preponderance
    }));

  // Preponderance Summary
  const preponderanceStats = {
    SIAFI_Maior: currentMonthData.filter(d => d.preponderance === 'SIAFI').length,
    SILOMS_Maior: currentMonthData.filter(d => d.preponderance === 'SILOMS').length,
    Iguais: currentMonthData.filter(d => d.preponderance === 'EQUAL').length
  };

  // Group summaries
  const groupSummaries = Array.from(new Set(currentMonthData.map(d => d.group))).map(group => {
    const groupData = currentMonthData.filter(d => d.group === group);
    return {
      Grupo: group,
      TotalDiferenca: groupData.reduce((acc, curr) => acc + curr.difference, 0),
      Count: groupData.length
    };
  });

  const prompt = `
    Você é um Analista de Dados Sênior especializado em Auditoria Financeira Governamental para o Comando da Aeronáutica.
    Sua tarefa é gerar uma NOTA ANALÍTICA ESTRATÉGICA sobre as divergências entre os sistemas SIAFI (Contábil) e SILOMS (Físico/Patrimonial).

    CABEÇALHO PADRÃO:
    PARA: Diretor de Economia e Finanças da Aeronáutica / Estado-Maior da Aeronáutica
    DE: Divisão de Contabilidade Patrimonial – SUCONT-4/DIREF

    CONTEXTO GERAL:
    - Período de Referência: ${selectedMonth}
    - Filtro de Tempo Atual: ${timeFilter}
    - Saldo Total SIAFI: R$ ${totalSiafi.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
    - Saldo Total SILOMS: R$ ${totalSiloms.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
    - Diferença Líquida Total: R$ ${totalDiff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
    - Quantidade de Unidades Gestoras (UGs) Únicas Analisadas: ${uniqueUGsCount} (Nota: Não confunda registros de grupos de contas diferentes com unidades diferentes. Existem no máximo 85 unidades reais.)
    - Estatísticas de Preponderância: ${JSON.stringify(preponderanceStats)}
    - Potenciais Interações entre OMs (Transferências sem contrapartida SILOMS): ${JSON.stringify(interOMInteractions)}

    DADOS DAS 20 UNIDADES GESTORAS (UG) COM MAIOR DIVERGÊNCIA:
    ${JSON.stringify(topOffenders, null, 2)}

    DINÂMICA DE TENDÊNCIAS (TOP 5):
    (Nota: Inclua o valor absoluto do Delta e a porcentagem de variação para cada UG citada)
    
    MENSAL:
    - Agravamento: ${JSON.stringify(trendsMensal.worsening)}
    - Melhoria: ${JSON.stringify(trendsMensal.improving)}
    
    TRIMESTRAL:
    - Agravamento: ${JSON.stringify(trendsTrimestral.worsening)}
    - Melhoria: ${JSON.stringify(trendsTrimestral.improving)}
    
    SEMESTRAL:
    - Agravamento: ${JSON.stringify(trendsSemestral.worsening)}
    - Melhoria: ${JSON.stringify(trendsSemestral.improving)}

    RESUMO POR GRUPO DE CONTA:
    ${JSON.stringify(groupSummaries, null, 2)}

    ESTRUTURA DA NOTA ANALÍTICA (OBRIGATÓRIO):
    O relatório deve ser em Português (Brasil), formatado em Markdown, e conter:

    1. **Sumário Executivo e Diagnóstico de Saúde**: 
       - Avalie a gravidade da diferença líquida de R$ ${totalDiff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.
       - Mencione explicitamente que foram analisadas ${uniqueUGsCount} unidades únicas.
       - Comente sobre a preponderância e o que isso sugere.

    2. **Análise de Unidades Críticas (TOP 20 DIVERGÊNCIAS)**: 
       - Apresente uma tabela Markdown CLARA com as colunas: UG, Cód, Grupo, Divergência (R$) e Status (SIAFI > SILOMS ou SILOMS > SIAFI).
       - **IMPORTANTE**: Use negrito apenas nos valores e nomes de UG dentro da tabela para não poluir visualmente. Ex: | **GAP-GL** | 120645 | BMP | **R$ 540.655.584,56** | SIAFI > SILOMS |

    3. **Destaques de Alerta (Análise Aprofundada)**:
       - Realize uma análise crítica sobre pelo menos 5 pontos ou UGs mais sensíveis identificados.
       - Identifique padrões de erro recorrentes ou UGs que necessitam de intervenção imediata.
       - **IMPORTANTE**: Se houver dados sobre "Potenciais Interações entre OMs", mencione-os aqui como possíveis causas de divergência (ex: transferências de saldo SIAFI entre unidades que não foram refletidas simultaneamente no SILOMS).

    4. **Dinâmica de Tendências e Evolução**:
       - Separe claramente as seções de **Agravamento** e **Melhoria**.
       - Informe as 5 UGs que mais aumentaram e as 5 que mais reduziram nos períodos Mensal, Trimestral e Semestral.
       - **OBRIGATÓRIO**: Para cada UG, apresente o valor da variação (Delta) e a porcentagem (%). Ex: **GAP-LS** (+R$ 1.2M | +15%).
       - Reconheça formalmente as Unidades que mais contribuíram para a redução da divergência.
       - Use bullet points para organizar as informações por período.

    5. **Gargalos por Natureza de Bem (Grupos)**:
       - Compare BMP, Consumo e Intangível usando bullet points identados.

    6. **Plano de Ação e Recomendações Estratégicas**:
       - Use bullet points para recomendações aos Ordenadores de Despesa.

    7. **Conclusão**:
       - Nível de exposição ao risco e próximos passos.

    REGRAS DE FORMATAÇÃO:
    - Use bullet points para listas.
    - Use negrito para destacar valores monetários e nomes de instituições.
    - Mantenha um tom profissional, técnico e estratégico (linguagem militar/auditória).
    - A tabela deve ser impecável.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Não foi possível gerar o relatório no momento.";
  } catch (error: any) {
    console.error("Erro ao chamar Gemini API:", error);
    const errorMessage = error?.message || "Erro desconhecido";
    return `Erro ao processar o relatório com IA: ${errorMessage}. Verifique se sua chave de API é válida.`;
  }
};
