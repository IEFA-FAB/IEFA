import { describe, expect, test } from "bun:test"
import type { EquipmentIssueSeverity, EquipmentIssueStatus } from "../schemas/equipment.ts"
import {
	type ConditionIssue,
	deriveEquipmentCondition,
	EQUIPMENT_CONDITIONS,
	isIssueOpen,
	isUnitUnavailable,
	OPEN_ISSUE_STATUSES,
	unitCountsForFitness,
} from "./equipment-condition.ts"

function issue(severity: EquipmentIssueSeverity, status: EquipmentIssueStatus = "open"): ConditionIssue {
	return { severity, status }
}

describe("isIssueOpen", () => {
	test("open e in_repair pesam", () => {
		expect(isIssueOpen(issue("degraded", "open"))).toBe(true)
		expect(isIssueOpen(issue("inoperative", "in_repair"))).toBe(true)
	})

	test("resolved e dismissed não pesam", () => {
		expect(isIssueOpen(issue("inoperative", "resolved"))).toBe(false)
		expect(isIssueOpen(issue("inoperative", "dismissed"))).toBe(false)
	})

	test("cobre exatamente os status declarados em OPEN_ISSUE_STATUSES", () => {
		const all: EquipmentIssueStatus[] = ["open", "in_repair", "resolved", "dismissed"]
		expect(all.filter((s) => isIssueOpen(issue("degraded", s)))).toEqual([...OPEN_ISSUE_STATUSES])
	})
})

describe("deriveEquipmentCondition", () => {
	test("ativa e sem pane é operacional", () => {
		expect(deriveEquipmentCondition("active", [])).toBe("operational")
		expect(deriveEquipmentCondition("active")).toBe("operational")
	})

	test("ativa com pane degradada aberta é degradada", () => {
		expect(deriveEquipmentCondition("active", [issue("degraded")])).toBe("degraded")
	})

	test("ativa com pane inoperante aberta é parada", () => {
		expect(deriveEquipmentCondition("active", [issue("inoperative")])).toBe("down")
	})

	test("status maintenance é parada mesmo sem pane", () => {
		expect(deriveEquipmentCondition("maintenance", [])).toBe("down")
	})

	test("pane inoperante vence pane degradada, em qualquer ordem", () => {
		expect(deriveEquipmentCondition("active", [issue("degraded"), issue("inoperative")])).toBe("down")
		expect(deriveEquipmentCondition("active", [issue("inoperative"), issue("degraded")])).toBe("down")
	})

	test("baixa vence pane inoperante aberta", () => {
		expect(deriveEquipmentCondition("decommissioned", [issue("inoperative")])).toBe("retired")
	})

	test("baixa vence status maintenance na precedência", () => {
		// Combinação impossível no banco (status é um só), garantida aqui como ordem da função.
		expect(deriveEquipmentCondition("decommissioned", [])).toBe("retired")
	})

	test("pane encerrada não altera a condição", () => {
		expect(deriveEquipmentCondition("active", [issue("inoperative", "resolved")])).toBe("operational")
		expect(deriveEquipmentCondition("active", [issue("inoperative", "dismissed")])).toBe("operational")
	})

	test("descartar a única pane inoperante devolve a unidade ao operacional", () => {
		const antes = deriveEquipmentCondition("active", [issue("inoperative", "open")])
		const depois = deriveEquipmentCondition("active", [issue("inoperative", "dismissed")])
		expect(antes).toBe("down")
		expect(depois).toBe("operational")
	})

	test("histórico misto: só a pane aberta conta", () => {
		const issues = [issue("inoperative", "resolved"), issue("inoperative", "dismissed"), issue("degraded", "open")]
		expect(deriveEquipmentCondition("active", issues)).toBe("degraded")
	})

	test("toda condição declarada é alcançável", () => {
		const alcancadas = new Set([
			deriveEquipmentCondition("active", []),
			deriveEquipmentCondition("active", [issue("degraded")]),
			deriveEquipmentCondition("active", [issue("inoperative")]),
			deriveEquipmentCondition("decommissioned", []),
		])
		expect([...alcancadas].sort()).toEqual([...EQUIPMENT_CONDITIONS].sort())
	})
})

describe("unitCountsForFitness", () => {
	test("operacional e degradada contam", () => {
		expect(unitCountsForFitness("operational")).toBe(true)
		expect(unitCountsForFitness("degraded")).toBe(true)
	})

	test("parada e baixada não contam", () => {
		expect(unitCountsForFitness("down")).toBe(false)
		expect(unitCountsForFitness("retired")).toBe(false)
	})
})

describe("isUnitUnavailable", () => {
	test("pane inoperante aberta tira a unidade do cálculo", () => {
		expect(isUnitUnavailable("active", [issue("inoperative")])).toBe(true)
	})

	test("pane degradada aberta NÃO tira a unidade do cálculo", () => {
		expect(isUnitUnavailable("active", [issue("degraded")])).toBe(false)
	})

	test("manutenção e baixa tiram a unidade do cálculo", () => {
		expect(isUnitUnavailable("maintenance", [])).toBe(true)
		expect(isUnitUnavailable("decommissioned", [])).toBe(true)
	})

	test("descartar a pane devolve a unidade ao cálculo", () => {
		expect(isUnitUnavailable("active", [issue("inoperative", "dismissed")])).toBe(false)
	})

	test("é exatamente a negação de unitCountsForFitness sobre a condição", () => {
		const casos: Parameters<typeof isUnitUnavailable>[] = [
			["active", []],
			["active", [issue("degraded")]],
			["active", [issue("inoperative")]],
			["maintenance", []],
			["decommissioned", [issue("degraded")]],
		]
		for (const [status, issues] of casos) {
			expect(isUnitUnavailable(status, issues)).toBe(!unitCountsForFitness(deriveEquipmentCondition(status, issues)))
		}
	})
})
