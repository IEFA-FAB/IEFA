/**
 * Resolução de divergência SIAFI × sisub. O defeito de origem: `valorSisub`/`valorSiafi` vinham do
 * payload e viravam o reforço/anulação do empenho, e o segundo clique gravava um segundo evento.
 */
import { describe, expect, test } from "vitest"
import { planDivergenceResolution, RECONCILIATION_CONFLICT_PREFIX, type ReconciliationSnapshot } from "@/lib/reconciliation-decision"

const DIVERGENTE: ReconciliationSnapshot = { situacao: "divergente", valorSisub: 1000, valorSiafi: 1200, decisaoVigente: false }
const SEEN = { valorSisub: 1000, valorSiafi: 1200 }

function plan(overrides: Partial<Parameters<typeof planDivergenceResolution>[0]> = {}) {
	return planDivergenceResolution({ snapshot: DIVERGENTE, documentoTipo: "ne", decisao: "adotado_siafi", seen: SEEN, hasEmpenho: true, ...overrides })
}

describe("planDivergenceResolution — o valor é o do banco, não o do payload", () => {
	test("adotar o SIAFI numa NE vira reforço do tamanho da diferença LIDA", () => {
		const result = plan()
		expect(result).toMatchObject({ ok: true, valorSisub: 1000, valorSiafi: 1200, empenhoEvent: { tipo: "reforco", valor: 200 } })
	})

	test("SIAFI menor vira anulação", () => {
		const result = plan({ snapshot: { ...DIVERGENTE, valorSiafi: 900 }, seen: { valorSisub: 1000, valorSiafi: 900 } })
		expect(result).toMatchObject({ ok: true, empenhoEvent: { tipo: "anulacao", valor: 100 } })
	})

	test("payload com outros valores é conflito, não um evento com o número do cliente", () => {
		const result = plan({ seen: { valorSisub: 1000, valorSiafi: 999_999 } })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.message.startsWith(RECONCILIATION_CONFLICT_PREFIX)).toBe(true)
	})

	test("versão nula quando o banco tem valor é conflito", () => {
		expect(plan({ seen: { valorSisub: null, valorSiafi: 1200 } }).ok).toBe(false)
	})

	test("diferença abaixo de um centavo não é conflito (arredondamento da tela)", () => {
		expect(plan({ seen: { valorSisub: 1000.004, valorSiafi: 1200 } }).ok).toBe(true)
	})

	test("documento que já não está divergente (o primeiro clique já adotou) é recusado — idempotência", () => {
		const result = plan({ snapshot: { ...DIVERGENTE, situacao: "conciliado" } })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.message).toMatch(/não está mais divergente/)
	})

	test("decisão vigente para os mesmos valores é recusada", () => {
		const result = plan({ snapshot: { ...DIVERGENTE, decisaoVigente: true } })
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.message).toMatch(/já tem decisão/)
	})

	test("documento fora da conciliação é recusado", () => {
		expect(plan({ snapshot: null }).ok).toBe(false)
	})

	test("apenas no SIAFI / apenas no sisub não é divergência de valor", () => {
		expect(plan({ snapshot: { ...DIVERGENTE, situacao: "apenas_siafi", valorSisub: null }, seen: { valorSisub: null, valorSiafi: 1200 } }).ok).toBe(false)
	})

	test("manter o local não mexe no empenho", () => {
		expect(plan({ decisao: "mantido_local" })).toMatchObject({ ok: true, empenhoEvent: null })
	})

	test("NS/OB registram só a decisão", () => {
		expect(plan({ documentoTipo: "ns" })).toMatchObject({ ok: true, empenhoEvent: null })
	})

	test("NE divergente sem empenho local é recusada ao adotar", () => {
		expect(plan({ hasEmpenho: false }).ok).toBe(false)
	})
})
