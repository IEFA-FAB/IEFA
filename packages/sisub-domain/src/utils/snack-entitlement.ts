/**
 * Dotação de Lanche de Bordo e de Apoio — as regras do Módulo 7 do Manual Eletrônico do
 * SISUB (SDAB, atualização de 27 NOV 2025) como função pura.
 *
 * É a MESMA função na tela (sugestão ao vivo) e no servidor (snapshot gravado no pedido):
 * se as duas divergissem, a cozinha veria uma sugestão que o comensal não viu.
 *
 * O resultado é SUGESTÃO com justificativa, não trava. Cada linha carrega o id da regra
 * (tabela "Tabela de regras" do design da change `sisub-snack-support-requests`) e o título
 * da seção da norma — a numeração do módulo tem erros (7.2.1.3.4 dentro do Apoio A,
 * "1.2.2.1.7"), então a citação é pelo título, não pelo número.
 *
 * Onde a própria norma se contradiz, a decisão está marcada com N1…N7 (mesmo design).
 */

export type SnackFamily = "bordo" | "apoio"
export type SnackClass = "A" | "B" | "C"
export type SnackVariant = "lanche" | "refeicao"
export type SnackAudience = "crew" | "pax"
export type MissionKind = "aerea" | "terrestre"
export type MealWindowKey = "cafe" | "almoco" | "jantar"

export const SNACK_FAMILIES: readonly SnackFamily[] = ["bordo", "apoio"]
export const SNACK_CLASSES: readonly SnackClass[] = ["A", "B", "C"]
export const SNACK_VARIANTS: readonly SnackVariant[] = ["lanche", "refeicao"]

export type KcalRange = { min: number; max: number }

export type SnackMissionInput = {
	missionKind: MissionKind
	/** Decolagem/partida, ISO 8601 com fuso. */
	departureAt: string
	/** Duração total do voo/deslocamento, da partida ao destino final, em minutos. */
	totalMinutes: number
	/**
	 * Maior perna até uma escala COM apoio de rancho, em minutos. Nulo = voo direto ou
	 * nenhuma escala com rancho. Só vale quando `stopsWithoutMess` é falso.
	 */
	longestLegMinutes: number | null
	/** Há pouso intermediário em localidade sem apoio de rancho (7.4.13). */
	stopsWithoutMess: boolean
	/** Tempo em solo da tripulação somado ao envolvimento: pré-voo, briefing, debriefing (7.2.1.2.2). */
	groundMinutes: number
	/** Missão operacional. Voo pessoal, administrativo ou não operacional = falso (7.2.1.2.1). */
	isOperational: boolean
	/** Aeronave dotada de copa ou minicozinha (7.2.1.2.3). */
	hasGalley: boolean
	/** Forno elétrico ou similar instalado — exigido para grande refeição (7.2.1.2.6). */
	hasOven: boolean
	crewCount: number
	paxCount: number
}

export type SnackEntitlementLine = {
	family: SnackFamily
	snackClass: SnackClass
	audience: SnackAudience
	/** Unidades sugeridas para o público inteiro (não por pessoa). */
	quantity: number
	/** A cozinha apoiadora decide se fornece (Classe C a passageiro de voo não operacional). */
	optional: boolean
	kcal: KcalRange
	variants: SnackVariant[]
	ruleId: string
	reason: string
	normRef: string
}

export type SnackRuleNote = { ruleId: string; text: string; normRef: string }

export type SnackEntitlement = {
	family: SnackFamily
	/** Duração que decide a classe, depois de aplicar as escalas (7.4.13). */
	effectiveMinutes: number
	/** Envolvimento da tripulação: duração efetiva + tempo em solo. Só missão aérea. */
	involvementMinutes: number | null
	mealWindowsCovered: MealWindowKey[]
	lines: SnackEntitlementLine[]
	notes: SnackRuleNote[]
}

/**
 * Janelas de refeição do rancho, hora de Brasília. O sisub não tem horário de refeição por
 * cozinha (decisão N6): estas janelas decidem a regra R-B2 e a exigência de forno (R-V2).
 */
export const MEAL_WINDOWS: Record<MealWindowKey, { label: string; start: number; end: number }> = {
	cafe: { label: "café da manhã", start: 6 * 60, end: 8 * 60 },
	almoco: { label: "almoço", start: 11 * 60, end: 13 * 60 + 30 },
	jantar: { label: "jantar", start: 18 * 60, end: 20 * 60 },
}

/**
 * Brasília é UTC−3 fixo desde o fim do horário de verão (2019). Deslocamento fixo em vez de
 * `Intl`: a função roda no navegador e no servidor e tem que dar o MESMO resultado nos dois.
 */
const BRASILIA_OFFSET_MINUTES = -3 * 60
const DAY_MINUTES = 24 * 60

export const NORM_REFS = {
	bordoA: "Lanche de Bordo “Classe A”",
	bordoB: "Lanche de Bordo “Classe B”",
	bordoC: "Lanche de Bordo “Classe C”",
	apoioA: "Lanche de Apoio “Classe A”",
	apoioB: "Lanche de Apoio “Classe B”",
	stops: "Recomendações — deslocamento com parada sem apoio de rancho",
} as const

/** Faixa de valor calórico total de cada classe. A Classe C depende da duração (N2). */
export function kcalRangeFor(family: SnackFamily, snackClass: SnackClass, effectiveMinutes = 0): KcalRange {
	if (family === "bordo") {
		if (snackClass === "A") return { min: 0, max: 100 }
		if (snackClass === "B") return { min: 300, max: 800 }
		return effectiveMinutes > 15 * 60 ? { min: 1200, max: 2000 } : { min: 600, max: 1200 }
	}
	if (snackClass === "A") return { min: 300, max: 800 }
	return { min: 600, max: 1200 }
}

/** Janelas de refeição que o intervalo [partida, partida + duração] atravessa, em qualquer dia. */
export function mealWindowsCovered(departureAt: string, durationMinutes: number): MealWindowKey[] {
	const departure = Date.parse(departureAt)
	if (!Number.isFinite(departure) || durationMinutes <= 0) return []
	const localStart = Math.floor(departure / 60000) + BRASILIA_OFFSET_MINUTES
	const localEnd = localStart + durationMinutes
	const firstDay = Math.floor(localStart / DAY_MINUTES)
	const lastDay = Math.floor(localEnd / DAY_MINUTES)

	const covered = new Set<MealWindowKey>()
	for (let day = firstDay; day <= lastDay; day++) {
		for (const [key, window] of Object.entries(MEAL_WINDOWS) as [MealWindowKey, (typeof MEAL_WINDOWS)[MealWindowKey]][]) {
			const windowStart = day * DAY_MINUTES + window.start
			const windowEnd = day * DAY_MINUTES + window.end
			if (localStart < windowEnd && localEnd > windowStart) covered.add(key)
		}
	}
	return (Object.keys(MEAL_WINDOWS) as MealWindowKey[]).filter((key) => covered.has(key))
}

/** Duração que decide a classe: o deslocamento total, salvo escala com rancho (7.4.13, R-P). */
export function effectiveMissionMinutes(input: Pick<SnackMissionInput, "totalMinutes" | "longestLegMinutes" | "stopsWithoutMess">): number {
	const total = Math.max(0, input.totalMinutes)
	if (input.stopsWithoutMess || input.longestLegMinutes == null) return total
	return Math.min(total, Math.max(0, input.longestLegMinutes))
}

export function calculateSnackEntitlement(input: SnackMissionInput): SnackEntitlement {
	return input.missionKind === "aerea" ? calculateBoarding(input) : calculateSupport(input)
}

function calculateBoarding(input: SnackMissionInput): SnackEntitlement {
	const effective = effectiveMissionMinutes(input)
	const involvement = effective + Math.max(0, input.groundMinutes)
	const windows = mealWindowsCovered(input.departureAt, effective)
	const crew = Math.max(0, input.crewCount)
	const pax = Math.max(0, input.paxCount)
	const lines: SnackEntitlementLine[] = []
	const notes: SnackRuleNote[] = []

	if (input.stopsWithoutMess) {
		notes.push({ ruleId: "R-P", text: "Há escala sem apoio de rancho: o lanche cobre o tempo total do deslocamento.", normRef: NORM_REFS.stops })
	}

	// R-A — toda missão aérea, tripulação e passageiros.
	const kcalA = kcalRangeFor("bordo", "A")
	const reasonA = "Hidratação e atenção: água e café ou chá para todos a bordo."
	if (crew > 0) lines.push(line("bordo", "A", "crew", crew, false, kcalA, [], "R-A", reasonA, NORM_REFS.bordoA))
	if (pax > 0) lines.push(line("bordo", "A", "pax", pax, false, kcalA, [], "R-A", reasonA, NORM_REFS.bordoA))

	const coversLargeMeal = windows.includes("almoco") || windows.includes("jantar")
	const variants = allowedBoardingVariants(input.hasGalley, input.hasOven, coversLargeMeal)
	if (!input.hasGalley) {
		notes.push({ ruleId: "R-V1", text: "Aeronave sem copa ou minicozinha: só sanduíche (variante lanche).", normRef: NORM_REFS.bordoB })
	} else if (!input.hasOven && coversLargeMeal) {
		notes.push({
			ruleId: "R-V2",
			text: "Almoço ou jantar a bordo exige forno para descongelar ou reaquecer; sem forno, só lanche.",
			normRef: NORM_REFS.bordoB,
		})
	}

	if (effective >= 6 * 60) {
		// R-C1 — longo curso, uma cota por pessoa por dia.
		const days = Math.max(1, Math.ceil(effective / DAY_MINUTES))
		const kcalC = kcalRangeFor("bordo", "C", effective)
		const reason = `Voo de longo curso (${formatDuration(effective)}): ${days === 1 ? "1 cota" : `${days} cotas`} por pessoa, uma por dia de missão.`
		if (crew > 0) lines.push(line("bordo", "C", "crew", crew * days, false, kcalC, variants, "R-C1", reason, NORM_REFS.bordoC))
		if (pax > 0) {
			if (input.isOperational) {
				lines.push(
					line("bordo", "C", "pax", pax * days, false, kcalC, variants, "R-C1", `${reason} Militares em serviço da missão operacional.`, NORM_REFS.bordoC)
				)
			} else {
				lines.push(
					line(
						"bordo",
						"C",
						"pax",
						pax * days,
						true,
						kcalC,
						variants,
						"R-C3",
						"Passageiros de voo não operacional: a Classe C pode ser fornecida conforme a disponibilidade da OM apoiadora.",
						NORM_REFS.bordoC
					)
				)
			}
		}
		if (effective > 15 * 60) {
			notes.push({ ruleId: "R-C2", text: "Viagem acima de 15 h: valor calórico de 1.200 a 2.000 kcal.", normRef: NORM_REFS.bordoC })
		}
		return { family: "bordo", effectiveMinutes: effective, involvementMinutes: involvement, mealWindowsCovered: windows, lines, notes }
	}

	// Classe B: envolvimento acima de 3 h (R-B1), voo de 1 a 3 h sobre horário de refeição
	// (R-B2), ou — N7 — voo abaixo de 6 h com envolvimento de 6 h ou mais, que a norma deixa
	// sem classe (a B exige envolvimento < 6 h; a C exige VOO ≥ 6 h).
	let ruleB: { id: string; reason: string } | null = null
	if (involvement > 3 * 60) {
		ruleB =
			involvement >= 6 * 60
				? {
						id: "N7",
						reason: `Envolvimento de ${formatDuration(involvement)} com voo abaixo de 6 h: a norma não prevê a Classe C sem voo de longo curso; aplicada a Classe B.`,
					}
				: { id: "R-B1", reason: `Envolvimento da tripulação de ${formatDuration(involvement)} (mais de 3 h e menos de 6 h).` }
	} else if (effective >= 60 && effective <= 3 * 60 && windows.length > 0) {
		const labels = windows.map((key) => MEAL_WINDOWS[key].label).join(", ")
		ruleB = { id: "R-B2", reason: `Voo de ${formatDuration(effective)} no horário de ${labels}: a refeição no rancho fica inviável.` }
	}

	if (ruleB) {
		const kcalB = kcalRangeFor("bordo", "B")
		if (crew > 0) lines.push(line("bordo", "B", "crew", crew, false, kcalB, variants, ruleB.id, ruleB.reason, NORM_REFS.bordoB))
		if (pax > 0) {
			if (input.isOperational) {
				lines.push(
					line("bordo", "B", "pax", pax, false, kcalB, variants, ruleB.id, `${ruleB.reason} Militares em serviço da missão operacional.`, NORM_REFS.bordoB)
				)
			} else {
				notes.push({
					ruleId: "R-B3",
					text: "A Classe B não se aplica a passageiros de voo pessoal, administrativo ou não operacional.",
					normRef: NORM_REFS.bordoB,
				})
			}
		}
	}

	return { family: "bordo", effectiveMinutes: effective, involvementMinutes: involvement, mealWindowsCovered: windows, lines, notes }
}

function calculateSupport(input: SnackMissionInput): SnackEntitlement {
	const effective = effectiveMissionMinutes(input)
	const windows = mealWindowsCovered(input.departureAt, effective)
	const lines: SnackEntitlementLine[] = []
	const notes: SnackRuleNote[] = []
	const audiences: [SnackAudience, number][] = [
		["crew", Math.max(0, input.crewCount)],
		["pax", Math.max(0, input.paxCount)],
	]

	if (input.stopsWithoutMess) {
		notes.push({ ruleId: "R-P", text: "Há parada sem apoio de rancho: o lanche cobre o tempo total do deslocamento.", normRef: NORM_REFS.stops })
	}

	if (effective <= 2 * 60) {
		notes.push({ ruleId: "R-T0", text: `Deslocamento de ${formatDuration(effective)}: até 2 h a norma não prevê lanche de apoio.`, normRef: NORM_REFS.apoioA })
		return { family: "apoio", effectiveMinutes: effective, involvementMinutes: null, mealWindowsCovered: windows, lines, notes }
	}

	if (effective < 4 * 60) {
		const kcal = kcalRangeFor("apoio", "A")
		const reason = `Missão terrestre de ${formatDuration(effective)} (mais de 2 h e menos de 4 h): um sanduíche e uma bebida por pessoa.`
		for (const [audience, count] of audiences) {
			if (count > 0) lines.push(line("apoio", "A", audience, count, false, kcal, ["lanche"], "R-T1", reason, NORM_REFS.apoioA))
		}
		return { family: "apoio", effectiveMinutes: effective, involvementMinutes: null, mealWindowsCovered: windows, lines, notes }
	}

	// N1 — a norma diz "> 4 h e < 8 h": 4 h e 8 h exatas ficariam sem classe. Ambas vão à B.
	const kcal = kcalRangeFor("apoio", "B")
	const reasonB =
		effective === 4 * 60 || effective === 8 * 60
			? `Missão terrestre de exatamente ${formatDuration(effective)}: a norma não classifica a fronteira; aplicada a Classe B.`
			: `Missão terrestre de ${formatDuration(effective)}: uma refeição ou lanche reforçado por pessoa.`
	const ruleB = effective === 4 * 60 || effective === 8 * 60 ? "N1" : "R-T2"
	for (const [audience, count] of audiences) {
		if (count > 0) lines.push(line("apoio", "B", audience, count, false, kcal, ["lanche", "refeicao"], ruleB, reasonB, NORM_REFS.apoioB))
	}

	if (effective > 8 * 60) {
		const extraPerPerson = Math.ceil((effective - 8 * 60) / (4 * 60))
		const reason = `Missão acima de 8 h: ${extraPerPerson === 1 ? "1 unidade adicional" : `${extraPerPerson} unidades adicionais`} por pessoa sugerida(s), uma por bloco de 4 h além das 8 h. Ajuste conforme a atividade.`
		for (const [audience, count] of audiences) {
			if (count > 0) lines.push(line("apoio", "B", audience, count * extraPerPerson, false, kcal, ["lanche", "refeicao"], "R-T3", reason, NORM_REFS.apoioB))
		}
	}

	return { family: "apoio", effectiveMinutes: effective, involvementMinutes: null, mealWindowsCovered: windows, lines, notes }
}

function allowedBoardingVariants(hasGalley: boolean, hasOven: boolean, coversLargeMeal: boolean): SnackVariant[] {
	if (!hasGalley) return ["lanche"]
	if (coversLargeMeal && !hasOven) return ["lanche"]
	return ["lanche", "refeicao"]
}

function line(
	family: SnackFamily,
	snackClass: SnackClass,
	audience: SnackAudience,
	quantity: number,
	optional: boolean,
	kcal: KcalRange,
	variants: SnackVariant[],
	ruleId: string,
	reason: string,
	normRef: string
): SnackEntitlementLine {
	return { family, snackClass, audience, quantity, optional, kcal, variants, ruleId, reason, normRef }
}

/** 90 → "1 h 30 min"; 360 → "6 h"; 45 → "45 min". */
export function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	if (hours === 0) return `${rest} min`
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/**
 * Soma a sugestão por (família, classe, público). É a chave com que o pedido é comparado à
 * sugestão: pedir outra classe ou quantidade maior exige justificativa.
 */
export function summarizeEntitlement(entitlement: SnackEntitlement): Map<string, { quantity: number; optional: boolean }> {
	const summary = new Map<string, { quantity: number; optional: boolean }>()
	for (const item of entitlement.lines) {
		const key = entitlementKey(item.family, item.snackClass, item.audience)
		const prev = summary.get(key)
		summary.set(key, { quantity: (prev?.quantity ?? 0) + item.quantity, optional: (prev?.optional ?? true) && item.optional })
	}
	return summary
}

export function entitlementKey(family: SnackFamily, snackClass: SnackClass, audience: SnackAudience): string {
	return `${family}:${snackClass}:${audience}`
}

/**
 * O pedido diverge da sugestão quando pede classe que ela não traz ou mais unidades do que
 * ela sugere. Pedir MENOS não diverge: a norma dá teto de dotação, não piso de consumo.
 */
export function findEntitlementDivergences(
	entitlement: SnackEntitlement,
	requested: { family: SnackFamily; snackClass: SnackClass; audience: SnackAudience; quantity: number }[]
): string[] {
	const suggested = summarizeEntitlement(entitlement)
	const totals = new Map<string, number>()
	for (const item of requested) {
		const key = entitlementKey(item.family, item.snackClass, item.audience)
		totals.set(key, (totals.get(key) ?? 0) + item.quantity)
	}
	const divergences: string[] = []
	for (const [key, quantity] of totals) {
		const hint = suggested.get(key)
		if (!hint) divergences.push(key)
		else if (quantity > hint.quantity) divergences.push(key)
	}
	return divergences.toSorted()
}
