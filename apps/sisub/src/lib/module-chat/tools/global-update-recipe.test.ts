/**
 * `update_recipe` grava VERSÃO NOVA pela operation da tela (`agentUpdateRecipe` →
 * `saveRecipeEdit`), conferindo que o `recipeId` lido ainda é a versão vigente. Antes fazia
 * `UPDATE` direto na linha, reescrevendo uma versão publicada sem conferir nada (EDIT-SAFETY.md).
 */

import { DomainError } from "@iefa/sisub-domain"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import { globalTools } from "./global"
import type { ToolContext } from "./shared"
import { findWrappedTool } from "./test-helpers"

const RECIPE = "11111111-1111-4111-8111-111111111111"

const agentMocks = vi.hoisted(() => ({ agentUpdateRecipe: vi.fn() }))
vi.mock("@iefa/sisub-domain/agent", async (importOriginal) => ({
	...(await importOriginal<typeof import("@iefa/sisub-domain/agent")>()),
	agentUpdateRecipe: agentMocks.agentUpdateRecipe,
}))

/** Cliente PostgREST que reprova qualquer acesso: a tool não pode mais escrever por ele. */
const forbiddenSupabase = new Proxy(
	{},
	{
		get() {
			throw new Error("update_recipe não deve usar o PostgREST")
		},
	}
) as ToolContext["supabase"]

function globalCtx(level = 2): ToolContext {
	const permissions = [{ module: "global", level, kitchen_id: null, mess_hall_id: null, unit_id: null }] as unknown as UserPermission[]
	return { userId: "user-1", permissions, module: "global", supabase: forbiddenSupabase, db: { marker: "db" } as unknown as ToolContext["db"] }
}

const updateRecipe = findWrappedTool(globalTools, "update_recipe")

beforeEach(() => {
	agentMocks.agentUpdateRecipe.mockReset()
})

describe("update_recipe", () => {
	test("passa pela operation versionada com só os campos pedidos, e devolve a versão nova", async () => {
		const created = {
			id: "22222222-2222-4222-8222-222222222222",
			name: "Arroz",
			version: 4,
			preparation_time_minutes: 40,
			cooking_factor: 2.2,
			previous_version_id: RECIPE,
		}
		agentMocks.agentUpdateRecipe.mockResolvedValue(created)
		const ctx = globalCtx()

		const result = await updateRecipe.handler({ recipeId: RECIPE, cookingFactor: 2.2 }, ctx)

		expect(result).toEqual({ success: true, data: created })
		expect(agentMocks.agentUpdateRecipe).toHaveBeenCalledWith(ctx.db, expect.objectContaining({ userId: "user-1", aal: 1 }), {
			recipeId: RECIPE,
			cookingFactor: 2.2,
		})
	})

	test("tempo de preparo vira o campo do domínio", async () => {
		agentMocks.agentUpdateRecipe.mockResolvedValue({})
		await updateRecipe.handler({ recipeId: RECIPE, name: "Arroz à grega", preparationTime: 30 }, globalCtx())

		expect(agentMocks.agentUpdateRecipe.mock.calls[0]?.[2]).toEqual({ recipeId: RECIPE, name: "Arroz à grega", preparationTimeMinutes: 30 })
	})

	test("versão superada: a recusa do domínio chega ao modelo como está, nada é gravado", async () => {
		const conflict = new DomainError(
			"RECIPE_VERSION_CONFLICT",
			"Esta preparação mudou depois que a versão usada como base foi aberta: a versão vigente agora é a v5."
		)
		agentMocks.agentUpdateRecipe.mockRejectedValue(conflict)

		await expect(updateRecipe.handler({ recipeId: RECIPE, name: "X" }, globalCtx())).rejects.toThrow(/versão vigente agora é a v5/)
	})

	test("sem global:2 não chega à operation", async () => {
		await expect(updateRecipe.handler({ recipeId: RECIPE, name: "X" }, globalCtx(1))).rejects.toThrow()
		expect(agentMocks.agentUpdateRecipe).not.toHaveBeenCalled()
	})
})
