/**
 * `agentUpdateQuantityEstimateStatus` lia `wizard_step` ANTES de autorizar: quem não tinha a OM
 * dona recebia "o anexo ainda está no passo N" — a existência e o estado do anexo de outra OM. A
 * permissão agora vem primeiro, e a recusa é a mesma para qualquer anexo alheio.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { DomainError, PermissionDeniedError } from "../types/errors.ts"
import { agentUpdateQuantityEstimateStatus } from "./quantity-estimates.ts"

const OWNER_UNIT = 5
const ESTIMATE_ID = "11111111-1111-4111-8111-111111111111"

function ctx(unitId: number, level = 2): UserContext {
	return {
		userId: "user-1",
		permissions: [{ module: "unit", level, kitchen_id: null, mess_hall_id: null, unit_id: unitId }],
		aal: 1,
		lastFactorAt: null,
		origin: "session",
	}
}

/**
 * Decide pela COLUNA pedida: `unitId` é o guard (dono do anexo), `wizardStep` é a leitura que não
 * pode acontecer antes dele. Registra a ordem das leituras.
 */
function fakeDb(wizardStep: number | null) {
	const reads: string[] = []
	const select = (cols: Record<string, unknown>) => {
		const column = "wizardStep" in cols ? "wizardStep" : "unitId"
		reads.push(column)
		const row = column === "wizardStep" ? { wizardStep } : { unitId: OWNER_UNIT }
		const chain = { from: () => chain, where: () => chain, limit: () => Promise.resolve([row]) }
		return chain
	}
	return { db: { select } as unknown as SisubDb, reads }
}

describe("agentUpdateQuantityEstimateStatus", () => {
	test("OM alheia é recusada sem que o passo do wizard seja lido", async () => {
		const { db, reads } = fakeDb(2)
		await expect(agentUpdateQuantityEstimateStatus(db, ctx(OWNER_UNIT + 1), { quantityEstimateId: ESTIMATE_ID, status: "completed" })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
		expect(reads).toEqual(["unitId"])
	})

	test("leitura da OM (unit:1) também é recusada antes do passo", async () => {
		const { db, reads } = fakeDb(2)
		await expect(agentUpdateQuantityEstimateStatus(db, ctx(OWNER_UNIT, 1), { quantityEstimateId: ESTIMATE_ID, status: "completed" })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
		expect(reads).not.toContain("wizardStep")
	})

	test("a OM dona recebe a recusa do wizard (o passo só é lido depois do guard)", async () => {
		const { db, reads } = fakeDb(2)
		const error = await agentUpdateQuantityEstimateStatus(db, ctx(OWNER_UNIT), { quantityEstimateId: ESTIMATE_ID, status: "completed" }).then(
			() => null,
			(e: unknown) => e
		)
		expect(error).toBeInstanceOf(DomainError)
		expect((error as DomainError).code).toBe("QUANTITY_ESTIMATE_IN_WIZARD")
		expect(reads).toEqual(["unitId", "wizardStep"])
	})
})
