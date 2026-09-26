import { describe, expect, test } from "bun:test"
import {
	auditReportItem,
	buildAuditSample,
	buildResearchSeriesCsv,
	type ReportItem,
	type ReportResearch,
	type ReportSample,
	sha256Hex,
} from "./price-research-report.ts"

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
		expect(checks.map((c) => c.severity)).toEqual(["warning", "warning", "warning", "warning"])
		expect(checks.map((c) => c.basis).join(" | ")).toContain("§ 5º")
		expect(checks.map((c) => c.basis).join(" | ")).toContain("§ 4º")
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
