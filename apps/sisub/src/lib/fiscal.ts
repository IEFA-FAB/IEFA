import type { MealKey } from "@/types/domain/meal"
import type { ConfirmPresenceResult } from "@/types/domain/presence"

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
 * Crachás que o scanner deve ignorar, por OM + data + refeição.
 *
 * A câmera decodifica o mesmo QR várias vezes por segundo enquanto o crachá fica na frente
 * dela. Entra no cache (com despejo do mais antigo, LRU) só quem tem presença gravada naquela
 * refeição: cancelar o diálogo, escolher "não entra" ou falhar ao gravar não marca, e o militar
 * pode ser lido de novo. Para o crachá ainda parado na câmera não reabrir o diálogo na hora, o
 * fechamento sem gravação dá só uma pausa curta (`snooze`). A chave inclui a refeição porque
 * quem almoçou também janta.
 */
export interface ScanCache {
	has: (scope: ScanScope, uuid: string, now?: number) => boolean
	/** Presença gravada (ou que já existia) naquela refeição. */
	mark: (scope: ScanScope, uuid: string) => void
	/** Presença excluída: o militar volta a poder ser lido naquela refeição. */
	forget: (scope: ScanScope, uuid: string) => void
	/** Diálogo fechado sem gravar: ignora o mesmo crachá por `ms`, depois libera. */
	snooze: (scope: ScanScope, uuid: string, ms: number, now?: number) => void
}

export const SCAN_CACHE_MAX = 300

/** Pausa depois de fechar o diálogo sem gravar: tempo de o crachá sair da frente da câmera. */
export const SCAN_SNOOZE_MS = 5000

const buildScanCacheKey = (scope: ScanScope, uuid: string): string => `${scope.messHallId}|${scope.date}|${scope.meal}|${uuid}`

export function createScanCache(max: number = SCAN_CACHE_MAX): ScanCache {
	// Set preserva a ordem de inserção: o primeiro elemento é o mais antigo.
	const keys = new Set<string>()
	const snoozedUntil = new Map<string, number>()
	return {
		has: (scope, uuid, now = Date.now()) => {
			const key = buildScanCacheKey(scope, uuid)
			if (keys.has(key)) return true
			const until = snoozedUntil.get(key)
			if (until === undefined) return false
			if (until > now) return true
			snoozedUntil.delete(key)
			return false
		},
		mark: (scope, uuid) => {
			const key = buildScanCacheKey(scope, uuid)
			snoozedUntil.delete(key)
			if (keys.has(key)) return
			keys.add(key)
			if (keys.size > max) {
				const oldest = keys.values().next().value
				if (oldest !== undefined) keys.delete(oldest)
			}
		},
		forget: (scope, uuid) => {
			const key = buildScanCacheKey(scope, uuid)
			keys.delete(key)
			snoozedUntil.delete(key)
		},
		snooze: (scope, uuid, ms, now = Date.now()) => {
			snoozedUntil.set(buildScanCacheKey(scope, uuid), now + ms)
		},
	}
}

/** Resultado da confirmação que deixa presença gravada: só esse entra no cache do scanner. */
export function isPresenceRecorded(status: ConfirmPresenceResult["status"]): boolean {
	return status !== "skipped"
}
