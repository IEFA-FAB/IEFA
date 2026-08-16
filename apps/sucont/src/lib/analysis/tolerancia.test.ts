import { describe, expect, it } from "bun:test"
import { arredondarCentavos, saldosDivergem, saldoZerado, TOLERANCIA_SALDO } from "./tolerancia"

describe("tolerância de saldo", () => {
	it("arredonda para centavos eliminando o resíduo binário", () => {
		expect(arredondarCentavos(0.1 + 0.2)).toBe(0.3)
		expect(arredondarCentavos(-1234.567)).toBe(-1234.57)
	})

	it("não derruba o meio-centavo para baixo, como fazem toFixed(2) e Math.round cru", () => {
		// (1.005).toFixed(2) devolve "1.00" e Math.round(8.575 * 100) devolve 857: em
		// binário 1,005 é 1,00499… e 8,575 é 8,57499…. Numa soma de dezenas de linhas o
		// viés é sempre no mesmo sentido e vira diferença sem origem na conciliação.
		expect(Number((1.005).toFixed(2))).toBe(1)
		expect(Math.round(8.575 * 100) / 100).toBe(8.57)

		expect(arredondarCentavos(1.005)).toBe(1.01)
		expect(arredondarCentavos(8.575)).toBe(8.58)
		expect(arredondarCentavos(2.675)).toBe(2.68)
		expect(arredondarCentavos(10.005)).toBe(10.01)
	})

	it("devolve zero para valor não finito em vez de propagar NaN", () => {
		expect(arredondarCentavos(Number.NaN)).toBe(0)
		expect(arredondarCentavos(Number.POSITIVE_INFINITY)).toBe(0)
	})

	it("não vê divergência dentro do ruído de arredondamento", () => {
		expect(saldosDivergem(1000, 1000)).toBe(false)
		expect(saldosDivergem(1000, 1000 + TOLERANCIA_SALDO)).toBe(false)
		expect(saldosDivergem(0.1 + 0.2, 0.3)).toBe(false)
	})

	it("vê divergência a partir de um centavo", () => {
		expect(saldosDivergem(1000, 1000.01)).toBe(true)
		expect(saldosDivergem(-500, 500)).toBe(true)
	})

	it("trata zero contábil como zero", () => {
		expect(saldoZerado(0)).toBe(true)
		expect(saldoZerado(0.004)).toBe(true)
		expect(saldoZerado(0.01)).toBe(false)
	})
})
