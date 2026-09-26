import { describe, expect, test } from "bun:test"
import { assertSpecCoversRow, diffRows, isSameRow, normalizeValue, type RowSpec, rowKey, toEpochMicros } from "./diff.ts"
import { ROW_SPECS } from "./row-specs.ts"

/**
 * O sync regravava toda linha a cada execução (4,4 mi de updates em 1,7 mi de características).
 * O diff decide quais linhas mudaram. O erro que importa é o "falso igual": pular uma linha que
 * mudou perde dado em silêncio. O "falso diferente" só custa uma gravação, que era o padrão antes.
 */

const caracteristica = ROW_SPECS.materialCaracteristica

function caracteristicaRow(overrides: Record<string, unknown> = {}) {
	return {
		codigo_item: 150_001,
		codigo_caracteristica: "123",
		nome_caracteristica: "COR",
		status_caracteristica: true,
		codigo_valor_caracteristica: "9",
		nome_valor_caracteristica: "AZUL",
		status_valor_caracteristica: true,
		numero_caracteristica: 1,
		sigla_unidade_medida: null,
		data_hora_atualizacao: "2024-05-14T03:00:00.143484",
		synced_at: "2026-09-26T06:00:00.000Z",
		...overrides,
	}
}

/** A mesma linha como o PostgREST devolve: timestamptz com `+00:00`, sem `synced_at` pedido. */
function caracteristicaFromDb(overrides: Record<string, unknown> = {}) {
	const { synced_at: _ignored, ...row } = caracteristicaRow({ data_hora_atualizacao: "2024-05-14T03:00:00.143484+00:00", ...overrides })
	return row
}

describe("normalizeValue", () => {
	test("null e undefined são o mesmo valor em qualquer tipo", () => {
		for (const kind of ["text", "integer", "numeric", "boolean", "timestamptz"] as const) {
			expect(normalizeValue(kind, null)).toBeNull()
			expect(normalizeValue(kind, undefined)).toBeNull()
		}
	})

	test("numeric vindo como string compara pelo valor", () => {
		expect(normalizeValue("numeric", "1.5000")).toBe(normalizeValue("numeric", 1.5))
		expect(normalizeValue("numeric", " 12 ")).toBe(normalizeValue("numeric", 12))
		expect(normalizeValue("integer", "7")).toBe(7)
	})

	test("string que não é número não coincide com número nenhum", () => {
		expect(normalizeValue("numeric", "1,5")).not.toBe(normalizeValue("numeric", 1.5))
		expect(normalizeValue("numeric", "")).not.toBe(normalizeValue("numeric", 0))
	})

	test("texto não é aparado nem muda de caixa: diferença de espaço é mudança", () => {
		expect(normalizeValue("text", "AZUL ")).not.toBe(normalizeValue("text", "AZUL"))
		expect(normalizeValue("text", "azul")).not.toBe(normalizeValue("text", "AZUL"))
	})

	test("número gravado em coluna de texto coincide com o literal que o banco guarda", () => {
		expect(normalizeValue("text", 123)).toBe("123")
		expect(normalizeValue("text", 123)).not.toBe(normalizeValue("text", "0123"))
	})

	test("booleano aceita a forma textual do Postgres", () => {
		expect(normalizeValue("boolean", "t")).toBe(true)
		expect(normalizeValue("boolean", "false")).toBe(false)
		expect(normalizeValue("boolean", "sim")).not.toBe(true)
		// `false` e `null` são valores distintos: NULL → false é mudança.
		expect(normalizeValue("boolean", false)).not.toBe(normalizeValue("boolean", null))
	})
})

describe("toEpochMicros", () => {
	test("valor da API sem fuso é UTC, como o PostgREST grava (TimeZone da sessão = UTC)", () => {
		expect(toEpochMicros("2021-10-16T09:43:08.030221")).toBe(toEpochMicros("2021-10-16T09:43:08.030221+00:00"))
		expect(toEpochMicros("2021-10-16 09:43:08.030221+00")).toBe(toEpochMicros("2021-10-16T09:43:08.030221Z"))
	})

	test("zeros finais da fração não mudam o instante (o Postgres os omite na saída)", () => {
		expect(toEpochMicros("2024-01-15T10:30:00.120000")).toBe(toEpochMicros("2024-01-15T10:30:00.12+00:00"))
		expect(toEpochMicros("2024-01-15T10:30:00")).toBe(toEpochMicros("2024-01-15T10:30:00.000+00:00"))
	})

	test("fuso diferente, mesmo instante", () => {
		expect(toEpochMicros("2024-01-15T07:30:00-03:00")).toBe(toEpochMicros("2024-01-15T10:30:00Z"))
		expect(toEpochMicros("2024-01-15T13:00:00+0230")).toBe(toEpochMicros("2024-01-15T10:30:00Z"))
	})

	test("precisão de microssegundo: 1 µs de diferença é mudança", () => {
		expect(toEpochMicros("2024-01-15T10:30:00.000001")).not.toBe(toEpochMicros("2024-01-15T10:30:00"))
	})

	test("fração além de 6 dígitos arredonda como o Postgres, inclusive virando o segundo", () => {
		expect(toEpochMicros("2024-01-15T10:30:00.1234565")).toBe(toEpochMicros("2024-01-15T10:30:00.123457"))
		expect(toEpochMicros("2024-01-15T10:30:00.1234564")).toBe(toEpochMicros("2024-01-15T10:30:00.123456"))
		expect(toEpochMicros("2024-01-15T10:30:59.9999999")).toBe(toEpochMicros("2024-01-15T10:31:00"))
	})

	test("data sem hora é meia-noite UTC", () => {
		expect(toEpochMicros("2024-01-15")).toBe(toEpochMicros("2024-01-15T00:00:00Z"))
	})

	test("Date e string ISO do mesmo instante coincidem", () => {
		expect(toEpochMicros(new Date("2024-01-15T10:30:00.123Z"))).toBe(toEpochMicros("2024-01-15T10:30:00.123"))
	})

	test("valor inválido não normaliza (e a linha conta como alterada)", () => {
		expect(toEpochMicros("2024-02-31T00:00:00")).toBeNull()
		expect(toEpochMicros("15/01/2024")).toBeNull()
		expect(toEpochMicros("infinity")).toBeNull()
		expect(normalizeValue("timestamptz", "15/01/2024")).not.toBe(normalizeValue("timestamptz", "2024-01-15"))
	})
})

describe("isSameRow", () => {
	test("linha da API igual à do banco, com fuso e synced_at diferentes, é igual", () => {
		expect(isSameRow(caracteristica, caracteristicaRow(), caracteristicaFromDb())).toBe(true)
	})

	test("synced_at não entra na comparação", () => {
		expect(isSameRow(caracteristica, caracteristicaRow({ synced_at: "2030-01-01T00:00:00Z" }), caracteristicaFromDb())).toBe(true)
	})

	test("cada coluna de negócio, sozinha, torna a linha diferente", () => {
		const changes: Record<string, unknown> = {
			nome_caracteristica: "COR PREDOMINANTE",
			status_caracteristica: false,
			nome_valor_caracteristica: "VERDE",
			status_valor_caracteristica: null,
			numero_caracteristica: 2,
			sigla_unidade_medida: "UN",
			data_hora_atualizacao: "2025-01-01T00:00:00",
		}
		for (const [column, value] of Object.entries(changes)) {
			expect({ column, same: isSameRow(caracteristica, caracteristicaRow({ [column]: value }), caracteristicaFromDb()) }).toEqual({ column, same: false })
		}
	})

	test("todas as tabelas: coluna gravada ≠ banco é detectada", () => {
		for (const spec of Object.values(ROW_SPECS) as RowSpec[]) {
			for (const [column, kind] of Object.entries(spec.columns)) {
				const base = Object.fromEntries(Object.keys(spec.columns).map((c) => [c, null]))
				const sample = { integer: 1, numeric: 1.25, text: "a", boolean: true, timestamptz: "2024-01-01T00:00:00" }[kind]
				expect(isSameRow(spec, { ...base, [column]: sample }, base)).toBe(false)
				expect(isSameRow(spec, base, base)).toBe(true)
			}
		}
	})
})

describe("rowKey", () => {
	test("normaliza a chave: 150001 e '150001' são a mesma linha", () => {
		expect(rowKey(caracteristica, caracteristicaRow({ codigo_item: "150001" }))).toBe(rowKey(caracteristica, caracteristicaRow({ codigo_item: 150_001 })))
	})

	test("chave com NULL tem forma própria, distinta de string vazia", () => {
		expect(rowKey(caracteristica, caracteristicaRow({ codigo_valor_caracteristica: null }))).not.toBe(
			rowKey(caracteristica, caracteristicaRow({ codigo_valor_caracteristica: "" }))
		)
	})
})

describe("assertSpecCoversRow", () => {
	test("coluna nova no payload sem entrar no spec derruba o step em vez de ser ignorada", () => {
		expect(() => assertSpecCoversRow(caracteristica, { ...caracteristicaRow(), coluna_nova: 1 })).toThrow(/coluna_nova/)
	})

	test("specs coerentes: chave, busca e ordenação são colunas declaradas; busca é inteira", () => {
		for (const spec of Object.values(ROW_SPECS) as RowSpec[]) {
			for (const column of spec.keyColumns) expect(spec.columns).toHaveProperty(column)
			expect(spec.columns[spec.lookupColumn]).toBe("integer")
			expect(spec.keyColumns).toContain(spec.lookupColumn)
			expect(spec.keyColumns[0]).toBe(spec.lookupColumn)
		}
	})
})

describe("diffRows", () => {
	test("separa nova, alterada e igual, preservando a ordem de entrada", () => {
		const incoming = [
			caracteristicaRow({ codigo_caracteristica: "1" }), // igual
			caracteristicaRow({ codigo_caracteristica: "2", nome_valor_caracteristica: "VERDE" }), // alterada
			caracteristicaRow({ codigo_caracteristica: "3" }), // nova
		]
		const existing = [caracteristicaFromDb({ codigo_caracteristica: "1" }), caracteristicaFromDb({ codigo_caracteristica: "2" })]
		const { changed, unchanged } = diffRows(caracteristica, incoming, existing)
		expect(unchanged).toBe(1)
		expect(changed.map((row) => row.codigo_caracteristica)).toEqual(["2", "3"])
		// A linha segue intacta para o upsert (inclusive synced_at).
		expect(changed[0]).toBe(incoming[1])
	})

	test("linha existente de outra chave (veio pela busca por chave-pai) não conta", () => {
		const { changed } = diffRows(caracteristica, [caracteristicaRow()], [caracteristicaFromDb({ codigo_item: 999 })])
		expect(changed).toHaveLength(1)
	})

	test("chave com NULL duplicada no banco: basta uma cópia igual para pular", () => {
		const incoming = [caracteristicaRow({ codigo_valor_caracteristica: null, nome_valor_caracteristica: null })]
		const existing = [
			caracteristicaFromDb({ codigo_valor_caracteristica: null, nome_valor_caracteristica: "ANTIGO" }),
			caracteristicaFromDb({ codigo_valor_caracteristica: null, nome_valor_caracteristica: null }),
		]
		expect(diffRows(caracteristica, incoming, existing)).toEqual({ changed: [], unchanged: 1 })
	})

	test("payload vazio e banco vazio", () => {
		expect(diffRows(caracteristica, [], [caracteristicaFromDb()])).toEqual({ changed: [], unchanged: 0 })
		expect(diffRows(caracteristica, [caracteristicaRow()], []).changed).toHaveLength(1)
	})
})
