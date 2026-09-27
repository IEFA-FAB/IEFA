/**
 * TODO(db:types): tabelas-ponte do rename 20260927010000, na forma que `db:drizzle:pull` vai gerar.
 *
 * Mesma ideia de `src/pending-annex-naming.ts`: o código usa só os nomes novos antes do pull.
 * O barrel (`sisub.ts`) exporta estes objetos no lugar dos gerados, com os mesmos identificadores
 * que o pull produz (`kitchenDemandForecastInProcurement`, `.procurementListId`...), e sem as
 * colunas antigas que o expand mantém só para o código em produção. Só colunas: índices, FKs e
 * CHECKs não entram nas queries.
 *
 * `relations.ts` (o `db.query … with`) continua apontando para os objetos gerados, que ainda usam
 * as colunas antigas; por isso nenhuma relational query atravessa estas tabelas pelos campos
 * renomeados — os joins são explícitos.
 *
 * Depois de aplicar 20260927010000 e rodar `db:drizzle:pull`, o tripwire do fim quebra o
 * typecheck: apague este arquivo e o bloco de reexport dele em `sisub.ts`.
 */
import { boolean, date, integer, numeric, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type * as generated from "./schema"
import { procurement } from "./schema"

export const kitchenDemandForecastInProcurement = procurement.table("kitchen_demand_forecast", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kitchenId: integer("kitchen_id").notNull(),
	title: text().notNull(),
	notes: text(),
	status: text().default("pending").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
	reviewedBy: uuid("reviewed_by"),
})

export const kitchenDemandForecastSelectionInProcurement = procurement.table("kitchen_demand_forecast_selection", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	forecastId: uuid("forecast_id").notNull(),
	templateId: uuid("template_id").notNull(),
	repetitions: integer().default(1).notNull(),
})

export const kitchenDemandForecastImportInProcurement = procurement.table("kitchen_demand_forecast_import", {
	forecastId: uuid("forecast_id").notNull(),
	listId: uuid("list_id").notNull(),
	importedBy: uuid("imported_by"),
	importedAt: timestamp("imported_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
})

export const procurementArpInProcurement = procurement.table("procurement_arp", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: integer("unit_id").notNull(),
	procurementListId: uuid("procurement_list_id"),
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
})

export const procurementArpItemInProcurement = procurement.table("procurement_arp_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	arpId: uuid("arp_id").notNull(),
	procurementListItemId: uuid("procurement_list_item_id"),
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
})

export const procurementPesquisaPrecoInProcurement = procurement.table("procurement_pesquisa_preco", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	procurementListId: uuid("procurement_list_id"),
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
})

export const procurementPesquisaPrecoItemInProcurement = procurement.table("procurement_pesquisa_preco_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	researchId: uuid("research_id").notNull(),
	procurementListItemId: uuid("procurement_list_item_id"),
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
})

/**
 * Tripwire: quando o pull trouxer `kitchenDemandForecastInProcurement`, este tipo deixa de
 * satisfazer `true` e o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingAnnexNamingTripwire = AssertTrue<"kitchenDemandForecastInProcurement" extends keyof typeof generated ? false : true>
