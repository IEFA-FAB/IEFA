/**
 * Vencimento de rotina de manutenção: a unidade está em dia com este plano?
 *
 * Função PURA — nenhum acesso a banco e nenhuma leitura de relógio: `today` é parâmetro. Um
 * cálculo de vencimento que lê a hora do processo não é testável sem congelar o tempo, e é
 * exatamente o tipo de código que passa no CI e erra na virada do fuso.
 *
 * `next_due_on` NÃO é coluna. Persistir a data exigiria recalcular toda linha a cada execução
 * registrada e a cada edição de plano; a primeira divergência entre a coluna e a verdade seria
 * silenciosa, e ninguém confere data de vencimento contra o histórico.
 *
 * TRÊS estados, não dois. A âncora é procurada em ordem:
 *
 *   1. `lastPerformedOn` — a última execução registrada deste plano nesta unidade;
 *   2. `installedOn ?? acquiredOn` — quando nunca houve execução, o relógio começa a correr
 *      quando o equipamento chegou;
 *   3. nenhuma das duas → `unknown`, "sem registro". NUNCA "vencida".
 *
 * O terceiro estado é o que faz o relatório ser lido. Sem ele, no dia em que a rotina passa a
 * existir, 100% do parque nasce vermelho — e um relatório que acusa tudo esconde justamente a
 * unidade que está mesmo atrasada. "Sem registro" é uma informação diferente de "em dia" e de
 * "atrasada", e as três precisam ser distinguíveis à primeira vista.
 *
 * Datas são strings ISO `YYYY-MM-DD` e a aritmética é toda em UTC. Manutenção é agendada por
 * DIA, não por instante: converter para o fuso local faria "vence dia 30" virar 29 ou 31
 * dependendo de onde o servidor está.
 */

export const MAINTENANCE_DUE_STATES = ["ok", "overdue", "unknown"] as const
export type MaintenanceDueState = (typeof MAINTENANCE_DUE_STATES)[number]

/** De onde saiu a data que iniciou a contagem. `null` quando não há âncora. */
export type MaintenanceDueAnchor = "log" | "installation" | null

export interface MaintenanceDueInput {
	/** Periodicidade do plano, em dias. Deve ser > 0 (garantido por CHECK no banco). */
	intervalDays: number
	/** Folga antes de a rotina ser reportada como vencida. Default 0. */
	toleranceDays?: number
	/** `performed_on` da execução mais recente deste plano nesta unidade. */
	lastPerformedOn?: string | null
	/** `equipment_unit.installed_on`. */
	installedOn?: string | null
	/** `equipment_unit.acquired_on` — usada só quando não há `installed_on`. */
	acquiredOn?: string | null
	/** Data de referência, ISO `YYYY-MM-DD`. Injetada para manter a função pura. */
	today: string
}

export interface MaintenanceDue {
	state: MaintenanceDueState
	anchor: MaintenanceDueAnchor
	/** Data que iniciou a contagem. `null` quando `state` é `unknown`. */
	anchorDate: string | null
	/** Âncora + `intervalDays`. `null` quando `state` é `unknown`. */
	nextDueOn: string | null
	/**
	 * Dias corridos desde `nextDueOn`. Negativo = ainda no prazo; 0 = vence hoje.
	 * `null` quando `state` é `unknown` — não existe atraso sem âncora.
	 */
	daysPastDue: number | null
	/**
	 * Já passou de `nextDueOn` mas ainda está dentro de `toleranceDays`.
	 * Serve para a tela dizer "atrasada, mas na folga" sem inventar um quarto estado.
	 */
	withinTolerance: boolean
}

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** ISO `YYYY-MM-DD` → epoch em dias (UTC). Lança em formato inválido: data silenciosamente NaN vira vencimento silenciosamente errado. */
function toEpochDay(iso: string): number {
	if (!ISO_DATE.test(iso)) throw new RangeError(`data ISO inválida: ${iso}`)
	const ms = Date.parse(`${iso}T00:00:00Z`)
	if (Number.isNaN(ms)) throw new RangeError(`data ISO inválida: ${iso}`)
	return Math.round(ms / MS_PER_DAY)
}

/** epoch em dias (UTC) → ISO `YYYY-MM-DD`. */
function fromEpochDay(day: number): string {
	return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Primeira data não vazia da lista, com a origem correspondente. */
function pickAnchor(input: MaintenanceDueInput): { date: string; anchor: Exclude<MaintenanceDueAnchor, null> } | null {
	if (input.lastPerformedOn) return { date: input.lastPerformedOn, anchor: "log" }
	const installed = input.installedOn ?? input.acquiredOn
	if (installed) return { date: installed, anchor: "installation" }
	return null
}

export function computeMaintenanceDue(input: MaintenanceDueInput): MaintenanceDue {
	if (!Number.isInteger(input.intervalDays) || input.intervalDays <= 0) {
		throw new RangeError(`intervalDays deve ser inteiro > 0, recebido: ${input.intervalDays}`)
	}
	const tolerance = input.toleranceDays ?? 0
	if (!Number.isInteger(tolerance) || tolerance < 0) {
		throw new RangeError(`toleranceDays deve ser inteiro >= 0, recebido: ${tolerance}`)
	}

	const picked = pickAnchor(input)
	if (!picked) {
		return { state: "unknown", anchor: null, anchorDate: null, nextDueOn: null, daysPastDue: null, withinTolerance: false }
	}

	const nextDueDay = toEpochDay(picked.date) + input.intervalDays
	const daysPastDue = toEpochDay(input.today) - nextDueDay
	const overdue = daysPastDue > tolerance

	return {
		state: overdue ? "overdue" : "ok",
		anchor: picked.anchor,
		anchorDate: picked.date,
		nextDueOn: fromEpochDay(nextDueDay),
		daysPastDue,
		withinTolerance: daysPastDue > 0 && !overdue,
	}
}
