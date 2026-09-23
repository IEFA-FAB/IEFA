/**
 * Rótulos e formatação do pedido de lanche no módulo Comensal.
 *
 * Toda data/hora exibida é de Brasília: a retirada é no rancho, e quem pede num fuso
 * diferente (missão fora da sede) tem que ver o horário que a cozinha vai ver.
 */

import type { SnackAudience, SnackClass, SnackFamily, SnackRequestStatus } from "@iefa/sisub-domain/utils"
import { SNACK_REQUEST_STATUS_LABELS } from "@iefa/sisub-domain/utils"

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
const DATE_ONLY = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return "—"
	const ms = Date.parse(iso)
	return Number.isFinite(ms) ? DATE_TIME.format(ms) : "—"
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—"
	const ms = Date.parse(iso)
	return Number.isFinite(ms) ? DATE_ONLY.format(ms) : "—"
}

export function formatCurrency(value: number | string | null | undefined): string {
	if (value == null || value === "") return "—"
	const n = Number(value)
	return Number.isFinite(n) ? BRL.format(n) : "—"
}

// ── datetime-local ⇄ ISO (Brasília, UTC−3 fixo) ────────────────────────────

/** Brasília é UTC−3 fixo desde 2019 — o mesmo deslocamento que a calculadora usa. */
const BRASILIA_OFFSET_MS = -3 * 3_600_000

/** "2026-09-23T08:00" (horário de Brasília) → "2026-09-23T08:00:00-03:00". Nulo se incompleto. */
export function brasiliaLocalToIso(local: string): string | null {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
	const iso = `${local}:00-03:00`
	return Number.isFinite(Date.parse(iso)) ? iso : null
}

/** Instante → valor de `<input type="datetime-local">` no horário de Brasília. */
export function isoToBrasiliaLocal(iso: string | number): string {
	const ms = typeof iso === "number" ? iso : Date.parse(iso)
	return new Date(ms + BRASILIA_OFFSET_MS).toISOString().slice(0, 16)
}

// ── Rótulos de domínio ─────────────────────────────────────────────────────

export function statusLabel(status: string): string {
	return SNACK_REQUEST_STATUS_LABELS[status as SnackRequestStatus] ?? status
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning"

export const STATUS_BADGE_VARIANT: Record<SnackRequestStatus, BadgeVariant> = {
	submitted: "secondary",
	accepted: "default",
	in_production: "warning",
	ready: "success",
	delivered: "outline",
	closed: "outline",
	rejected: "destructive",
	cancelled: "destructive",
}

export const MISSION_KIND_LABELS: Record<string, string> = { aerea: "Aérea", terrestre: "Terrestre" }
export const FUNDING_SOURCE_LABELS: Record<string, string> = { economia_om: "Economia de alimentação da OM", recurso_missao: "Recurso próprio da missão" }
export const PREFERENCE_LABELS: Record<string, string> = { lanche: "Lanche", refeicao: "Refeição (marmita)" }
export const FAMILY_LABELS: Record<SnackFamily, string> = { bordo: "Lanche de Bordo", apoio: "Lanche de Apoio" }
export const MATERIAL_ITEM_LABELS: Record<string, string> = {
	garrafa_termica: "Garrafa térmica",
	caixa_termica: "Caixa térmica",
	hotbox: "Hotbox",
	cooler: "Cooler",
	outro: "Outro",
}

/** Em missão terrestre a norma fala em efetivo, não em tripulação. */
export function audienceLabel(audience: SnackAudience | string, missionKind: string): string {
	if (missionKind === "terrestre") return audience === "crew" ? "Efetivo" : "Outros"
	return audience === "crew" ? "Tripulação" : "Passageiros"
}

export function classLabel(family: SnackFamily, snackClass: SnackClass): string {
	return `${FAMILY_LABELS[family]} “Classe ${snackClass}”`
}

/** Chave de divergência da calculadora ("bordo:B:crew") → texto legível. */
export function divergenceLabel(key: string, missionKind: string): string {
	const [family, snackClass, audience] = key.split(":") as [SnackFamily, SnackClass, SnackAudience]
	if (!family || !snackClass || !audience) return key
	return `${classLabel(family, snackClass)} — ${audienceLabel(audience, missionKind)}`
}

export function formatKcal(kcal: number | null, complete: boolean): string {
	if (kcal == null) return "sem valor energético"
	return `${Math.round(kcal).toLocaleString("pt-BR")} kcal${complete ? "" : " (parcial)"}`
}
