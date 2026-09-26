/**
 * Relatório de pesquisa de preços do anexo quantitativo (IN SEGES/ME 65/2021, art. 3º), como
 * EMISSÃO registrada (change `sisub-procurement-planning-flows`, D7).
 *
 * O preço do anexo segue vivo (a pesquisa se refaz perto do edital), então o documento não pode
 * depender do estado de "agora". Cada emissão grava, em `procurement.price_research_emission`, as
 * pesquisas e os preços que usou e o SHA-256 da série de preços. Reabrir a emissão regenera os
 * mesmos bytes a partir das pesquisas gravadas e confere o hash: é isso que torna o documento
 * conferível pelo auditor meses depois.
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
import { runQuery } from "../utils/index.ts"
import { PRICE_RESEARCH_VALIDITY_DAYS } from "./ata.ts"
import { computeMaxQuantity, DEFAULT_MAX_MARGIN_PERCENT } from "./ata-quantity-limits.ts"
import { convertSamplePrice, isSamePrice } from "./price-units.ts"

/** Variação acima da qual o relatório pede análise crítica (art. 6º, § 4º). Limiar interno, declarado no documento. */
export const HIGH_CV_PERCENT = 25
/** Janela de 1 ano (inciso II do art. 5º), aplicada por prudência à fonte oficial. */
export const SAMPLE_MAX_AGE_DAYS = 365
/** Fração da curva A: os itens que somam este percentual do valor são conferidos por inteiro. */
export const CURVE_A_SHARE = 0.8
/** Amostra dos demais itens: 10%, com mínimo de 5. */
export const SAMPLE_SHARE = 0.1
export const SAMPLE_MIN = 5

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
	/** true quando a conversão foi refeita agora (pesquisa gravada antes de a conversão ser gravada). */
	conversionRecomputed: boolean
}

export interface ReportResearch {
	researchItemId: string
	researchId: string
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
	samples: ReportSample[]
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

/**
 * Série de preços coletados (art. 3º, IV), determinística: itens na ordem do anexo, amostras por
 * classificação e depois pelo identificador da compra. Começa com BOM, para a planilha ler os
 * acentos — e o hash é calculado sobre estes mesmos bytes.
 */
export function buildResearchSeriesCsv(items: readonly ReportItem[]): string {
	const lines = [CSV_HEADER.join(",")]
	for (const item of items) {
		if (!item.research) continue
		const samples = [...item.research.samples].sort(
			(a, b) =>
				CLASS_ORDER[a.sampleType] - CLASS_ORDER[b.sampleType] ||
				a.idCompra.localeCompare(b.idCompra) ||
				(a.idItemCompra ?? 0) - (b.idItemCompra ?? 0) ||
				(a.precoUnitario ?? "").localeCompare(b.precoUnitario ?? "")
		)
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

// ─── Puro: checklist de conformidade por item ──────────────────────────────────

const daysBetween = (from: string, to: string) => (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000

/** Verificações do item, com severidade e base legal, na data da emissão. */
export function auditReportItem(item: ReportItem, emittedAt: string): ReportCheck[] {
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
	if (r.afterOutlier < 3 || (r.uniqueSources ?? 0) < 3) {
		checks.push({
			severity: "warning",
			message: `Menos de 3 preços válidos ou de 3 fontes (${r.afterOutlier} preços, ${r.uniqueSources ?? 0} UASGs): exige justificativa aprovada pela autoridade competente.`,
			basis: "IN SEGES/ME 65/2021, art. 6º, § 5º",
		})
	}
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

async function authorizeList(db: SisubDb, ctx: UserContext, listId: string, level: 1 | 2) {
	const rows = (await runQuery(
		"FETCH_FAILED",
		() =>
			db.execute(sql`
				select l.id, l.unit_id, l.title, l.status, l.validity_months, l.is_budget_confidential, l.segment_id,
					s.name as segment_name, u.display_name as unit_name, u.uasg
				from procurement.procurement_list l
				left join procurement.procurement_segment s on s.id = l.segment_id
				left join core.units u on u.id = l.unit_id
				where l.id = ${listId} and l.deleted_at is null
			`),
		{ prefix: "Erro ao ler o anexo" }
	)) as unknown as Row[]
	const list = rows[0]
	if (!list) throw new NotFoundError("anexo quantitativo", listId)
	requireUnit(ctx, level, Number(list.unit_id))
	return list
}

/** Itens do anexo na ordem do documento, com a quantidade máxima (congelada, se concluído). */
async function loadItems(db: SisubDb, listId: string): Promise<Omit<ReportItem, "research">[]> {
	const rows = (await runQuery(
		"FETCH_FAILED",
		() =>
			db.execute(sql`
				select i.id, i.catmat_item_codigo, coalesce(i.purchase_item_description, i.catmat_item_descricao, i.ingredient_name) as description,
					coalesce(case when i.purchase_quantity is not null then i.purchase_measure_unit end, i.measure_unit, 'UN') as unit,
					i.unit_price, i.purchase_quantity, i.total_quantity, i.folder_description, i.max_margin_percent,
					(select l.max_margin_percent from procurement.procurement_list l where l.id = i.list_id) as list_margin,
					(select c.max_quantity from procurement.procurement_list_snapshot_component c
						where c.list_id = i.list_id and c.ingredient_id is not distinct from i.ingredient_id limit 1) as snapshot_max
				from procurement.procurement_list_item i
				where i.list_id = ${listId}
				order by coalesce(i.folder_description, 'Sem categoria'), coalesce(i.purchase_item_description, i.ingredient_name), i.id
			`),
		{ prefix: "Erro ao ler os itens do anexo" }
	)) as unknown as Row[]
	return rows.map((r, index) => ({
		order: index + 1,
		listItemId: String(r.id),
		catmat: num(r.catmat_item_codigo),
		description: String(r.description ?? ""),
		unit: String(r.unit ?? "UN"),
		// Concluído: a máxima congelada. Rascunho: a máxima pela regra de agora (estimada + acréscimo),
		// que ainda muda até concluir.
		maxQuantity:
			num(r.snapshot_max) ??
			computeMaxQuantity(num(r.purchase_quantity) ?? num(r.total_quantity) ?? 0, num(r.max_margin_percent) ?? num(r.list_margin) ?? DEFAULT_MAX_MARGIN_PERCENT),
		unitPrice: num(r.unit_price),
	}))
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
						nullif(btrim(coalesce(m."sgPosto", '') || ' ' || coalesce(m."nmGuerra", '')), '') as military_name,
						coalesce(ud.email, au.email) as email
					from procurement.procurement_pesquisa_preco_item ri
					join procurement.procurement_pesquisa_preco rh on rh.id = ri.research_id
					left join auth.users au on au.id = rh.created_by
					left join core.user_data ud on ud.id = rh.created_by
					left join core.user_military_data m on m."nrOrdem" = ud."nrOrdem"
					where ri.id in (${ids})
				`),
			{ prefix: "Erro ao ler as pesquisas" }
		),
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select b.research_item_id, b.sample_type, b.converted_price, b.content_in_unit, b.conversion, a.*
					from procurement.procurement_pesquisa_preco_amostra b
					join procurement.compras_amostra a on a.id = b.amostra_id
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

/** Pesquisa mais recente de cada item do anexo. */
async function latestResearchByItem(db: SisubDb, listItemIds: readonly string[]): Promise<Map<string, string>> {
	if (listItemIds.length === 0) return new Map()
	const rows = (await runQuery("FETCH_FAILED", () =>
		db.execute(sql`
			select distinct on (ri.ata_item_id) ri.ata_item_id, ri.id
			from procurement.procurement_pesquisa_preco_item ri
			where ri.ata_item_id in (${sql.join(
				listItemIds.map((id) => sql`${id}::uuid`),
				sql`, `
			)})
			order by ri.ata_item_id, ri.created_at desc
		`)
	)) as unknown as Row[]
	return new Map(rows.map((r) => [String(r.ata_item_id), String(r.id)]))
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
	auditSample: { curveA: number[]; sampled: number[] }
	emissions: Array<{ id: string; sequence: number; emittedAt: string }>
}

type EmissionItem = { list_item_id: string; research_item_id: string | null; unit_price: number | null }

/**
 * Gera uma emissão nova: a pesquisa mais recente de cada item e o preço de agora. Exige `unit:2`
 * na OM do anexo (grava). Devolve o id; o relatório se lê por `fetchPriceResearchReport`.
 */
export async function emitPriceResearchReport(db: SisubDb, ctx: UserContext, input: { ataId: string }): Promise<{ id: string; sequence: number }> {
	await authorizeList(db, ctx, input.ataId, 2)
	const items = await loadItems(db, input.ataId)
	if (items.length === 0) throw new DomainError("EMPTY_ANNEX", "O anexo não tem itens para o relatório de pesquisa de preços.")
	const latest = await latestResearchByItem(
		db,
		items.map((i) => i.listItemId)
	)
	const research = await loadResearch(db, [...new Set(latest.values())])
	const full: ReportItem[] = items.map((i) => ({ ...i, research: research.get(latest.get(i.listItemId) ?? "") ?? null }))
	const sha256 = sha256Hex(buildResearchSeriesCsv(full))
	const payload: EmissionItem[] = full.map((i) => ({
		list_item_id: i.listItemId,
		research_item_id: i.research?.researchItemId ?? null,
		unit_price: i.unitPrice,
	}))

	return runQuery("TRANSACTION_FAILED", () =>
		db.transaction(async (tx) => {
			const [last] = await tx
				.select({ sequence: priceResearchEmissionInProcurement.sequence })
				.from(priceResearchEmissionInProcurement)
				.where(eq(priceResearchEmissionInProcurement.listId, input.ataId))
				.orderBy(desc(priceResearchEmissionInProcurement.sequence))
				.limit(1)
			const sequence = (last?.sequence ?? 0) + 1
			const [row] = await tx
				.insert(priceResearchEmissionInProcurement)
				.values({ listId: input.ataId, sequence, emittedBy: ctx.userId, sha256, items: payload })
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
	input: { ataId: string; emissionId?: string | null }
): Promise<PriceResearchReport | null> {
	const list = await authorizeList(db, ctx, input.ataId, 1)
	const emissions = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: priceResearchEmissionInProcurement.id,
				sequence: priceResearchEmissionInProcurement.sequence,
				emittedAt: priceResearchEmissionInProcurement.emittedAt,
			})
			.from(priceResearchEmissionInProcurement)
			.where(eq(priceResearchEmissionInProcurement.listId, input.ataId))
			.orderBy(desc(priceResearchEmissionInProcurement.sequence))
	)
	const chosenId = input.emissionId ?? emissions[0]?.id
	if (!chosenId) return null
	const [emission] = (await runQuery("FETCH_FAILED", () =>
		db.execute(sql`
			select e.*, nullif(btrim(coalesce(m."sgPosto", '') || ' ' || coalesce(m."nmGuerra", '')), '') as military_name,
				coalesce(ud.email, au.email) as email
			from procurement.price_research_emission e
			left join auth.users au on au.id = e.emitted_by
			left join core.user_data ud on ud.id = e.emitted_by
			left join core.user_military_data m on m."nrOrdem" = ud."nrOrdem"
			where e.id = ${chosenId} and e.list_id = ${input.ataId}
		`)
	)) as unknown as Row[]
	if (!emission) throw new NotFoundError("emissão", chosenId)

	const payload = (Array.isArray(emission.items) ? emission.items : JSON.parse(String(emission.items))) as EmissionItem[]
	const base = new Map((await loadItems(db, input.ataId)).map((i) => [i.listItemId, i]))
	const research = await loadResearch(db, [...new Set(payload.map((p) => p.research_item_id).filter((id): id is string => id != null))])
	const items: ReportItem[] = payload.map((p, index) => {
		const item = base.get(p.list_item_id)
		return {
			order: index + 1,
			listItemId: p.list_item_id,
			catmat: item?.catmat ?? null,
			description: item?.description ?? "Item removido do anexo",
			unit: item?.unit ?? "",
			maxQuantity: item?.maxQuantity ?? null,
			unitPrice: p.unit_price == null ? null : Number(p.unit_price),
			research: p.research_item_id ? (research.get(p.research_item_id) ?? null) : null,
		}
	})
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
		checks: items.map((i) => ({ order: i.order, checks: auditReportItem(i, emittedAt) })),
		auditSample: buildAuditSample(items, sha256),
		emissions: emissions.map((e) => ({ id: e.id, sequence: e.sequence, emittedAt: e.emittedAt })),
	}
}
