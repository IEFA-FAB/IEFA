/**
 * Contrato do que volta do modelo e do documento montado a partir dele.
 *
 * Duas garantias, e as duas existem porque `structuredOutput` devolve
 * `result.data` sem validar: nenhuma seção some calada, e nenhum número do
 * documento vem do modelo.
 */

import { describe, expect, it } from "bun:test"
import { AccountGroup } from "../types"
import type { ReportDataset } from "./report"
import { buildAnalyticNoteMarkdown } from "./report-markdown"
import { normalizeAnalyticNote } from "./report-schema"

const FULL_RESPONSE = {
	sumarioExecutivo: "A competência fecha com concentração relevante em Bens Móveis Permanentes.",
	leituraUnidadesCriticas: "Duas unidades respondem pela maior parte da divergência.",
	destaquesDeAlerta: [
		{ titulo: "Concentração em BMP", unidade: "GAP-SP", analise: "Divergência acumulada.", acaoRecomendada: "Conciliar por Nota de Lançamento." },
		{ titulo: "Divergência nova em Consumo", unidade: null, analise: "Surge sobre base zerada.", acaoRecomendada: "Verificar o fechamento do almoxarifado." },
	],
	leituraTendencias: "O agravamento é mensal e não se confirma no semestral.",
	leituraGrupos: "Consumo responde pela menor parcela.",
	planoDeAcao: ["Conciliar as duas maiores divergências.", "Instituir conferência prévia ao fechamento."],
	conclusao: "Exposição moderada, com tendência de piora no curto prazo.",
}

const DATASET: ReportDataset = {
	competence: "2025-07",
	competenceLabel: "JUL/25",
	timeFilter: "MENSAL",
	scopeLabel: "todas as UGs",
	periodsLoaded: 2,
	ugCount: 2,
	recordCount: 6,
	totals: { siafi: 17_900, siloms: 14_000, absoluteDifference: 4100, netDifference: 3900 },
	previous: { period: "2025-06", label: "JUN/25", totals: { siafi: 16_000, siloms: 13_000, absoluteDifference: 3000, netDifference: 3000 } },
	preponderance: { siafi: 3, siloms: 1, equal: 2 },
	groups: [{ group: AccountGroup.BMP, siafi: 15_000, siloms: 11_500, difference: 3500, ugCount: 2 }],
	topOffenders: [
		{ ug: "GAP-SP", cod: "120200", group: AccountGroup.BMP, siafi: 10_000, siloms: 7000, difference: 3000, preponderance: "SIAFI", riskLevel: "Crítico" },
	],
	trends: [{ scope: "MENSAL", worsening: [], improving: [] }],
	interOm: [],
}

describe("normalizeAnalyticNote", () => {
	it("aceita a resposta completa", () => {
		const note = normalizeAnalyticNote(FULL_RESPONSE)
		expect(note.destaquesDeAlerta).toHaveLength(2)
		expect(note.planoDeAcao).toHaveLength(2)
		expect(note.conclusao).toContain("Exposição moderada")
	})

	// Modelo não omite campo opcional: manda `null`. Dentro de array o `null`
	// chega inteiro ao parse, e sem `.nullish()` o item inteiro seria descartado.
	it("trata `null` de campo opcional dentro de array como ausência, sem perder o item", () => {
		const note = normalizeAnalyticNote(FULL_RESPONSE)
		expect(note.destaquesDeAlerta[1].titulo).toBe("Divergência nova em Consumo")
		expect(note.destaquesDeAlerta[1].unidade).toBeUndefined()
	})

	it("descarta só o alerta sem título, não a lista inteira", () => {
		const note = normalizeAnalyticNote({
			...FULL_RESPONSE,
			destaquesDeAlerta: [{ titulo: "   ", analise: "x", acaoRecomendada: "y" }, ...FULL_RESPONSE.destaquesDeAlerta],
		})
		expect(note.destaquesDeAlerta).toHaveLength(2)
	})

	it("devolve seção ausente como string vazia, em vez de undefined", () => {
		const note = normalizeAnalyticNote({ destaquesDeAlerta: [], planoDeAcao: [] })
		expect(note.sumarioExecutivo).toBe("")
		expect(note.conclusao).toBe("")
		expect(note.planoDeAcao).toEqual([])
	})

	it("recusa o que não tem forma de objeto", () => {
		expect(() => normalizeAnalyticNote("não é um objeto")).toThrow()
		expect(() => normalizeAnalyticNote(null)).toThrow()
	})
})

describe("buildAnalyticNoteMarkdown", () => {
	const markdown = buildAnalyticNoteMarkdown(DATASET, normalizeAnalyticNote(FULL_RESPONSE))

	it("imprime o cabeçalho institucional, que não é do modelo", () => {
		expect(markdown).toContain("**PARA:** Diretor de Economia e Finanças da Aeronáutica")
		expect(markdown).toContain("SUCONT-4/DIREF")
		expect(markdown).toContain("JUL/25")
	})

	it("imprime os totais calculados, os dois separados", () => {
		expect(markdown).toContain("Divergência total (soma dos módulos)")
		expect(markdown).toContain("Diferença líquida (SIAFI − SILOMS)")
		// Formatação pt-BR com espaço não separável entre o símbolo e o número.
		expect(markdown).toMatch(/R\$\s4\.100,00/)
		expect(markdown).toMatch(/R\$\s3\.900,00/)
	})

	it("monta a tabela das maiores divergências a partir do dataset", () => {
		expect(markdown).toContain("| GAP-SP | 120200 | Bens Móveis Permanentes |")
		expect(markdown).toContain("SIAFI > SILOMS")
	})

	it("carrega a fundamentação normativa da fonte única", () => {
		expect(markdown).toContain("Fundamentação normativa:")
		expect(markdown).toContain("02.03.15")
	})

	it("declara a competência anterior ausente em vez de imprimir zeros", () => {
		const semAnterior = buildAnalyticNoteMarkdown({ ...DATASET, previous: null }, normalizeAnalyticNote(FULL_RESPONSE))
		expect(semAnterior).toContain("não consta na base carregada")
		expect(semAnterior).not.toContain("| Competência anterior (JUN/25) |")
	})

	it("omite a seção de transferências quando não há hipótese", () => {
		expect(markdown).not.toContain("3-A.")
	})

	it("imprime a seção de transferências com a ressalva quando há", () => {
		const comHipotese = buildAnalyticNoteMarkdown(
			{
				...DATASET,
				interOm: [
					{
						date: "2025-07",
						ugA: "GAP-RJ",
						codA: "120100",
						ugB: "GAP-SP",
						codB: "120200",
						group: AccountGroup.BMP,
						deltaA: -5_000_000,
						deltaB: 5_000_000,
						value: 5_000_000,
						residual: 0,
					},
				],
			},
			normalizeAnalyticNote(FULL_RESPONSE)
		)
		expect(comHipotese).toContain("3-A. Possíveis transferências entre OMs")
		expect(comHipotese).toContain("Hipótese para conferência, não constatação")
	})

	// Seção vazia impressa como título solto faz a nota parecer truncada sem dizer
	// que foi — a mesma classe de mentira dos estados vazios da tela.
	it("declara a seção que o modelo não escreveu", () => {
		const vazia = buildAnalyticNoteMarkdown(DATASET, normalizeAnalyticNote({ destaquesDeAlerta: [], planoDeAcao: [] }))
		expect(vazia).toContain("_O modelo não produziu texto para esta seção._")
		expect(vazia).toContain("_O modelo não produziu destaques para esta competência._")
		expect(vazia).toContain("_O modelo não produziu recomendações para esta competência._")
	})

	it("escapa pipe no nome da unidade para não quebrar a tabela", () => {
		const comPipe = buildAnalyticNoteMarkdown(
			{ ...DATASET, topOffenders: [{ ...DATASET.topOffenders[0], ug: "GAP|SP" }] },
			normalizeAnalyticNote(FULL_RESPONSE)
		)
		expect(comPipe).toContain("| GAP\\|SP | 120200 |")
	})

	// Escapar `|` sem antes duplicar a barra invertida deixa `A\` virar `A\\|`: uma
	// barra literal seguida de um separador de coluna DE VERDADE. Achado do CodeQL
	// (`js/incomplete-sanitization`) — o escape parcial reabre o buraco que fecha.
	it("duplica a barra invertida ANTES de escapar o pipe", () => {
		const comBarra = buildAnalyticNoteMarkdown(
			{ ...DATASET, topOffenders: [{ ...DATASET.topOffenders[0], ug: "GAP\\|SP" }] },
			normalizeAnalyticNote(FULL_RESPONSE)
		)
		expect(comBarra).toContain("| GAP\\\\\\|SP | 120200 |")
		// A célula continua sendo UMA célula: nenhuma linha da tabela ganhou coluna.
		const linha = comBarra.split("\n").find((l) => l.includes("120200")) ?? ""
		expect(linha.split(/(?<!\\)\|/).length - 1).toBe(9)
	})

	it("avisa que o texto é gerado por modelo", () => {
		expect(markdown).toContain("gerada com apoio de modelo de linguagem")
	})
})
