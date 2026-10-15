import type { MealKey } from "@/types/domain/meal"
import type { ConfirmPresenceResult, InsertPresenceOutcome } from "@/types/domain/presence"

export interface ScannerState {
	isReady: boolean
	isScanning: boolean
	hasPermission: boolean
	error?: string
}

export const MEAL_LABEL: Record<MealKey, string> = {
	cafe: "Café",
	almoco: "Almoço",
	janta: "Jantar",
	ceia: "Ceia",
}

/** Formata uma data no calendário LOCAL como `yyyy-mm-dd` (sem passar por UTC). */
const toLocalIsoDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export const generateRestrictedDates = (): string[] => {
	const today = new Date()
	const dates: string[] = []
	for (const offset of [-1, 0, 1]) {
		const d = new Date(today)
		d.setDate(today.getDate() + offset)
		// Data LOCAL: `toISOString()` converteria para UTC e, em fusos negativos (BRT),
		// à noite "hoje" vazaria para o dia seguinte — a fiscalização roda no jantar/ceia.
		dates.push(toLocalIsoDate(d))
	}
	return dates
}

export function inferDefaultMeal(now: Date = new Date()): MealKey {
	const toMin = (h: number, m = 0) => h * 60 + m
	const minutes = now.getHours() * 60 + now.getMinutes()
	const inRange = (start: number, end: number) => minutes >= start && minutes < end

	if (inRange(toMin(4), toMin(9))) return "cafe"
	if (inRange(toMin(9), toMin(15))) return "almoco"
	if (inRange(toMin(15), toMin(20))) return "janta"
	return "ceia"
}

/** O que o scanner precisa saber da tela para decidir se uma leitura já foi feita. */
export interface ScanScope {
	date: string
	meal: MealKey
	messHallId: number
}

/**
 * O que o scanner lembra de cada crachá, por OM + data + refeição.
 *
 * A câmera decodifica o mesmo QR várias vezes por segundo enquanto o crachá fica na frente
 * dela. Entra no cache (com despejo do mais antigo, LRU) só quem tem presença gravada NESTE
 * refeitório naquela refeição: cancelar o diálogo, escolher "não entra", presença em outro
 * refeitório ou falha ao gravar não marcam, e o militar pode ser lido de novo. Para o crachá
 * ainda parado na câmera não reabrir o diálogo na hora, o fechamento sem gravação dá só uma
 * pausa curta (`snooze`). Recusa, cancelamento e presença em outro refeitório ficam lembrados
 * (`deny`): a releitura reabre o diálogo com "Não" marcado e sem fechamento automático, para
 * nada gravar sem um toque do fiscal. A chave inclui a refeição porque quem almoçou também janta.
 */
export interface ScanCache {
	has: (scope: ScanScope, uuid: string, now?: number) => boolean
	/** Presença gravada (ou que já existia) neste refeitório naquela refeição. */
	mark: (scope: ScanScope, uuid: string) => void
	/** Presença excluída: o militar volta a poder ser lido naquela refeição. */
	forget: (scope: ScanScope, uuid: string) => void
	/** Diálogo fechado sem gravar: ignora o mesmo crachá por `ms`, depois libera. */
	snooze: (scope: ScanScope, uuid: string, ms: number, now?: number) => void
	/** Recusa, cancelamento ou presença em outro refeitório: a próxima leitura exige toque. */
	deny: (scope: ScanScope, uuid: string) => void
	isDenied: (scope: ScanScope, uuid: string) => boolean
}

export const SCAN_CACHE_MAX = 300

/** Pausa depois de fechar o diálogo sem gravar: tempo de o crachá sair da frente da câmera. */
export const SCAN_SNOOZE_MS = 5000

const buildScanCacheKey = (scope: ScanScope, uuid: string): string => `${scope.messHallId}|${scope.date}|${scope.meal}|${uuid}`

/** Acrescenta ao Set e despeja o mais antigo além de `max` (o Set preserva a ordem de inserção). */
function addBounded(set: Set<string>, key: string, max: number): void {
	if (set.has(key)) return
	set.add(key)
	if (set.size > max) {
		const oldest = set.values().next().value
		if (oldest !== undefined) set.delete(oldest)
	}
}

export function createScanCache(max: number = SCAN_CACHE_MAX): ScanCache {
	const recorded = new Set<string>()
	const denied = new Set<string>()
	const snoozedUntil = new Map<string, number>()
	return {
		has: (scope, uuid, now = Date.now()) => {
			const key = buildScanCacheKey(scope, uuid)
			if (recorded.has(key)) return true
			const until = snoozedUntil.get(key)
			if (until === undefined) return false
			if (until > now) return true
			snoozedUntil.delete(key)
			return false
		},
		mark: (scope, uuid) => {
			const key = buildScanCacheKey(scope, uuid)
			snoozedUntil.delete(key)
			denied.delete(key)
			addBounded(recorded, key, max)
		},
		forget: (scope, uuid) => {
			const key = buildScanCacheKey(scope, uuid)
			recorded.delete(key)
			snoozedUntil.delete(key)
		},
		snooze: (scope, uuid, ms, now = Date.now()) => {
			snoozedUntil.set(buildScanCacheKey(scope, uuid), now + ms)
		},
		deny: (scope, uuid) => {
			addBounded(denied, buildScanCacheKey(scope, uuid), max)
		},
		isDenied: (scope, uuid) => denied.has(buildScanCacheKey(scope, uuid)),
	}
}

/** Como terminou o diálogo de uma leitura; `null` = fechado sem confirmar (Cancelar/Esc). */
export type ScanDialogOutcome = "recorded" | "refused" | "unsaved" | null

/**
 * Como a confirmação termina para o scanner. Presença em outro refeitório conta como recusa:
 * nada foi gravado aqui, e reabrir com "Sim" e fechamento automático tentaria de novo a cada
 * leitura do crachá parado.
 */
export function toScanDialogOutcome(status: ConfirmPresenceResult["status"]): Exclude<ScanDialogOutcome, "unsaved" | null> {
	return status === "inserted" || status === "duplicate" ? "recorded" : "refused"
}

/**
 * Fechamento do diálogo: o que não gravou ganha a pausa curta, e Cancelar/Esc, "não entra" ou
 * presença em outro refeitório ficam lembrados como recusa naquela refeição.
 */
export function settleClosedScan(cache: ScanCache, scope: ScanScope, uuid: string, outcome: ScanDialogOutcome, now: number = Date.now()): void {
	if (outcome === "recorded") return
	cache.snooze(scope, uuid, SCAN_SNOOZE_MS, now)
	if (outcome === null || outcome === "refused") cache.deny(scope, uuid)
}

/** Abertura do diálogo: quem foi recusado nesta refeição reabre com "Não" e exige toque. */
export function openScanDialogDefaults(cache: ScanCache, scope: ScanScope, uuid: string): { willEnter: "sim" | "nao"; manual: boolean } {
	const manual = cache.isDenied(scope, uuid)
	return { willEnter: manual ? "nao" : "sim", manual }
}

/** Resultado da confirmação que deixa presença gravada neste refeitório: só esse entra no cache. */
export function isPresenceRecorded(status: ConfirmPresenceResult["status"]): boolean {
	return status === "inserted" || status === "duplicate"
}

/**
 * Lê a resposta de `insertPresenceFn` do ponto de vista de quem gravou em `messHallId`:
 * duplicidade só é "já registrado aqui" quando a presença existente é deste refeitório.
 */
export function classifyInsertOutcome(outcome: InsertPresenceOutcome, messHallId: number): "inserted" | "duplicate" | "elsewhere" {
	if (outcome.status === "inserted") return "inserted"
	return outcome.messHallId === messHallId ? "duplicate" : "elsewhere"
}

/** Frase para presença que já existe em outro refeitório (ou em lugar que não deu para ler). */
export function describePresenceElsewhere(messHallName: string | null): string {
	return messHallName
		? `Já há presença registrada nesta refeição em ${messHallName}. Nada foi registrado aqui.`
		: "Já há presença registrada nesta refeição em outro refeitório. Nada foi registrado aqui."
}
