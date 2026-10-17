import { describe, expect, test } from "bun:test"
import {
	auditReportItem,
	auditReportItemV1,
	buildAuditSample,
	buildResearchSeriesCsv,
	emittedItemAudit,
	freezeItemAudit,
	justifiableFindingsOf,
	type ReportItem,
	type ReportResearch,
	type ReportSample,
	reportExceptionsOf,
	researchWindowOf,
	SERIES_FORMAT,
	seriesFormatOf,
	sha256Hex,
} from "./price-research-report.ts"
import { priceResearchQueryString, priceResearchQueryUrl, priceResearchSampleUrl } from "./price-research-source.ts"

const sample = (over: Partial<ReportSample> = {}): ReportSample => ({
	sampleType: "valid",
	idCompra: "1",
	idItemCompra: 1,
	codigoUasg: "120016",
	nomeUasg: "GAP-SJ",
	municipio: "São José dos Campos",
	estado: "SP",
	referenceDate: "2026-06-01",
	niFornecedor: "00.000.000/0001-00",
	nomeFornecedor: "Fornecedor",
	marca: null,
	quantidade: "10",
	siglaUnidadeFornecimento: "FR",
	capacidadeUnidadeFornecimento: "750",
	siglaUnidadeMedida: "ML",
	precoUnitario: "4.17",
	contentInUnit: "0.750000",
	convertedPrice: "5.560000",
	conversion: "FR 750 ML = 0,75 LT",
	conversionRecomputed: false,
	...over,
})

const research = (over: Partial<ReportResearch> = {}): ReportResearch => ({
	researchItemId: "r1",
	researchId: "h1",
	createdAt: "2026-09-01T12:00:00.000Z",
	createdBy: "u1",
	createdByName: "Cap Fulano",
	method: "median",
	periodMonths: 12,
	measureUnit: "LT",
	totalRaw: 10,
	afterDate: 8,
	afterPollution: 7,
	afterOutlier: 6,
	priceMin: 5,
	priceMax: 6,
	priceMean: 5.5,
	priceMedian: 5.5,
	stdDev: 0.3,
	cvPct: 5,
	uniqueSources: 4,
	referencePrice: 5.5,
	nonComplianceReasons: [],
	source: {
		consultedAt: "2026-09-01T11:58:30.000Z",
		query: "tipo=codigoItemCatalogo&codigo=217092&tamanhoPagina=500",
		totalRecords: 8402,
		totalPages: 17,
		pagesFetched: 5,
		coverage: "window",
	},
	samples: [sample(), sample({ idCompra: "2", sampleType: "outlier", precoUnitario: "40" })],
	...over,
})

const item = (order: number, over: Partial<ReportItem> = {}): ReportItem => ({
	order,
	listItemId: `i${order}`,
	catmat: 217092,
	description: "Vinagre",
	unit: "LT",
	maxQuantity: 100,
	unitPrice: 5.5,
	research: research(),
	...over,
})

describe("buildResearchSeriesCsv", () => {
	test("é determinística e começa com BOM; válidas antes das descartadas", () => {
		const a = buildResearchSeriesCsv([item(1)])
		const b = buildResearchSeriesCsv([item(1, { research: research({ samples: [...research().samples].reverse() }) })])
		expect(a).toBe(b)
		expect(a.startsWith("﻿item,catmat")).toBe(true)
		const lines = a.trim().split("\n")
		expect(lines).toHaveLength(3)
		expect(lines[1]).toContain(",valida,")
		expect(lines[2]).toContain(",descartada_iqr,")
		expect(lines[1]).toContain("FR 750 ML = 0,75 LT")
		expect(sha256Hex(a)).toBe(sha256Hex(b))
	})

	test("neutraliza fórmula de planilha e escapa aspas", () => {
		const csv = buildResearchSeriesCsv([item(1, { description: '=HYPERLINK("x")' })])
		expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
	})

	test("item sem pesquisa não gera linha", () => {
		expect(
			buildResearchSeriesCsv([item(1, { research: null })])
				.trim()
				.split("\n")
		).toHaveLength(1)
	})
})

describe("série no formato 2 (nota, resumo e amostras)", () => {
	const v2 = (order: number, over: Partial<ReportItem> = {}) => item(order, { seriesFormat: SERIES_FORMAT, ...over })
	const blocks = (csv: string) =>
		csv
			.replace(/^\uFEFF/, "")
			.trimEnd()
			.split("\n\n")
	// Uma linha da série em campos: os textos com vírgula saem entre aspas.
	const cells = (line: string) => {
		const out: string[] = []
		let cell = ""
		let quoted = false
		for (let i = 0; i < line.length; i++) {
			const c = line[i]
			if (quoted && c === '"' && line[i + 1] === '"') {
				cell += '"'
				i++
			} else if (c === '"') quoted = !quoted
			else if (c === "," && !quoted) {
				out.push(cell)
				cell = ""
			} else cell += c
		}
		out.push(cell)
		return out
	}
	const record = (header: string, line: string) => Object.fromEntries(cells(header).map((h, i) => [h, cells(line)[i]]))

	test("emissão sem formato gravado continua no formato 1: o hash dela não muda", () => {
		expect(seriesFormatOf([item(1)])).toBe(1)
		expect(seriesFormatOf([v2(1)])).toBe(2)
		expect(buildResearchSeriesCsv([item(1)]).startsWith("\uFEFFitem,catmat")).toBe(true)
	})

	test("a nota diz a fonte, os filtros da consulta, a janela e como repetir", () => {
		const [note] = blocks(buildResearchSeriesCsv([v2(1)]))
		expect(note).toContain("dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial")
		expect(note).toContain("tipo=codigoItemCatalogo e codigo=<CATMAT do item>")
		expect(note).toContain("nenhum outro filtro")
		expect(note).toContain("dataResultado=true")
		expect(note).toContain("Janela,")
		expect(note).toContain("Como repetir")
		expect(note).toContain("ordem decrescente de data do resultado")
		expect(note).toContain("SHA-256")
	})

	test("o resumo leva a consulta, a janela, o funil, o método e o preço de cada item", () => {
		const [, summary] = blocks(buildResearchSeriesCsv([v2(1), v2(2, { research: null })]))
		const [title, header, first, second] = summary.split("\n")
		expect(title).toBe("Resumo por item")
		const row = record(header, first)
		expect(row).toMatchObject({
			item: "1",
			catmat: "217092",
			pesquisa_data: "2026-09-01",
			janela_meses: "12",
			janela_inicio: "2025-09-01",
			janela_fim: "2026-09-01",
			consulta_data_hora: "2026-09-01T08:58:30-03:00",
			consulta_url: priceResearchQueryUrl(priceResearchQueryString(217092)),
			fonte_total_registros: "8402",
			fonte_total_paginas: "17",
			paginas_lidas: "5",
			cobertura: "janela_completa",
			total_coletado: "10",
			total_na_janela: "8",
			total_valido: "6",
			metodo: "mediana",
			preco_estimado: "5.5",
			preco_no_anexo: "5.5",
			selecao_manual: "nao",
		})
		// item sem pesquisa aparece no resumo, com todas as colunas, para o anexo inteiro estar na série
		expect(record(header, second)).toMatchObject({ item: "2", pesquisa_item_id: "", preco_no_anexo: "5.5", nao_conformidades: "sem pesquisa" })
		expect(cells(second)).toHaveLength(cells(header).length)
	})

	test("cada amostra leva a descrição na compra e a URL que a devolve da fonte", () => {
		const csv = buildResearchSeriesCsv([v2(1, { research: research({ samples: [sample({ descricaoItem: "VINAGRE DE ÁLCOOL 750 ML" })] }) })])
		const [, , samples] = blocks(csv)
		const [title, header, first] = samples.split("\n")
		expect(title).toBe("Amostras")
		const row = record(header, first)
		expect(row).toMatchObject({
			classificacao: "valida",
			id_compra: "1",
			descricao_na_compra: "VINAGRE DE ÁLCOOL 750 ML",
			conversao_refeita: "nao",
			conferir_na_fonte: priceResearchSampleUrl(217092, "1"),
		})
	})

	test("a consulta repetida é a registrada, não a do CATMAT do item editado depois", () => {
		const csv = buildResearchSeriesCsv([v2(1, { catmat: 111, research: research({ catmatCodigo: 217092 }) })])
		expect(csv).toContain(priceResearchQueryUrl(priceResearchQueryString(217092)))
		expect(csv).not.toContain(priceResearchQueryUrl(priceResearchQueryString(111)))
	})

	test("série 2 tem bytes congelados: mudar texto, rótulo ou URL quebraria o hash das emissões feitas", () => {
		const frozen = v2(1, {
			research: research({
				justifications: { lowSample: "Item regional, pouco comprado no período." },
				samples: [sample({ descricaoItem: "VINAGRE DE ÁLCOOL 750 ML" }), sample({ idCompra: "2", sampleType: "outlier", precoUnitario: "40" })],
			}),
		})
		expect(sha256Hex(buildResearchSeriesCsv([frozen, v2(2, { research: null })]))).toBe("4b758d33de82ae41dd60bdd84cb19897a2d92e53da09fcb35acd8760b6e2475b")
	})

	test("a ordem das justificativas não depende da ordem das chaves (o jsonb reordena)", () => {
		const a = v2(1, { research: research({ justifications: { lowSample: "Item regional, pouco comprado.", method: "Mediana por dispersão alta." } }) })
		const b = v2(1, { research: research({ justifications: { method: "Mediana por dispersão alta.", lowSample: "Item regional, pouco comprado." } }) })
		expect(buildResearchSeriesCsv([a])).toBe(buildResearchSeriesCsv([b]))
	})

	test("pesquisa anterior ao registro da consulta usa a consulta reconstruída do caminho que a gravou", () => {
		const legacy = v2(1, {
			research: research({ source: null, legacyQuery: "tipo=codigoItemCatalogo&codigo=217092&tamanhoPagina=500&dataResultado=true&estado=SP" }),
		})
		const [, summary] = blocks(buildResearchSeriesCsv([legacy]))
		const [, header, first] = summary.split("\n")
		expect(record(header, first)).toMatchObject({
			consulta_url: priceResearchQueryUrl("tipo=codigoItemCatalogo&codigo=217092&tamanhoPagina=500&dataResultado=true&estado=SP"),
			consulta_data_hora: "",
			cobertura: "",
			janela_fim: "2026-09-01",
		})
	})

	test("texto da fonte com TAB/CR não vira fórmula nem quebra a linha da planilha", () => {
		const csv = buildResearchSeriesCsv([
			v2(1, { research: research({ samples: [sample({ descricaoItem: '\t=HYPERLINK("x")' }), sample({ idCompra: "2", descricaoItem: "linha\rquebrada" })] }) }),
		])
		expect(csv).toContain(`"'\t=HYPERLINK(""x"")"`)
		expect(csv).toContain(`"linha\rquebrada"`)
	})

	test("é determinística", () => {
		const a = buildResearchSeriesCsv([v2(1)])
		const b = buildResearchSeriesCsv([v2(1, { research: research({ samples: [...research().samples].reverse() }) })])
		expect(sha256Hex(a)).toBe(sha256Hex(b))
	})

	test("janela de pesquisa feita à noite em Brasília usa o dia de Brasília", () => {
		expect(researchWindowOf({ createdAt: "2026-09-02T01:30:00.000Z", periodMonths: 12 })).toEqual({
			researchDate: "2026-09-01",
			windowStart: "2025-09-01",
			windowEnd: "2026-09-01",
		})
		expect(researchWindowOf({ createdAt: "2026-09-02T01:30:00.000Z", periodMonths: null }).windowStart).toBeNull()
	})

	test("a janela conta do dia da consulta, não do dia em que a pesquisa foi gravada", () => {
		const source = {
			consultedAt: "2026-09-01T02:50:00.000Z",
			query: "tipo=codigoItemCatalogo&codigo=1&tamanhoPagina=500",
			totalRecords: 10,
			totalPages: 1,
			pagesFetched: 1,
			coverage: "complete" as const,
		}
		// consultou às 23h50 do dia 31/08 e gravou às 00h05 do dia 01/09 (Brasília)
		expect(researchWindowOf({ createdAt: "2026-09-01T03:05:00.000Z", periodMonths: 12, source })).toEqual({
			researchDate: "2026-09-01",
			windowStart: "2025-08-31",
			windowEnd: "2026-08-31",
		})
	})
})

describe("auditReportItem", () => {
	const at = "2026-09-26T12:00:00.000Z"

	test("item conforme não tem verificação pendente", () => {
		expect(auditReportItem(item(1), at)).toEqual([])
	})

	test("sem pesquisa bloqueia", () => {
		expect(auditReportItem(item(1, { research: null }), at)[0]).toMatchObject({ severity: "blocking", basis: "IN SEGES/ME 65/2021, art. 3º" })
	})

	test("preço do anexo diferente da pesquisa bloqueia", () => {
		expect(auditReportItem(item(1, { unitPrice: 7 }), at).map((c) => c.severity)).toEqual(["blocking"])
	})

	test("pesquisa de outro CATMAT bloqueia", () => {
		const checks = auditReportItem(item(1, { catmat: 111, research: research({ catmatCodigo: 217092 }) }), at)
		expect(checks.some((c) => c.severity === "blocking" && c.message.includes("CATMAT 217092"))).toBe(true)
		expect(auditReportItem(item(1, { research: research({ catmatCodigo: 217092 }) }), at)).toEqual([])
	})

	test("pesquisa sem a consulta registrada é aviso, só na regra vigente", () => {
		const old = item(1, { research: research({ source: null }) })
		expect(auditReportItem(old, at).map((c) => [c.severity, c.message.slice(0, 40)])).toEqual([["warning", "Pesquisa anterior ao registro da consult"]])
		expect(auditReportItemV1(old, at)).toEqual([])
	})

	test("preço acima da mediana bloqueia (art. 6º, § 6º)", () => {
		const checks = auditReportItem(item(1, { unitPrice: 6, research: research({ referencePrice: 6, priceMedian: 5.5 }) }), at)
		expect(checks.some((c) => c.basis.includes("§ 6º"))).toBe(true)
	})

	test("poucas fontes, CV alto, amostra antiga e pesquisa velha são avisos", () => {
		const checks = auditReportItem(
			item(1, {
				research: research({
					afterOutlier: 2,
					uniqueSources: 2,
					cvPct: 40,
					createdAt: "2026-01-01T00:00:00.000Z",
					samples: [sample({ referenceDate: "2025-01-01" })],
				}),
			}),
			at
		)
		expect(checks.map((c) => c.severity)).toEqual(["warning", "warning", "warning", "warning", "warning"])
		expect(checks.map((c) => c.basis).join(" | ")).toContain("§ 5º")
		expect(checks.map((c) => c.basis).join(" | ")).toContain("§ 4º")
		// 3 UASGs é critério da unidade, não da IN.
		expect(checks.find((c) => c.message.startsWith("Menos de 3 UASGs"))?.basis).toContain("Critério da unidade")
	})

	test("justificativa da amostra reduzida tira o aviso do checklist e o leva às excepcionalidades", () => {
		const justified = research({
			afterOutlier: 2,
			uniqueSources: 2,
			justifications: { lowSample: "Item regional: só dois órgãos compraram no último ano." },
		})
		expect(auditReportItem(item(1, { research: justified }), at)).toEqual([])
		expect(justifiableFindingsOf(justified).map((f) => [f.code, f.justified])).toEqual([
			["low_sample", true],
			["few_sources", true],
		])
	})

	test("todo o histórico, amostra sem data e seleção manual viram aviso com a base", () => {
		const checks = auditReportItem(
			item(1, { research: research({ periodMonths: null, samples: [sample({ referenceDate: null })], manualSelection: true }) }),
			at
		)
		expect(checks.map((c) => c.basis)).toEqual([
			"IN SEGES/ME 65/2021, art. 5º, I e II, e § 3º",
			"IN SEGES/ME 65/2021, art. 5º, II, e § 3º: sem data, não há como mostrar que o preço é de até 1 ano",
			"IN SEGES/ME 65/2021, art. 6º, § 3º, e art. 3º, VI",
		])
	})

	test("seleção manual sai do fato gravado, não do texto do motivo", () => {
		const reasonOnly = research({
			nonComplianceReasons: [
				"Amostras escolhidas à mão (seleção ou filtro), sem o descarte automático por IQR (IN SEGES/ME 65/2021, art. 6º, § 3º, e art. 3º, VI)",
			],
		})
		expect(justifiableFindingsOf(reasonOnly)).toEqual([])
		expect(justifiableFindingsOf(research({ manualSelection: true })).map((f) => f.code)).toEqual(["manual_exclusion"])
	})
})

describe("excepcionalidades (seção 7)", () => {
	test("cada achado leva a própria base; 3 UASGs é critério da unidade", () => {
		const [exception] = reportExceptionsOf(item(1, { research: research({ afterOutlier: 2, uniqueSources: 1 }) }))
		expect(exception.justification).toBe("lowSample")
		expect(exception.text).toBeNull()
		expect(exception.findings.map((f) => [f.code, f.basis])).toEqual([
			["low_sample", "IN SEGES/ME 65/2021, art. 6º, caput e § 5º"],
			["few_sources", "Critério da unidade; a IN 65/2021 não fixa número de órgãos"],
		])
	})

	test("a justificativa gravada sai no texto", () => {
		const text = "Item regional: só dois órgãos compraram no último ano."
		const [exception] = reportExceptionsOf(item(1, { research: research({ afterOutlier: 2, justifications: { lowSample: text } }) }))
		expect(exception.text).toBe(text)
	})
})

describe("emissão registrada", () => {
	const at = "2026-09-26T12:00:00.000Z"

	test("emissão nova mostra o checklist congelado, mesmo que a regra mude depois", () => {
		const frozen = { checks: [{ severity: "warning" as const, message: "congelado", basis: "regra da emissão" }], exceptions: [] }
		const emitted = item(1, { research: research({ afterOutlier: 2 }), audit: frozen })
		expect(emittedItemAudit(emitted, at)).toBe(frozen)
	})

	test("freezeItemAudit congela a regra vigente na data da emissão", () => {
		const it = item(1, { research: research({ afterOutlier: 2 }) })
		const audit = freezeItemAudit(it, at)
		expect(audit.checks).toEqual(auditReportItem(it, at))
		expect(audit.exceptions).toEqual(reportExceptionsOf(it))
	})

	test("congelar não muda a série nem o hash", () => {
		const it = item(1)
		expect(buildResearchSeriesCsv([{ ...it, audit: freezeItemAudit(it, at) }])).toBe(buildResearchSeriesCsv([it]))
	})

	test("emissão antiga (sem checklist congelado) usa a regra da época: nada de avisos novos", () => {
		// Pesquisa antiga com amostra sem data e sem janela: a regra 1 não as sinalizava.
		const old = item(1, { research: research({ afterOutlier: 2, uniqueSources: 2, periodMonths: null, samples: [sample({ referenceDate: null })] }) })
		const audit = emittedItemAudit(old, at)
		expect(audit.checks).toEqual(auditReportItemV1(old, at))
		expect(audit.checks.map((c) => c.basis)).toEqual(["IN SEGES/ME 65/2021, art. 6º, § 5º"])
		expect(audit.checks[0].message).toContain("Menos de 3 preços válidos ou de 3 fontes (2 preços, 2 UASGs)")
		expect(audit.exceptions).toEqual([
			{
				justification: "lowSample",
				findings: [{ code: "low_sample", message: "Menos de 3 preços válidos ou de 3 fontes", basis: "IN SEGES/ME 65/2021, art. 6º, § 5º" }],
				text: null,
			},
		])
	})
})

describe("buildAuditSample", () => {
	const items = Array.from({ length: 30 }, (_, i) => item(i + 1, { unitPrice: i === 0 ? 1000 : 1, maxQuantity: 10 }))

	test("a curva A pega os itens que somam 80% do valor", () => {
		expect(buildAuditSample(items, "a".repeat(64)).curveA).toEqual([1])
	})

	test("amostra dos demais: 10% com mínimo de 5, reproduzível pela mesma semente", () => {
		const first = buildAuditSample(items, "0123456789abcdef".repeat(4))
		const again = buildAuditSample(items, "0123456789abcdef".repeat(4))
		const other = buildAuditSample(items, "fedcba9876543210".repeat(4))
		expect(first.sampled).toHaveLength(5)
		expect(first.sampled).toEqual(again.sampled)
		expect(first.sampled).not.toContain(1)
		expect(other.sampled).not.toEqual(first.sampled)
	})
})
