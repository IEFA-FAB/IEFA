/**
 * Changelog publicado — leitura paginada de `kitchen.changelog`. Drizzle query layer
 * (migração PostgREST→Drizzle, fase 3).
 *
 * SEM `ctx`, de propósito: a rota `_public/changelog` é anônima por contrato (o endpoint
 * consta da allowlist de `server-fn-auth.contract.test.ts`), e receber o contexto só para
 * ignorá-lo fingiria uma barreira que não existe. O filtro `published = true` é a barreira
 * real — rascunho de changelog não sai daqui.
 *
 * `hasMore` sai de overfetch (pageSize + 1) em vez de um `count`: uma segunda query de
 * COUNT na mesma tabela custa mais do que a linha extra que se joga fora.
 */

import { changelogInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { desc, eq } from "drizzle-orm"
import { runQuery } from "../utils/index.ts"

export type ChangelogEntry = {
	id: string
	version: string | null
	title: string
	body: string
	tags: string[] | null
	published_at: string
	published: boolean
}

export type ChangelogPageResult = {
	items: ChangelogEntry[]
	nextPage?: number
	hasMore: boolean
}

export type ListChangelogPage = {
	/** Página base-0. */
	page: number
	pageSize: number
}

/** Projeção snake_case do contrato — o cliente lê `published_at` desde a primeira versão da rota. */
const CHANGELOG_COLS = {
	id: changelogInKitchen.id,
	version: changelogInKitchen.version,
	title: changelogInKitchen.title,
	body: changelogInKitchen.body,
	tags: changelogInKitchen.tags,
	published_at: changelogInKitchen.publishedAt,
	published: changelogInKitchen.published,
} as const

/**
 * Uma página de entradas publicadas, mais recente primeiro.
 *
 * @returns `nextPage` só quando `hasMore` — o hook de scroll infinito para quando ele é `undefined`.
 */
export async function listChangelogPage(db: SisubDb, input: ListChangelogPage): Promise<ChangelogPageResult> {
	const rows = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select(CHANGELOG_COLS)
				.from(changelogInKitchen)
				.where(eq(changelogInKitchen.published, true))
				.orderBy(desc(changelogInKitchen.publishedAt))
				// +1 linha para saber se existe próxima página sem um COUNT.
				.limit(input.pageSize + 1)
				.offset(input.page * input.pageSize),
		{ prefix: "Não foi possível carregar o changelog" }
	)

	const hasMore = rows.length > input.pageSize
	const items = hasMore ? rows.slice(0, input.pageSize) : rows

	return { items, nextPage: hasMore ? input.page + 1 : undefined, hasMore }
}
