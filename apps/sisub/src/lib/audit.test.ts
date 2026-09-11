/**
 * Contrato do ponto de passagem da auditoria de operações sensíveis.
 *
 * O que estes testes provam é o que a especificação exige e nenhum linter enxerga:
 * operação classificada que conclui DEIXA rastro, operação rejeitada NÃO deixa, e
 * operação de rotina não polui o registro. O helper é puro justamente para que isso possa
 * ser provado sem banco — o gravador entra por injeção.
 *
 * O ator não aparece em nenhuma asserção de payload porque ele não existe no payload:
 * `AuditEntry` não tem campo de ator, e quem o grava é o gravador, a partir do contexto
 * autenticado. O teste `o ator sai do contexto` prova as duas metades disso.
 */

import { describe, expect, test } from "vitest"
import { type AuditEntry, withAudit } from "@/lib/audit"
import { ASSURANCE_REGISTRY, type AssuranceOperationName } from "@/server/assurance-registry"

/** Gravador de mentira: guarda o que receberia o banco. */
function spyRecorder() {
	const entries: AuditEntry[] = []
	return {
		entries,
		record: async (entry: AuditEntry) => {
			entries.push(entry)
			return { id: "log-row" }
		},
	}
}

/** Uma operação de cada grau, lida do registro — nunca digitada aqui. */
const FRESH_OPERATION: AssuranceOperationName = "createUserPermissionFn"
const SESSION_OPERATION: AssuranceOperationName = "createLiquidacaoFn"
const ROUTINE_OPERATION: AssuranceOperationName = "upsertForecastFn"

describe("withAudit", () => {
	test("as operações de referência têm no registro o grau que estes testes assumem", () => {
		// Sem esta âncora, uma reclassificação futura deixaria os testes abaixo verdes
		// verificando outra coisa que não o que os nomes deles afirmam.
		expect(ASSURANCE_REGISTRY[FRESH_OPERATION].require).toBe("fresh")
		expect(ASSURANCE_REGISTRY[SESSION_OPERATION].require).toBe("session")
		expect(ASSURANCE_REGISTRY[ROUTINE_OPERATION].require).toBe("none")
	})

	test("operação classificada que conclui grava a linha com operação, grau e alvo", async () => {
		const recorder = spyRecorder()

		const result = await withAudit({
			operation: FRESH_OPERATION,
			record: recorder.record,
			run: async () => ({ permissionId: "perm-1" }),
			target: (created) => ({ permissionId: created.permissionId, userId: "alvo-1", module: "unit" }),
		})

		expect(result).toEqual({ permissionId: "perm-1" })
		expect(recorder.entries).toEqual([
			{
				operation: "createUserPermissionFn",
				assurance: "fresh",
				target: { permissionId: "perm-1", userId: "alvo-1", module: "unit" },
			},
		])
	})

	test("o grau vem do registro, não do chamador — `session` grava `session`", async () => {
		const recorder = spyRecorder()

		await withAudit({
			operation: SESSION_OPERATION,
			record: recorder.record,
			run: async () => ({ liquidacaoId: "liq-1" }),
			target: (created) => ({ liquidacaoId: created.liquidacaoId }),
		})

		expect(recorder.entries[0]?.assurance).toBe("session")
		// Não há como o chamador declarar o grau: `withAudit` não aceita esse parâmetro.
		expect(Object.keys(recorder.entries[0] ?? {}).sort()).toEqual(["assurance", "operation", "target"])
	})

	test("o ator sai do contexto autenticado, e o envelope não tem como falsificá-lo", async () => {
		const recorder = spyRecorder()
		const ctx = { userId: "ator-real" }
		// Espelha a ligação de `audit.server.ts`: o gravador recebe o contexto e é ELE quem
		// resolve o ator. O envelope só entrega operação, grau e alvo.
		const written: { actorId: string; operation: string; assurance: string }[] = []
		const recordWithCtx = async (entry: AuditEntry) => {
			await recorder.record(entry)
			written.push({ actorId: ctx.userId, operation: entry.operation, assurance: entry.assurance })
		}

		await withAudit({
			operation: FRESH_OPERATION,
			record: recordWithCtx,
			run: async () => ({ permissionId: "perm-2" }),
			// O alvo nomeia OUTRA pessoa: é o caso normal de uma concessão, e não pode
			// contaminar o ator.
			target: () => ({ userId: "outra-pessoa" }),
		})

		expect(written).toEqual([{ actorId: "ator-real", operation: "createUserPermissionFn", assurance: "fresh" }])
		expect(recorder.entries[0]).not.toHaveProperty("actorId")
	})

	test("operação rejeitada não grava linha nenhuma", async () => {
		const recorder = spyRecorder()

		await expect(
			withAudit({
				operation: FRESH_OPERATION,
				record: recorder.record,
				// É assim que uma rejeição chega: o guard de permissão (ou, adiante, o de
				// garantia) lança de dentro da operação.
				run: async () => {
					throw new Error("Requires admin level 2")
				},
				target: () => ({ userId: "alvo-1" }),
			})
		).rejects.toThrow("Requires admin level 2")

		expect(recorder.entries).toEqual([])
	})

	test("operação de rotina não polui o registro", async () => {
		const recorder = spyRecorder()

		const result = await withAudit({
			operation: ROUTINE_OPERATION,
			record: recorder.record,
			run: async () => ({ forecastId: "prev-1" }),
			target: () => ({ forecastId: "prev-1" }),
		})

		expect(result).toEqual({ forecastId: "prev-1" })
		expect(recorder.entries).toEqual([])
	})

	test("falha ao gravar o log PROPAGA — não existe conclusão silenciosa sem rastro", async () => {
		await expect(
			withAudit({
				operation: SESSION_OPERATION,
				record: async () => {
					throw new Error("AUDIT_INSERT_FAILED: no row returned")
				},
				run: async () => ({ liquidacaoId: "liq-2" }),
			})
		).rejects.toThrow("AUDIT_INSERT_FAILED")
	})

	test("operação fora do registro falha ANTES de executar a mutação", async () => {
		const recorder = spyRecorder()
		let ran = false

		await expect(
			withAudit({
				operation: "operacaoQueNaoExisteFn" as AssuranceOperationName,
				record: recorder.record,
				run: async () => {
					ran = true
					return null
				},
			})
		).rejects.toThrow(/não está no registro de garantia/)

		// Falhar DEPOIS devolveria erro ao usuário com a escrita já aplicada.
		expect(ran).toBe(false)
		expect(recorder.entries).toEqual([])
	})

	test("sem extrator de alvo, a linha vai sem alvo — e não com um alvo inventado", async () => {
		const recorder = spyRecorder()

		await withAudit({
			operation: SESSION_OPERATION,
			record: recorder.record,
			run: async () => ({ liquidacaoId: "liq-3" }),
		})

		expect(recorder.entries[0]?.target).toBeUndefined()
	})
})
