import { describe, expect, test } from "bun:test"
import { checkSnapshotSanity, contentHash, planReconciliation } from "./reconcile.ts"

const item = (idItemPca: string) => ({ idItemPca })
const known = (idItemPca: string, removed = false) => ({ idItemPca, removed })

describe("planReconciliation", () => {
	test("primeira coleta insere tudo e não remove nada", () => {
		const p = planReconciliation({ incoming: [item("1"), item("2")], known: [] })

		expect(p.upsertIds.sort()).toEqual(["1", "2"])
		expect(p.removeIds).toEqual([])
		expect(p.restoreIds).toEqual([])
	})

	test("reprocessar conteúdo idêntico não remove nada", () => {
		const p = planReconciliation({ incoming: [item("1"), item("2")], known: [known("1"), known("2")] })

		expect(p.removeIds).toEqual([])
		expect(p.restoreIds).toEqual([])
	})

	test("item retirado do plano é marcado como removido — o defeito que upsert-merge não pega", () => {
		const p = planReconciliation({ incoming: [item("1")], known: [known("1"), known("2")] })

		expect(p.removeIds).toEqual(["2"])
	})

	test("item que volta ao plano é restaurado, não duplicado", () => {
		const p = planReconciliation({ incoming: [item("1"), item("2")], known: [known("1"), known("2", true)] })

		expect(p.restoreIds).toEqual(["2"])
		expect(p.removeIds).toEqual([])
	})

	test("item já removido e ainda ausente não é remarcado", () => {
		const p = planReconciliation({ incoming: [item("1")], known: [known("1"), known("2", true)] })

		expect(p.removeIds).toEqual([])
		expect(p.restoreIds).toEqual([])
	})
})

describe("checkSnapshotSanity", () => {
	test("primeira coleta passa", () => {
		expect(checkSnapshotSanity({ incomingRows: 21392, knownRows: 0 }).ok).toBe(true)
	})

	test("volume estável passa", () => {
		expect(checkSnapshotSanity({ incomingRows: 21000, knownRows: 21392 }).ok).toBe(true)
	})

	test("arquivo truncado é recusado — chunked torna truncado indistinguível de curto", () => {
		const v = checkSnapshotSanity({ incomingRows: 500, knownRows: 21392 })

		expect(v.ok).toBe(false)
		expect(v.ok === false && v.reason).toContain("queda anômala")
	})

	test("arquivo vazio nunca reconcilia — seria apagar o plano inteiro", () => {
		expect(checkSnapshotSanity({ incomingRows: 0, knownRows: 21392 }).ok).toBe(false)
	})

	test("crescimento nunca é suspeito", () => {
		expect(checkSnapshotSanity({ incomingRows: 40000, knownRows: 21392 }).ok).toBe(true)
	})
})

describe("contentHash", () => {
	test("conteúdo igual gera hash igual — é a guarda de invalidação", async () => {
		expect(await contentHash("a;b\n1;2")).toBe(await contentHash("a;b\n1;2"))
	})

	test("um byte diferente muda o hash", async () => {
		expect(await contentHash("a;b\n1;2")).not.toBe(await contentHash("a;b\n1;3"))
	})
})
