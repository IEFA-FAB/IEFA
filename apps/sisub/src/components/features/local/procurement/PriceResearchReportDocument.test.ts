import type { PriceResearchReport, ReportItem } from "@iefa/sisub-domain"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { PriceResearchReportDocument } from "./PriceResearchReportDocument"

const item: ReportItem = {
	order: 1,
	listItemId: "i1",
	catmat: 217092,
	description: "Vinagre",
	unit: "LT",
	maxQuantity: 100,
	unitPrice: 5.5,
	seriesFormat: 2,
	research: {
		researchItemId: "r1",
		researchId: "h1",
		catmatCodigo: 217092,
		createdAt: "2026-09-01T15:00:00.000Z",
		createdBy: "u1",
		createdByName: "Cap Fulano",
		method: "median",
		periodMonths: 12,
		measureUnit: "LT",
		totalRaw: 340,
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
			consultedAt: "2026-09-01T14:58:30.000Z",
			query: "tipo=codigoItemCatalogo&codigo=217092&tamanhoPagina=500",
			totalRecords: 8402,
			totalPages: 17,
			pagesFetched: 5,
			coverage: "window",
		},
		samples: [],
	},
}

const report = (over: Partial<PriceResearchReport> = {}): PriceResearchReport => ({
	list: {
		id: "l1",
		title: "Pregão 1/2027",
		status: "draft",
		unitName: "GAP-SJ",
		uasg: "120016",
		segmentName: null,
		validityMonths: 12,
		isBudgetConfidential: false,
	},
	emission: { id: "e1", sequence: 1, emittedAt: "2026-09-02T12:00:00.000Z", emittedByName: "Cap Fulano", sha256: "ab".repeat(32), verified: true },
	items: [item],
	csv: "",
	checks: [{ order: 1, checks: [{ severity: "blocking", message: "Item sem preço no anexo.", basis: "Lei 14.133/2021, art. 23" }] }],
	exceptions: [{ order: 1, description: "Vinagre", exceptions: [] }],
	ruleVersion: 2,
	seriesFormat: 2,
	auditSample: { curveA: [1], sampled: [] },
	emissions: [{ id: "e1", sequence: 1, emittedAt: "2026-09-02T12:00:00.000Z" }],
	...over,
})

const render = (layout?: "print" | "tabs") => renderToStaticMarkup(createElement(PriceResearchReportDocument, { report: report(), layout }))

describe("relatório de pesquisa de preços", () => {
	test("a impressão leva as nove seções corridas e as assinaturas", () => {
		const html = render()
		expect(html.match(/<h2>/g)).toHaveLength(9)
		expect(html).toContain("Aprovado (autoridade competente)")
		expect(html).not.toContain('role="tablist"')
	})

	test("na tela, uma aba por seção e só a seção aberta no documento", () => {
		const html = render("tabs")
		expect(html.match(/role="tab"/g)).toHaveLength(9)
		expect(html.match(/<h2>/g)).toHaveLength(1)
		expect(html).toContain("1. Objeto (art. 3º, I)")
		// pendência bloqueante: a aba de conformidade mostra a contagem, e o cabeçalho leva até ela
		expect(html).toContain("Abrir o checklist de conformidade")
	})

	test("fontes dizem os filtros da consulta e a janela de cada item", () => {
		const html = render()
		expect(html).toContain("tipo=codigoItemCatalogo")
		expect(html).toContain("01/09/2025 a 01/09/2026")
		expect(html).toContain("<td>1</td><td>01/09/2026</td>")
		// hora da consulta em Brasília e a leitura da fonte
		expect(html).toContain("01/09/2026 11:58")
		expect(html).toContain("janela completa")
		expect(html).toContain("conferir_na_fonte")
	})
})
