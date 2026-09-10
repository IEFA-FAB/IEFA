/**
 * Contrato da hipótese de transferência entre OMs.
 *
 * Cada bloco trava um dos defeitos que a versão de origem tinha, e todos são
 * observáveis na série real de 32 competências: o par formado contra uma
 * competência que não está na base, o par formado com a própria UG, o par formado
 * entre meses diferentes e o "top 3" que não era o dos maiores valores.
 */

import { describe, expect, it } from "bun:test"
import { AccountGroup, type FinancialRecord } from "../types"
import { detectInterOmTransfers, GRUPO_DIVERSOS, MOVIMENTO_MINIMO_SIAFI } from "./inter-om"

interface RecordSpec {
	ug: string
	cod: string
	date?: string
	group?: AccountGroup
	siafi: number
	prevSiafi: number
	siloms?: number
	prevSiloms?: number
	hasPrevious?: boolean
}

/** Registro no estado em que `recalculateDeltas` o entrega. */
function record(spec: RecordSpec): FinancialRecord {
	const date = spec.date ?? "2025-07"
	const [year, month] = date.split("-").map(Number)
	const siloms = spec.siloms ?? 0
	const prevSiloms = spec.prevSiloms ?? siloms
	const group = spec.group ?? AccountGroup.BMP

	return {
		id: `${spec.cod}-${group}-${date}`,
		date,
		monthIndex: month - 1,
		year,
		sortableDate: date,
		cod: spec.cod,
		ug: spec.ug,
		orgaoSuperior: "N/A",
		ods: "N/A",
		group,
		siafiValue: spec.siafi,
		silomsValue: siloms,
		difference: Math.abs(spec.siafi - siloms),
		preponderance: spec.siafi > siloms ? "SIAFI" : spec.siafi < siloms ? "SILOMS" : "EQUAL",
		hasPrevious: spec.hasPrevious ?? true,
		previousSiafiValue: spec.prevSiafi,
		previousSilomsValue: prevSiloms,
		previousDifference: Math.abs(spec.prevSiafi - prevSiloms),
		previousDate: "ANTERIOR",
		delta: 0,
	}
}

/** Um par que casa: 5 milhões saem de uma UG e entram na outra, SILOMS parado. */
const parLimpo = [
	record({ ug: "GAP-RJ", cod: "120100", siafi: 15_000_000, prevSiafi: 20_000_000 }),
	record({ ug: "GAP-SP", cod: "120200", siafi: 25_000_000, prevSiafi: 20_000_000 }),
]

describe("detectInterOmTransfers", () => {
	it("acha o par cujo SIAFI se anula com o SILOMS parado", () => {
		const [hit, ...rest] = detectInterOmTransfers(parLimpo)

		expect(rest).toHaveLength(0)
		expect([hit.codA, hit.codB].sort()).toEqual(["120100", "120200"])
		expect(hit.value).toBe(5_000_000)
		expect(hit.residual).toBe(0)
		expect(hit.group).toBe(AccountGroup.BMP)
		expect(hit.date).toBe("2025-07")
	})

	it("aceita o casamento imperfeito dentro da folga e recusa fora dela", () => {
		// 5.000.000 contra 4.800.000: resíduo de 200 mil, 4% da perna maior.
		const dentro = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", siafi: 15_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", siafi: 24_800_000, prevSiafi: 20_000_000 }),
		])
		expect(dentro).toHaveLength(1)
		expect(dentro[0].residual).toBe(200_000)

		// 5.000.000 contra 4.000.000: resíduo de 1 milhão, 20% da perna maior.
		const fora = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", siafi: 15_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", siafi: 24_000_000, prevSiafi: 20_000_000 }),
		])
		expect(fora).toHaveLength(0)
	})

	it("não forma par quando os dois movimentos têm o mesmo sinal", () => {
		const found = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", siafi: 25_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", siafi: 25_000_000, prevSiafi: 20_000_000 }),
		])
		expect(found).toHaveLength(0)
	})

	it("ignora movimento abaixo do piso de materialidade", () => {
		const found = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", siafi: 20_000_000 - MOVIMENTO_MINIMO_SIAFI, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", siafi: 20_000_000 + MOVIMENTO_MINIMO_SIAFI, prevSiafi: 20_000_000 }),
		])
		expect(found).toHaveLength(0)
	})

	it("descarta a ponta cujo SILOMS também andou — aí não é falta de contrapartida", () => {
		const found = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", siafi: 15_000_000, prevSiafi: 20_000_000, siloms: 15_000_000, prevSiloms: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", siafi: 25_000_000, prevSiafi: 20_000_000 }),
		])
		expect(found).toHaveLength(0)
	})

	// Defeito 1 do upstream: `previousSiafiValue || 0` não distingue "não mudou" de
	// "a competência anterior não está na base".
	it("não usa competência ausente como se fosse saldo anterior zero", () => {
		const found = detectInterOmTransfers([
			// Sem competência anterior. Lido como movimento, seriam +15 milhões vindos do nada.
			record({ ug: "GAP-RJ", cod: "120100", siafi: 15_000_000, prevSiafi: 0, hasPrevious: false }),
			record({ ug: "GAP-SP", cod: "120200", siafi: 5_000_000, prevSiafi: 20_000_000 }),
		])
		expect(found).toHaveLength(0)
	})

	// Defeito 2: BMP sobe e Consumo desce DENTRO da mesma UG é reclassificação.
	it("não cruza dois grupos de conta da mesma UG", () => {
		const found = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", group: AccountGroup.BMP, siafi: 15_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-RJ", cod: "120100", group: AccountGroup.CONSUMO, siafi: 25_000_000, prevSiafi: 20_000_000 }),
		])
		expect(found).toHaveLength(0)
	})

	// Defeito 3: movimento de março não casa com movimento de julho.
	it("só forma par dentro da mesma competência", () => {
		const found = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", date: "2025-03", siafi: 15_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", date: "2025-07", siafi: 25_000_000, prevSiafi: 20_000_000 }),
		])
		expect(found).toHaveLength(0)
	})

	// Defeito 4: o corte do upstream era pela ordem de iteração.
	it("devolve os pares de MAIOR valor, não os primeiros encontrados", () => {
		const found = detectInterOmTransfers(
			[
				// Par pequeno primeiro na lista — o `slice(0, 1)` ingênuo o escolheria.
				record({ ug: "BAAN", cod: "120001", siafi: 1_000_000, prevSiafi: 1_200_000 }),
				record({ ug: "BABR", cod: "120002", siafi: 1_200_000, prevSiafi: 1_000_000 }),
				record({ ug: "GAP-RJ", cod: "120100", siafi: 15_000_000, prevSiafi: 20_000_000 }),
				record({ ug: "GAP-SP", cod: "120200", siafi: 25_000_000, prevSiafi: 20_000_000 }),
			],
			{ limit: 1 }
		)

		expect(found).toHaveLength(1)
		expect(found[0].value).toBe(5_000_000)
	})

	it("marca o par como DIVERSOS quando os grupos de conta diferem", () => {
		const [hit] = detectInterOmTransfers([
			record({ ug: "GAP-RJ", cod: "120100", group: AccountGroup.BMP, siafi: 15_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", group: AccountGroup.CONSUMO, siafi: 25_000_000, prevSiafi: 20_000_000 }),
		])
		expect(hit.group).toBe(GRUPO_DIVERSOS)
	})

	it("é determinístico: o mesmo recorte produz a mesma lista", () => {
		const base = [
			record({ ug: "GAP-RJ", cod: "120100", siafi: 15_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "GAP-SP", cod: "120200", siafi: 25_000_000, prevSiafi: 20_000_000 }),
			record({ ug: "BAAN", cod: "120001", siafi: 1_000_000, prevSiafi: 3_000_000 }),
			record({ ug: "BABR", cod: "120002", siafi: 3_000_000, prevSiafi: 1_000_000 }),
		]
		expect(detectInterOmTransfers(base)).toEqual(detectInterOmTransfers([...base].reverse()))
	})

	it("devolve lista vazia sem registros ou com limite zero", () => {
		expect(detectInterOmTransfers([])).toEqual([])
		expect(detectInterOmTransfers(parLimpo, { limit: 0 })).toEqual([])
	})
})
