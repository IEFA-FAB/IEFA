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

/**
 * Divisão da SUCONT dona da ferramenta.
 *
 * - `sucont-1` — o Demonstrativo Gerencial de Custos (DGC).
 * - `sucont-3` — Divisão de Acompanhamento Contábil e de Suporte ao Usuário. É a
 *                divisão das trilhas do RAC; as mensagens que essas ferramentas
 *                geram fecham com "SUCONT-3".
 * - `sucont-4` — Divisão de Acompanhamento Patrimonial. Conciliação SIAFI x
 *                SILOMS e redação de documento; fecham com "DIREF/SUCONT/SUCONT-4".
 *
 * A subdivisão 3.1 (Acompanhamento Contábil) / 3.2 (Suporte ao Usuário) NÃO entra
 * aqui: das ferramentas inventariadas nas duas seções, as seis portadas são todas
 * da 3.1, e nenhum texto gerado assina a seção — para a UG que recebe a mensagem
 * existe SUCONT-3. Essa distinção continua onde já vive, dentro do
 * `/centro-monitoramento`.
 */
export type SucontDivision = "sucont-1" | "sucont-3" | "sucont-4"

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
	/**
	 * Divisões donas da ferramenta. Mais de uma quando ela serve às duas — o
	 * Monitoramento Patrimonial é o caso: assina SUCONT-3 e trata assunto da
	 * SUCONT-4.
	 *
	 * AUSENTE significa "sem dono de divisão", e a ferramenta aparece em TODOS os
	 * módulos. Cobre duas situações que se comportam igual: o sistema federal que
	 * não é de divisão nenhuma (SIAFI Web, Tesouro Gerencial, Sigadaer, manuais do
	 * RADA-e) e a ferramenta cuja divisão não se conseguiu determinar. Preencher
	 * por palpite seria pior: some do catálogo de quem é dono de verdade.
	 */
	divisions?: SucontDivision[]
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

/**
 * Etapa sentinela: nenhuma filtragem, mostra o catálogo inteiro.
 *
 * Mora aqui, e não no hook que a lê (`lib/hub-filters`), porque `lib/tool-filter` —
 * que é puro e tem teste unitário — precisa dela: importá-la do hook arrastava o
 * grafo do React Query e das server functions para dentro de um teste de filtro de
 * string, e a suíte quebrava ao carregar `@iefa/pbac/start`.
 */
export const ALL_STAGES = "todas" as const

export type StageFilter = ToolStage | typeof ALL_STAGES
