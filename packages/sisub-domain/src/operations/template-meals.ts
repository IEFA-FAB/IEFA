/**
 * Leitura do efetivo base por refeição (kitchen.menu_template_meal), TOLERANTE à tabela
 * ausente.
 *
 * A migração 20260707120000 pode ainda não ter rodado quando o código sobe — padrão
 * conhecido deste repo ("deploy quebra prod até migrar"). Sem esta tolerância, a query
 * relacional derrubaria a leitura do template INTEIRO (getTemplate/applyTemplate/ATA),
 * fazendo os templates PARECEREM deletados. Aqui degradamos para vazio: o efetivo cai no
 * fallback legado (média dos headcount_override) e o template continua carregando normal.
 */

import { menuTemplateMealInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { inArray } from "drizzle-orm"

export type TemplateMealRow = typeof menuTemplateMealInKitchen.$inferSelect

/** True só para o erro Postgres "relation does not exist" (SQLSTATE 42P01) referente a
 * menu_template_meal — a ÚNICA falha que a leitura tolera (janela de migração). Timeout,
 * conexão, pool etc. NÃO caem aqui: precisam continuar altos. */
function isMenuTemplateMealMissing(err: unknown): boolean {
	const code = (err as { code?: unknown } | null)?.code
	if (code === "42P01") return true
	const message = err instanceof Error ? err.message : String(err)
	return /does not exist/i.test(message) && /menu_template_meal/i.test(message)
}

/** Retorna as linhas de efetivo base agrupadas por menu_template_id. Degrada para mapa vazio
 * APENAS quando a tabela não existe (migração 20260707120000 pendente); qualquer outra falha
 * de DB é re-lançada para não sub-dimensionar demanda em silêncio depois da migração. */
export async function fetchTemplateMealsSafe(db: SisubDb, templateIds: string[]): Promise<Map<string, TemplateMealRow[]>> {
	const byTemplate = new Map<string, TemplateMealRow[]>()
	if (templateIds.length === 0) return byTemplate
	try {
		const rows = await db.query.menuTemplateMealInKitchen.findMany({
			where: inArray(menuTemplateMealInKitchen.menuTemplateId, templateIds),
		})
		for (const row of rows) {
			if (!row.menuTemplateId) continue
			const list = byTemplate.get(row.menuTemplateId)
			if (list) list.push(row)
			else byTemplate.set(row.menuTemplateId, [row])
		}
	} catch (err) {
		// Só engole "tabela não existe"; o resto sobe (timeout/conexão/pool não podem virar silêncio).
		if (!isMenuTemplateMealMissing(err)) throw err
		// biome-ignore lint/suspicious/noConsole: sinal operacional da tabela opcional ausente — causa esperada é a migração 20260707120000 pendente
		console.warn("[sisub] menu_template_meal ausente (migração 20260707120000 pendente?); efetivo base ignorado, usando fallback legado.", err)
	}
	return byTemplate
}
