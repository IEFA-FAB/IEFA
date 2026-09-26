import { describe, expect, test } from "bun:test"
import { buildCaracteristicaRows } from "./material.ts"
import type { ComprasCaracteristicaMaterial } from "./types.ts"
import { dedupeByKey } from "./upsert.ts"

/**
 * Com o unique NULLS NOT DISTINCT em (codigo_item, codigo_caracteristica,
 * codigo_valor_caracteristica), duas linhas da mesma chave no mesmo lote abortam o upsert com
 * "ON CONFLICT DO UPDATE command cannot affect row a second time", e o step cai inteiro.
 */

const caracteristica = (overrides: Partial<ComprasCaracteristicaMaterial> = {}): ComprasCaracteristicaMaterial => ({
	codigoItem: 150_001,
	codigoCaracteristica: "123",
	nomeCaracteristica: "COR",
	statusCaracteristica: true,
	codigoValorCaracteristica: null,
	nomeValorCaracteristica: null,
	statusValorCaracteristica: null,
	numeroCaracteristica: 1,
	siglaUnidadeMedida: null,
	dataHoraAtualizacao: "2024-05-14T03:00:00.143484",
	...overrides,
})

describe("buildCaracteristicaRows", () => {
	test("duas linhas da mesma chave com valor nulo viram uma, a última", () => {
		const rows = buildCaracteristicaRows(
			[caracteristica({ nomeCaracteristica: "COR ANTIGA" }), caracteristica({ nomeCaracteristica: "COR" })],
			"2026-09-26T06:00:00Z"
		)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ codigo_item: 150_001, codigo_caracteristica: "123", codigo_valor_caracteristica: null, nome_caracteristica: "COR" })
	})

	test("valor ausente (undefined) e nulo são a mesma chave", () => {
		const rows = buildCaracteristicaRows([caracteristica({ codigoValorCaracteristica: undefined }), caracteristica({ codigoValorCaracteristica: null })])
		expect(rows).toHaveLength(1)
	})

	test("chaves distintas ficam, inclusive nulo × valor e valores diferentes", () => {
		const rows = buildCaracteristicaRows([
			caracteristica({ codigoValorCaracteristica: null }),
			caracteristica({ codigoValorCaracteristica: "9" }),
			caracteristica({ codigoValorCaracteristica: "10" }),
			caracteristica({ codigoCaracteristica: "124" }),
			caracteristica({ codigoItem: 150_002 }),
		])
		expect(rows.map((row) => [row.codigo_item, row.codigo_caracteristica, row.codigo_valor_caracteristica])).toEqual([
			[150_001, "123", null],
			[150_001, "123", "9"],
			[150_001, "123", "10"],
			[150_001, "124", null],
			[150_002, "123", null],
		])
	})
})

describe("dedupeByKey", () => {
	test("NULL não casa com a string 'null'", () => {
		expect(
			dedupeByKey(
				[
					{ a: 1, b: null },
					{ a: 1, b: "null" },
				],
				["a", "b"]
			)
		).toHaveLength(2)
	})

	test("mantém a última ocorrência na posição dela", () => {
		const rows = [
			{ k: 1, v: "primeira" },
			{ k: 2, v: "outra" },
			{ k: 1, v: "última" },
		]
		expect(dedupeByKey(rows, ["k"])).toEqual([
			{ k: 2, v: "outra" },
			{ k: 1, v: "última" },
		])
	})
})
