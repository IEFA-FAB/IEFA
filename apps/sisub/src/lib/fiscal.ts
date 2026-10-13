import type { MealKey } from "@/types/domain/meal"

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
 * UUIDs já lidos pelo scanner, por OM + data + refeição, com despejo do mais antigo (LRU).
 *
 * Existe porque a câmera decodifica o mesmo QR várias vezes por segundo enquanto o crachá
 * fica na frente dela: sem isto, o diálogo do mesmo militar reabriria em laço. A chave
 * inclui a refeição porque quem almoçou também janta: com chave só por UUID, o fiscal que
 * trocava almoço → jantar via as leituras do jantar ignoradas em silêncio.
 */
export interface ScanCache {
	has: (scope: ScanScope, uuid: string) => boolean
	mark: (scope: ScanScope, uuid: string) => void
	/** Presença excluída: o militar volta a poder ser lido naquela refeição. */
	forget: (scope: ScanScope, uuid: string) => void
}

export const SCAN_CACHE_MAX = 300

const scanCacheKey = (scope: ScanScope, uuid: string): string => `${scope.messHallId}|${scope.date}|${scope.meal}|${uuid}`

export function createScanCache(max: number = SCAN_CACHE_MAX): ScanCache {
	// Set preserva a ordem de inserção: o primeiro elemento é o mais antigo.
	const keys = new Set<string>()
	return {
		has: (scope, uuid) => keys.has(scanCacheKey(scope, uuid)),
		mark: (scope, uuid) => {
			const key = scanCacheKey(scope, uuid)
			if (keys.has(key)) return
			keys.add(key)
			if (keys.size > max) {
				const oldest = keys.values().next().value
				if (oldest !== undefined) keys.delete(oldest)
			}
		},
		forget: (scope, uuid) => {
			keys.delete(scanCacheKey(scope, uuid))
		},
	}
}
