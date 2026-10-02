/**
 * Integração — valores de domínio do lote 5 da linguagem ubíqua depois do contract
 * (20260927110000): cada coluna só aceita o vocabulário do glossário.
 *
 *   * o domínio grava e lê o valor do glossário (designação, regra de política, cardápio de apoio,
 *     inventário);
 *   * valor antigo e valor fora do vocabulário são recusados pelo CHECK (a tradução na gravação que o
 *     contract deixou para a janela de deploy saiu em 20260927165000, tarefa 5.5).
 * Banco real, `sql.begin` + ROLLBACK final: nada persiste.
 */
import { sisubSchema } from "@iefa/database/drizzle/sisub"
import { listDesignations, listPolicyRules, listTemplates, PROVISIONAL_RECEIPT_ROLES } from "@iefa/sisub-domain"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

class Rollback extends Error {}

type Tx = postgres.TransactionSql

describeSupabaseIntegration("valores de domínio do lote 5 (DB)", () => {
	let sql: postgres.Sql | null = null
	let seeder: Seeder | null = null
	let personId = ""

	beforeAll(async () => {
		const setup = await setupIntegration()
		const url = getSisubDatabaseUrl()
		if (!setup.reachable || !setup.client || !url) return
		seeder = makeSeeder(setup.client as AnyClient)
		personId = await seeder.seedAuthUser()
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
		await seeder?.cleanup()
	})

	async function inRollback(body: (tx: Tx) => Promise<void>) {
		if (!sql) throw new Error("SISUB_DATABASE_URL ausente")
		await expect(
			sql
				.begin(async (tx) => {
					await body(tx)
					throw new Rollback()
				})
				.catch((error) => {
					if (error instanceof Rollback) return "rolled-back"
					throw error
				})
		).resolves.toBe("rolled-back")
	}

	/** Drizzle das operações de domínio na mesma transação (ver `receiving-links.operations.test.ts`). */
	const dbOf = (tx: Tx) => drizzle(Object.assign(tx, { options: (sql as postgres.Sql).options }) as unknown as postgres.Sql, { schema: sisubSchema })

	async function seedKitchen(tx: Tx, tag: string) {
		const [unit] = await tx`insert into core.units (code, display_name) values (${uid(`ZZ-${tag}-`)}, ${`unit ${tag}`}) returning id`
		const [kitchen] = await tx`insert into kitchen.kitchen (unit_id, display_name) values (${unit.id}, ${`cozinha ${tag}`}) returning id`
		return { unitId: Number(unit.id), kitchenId: Number(kitchen.id) }
	}

	test("designação: o papel é o da norma, e o nome antigo é recusado", async () => {
		await inRollback(async (tx) => {
			const { unitId } = await seedKitchen(tx, "L5DES")
			await expect(
				tx.savepoint(
					(sp) =>
						sp`insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference) values (${unitId}, ${personId}, 'technical_inspector', 'ato', 'BI 1/2026')`
				)
			).rejects.toThrow(/contract_designation_role_check/)
			await tx`
				insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference)
				values (${unitId}, ${personId}, 'fiscal_tecnico', 'ato', 'BI 1/2026')`
			await tx`
				insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference)
				values (${unitId}, ${personId}, 'gestor', 'ato', 'BI 2/2026')`
			await expect(
				tx.savepoint(
					(sp) =>
						sp`insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference) values (${unitId}, ${personId}, 'fiscal', 'ato', 'BI 3')`
				)
			).rejects.toThrow(/contract_designation_role_check/)

			const rows = await listDesignations(dbOf(tx), fullAccessCtx(), { unitId })
			expect(rows.map((r) => r.role).sort()).toEqual(["fiscal_tecnico", "gestor"])
			const [found] = await tx`select inventory.find_designation(${personId}, ${unitId}, null, ${tx.array([...PROVISIONAL_RECEIPT_ROLES])}) as id`
			expect(found.id).not.toBeNull()
		})
	})

	test("regra de política: o alvo do insumo é `ingredient`", async () => {
		await inRollback(async (tx) => {
			const tag = uid("[TEST] L5 ")
			await expect(
				tx.savepoint((sp) => sp`insert into procurement.policy_rule (target, title, description) values ('product', ${`${tag} antigo`}, 'descrição da regra')`)
			).rejects.toThrow(/policy_rule_target_check/)
			await tx`insert into procurement.policy_rule (target, title, description) values ('ingredient', ${`${tag} novo`}, 'descrição da regra')`
			const rules = (await listPolicyRules(dbOf(tx), fullAccessCtx(), { target: "ingredient" })).filter((r) => r.title.startsWith(tag))
			expect(rules.map((r) => r.target)).toEqual(["ingredient"])
		})
	})

	test("cardápio de apoio: `apoio` no modelo e no item do dia", async () => {
		await inRollback(async (tx) => {
			const { kitchenId } = await seedKitchen(tx, "L5APO")
			// Sem os campos de lanche: com eles, o CHECK do padrão de lanche (avaliado antes, pela ordem
			// dos nomes) recusaria primeiro e esconderia o do tipo.
			await expect(
				tx.savepoint((sp) => sp`insert into kitchen.menu_template (name, kitchen_id, template_type) values ('[TEST] antigo', ${kitchenId}, 'exception')`)
			).rejects.toThrow(/menu_template_template_type_check/)
			await tx`
				insert into kitchen.menu_template (name, kitchen_id, template_type, snack_family, snack_class, snack_variant)
				values ('[TEST] apoio', ${kitchenId}, 'apoio', 'bordo', 'B', 'lanche')`
			const templates = (await listTemplates(dbOf(tx), fullAccessCtx(), { kitchenId })).filter((t) => t.kitchen_id === kitchenId)
			expect(templates.map((t) => t.template_type)).toEqual(["apoio"])
			await expect(tx.savepoint((sp) => sp`insert into kitchen.menu_items (origin_template_type) values ('exception')`)).rejects.toThrow(
				/menu_items_origin_template_type_check/
			)
			const [item] = await tx`insert into kitchen.menu_items (origin_template_type) values ('apoio') returning origin_template_type`
			expect(item.origin_template_type).toBe("apoio")
			await expect(
				tx.savepoint((sp) => sp`insert into kitchen.menu_template (name, kitchen_id, template_type) values ('[TEST] x', ${kitchenId}, 'excecao')`)
			).rejects.toThrow(/menu_template_template_type_check/)
		})
	})

	test("inventário: o tipo é o da norma, e o nome antigo é recusado", async () => {
		await inRollback(async (tx) => {
			const { kitchenId } = await seedKitchen(tx, "L5INV")
			await expect(
				tx.savepoint((sp) => sp`insert into inventory.inventory_count (kitchen_id, status, type, scope) values (${kitchenId}, 'expired', 'rotating', 'full')`)
			).rejects.toThrow(/inventory_count_type_check/)
			const [row] = await tx`
				insert into inventory.inventory_count (kitchen_id, status, type, scope) values (${kitchenId}, 'expired', 'rotativo', 'full') returning type`
			expect(row.type).toBe("rotativo")
			await expect(
				tx.savepoint((sp) => sp`insert into inventory.inventory_count (kitchen_id, status, type, scope) values (${kitchenId}, 'expired', 'rotativa', 'full')`)
			).rejects.toThrow(/inventory_count_type_check/)
		})
	})
})
