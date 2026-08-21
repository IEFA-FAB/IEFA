/**
 * @module sacdgc/types
 * Tipos do SAC-DGC — Sistema de Análise Crítica do Demonstrativo Gerencial de Custos.
 *
 * O DGC chega em quatro painéis do Tesouro Gerencial, exportados como quatro
 * planilhas independentes. O SAC-DGC recorta a base por Unidade Gestora e submete
 * cada recorte ao modelo, que devolve `DgcAnalysis`.
 */

/** Os quatro painéis do DGC. A ordem é a da apresentação e a do prompt. */
export const PANEL_IDS = [1, 2, 3, 4] as const
export type PanelId = (typeof PANEL_IDS)[number]

export const PANEL_TITLES: Record<PanelId, string> = {
	1: "Painel 1 – Distribuição dos Custos",
	2: "Painel 2 – Comportamento Temporal",
	3: "Painel 3 – Comparação Institucional",
	4: "Painel 4 – Consistência Contábil",
}

/** Linhas de um painel pertencentes a uma única UG, já sem o cabeçalho. */
export type PanelRows = Record<PanelId, string[]>

/** Recorte da base consolidado para uma UG — é o que vai ao modelo. */
export interface UgDataset {
	/** Código de 6 dígitos, ou "120002 e 120700" para a DIREF (as duas UGs são a mesma unidade). */
	ugCode: string
	/** "120004 - BASE AEREA DE BRASILIA" */
	ugName: string
	/** Grupo de comparação institucional (ver `identifyGroup`). */
	group: string
	/** Quantidade de linhas por painel — usada na UI e para detectar painel ausente. */
	rowCount: Record<PanelId, number>
	/** Texto consolidado (cabeçalho + linhas de cada painel presente). */
	consolidated: string
	/** `true` quando `consolidated` foi cortado pelo orçamento de caracteres. */
	truncated: boolean
}

/** Resultado da leitura das planilhas: os recortes + o que foi descartado. */
export interface DgcBase {
	/** Competência lida das próprias planilhas (ex.: "JULHO/2026"), ou "" se indeterminada. */
	competence: string
	/** Nomes dos arquivos que compuseram a carga — vira proveniência da rodada gravada. */
	filenames: string[]
	datasets: UgDataset[]
	/** Painéis efetivamente reconhecidos nos arquivos enviados. */
	panelsFound: PanelId[]
	/** Linhas que não puderam ser atribuídas a nenhuma UG. */
	skippedRows: number
}

interface AlertaCriticidade {
	titulo: string
	origemAnalise: string[]
	evidencia: string
	acaoRecomendada: string
}

export interface ChecklistItem {
	id: number
	pergunta: string
	resposta: "SIM" | "NÃO"
	fundamentacaoTecnica?: string
	evidenciasEncontradas?: string[]
	recomendacao?: string
}

interface ChecklistAec {
	indicadores: {
		total: number
		comApontamento: number
		semApontamento: number
	}
	perguntas: ChecklistItem[]
}

export interface DgcAnalysis {
	identificacao: {
		codigoUg: string
		nomeUg: string
		anoReferencia: string
		mesReferencia: string
	}
	analisePainel1: string
	analisePainel2: string
	analisePainel3: string
	analisePainel4: string
	alertasDeCriticidade: AlertaCriticidade[]
	checklistAec: ChecklistAec
}
