/**
 * Regressão do colapso de alvo — o caso que quebrava a criação de versão nova.
 *
 * `recipe_equipment_requirement_target_uniq` proíbe duas linhas com o mesmo alvo no mesmo escopo
 * (receita + etapa). Toda vez que um vínculo com etapa se perde — fluxo re-salvo, versão nova sem
 * aquela etapa — as linhas colapsam para `recipe_step_id = null` e passam a colidir. O erro
 * (23505) aparecia DEPOIS de a nova versão da receita já ter sido inserida: meia operação
 * aplicada, com a linha órfã no banco.
 */

import { describe, expect, test } from "bun:test"
import { dedupeRequirementTargets } from "./equipment.ts"

const row = (id: string, stepId: string | null, target: string | null, quantity = 1) => ({ id, stepId, target, quantity })

describe("dedupeRequirementTargets", () => {
	test("linhas de alvos distintos passam inteiras", () => {
		const { keep, drop } = dedupeRequirementTargets([row("a", null, "forno"), row("b", null, "chapa")])
		expect(keep.map((r) => r.id).sort()).toEqual(["a", "b"])
		expect(drop).toHaveLength(0)
	})

	test("mesmo alvo sem etapa colapsa numa linha só", () => {
		const { keep, drop } = dedupeRequirementTargets([row("a", null, "forno"), row("b", null, "forno")])
		expect(keep).toHaveLength(1)
		expect(drop.map((r) => r.id)).toEqual(["b"])
	})

	test("vence a de MAIOR quantidade — a que sobra tem de cobrir a que sumiu", () => {
		const { keep, drop } = dedupeRequirementTargets([row("a", null, "forno", 1), row("b", null, "forno", 3)])
		expect(keep[0].id).toBe("b")
		expect(keep[0].quantity).toBe(3)
		expect(drop.map((r) => r.id)).toEqual(["a"])
	})

	test("mesmo alvo em ETAPAS diferentes não colide (o escopo do índice inclui a etapa)", () => {
		const { keep, drop } = dedupeRequirementTargets([row("a", "step-1", "forno"), row("b", "step-2", "forno")])
		expect(keep).toHaveLength(2)
		expect(drop).toHaveLength(0)
	})

	test("três linhas do mesmo alvo deixam uma e descartam duas", () => {
		const { keep, drop } = dedupeRequirementTargets([row("a", null, "forno", 2), row("b", null, "forno", 1), row("c", null, "forno", 5)])
		expect(keep.map((r) => r.id)).toEqual(["c"])
		expect(drop.map((r) => r.id).sort()).toEqual(["a", "b"])
	})
})
