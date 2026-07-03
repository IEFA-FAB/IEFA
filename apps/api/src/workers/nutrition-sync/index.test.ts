import { describe, expect, test } from "bun:test"
import { runNutritionSync } from "./index.ts"

type Row = Record<string, unknown>

class FakeSupabase {
	tables: Record<string, Row[]>
	upserts: Array<{ schema: string; table: string; rows: Row[]; onConflict?: string }> = []
	inserts: Array<{ schema: string; table: string; row: Row }> = []
	updates: Array<{ schema: string; table: string; row: Row; column: string; value: unknown }> = []

	constructor(tables: Record<string, Row[]>) {
		this.tables = tables
	}

	schema(schema: string) {
		return {
			from: (table: string) => new FakeQuery(this, schema, table),
		}
	}

	key(schema: string, table: string) {
		return `${schema}.${table}`
	}
}

class FakeQuery {
	constructor(
		private readonly client: FakeSupabase,
		private readonly schemaName: string,
		private readonly tableName: string
	) {}

	select(_columns: string) {
		return this
	}

	range(from: number, to: number) {
		const rows = this.client.tables[this.client.key(this.schemaName, this.tableName)] ?? []
		return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
	}

	insert(row: Row) {
		this.client.inserts.push({ schema: this.schemaName, table: this.tableName, row: { ...row } })

		return {
			select: (_columns: string) => ({
				single: () => Promise.resolve({ data: { id: 77 }, error: null }),
			}),
		}
	}

	update(row: Row) {
		return {
			eq: (column: string, value: unknown) => {
				this.client.updates.push({ schema: this.schemaName, table: this.tableName, row: { ...row }, column, value })
				return Promise.resolve({ error: null })
			},
		}
	}

	upsert(rows: Row[], options?: { onConflict?: string }) {
		const batch = rows.map((row) => ({ ...row }))
		this.client.upserts.push({ schema: this.schemaName, table: this.tableName, rows: batch, onConflict: options?.onConflict })

		if (this.schemaName === "kitchen" && this.tableName === "nutrient") {
			const tableKey = this.client.key(this.schemaName, this.tableName)
			const existingRows = this.client.tables[tableKey] ?? []
			const returnedRows = batch.map((row) => {
				const legacyId = row.legacy_id
				const existing = existingRows.find((existingRow) => existingRow.legacy_id === legacyId)
				const id = existing?.id ?? `nutrient-${legacyId}`
				const stored = { ...row, id }
				const existingIndex = existingRows.findIndex((existingRow) => existingRow.legacy_id === legacyId)
				if (existingIndex >= 0) existingRows[existingIndex] = stored
				else existingRows.push(stored)
				return { id, legacy_id: legacyId }
			})
			this.client.tables[tableKey] = existingRows

			return {
				select: () => Promise.resolve({ data: returnedRows, error: null }),
			}
		}

		return {
			select: (columns?: string) => {
				const selected = columns
					? batch.map((row) =>
							Object.fromEntries(
								columns
									.split(",")
									.map((column) => column.trim())
									.map((column) => [column, row[column]])
							)
						)
					: batch
				return Promise.resolve({ data: selected, error: null })
			},
		}
	}
}

describe("runNutritionSync", () => {
	test("syncs legacy nutrients and ingredient nutrient values through lookup tables", async () => {
		const client = new FakeSupabase({
			"public.nutriente": [
				{ id_nutriente: 1, descricao: "Valor energético (kcal)", valor_diario: "2000", ordem: 0 },
				{ id_nutriente: 2, descricao: "Proteínas (g)", valor_diario: "50", ordem: 1 },
				{ id_nutriente: null, descricao: "linha inválida" },
			],
			"public.produto_nutriente": [
				{ id_produto: 10, id_nutriente: 1, valor: "123,4" },
				{ id_produto: 10, id_nutriente: 2, valor: 8 },
				{ id_produto: 99, id_nutriente: 2, valor: 1 },
			],
			"core.migration_product_lookup": [{ legacy_id_insumo: 10, new_product_id: "ingredient-10" }],
			"core.migration_nutrient_lookup": [],
			"kitchen.nutrient": [],
		})

		const summary = await runNutritionSync({ batchSize: 2 }, client as any)

		expect(summary).toMatchObject({
			logId: 77,
			triggeredBy: "manual",
			dryRun: false,
			limited: false,
			nutrientsRead: 3,
			nutrientsSkipped: 1,
			nutrientsUpserted: 2,
			nutrientLookupsUpserted: 2,
			ingredientNutrientsRead: 3,
			ingredientNutrientsSkipped: 1,
			ingredientNutrientsUpserted: 2,
			errors: [],
		})
		expect(client.inserts).toContainEqual({
			schema: "kitchen",
			table: "nutrition_sync_log",
			row: {
				triggered_by: "manual",
				dry_run: false,
				status: "running",
				max_nutrients: null,
				max_ingredient_nutrients: null,
			},
		})
		expect(client.updates.at(-1)).toMatchObject({
			schema: "kitchen",
			table: "nutrition_sync_log",
			column: "id",
			value: 77,
			row: {
				status: "success",
				nutrients_read: 3,
				ingredient_nutrients_read: 3,
				ingredient_nutrients_upserted: 2,
				error_message: null,
			},
		})

		expect(client.upserts).toContainEqual({
			schema: "kitchen",
			table: "nutrient",
			onConflict: "legacy_id",
			rows: [
				{
					legacy_id: 1,
					name: "Valor energético (kcal)",
					daily_value: 2000,
					minimum_value: null,
					is_energy_value: true,
					enum_name: null,
					display_order: 0,
					deleted_at: null,
				},
				{
					legacy_id: 2,
					name: "Proteínas (g)",
					daily_value: 50,
					minimum_value: null,
					is_energy_value: false,
					enum_name: null,
					display_order: 1,
					deleted_at: null,
				},
			],
		})

		expect(client.upserts).toContainEqual({
			schema: "kitchen",
			table: "ingredient_nutrient",
			onConflict: "ingredient_id,nutrient_id",
			rows: [
				{ ingredient_id: "ingredient-10", nutrient_id: "nutrient-1", nutrient_value: 123.4, deleted_at: null },
				{ ingredient_id: "ingredient-10", nutrient_id: "nutrient-2", nutrient_value: 8, deleted_at: null },
			],
		})
	})

	test("dry run reads and counts using existing lookups without writing", async () => {
		const client = new FakeSupabase({
			"public.nutriente": [{ id_nutriente: 1, descricao: "Carboidratos" }],
			"public.produto_nutriente": [{ id_produto: 10, id_nutriente: 1, valor: 22 }],
			"core.migration_product_lookup": [{ legacy_id_insumo: 10, new_product_id: "ingredient-10" }],
			"core.migration_nutrient_lookup": [{ legacy_id_nutriente: 1, new_nutrient_id: "nutrient-1" }],
		})

		const summary = await runNutritionSync({ dryRun: true, logRun: false }, client as any)

		expect(summary).toMatchObject({
			dryRun: true,
			nutrientsRead: 1,
			nutrientsUpserted: 0,
			nutrientLookupsUpserted: 0,
			ingredientNutrientsRead: 1,
			ingredientNutrientsSkipped: 0,
			ingredientNutrientsUpserted: 0,
		})
		expect(client.upserts).toHaveLength(0)
	})

	test("test runs are limited by default and logged as test", async () => {
		const client = new FakeSupabase({
			"public.nutriente": Array.from({ length: 30 }, (_, index) => ({ id_nutriente: index + 1, descricao: `Nutriente ${index + 1}` })),
			"public.produto_nutriente": Array.from({ length: 150 }, (_, index) => ({ id_produto: 10, id_nutriente: (index % 25) + 1, valor: index })),
			"core.migration_product_lookup": [{ legacy_id_insumo: 10, new_product_id: "ingredient-10" }],
			"core.migration_nutrient_lookup": [],
			"kitchen.nutrient": [],
		})

		const summary = await runNutritionSync({ triggeredBy: "test" }, client as any)

		expect(summary).toMatchObject({
			triggeredBy: "test",
			limited: true,
			limits: { nutrients: 25, ingredientNutrients: 100 },
			nutrientsRead: 25,
			ingredientNutrientsRead: 100,
		})
		expect(client.inserts[0]).toMatchObject({
			schema: "kitchen",
			table: "nutrition_sync_log",
			row: {
				triggered_by: "test",
				max_nutrients: 25,
				max_ingredient_nutrients: 100,
			},
		})
	})
})
