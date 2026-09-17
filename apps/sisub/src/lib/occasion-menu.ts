/**
 * Eventos e exceções são o mesmo artefato — `menu_template` sem estrutura de semana, com o
 * pax por preparação — e diferem só no texto e na recorrência mensal da exceção. Cozinha e
 * catálogo global montam as mesmas telas a partir destes rótulos.
 */

export type OccasionMenuType = "event" | "exception"

/**
 * `day_of_week` é obrigatório no schema mas não tem significado aqui: todo item de evento ou
 * exceção grava 1.
 */
export const OCCASION_DAY = 1

type OccasionMenuCopy = {
	/** "Evento" / "Exceção" */
	singular: string
	/** "Eventos" / "Exceções" */
	plural: string
	/** "evento" / "exceção", no meio da frase */
	noun: string
	/** Artigo definido concordando com o gênero: "o" / "a" */
	article: "o" | "a"
	/** "Novo Evento" / "Nova Exceção" */
	newLabel: string
	namePlaceholder: string
	/** Título da seção de itens desta cozinha / do catálogo */
	sectionTitle: string
	/** Frase curta do que é o artefato, para o bloco de orientação da criação */
	explainer: string
}

export const OCCASION_MENU_COPY: Record<OccasionMenuType, OccasionMenuCopy> = {
	event: {
		singular: "Evento",
		plural: "Eventos",
		noun: "evento",
		article: "o",
		newLabel: "Novo Evento",
		namePlaceholder: "Ex.: Almoço de Formatura, Rancho de Manobra, Jantar Comemorativo",
		sectionTitle: "Cardápios de Eventos",
		explainer:
			"Eventos são cardápios de refeições especiais — datas comemorativas, formaturas, exercícios de campo, visitas. Não têm estrutura de semana: as preparações se agrupam por refeição, cada uma com o próprio efetivo.",
	},
	exception: {
		singular: "Exceção",
		plural: "Exceções",
		noun: "exceção",
		article: "a",
		newLabel: "Nova Exceção",
		namePlaceholder: "Ex.: Lanche de Bordo, Café de Reunião",
		sectionTitle: "Cardápios de Exceção",
		explainer:
			"Exceções são refeições previsíveis e recorrentes — lanches de bordo, cafés de reunião. Crie um molde por tipo e informe quantas vezes por mês ele ocorre; o custeio da Ata multiplica automaticamente.",
	},
}

/** "" → null; senão inteiro positivo (nulo se inválido). Em branco conta como 1 ocorrência na Ata. */
export function parseMonthlyOccurrences(value: string): number | null {
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
