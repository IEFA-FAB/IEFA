import { describe, expect, it } from "bun:test"
import { agregarSaldos, compararPares, PARES } from "./pares"

const [PAR_CAUCAO, PAR_CONSUMO, PAR_BMP] = PARES

describe("pares das Questões 40–42", () => {
	it("declara três pares com contas de 9 dígitos e fundamentação preenchida", () => {
		expect(PARES).toHaveLength(3)
		for (const par of PARES) {
			expect(par.a).toMatch(/^\d{9}$/)
			expect(par.b).toMatch(/^\d{9}$/)
			expect(par.question).toMatch(/^Questão \d+ do Roteiro/)
			// Nenhum par pode sair sem base normativa: o par 40 saía com `legis` vazio e
			// a mensagem chegava à UG sem dizer o que estava sendo descumprido.
			expect(par.legis.trim(), `par ${par.id} sem fundamentação`).not.toBe("")
		}
	})

	it("não repete conta entre pares", () => {
		const contas = PARES.flatMap((p) => [p.a, p.b])
		expect(new Set(contas).size).toBe(contas.length)
	})
})

describe("agregarSaldos", () => {
	it("soma as linhas repetidas da mesma UG e conta", () => {
		const ugs = agregarSaldos([
			{ ug: "120062", conta: PAR_BMP.a, saldo: 300 },
			{ ug: "120062", conta: PAR_BMP.a, saldo: 200 },
			{ ug: "120062", conta: PAR_BMP.b, saldo: 500 },
		])
		expect(ugs["120062"][PAR_BMP.a]).toBe(500)
		expect(ugs["120062"][PAR_BMP.b]).toBe(500)
	})

	it("mantém as UGs separadas", () => {
		const ugs = agregarSaldos([
			{ ug: "120062", conta: PAR_BMP.a, saldo: 100 },
			{ ug: "120075", conta: PAR_BMP.a, saldo: 900 },
		])
		expect(ugs["120062"][PAR_BMP.a]).toBe(100)
		expect(ugs["120075"][PAR_BMP.a]).toBe(900)
	})

	it("arredonda para centavos ao somar", () => {
		const ugs = agregarSaldos([
			{ ug: "120062", conta: PAR_BMP.a, saldo: 0.1 },
			{ ug: "120062", conta: PAR_BMP.a, saldo: 0.2 },
		])
		expect(ugs["120062"][PAR_BMP.a]).toBe(0.3)
	})

	it("descarta linha sem UG ou sem conta e trata saldo inválido como zero", () => {
		const ugs = agregarSaldos([
			{ ug: "", conta: PAR_BMP.a, saldo: 100 },
			{ ug: "120062", conta: "", saldo: 100 },
			{ ug: "120062", conta: PAR_BMP.a, saldo: Number.NaN },
		])
		expect(Object.keys(ugs)).toEqual(["120062"])
		expect(ugs["120062"][PAR_BMP.a]).toBe(0)
	})
})

describe("compararPares", () => {
	it("ignora par ausente por inteiro — a UG não opera aquelas contas", () => {
		expect(compararPares({})).toEqual({ divergentes: [], totalDiff: 0 })
	})

	it("não aponta nada quando os dois lados fecham", () => {
		const r = compararPares({ [PAR_BMP.a]: 1000, [PAR_BMP.b]: 1000 })
		expect(r.divergentes).toEqual([])
		expect(r.totalDiff).toBe(0)
	})

	it("aponta divergência preservando o sinal da diferença", () => {
		const r = compararPares({ [PAR_BMP.a]: 1000, [PAR_BMP.b]: 400 })
		expect(r.divergentes).toHaveLength(1)
		expect(r.divergentes[0].diff).toBe(600)
		expect(r.totalDiff).toBe(600)

		const invertido = compararPares({ [PAR_BMP.a]: 400, [PAR_BMP.b]: 1000 })
		expect(invertido.divergentes[0].diff).toBe(-600)
		expect(invertido.totalDiff).toBe(600)
	})

	it("aponta o par com um lado só, ainda que o lado presente esteja zerado", () => {
		const r = compararPares({ [PAR_CONSUMO.a]: 0 })
		expect(r.divergentes).toHaveLength(1)
		expect(r.divergentes[0].hasA).toBe(true)
		expect(r.divergentes[0].hasB).toBe(false)
		expect(r.divergentes[0].saldoB).toBeUndefined()
	})

	it("não transforma centavo de arredondamento em divergência", () => {
		const r = compararPares({ [PAR_CAUCAO.a]: 0.1 + 0.2, [PAR_CAUCAO.b]: 0.3 })
		expect(r.divergentes).toEqual([])
	})

	it("soma o impacto de vários pares divergentes e devolve o índice de cada um", () => {
		const r = compararPares({
			[PAR_CAUCAO.a]: 100,
			[PAR_CAUCAO.b]: 40,
			[PAR_BMP.a]: 10,
			[PAR_BMP.b]: 0,
		})
		expect(r.divergentes.map((d) => d.indice)).toEqual([0, 2])
		expect(r.totalDiff).toBe(70)
	})
})
