// Tipos extraídos de routes/subitens-genericos.tsx (port do sucontsubitem).

/**
 * Código genérico achado na conta corrente: o subitem 99 da natureza de despesa ou o
 * favorecido genérico 999 do c/c tipo 002, que não é subitem. Ver `classifyGenericCode`.
 */
export type GenericCodeKind = "subitem-99" | "favorecido-999"

/** Filtro da tela pelo tipo de código; `"all"` é sem filtro. */
export type GenericCodeFilter = "all" | GenericCodeKind

export interface ProcessedData {
	ug: string
	contaContabil: string
	contaCorrente: string
	/** Nunca vazio numa ocorrência: linha sem código genérico não entra no relatório. */
	genericKinds: GenericCodeKind[]
	saldo: number
	racId: string
}

export interface UgGroup {
	ug: string
	occurrences: ProcessedData[]
	totalSaldo: number
}

export type MessageType = "com_prazo" | "sem_prazo" | "alerta"

/** Configuração da mensagem por UG (modo individual) ou por questão RAC (modo consolidado). */
export interface MessageConfig {
	messageType: MessageType
	deadlineDate: string
	msgNumber: string
	msgDate: string
}
