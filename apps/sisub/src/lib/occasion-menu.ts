/**
 * Eventos e apoios são o mesmo artefato — `menu_template` sem estrutura de semana, com o
 * pax por preparação — e diferem só no texto e na recorrência mensal do apoio. Cozinha e
 * catálogo global montam as mesmas telas a partir destes rótulos.
 *
 * "Apoio" é o nome na tela do que o código e o banco chamam de `exception` (`template_type`,
 * rotas `/exceptions`): o artefato nasceu como "Exceção" e foi renomeado só no texto, porque
 * o valor é dado gravado e a rota é link salvo. Engloba os lanches de bordo e de apoio do
 * Módulo 7 e os demais apoios previsíveis (coffee break, café de reunião).
 */

import type { SnackClass, SnackFamily, SnackVariant } from "@iefa/sisub-domain/utils"

export type OccasionMenuType = "event" | "exception"

/**
 * `day_of_week` é obrigatório no schema mas não tem significado aqui: todo item de evento ou
 * exceção grava 1.
 */
export const OCCASION_DAY = 1

type OccasionMenuCopy = {
	/** "Evento" / "Apoio" */
	singular: string
	/** "Eventos" / "Apoios" */
	plural: string
	/** "evento" / "apoio", no meio da frase */
	noun: string
	/** Artigo definido concordando com o gênero ("o evento", "o apoio") */
	article: "o" | "a"
	/** "Novo Evento" / "Novo Apoio" */
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
		singular: "Apoio",
		plural: "Apoios",
		noun: "apoio",
		article: "o",
		newLabel: "Novo Apoio",
		namePlaceholder: "Ex.: Lanche de Bordo, Lanche de Apoio, Coffee Break",
		sectionTitle: "Cardápios de Apoio",
		explainer:
			"Apoios são refeições previsíveis e recorrentes fora da rotina semanal — lanches de bordo e de apoio (Módulo 7), coffee breaks, cafés de reunião. Crie um molde por tipo e informe quantas vezes por mês ele ocorre; o custeio do anexo quantitativo multiplica automaticamente.",
	},
}

/** "" → null; senão inteiro positivo (nulo se inválido). Em branco conta como 1 ocorrência na Ata. */
export function parseMonthlyOccurrences(value: string): number | null {
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

// ── Padrão de lanche (Módulo 7) ──────────────────────────────────────────────

type SnackFamilyValue = SnackFamily
type SnackClassValue = SnackClass
type SnackVariantValue = SnackVariant

/**
 * Nome completo da norma, nunca "Bordo"/"Apoio" solto: o artefato inteiro já se chama "Apoio" na tela
 * (`OCCASION_MENU_COPY.exception`), e "Apoio B" dentro de um Apoio não diz qual dos dois é.
 */
export const SNACK_FAMILY_LABELS: Record<SnackFamilyValue, string> = { bordo: "Lanche de Bordo", apoio: "Lanche de Apoio" }
export const SNACK_VARIANT_LABELS: Record<SnackVariantValue, string> = { lanche: "Lanche", refeicao: "Refeição" }

/** Colunas da classificação como vêm do `menu_template` (snake_case no wire). */
export type SnackStandardColumns = {
	snack_family: string | null
	snack_class: string | null
	snack_variant: string | null
	requires_galley: boolean
	requires_oven: boolean
	reviewed_at: string | null
	shelf_life_hours: number | null
	orderable: boolean
}

/** Estado do bloco "Padrão de lanche" no editor — campos de texto ficam como o usuário digitou. */
export type SnackStandardDraft = {
	enabled: boolean
	family: SnackFamilyValue
	snackClass: SnackClassValue
	variant: SnackVariantValue
	requiresGalley: boolean
	requiresOven: boolean
	/** YYYY-MM-DD ou "" */
	reviewedAt: string
	/** Horas; "" = 24 h */
	shelfLifeHours: string
	orderable: boolean
}

export const EMPTY_SNACK_STANDARD_DRAFT: SnackStandardDraft = {
	enabled: false,
	family: "bordo",
	snackClass: "B",
	variant: "lanche",
	requiresGalley: false,
	requiresOven: false,
	reviewedAt: "",
	shelfLifeHours: "",
	orderable: false,
}

function isSnackFamily(value: string | null): value is SnackFamilyValue {
	return value === "bordo" || value === "apoio"
}
function isSnackClass(value: string | null): value is SnackClassValue {
	return value === "A" || value === "B" || value === "C"
}
function isSnackVariant(value: string | null): value is SnackVariantValue {
	return value === "lanche" || value === "refeicao"
}

/** Template com família e classe válidas é padrão de lanche. */
export function isSnackStandard(template: Pick<SnackStandardColumns, "snack_family" | "snack_class">): boolean {
	return isSnackFamily(template.snack_family) && isSnackClass(template.snack_class)
}

export function snackDraftFromTemplate(template: SnackStandardColumns): SnackStandardDraft {
	if (!isSnackFamily(template.snack_family) || !isSnackClass(template.snack_class)) return EMPTY_SNACK_STANDARD_DRAFT
	return {
		enabled: true,
		family: template.snack_family,
		snackClass: template.snack_class,
		variant: isSnackVariant(template.snack_variant) ? template.snack_variant : "lanche",
		requiresGalley: template.requires_galley,
		requiresOven: template.requires_oven,
		reviewedAt: template.reviewed_at ?? "",
		shelfLifeHours: template.shelf_life_hours != null ? String(template.shelf_life_hours) : "",
		orderable: template.orderable,
	}
}

/** Classe C só existe em Bordo: trocar para Apoio com C cai para B. */
export function normalizeSnackDraft(draft: SnackStandardDraft): SnackStandardDraft {
	return draft.family === "apoio" && draft.snackClass === "C" ? { ...draft, snackClass: "B" } : draft
}

/** Nome canônico do tipo de refeição de sistema dos lanches (migration 20260922140000). */
export const SNACK_MEAL_TYPE_NAME = "Lanches de Bordo/Apoio"

/** "" → null (24 h); inteiro entre 1 e 720, senão nulo. Fora da faixa é ERRO, não silêncio: ver `snackDraftIssues`. */
export function parseShelfLifeHours(value: string): number | null {
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed >= 1 && parsed <= 720 ? parsed : null
}

/**
 * O que impede gravar a classificação, por campo.
 *
 * Os dois casos existem porque o valor inválido sumia calado: validade fora de 1–720 h virava
 * `null` (a etiqueta passava a imprimir as 24 h do default com o campo ainda mostrando o número
 * digitado), e uma data de revisão no futuro — `2126` por erro de digitação — desligava o aviso
 * de revisão vencida para sempre.
 */
export function snackDraftIssues(draft: SnackStandardDraft, today: string): { reviewedAt?: string; shelfLifeHours?: string } {
	if (!draft.enabled) return {}
	const issues: { reviewedAt?: string; shelfLifeHours?: string } = {}
	if (draft.shelfLifeHours.trim() !== "" && parseShelfLifeHours(draft.shelfLifeHours) == null) {
		issues.shelfLifeHours = "Informe de 1 a 720 horas, ou deixe em branco para as 24 h padrão."
	}
	if (draft.reviewedAt !== "") {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.reviewedAt)) issues.reviewedAt = "Data inválida."
		else if (draft.reviewedAt > today) issues.reviewedAt = "A revisão não pode ser no futuro."
	}
	return issues
}

/**
 * Payload de `setSnackClassification`. `null` desfaz a classificação. Padrão do catálogo global
 * nunca vai pedível — o servidor recusaria (`SNACK_STANDARD_GLOBAL_NOT_ORDERABLE`).
 */
export function snackClassificationFromDraft(draft: SnackStandardDraft, { isKitchenTemplate }: { isKitchenTemplate: boolean }) {
	if (!draft.enabled) return null
	const d = normalizeSnackDraft(draft)
	return {
		family: d.family,
		snackClass: d.snackClass,
		variant: d.variant,
		requiresGalley: d.requiresGalley,
		requiresOven: d.requiresOven,
		reviewedAt: /^\d{4}-\d{2}-\d{2}$/.test(d.reviewedAt) ? d.reviewedAt : null,
		shelfLifeHours: parseShelfLifeHours(d.shelfLifeHours),
		orderable: isKitchenTemplate && d.orderable,
	}
}

/** "Bordo B · Lanche" */
export function snackStandardLabel(template: Pick<SnackStandardColumns, "snack_family" | "snack_class" | "snack_variant">): string | null {
	if (!isSnackFamily(template.snack_family) || !isSnackClass(template.snack_class)) return null
	const variant = isSnackVariant(template.snack_variant) ? ` · ${SNACK_VARIANT_LABELS[template.snack_variant]}` : ""
	return `${SNACK_FAMILY_LABELS[template.snack_family]} ${template.snack_class}${variant}`
}
