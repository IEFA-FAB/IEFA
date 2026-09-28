// Casos de teste de `.opengrep/rules/postgrest-partial-index-upsert.yaml`. Não é código do app:
// fica fora de `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/postgrest-partial-index-upsert.yaml .opengrep/rules/__fixtures__/postgrest-partial-index-upsert.ts

declare const supabase: any
declare const ctx: any
declare const row: Record<string, unknown>
declare function untypedFrom(ctx: unknown, table: string, schema?: string): any
declare function inventory(): any

export async function bad() {
	// O caso que originou a regra: índice `uq_price_research_idempotency ... where idempotency_key is not null`.
	// ruleid: postgrest-upsert-on-partial-unique-index
	await supabase.from("price_research").upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id")

	// Chat do sisub: `daily_menu_active_unique ... where deleted_at is null`, pelo helper `untypedFrom`.
	// ruleid: postgrest-upsert-on-partial-unique-index
	await untypedFrom(ctx, "daily_menu").upsert(row, { onConflict: "service_date,meal_type_id,kitchen_id", ignoreDuplicates: true })

	// A ordem das colunas não salva: o Postgres procura o índice pelo conjunto.
	// ruleid: postgrest-upsert-on-partial-unique-index
	await supabase.schema("kitchen").from("daily_menu").upsert(row, { onConflict: "kitchen_id, service_date, meal_type_id" })

	// Cliente vindo de função, schema qualificado e opções depois do `onConflict`.
	// ruleid: postgrest-upsert-on-partial-unique-index
	await inventory().from("stock_cost").upsert(row, { onConflict: "kitchen_id,ingredient_id", ignoreDuplicates: false })
}

export async function ok() {
	// ok: postgrest-upsert-on-partial-unique-index
	await supabase.from("price_research").insert(row).select("id").single()

	// Índice TOTAL (`uq_price_research_sample_item_sample`): o `onConflict` do PostgREST serve.
	// ok: postgrest-upsert-on-partial-unique-index
	await supabase.from("price_research_sample").upsert([row], { onConflict: "research_item_id,price_sample_id", ignoreDuplicates: true })

	// Mesma coluna de um índice parcial, mas em outra tabela (`gs1_integration.gtin`, PK total).
	// ok: postgrest-upsert-on-partial-unique-index
	await supabase.from("gtin").upsert(row, { onConflict: "gtin", ignoreDuplicates: true })

	// Tabela com índice parcial, mas o alvo é outro índice, total (a PK).
	// ok: postgrest-upsert-on-partial-unique-index
	await supabase.from("daily_menu").upsert(row, { onConflict: "id" })

	// Subconjunto das colunas não é o conjunto do índice parcial.
	// ok: postgrest-upsert-on-partial-unique-index
	await supabase.from("daily_menu").upsert(row, { onConflict: "service_date,kitchen_id" })
}
