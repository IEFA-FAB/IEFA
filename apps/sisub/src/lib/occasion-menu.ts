/**
 * Eventos e exceções são o mesmo artefato — `menu_template` sem estrutura de semana, com o
 * pax por preparação — e diferem só no texto e na recorrência mensal da exceção. Cozinha e
 * catálogo global montam as mesmas telas a partir destes rótulos.
 */

import type { SnackClass, SnackFamily, SnackVariant } from "@iefa/sisub-domain/utils"

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

// ── Padrão de lanche (Módulo 7) ──────────────────────────────────────────────

type SnackFamilyValue = SnackFamily
type SnackClassValue = SnackClass
type SnackVariantValue = SnackVariant

export const SNACK_FAMILY_LABELS: Record<SnackFamilyValue, string> = { bordo: "Bordo", apoio: "Apoio" }
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

/** "" → null (24 h); inteiro entre 1 e 720, senão nulo. */
export function parseShelfLifeHours(value: string): number | null {
	const parsed = Number.parseInt(value, 10)
	return Number.isFinite(parsed) && parsed >= 1 && parsed <= 720 ? parsed : null
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
