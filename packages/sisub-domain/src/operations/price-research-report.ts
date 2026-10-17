/**
 * Relatório de pesquisa de preços do anexo quantitativo (IN SEGES/ME 65/2021, art. 3º), como
 * EMISSÃO registrada (change `sisub-procurement-planning-flows`, D7).
 *
 * O anexo e as pesquisas mudam depois (preço repesquisado, descrição editada, fornecedor completado
 * no catálogo), então o documento não pode ser regenerado do estado de "agora". Cada emissão CONGELA
 * em `procurement.price_research_emission.items` tudo o que o relatório usa (itens na ordem do TR,
 * preço, pesquisa e amostras, com a conversão) e grava o SHA-256 da série. Reabrir a emissão
 * regenera a série do congelado e confere o hash: "verificado" passa a significar que nada no
 * registro foi alterado, não que o anexo continua igual.
 *
 * O que é puro (CSV, checklist, amostragem) fica exportado e testado; o que lê o banco monta o
 * dossiê a partir do anexo e das pesquisas.
 */

// Namespace, não named import: o barrel chega ao bundle do cliente, e no dev o Vite resolve
// `node:crypto` para um stub que lança ao ler um export (ver price-research.ts).
import * as nodeCrypto from "node:crypto"
import { priceResearchEmissionInProcurement, type SisubDb } from "@iefa/database/drizzle/sisub"
import { desc, eq, sql } from "drizzle-orm"
import { requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { addCivilMonths, toBrasiliaCivilDate } from "../utils/civil-date.ts"
import { runQuery } from "../utils/index.ts"
import {
	evaluateResearchCompliance,
	RESEARCH_JUSTIFICATION_LABELS,
	type ResearchFinding,
	type ResearchJustificationKey,
	type ResearchJustifications,
} from "./price-research-compliance.ts"
import {
	formatConsultedAt,
	PRICE_RESEARCH_MAX_PAGES,
	PRICE_RESEARCH_PAGE_SIZE,
	PRICE_RESEARCH_SOURCE_DOCS_URL,
	PRICE_RESEARCH_SOURCE_URL,
	type PriceResearchSourceConsultation,
	priceResearchQueryUrl,
	priceResearchSampleUrl,
	SOURCE_COVERAGES,
	type SourceCoverage,
} from "./price-research-source.ts"
import { convertSamplePrice, isSamePrice, PRICE_MATCH_ABSOLUTE, PRICE_MATCH_RELATIVE } from "./price-units.ts"
import { PRICE_RESEARCH_VALIDITY_DAYS, resolveQuantityEstimateMaxQuantities } from "./quantity-estimate.ts"

/** Variação acima da qual o relatório pede análise crítica (art. 6º, § 4º). Limiar interno, declarado no documento. */
export const HIGH_CV_PERCENT = 25
/** Janela de 1 ano (inciso II do art. 5º), aplicada por prudência à fonte oficial. */
export const SAMPLE_MAX_AGE_DAYS = 365
/** Fração da curva A: os itens que somam este percentual do valor são conferidos por inteiro. */
export const CURVE_A_SHARE = 0.8
/** Amostra dos demais itens: 10%, com mínimo de 5. */
export const SAMPLE_SHARE = 0.1
export const SAMPLE_MIN = 5

/** Data da pesquisa (civil, em Brasília) e início da janela de recência aplicada nela. */
export function researchWindowOf(r: Pick<ReportResearch, "createdAt" | "periodMonths">): { researchDate: string; windowStart: string | null } {
	const researchDate = toBrasiliaCivilDate(r.createdAt) ?? r.createdAt.slice(0, 10)
	return { researchDate, windowStart: r.periodMonths ? addCivilMonths(researchDate, -r.periodMonths) : null }
}

export type SampleClass = "valid" | "outlier" | "pollution"

export interface ReportSample {
	sampleType: SampleClass
	idCompra: string
	idItemCompra: number | null
	codigoUasg: string | null
	nomeUasg: string | null
	municipio: string | null
	estado: string | null
	referenceDate: string | null
	niFornecedor: string | null
	nomeFornecedor: string | null
	marca: string | null
	quantidade: string | null
	siglaUnidadeFornecimento: string | null
	capacidadeUnidadeFornecimento: string | null
	siglaUnidadeMedida: string | null
	precoUnitario: string | null
	contentInUnit: string | null
	convertedPrice: string | null
	conversion: string | null
	/** Descrição do item na compra de origem. Ausente nas emissões anteriores à série 2. */
	descricaoItem?: string | null
	/** true quando a conversão foi refeita agora (pesquisa gravada antes de a conversão ser gravada). */
	conversionRecomputed: boolean
}

export interface ReportResearch {
	researchItemId: string
	researchId: string
	/** CATMAT consultado pela pesquisa. Ausente nas emissões anteriores à série 2. */
	catmatCodigo?: number | null
	createdAt: string
	createdBy: string | null
	createdByName: string | null
	method: string | null
	periodMonths: number | null
	measureUnit: string | null
	totalRaw: number
	afterDate: number
	afterPollution: number
	afterOutlier: number
	priceMin: number | null
	priceMax: number | null
	priceMean: number | null
	priceMedian: number | null
	stdDev: number | null
	cvPct: number | null
	uniqueSources: number | null
	referencePrice: number | null
	nonComplianceReasons: string[]
	/**
	 * Justificativas gravadas na pesquisa (colunas `justification_*`, migration 20260926211000).
	 * Opcional: emissões anteriores congelaram a pesquisa sem elas.
	 */
	justifications?: ResearchJustifications
	/**
	 * Amostras escolhidas à mão, derivado e gravado no servidor (`manual_selection`). Opcional:
	 * emissões anteriores congelaram a pesquisa sem ele.
	 */
	manualSelection?: boolean
	/**
	 * A consulta à fonte: hora, total na fonte, páginas lidas e cobertura (colunas `source_*`,
	 * migration 20261016150000). Null nas pesquisas anteriores, que não a registraram.
	 */
	source?: PriceResearchSourceConsultation | null
	samples: ReportSample[]
}

/** Uma excepcionalidade (seção 7): as não conformidades que a mesma justificativa resolve. */
export interface ReportException {
	justification: ResearchJustificationKey
	/** Cada achado com a própria base: "3 UASGs" é critério da unidade, não da IN. */
	findings: Array<{ code: string; message: string; basis: string }>
	/** Justificativa gravada na pesquisa; null = em branco, para preencher antes de juntar aos autos. */
	text: string | null
}

/**
 * Checklist e excepcionalidades CONGELADOS na emissão: o documento emitido não muda quando a
 * regra muda depois. Ausente nas emissões anteriores a 20260926211000, que se leem pela regra da
 * época (`auditReportItemV1`).
 */
export interface FrozenItemAudit {
	checks: ReportCheck[]
	exceptions: ReportException[]
}

export interface ReportItem {
	order: number
	listItemId: string
	catmat: number | null
	description: string
	unit: string
	maxQuantity: number | null
	/** Preço do item no momento da emissão. */
	unitPrice: number | null
	research: ReportResearch | null
	/** Presente nas emissões que congelaram o checklist (regra 2). */
	audit?: FrozenItemAudit
	/**
	 * Formato da série em que a emissão foi feita (`SERIES_FORMAT`). Ausente = formato 1: o hash
	 * de cada emissão é sobre os bytes do formato dela, então o formato antigo continua sendo gerado.
	 */
	seriesFormat?: number
}

export type CheckSeverity = "blocking" | "warning"
export interface ReportCheck {
	severity: CheckSeverity
	message: string
	basis: string
}

// ─── Puro: série de preços em CSV ───────────────────────────────────────────────

const CSV_HEADER = [
	"item",
	"catmat",
	"descricao_item",
	"unidade_pesquisa",
	"pesquisa_item_id",
	"pesquisa_data",
	"classificacao",
	"id_compra",
	"id_item_compra",
	"uasg",
	"nome_uasg",
	"municipio",
	"uf",
	"data_referencia",
	"fornecedor_ni",
	"fornecedor_nome",
	"marca",
	"quantidade",
	"unidade_fornecimento",
	"capacidade",
	"unidade_medida",
	"preco_original",
	"conteudo_na_unidade",
	"preco_convertido",
	"conversao",
]

const CLASS_LABEL: Record<SampleClass, string> = { valid: "valida", outlier: "descartada_iqr", pollution: "inconsistente" }
const CLASS_ORDER: Record<SampleClass, number> = { valid: 0, outlier: 1, pollution: 2 }

function csvField(value: string | number | null | undefined): string {
	if (value == null) return ""
	const text = String(value)
	// Neutraliza fórmula (planilha) e escapa aspas; o mesmo texto sai igual em qualquer máquina.
	const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
	return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Formato da série das emissões novas. O 1 (sem nota nem resumo) só se regenera para emissões antigas. */
export const SERIES_FORMAT = 2

/** Formato da série de uma emissão: o gravado nos itens, ou 1 nas emissões anteriores. */
export function seriesFormatOf(items: readonly ReportItem[]): number {
	return items.find((i) => i.seriesFormat != null)?.seriesFormat ?? 1
}

const sortedSamples = (r: ReportResearch) =>
	[...r.samples].sort(
		(a, b) =>
			CLASS_ORDER[a.sampleType] - CLASS_ORDER[b.sampleType] ||
			a.idCompra.localeCompare(b.idCompra) ||
			(a.idItemCompra ?? 0) - (b.idItemCompra ?? 0) ||
			(a.precoUnitario ?? "").localeCompare(b.precoUnitario ?? "")
	)

/**
 * Série de preços coletados (art. 3º, IV), determinística: itens na ordem do anexo, amostras por
 * classificação e depois pelo identificador da compra. Começa com BOM, para a planilha ler os
 * acentos — e o hash é calculado sobre estes mesmos bytes. Sai no formato em que a emissão foi
 * feita: trocar o formato de uma emissão antiga quebraria a integridade dela.
 */
export function buildResearchSeriesCsv(items: readonly ReportItem[]): string {
	return seriesFormatOf(items) >= 2 ? buildSeriesCsvV2(items) : buildSeriesCsvV1(items)
}

function buildSeriesCsvV1(items: readonly ReportItem[]): string {
	const lines = [CSV_HEADER.join(",")]
	for (const item of items) {
		if (!item.research) continue
		const samples = sortedSamples(item.research)
		for (const s of samples) {
			lines.push(
				[
					item.order,
					item.catmat,
					item.description,
					item.research.measureUnit,
					item.research.researchItemId,
					item.research.createdAt.slice(0, 10),
					CLASS_LABEL[s.sampleType],
					s.idCompra,
					s.idItemCompra,
					s.codigoUasg,
					s.nomeUasg,
					s.municipio,
					s.estado,
					s.referenceDate,
					s.niFornecedor,
					s.nomeFornecedor,
					s.marca,
					s.quantidade,
					s.siglaUnidadeFornecimento,
					s.capacidadeUnidadeFornecimento,
					s.siglaUnidadeMedida,
					s.precoUnitario,
					s.contentInUnit,
					s.convertedPrice,
					s.conversion,
				]
					.map(csvField)
					.join(",")
			)
		}
	}
	return `﻿${lines.join("\n")}\n`
}

const SUMMARY_HEADER = [
	"item",
	"catmat",
	"descricao_item",
	"unidade_pesquisa",
	"pesquisa_item_id",
	"pesquisa_data",
	"pesquisa_agente",
	"janela_meses",
	"janela_inicio",
	"janela_fim",
	"consulta_data_hora_brasilia",
	"consulta_url",
	"fonte_total_registros",
	"fonte_total_paginas",
	"paginas_lidas",
	"cobertura",
	"total_coletado",
	"total_na_janela",
	"total_comparavel",
	"total_valido",
	"uasgs_distintas",
	"preco_minimo",
	"preco_maximo",
	"preco_medio",
	"preco_mediano",
	"desvio_padrao",
	"cv_pct",
	"metodo",
	"preco_estimado",
	"preco_no_anexo",
	"quantidade_maxima",
	"selecao_manual",
	"nao_conformidades",
	"justificativas",
]

const SAMPLE_HEADER_V2 = [
	"item",
	"catmat",
	"descricao_item",
	"unidade_pesquisa",
	"classificacao",
	"id_compra",
	"id_item_compra",
	"uasg",
	"nome_uasg",
	"municipio",
	"uf",
	"data_referencia",
	"fornecedor_ni",
	"fornecedor_nome",
	"marca",
	"descricao_na_compra",
	"quantidade",
	"unidade_fornecimento",
	"capacidade",
	"unidade_medida",
	"preco_original",
	"conteudo_na_unidade",
	"preco_convertido",
	"conversao",
	"conversao_refeita",
	"conferir_na_fonte",
]

const COVERAGE_CSV: Record<SourceCoverage, string> = { window: "janela_completa", complete: "todas_as_paginas", truncated: "parcial" }

const METHOD_LABEL: Record<string, string> = { median: "mediana", mean: "media", lowest: "menor_preco" }

/**
 * Nota da série 2: a consulta feita, a janela, a classificação e como repetir. Texto fixo: o que
 * varia por item (CATMAT, data, janela, URL) está nas colunas do resumo.
 */
const SERIES_NOTE: ReadonlyArray<[string, string]> = [
	[
		"Série de preços coletados",
		"Pesquisa de preços do anexo quantitativo (IN SEGES/ME 65/2021, art. 3º, IV). Três blocos: esta nota, o resumo por item e as amostras.",
	],
	[
		"Fonte",
		`Sistema oficial de preços do Governo Federal (IN SEGES/ME 65/2021, art. 5º, I): API de Dados Abertos do Compras.gov.br, módulo Pesquisa de Preços, consulta de material (${PRICE_RESEARCH_SOURCE_URL}). Documentação: ${PRICE_RESEARCH_SOURCE_DOCS_URL}.`,
	],
	[
		"Filtros da consulta",
		`tipo=codigoItemCatalogo e codigo=<CATMAT do item>, páginas de ${PRICE_RESEARCH_PAGE_SIZE} registros. Nenhum outro filtro: todo o país, sem recorte de UASG, órgão, estado, município, esfera, poder ou data. A URL da página 1 de cada item está em consulta_url.`,
	],
	[
		"Coleta e hora",
		`A fonte devolve os registros em ordem decrescente de data do resultado. Com janela, a coleta lê as páginas até a primeira que passa do início da janela e confere a última página (cobertura = janela_completa: a janela inteira foi lida); sem janela, lê todas (todas_as_paginas), até ${PRICE_RESEARCH_MAX_PAGES} páginas. cobertura = parcial é amostra cortada no teto, que não sustenta preço. A API não informa a hora da consulta: consulta_data_hora_brasilia é a hora em que o servidor do sisub recebeu a página 1. fonte_total_registros e fonte_total_paginas são os totais que a fonte informou naquela hora.`,
	],
	[
		"Janela de 1 ano",
		"Aplicada sobre o resultado da consulta, não nela: entram os preços com data do resultado (ou da compra, quando não há resultado) de janela_inicio a janela_fim (a data da pesquisa), art. 5º, II. Preço sem data fica fora do cálculo, salvo quando o agente o incluiu (aparece em nao_conformidades).",
	],
	[
		"Funil",
		"total_coletado = preços lidos nas páginas coletadas; total_na_janela = dentro da janela; total_comparavel = na janela, menos as inconsistentes; total_valido = os que entraram no cálculo. Os preços fora da janela não foram gravados e não estão nas amostras. Com selecao_manual = sim, só as amostras escolhidas pelo agente foram gravadas, e o critério da escolha está em justificativas (art. 6º, § 3º).",
	],
	[
		"Classificação",
		"valida = entrou no cálculo; descartada_iqr = excessivamente elevada ou inexequível, fora do intervalo Q1 − 1,5 × IIQ a Q3 + 1,5 × IIQ, aplicado com 4 ou mais preços (art. 6º, § 3º); inconsistente = embalagem que não se mede na unidade do item.",
	],
	[
		"Como repetir",
		"Abra consulta_url no navegador (ou monte a mesma chamada na documentação), avance pagina=2, 3… até a primeira página com data do resultado anterior a janela_inicio e descarte esses preços mais antigos. Para conferir um preço, abra conferir_na_fonte da amostra: a fonte devolve só a compra dela. A fonte é viva: compras homologadas depois da pesquisa aparecem na consulta de hoje e não nesta série.",
	],
	["Integridade", "O SHA-256 deste arquivo, byte a byte, está impresso no relatório da emissão. Abrir e salvar na planilha muda o arquivo e o hash."],
]

function summaryRow(item: ReportItem): Array<string | number | null> {
	const r = item.research
	if (!r) return [item.order, item.catmat, item.description, item.unit, "sem pesquisa"]
	const { researchDate, windowStart } = researchWindowOf(r)
	const catmat = r.catmatCodigo ?? item.catmat
	const justifications = Object.entries(r.justifications ?? {})
		.filter(([, text]) => text?.trim())
		.map(([key, text]) => `${RESEARCH_JUSTIFICATION_LABELS[key as ResearchJustificationKey] ?? key}: ${text?.trim()}`)
	return [
		item.order,
		catmat,
		item.description,
		r.measureUnit ?? item.unit,
		r.researchItemId,
		researchDate,
		r.createdByName,
		r.periodMonths,
		windowStart,
		researchDate,
		r.source ? formatConsultedAt(r.source.consultedAt) : "nao registrada",
		catmat != null ? priceResearchQueryUrl(catmat) : null,
		r.source?.totalRecords ?? null,
		r.source?.totalPages ?? null,
		r.source?.pagesFetched ?? null,
		r.source ? COVERAGE_CSV[r.source.coverage] : null,
		r.totalRaw,
		r.afterDate,
		r.afterPollution,
		r.afterOutlier,
		r.uniqueSources,
		r.priceMin,
		r.priceMax,
		r.priceMean,
		r.priceMedian,
		r.stdDev,
		r.cvPct,
		r.method ? (METHOD_LABEL[r.method] ?? r.method) : null,
		r.referencePrice,
		item.unitPrice,
		item.maxQuantity,
		r.manualSelection ? "sim" : "nao",
		r.nonComplianceReasons.join("; "),
		justifications.join(" | "),
	]
}

/**
 * Série 2: nota (fonte, filtros, janela, como repetir), resumo por item (pesquisa, janela, URL da
 * consulta, funil, estatística, método, preço e justificativas) e as amostras, cada uma com a URL
 * que a devolve da fonte. Três blocos separados por linha em branco; a planilha abre direto.
 */
function buildSeriesCsvV2(items: readonly ReportItem[]): string {
	const row = (values: ReadonlyArray<string | number | null | undefined>) => values.map(csvField).join(",")
	const lines = SERIES_NOTE.map(([label, text]) => row([label, text]))
	lines.push("", row(["Resumo por item"]), row(SUMMARY_HEADER), ...items.map((i) => row(summaryRow(i))))
	lines.push("", row(["Amostras"]), row(SAMPLE_HEADER_V2))
	for (const item of items) {
		const r = item.research
		if (!r) continue
		const catmat = r.catmatCodigo ?? item.catmat
		for (const s of sortedSamples(r)) {
			lines.push(
				row([
					item.order,
					catmat,
					item.description,
					r.measureUnit,
					CLASS_LABEL[s.sampleType],
					s.idCompra,
					s.idItemCompra,
					s.codigoUasg,
					s.nomeUasg,
					s.municipio,
					s.estado,
					s.referenceDate,
					s.niFornecedor,
					s.nomeFornecedor,
					s.marca,
					s.descricaoItem,
					s.quantidade,
					s.siglaUnidadeFornecimento,
					s.capacidadeUnidadeFornecimento,
					s.siglaUnidadeMedida,
					s.precoUnitario,
					s.contentInUnit,
					s.convertedPrice,
					s.conversion,
					s.conversionRecomputed ? "sim" : "nao",
					catmat != null ? priceResearchSampleUrl(catmat, s.idCompra) : null,
				])
			)
		}
	}
	return `﻿${lines.join("\n")}\n`
}
// ─── Puro: checklist de conformidade por item ──────────────────────────────────

const daysBetween = (from: string, to: string) => (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000

/**
 * Não conformidades que se resolvem por justificativa (amostra reduzida, período, amostra sem
 * data, seleção manual, método), pela mesma regra da gravação. Preço acima da mediana e unidade
 * herdada têm verificação própria no checklist. A seleção manual é o fato gravado
 * (`manual_selection`), nunca o texto do motivo.
 */
export function justifiableFindingsOf(r: ReportResearch): ResearchFinding[] {
	return evaluateResearchCompliance({
		validCount: r.afterOutlier,
		// O teto da mediana tem verificação bloqueante própria no checklist.
		referencePrice: r.priceMedian ?? 0,
		stats: { median: r.priceMedian ?? 0, uniqueSources: r.uniqueSources ?? 0 },
		method: r.method ?? undefined,
		periodMonths: r.periodMonths,
		undatedCount: r.samples.filter((s) => s.sampleType === "valid" && !s.referenceDate).length,
		manualSelection: r.manualSelection === true,
		justifications: r.justifications ?? {},
	}).filter((f) => f.justification != null)
}

/** Verificações comuns às duas regras (sem pesquisa, preço, teto da mediana, unidade, CV, idade). */
function commonChecks(item: ReportItem, emittedAt: string, sampleChecks: (r: ReportResearch) => ReportCheck[]): ReportCheck[] {
	const checks: ReportCheck[] = []
	const r = item.research
	if (!r) {
		checks.push({ severity: "blocking", message: "Item sem pesquisa de preços registrada.", basis: "IN SEGES/ME 65/2021, art. 3º" })
		return checks
	}
	if (item.unitPrice == null) {
		checks.push({ severity: "blocking", message: "Item sem preço no anexo.", basis: "Lei 14.133/2021, art. 23" })
	} else if (r.referencePrice == null || !isSamePrice(item.unitPrice, r.referencePrice)) {
		checks.push({
			severity: "blocking",
			message: "Preço do anexo diferente do preço estimado da pesquisa registrada.",
			basis: "IN SEGES/ME 65/2021, art. 3º, VII",
		})
	}
	if (r.referencePrice != null && r.priceMedian != null && r.referencePrice > r.priceMedian && !isSamePrice(r.referencePrice, r.priceMedian)) {
		checks.push({
			severity: "blocking",
			message: "Preço estimado acima da mediana com base única no sistema oficial.",
			basis: "IN SEGES/ME 65/2021, art. 6º, § 6º",
		})
	}
	if (r.catmatCodigo != null && item.catmat != null && r.catmatCodigo !== item.catmat) {
		checks.push({
			severity: "blocking",
			message: `A pesquisa consultou o CATMAT ${r.catmatCodigo}, e o item é do CATMAT ${item.catmat}: refaça a pesquisa.`,
			basis: "IN SEGES/ME 65/2021, art. 3º, IV",
		})
	}
	if (r.source?.coverage === "truncated") {
		checks.push({
			severity: "blocking",
			message: `Coleta parcial: ${r.source.pagesFetched} de ${r.source.totalPages} páginas lidas, sem cobrir a janela. Refaça a pesquisa.`,
			basis: "IN SEGES/ME 65/2021, art. 3º, IV",
		})
	}
	checks.push(...sampleChecks(r))
	if (r.nonComplianceReasons.some((reason) => reason.includes("sem unidade declarada"))) {
		checks.push({
			severity: "warning",
			message: "Unidade da pesquisa herdada das amostras: confira se a quantidade do anexo está na mesma unidade.",
			basis: "Conferência interna",
		})
	}
	if (r.cvPct != null && r.cvPct > HIGH_CV_PERCENT) {
		checks.push({
			severity: "warning",
			message: `Variação alta (CV ${r.cvPct.toFixed(1)}%): registre a análise crítica dos preços.`,
			basis: `IN SEGES/ME 65/2021, art. 6º, § 4º (limiar interno de ${HIGH_CV_PERCENT}%)`,
		})
	}
	const oldSamples = r.samples.filter(
		(s) => s.sampleType === "valid" && s.referenceDate && daysBetween(s.referenceDate, emittedAt) > SAMPLE_MAX_AGE_DAYS
	).length
	if (oldSamples > 0) {
		checks.push({
			severity: "warning",
			message: `${oldSamples} preço(s) válido(s) com mais de 1 ano na data da emissão.`,
			basis: "Janela do inciso II do art. 5º da IN 65/2021, aplicada por prudência",
		})
	}
	if (daysBetween(r.createdAt, emittedAt) > PRICE_RESEARCH_VALIDITY_DAYS) {
		checks.push({
			severity: "warning",
			message: `Pesquisa feita há mais de ${PRICE_RESEARCH_VALIDITY_DAYS} dias: refaça antes de divulgar o edital.`,
			basis: "Política interna",
		})
	}
	return checks
}

/**
 * Verificações do item na data da emissão, pela regra vigente (2): as não conformidades
 * justificáveis sem justificativa viram aviso; justificadas, saem daqui para a seção 7.
 */
export function auditReportItem(item: ReportItem, emittedAt: string): ReportCheck[] {
	return commonChecks(item, emittedAt, (r) =>
		justifiableFindingsOf(r)
			.filter((f) => !f.justified)
			.map((f) => ({ severity: "warning" as const, message: `${f.message}. ${f.remedy}`, basis: f.basis }))
	)
}

/**
 * Regra 1 (emissões anteriores a 20260926211000, sem checklist congelado), mantida como era para
 * o documento emitido continuar o mesmo: amostra reduzida num aviso só, pelo art. 6º, § 5º.
 */
export function auditReportItemV1(item: ReportItem, emittedAt: string): ReportCheck[] {
	return commonChecks(item, emittedAt, (r) =>
		r.afterOutlier < 3 || (r.uniqueSources ?? 0) < 3
			? [
					{
						severity: "warning",
						message: `Menos de 3 preços válidos ou de 3 fontes (${r.afterOutlier} preços, ${r.uniqueSources ?? 0} UASGs): exige justificativa aprovada pela autoridade competente.`,
						basis: "IN SEGES/ME 65/2021, art. 6º, § 5º",
					},
				]
			: []
	)
}

/** Excepcionalidades pela regra vigente: uma linha por justificativa, cada achado com a sua base. */
export function reportExceptionsOf(item: ReportItem): ReportException[] {
	if (!item.research) return []
	const justifications = item.research.justifications ?? {}
	const groups = new Map<ResearchJustificationKey, ReportException>()
	for (const f of justifiableFindingsOf(item.research)) {
		const key = f.justification as ResearchJustificationKey
		const group = groups.get(key) ?? { justification: key, findings: [], text: justifications[key] ?? null }
		group.findings.push({ code: f.code, message: f.message, basis: f.basis })
		groups.set(key, group)
	}
	return [...groups.values()]
}

/** Excepcionalidades da regra 1: o item com menos de 3 preços ou fontes, justificativa em branco. */
function reportExceptionsV1(item: ReportItem): ReportException[] {
	const r = item.research
	if (!r || (r.afterOutlier >= 3 && (r.uniqueSources ?? 0) >= 3)) return []
	return [
		{
			justification: "lowSample",
			findings: [{ code: "low_sample", message: "Menos de 3 preços válidos ou de 3 fontes", basis: "IN SEGES/ME 65/2021, art. 6º, § 5º" }],
			text: null,
		},
	]
}

/** O que a emissão congela do item: checklist e excepcionalidades na data dela. */
export function freezeItemAudit(item: ReportItem, emittedAt: string): FrozenItemAudit {
	return { checks: auditReportItem(item, emittedAt), exceptions: reportExceptionsOf(item) }
}

/** Checklist e excepcionalidades de um item emitido: os congelados, ou a regra 1 para emissão antiga. */
export function emittedItemAudit(item: ReportItem, emittedAt: string): FrozenItemAudit {
	return item.audit ?? { checks: auditReportItemV1(item, emittedAt), exceptions: reportExceptionsV1(item) }
}

// ─── Puro: roteiro de auditoria por amostragem ──────────────────────────────────

/** Gerador pseudoaleatório pequeno e reproduzível (mulberry32), semeado pelo hash. */
function seededRandom(seedHex: string): () => number {
	let seed = Number.parseInt(seedHex.slice(0, 8), 16) >>> 0
	return () => {
		seed = (seed + 0x6d2b79f5) >>> 0
		let t = seed
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Roteiro de conferência: a curva A (itens que somam 80% do valor estimado) inteira, mais uma
 * amostra de 10% dos demais (mínimo 5), sorteada com semente derivada do SHA-256 da série — dois
 * auditores com a mesma emissão sorteiam os mesmos itens.
 */
export function buildAuditSample(items: readonly ReportItem[], sha256: string): { curveA: number[]; sampled: number[] } {
	const valued = items
		.map((i) => ({ order: i.order, value: i.unitPrice != null && i.maxQuantity != null ? i.unitPrice * i.maxQuantity : 0 }))
		.sort((a, b) => b.value - a.value || a.order - b.order)
	const total = valued.reduce((sum, v) => sum + v.value, 0)
	const curveA: number[] = []
	let running = 0
	for (const v of valued) {
		if (total <= 0 || running >= total * CURVE_A_SHARE) break
		curveA.push(v.order)
		running += v.value
	}
	const rest = items.map((i) => i.order).filter((order) => !curveA.includes(order))
	const want = Math.min(rest.length, Math.max(SAMPLE_MIN, Math.ceil(rest.length * SAMPLE_SHARE)))
	const random = seededRandom(sha256)
	const pool = [...rest]
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1))
		;[pool[i], pool[j]] = [pool[j], pool[i]]
	}
	return { curveA: curveA.sort((a, b) => a - b), sampled: pool.slice(0, want).sort((a, b) => a - b) }
}

export function sha256Hex(text: string): string {
	return nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex")
}

// ─── Banco: dossiê do anexo ─────────────────────────────────────────────────────

type Row = Record<string, unknown>
const num = (v: unknown): number | null => (v == null ? null : Number(v))
const str = (v: unknown): string | null => (v == null ? null : String(v))

async function authorizeQuantityEstimate(db: SisubDb, ctx: UserContext, quantityEstimateId: string, level: 1 | 2) {
	const rows = (await runQuery(
		"FETCH_FAILED",
		() =>
			db.execute(sql`
				select l.id, l.unit_id, l.title, l.status, l.validity_months, l.is_budget_confidential, l.segment_id,
					s.name as segment_name, u.display_name as unit_name, u.uasg
				from procurement.quantity_estimate l
				left join procurement.segment s on s.id = l.segment_id
				left join core.units u on u.id = l.unit_id
				where l.id = ${quantityEstimateId} and l.deleted_at is null
			`),
		{ prefix: "Erro ao ler o anexo" }
	)) as unknown as Row[]
	const list = rows[0]
	if (!list) throw new NotFoundError("anexo quantitativo", quantityEstimateId)
	requireUnit(ctx, level, Number(list.unit_id))
	return list
}

/**
 * Itens do anexo na ordem da tabela do TR (pasta, com as sem pasta no fim, depois o insumo), com a
 * quantidade máxima: a congelada no snapshot quando o anexo foi concluído, senão a da regra de
 * agora (`resolveQuantityEstimateMaxQuantities`, a mesma dos limites do anexo).
 */
async function loadItems(db: SisubDb, quantityEstimateId: string, status: string): Promise<Omit<ReportItem, "research">[]> {
	const rows = (await runQuery(
		"FETCH_FAILED",
		() =>
			db.execute(sql`
				select i.id, i.ingredient_id, i.catmat_item_codigo,
					coalesce(i.purchase_item_description, i.catmat_item_descricao, i.ingredient_name) as description,
					coalesce(case when i.purchase_quantity is not null then i.purchase_measure_unit end, i.measure_unit, 'UN') as unit,
					i.unit_price
				from procurement.quantity_estimate_item i
				where i.quantity_estimate_id = ${quantityEstimateId}
				order by i.folder_description asc nulls last, i.ingredient_name, i.id
			`),
		{ prefix: "Erro ao ler os itens do anexo" }
	)) as unknown as Row[]

	let maxById: Map<string, number>
	if (status === "draft") {
		maxById = await resolveQuantityEstimateMaxQuantities(db, quantityEstimateId)
	} else {
		const components = (await runQuery("FETCH_FAILED", () =>
			db.execute(
				sql`select ingredient_id, max_quantity from procurement.quantity_estimate_snapshot_component where quantity_estimate_id = ${quantityEstimateId}`
			)
		)) as unknown as Row[]
		const byIngredient = new Map(components.filter((c) => c.ingredient_id != null).map((c) => [String(c.ingredient_id), num(c.max_quantity)]))
		maxById = new Map()
		for (const r of rows) {
			const max = r.ingredient_id != null ? byIngredient.get(String(r.ingredient_id)) : undefined
			if (max != null) maxById.set(String(r.id), max)
		}
	}

	return rows.map((r, index) => ({
		order: index + 1,
		listItemId: String(r.id),
		catmat: num(r.catmat_item_codigo),
		description: String(r.description ?? ""),
		unit: String(r.unit ?? "UN"),
		maxQuantity: maxById.get(String(r.id)) ?? null,
		unitPrice: num(r.unit_price),
	}))
}

/** Consulta gravada na pesquisa (`ri.*` traz as colunas quando a migration 20261016150000 está aplicada). */
function sourceConsultationOf(h: Row): PriceResearchSourceConsultation | null {
	const coverage = str(h.source_coverage)
	if (h.source_consulted_at == null || !(SOURCE_COVERAGES as readonly string[]).includes(coverage ?? "")) return null
	return {
		consultedAt: new Date(String(h.source_consulted_at)).toISOString(),
		totalRecords: num(h.source_total_records) ?? 0,
		totalPages: num(h.source_total_pages) ?? 0,
		pagesFetched: num(h.source_pages_fetched) ?? 0,
		coverage: coverage as SourceCoverage,
	}
}

/** Pesquisas por id, com amostras e o nome do agente. */
async function loadResearch(db: SisubDb, researchItemIds: readonly string[]): Promise<Map<string, ReportResearch>> {
	if (researchItemIds.length === 0) return new Map()
	const ids = sql.join(
		researchItemIds.map((id) => sql`${id}::uuid`),
		sql`, `
	)
	const [heads, samples] = (await Promise.all([
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select ri.*, rh.created_by, rh.period_months, rh.reference_method as header_method,
						nullif(btrim(coalesce(m.posto, '') || ' ' || coalesce(m.nome_guerra, '')), '') as military_name,
						coalesce(ud.email, au.email) as email
					from procurement.price_research_item ri
					join procurement.price_research rh on rh.id = ri.research_id
					left join auth.users au on au.id = rh.created_by
					left join core.user_data ud on ud.id = rh.created_by
					left join core.military_identity m on m.saram = core.visible_saram(ud.id)
					where ri.id in (${ids})
				`),
			{ prefix: "Erro ao ler as pesquisas" }
		),
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select b.research_item_id, b.sample_type, b.converted_price, b.content_in_unit, b.conversion, a.*
					from procurement.price_research_sample b
					join procurement.price_sample a on a.id = b.price_sample_id
					where b.research_item_id in (${ids})
				`),
			{ prefix: "Erro ao ler as amostras" }
		),
	])) as unknown as [Row[], Row[]]

	const result = new Map<string, ReportResearch>()
	for (const h of heads) {
		const measureUnit = str(h.measure_unit)
		const own = samples.filter((s) => s.research_item_id === h.id)
		result.set(String(h.id), {
			researchItemId: String(h.id),
			researchId: String(h.research_id),
			catmatCodigo: num(h.catmat_codigo),
			createdAt: new Date(String(h.created_at)).toISOString(),
			createdBy: str(h.created_by),
			createdByName: str(h.military_name) ?? str(h.email),
			method: str(h.reference_method) ?? str(h.header_method),
			periodMonths: num(h.period_months),
			measureUnit,
			totalRaw: num(h.total_raw) ?? 0,
			afterDate: num(h.total_after_date_filter) ?? 0,
			afterPollution: num(h.total_after_pollution_filter) ?? 0,
			afterOutlier: num(h.total_after_outlier) ?? 0,
			priceMin: num(h.price_min),
			priceMax: num(h.price_max),
			priceMean: num(h.price_mean),
			priceMedian: num(h.price_median),
			stdDev: num(h.std_dev),
			cvPct: num(h.cv_pct),
			uniqueSources: num(h.unique_sources),
			referencePrice: num(h.reference_price),
			nonComplianceReasons: (Array.isArray(h.non_compliance_reasons) ? h.non_compliance_reasons : []).filter(Boolean) as string[],
			// `ri.*` traz as colunas quando a migration 20260926211000 está aplicada; antes, ficam nulas.
			justifications: {
				lowSample: str(h.justification_low_sample),
				method: str(h.justification_method),
				outlierCriteria: str(h.justification_outlier_criteria),
				outOfPeriod: str(h.justification_out_of_period),
			},
			manualSelection: h.manual_selection === true,
			source: sourceConsultationOf(h),
			samples: own.map((s) => {
				const stored = s.converted_price != null
				// Pesquisa anterior à gravação da conversão: refaz pela mesma regra pura, e o relatório diz.
				const recomputed =
					!stored && measureUnit
						? convertSamplePrice(
								{
									precoUnitario: num(s.preco_unitario),
									capacidadeUnidadeFornecimento: num(s.capacidade_unidade_fornecimento),
									siglaUnidadeFornecimento: str(s.sigla_unidade_fornecimento),
									siglaUnidadeMedida: str(s.sigla_unidade_medida),
								},
								measureUnit
							)
						: null
				return {
					sampleType: String(s.sample_type) as SampleClass,
					idCompra: String(s.id_compra),
					idItemCompra: num(s.id_item_compra),
					codigoUasg: str(s.codigo_uasg),
					nomeUasg: str(s.nome_uasg),
					municipio: str(s.municipio),
					estado: str(s.estado),
					referenceDate: s.reference_date ? String(s.reference_date).slice(0, 10) : null,
					niFornecedor: str(s.ni_fornecedor),
					nomeFornecedor: str(s.nome_fornecedor),
					marca: str(s.marca),
					descricaoItem: str(s.descricao_item),
					quantidade: str(s.quantidade),
					siglaUnidadeFornecimento: str(s.sigla_unidade_fornecimento),
					capacidadeUnidadeFornecimento: str(s.capacidade_unidade_fornecimento),
					siglaUnidadeMedida: str(s.sigla_unidade_medida),
					precoUnitario: str(s.preco_unitario),
					contentInUnit: stored ? str(s.content_in_unit) : recomputed?.ok ? recomputed.contentInTarget.toFixed(6) : null,
					convertedPrice: stored ? str(s.converted_price) : recomputed?.ok ? recomputed.price.toFixed(6) : null,
					conversion: stored ? str(s.conversion) : recomputed ? (recomputed.ok ? recomputed.explanation : "incomparável") : null,
					conversionRecomputed: !stored && recomputed != null,
				}
			}),
		})
	}
	return result
}

/**
 * Pesquisa de cada item: a mais recente que SUSTENTA o preço aplicado (mesmo valor), senão a mais
 * recente. Uma pesquisa gravada cuja aplicação falhou não pode passar à frente da que vale.
 */
async function latestResearchByItem(db: SisubDb, listItemIds: readonly string[]): Promise<Map<string, string>> {
	if (listItemIds.length === 0) return new Map()
	const rows = (await runQuery("FETCH_FAILED", () =>
		db.execute(sql`
			select distinct on (ri.quantity_estimate_item_id) ri.quantity_estimate_item_id, ri.id
			from procurement.price_research_item ri
			join procurement.quantity_estimate_item i on i.id = ri.quantity_estimate_item_id
			where ri.quantity_estimate_item_id in (${sql.join(
				listItemIds.map((id) => sql`${id}::uuid`),
				sql`, `
			)})
			order by ri.quantity_estimate_item_id,
				(i.unit_price is not null and ri.reference_price is not null
					and abs(ri.reference_price - i.unit_price) <= greatest(${PRICE_MATCH_ABSOLUTE}, abs(i.unit_price) * ${PRICE_MATCH_RELATIVE})) desc,
				ri.created_at desc
		`)
	)) as unknown as Row[]
	return new Map(rows.map((r) => [String(r.quantity_estimate_item_id), String(r.id)]))
}

export interface PriceResearchReport {
	list: {
		id: string
		title: string
		status: string
		unitName: string | null
		uasg: string | null
		segmentName: string | null
		validityMonths: number | null
		isBudgetConfidential: boolean
	}
	emission: { id: string; sequence: number; emittedAt: string; emittedByName: string | null; sha256: string; verified: boolean }
	items: ReportItem[]
	csv: string
	checks: Array<{ order: number; checks: ReportCheck[] }>
	/** Excepcionalidades por item (seção 7), congeladas na emissão ou pela regra 1. */
	exceptions: Array<{ order: number; description: string; exceptions: ReportException[] }>
	/**
	 * Regra com que a emissão foi feita: 1 = anterior a 20260926211000 (checklist recalculado pela
	 * regra da época); 2 = checklist e excepcionalidades congelados. O texto do documento acompanha.
	 */
	ruleVersion: 1 | 2
	/** Formato da série em CSV (`SERIES_FORMAT`): 1 nas emissões antigas, sem nota nem resumo. */
	seriesFormat: number
	auditSample: { curveA: number[]; sampled: number[] }
	emissions: Array<{ id: string; sequence: number; emittedAt: string }>
}

/**
 * Gera uma emissão nova: a pesquisa mais recente de cada item e o preço de agora. Exige `unit:2`
 * na OM do anexo (grava). Devolve o id; o relatório se lê por `fetchPriceResearchReport`.
 */
export async function emitPriceResearchReport(db: SisubDb, ctx: UserContext, input: { quantityEstimateId: string }): Promise<{ id: string; sequence: number }> {
	const list = await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId, 2)
	const items = await loadItems(db, input.quantityEstimateId, String(list.status))
	if (items.length === 0) throw new DomainError("EMPTY_ANNEX", "O anexo não tem itens para o relatório de pesquisa de preços.")
	const latest = await latestResearchByItem(
		db,
		items.map((i) => i.listItemId)
	)
	const research = await loadResearch(db, [...new Set(latest.values())])
	// O que a emissão congela: o relatório inteiro sai daqui depois, nunca do estado de agora.
	// O checklist e as excepcionalidades também: reabrir a emissão depois de uma mudança de regra
	// mostra o que foi emitido. A data da emissão é fixada aqui e gravada igual.
	const emittedAt = new Date().toISOString()
	const frozen: ReportItem[] = items.map((i) => {
		const withResearch = { ...i, research: research.get(latest.get(i.listItemId) ?? "") ?? null }
		return { ...withResearch, audit: freezeItemAudit(withResearch, emittedAt), seriesFormat: SERIES_FORMAT }
	})
	// O hash é sobre a série no formato gravado nos itens; reabrir a emissão a regenera no mesmo formato.
	const sha256 = sha256Hex(buildResearchSeriesCsv(frozen))

	return runQuery("TRANSACTION_FAILED", () =>
		db.transaction(async (tx) => {
			// Trava a linha do anexo: duas emissões simultâneas disputariam o mesmo número.
			await tx.execute(sql`select id from procurement.quantity_estimate where id = ${input.quantityEstimateId} for update`)
			const [last] = await tx
				.select({ sequence: priceResearchEmissionInProcurement.sequence })
				.from(priceResearchEmissionInProcurement)
				.where(eq(priceResearchEmissionInProcurement.quantityEstimateId, input.quantityEstimateId))
				.orderBy(desc(priceResearchEmissionInProcurement.sequence))
				.limit(1)
			const sequence = (last?.sequence ?? 0) + 1
			const [row] = await tx
				.insert(priceResearchEmissionInProcurement)
				.values({
					quantityEstimateId: input.quantityEstimateId,
					sequence,
					emittedBy: ctx.userId,
					emittedAt,
					sha256,
					items: frozen,
				})
				.returning({ id: priceResearchEmissionInProcurement.id })
			return { id: row.id, sequence }
		})
	)
}

/**
 * Relatório de uma emissão (a mais recente, sem `emissionId`): refaz a série com as pesquisas e os
 * preços GRAVADOS na emissão e confere o SHA-256. Exige `unit:1`.
 */
export async function fetchPriceResearchReport(
	db: SisubDb,
	ctx: UserContext,
	input: { quantityEstimateId: string; emissionId?: string | null }
): Promise<PriceResearchReport | null> {
	const list = await authorizeQuantityEstimate(db, ctx, input.quantityEstimateId, 1)
	const emissions = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: priceResearchEmissionInProcurement.id,
				sequence: priceResearchEmissionInProcurement.sequence,
				emittedAt: priceResearchEmissionInProcurement.emittedAt,
			})
			.from(priceResearchEmissionInProcurement)
			.where(eq(priceResearchEmissionInProcurement.quantityEstimateId, input.quantityEstimateId))
			.orderBy(desc(priceResearchEmissionInProcurement.sequence))
	)
	const chosenId = input.emissionId ?? emissions[0]?.id
	if (!chosenId) return null
	const [emission] = (await runQuery("FETCH_FAILED", () =>
		db.execute(sql`
			select e.*, nullif(btrim(coalesce(m.posto, '') || ' ' || coalesce(m.nome_guerra, '')), '') as military_name,
				coalesce(ud.email, au.email) as email
			from procurement.price_research_emission e
			left join auth.users au on au.id = e.emitted_by
			left join core.user_data ud on ud.id = e.emitted_by
			left join core.military_identity m on m.saram = core.visible_saram(ud.id)
			where e.id = ${chosenId} and e.quantity_estimate_id = ${input.quantityEstimateId}
		`)
	)) as unknown as Row[]
	if (!emission) throw new NotFoundError("emissão", chosenId)

	// O relatório sai do que a emissão congelou (itens, preços, pesquisas e amostras).
	const items = (Array.isArray(emission.items) ? emission.items : JSON.parse(String(emission.items))) as ReportItem[]
	const csv = buildResearchSeriesCsv(items)
	const sha256 = String(emission.sha256)
	const emittedAt = new Date(String(emission.emitted_at)).toISOString()
	return {
		list: {
			id: String(list.id),
			title: String(list.title),
			status: String(list.status),
			unitName: str(list.unit_name),
			uasg: str(list.uasg),
			segmentName: str(list.segment_name),
			validityMonths: num(list.validity_months),
			isBudgetConfidential: Boolean(list.is_budget_confidential),
		},
		emission: {
			id: String(emission.id),
			sequence: Number(emission.sequence),
			emittedAt,
			emittedByName: str(emission.military_name) ?? str(emission.email),
			sha256,
			verified: sha256Hex(csv) === sha256,
		},
		items,
		csv,
		checks: items.map((i) => ({ order: i.order, checks: emittedItemAudit(i, emittedAt).checks })),
		exceptions: items.map((i) => ({ order: i.order, description: i.description, exceptions: emittedItemAudit(i, emittedAt).exceptions })),
		ruleVersion: items.some((i) => i.audit) ? 2 : 1,
		seriesFormat: seriesFormatOf(items),
		auditSample: buildAuditSample(items, sha256),
		emissions: emissions.map((e) => ({ id: e.id, sequence: e.sequence, emittedAt: e.emittedAt })),
	}
}
