/**
 * Integração — compatibilidade do lote 5 da linguagem ubíqua (20260927100000): valores de domínio
 * na língua da norma, com os dois vocabulários convivendo até o contract (20260927110000).
 *
 *   * o CHECK de cada coluna aceita o valor antigo (que o código da `main` ainda grava) e o do
 *     glossário;
 *   * o domínio LÊ os dois e entrega só o do glossário: designação (`gestor`, `fiscal_tecnico`...),
 *     regra de política (`ingredient`), cardápio (`apoio`);
 *   * a busca de designação do recebimento (`inventory.find_designation`) acha o papel gravado em
 *     qualquer um dos dois, e o CHECK continua recusando o que não é de nenhum.
 *
 * Sai no contract, junto com a camada que testa. Entre a aplicação do contract e o merge do PR
 * dele, o banco já recusa o valor antigo e a `main` ainda tem este arquivo: os casos se pulam
 * quando o CHECK de `contract_designation.role` não aceita mais `manager`. Antes do expand (o CHECK
 * ainda não aceita `gestor`), falham.
 *
 * Banco real, `sql.begin` + ROLLBACK final: nada persiste.
 */
import { sisubSchema } from "@iefa/database/drizzle/sisub"
import { designationRoleStoredValues, listDesignations, listPolicyRules, listTemplates, PROVISIONAL_RECEIPT_ROLES } from "@iefa/sisub-domain"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, expect, type TestContext, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

class Rollback extends Error {}

type Tx = postgres.TransactionSql

describeSupabaseIntegration("compatibilidade do lote 5 (valores de domínio) (DB)", () => {
	let sql: postgres.Sql | null = null
	let seeder: Seeder | null = null
	let personId = ""
	/** Contract já aplicado: a camada que este arquivo testa não existe mais. */
	let contracted = false

	beforeAll(async () => {
		const setup = await setupIntegration()
		const url = getSisubDatabaseUrl()
		if (!setup.reachable || !setup.client || !url) return
		seeder = makeSeeder(setup.client as AnyClient)
		personId = await seeder.seedAuthUser()
		sql = postgres(url, { max: 1, prepare: false })
		const [state] = await sql<{ def: string }[]>`
			select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'contract_designation_role_check'`
		contracted = state != null && !state.def.includes("'manager'")
	}, 30_000)

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
		await seeder?.cleanup()
	}, 60_000)

	const skipIfContracted = (ctx: TestContext) => {
		if (contracted) ctx.skip("contract 20260927110000 aplicado: o valor antigo já saiu do banco")
	}

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

	test("designação: o banco aceita os dois vocabulários, o domínio lê o do glossário e o recebimento acha os dois", async (ctx) => {
		skipIfContracted(ctx)
		await inRollback(async (tx) => {
			const { unitId } = await seedKitchen(tx, "L5DES")
			await tx`
				insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference)
				values (${unitId}, ${personId}, 'technical_inspector', 'ato', 'BI 1/2026'), (${unitId}, ${personId}, 'gestor', 'ato', 'BI 2/2026')`
			await expect(
				tx.savepoint(
					(sp) =>
						sp`insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference) values (${unitId}, ${personId}, 'fiscal', 'ato', 'BI 3')`
				)
			).rejects.toThrow(/contract_designation_role_check/)

			const rows = await listDesignations(dbOf(tx), fullAccessCtx(), { unitId })
			expect(rows.map((r) => r.role).sort()).toEqual(["fiscal_tecnico", "gestor"])

			const [found] =
				await tx`select inventory.find_designation(${personId}, ${unitId}, null, ${tx.array(designationRoleStoredValues(PROVISIONAL_RECEIPT_ROLES))}) as id`
			expect(found.id).not.toBeNull()
			// Só o papel do glossário: a designação gravada no vocabulário antigo não casaria.
			const [onlyNew] = await tx`select count(*)::int as n from inventory.designations_covering(${unitId}, null, ${tx.array(["fiscal_tecnico"])})`
			expect(onlyNew.n).toBe(0)
		})
	}, 60_000)

	test("regra de política: `product` e `ingredient` são o mesmo alvo", async (ctx) => {
		skipIfContracted(ctx)
		await inRollback(async (tx) => {
			const tag = uid("[TEST] L5 ")
			await tx`
				insert into procurement.policy_rule (target, title, description)
				values ('product', ${`${tag} antigo`}, 'descrição da regra antiga'), ('ingredient', ${`${tag} novo`}, 'descrição da regra nova')`
			const rules = (await listPolicyRules(dbOf(tx), fullAccessCtx(), { target: "ingredient" })).filter((r) => r.title.startsWith(tag))
			expect(rules.map((r) => r.target)).toEqual(["ingredient", "ingredient"])
			const recipes = (await listPolicyRules(dbOf(tx), fullAccessCtx(), { target: "recipe" })).filter((r) => r.title.startsWith(tag))
			expect(recipes).toEqual([])
		})
	}, 60_000)

	test("cardápio de apoio: `exception` e `apoio` são o mesmo tipo, no modelo e no item do dia", async (ctx) => {
		skipIfContracted(ctx)
		await inRollback(async (tx) => {
			const { kitchenId } = await seedKitchen(tx, "L5APO")
			const [old] =
				await tx`insert into kitchen.menu_template (name, kitchen_id, template_type) values ('[TEST] apoio antigo', ${kitchenId}, 'exception') returning id`
			const [current] =
				await tx`insert into kitchen.menu_template (name, kitchen_id, template_type) values ('[TEST] apoio novo', ${kitchenId}, 'apoio') returning id`
			await tx`
				update kitchen.menu_template set snack_family = 'bordo', snack_class = 'B', snack_variant = 'lanche'
				where id in (${old.id}, ${current.id})`

			const templates = (await listTemplates(dbOf(tx), fullAccessCtx(), { kitchenId })).filter((t) => t.kitchen_id === kitchenId)
			expect(templates.map((t) => t.template_type)).toEqual(["apoio", "apoio"])

			await expect(
				tx.savepoint((sp) => sp`insert into kitchen.menu_template (name, kitchen_id, template_type) values ('[TEST] x', ${kitchenId}, 'excecao')`)
			).rejects.toThrow(/menu_template_template_type_check/)
		})
	}, 60_000)

	test("inventário: o tipo antigo e o do glossário passam no CHECK", async (ctx) => {
		skipIfContracted(ctx)
		await inRollback(async (tx) => {
			const { kitchenId } = await seedKitchen(tx, "L5INV")
			for (const type of ["rotating", "rotativo", "annual", "anual", "responsibility_transfer", "transferencia_responsabilidade", "eventual"]) {
				await tx.savepoint(
					(sp) => sp`insert into inventory.inventory_count (kitchen_id, status, type, scope) values (${kitchenId}, 'expired', ${type}, 'full')`
				)
			}
			await expect(
				tx.savepoint((sp) => sp`insert into inventory.inventory_count (kitchen_id, status, type, scope) values (${kitchenId}, 'expired', 'rotativa', 'full')`)
			).rejects.toThrow(/inventory_count_type_check/)
		})
	}, 60_000)
})
