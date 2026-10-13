import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { AMPLO, CRITICA_SEM_IMPACTO, SO_ATENCAO } from "./__fixtures__/analyzer"
import { analyzeData } from "./analyzer"

// Caracterização do `analyzeData` inteiro: `analyzer.expected.json` foi gravado com a
// implementação anterior à quebra em sub-funções (2026-10-13). Diferença aqui é mudança
// de comportamento, não refatoração — regrave o JSON só se a mudança for de propósito.
// A comparação é pela serialização para conferir também a ORDEM das UGs, dos
// detalhes e do diagnóstico, que é a ordem da tela e da mensagem.

const expected = JSON.parse(readFileSync(new URL("./__fixtures__/analyzer.expected.json", import.meta.url), "utf8"))

const serialize = (value: unknown) => JSON.parse(JSON.stringify(value))

describe("analyzeData — caracterização", () => {
	it("reproduz a saída completa num conjunto que cobre todos os ramos", () => {
		expect(serialize(analyzeData(AMPLO))).toStrictEqual(expected.amplo)
	})

	it("síntese só com atenção, sem crítica", () => {
		expect(serialize(analyzeData(SO_ATENCAO))).toStrictEqual(expected.soAtencao)
	})

	it("crítica sem impacto financeiro cai na frase de nada significativo", () => {
		expect(serialize(analyzeData(CRITICA_SEM_IMPACTO))).toStrictEqual(expected.criticaSemImpacto)
	})

	it("planilha vazia", () => {
		expect(serialize(analyzeData([]))).toStrictEqual(expected.vazio)
	})
})
