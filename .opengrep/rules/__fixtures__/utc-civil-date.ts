// Casos de teste de `.opengrep/rules/utc-civil-date.yaml`. Não é código do app.
//
// Rodar: opengrep test --config .opengrep/rules/utc-civil-date.yaml .opengrep/rules/__fixtures__/utc-civil-date.ts

declare function getBrasiliaToday(): string
declare function addCivilDays(date: string, days: number): string
declare const civilDate: string

// ruleid: utc-today-as-civil-date
export const a = new Date().toISOString().slice(0, 10)
// ruleid: utc-today-as-civil-date
export const b = new Date().toISOString().split("T")[0]
// ruleid: utc-today-as-civil-date
export const c = new Date().toISOString().substring(0, 7)
// ruleid: utc-today-as-civil-date
export const d = new Date(Date.now() + 30 * 86_400_000).toISOString().substring(0, 10)

export function viaVariable() {
	const now = new Date()
	now.setMonth(now.getMonth() - 3)
	// ruleid: utc-today-as-civil-date
	return now.toISOString().slice(0, 10)
}

export function civilArithmetic() {
	const d = new Date(`${civilDate}T12:00:00Z`)
	d.setUTCDate(d.getUTCDate() + 1)
	// ok: utc-today-as-civil-date
	return d.toISOString().slice(0, 10)
}

// ok: utc-today-as-civil-date
export const today = getBrasiliaToday()
// ok: utc-today-as-civil-date
export const future = addCivilDays(today, 30)
// ok: utc-today-as-civil-date
export const nextDay = new Date(`${civilDate}T12:00:00Z`).toISOString().slice(0, 10)
// ok: utc-today-as-civil-date
export const instant = new Date().toISOString()
