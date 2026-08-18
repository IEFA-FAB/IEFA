/**
 * Passa a base REAL de uma competência pelo parser.
 *
 * Fica em skip por padrão: as planilhas do DGC são dado institucional e não moram
 * no repositório. Para rodar, coloque os quatro CSVs exportados do Tesouro
 * Gerencial em `apps/sucont/data_test/` e rode `bun test`.
 *
 * O que só a base real pega e a amostra não: coluna a mais num painel, UG nova sem
 * mapeamento, competência dividida entre meses, e recorte grande demais para o
 * orçamento de caracteres.
 */
import { describe, expect, it } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { buildGroupContext, decodeSpreadsheet, MAX_GROUP_CONTEXT_CHARS, parseDgcBase } from "#/sacdgc/parser"

const DATA_DIR = resolve(import.meta.dir, "../../data_test")
const csvFiles = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).filter((name) => name.toLowerCase().endsWith(".csv")) : []
const hasBase = csvFiles.length > 0

describe.skipIf(!hasBase)("base real do DGC (data_test/)", () => {
	const sources = csvFiles.map((name) => ({ name, text: decodeSpreadsheet(readFileSync(join(DATA_DIR, name))) }))
	const base = parseDgcBase(sources)

	it("não descarta nenhuma linha de dado", () => {
		expect(base.skippedRows).toBe(0)
	})

	it("produz um recorte por UG", () => {
		expect(base.datasets.length).toBeGreaterThan(0)
		expect(new Set(base.datasets.map((d) => d.ugCode)).size).toBe(base.datasets.length)
	})

	// Um único caractere de substituição significa que o windows-1252 foi lido como
	// UTF-8 e o modelo receberia o fator de custo com o acento destruído.
	it("decodifica sem corromper acento", () => {
		for (const dataset of base.datasets) expect(dataset.consolidated).not.toContain("�")
	})

	it("resolve o nome oficial de toda UG da base", () => {
		const desconhecidas = base.datasets.filter((d) => d.ugName.includes("FORA DA RELAÇÃO OFICIAL")).map((d) => d.ugCode)
		expect(desconhecidas).toEqual([])
	})

	it("identifica a competência", () => {
		expect(base.competence).toMatch(/^[A-ZÇ]+\/\d{4}/)
	})

	it("mantém o contexto de grupo dentro do orçamento", () => {
		for (const dataset of base.datasets) {
			expect(buildGroupContext(dataset, base.datasets).length).toBeLessThanOrEqual(MAX_GROUP_CONTEXT_CHARS)
		}
	})
})

it.skipIf(hasBase)("data_test ausente — teste de base real ignorado", () => {
	expect(hasBase).toBe(false)
})
