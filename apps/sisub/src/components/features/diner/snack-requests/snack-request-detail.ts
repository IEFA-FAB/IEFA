/**
 * Derivações puras do detalhe do pedido de lanche (`SnackRequestDetailView`): textos dos
 * campos da missão e a comparação sugestão × pedido.
 */

import type { SnackRequestDetail } from "@iefa/sisub-domain"
import type { SnackAudience, SnackClass, SnackFamily } from "@iefa/sisub-domain/utils"
import { entitlementKey, formatDuration, summarizeEntitlement } from "@iefa/sisub-domain/utils"

export type ComparisonRow = {
	key: string
	family: SnackFamily
	snackClass: SnackClass
	audience: SnackAudience
	suggested: number
	requested: number
	optional: boolean
}

export function buildComparison(request: SnackRequestDetail): ComparisonRow[] {
	const entitlement = request.calculator_snapshot?.entitlement
	const suggested = entitlement ? summarizeEntitlement(entitlement) : new Map<string, { quantity: number; optional: boolean }>()
	const rows = new Map<string, ComparisonRow>()
	for (const [key, hint] of suggested) {
		const [family, snackClass, audience] = key.split(":") as [SnackFamily, SnackClass, SnackAudience]
		rows.set(key, { key, family, snackClass, audience, suggested: hint.quantity, requested: 0, optional: hint.optional })
	}
	for (const line of request.lines) {
		const { family, snackClass } = line.standard_snapshot
		const audience = line.audience as SnackAudience
		const key = entitlementKey(family, snackClass, audience)
		const row = rows.get(key) ?? { key, family, snackClass, audience, suggested: 0, requested: 0, optional: false }
		row.requested += line.quantity
		rows.set(key, row)
	}
	return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key))
}

type MissionFields = Pick<
	SnackRequestDetail,
	| "vehicle_type"
	| "vehicle_registration"
	| "vehicle_om"
	| "stops"
	| "stops_without_mess"
	| "total_minutes"
	| "longest_leg_minutes"
	| "crew_count"
	| "pax_count"
	| "is_operational"
	| "has_galley"
	| "has_oven"
>

export function describeVehicle(request: MissionFields): string {
	return [request.vehicle_type, request.vehicle_registration, request.vehicle_om].filter(Boolean).join(" · ")
}

export function describeStops(request: MissionFields): string {
	return [request.stops, request.stops_without_mess ? "com escala sem apoio de refeitório" : null].filter(Boolean).join(" · ")
}

/** Envolvimento só entra na missão aérea. */
export function describeDuration(request: MissionFields, aerial: boolean, involvement: number | null): string {
	return [
		formatDuration(request.total_minutes),
		request.longest_leg_minutes != null ? `maior perna ${formatDuration(request.longest_leg_minutes)}` : null,
		aerial && involvement != null ? `envolvimento ${formatDuration(involvement)}` : null,
	]
		.filter(Boolean)
		.join(" · ")
}

export function describePeople(request: MissionFields): string {
	return `${request.crew_count} / ${request.pax_count}${request.is_operational ? " · missão operacional" : " · não operacional"}`
}

export function describeEquipment(request: MissionFields): string {
	return [request.has_galley ? "copa ou minicozinha" : "sem copa", request.has_oven ? "forno" : null].filter(Boolean).join(" · ")
}
