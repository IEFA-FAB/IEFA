/**
 * Estado e regras puras do formulário do pedido de lanche (Anexo E + calculadora + padrões).
 *
 * A validação aqui ESPELHA a do servidor (`createSnackRequest`) para o usuário ver o
 * problema antes de enviar — mas quem decide é o servidor, que recalcula tudo.
 */

import type { CreateSnackRequest } from "@iefa/sisub-domain"
import type {
	MissionKind,
	SnackAudience,
	SnackEntitlement,
	SnackEntitlementLine,
	SnackMissionInput,
	SnackStandardSnapshot,
	SnackVariant,
} from "@iefa/sisub-domain/utils"
import { findEntitlementDivergences, leadTimeHours, MIN_LEAD_TIME_HOURS } from "@iefa/sisub-domain/utils"
import { brasiliaLocalToIso } from "./snack-format"

export type FundingSource = "economia_om" | "recurso_missao"

export type SnackRequestFormState = {
	kitchenId: number | null
	missionKind: MissionKind
	requesterUnitLabel: string
	vehicleType: string
	vehicleRegistration: string
	vehicleOm: string
	missionDescription: string
	/** `datetime-local`, horário de Brasília. */
	departureLocal: string
	origin: string
	destination: string
	stops: string
	totalHours: string
	totalMins: string
	stopsWithoutMess: boolean
	/** Há escala COM apoio de rancho: aí a maior perna decide a classe. */
	hasMessStop: boolean
	legHours: string
	legMins: string
	groundHours: string
	groundMins: string
	missionOrderNumber: string
	isOperational: boolean
	hasGalley: boolean
	hasOven: boolean
	crewCount: string
	paxCount: string
	includesNonMilitary: boolean
	nonMilitaryReason: string
	/**
	 * Texto cru do campo de material. Ausente = o campo acompanha o número de pessoas;
	 * `""` = campo vazio enquanto se digita, que vale 0 no envio e ainda não é ajuste manual.
	 */
	materialOverrides: Partial<Record<MaterialKey, string>>
	preference: SnackVariant
	/** Vazio = 1 h antes da partida. */
	pickupLocal: string
	pickupResponsible: string
	fundingSource: FundingSource
	lateReason: string
	divergenceReason: string
	/** Nulo = linhas acompanham a sugestão; o usuário mexeu = linhas dele. */
	lines: FormLine[] | null
}

export type FormLine = { key: string; standardId: string | null; audience: SnackAudience; quantity: string }

export type MaterialKey = "water" | "cups" | "ice" | "coffee"

export const MATERIAL_KEYS: MaterialKey[] = ["water", "cups", "ice", "coffee"]

export const MATERIAL_LABELS: Record<MaterialKey, string> = { water: "Água", cups: "Copos", ice: "Gelo", coffee: "Café" }

/**
 * Tetos do `CreateSnackRequestSchema` (`packages/sisub-domain/src/schemas/snack.ts`).
 *
 * Estouro aqui é rejeitado pelo `.validator()` do server fn ANTES do handler, ou seja,
 * sem passar por `handleDomainError`: sem estes limites o usuário levaria o erro cru do
 * Zod num toast, sem campo destacado.
 */
export const MAX_COUNT = 9999
export const MAX_TOTAL_MINUTES = 14 * 24 * 60
export const MAX_GROUND_MINUTES = 24 * 60
export const MAX_LINES = 40

export function initialFormState(): SnackRequestFormState {
	return {
		kitchenId: null,
		missionKind: "aerea",
		requesterUnitLabel: "",
		vehicleType: "",
		vehicleRegistration: "",
		vehicleOm: "",
		missionDescription: "",
		departureLocal: "",
		origin: "",
		destination: "",
		stops: "",
		totalHours: "",
		totalMins: "",
		stopsWithoutMess: false,
		hasMessStop: false,
		legHours: "",
		legMins: "",
		groundHours: "",
		groundMins: "",
		missionOrderNumber: "",
		isOperational: true,
		hasGalley: false,
		hasOven: false,
		crewCount: "",
		paxCount: "",
		includesNonMilitary: false,
		nonMilitaryReason: "",
		materialOverrides: {},
		preference: "lanche",
		pickupLocal: "",
		pickupResponsible: "",
		fundingSource: "economia_om",
		lateReason: "",
		divergenceReason: "",
		lines: null,
	}
}

// ── Números ────────────────────────────────────────────────────────────────

export function toCount(value: string): number {
	const n = Number.parseInt(value, 10)
	return Number.isFinite(n) && n > 0 ? n : 0
}

export function toMinutes(hours: string, minutes: string): number {
	return toCount(hours) * 60 + toCount(minutes)
}

export function peopleCount(state: SnackRequestFormState): number {
	return toCount(state.crewCount) + toCount(state.paxCount)
}

/** Q5 do design: material derivado das pessoas (Classe A) e editável. */
export function derivedMaterials(people: number): Record<MaterialKey, number> {
	return { water: people, cups: 2 * people, ice: 0, coffee: Math.ceil(people / 10) }
}

export function materialValues(state: SnackRequestFormState): Record<MaterialKey, number> {
	const derived = derivedMaterials(peopleCount(state))
	const pick = (key: MaterialKey) => {
		const override = state.materialOverrides[key]
		return override == null ? derived[key] : toCount(override)
	}
	return { water: pick("water"), cups: pick("cups"), ice: pick("ice"), coffee: pick("coffee") }
}

/** Texto do campo: o que o usuário digitou (inclusive vazio) ou o valor derivado das pessoas. */
export function materialInputValue(state: SnackRequestFormState, key: MaterialKey): string {
	return state.materialOverrides[key] ?? String(derivedMaterials(peopleCount(state))[key])
}

/** Campo vazio ainda não é ajuste manual — só texto em digitação. */
export function isMaterialOverridden(state: SnackRequestFormState, key: MaterialKey): boolean {
	const override = state.materialOverrides[key]
	return override != null && override.trim() !== ""
}

/** Campo mexido — inclusive apagado, que é como se volta à derivação depois de esvaziar. */
export function canRecalculateMaterials(state: SnackRequestFormState): boolean {
	return MATERIAL_KEYS.some((key) => state.materialOverrides[key] != null)
}

export function materialErrorKey(key: MaterialKey): string {
	return `material-${key}`
}

// ── Missão → calculadora ───────────────────────────────────────────────────

export function departureIso(state: SnackRequestFormState): string | null {
	return brasiliaLocalToIso(state.departureLocal)
}

export function pickupIso(state: SnackRequestFormState): string | null {
	if (state.pickupLocal) return brasiliaLocalToIso(state.pickupLocal)
	const departure = departureIso(state)
	return departure ? new Date(Date.parse(departure) - 3_600_000).toISOString() : null
}

/** Entrada da calculadora; nula enquanto faltar a partida ou a duração. */
export function toMissionInput(state: SnackRequestFormState): SnackMissionInput | null {
	const departureAt = departureIso(state)
	const totalMinutes = toMinutes(state.totalHours, state.totalMins)
	if (!departureAt || totalMinutes <= 0) return null
	const aerial = state.missionKind === "aerea"
	const leg = !state.stopsWithoutMess && state.hasMessStop ? toMinutes(state.legHours, state.legMins) : 0
	return {
		missionKind: state.missionKind,
		departureAt,
		totalMinutes,
		longestLegMinutes: leg > 0 ? leg : null,
		stopsWithoutMess: state.stopsWithoutMess,
		groundMinutes: aerial ? toMinutes(state.groundHours, state.groundMins) : 0,
		isOperational: state.isOperational,
		hasGalley: aerial && state.hasGalley,
		hasOven: aerial && state.hasGalley && state.hasOven,
		crewCount: toCount(state.crewCount),
		paxCount: toCount(state.paxCount),
	}
}

// ── Padrões ────────────────────────────────────────────────────────────────

/** Padrão serve à missão: mesma família e equipamento exigido presente. */
export function standardFitsMission(standard: SnackStandardSnapshot, mission: Pick<SnackMissionInput, "missionKind" | "hasGalley" | "hasOven">): boolean {
	const family = mission.missionKind === "aerea" ? "bordo" : "apoio"
	if (standard.family !== family) return false
	if (standard.requiresGalley && !mission.hasGalley) return false
	if (standard.requiresOven && !mission.hasOven) return false
	return true
}

/** Padrão atende a linha da calculadora: mesma classe e variante permitida (lista vazia = qualquer). */
export function standardMatchesLine(standard: SnackStandardSnapshot, line: SnackEntitlementLine): boolean {
	if (standard.family !== line.family || standard.snackClass !== line.snackClass) return false
	return line.variants.length === 0 || line.variants.includes(standard.variant)
}

export function suggestStandard(line: SnackEntitlementLine, standards: SnackStandardSnapshot[], preference: SnackVariant): SnackStandardSnapshot | null {
	const candidates = standards.filter((s) => standardMatchesLine(s, line))
	return candidates.find((s) => s.variant === preference) ?? candidates[0] ?? null
}

/** Linhas pré-preenchidas pela sugestão: uma por linha da calculadora que tem padrão compatível. */
export function suggestedLines(entitlement: SnackEntitlement, standards: SnackStandardSnapshot[], preference: SnackVariant): FormLine[] {
	const lines: FormLine[] = []
	for (const [index, line] of entitlement.lines.entries()) {
		const standard = suggestStandard(line, standards, preference)
		if (!standard) continue
		lines.push({ key: `suggested-${index}`, standardId: standard.id, audience: line.audience, quantity: String(line.quantity) })
	}
	return lines
}

export function refeicaoAllowed(entitlement: SnackEntitlement | null): boolean {
	return entitlement?.lines.some((line) => line.variants.includes("refeicao")) ?? false
}

export function computeDivergences(entitlement: SnackEntitlement, lines: FormLine[], standardsById: Map<string, SnackStandardSnapshot>): string[] {
	const requested = lines.flatMap((line) => {
		const standard = line.standardId ? standardsById.get(line.standardId) : undefined
		const quantity = toCount(line.quantity)
		if (!standard || quantity <= 0) return []
		return [{ family: standard.family, snackClass: standard.snackClass, audience: line.audience, quantity }]
	})
	return findEntitlementDivergences(entitlement, requested)
}

// ── Validação e envio ──────────────────────────────────────────────────────

export type FormErrors = Partial<Record<string, string>>

export type FormContext = {
	now: Date
	entitlement: SnackEntitlement | null
	lines: FormLine[]
	standardsById: Map<string, SnackStandardSnapshot>
	divergences: string[]
}

export function isLate(state: SnackRequestFormState, now: Date): boolean {
	const departure = departureIso(state)
	const pickup = pickupIso(state)
	if (!departure || !pickup) return false
	return leadTimeHours(now, pickup, departure) < MIN_LEAD_TIME_HOURS
}

export function validateForm(state: SnackRequestFormState, context: FormContext): FormErrors {
	const errors: FormErrors = {}
	const aerial = state.missionKind === "aerea"
	if (state.kitchenId == null) errors.kitchenId = "Escolha a cozinha apoiadora."
	if (!state.requesterUnitLabel.trim()) errors.requesterUnitLabel = "Informe o setor requisitante."
	if (!state.missionDescription.trim()) errors.missionDescription = "Descreva a missão."

	const departure = departureIso(state)
	if (!departure) errors.departureLocal = "Informe a data e a hora da partida."
	const total = toMinutes(state.totalHours, state.totalMins)
	if (total <= 0) errors.totalDuration = "Informe a duração total do deslocamento."
	else if (total > MAX_TOTAL_MINUTES) errors.totalDuration = `A duração total não pode passar de ${MAX_TOTAL_MINUTES / 60} h.`
	if (aerial && toMinutes(state.groundHours, state.groundMins) > MAX_GROUND_MINUTES) {
		errors.groundDuration = `O tempo em solo não pode passar de ${MAX_GROUND_MINUTES / 60} h.`
	}
	if (!state.stopsWithoutMess && state.hasMessStop) {
		const leg = toMinutes(state.legHours, state.legMins)
		if (leg <= 0) errors.legDuration = "Informe a maior perna até a escala com rancho."
		else if (leg > total) errors.legDuration = "A maior perna não pode ser maior que o deslocamento total."
	}
	if (aerial && !state.missionOrderNumber.trim()) errors.missionOrderNumber = "Missão aérea exige o número da ordem de missão."
	if (peopleCount(state) === 0) errors.people = aerial ? "Informe a tripulação ou os passageiros." : "Informe o efetivo."
	if (toCount(state.crewCount) > MAX_COUNT) {
		errors.crewCount = aerial ? `A tripulação não pode passar de ${MAX_COUNT} pessoas.` : `O efetivo não pode passar de ${MAX_COUNT} pessoas.`
	}
	if (toCount(state.paxCount) > MAX_COUNT) {
		errors.paxCount = aerial ? `Os passageiros não podem passar de ${MAX_COUNT} pessoas.` : `Os demais não podem passar de ${MAX_COUNT} pessoas.`
	}
	if (state.includesNonMilitary && !state.nonMilitaryReason.trim()) {
		errors.nonMilitaryReason = "Informe o motivo da participação de civis ou servidores na missão."
	}

	const materials = materialValues(state)
	for (const key of MATERIAL_KEYS) {
		if (materials[key] <= MAX_COUNT) continue
		errors[materialErrorKey(key)] = isMaterialOverridden(state, key)
			? `${MATERIAL_LABELS[key]}: no máximo ${MAX_COUNT}.`
			: `${MATERIAL_LABELS[key]}: o cálculo por pessoa passou de ${MAX_COUNT} — informe a quantidade.`
	}

	const pickup = pickupIso(state)
	if (state.pickupLocal && !pickup) errors.pickupLocal = "Data e hora da retirada incompletas."
	if (pickup && departure) {
		if (Date.parse(pickup) > Date.parse(departure)) errors.pickupLocal = "A retirada tem que ser antes da partida."
		else if (Date.parse(pickup) <= context.now.getTime()) errors.pickupLocal = "A retirada tem que ser no futuro."
	}
	if (!state.pickupResponsible.trim()) errors.pickupResponsible = "Informe o responsável pela retirada."
	if (isLate(state, context.now) && !state.lateReason.trim()) {
		errors.lateReason = `Pedido com menos de ${MIN_LEAD_TIME_HOURS} h de antecedência exige justificativa.`
	}

	const validLines = context.lines.filter((line) => line.standardId && context.standardsById.has(line.standardId) && toCount(line.quantity) > 0)
	if (context.lines.length > MAX_LINES) errors.lines = `O pedido aceita no máximo ${MAX_LINES} padrões — remova linhas.`
	else if (validLines.length === 0) errors.lines = "Inclua pelo menos um padrão com quantidade."
	else if (validLines.length !== context.lines.length) errors.lines = "Há linha sem padrão ou sem quantidade — complete ou remova."
	else if (validLines.some((line) => toCount(line.quantity) > MAX_COUNT)) errors.lines = `Cada padrão aceita no máximo ${MAX_COUNT} kits.`
	if (context.divergences.length > 0 && !state.divergenceReason.trim()) {
		errors.divergenceReason = "O pedido difere da sugestão da calculadora: explique o motivo."
	}
	return errors
}

function optionalText(value: string): string | undefined {
	const trimmed = value.trim()
	return trimmed ? trimmed : undefined
}

/** Monta o input do servidor. Chamar só com `validateForm` vazio. */
export function buildCreateInput(state: SnackRequestFormState, context: FormContext): CreateSnackRequest {
	const mission = toMissionInput(state)
	const pickup = pickupIso(state)
	if (!mission || !pickup || state.kitchenId == null) throw new Error("Formulário incompleto.")
	const materials = materialValues(state)
	return {
		...mission,
		kitchenId: state.kitchenId,
		requesterUnitLabel: state.requesterUnitLabel.trim(),
		vehicleType: optionalText(state.vehicleType),
		vehicleRegistration: optionalText(state.vehicleRegistration),
		vehicleOm: optionalText(state.vehicleOm),
		missionDescription: state.missionDescription.trim(),
		origin: optionalText(state.origin),
		destination: optionalText(state.destination),
		stops: optionalText(state.stops),
		missionOrderNumber: optionalText(state.missionOrderNumber),
		waterQuantity: materials.water,
		cupQuantity: materials.cups,
		iceQuantity: materials.ice,
		coffeeQuantity: materials.coffee,
		includesNonMilitary: state.includesNonMilitary,
		nonMilitaryReason: state.includesNonMilitary ? optionalText(state.nonMilitaryReason) : undefined,
		preference: refeicaoAllowed(context.entitlement) ? state.preference : "lanche",
		pickupAt: new Date(Date.parse(pickup)).toISOString(),
		pickupResponsible: state.pickupResponsible.trim(),
		fundingSource: state.fundingSource,
		lateReason: isLate(state, context.now) ? optionalText(state.lateReason) : undefined,
		divergenceReason: context.divergences.length > 0 ? optionalText(state.divergenceReason) : undefined,
		lines: context.lines.map((line) => ({ standardId: line.standardId as string, audience: line.audience, quantity: toCount(line.quantity) })),
	}
}
