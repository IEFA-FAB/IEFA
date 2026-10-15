/**
 * Leitura e gravação de `inventory.kitchen_stock_settings`, com a versão conferida no servidor
 * (EDIT-SAFETY.md): a gravação leva o `updated_at` que a tela viu e o banco só aceita se ele ainda
 * for o atual, no `WHERE` do próprio comando. Divergiu: `DomainError` com
 * `STOCK_SETTINGS_CONFLICT_MESSAGE`.
 *
 * SQL pelo Drizzle (`getDb().execute`), não supabase-js nem query tipada: a coluna
 * `default_lead_time_days` (20261014120000) só entra em `generated.ts` e no schema Drizzle depois
 * de aplicada (`db:types`, `db:drizzle:pull`), e esses arquivos não se editam à mão. As colunas
 * saem de uma lista só (`STOCK_SETTINGS_COLUMNS`), e os defaults de cozinha sem linha vêm de
 * `inventory.kitchen_settings`. Regerados os tipos, isto vira query tipada do Drizzle.
 *
 * Toda consulta passa por `runQuery`: o erro do driver (SQL, parâmetros, uuid do ator) fica no
 * log e o cliente lê só o prefixo. Quem chama traduz com `handleDomainError`, e o guard de escopo
 * (`requireStorageForKitchen`) também é de quem chama.
 */

import { DomainError } from "@iefa/sisub-domain/types"
import { runQuery } from "@iefa/sisub-domain/utils"
import { type SQL, sql } from "drizzle-orm"
import { getDb } from "@/lib/db.server"
import {
	parseStockSettingsRow,
	STOCK_SETTINGS_COLUMNS,
	STOCK_SETTINGS_CONFLICT_MESSAGE,
	type StockSettings,
	type StockSettingsRow,
	type StockSettingsValues,
} from "@/lib/kitchen-stock-settings"

export const STOCK_SETTINGS_CONFLICT = "STOCK_SETTINGS_CONFLICT"

const FIELDS = Object.entries(STOCK_SETTINGS_COLUMNS) as Array<[keyof StockSettingsValues, string]>
const list = (parts: SQL[]) => sql.join(parts, sql`, `)

export async function readKitchenStockSettings(kitchenId: number): Promise<StockSettings> {
	// Tudo em texto: numeric sem arredondar e `updated_at` com os microssegundos, que o `Date` do
	// driver perderia (a versão conferida na gravação nunca bateria).
	const rows = await runQuery(
		"STOCK_SETTINGS_READ",
		() =>
			getDb().execute<StockSettingsRow & Record<string, unknown>>(sql`
				select ${list(FIELDS.map(([, column]) => sql`s.${sql.identifier(column)}::text as ${sql.identifier(column)}`))},
				       s.updated_at::text as updated_at,
				       exists (select 1 from inventory.kitchen_stock_settings k where k.kitchen_id = ${kitchenId}) as has_row
				  from inventory.kitchen_settings(${kitchenId}) s
			`),
		{ prefix: "Erro ao carregar a configuração de estoque da cozinha" }
	)
	const row = [...rows][0]
	if (!row) throw new DomainError("STOCK_SETTINGS_READ", "Erro ao carregar a configuração de estoque da cozinha")
	return parseStockSettingsRow(row)
}

/**
 * Grava a configuração inteira da cozinha se a versão que a tela viu ainda for a atual.
 * `expectedVersion: null` = a tela viu a cozinha sem linha; se alguém criou a linha no meio-tempo,
 * é conflito, não sobrescrita. Devolve a versão nova.
 */
export async function writeKitchenStockSettings(input: {
	kitchenId: number
	values: StockSettingsValues
	expectedVersion: string | null
	actorId: string
}): Promise<{ version: string }> {
	const { kitchenId, values, expectedVersion, actorId } = input
	const columns = FIELDS.map(([, column]) => sql`${sql.identifier(column)}`)
	const params = FIELDS.map(([field]) => sql`${values[field]}`)
	const assignments = FIELDS.map(([field, column]) => sql`${sql.identifier(column)} = ${values[field]}`)
	const statement =
		expectedVersion == null
			? sql`
				insert into inventory.kitchen_stock_settings (kitchen_id, ${list(columns)}, updated_by, updated_at)
				values (${kitchenId}, ${list(params)}, ${actorId}::uuid, clock_timestamp())
				on conflict (kitchen_id) do nothing
				returning updated_at::text as updated_at
			`
			: sql`
				update inventory.kitchen_stock_settings
				   set ${list(assignments)}, updated_by = ${actorId}::uuid, updated_at = clock_timestamp()
				 where kitchen_id = ${kitchenId}
				   and updated_at = ${expectedVersion}::timestamptz
				returning updated_at::text as updated_at
			`
	const rows = await runQuery("STOCK_SETTINGS_WRITE", () => getDb().execute<{ updated_at: string }>(statement), {
		prefix: "Erro ao salvar a configuração de estoque da cozinha",
	})
	const saved = [...rows][0]
	if (!saved) throw new DomainError(STOCK_SETTINGS_CONFLICT, STOCK_SETTINGS_CONFLICT_MESSAGE)
	return { version: saved.updated_at }
}
