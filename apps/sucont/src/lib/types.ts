/**
 * Etapa do ciclo de conformidade contábil da SUCONT.
 *
 * Substitui a categoria antiga ("Auditoria", "Automação", "IA / Chatbot"), que
 * classificava a ferramenta pela TECNOLOGIA que ela usa por dentro. Ninguém chega
 * ao hub precisando de "uma automação" — chega com uma UG divergente numa
 * competência, e o que muda é em que ponto do trabalho a pessoa está.
 */
export type ToolStage = "analisar" | "comunicar" | "acompanhar" | "consultar"

export const TOOL_STAGES: Array<{ id: ToolStage; label: string; description: string }> = [
	{ id: "analisar", label: "Analisar", description: "Encontrar a inconsistência antes do fechamento" },
	{ id: "comunicar", label: "Comunicar", description: "Levar o achado à UG: mensagem, ofício, documento" },
	{ id: "acompanhar", label: "Acompanhar", description: "Ver a série, o saldo e o que continua aberto" },
	{ id: "consultar", label: "Consultar", description: "Norma, manual e os sistemas de origem do dado" },
]

export interface Tool {
	id: string
	title: string
	description: string
	url?: string
	icon: string
	/** Etapa do ciclo. É o eixo de agregação do hub. */
	stage: ToolStage
	/**
	 * Questões do RAC que a ferramenta cobre, sem o prefixo — `[34]`, `[40, 41, 42]`.
	 *
	 * É o escopo real do trabalho: o analista persegue uma questão, não um gênero
	 * de tela. Quatro ferramentas já carregavam o número no próprio título; aqui
	 * ele vira dado, e passa a filtrar.
	 */
	racQuestions?: number[]
	/** Rota interna do TanStack Router. Quando presente, o card navega internamente em vez de abrir URL externa. */
	internalPath?: string
}

export interface ChecklistItem {
	id: string
	task: string
	deadline: string
	description: string
	responsible: string
	path?: string
}

export interface Notice {
	id: string
	content: string
	date: string
	type: "info" | "alert"
}

export interface UnitResponsibility {
	code: string
	name: string
	operator: string
}
