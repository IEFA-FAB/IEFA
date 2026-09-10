/**
 * Stubs vazios dos server modules que `#/lib/queries` importa mas que a casca e a
 * área de trabalho não usam.
 *
 * Existem só para o grafo resolver: em Vite puro, sem o plugin do TanStack Start,
 * o `createServerFn` real arrasta `@tanstack/start-server-core` e o build quebra em
 * `Missing "#tanstack-start-entry" specifier`.
 */

export async function listAuditorRunsFn(): Promise<never[]> {
	return []
}
export async function startAuditorRunFn(): Promise<never[]> {
	return []
}
export async function saveAuditorBalancesFn(): Promise<never[]> {
	return []
}
export async function loadAuditorBalancesFn(): Promise<never[]> {
	return []
}
export async function listGeneratedMessagesFn(): Promise<never[]> {
	return []
}
export async function registerAuditorMessageFn(): Promise<never[]> {
	return []
}
export async function finalizeAuditorRunFn(): Promise<never[]> {
	return []
}
export async function listReportsFn(): Promise<never[]> {
	return []
}
export async function createReportFn(): Promise<never[]> {
	return []
}
export async function deleteReportFn(): Promise<never[]> {
	return []
}
export async function listDgcRunsFn(): Promise<never[]> {
	return []
}
export async function startDgcRunFn(): Promise<never[]> {
	return []
}
export async function saveDgcAnalysisFn(): Promise<never[]> {
	return []
}
export async function loadDgcRunFn(): Promise<never[]> {
	return []
}
