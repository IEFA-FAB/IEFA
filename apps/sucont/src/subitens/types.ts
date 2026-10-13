// Tipos extraídos de routes/subitens-genericos.tsx (port do sucontsubitem).

export interface ProcessedData {
	ug: string
	contaContabil: string
	contaCorrente: string
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
