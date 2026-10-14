/**
 * Leitura e gravação de `inventory.kitchen_stock_settings`, com a versão conferida no servidor
 * (EDIT-SAFETY.md): a gravação leva o `updated_at` que a tela viu e o banco só aceita se ele ainda
 * for o atual, no `WHERE` do próprio comando. Divergiu: `STOCK_SETTINGS_CONFLICT_MESSAGE`.
 *
 * SQL pelo Drizzle (`getDb().execute`), não supabase-js: a coluna `default_lead_time_days`
 * (20261014120000) só entra em `generated.ts` e no schema Drizzle depois de aplicada (`db:types`,
 * `db:drizzle:pull`), e esses arquivos não se editam à mão. Mesmo caminho de `saram-link.ts`.
 * O guard de escopo (`requireStorageForKitchen`) é de quem chama.
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db.server"
import {
	parseStockSettingsRow,
	STOCK_SETTINGS_CONFLICT_MESSAGE,
	type StockSettings,
	type StockSettingsRow,
	type StockSettingsValues,
} from "@/lib/kitchen-stock-settings"

type Row = StockSettingsRow & Record<string, unknown>

export async function readKitchenStockSettings(kitchenId: number): Promise<StockSettings> {
	// `updated_at::text` mantém os microssegundos: o `Date` do driver os perderia, e a versão
	// conferida na gravação nunca bateria.
	const rows = await getDb().execute<Row>(sql`
		select segregation,
		       adjustment_approval_value::text as adjustment_approval_value,
		       issue_tolerance_pct::text as issue_tolerance_pct,
		       issue_tolerance_floor_value::text as issue_tolerance_floor_value,
		       count_tolerance_pct::text as count_tolerance_pct,
		       count_tolerance_value::text as count_tolerance_value,
		       default_lead_time_days,
		       updated_at::text as updated_at
		  from inventory.kitchen_stock_settings
		 where kitchen_id = ${kitchenId}
	`)
	return parseStockSettingsRow([...rows][0])
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
	const rows =
		expectedVersion == null
			? await getDb().execute<{ updated_at: string }>(sql`
				insert into inventory.kitchen_stock_settings
				       (kitchen_id, segregation, adjustment_approval_value, issue_tolerance_pct, issue_tolerance_floor_value,
				        count_tolerance_pct, count_tolerance_value, default_lead_time_days, updated_by, updated_at)
				values (${kitchenId}, ${values.segregation}, ${values.adjustmentApprovalValue}, ${values.issueTolerancePct},
				        ${values.issueToleranceFloorValue}, ${values.countTolerancePct}, ${values.countToleranceValue},
				        ${values.defaultLeadTimeDays}, ${actorId}::uuid, clock_timestamp())
				on conflict (kitchen_id) do nothing
				returning updated_at::text as updated_at
			`)
			: await getDb().execute<{ updated_at: string }>(sql`
				update inventory.kitchen_stock_settings
				   set segregation = ${values.segregation},
				       adjustment_approval_value = ${values.adjustmentApprovalValue},
				       issue_tolerance_pct = ${values.issueTolerancePct},
				       issue_tolerance_floor_value = ${values.issueToleranceFloorValue},
				       count_tolerance_pct = ${values.countTolerancePct},
				       count_tolerance_value = ${values.countToleranceValue},
				       default_lead_time_days = ${values.defaultLeadTimeDays},
				       updated_by = ${actorId}::uuid,
				       updated_at = clock_timestamp()
				 where kitchen_id = ${kitchenId}
				   and updated_at = ${expectedVersion}::timestamptz
				returning updated_at::text as updated_at
			`)
	const saved = [...rows][0]
	if (!saved) throw new Error(STOCK_SETTINGS_CONFLICT_MESSAGE)
	return { version: saved.updated_at }
}
