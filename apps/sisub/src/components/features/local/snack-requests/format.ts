/**
 * Formatação e rótulos do Pedido de Lanche de Bordo/Apoio na Gestão Cozinha.
 *
 * Toda data e hora sai no fuso de Brasília, com fuso EXPLÍCITO no `Intl`: o SSR roda em UTC
 * e o navegador no fuso da máquina — sem o fuso fixo, servidor e cliente escreveriam horas
 * diferentes para o mesmo instante (e a hidratação acusaria).
 */

import type { SnackRequestSummary } from "@iefa/sisub-domain"
import { brasiliaCivilDate, isStandardReviewOverdue, type SnackRequestStatus } from "@iefa/sisub-domain/utils"
import { z } from "zod"

const TIME_ZONE = "America/Sao_Paulo"

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" })
const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, dateStyle: "short" })
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, timeStyle: "short" })
const longDateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, weekday: "long", day: "2-digit", month: "long" })
const brlFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const intFormat = new Intl.NumberFormat("pt-BR")

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return "—"
	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? "—" : dateTimeFormat.format(date)
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—"
	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date)
}

export function formatTime(iso: string): string {
	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? "—" : timeFormat.format(date)
}

/** "2026-09-22" (data civil) → "terça-feira, 22 de setembro". Meio-dia UTC nunca cruza a data em Brasília. */
export function formatCivilDateLong(civilDate: string): string {
	return longDateFormat.format(new Date(`${civilDate}T12:00:00Z`))
}

export function formatCivilDate(civilDate: string): string {
	return dateFormat.format(new Date(`${civilDate}T12:00:00Z`))
}

export function formatBrl(value: number | string | null | undefined): string {
	if (value == null || value === "") return "—"
	const n = Number(value)
	return Number.isFinite(n) ? brlFormat.format(n) : "—"
}

export function formatInt(value: number): string {
	return intFormat.format(value)
}

/** Data civil de hoje em Brasília (YYYY-MM-DD). */
export function todayBrasilia(): string {
	return brasiliaCivilDate(new Date().toISOString())
}

export function addDaysToCivilDate(civilDate: string, days: number): string {
	const date = new Date(`${civilDate}T12:00:00Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

/** Data civil de Brasília de um instante — é a data do quadro de produção. */
export function pickupCivilDate(iso: string): string {
	return brasiliaCivilDate(iso)
}

/** "agora" em Brasília no formato do `<input type="datetime-local">`. */
export function nowBrasiliaLocalInput(): string {
	const shifted = new Date(Date.now() - 3 * 3_600_000)
	return shifted.toISOString().slice(0, 16)
}

/** Valor do `<input type="datetime-local">` (hora de Brasília) → ISO com fuso. */
export function localInputToIso(value: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
	return `${value}:00-03:00`
}

// ── Search params ──────────────────────────────────────────────────────────

/**
 * Data civil em search param. O TanStack Router faz `JSON.parse` do valor, então um param
 * numérico chega como NÚMERO — `z.string()` puro derrubaria a rota. Aceita os dois, e valor
 * inválido vira ausência (a tela cai no default) em vez de erro.
 */
export const civilDateSearchParam = z
	.union([z.string(), z.number()])
	.transform((v) => String(v))
	.pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
	.optional()
	.catch(undefined)

// ── Rótulos ────────────────────────────────────────────────────────────────

export const MISSION_KIND_LABELS: Record<string, string> = {
	aerea: "Missão aérea",
	terrestre: "Missão terrestre",
}

export const FAMILY_LABELS: Record<string, string> = {
	bordo: "Lanche de Bordo",
	apoio: "Lanche de Apoio",
}

export const FAMILY_SHORT_LABELS: Record<string, string> = {
	bordo: "Bordo",
	apoio: "Apoio",
}

export const AUDIENCE_LABELS: Record<string, string> = {
	crew: "Tripulação",
	pax: "Passageiros",
}

export const VARIANT_LABELS: Record<string, string> = {
	lanche: "Lanche",
	refeicao: "Refeição",
}

export const FUNDING_LABELS: Record<string, string> = {
	economia_om: "Economia da OM",
	recurso_missao: "Recurso da missão",
}

export const MATERIAL_ITEMS = ["garrafa_termica", "caixa_termica", "hotbox", "cooler", "outro"] as const
export type MaterialItem = (typeof MATERIAL_ITEMS)[number]

export const MATERIAL_ITEM_LABELS: Record<string, string> = {
	garrafa_termica: "Garrafa térmica",
	caixa_termica: "Caixa térmica",
	hotbox: "Hotbox",
	cooler: "Cooler",
	outro: "Outro",
}

export type StatusBadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive"

export const STATUS_BADGE_VARIANTS: Record<SnackRequestStatus, StatusBadgeVariant> = {
	submitted: "warning",
	accepted: "default",
	in_production: "default",
	ready: "success",
	delivered: "secondary",
	closed: "outline",
	rejected: "destructive",
	cancelled: "destructive",
}

// ── Agrupamento da fila ────────────────────────────────────────────────────

export const QUEUE_TABS = {
	decide: { label: "A decidir", statuses: ["submitted"] },
	ongoing: { label: "Em andamento", statuses: ["accepted", "in_production", "ready", "delivered"] },
	closed: { label: "Encerrados", statuses: ["closed", "rejected", "cancelled"] },
} as const satisfies Record<string, { label: string; statuses: readonly SnackRequestStatus[] }>

export type QueueTab = keyof typeof QUEUE_TABS
export const QUEUE_TAB_KEYS = Object.keys(QUEUE_TABS) as QueueTab[]

// ── Derivados do pedido ────────────────────────────────────────────────────

export function asStatus(status: string): SnackRequestStatus {
	return status as SnackRequestStatus
}

/** Kits que a cozinha produz na linha: o aprovado, ou o pedido enquanto não há decisão. */
export function lineKits(line: SnackRequestSummary["lines"][number]): number {
	return line.approved_quantity ?? line.quantity
}

export function classLabel(family: string, snackClass: string): string {
	return `${FAMILY_SHORT_LABELS[family] ?? family} ${snackClass}`
}

/** "bordo:C:pax" (chave da calculadora) → "Bordo C · Passageiros". */
export function entitlementKeyLabel(key: string): string {
	const [family, snackClass, audience] = key.split(":")
	return `${classLabel(family ?? "", snackClass ?? "")} · ${AUDIENCE_LABELS[audience ?? ""] ?? audience}`
}

export type RequestFlags = {
	late: boolean
	divergent: boolean
	optionalPax: boolean
	reviewOverdue: boolean
	materialPending: boolean
}

export function requestFlags(request: SnackRequestSummary): RequestFlags {
	return {
		late: request.is_late,
		divergent: (request.calculator_snapshot?.divergences?.length ?? 0) > 0,
		optionalPax: request.lines.some((l) => l.optional),
		materialPending: request.material_return_pending,
		// Revisão trimestral (7.4.18) na data do pedido — snapshot antigo sem a data não marca.
		reviewOverdue: request.lines.some(
			(l) => l.standard_snapshot.reviewedAt !== undefined && isStandardReviewOverdue(l.standard_snapshot.reviewedAt, request.created_at.slice(0, 10))
		),
	}
}

/** Kits por classe e público, na ordem do pedido: "Bordo B · Tripulação" → 4. */
export function kitsByClass(request: SnackRequestSummary): { key: string; label: string; kits: number; requested: number; optional: boolean }[] {
	const rows = new Map<string, { key: string; label: string; kits: number; requested: number; optional: boolean }>()
	for (const line of request.lines) {
		const s = line.standard_snapshot
		const key = `${s.family}:${s.snackClass}:${line.audience}`
		const row = rows.get(key) ?? { key, label: entitlementKeyLabel(key), kits: 0, requested: 0, optional: false }
		row.kits += lineKits(line)
		row.requested += line.quantity
		row.optional ||= line.optional
		rows.set(key, row)
	}
	return [...rows.values()]
}
