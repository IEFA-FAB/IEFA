/**
 * Execução do dia (sem banco): o turno inclui preparação só HOJE, com a permissão de execução,
 * e a recusa diz o que fazer. As regras puras de pendência (ficha incompleta, provisória no
 * cardápio-modelo) também moram aqui.
 *
 * O banco é um stub que falha em qualquer uso: "recusou antes de tocar o banco" é verificado por
 * construção. Os caminhos com banco estão em `apps/sisub/src/test/operations/execution.operations.test.ts`.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserPermission } from "@iefa/pbac"
import { requireKitchenExecution } from "../guards/require-permission.ts"
import { AddExecutionMenuItemSchema } from "../schemas/execution.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, PermissionDeniedError, QueryFailedError } from "../types/errors.ts"
import { getBrasiliaToday } from "../utils/civil-date.ts"
import {
	addExecutionMenuItem,
	assertExecutionDate,
	describeProvisionalTemplateRefusal,
	ensureIssueDayProductionTasks,
	fetchExecutionOptions,
	isExecutionDate,
} from "./execution.ts"
import * as operationsIndex from "./index.ts"
import { describeSnapshotGaps, findSnapshotGaps, pendingIssueWindowStart, remainingAfterLateIssues } from "./production-issue.ts"

const KITCHEN = 7
const MEAL = "11111111-1111-4111-8111-111111111111"
const RECIPE = "22222222-2222-4222-8222-222222222222"

function perm(module: UserPermission["module"], level: number, kitchenId: number | null = KITCHEN): UserPermission {
	return { module, level, kitchen_id: kitchenId, unit_id: null, mess_hall_id: null } as UserPermission
}

function ctx(permissions: UserPermission[]): UserContext {
	return { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}

/** Qualquer acesso ao banco falha: a recusa tem de vir antes. */
const untouchableDb = new Proxy(
	{},
	{
		get() {
			throw new Error("o banco não deveria ser tocado")
		},
	}
) as unknown as SisubDb

describe("janela de hoje (Brasília)", () => {
	test("hoje é execução; ontem e amanhã são planejamento", () => {
		expect(isExecutionDate("2026-09-26", "2026-09-26")).toBe(true)
		expect(isExecutionDate("2026-09-25", "2026-09-26")).toBe(false)
		expect(isExecutionDate("2026-09-27", "2026-09-26")).toBe(false)
	})

	test("a recusa diz o dia de hoje e onde se inclui em outro dia", () => {
		expect(() => assertExecutionDate("2026-09-27", "2026-09-26")).toThrow(DomainError)
		expect(() => assertExecutionDate("2026-09-27", "2026-09-26")).toThrow(/hoje \(26\/09\/2026\).*27\/09\/2026.*Agendamento da Produção/)
	})

	test("o 'hoje' do servidor é o civil de Brasília, não o UTC", () => {
		// 01h UTC de 27/09 ainda é 22h de 26/09 em Brasília: o jantar de 26 é execução.
		expect(getBrasiliaToday(new Date("2026-09-27T01:00:00Z"))).toBe("2026-09-26")
	})
})

describe("permissão de execução", () => {
	test("o turno (kitchen-production:1) e a nutricionista (kitchen:2) executam", () => {
		expect(() => requireKitchenExecution(ctx([perm("kitchen-production", 1)]), KITCHEN)).not.toThrow()
		expect(() => requireKitchenExecution(ctx([perm("kitchen", 2)]), KITCHEN)).not.toThrow()
	})

	test("quem só lê o planejamento (kitchen:1) não inclui no dia", () => {
		expect(() => requireKitchenExecution(ctx([perm("kitchen", 1)]), KITCHEN)).toThrow(PermissionDeniedError)
	})

	test("o turno de outra cozinha não inclui nesta", () => {
		expect(() => requireKitchenExecution(ctx([perm("kitchen-production", 2, 99)]), KITCHEN)).toThrow(PermissionDeniedError)
	})
})

describe("addExecutionMenuItem recusa antes de gravar", () => {
	const input = { kitchenId: KITCHEN, serviceDate: "2020-01-01", mealTypeId: MEAL, recipeId: RECIPE, reason: "faltou o feijão" }

	test("sem permissão de execução", async () => {
		await expect(addExecutionMenuItem(untouchableDb, ctx([perm("kitchen", 1)]), input)).rejects.toThrow(PermissionDeniedError)
	})

	test("data que não é hoje, mesmo para a nutricionista", async () => {
		await expect(addExecutionMenuItem(untouchableDb, ctx([perm("kitchen", 2)]), input, new Date("2026-09-26T15:00:00Z"))).rejects.toThrow(
			/só no cardápio de hoje \(26\/09\/2026\)/
		)
	})

	test("as opções do turno também exigem a permissão de execução", async () => {
		await expect(fetchExecutionOptions(untouchableDb, ctx([perm("diner", 1)]), { kitchenId: KITCHEN })).rejects.toThrow(PermissionDeniedError)
	})
})

describe("entrada da inclusão", () => {
	const base = { kitchenId: KITCHEN, serviceDate: "2026-09-26", mealTypeId: MEAL, reason: "faltou o feijão" }

	test("preparação do catálogo OU nome de uma nova — uma das duas", () => {
		expect(AddExecutionMenuItemSchema.safeParse({ ...base, recipeId: RECIPE }).success).toBe(true)
		expect(AddExecutionMenuItemSchema.safeParse({ ...base, provisionalRecipeName: "Farofa de ovo" }).success).toBe(true)
		expect(AddExecutionMenuItemSchema.safeParse(base).success).toBe(false)
		expect(AddExecutionMenuItemSchema.safeParse({ ...base, recipeId: RECIPE, provisionalRecipeName: "Farofa" }).success).toBe(false)
	})

	test("o motivo é obrigatório e curto", () => {
		expect(AddExecutionMenuItemSchema.safeParse({ ...base, recipeId: RECIPE, reason: "  " }).success).toBe(false)
		expect(AddExecutionMenuItemSchema.safeParse({ ...base, recipeId: RECIPE, reason: "x".repeat(201) }).success).toBe(false)
	})
})

describe("ficha incompleta", () => {
	const line = { ingredient_id: "33333333-3333-4333-8333-333333333333", net_quantity: 0.1 }

	test("ficha completa com porções não tem lacuna", () => {
		expect(findSnapshotGaps({ portion_yield: 10, ingredients: [line] }, 100)).toEqual([])
		expect(describeSnapshotGaps([])).toBeNull()
	})

	test("provisória sem insumos e sem porções: todas as lacunas, na ordem do aviso", () => {
		expect(findSnapshotGaps({ provisional_since: "2026-09-26T12:00:00Z", ingredients: [] }, null)).toEqual(["provisional", "no_ingredients", "no_portions"])
	})

	test("rendimento ausente só pesa quando há insumo para escalar", () => {
		expect(findSnapshotGaps({ portion_yield: null, ingredients: [line] }, 50)).toEqual(["no_yield"])
		expect(findSnapshotGaps({ portion_yield: null, ingredients: [] }, 50)).toEqual(["no_ingredients"])
	})

	test("linha sem quantidade não conta como insumo", () => {
		expect(findSnapshotGaps({ portion_yield: 10, ingredients: [{ ingredient_id: line.ingredient_id, net_quantity: 0 }] }, 50)).toEqual(["no_ingredients"])
	})

	test("o aviso diz o que falta e o efeito na sugestão", () => {
		expect(describeSnapshotGaps(["no_ingredients"])).toMatch(/^Ficha incompleta — ficha sem insumos: a sugestão de saída não inclui/)
	})
})

describe("provisória no cardápio-modelo", () => {
	test("sem provisória, nada a recusar", () => {
		expect(describeProvisionalTemplateRefusal([])).toBeNull()
	})

	test("a recusa nomeia a preparação e diz como destravar", () => {
		expect(describeProvisionalTemplateRefusal(["Farofa"])).toMatch(/"Farofa" é preparação provisória.*Complete a ficha/)
		expect(describeProvisionalTemplateRefusal(["Farofa", "Suco"])).toMatch(/"Farofa", "Suco" são preparações provisórias/)
	})
})

describe("janela da Baixa por Produção: competência aberta", () => {
	test("começa no mês seguinte ao último fechado, não 30 dias atrás", () => {
		expect(pendingIssueWindowStart({ lastClosedCompetencia: "2026-07-01", firstMovementDate: "2026-01-10", today: "2026-09-26" })).toBe("2026-08-01")
	})

	test("dezembro fechado abre janeiro do ano seguinte", () => {
		expect(pendingIssueWindowStart({ lastClosedCompetencia: "2025-12-01", firstMovementDate: null, today: "2026-02-10" })).toBe("2026-01-01")
	})

	test("sem fechamento, desde o primeiro movimento de estoque", () => {
		expect(pendingIssueWindowStart({ lastClosedCompetencia: null, firstMovementDate: "2026-05-03", today: "2026-09-26" })).toBe("2026-05-03")
	})

	test("nunca além do teto, mesmo sem estoque nenhum", () => {
		expect(pendingIssueWindowStart({ lastClosedCompetencia: null, firstMovementDate: null, today: "2026-09-26", maxDays: 100 })).toBe("2026-06-18")
	})
})

describe("tarefas do dia sem o quadro aberto: autoriza por dentro", () => {
	test("não é exportada sem guarda no índice público", () => {
		expect("createMissingProductionTasks" in operationsIndex).toBe(false)
		expect(typeof operationsIndex.ensureIssueDayProductionTasks).toBe("function")
	})

	test("quem só planeja (kitchen:2) ou só lê o estoque (storage:1) não cria tarefa", async () => {
		const input = { kitchenId: KITCHEN, date: "2026-09-26" }
		await expect(ensureIssueDayProductionTasks(untouchableDb, ctx([perm("kitchen", 2)]), input)).rejects.toThrow(PermissionDeniedError)
		await expect(ensureIssueDayProductionTasks(untouchableDb, ctx([perm("storage", 1)]), input)).rejects.toThrow(PermissionDeniedError)
		await expect(ensureIssueDayProductionTasks(untouchableDb, ctx([perm("storage", 2, 99)]), input)).rejects.toThrow(PermissionDeniedError)
	})

	test("o turno e quem abre a requisição passam da guarda (e só então tocam o banco)", async () => {
		const input = { kitchenId: KITCHEN, date: "2026-09-26" }
		await expect(ensureIssueDayProductionTasks(untouchableDb, ctx([perm("kitchen-production", 1)]), input)).rejects.toThrow("o banco não deveria ser tocado")
		await expect(ensureIssueDayProductionTasks(untouchableDb, ctx([perm("storage", 2)]), input)).rejects.toThrow("o banco não deveria ser tocado")
	})
})

describe("falha dentro da transação da inclusão vira erro de domínio", () => {
	test("erro do driver sai como QueryFailedError com o prefixo de negócio, sem o SQL", async () => {
		// A conferência da refeição (`select ... from meal_type`) acha a refeição; a transação falha.
		const db = {
			select: () => ({ from: () => ({ where: () => Promise.resolve([{ id: MEAL }]) }) }),
			transaction: () => Promise.reject(new Error('insert into kitchen.menu_items … violates check constraint "menu_items_execution_reason_required"')),
		} as unknown as SisubDb
		const today = getBrasiliaToday()
		const run = addExecutionMenuItem(db, ctx([perm("kitchen-production", 1)]), {
			kitchenId: KITCHEN,
			serviceDate: today,
			mealTypeId: MEAL,
			recipeId: RECIPE,
			reason: "faltou o feijão",
		})
		const error = await run.then(
			() => null,
			(e: unknown) => e
		)
		expect(error).toBeInstanceOf(QueryFailedError)
		expect((error as QueryFailedError).publicMessage).toBe("Erro ao incluir a preparação no dia")
	})
})

describe("saída tardia de um insumo não é a baixa da tarefa", () => {
	const lines = [
		{ ingredientId: "oleo", description: "Óleo", measureUnit: "L", quantity: 2 },
		{ ingredientId: "arroz", description: "Arroz", measureUnit: "KG", quantity: 10 },
		{ ingredientId: "sal", description: "Sal", measureUnit: "KG", quantity: 0.5 },
	]

	test("sem saída tardia, a baixa sugere tudo", () => {
		expect(remainingAfterLateIssues(lines, new Map()).map((l) => [l.ingredientId, l.quantity])).toEqual([
			["oleo", 2],
			["arroz", 10],
			["sal", 0.5],
		])
	})

	test("o insumo já baixado tarde sai da lista; o parcial vem com o restante; os outros seguem", () => {
		const out = remainingAfterLateIssues(
			lines,
			new Map([
				["oleo", 2],
				["arroz", 3.5],
			])
		)
		expect(out.map((l) => [l.ingredientId, l.quantity, l.lateIssued])).toEqual([
			["arroz", 6.5, 3.5],
			["sal", 0.5, 0],
		])
	})
})
