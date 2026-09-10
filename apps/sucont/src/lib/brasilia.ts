/**
 * @module brasilia
 * "Hoje" e formatação de data no fuso de Brasília.
 *
 * O banco roda em UTC e o container do app também. Entre 21:00 e 00:00 de
 * Brasília, `new Date()` já está no dia seguinte — e prazo de SIAFI ("2º dia útil
 * do mês") é horário de Brasília, não UTC. Foi assim que o aviso criado às 22h de
 * 30/09 saía carimbado com 01/10.
 *
 * A conta de dia útil NÃO mora aqui: ela é a função `sucont.nth_business_day` do
 * banco, porque o cron do `prazo_perdido` usa a mesma regra e duas implementações
 * divergiriam no primeiro feriado móvel. O que existe deste lado é só a data de
 * hoje, para comparar com o `due_on` que o banco devolve — e ela tem contrapartida
 * exata em `sucont.today()`.
 */

const TIME_ZONE = "America/Sao_Paulo"

/** Data de hoje em Brasília, em ISO (`YYYY-MM-DD`) — comparável com `due_on`. */
export function todayInBrasilia(now: Date = new Date()): string {
	// `en-CA` é o locale cujo formato numérico curto JÁ é ISO. Montar a string a
	// partir de `formatToParts` daria o mesmo resultado com mais linhas.
	return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

/** `YYYY-MM-DD` somado de `days` dias. Aritmética em UTC — a string já é local. */
export function addDays(isoDate: string, days: number): string {
	const base = new Date(`${isoDate}T00:00:00Z`)
	base.setUTCDate(base.getUTCDate() + days)
	return base.toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` → `DD/MM/AAAA`. Sem `Date`: a string já é a data local pronta. */
export function formatBrDate(isoDate: string): string {
	const [year, month, day] = isoDate.split("-")
	return year && month && day ? `${day}/${month}/${year}` : isoDate
}

/** Data de hoje em Brasília no formato que os avisos gravam (`DD/MM/AAAA`). */
export function todayBrLabel(now: Date = new Date()): string {
	return formatBrDate(todayInBrasilia(now))
}
