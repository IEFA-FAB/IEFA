/**
 * TODO(db:types): tabelas-ponte do rename 20260927060000 (lote 3 da linguagem ubíqua), na forma
 * que `db:drizzle:pull` vai gerar.
 *
 * Mesma ideia de `src/pending-ubiquitous-language-lot3.ts`: o código usa só os nomes novos antes
 * do pull. O barrel (`sisub.ts`) exporta estes objetos com os mesmos identificadores que o pull
 * produz (`priceResearchInProcurement`, `arpInProcurement`, `.priceSampleId`...). Só colunas:
 * índices, FKs e CHECKs não entram nas queries.
 *
 * `relations.ts` (o `db.query … with`) continua apontando para os objetos gerados, que ainda usam
 * os nomes antigos; por isso nenhuma relational query atravessa estas tabelas — os joins são
 * explícitos.
 *
 * Depois de aplicar 20260927060000 e rodar `db:drizzle:pull`, o tripwire do fim quebra o
 * typecheck: apague este arquivo e o bloco de reexport dele em `sisub.ts`.
 */
import { sql } from "drizzle-orm"
import { boolean, date, integer, numeric, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type * as generated from "./schema"
import { procurement } from "./schema"

export const priceResearchInProcurement = procurement.table("price_research", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	referenceMethod: text("reference_method").default("median").notNull(),
	periodMonths: smallint("period_months").default(12),
	similarityThreshold: numeric("similarity_threshold", { mode: "number", precision: 4, scale: 3 }),
	filterEstado: text("filter_estado"),
	filterUasgCode: text("filter_uasg_code"),
	filterMunicipioCode: integer("filter_municipio_code"),
	totalItems: integer("total_items").default(0).notNull(),
	itemsWithPrice: integer("items_with_price").default(0).notNull(),
	itemsWithoutCatmat: integer("items_without_catmat").default(0).notNull(),
	nonCompliantItems: integer("non_compliant_items").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	idempotencyKey: text("idempotency_key"),
	createdBy: uuid("created_by"),
	quantityEstimateId: uuid("quantity_estimate_id"),
})

export const priceResearchItemInProcurement = procurement.table("price_research_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	researchId: uuid("research_id").notNull(),
	catmatCodigo: integer("catmat_codigo"),
	catmatDescricao: text("catmat_descricao"),
	productName: text("product_name").notNull(),
	totalRaw: integer("total_raw").default(0).notNull(),
	totalAfterDateFilter: integer("total_after_date_filter").default(0).notNull(),
	totalAfterPollutionFilter: integer("total_after_pollution_filter").default(0).notNull(),
	totalAfterOutlier: integer("total_after_outlier").default(0).notNull(),
	priceMin: numeric("price_min", { mode: "number", precision: 12, scale: 4 }),
	priceMax: numeric("price_max", { mode: "number", precision: 12, scale: 4 }),
	priceMean: numeric("price_mean", { mode: "number", precision: 12, scale: 4 }),
	priceMedian: numeric("price_median", { mode: "number", precision: 12, scale: 4 }),
	stdDev: numeric("std_dev", { mode: "number", precision: 12, scale: 4 }),
	cvPct: numeric("cv_pct", { mode: "number", precision: 8, scale: 2 }),
	uniqueSources: integer("unique_sources"),
	referencePrice: numeric("reference_price", { mode: "number", precision: 12, scale: 4 }),
	referenceMethod: text("reference_method"),
	measureUnit: text("measure_unit"),
	isCompliant: boolean("is_compliant").default(false).notNull(),
	nonComplianceReasons: text("non_compliance_reasons").array().default([""]).notNull(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	justificationLowSample: text("justification_low_sample"),
	justificationMethod: text("justification_method"),
	justificationOutlierCriteria: text("justification_outlier_criteria"),
	justificationOutOfPeriod: text("justification_out_of_period"),
	manualSelection: boolean("manual_selection").default(false).notNull(),
	quantityEstimateItemId: uuid("quantity_estimate_item_id"),
})

export const priceResearchSampleInProcurement = procurement.table("price_research_sample", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	researchItemId: uuid("research_item_id").notNull(),
	sampleType: text("sample_type").notNull(),
	similarity: numeric({ mode: "number", precision: 4, scale: 3 }),
	priceSampleId: uuid("price_sample_id").notNull(),
	convertedPrice: numeric("converted_price", { mode: "number", precision: 14, scale: 6 }),
	contentInUnit: numeric("content_in_unit", { mode: "number", precision: 14, scale: 6 }),
	conversion: text(),
	art5Parameter: text("art5_parameter").default("I").notNull(),
})

export const priceSampleInProcurement = procurement.table("price_sample", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	idCompra: text("id_compra").notNull(),
	idItemCompra: integer("id_item_compra"),
	descricaoItem: text("descricao_item"),
	precoUnitario: numeric("preco_unitario", { mode: "number", precision: 12, scale: 4 }),
	capacidadeUnidadeFornecimento: numeric("capacidade_unidade_fornecimento", { mode: "number", precision: 12, scale: 4 }),
	siglaUnidadeFornecimento: text("sigla_unidade_fornecimento"),
	siglaUnidadeMedida: text("sigla_unidade_medida"),
	quantidade: numeric({ mode: "number", precision: 14, scale: 4 }),
	codigoUasg: text("codigo_uasg"),
	nomeUasg: text("nome_uasg"),
	municipio: text(),
	estado: text(),
	esfera: text(),
	marca: text(),
	normalizedPrice: numeric("normalized_price", { mode: "number", precision: 12, scale: 4 }),
	referenceDate: date("reference_date"),
	fingerprint: text().generatedAlwaysAs(
		sql`sisub.price_sample_fingerprint(id_compra, id_item_compra, descricao_item, preco_unitario, capacidade_unidade_fornecimento, sigla_unidade_fornecimento, sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg, municipio, estado, esfera, marca, normalized_price, reference_date)`
	),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	niFornecedor: text("ni_fornecedor"),
	nomeFornecedor: text("nome_fornecedor"),
})

export const arpInProcurement = procurement.table("arp", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: integer("unit_id").notNull(),
	numeroAta: text("numero_ata").notNull(),
	anoAta: text("ano_ata"),
	uasgGerenciadora: text("uasg_gerenciadora").notNull(),
	nomeUasgGerenciadora: text("nome_uasg_gerenciadora"),
	objeto: text(),
	dataVigenciaInicio: date("data_vigencia_inicio"),
	dataVigenciaFim: date("data_vigencia_fim"),
	statusAta: text("status_ata"),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "string" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	acquisitionId: uuid("acquisition_id"),
	source: text().default("compras_gov").notNull(),
	quantityEstimateId: uuid("quantity_estimate_id"),
})

export const arpItemInProcurement = procurement.table("arp_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	arpId: uuid("arp_id").notNull(),
	numeroItem: integer("numero_item"),
	catmatItemCodigo: integer("catmat_item_codigo"),
	descricaoItem: text("descricao_item"),
	niFornecedor: text("ni_fornecedor"),
	nomeFornecedor: text("nome_fornecedor"),
	valorUnitario: numeric("valor_unitario", { mode: "number", precision: 12, scale: 4 }),
	quantidadeHomologada: numeric("quantidade_homologada", { mode: "number", precision: 14, scale: 4 }),
	medidaCatmat: text("medida_catmat"),
	quantidadeEmpenhada: numeric("quantidade_empenhada", { mode: "number", precision: 14, scale: 4 }).default(0),
	saldoEmpenho: numeric("saldo_empenho", { mode: "number", precision: 14, scale: 4 }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	source: text().default("compras_gov").notNull(),
	quantityEstimateItemId: uuid("quantity_estimate_item_id"),
})

export const segmentInProcurement = procurement.table("segment", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: integer("unit_id").notNull(),
	name: text().notNull(),
	description: text(),
	plannedMonth: smallint("planned_month"),
	leadTimeMonths: smallint("lead_time_months").default(5).notNull(),
	validityMonths: smallint("validity_months").default(12).notNull(),
	pcaIdentifier: text("pca_identifier"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
})

export const segmentRuleInProcurement = procurement.table("segment_rule", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	segmentId: uuid("segment_id").notNull(),
	mode: text().notNull(),
	folderId: uuid("folder_id"),
	purchaseItemId: uuid("purchase_item_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
})

/**
 * Tripwire: quando o pull trouxer `priceResearchInProcurement`, este tipo deixa de satisfazer
 * `true` e o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot3Tripwire = AssertTrue<"priceResearchInProcurement" extends keyof typeof generated ? false : true>
