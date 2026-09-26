import { pgEnum, pgSchema, index, foreignKey, unique, uuid, varchar, text, timestamp, integer, boolean, bigserial, numeric, bigint, check, jsonb, uniqueIndex, date, smallint, pgPolicy, char, doublePrecision, json, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const accessControl = pgSchema("access_control");
export const finance = pgSchema("finance");
export const core = pgSchema("core");
export const comprasGovIntegration = pgSchema("compras_gov_integration");
export const kitchen = pgSchema("kitchen");
export const inventory = pgSchema("inventory");
export const gs1Integration = pgSchema("gs1_integration");
export const nutritionReference = pgSchema("nutrition_reference");
export const procurement = pgSchema("procurement");
export const siafiIntegration = pgSchema("siafi_integration");
export const sisub = pgSchema("sisub");
// Patched (patch-drizzle-pull.ts): cross-schema/custom-type refs the pull leaves dangling.
export const usersInAuth = pgSchema("auth").table("users", { id: uuid().primaryKey().notNull() });
export const userLevels = pgEnum("userLevels", ['user', 'admin', 'superadmin']);
export const kitchenTypeInSisub = sisub.enum("kitchen_type", ['consumption', 'production'])
export const unitTypeInSisub = sisub.enum("unit_type", ['consumption', 'purchase'])


export const profilesAdminInAccessControl = accessControl.table("profiles_admin", {
	id: uuid().notNull(),
	saram: varchar({ length: 7 }).notNull(),
	name: text(),
	email: text().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	role: userLevels("role"),
	om: text(),
}, (table) => [
	index("idx_profiles_saram").using("btree", table.saram.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.id],
			foreignColumns: [usersInAuth.id],
			name: "profiles_id_fkey"
		}).onDelete("cascade"),
	unique("profiles_admin_id_key").on(table.id),
	unique("profiles_saram_key").on(table.saram),
	unique("profiles_admin_email_key").on(table.email),
]);

export const comprasServicoGrupoInComprasGovIntegration = comprasGovIntegration.table("compras_servico_grupo", {
	codigoGrupo: integer("codigo_grupo").primaryKey().notNull(),
	codigoDivisao: integer("codigo_divisao").notNull(),
	nomeGrupo: text("nome_grupo").notNull(),
	statusGrupo: boolean("status_grupo").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.codigoDivisao],
			foreignColumns: [comprasServicoDivisaoInComprasGovIntegration.codigoDivisao],
			name: "compras_servico_grupo_codigo_divisao_fkey"
		}),
]);

export const comprasServicoClasseInComprasGovIntegration = comprasGovIntegration.table("compras_servico_classe", {
	codigoClasse: integer("codigo_classe").primaryKey().notNull(),
	codigoGrupo: integer("codigo_grupo").notNull(),
	nomeClasse: text("nome_classe").notNull(),
	statusGrupo: boolean("status_grupo").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.codigoGrupo],
			foreignColumns: [comprasServicoGrupoInComprasGovIntegration.codigoGrupo],
			name: "compras_servico_classe_codigo_grupo_fkey"
		}),
]);

export const comprasServicoSubclasseInComprasGovIntegration = comprasGovIntegration.table("compras_servico_subclasse", {
	codigoSubclasse: integer("codigo_subclasse").primaryKey().notNull(),
	codigoClasse: integer("codigo_classe").notNull(),
	nomeSubclasse: text("nome_subclasse").notNull(),
	statusSubclasse: boolean("status_subclasse").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const comprasServicoItemInComprasGovIntegration = comprasGovIntegration.table("compras_servico_item", {
	codigoServico: integer("codigo_servico").primaryKey().notNull(),
	codigoSubclasse: integer("codigo_subclasse"),
	nomeServico: text("nome_servico").notNull(),
	codigoCpc: integer("codigo_cpc"),
	exclusivoCentralCompras: boolean("exclusivo_central_compras"),
	statusServico: boolean("status_servico").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	firstDeactivationDetectedAt: timestamp("first_deactivation_detected_at", { withTimezone: true, mode: 'string' }),
});

export const comprasMaterialPdmInComprasGovIntegration = comprasGovIntegration.table("compras_material_pdm", {
	codigoPdm: integer("codigo_pdm").primaryKey().notNull(),
	codigoClasse: integer("codigo_classe").notNull(),
	nomePdm: text("nome_pdm").notNull(),
	statusPdm: boolean("status_pdm").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.codigoClasse],
			foreignColumns: [comprasMaterialClasseInComprasGovIntegration.codigoClasse],
			name: "compras_material_pdm_codigo_classe_fkey"
		}),
]);

export const comprasMaterialItemInComprasGovIntegration = comprasGovIntegration.table("compras_material_item", {
	codigoItem: integer("codigo_item").primaryKey().notNull(),
	codigoPdm: integer("codigo_pdm"),
	descricaoItem: text("descricao_item").notNull(),
	statusItem: boolean("status_item").default(true).notNull(),
	itemSustentavel: boolean("item_sustentavel"),
	codigoNcm: text("codigo_ncm"),
	descricaoNcm: text("descricao_ncm"),
	aplicaMargemPreferencia: boolean("aplica_margem_preferencia"),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	firstDeactivationDetectedAt: timestamp("first_deactivation_detected_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_compras_material_item_descricao_trgm").using("gin", table.descricaoItem.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_compras_material_item_pdm").using("btree", table.codigoPdm.asc().nullsLast().op("int4_ops")),
]);

export const comprasMaterialUnidadeFornecimentoInComprasGovIntegration = comprasGovIntegration.table("compras_material_unidade_fornecimento", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	codigoPdm: integer("codigo_pdm").notNull(),
	numeroSequencialUnidadeFornecimento: integer("numero_sequencial_unidade_fornecimento"),
	siglaUnidadeFornecimento: text("sigla_unidade_fornecimento"),
	nomeUnidadeFornecimento: text("nome_unidade_fornecimento"),
	descricaoUnidadeFornecimento: text("descricao_unidade_fornecimento"),
	siglaUnidadeMedida: text("sigla_unidade_medida"),
	capacidadeUnidadeFornecimento: numeric("capacidade_unidade_fornecimento", { mode: "number", precision: 12, scale: 4 }),
	statusUnidadeFornecimentoPdm: boolean("status_unidade_fornecimento_pdm").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_material_unidade_forn_codigo_pdm_numero_sequencial__key").on(table.codigoPdm, table.numeroSequencialUnidadeFornecimento),
]);

export const comprasServicoSecaoInComprasGovIntegration = comprasGovIntegration.table("compras_servico_secao", {
	codigoSecao: integer("codigo_secao").primaryKey().notNull(),
	nomeSecao: text("nome_secao").notNull(),
	statusSecao: boolean("status_secao").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const comprasServicoDivisaoInComprasGovIntegration = comprasGovIntegration.table("compras_servico_divisao", {
	codigoDivisao: integer("codigo_divisao").primaryKey().notNull(),
	codigoSecao: integer("codigo_secao").notNull(),
	nomeDivisao: text("nome_divisao").notNull(),
	statusDivisao: boolean("status_divisao").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.codigoSecao],
			foreignColumns: [comprasServicoSecaoInComprasGovIntegration.codigoSecao],
			name: "compras_servico_divisao_codigo_secao_fkey"
		}),
]);

export const comprasServicoUnidadeMedidaInComprasGovIntegration = comprasGovIntegration.table("compras_servico_unidade_medida", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	codigoServico: integer("codigo_servico").notNull(),
	siglaUnidadeMedida: text("sigla_unidade_medida").notNull(),
	nomeUnidadeMedida: text("nome_unidade_medida"),
	statusUnidadeMedida: boolean("status_unidade_medida").default(true).notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_servico_unidade_medid_codigo_servico_sigla_unidade__key").on(table.codigoServico, table.siglaUnidadeMedida),
]);

export const integrationSyncStepInComprasGovIntegration = comprasGovIntegration.table("integration_sync_step", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	syncId: bigint("sync_id", { mode: "number" }).notNull(),
	stepName: text("step_name").notNull(),
	status: text().default('pending').notNull(),
	currentPage: integer("current_page").default(0).notNull(),
	totalPages: integer("total_pages"),
	recordsUpserted: integer("records_upserted").default(0).notNull(),
	recordsDeactivated: integer("records_deactivated").default(0).notNull(),
	errorMessage: text("error_message"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.syncId],
			foreignColumns: [integrationSyncLogInComprasGovIntegration.id],
			name: "compras_sync_step_sync_id_fkey"
		}).onDelete("cascade"),
	unique("compras_sync_step_sync_id_step_name_key").on(table.syncId, table.stepName),
]);

export const nfeDocumentInInventory = inventory.table("nfe_document", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accessKey: text("access_key").notNull(),
	supplierCnpj: text("supplier_cnpj"),
	supplierName: text("supplier_name"),
	destCnpj: text("dest_cnpj"),
	issuedAt: timestamp("issued_at", { withTimezone: true, mode: 'string' }),
	totalValue: numeric("total_value", { mode: "number", precision: 14, scale: 2 }),
	xml: text(),
	status: text().default('imported').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	destinationConfirmed: boolean("destination_confirmed").default(false).notNull(),
	supplierCpf: text("supplier_cpf"),
	destCpf: text("dest_cpf"),
	purpose: text(),
	referencedKeys: text("referenced_keys").array().default([""]).notNull(),
	protocolNumber: text("protocol_number"),
	authenticity: jsonb(),
	situationCheckedAt: timestamp("situation_checked_at", { withTimezone: true, mode: 'string' }),
	situationCheckedBy: uuid("situation_checked_by"),
	situationResult: text("situation_result"),
	cancelledReason: text("cancelled_reason"),
}, (table) => [
	index("nfe_document_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("nfe_document_supplier_idx").using("btree", table.supplierCnpj.asc().nullsLast().op("text_ops")),
	index("nfe_document_unit_idx").using("btree", table.unitId.asc().nullsLast().op("int8_ops"), table.createdAt.desc().nullsFirst().op("int8_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "nfe_document_created_by_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "nfe_document_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.situationCheckedBy],
			foreignColumns: [usersInAuth.id],
			name: "nfe_document_situation_checked_by_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "nfe_document_unit_id_fkey"
		}),
	unique("nfe_document_access_key_key").on(table.accessKey),
	check("nfe_document_access_key_check", sql`access_key ~ '^[0-9A-Z]{44}$'::text`),
	check("nfe_document_situation_result_check", sql`situation_result = ANY (ARRAY['authorized'::text, 'cancelled'::text, 'unknown'::text])`),
	check("nfe_document_status_check", sql`status = ANY (ARRAY['announced'::text, 'imported'::text, 'available'::text, 'matched'::text, 'received'::text, 'divergent'::text, 'cancelled'::text, 'refused'::text])`),
	check("nfe_document_supplier_cnpj_check", sql`(supplier_cnpj IS NULL) OR (supplier_cnpj ~ '^[0-9]{14}$'::text)`),
]);

export const gtinInGs1Integration = gs1Integration.table("gtin", {
	gtin: text().primaryKey().notNull(),
	description: text(),
	brand: text(),
	netContent: numeric("net_content", { mode: "number", precision: 12, scale: 4 }),
	netContentUnit: text("net_content_unit"),
	ncm: text(),
	gpcBrickCode: text("gpc_brick_code"),
	parentGtin: text("parent_gtin"),
	unitsPerParent: integer("units_per_parent"),
	source: text().notNull(),
	rawPayload: jsonb("raw_payload"),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("gtin_gpc_brick_idx").using("btree", table.gpcBrickCode.asc().nullsLast().op("text_ops")).where(sql`(gpc_brick_code IS NOT NULL)`),
	index("gtin_ncm_idx").using("btree", table.ncm.asc().nullsLast().op("text_ops")).where(sql`(ncm IS NOT NULL)`),
	index("gtin_parent_idx").using("btree", table.parentGtin.asc().nullsLast().op("text_ops")).where(sql`(parent_gtin IS NOT NULL)`),
	foreignKey({
			columns: [table.netContentUnit],
			foreignColumns: [measureUnitInCore.code],
			name: "gtin_net_content_unit_fkey"
		}),
	foreignKey({
			columns: [table.parentGtin],
			foreignColumns: [table.gtin],
			name: "gtin_parent_gtin_fkey"
		}),
	check("gtin_gtin_check", sql`gtin ~ '^[0-9]{14}$'::text`),
	check("gtin_net_content_check", sql`(net_content IS NULL) OR (net_content > (0)::numeric)`),
	check("gtin_not_own_parent", sql`parent_gtin IS DISTINCT FROM gtin`),
	check("gtin_parent_pair", sql`(parent_gtin IS NULL) = (units_per_parent IS NULL)`),
	check("gtin_source_check", sql`source = ANY (ARRAY['nfe'::text, 'vbg'::text, 'manual'::text])`),
	check("gtin_units_per_parent_check", sql`(units_per_parent IS NULL) OR (units_per_parent > 0)`),
]);

export const supplierProductMapInGs1Integration = gs1Integration.table("supplier_product_map", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	supplierCnpj: text("supplier_cnpj").notNull(),
	supplierCode: text("supplier_code").notNull(),
	purchaseItemId: uuid("purchase_item_id"),
	ingredientItemId: uuid("ingredient_item_id"),
	confidence: text().default('manual').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("supplier_product_map_ingredient_item_idx").using("btree", table.ingredientItemId.asc().nullsLast().op("uuid_ops")),
	index("supplier_product_map_purchase_item_idx").using("btree", table.purchaseItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ingredientItemId],
			foreignColumns: [ingredientItemInKitchen.id],
			name: "supplier_product_map_ingredient_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "supplier_product_map_purchase_item_id_fkey"
		}).onDelete("cascade"),
	unique("supplier_product_map_key").on(table.supplierCnpj, table.supplierCode),
	check("supplier_product_map_confidence_check", sql`confidence = ANY (ARRAY['manual'::text, 'auto'::text])`),
	check("supplier_product_map_supplier_cnpj_check", sql`supplier_cnpj ~ '^[0-9]{14}$'::text`),
	check("supplier_product_map_supplier_code_check", sql`supplier_code <> ''::text`),
	check("supplier_product_map_target", sql`num_nonnulls(purchase_item_id, ingredient_item_id) >= 1`),
]);

export const sourceReleaseInNutritionReference = nutritionReference.table("source_release", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceId: text("source_id").notNull(),
	versionLabel: text("version_label").notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	upstreamUrl: text("upstream_url"),
	downloadUrl: text("download_url"),
	etag: text(),
	lastModified: text("last_modified"),
	checksumSha256: text("checksum_sha256"),
	status: text().default('active').notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }),
	importedAt: timestamp("imported_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("nutrition_source_release_source_version_key").using("btree", table.sourceId.asc().nullsLast().op("text_ops"), table.versionLabel.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sourceInNutritionReference.id],
			name: "source_release_source_id_fkey"
		}).onDelete("cascade"),
	check("nutrition_source_release_status_check", sql`status = ANY (ARRAY['active'::text, 'superseded'::text, 'blocked'::text, 'failed'::text])`),
]);

export const foodItemInNutritionReference = nutritionReference.table("food_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceId: text("source_id").notNull(),
	externalCode: text("external_code").notNull(),
	currentRevisionId: uuid("current_revision_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	// FK "food_item_current_revision_id_fkey" omitida (patch-drizzle-pull.ts): ciclo com foodItemRevisionInNutritionReference faria o TS inferir any. Existe no banco; a relação segue em relations.ts.
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sourceInNutritionReference.id],
			name: "food_item_source_id_fkey"
		}).onDelete("cascade"),
	unique("food_item_source_id_external_code_key").on(table.sourceId, table.externalCode),
]);

export const procurementArpItemInProcurement = procurement.table("procurement_arp_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	arpId: uuid("arp_id").notNull(),
	ataItemId: uuid("ata_item_id"),
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
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_arp_item_arp").using("btree", table.arpId.asc().nullsLast().op("uuid_ops")),
	index("idx_arp_item_ata_item").using("btree", table.ataItemId.asc().nullsLast().op("uuid_ops")),
	index("idx_arp_item_catmat").using("btree", table.catmatItemCodigo.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.arpId],
			foreignColumns: [procurementArpInProcurement.id],
			name: "procurement_arp_item_arp_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ataItemId],
			foreignColumns: [procurementListItemInProcurement.id],
			name: "procurement_arp_item_ata_item_id_fkey"
		}).onDelete("set null"),
]);

export const userDataInCore = core.table("user_data", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	email: text().notNull(),
	nrOrdem: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	defaultMessHallId: bigint("default_mess_hall_id", { mode: "number" }),
}, (table) => [
	foreignKey({
			columns: [table.defaultMessHallId],
			foreignColumns: [messHallsInKitchen.id],
			name: "user_data_default_mess_hall_id_fkey"
		}),
	foreignKey({
			columns: [table.id],
			foreignColumns: [usersInAuth.id],
			name: "user_email_id_fkey"
		}),
	unique("user_email_email_key").on(table.email),
]);

export const foodItemRevisionInNutritionReference = nutritionReference.table("food_item_revision", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	foodItemId: uuid("food_item_id").notNull(),
	sourceReleaseId: uuid("source_release_id").notNull(),
	displayName: text("display_name").notNull(),
	originalName: text("original_name"),
	groupCode: text("group_code"),
	groupName: text("group_name"),
	foodType: text("food_type"),
	brandName: text("brand_name"),
	preparationState: text("preparation_state"),
	scientificName: text("scientific_name"),
	baseQuantity: numeric("base_quantity", { mode: "number" }).default(100).notNull(),
	baseUnit: text("base_unit").default('g').notNull(),
	ediblePortionFactor: numeric("edible_portion_factor", { mode: "number" }),
	normalizedName: text("normalized_name").notNull(),
	contentHash: text("content_hash").notNull(),
	raw: jsonb().default({}).notNull(),
	isCurrent: boolean("is_current").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("nutrition_food_revision_current_idx").using("btree", table.foodItemId.asc().nullsLast().op("uuid_ops")).where(sql`is_current`),
	index("nutrition_food_revision_search_idx").using("gin", sql`to_tsvector('portuguese'::regconfig, ((((COALESCE(normalized_na`),
	foreignKey({
			columns: [table.foodItemId],
			foreignColumns: [foodItemInNutritionReference.id],
			name: "food_item_revision_food_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceReleaseId],
			foreignColumns: [sourceReleaseInNutritionReference.id],
			name: "food_item_revision_source_release_id_fkey"
		}).onDelete("restrict"),
	unique("food_item_revision_food_item_id_source_release_id_content_h_key").on(table.foodItemId, table.sourceReleaseId, table.contentHash),
]);

export const nutrientComponentInNutritionReference = nutritionReference.table("nutrient_component", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceId: text("source_id").notNull(),
	externalCode: text("external_code").notNull(),
	name: text().notNull(),
	unit: text(),
	infoodsTag: text("infoods_tag"),
	raw: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [sourceInNutritionReference.id],
			name: "nutrient_component_source_id_fkey"
		}).onDelete("cascade"),
	unique("nutrient_component_source_id_external_code_key").on(table.sourceId, table.externalCode),
]);

export const nutrientComponentMappingInNutritionReference = nutritionReference.table("nutrient_component_mapping", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	componentId: uuid("component_id").notNull(),
	nutrientId: uuid("nutrient_id").notNull(),
	conversionMultiplier: numeric("conversion_multiplier", { mode: "number" }).default(1).notNull(),
	conversionOffset: numeric("conversion_offset", { mode: "number" }).default(0).notNull(),
	isPreferred: boolean("is_preferred").default(true).notNull(),
	confidence: text().default('seeded').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.componentId],
			foreignColumns: [nutrientComponentInNutritionReference.id],
			name: "nutrient_component_mapping_component_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.nutrientId],
			foreignColumns: [nutrientInKitchen.id],
			name: "nutrient_component_mapping_nutrient_id_fkey"
		}).onDelete("cascade"),
	unique("nutrient_component_mapping_component_id_nutrient_id_key").on(table.componentId, table.nutrientId),
	check("nutrition_component_mapping_confidence_check", sql`confidence = ANY (ARRAY['seeded'::text, 'reviewed'::text, 'inferred'::text])`),
]);

export const foodNutrientValueInNutritionReference = nutritionReference.table("food_nutrient_value", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	foodRevisionId: uuid("food_revision_id").notNull(),
	componentId: uuid("component_id").notNull(),
	value: numeric({ mode: "number" }),
	valueKind: text("value_kind").default('measured').notNull(),
	rawValue: text("raw_value"),
	raw: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.componentId],
			foreignColumns: [nutrientComponentInNutritionReference.id],
			name: "food_nutrient_value_component_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.foodRevisionId],
			foreignColumns: [foodItemRevisionInNutritionReference.id],
			name: "food_nutrient_value_food_revision_id_fkey"
		}).onDelete("cascade"),
	unique("food_nutrient_value_food_revision_id_component_id_key").on(table.foodRevisionId, table.componentId),
	check("nutrition_food_nutrient_value_kind_check", sql`value_kind = ANY (ARRAY['measured'::text, 'calculated'::text, 'assumed'::text, 'trace'::text, 'not_analyzed'::text, 'missing'::text])`),
]);

export const supplyOrderInProcurement = procurement.table("supply_order", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	empenhoId: uuid("empenho_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	number: text(),
	sentAt: date("sent_at"),
	expectedDelivery: date("expected_delivery"),
	status: text().default('draft').notNull(),
	sicafStatus: text("sicaf_status"),
	sicafAckBy: uuid("sicaf_ack_by"),
	notes: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("supply_order_empenho_idx").using("btree", table.empenhoId.asc().nullsLast().op("uuid_ops")),
	index("supply_order_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.status.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "supply_order_created_by_fkey"
		}),
	foreignKey({
			columns: [table.empenhoId],
			foreignColumns: [empenhoInFinance.id],
			name: "supply_order_empenho_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "supply_order_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.sicafAckBy],
			foreignColumns: [usersInAuth.id],
			name: "supply_order_sicaf_ack_by_fkey"
		}),
	check("supply_order_status_check", sql`status = ANY (ARRAY['draft'::text, 'sent'::text, 'partially_received'::text, 'received'::text, 'cancelled'::text, 'expired'::text])`),
]);

export const supplyOrderItemInProcurement = procurement.table("supply_order_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	supplyOrderId: uuid("supply_order_id").notNull(),
	arpItemId: uuid("arp_item_id"),
	purchaseItemId: uuid("purchase_item_id"),
	orderedQty: numeric("ordered_qty", { mode: "number", precision: 14, scale: 4 }).notNull(),
	unitPrice: numeric("unit_price", { mode: "number", precision: 12, scale: 4 }),
}, (table) => [
	index("supply_order_item_order_idx").using("btree", table.supplyOrderId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.arpItemId],
			foreignColumns: [procurementArpItemInProcurement.id],
			name: "supply_order_item_arp_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "supply_order_item_purchase_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.supplyOrderId],
			foreignColumns: [supplyOrderInProcurement.id],
			name: "supply_order_item_supply_order_id_fkey"
		}).onDelete("cascade"),
	check("supply_order_item_ordered_qty_check", sql`ordered_qty > (0)::numeric`),
]);

export const procurementPesquisaPrecoInProcurement = procurement.table("procurement_pesquisa_preco", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ataId: uuid("ata_id"),
	referenceMethod: text("reference_method").default('median').notNull(),
	periodMonths: smallint("period_months").default(12),
	similarityThreshold: numeric("similarity_threshold", { mode: "number", precision: 4, scale: 3 }),
	filterEstado: text("filter_estado"),
	filterUasgCode: text("filter_uasg_code"),
	filterMunicipioCode: integer("filter_municipio_code"),
	totalItems: integer("total_items").default(0).notNull(),
	itemsWithPrice: integer("items_with_price").default(0).notNull(),
	itemsWithoutCatmat: integer("items_without_catmat").default(0).notNull(),
	nonCompliantItems: integer("non_compliant_items").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	idempotencyKey: text("idempotency_key"),
}, (table) => [
	index("idx_pesquisa_preco_ata").using("btree", table.ataId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_pesquisa_preco_pending").using("btree", table.ataId.asc().nullsLast().op("uuid_ops")).where(sql`(ata_id IS NULL)`),
	uniqueIndex("uq_pesquisa_preco_idempotency").using("btree", table.idempotencyKey.asc().nullsLast().op("text_ops")).where(sql`(idempotency_key IS NOT NULL)`),
	foreignKey({
			columns: [table.ataId],
			foreignColumns: [procurementListInProcurement.id],
			name: "procurement_pesquisa_preco_ata_id_fkey"
		}).onDelete("cascade"),
	check("procurement_pesquisa_preco_reference_method_check", sql`reference_method = ANY (ARRAY['median'::text, 'mean'::text, 'lowest'::text])`),
]);

export const procurementListSnapshotSelectionInProcurement = procurement.table("procurement_list_snapshot_selection", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	listId: uuid("list_id").notNull(),
	originTemplateId: uuid("origin_template_id"),
	templateName: text("template_name"),
	templateType: text("template_type"),
	kitchenId: integer("kitchen_id"),
	kitchenName: text("kitchen_name"),
	repetitions: integer().default(1).notNull(),
	snapshotSource: text("snapshot_source").default('native').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_proc_snapshot_selection_list_id").using("btree", table.listId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.listId],
			foreignColumns: [procurementListInProcurement.id],
			name: "procurement_list_snapshot_selection_list_id_fkey"
		}).onDelete("cascade"),
	check("procurement_list_snapshot_selection_snapshot_source_check", sql`snapshot_source = ANY (ARRAY['native'::text, 'backfill'::text])`),
]);

export const procurementListSnapshotComponentInProcurement = procurement.table("procurement_list_snapshot_component", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	listId: uuid("list_id").notNull(),
	ingredientId: uuid("ingredient_id"),
	ingredientName: text("ingredient_name").notNull(),
	folderDescription: text("folder_description"),
	measureUnit: text("measure_unit"),
	totalQuantity: numeric("total_quantity", { mode: "number", precision: 14, scale: 4 }).notNull(),
	purchaseItemId: uuid("purchase_item_id"),
	purchaseItemDescription: text("purchase_item_description"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	purchaseQuantity: numeric("purchase_quantity", { mode: "number", precision: 14, scale: 4 }),
	catmatItemCodigo: integer("catmat_item_codigo"),
	unitPrice: numeric("unit_price", { mode: "number", precision: 12, scale: 4 }),
	snapshotSource: text("snapshot_source").default('native').notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	maxMarginPercent: smallint("max_margin_percent"),
	maxQuantity: numeric("max_quantity", { mode: "number", precision: 14, scale: 4 }),
	deliveryCycle: text("delivery_cycle"),
	minOrderQuantity: numeric("min_order_quantity", { mode: "number", precision: 14, scale: 4 }),
}, (table) => [
	index("idx_proc_snapshot_component_list_id").using("btree", table.listId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.listId],
			foreignColumns: [procurementListInProcurement.id],
			name: "procurement_list_snapshot_component_list_id_fkey"
		}).onDelete("cascade"),
	check("procurement_list_snapshot_component_snapshot_source_check", sql`snapshot_source = ANY (ARRAY['native'::text, 'backfill'::text])`),
]);

export const procurementPesquisaPrecoItemInProcurement = procurement.table("procurement_pesquisa_preco_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	researchId: uuid("research_id").notNull(),
	ataItemId: uuid("ata_item_id"),
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
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_pesquisa_preco_item_ata_item").using("btree", table.ataItemId.asc().nullsLast().op("uuid_ops")),
	index("idx_pesquisa_preco_item_research").using("btree", table.researchId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ataItemId],
			foreignColumns: [procurementListItemInProcurement.id],
			name: "procurement_pesquisa_preco_item_ata_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.researchId],
			foreignColumns: [procurementPesquisaPrecoInProcurement.id],
			name: "procurement_pesquisa_preco_item_research_id_fkey"
		}).onDelete("cascade"),
]);

export const nfeItemInInventory = inventory.table("nfe_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nfeDocumentId: uuid("nfe_document_id").notNull(),
	nItem: smallint("n_item").notNull(),
	supplierCode: text("supplier_code"),
	description: text(),
	gtin: text(),
	gtinTrib: text("gtin_trib"),
	ncm: text(),
	cest: text(),
	cfop: text(),
	commercialUnit: text("commercial_unit"),
	commercialQty: numeric("commercial_qty", { mode: "number", precision: 14, scale: 4 }),
	unitPrice: numeric("unit_price", { mode: "number", precision: 12, scale: 4 }),
	lotCode: text("lot_code"),
	lotQty: numeric("lot_qty", { mode: "number", precision: 14, scale: 4 }),
	mfgDate: date("mfg_date"),
	expiryDate: date("expiry_date"),
	matchStatus: text("match_status").default('pending').notNull(),
	ingredientItemId: uuid("ingredient_item_id"),
	purchaseItemId: uuid("purchase_item_id"),
	ingredientId: uuid("ingredient_id"),
	matchedQtyBase: numeric("matched_qty_base", { mode: "number", precision: 14, scale: 4 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	taxableUnit: text("taxable_unit"),
	taxableQty: numeric("taxable_qty", { mode: "number", precision: 14, scale: 4 }),
	productValue: numeric("product_value", { mode: "number", precision: 14, scale: 2 }),
	discountValue: numeric("discount_value", { mode: "number", precision: 14, scale: 2 }),
	freightValue: numeric("freight_value", { mode: "number", precision: 14, scale: 2 }),
	insuranceValue: numeric("insurance_value", { mode: "number", precision: 14, scale: 2 }),
	otherExpensesValue: numeric("other_expenses_value", { mode: "number", precision: 14, scale: 2 }),
	ipiValue: numeric("ipi_value", { mode: "number", precision: 14, scale: 2 }),
	icmsStValue: numeric("icms_st_value", { mode: "number", precision: 14, scale: 2 }),
	fcpStValue: numeric("fcp_st_value", { mode: "number", precision: 14, scale: 2 }),
	acquisitionCost: numeric("acquisition_cost", { mode: "number", precision: 14, scale: 2 }),
}, (table) => [
	index("nfe_item_gtin_idx").using("btree", table.gtin.asc().nullsLast().op("text_ops")).where(sql`(gtin IS NOT NULL)`),
	index("nfe_item_match_status_idx").using("btree", table.matchStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "nfe_item_ingredient_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ingredientItemId],
			foreignColumns: [ingredientItemInKitchen.id],
			name: "nfe_item_ingredient_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.nfeDocumentId],
			foreignColumns: [nfeDocumentInInventory.id],
			name: "nfe_item_nfe_document_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "nfe_item_purchase_item_id_fkey"
		}).onDelete("set null"),
	unique("nfe_item_document_n_item_key").on(table.nfeDocumentId, table.nItem),
	check("nfe_item_gtin_check", sql`(gtin IS NULL) OR (gtin ~ '^[0-9]{14}$'::text)`),
	check("nfe_item_gtin_trib_check", sql`(gtin_trib IS NULL) OR (gtin_trib ~ '^[0-9]{14}$'::text)`),
	check("nfe_item_match_status_check", sql`match_status = ANY (ARRAY['pending'::text, 'matched'::text, 'review'::text, 'no_match'::text])`),
]);

export const procurementPesquisaPrecoAmostraInProcurement = procurement.table("procurement_pesquisa_preco_amostra", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	researchItemId: uuid("research_item_id").notNull(),
	sampleType: text("sample_type").notNull(),
	similarity: numeric({ mode: "number", precision: 4, scale: 3 }),
	amostraId: uuid("amostra_id").notNull(),
}, (table) => [
	index("idx_pesquisa_preco_amostra_item_type").using("btree", table.researchItemId.asc().nullsLast().op("uuid_ops"), table.sampleType.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_amostra_research_item_amostra").using("btree", table.researchItemId.asc().nullsLast().op("uuid_ops"), table.amostraId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.amostraId],
			foreignColumns: [comprasAmostraInProcurement.id],
			name: "procurement_pesquisa_preco_amostra_amostra_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.researchItemId],
			foreignColumns: [procurementPesquisaPrecoItemInProcurement.id],
			name: "procurement_pesquisa_preco_amostra_research_item_id_fkey"
		}).onDelete("cascade"),
	check("procurement_pesquisa_preco_amostra_sample_type_check", sql`sample_type = ANY (ARRAY['valid'::text, 'outlier'::text, 'pollution'::text])`),
]);

export const kitchenAtaDraftInProcurement = procurement.table("kitchen_ata_draft", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kitchenId: integer("kitchen_id").notNull(),
	title: text().notNull(),
	notes: text(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "kitchen_ata_draft_kitchen_id_fkey"
		}),
	check("kitchen_ata_draft_status_check", sql`status = ANY (ARRAY['pending'::text, 'sent'::text, 'reviewed'::text])`),
]);

export const kitchenAtaDraftSelectionInProcurement = procurement.table("kitchen_ata_draft_selection", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	draftId: uuid("draft_id").notNull(),
	templateId: uuid("template_id").notNull(),
	repetitions: integer().default(1).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.draftId],
			foreignColumns: [kitchenAtaDraftInProcurement.id],
			name: "kitchen_ata_draft_selection_draft_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "kitchen_ata_draft_selection_template_id_fkey"
		}),
	check("kitchen_ata_draft_selection_repetitions_check", sql`repetitions > 0`),
]);

export const policyRuleInProcurement = procurement.table("policy_rule", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	target: text().notNull(),
	title: text().notNull(),
	description: text().notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("policy_rule_target_display_order_idx").using("btree", table.target.asc().nullsLast().op("int4_ops"), table.displayOrder.asc().nullsLast().op("int4_ops")).where(sql`(deleted_at IS NULL)`),
	check("policy_rule_target_check", sql`target = ANY (ARRAY['product'::text, 'recipe'::text])`),
]);

export const comprasAmostraInProcurement = procurement.table("compras_amostra", {
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
	fingerprint: text().generatedAlwaysAs(sql`sisub.compras_amostra_fingerprint(id_compra, id_item_compra, descricao_item, preco_unitario, capacidade_unidade_fornecimento, sigla_unidade_fornecimento, sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg, municipio, estado, esfera, marca, normalized_price, reference_date)`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_compras_amostra_compra").using("btree", table.idCompra.asc().nullsLast().op("int4_ops"), table.idItemCompra.asc().nullsLast().op("int4_ops")),
	uniqueIndex("uq_compras_amostra_fingerprint").using("btree", table.fingerprint.asc().nullsLast().op("text_ops")),
]);

export const mcpApiKeysInAccessControl = accessControl.table("mcp_api_keys", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	label: text().notNull(),
	keyHash: text("key_hash").notNull(),
	keyPrefix: text("key_prefix").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).default(sql`(now() + '90 days'::interval)`).notNull(),
}, (table) => [
	index("mcp_api_keys_hash_active_idx").using("btree", table.keyHash.asc().nullsLast().op("text_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "mcp_api_keys_user_id_fkey"
		}).onDelete("cascade"),
	unique("mcp_api_keys_key_hash_key").on(table.keyHash),
]);

export const migrationRecipeLookupInKitchen = kitchen.table("migration_recipe_lookup", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyIdPreparacao: bigint("legacy_id_preparacao", { mode: "number" }).primaryKey().notNull(),
	newRecipeId: uuid("new_recipe_id").notNull(),
	legacyRendimento: numeric("legacy_rendimento", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_migration_recipe_lookup_new_id").using("btree", table.newRecipeId.asc().nullsLast().op("uuid_ops")),
	unique("migration_recipe_lookup_new_recipe_id_key").on(table.newRecipeId),
]);

export const menuTemplateEventMealInKitchen = kitchen.table("menu_template_event_meal", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	menuTemplateId: uuid("menu_template_id").notNull(),
	name: text().notNull(),
	mealTypeId: uuid("meal_type_id").notNull(),
	groups: jsonb().default([]).notNull(),
	sortOrder: smallint("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	baseHeadcount: integer("base_headcount"),
}, (table) => [
	index("menu_template_event_meal_template_idx").using("btree", table.menuTemplateId.asc().nullsLast().op("int2_ops"), table.sortOrder.asc().nullsLast().op("int2_ops")),
	foreignKey({
			columns: [table.mealTypeId],
			foreignColumns: [mealTypeInKitchen.id],
			name: "menu_template_event_meal_meal_type_id_fkey"
		}),
	foreignKey({
			columns: [table.menuTemplateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "menu_template_event_meal_menu_template_id_fkey"
		}).onDelete("cascade"),
	check("menu_template_event_meal_base_headcount_check", sql`(base_headcount IS NULL) OR (base_headcount > 0)`),
	check("menu_template_event_meal_groups_is_array", sql`jsonb_typeof(groups) = 'array'::text`),
	check("menu_template_event_meal_name_not_blank", sql`btrim(name) <> ''::text`),
]);

export const comprasMaterialCaracteristicaInComprasGovIntegration = comprasGovIntegration.table("compras_material_caracteristica", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	codigoItem: integer("codigo_item").notNull(),
	codigoCaracteristica: text("codigo_caracteristica").notNull(),
	nomeCaracteristica: text("nome_caracteristica").notNull(),
	statusCaracteristica: boolean("status_caracteristica").default(true).notNull(),
	codigoValorCaracteristica: text("codigo_valor_caracteristica"),
	nomeValorCaracteristica: text("nome_valor_caracteristica"),
	statusValorCaracteristica: boolean("status_valor_caracteristica"),
	numeroCaracteristica: integer("numero_caracteristica"),
	siglaUnidadeMedida: text("sigla_unidade_medida"),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_material_caracteristi_codigo_item_codigo_caracteris_key").on(table.codigoItem, table.codigoCaracteristica, table.codigoValorCaracteristica),
]);

export const gpcBrickInGs1Integration = gs1Integration.table("gpc_brick", {
	brickCode: text("brick_code").primaryKey().notNull(),
	brickTitle: text("brick_title").notNull(),
	classCode: text("class_code").notNull(),
	classTitle: text("class_title").notNull(),
	familyCode: text("family_code").notNull(),
	familyTitle: text("family_title").notNull(),
	segmentCode: text("segment_code").notNull(),
	segmentTitle: text("segment_title").notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("gpc_brick_class_idx").using("btree", table.classCode.asc().nullsLast().op("text_ops")),
	index("gpc_brick_segment_idx").using("btree", table.segmentCode.asc().nullsLast().op("text_ops")),
]);

export const changelogInKitchen = kitchen.table("changelog", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	version: text(),
	title: text().notNull(),
	body: text().notNull(),
	tags: text().array().default([""]),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	published: boolean().default(true).notNull(),
});

export const personInCore = core.table("person", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	displayName: text("display_name").notNull(),
	nrOrdem: text("nr_ordem"),
	userId: uuid("user_id"),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	nameKey: text("name_key").generatedAlwaysAs(sql`core.person_name_key(display_name)`),
}, (table) => [
	uniqueIndex("person_name_key_idx").using("btree", table.nameKey.asc().nullsLast().op("text_ops")).where(sql`active`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "person_user_id_fkey"
		}).onDelete("set null"),
	unique("person_nr_ordem_key").on(table.nrOrdem),
	unique("person_user_id_key").on(table.userId),
	check("person_display_name_check", sql`btrim(display_name) <> ''::text`),
]);

export const kitchenInKitchen = kitchen.table("kitchen", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "kitchen.kitchen_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	type: kitchenTypeInSisub(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	purchaseUnitId: bigint("purchase_unit_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	displayName: text("display_name"),
	addressLogradouro: text("address_logradouro"),
	addressNumero: text("address_numero"),
	addressComplemento: text("address_complemento"),
	addressBairro: text("address_bairro"),
	addressMunicipio: text("address_municipio"),
	addressUf: text("address_uf"),
	addressCep: text("address_cep"),
	isTraining: boolean("is_training").default(false).notNull(),
}, (table) => [
	uniqueIndex("kitchen_single_training_idx").using("btree", table.isTraining.asc().nullsLast().op("bool_ops")).where(sql`is_training`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [table.id],
			name: "kitchen_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.purchaseUnitId],
			foreignColumns: [unitsInCore.id],
			name: "kitchen_purchase_unit_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "kitchen_unit_id_fkey"
		}),
]);

export const recipesInKitchen = kitchen.table("recipes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	version: smallint().notNull(),
	name: text().notNull(),
	preparationMethod: text("preparation_method"),
	portionYield: numeric("portion_yield", { mode: "number" }),
	preparationTimeMinutes: smallint("preparation_time_minutes"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	baseRecipeId: uuid("base_recipe_id"),
	upstreamVersionSnapshot: smallint("upstream_version_snapshot"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	rationalId: text("rational_id"),
	cookingFactor: numeric("cooking_factor", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyId: bigint("legacy_id", { mode: "number" }),
	folderId: uuid("folder_id"),
	prePreparationMethod: text("pre_preparation_method"),
	prePreparationTimeMinutes: smallint("pre_preparation_time_minutes"),
	cookingTimeMinutes: smallint("cooking_time_minutes"),
	cookingMethod: text("cooking_method"),
	cookingTemperatureCelsius: smallint("cooking_temperature_celsius"),
}, (table) => [
	index("recipes_base_recipe_idx").using("btree", table.baseRecipeId.asc().nullsLast().op("uuid_ops")).where(sql`(base_recipe_id IS NOT NULL)`),
	index("recipes_folder_id_idx").using("btree", table.folderId.asc().nullsLast().op("uuid_ops")),
	index("recipes_kitchen_lineage_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.baseRecipeId.asc().nullsLast().op("int8_ops")).where(sql`(base_recipe_id IS NOT NULL)`),
	uniqueIndex("recipes_lineage_version_unique_idx").using("btree", sql`base_recipe_id`, sql`COALESCE(kitchen_id, ('-1'::integer)::bigint)`, sql`version`).where(sql`(base_recipe_id IS NOT NULL)`),
	index("recipes_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.folderId],
			foreignColumns: [recipeFolderInKitchen.id],
			name: "recipes_folder_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "recipes_kitchen_id_fkey"
		}),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	check("recipes_cooking_temperature_range", sql`(cooking_temperature_celsius IS NULL) OR ((cooking_temperature_celsius >= '-40'::integer) AND (cooking_temperature_celsius <= 500))`),
	check("recipes_cooking_time_nonnegative", sql`(cooking_time_minutes IS NULL) OR (cooking_time_minutes >= 0)`),
	check("recipes_pre_preparation_time_nonnegative", sql`(pre_preparation_time_minutes IS NULL) OR (pre_preparation_time_minutes >= 0)`),
]);

export const migrationNutrientLookupInKitchen = kitchen.table("migration_nutrient_lookup", {
	legacyIdNutriente: integer("legacy_id_nutriente").primaryKey().notNull(),
	newNutrientId: uuid("new_nutrient_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("migration_nutrient_lookup_new_nutrient_id_key").on(table.newNutrientId),
]);

export const recipeReviewInKitchen = kitchen.table("recipe_review", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
	note: text(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("recipe_review_recipe_idx").using("btree", table.recipeId.asc().nullsLast().op("timestamptz_ops"), table.reviewedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "recipe_review_recipe_id_fkey"
		}).onDelete("cascade"),
]);

export const integrationSyncLogInComprasGovIntegration = comprasGovIntegration.table("integration_sync_log", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	triggeredBy: text("triggered_by").default('cron').notNull(),
	status: text().default('running').notNull(),
	totalSteps: integer("total_steps").default(15).notNull(),
	completedSteps: integer("completed_steps").default(0).notNull(),
	successfulSteps: integer("successful_steps").default(0).notNull(),
	failedSteps: integer("failed_steps").default(0).notNull(),
	totalUpserted: integer("total_upserted").default(0).notNull(),
	totalDeactivated: integer("total_deactivated").default(0).notNull(),
	errorMessage: text("error_message"),
	heartbeatAt: timestamp("heartbeat_at", { withTimezone: true, mode: 'string' }),
	stopRequested: boolean("stop_requested").default(false).notNull(),
	source: text().default('compras_gov').notNull(),
}, (table) => [
	index("idx_compras_sync_log_started_at").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_integration_sync_log_source_started").using("btree", table.source.asc().nullsLast().op("text_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("uq_integration_sync_log_one_running_per_source").using("btree", table.source.asc().nullsLast().op("text_ops")).where(sql`(status = 'running'::text)`),
]);

export const goodsReceiptInInventory = inventory.table("goods_receipt", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	supplyOrderId: uuid("supply_order_id"),
	nfeDocumentId: uuid("nfe_document_id"),
	empenhoId: uuid("empenho_id"),
	status: text().default('draft').notNull(),
	provisionalBy: uuid("provisional_by"),
	provisionalAt: timestamp("provisional_at", { withTimezone: true, mode: 'string' }),
	definitiveBy: uuid("definitive_by"),
	definitiveAt: timestamp("definitive_at", { withTimezone: true, mode: 'string' }),
	notes: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	liquidacaoId: uuid("liquidacao_id"),
	source: text().default('nfe').notNull(),
	deliveryNoteNumber: text("delivery_note_number"),
	provisionalDesignationId: uuid("provisional_designation_id"),
	definitiveDesignationId: uuid("definitive_designation_id"),
	fiscalPending: boolean("fiscal_pending").default(false).notNull(),
	fiscalPendingValue: numeric("fiscal_pending_value", { mode: "number", precision: 14, scale: 2 }),
	fiscalResolution: text("fiscal_resolution"),
	fiscalResolutionReference: text("fiscal_resolution_reference"),
	fiscalResolvedAt: timestamp("fiscal_resolved_at", { withTimezone: true, mode: 'string' }),
	fiscalResolvedBy: uuid("fiscal_resolved_by"),
}, (table) => [
	index("goods_receipt_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("int8_ops")),
	uniqueIndex("goods_receipt_nfe_document_unique").using("btree", table.nfeDocumentId.asc().nullsLast().op("uuid_ops")).where(sql`((nfe_document_id IS NOT NULL) AND (status <> 'rejected'::text))`),
	index("goods_receipt_nfe_idx").using("btree", table.nfeDocumentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "goods_receipt_created_by_fkey"
		}),
	foreignKey({
			columns: [table.definitiveBy],
			foreignColumns: [usersInAuth.id],
			name: "goods_receipt_definitive_by_fkey"
		}),
	foreignKey({
			columns: [table.definitiveDesignationId],
			foreignColumns: [contractDesignationInProcurement.id],
			name: "goods_receipt_definitive_designation_id_fkey"
		}),
	foreignKey({
			columns: [table.empenhoId],
			foreignColumns: [empenhoInFinance.id],
			name: "goods_receipt_empenho_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.fiscalResolvedBy],
			foreignColumns: [usersInAuth.id],
			name: "goods_receipt_fiscal_resolved_by_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "goods_receipt_kitchen_id_fkey"
		}),
	// FK "goods_receipt_liquidacao_id_fkey" omitida (patch-drizzle-pull.ts): ciclo com liquidacaoInFinance faria o TS inferir any. Existe no banco; a relação segue em relations.ts.
	foreignKey({
			columns: [table.nfeDocumentId],
			foreignColumns: [nfeDocumentInInventory.id],
			name: "goods_receipt_nfe_document_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.provisionalBy],
			foreignColumns: [usersInAuth.id],
			name: "goods_receipt_provisional_by_fkey"
		}),
	foreignKey({
			columns: [table.provisionalDesignationId],
			foreignColumns: [contractDesignationInProcurement.id],
			name: "goods_receipt_provisional_designation_id_fkey"
		}),
	foreignKey({
			columns: [table.supplyOrderId],
			foreignColumns: [supplyOrderInProcurement.id],
			name: "goods_receipt_supply_order_id_fkey"
		}).onDelete("set null"),
	check("goods_receipt_fiscal_resolution_check", sql`fiscal_resolution = ANY (ARRAY['return_nfe'::text, 'replacement_nfe'::text, 'glosa'::text])`),
	check("goods_receipt_source_check", sql`source = ANY (ARRAY['nfe'::text, 'delivery_note'::text, 'ad_hoc'::text])`),
	check("goods_receipt_status_check", sql`status = ANY (ARRAY['draft'::text, 'provisional'::text, 'definitive'::text, 'divergent'::text, 'rejected'::text])`),
]);

export const comprasServicoNaturezaDespesaInComprasGovIntegration = comprasGovIntegration.table("compras_servico_natureza_despesa", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	codigoServico: integer("codigo_servico").notNull(),
	codigoNaturezaDespesa: text("codigo_natureza_despesa").notNull(),
	nomeNaturezaDespesa: text("nome_natureza_despesa").notNull(),
	statusNaturezaDespesa: boolean("status_natureza_despesa").default(true).notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_servico_natureza_desp_codigo_servico_codigo_naturez_key").on(table.codigoServico, table.codigoNaturezaDespesa),
]);

export const contractDesignationInProcurement = procurement.table("contract_designation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	empenhoId: uuid("empenho_id"),
	arpId: uuid("arp_id"),
	personId: uuid("person_id").notNull(),
	role: text().notNull(),
	isSubstitute: boolean("is_substitute").default(false).notNull(),
	source: text().notNull(),
	sourceReference: text("source_reference"),
	validFrom: date("valid_from").default(sql`((now() AT TIME ZONE 'America/Sao_Paulo'`).notNull(),
	validTo: date("valid_to"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("contract_designation_empenho_idx").using("btree", table.empenhoId.asc().nullsLast().op("uuid_ops")).where(sql`(empenho_id IS NOT NULL)`),
	index("contract_designation_person_idx").using("btree", table.personId.asc().nullsLast().op("uuid_ops")),
	index("contract_designation_unit_idx").using("btree", table.unitId.asc().nullsLast().op("text_ops"), table.role.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.arpId],
			foreignColumns: [procurementArpInProcurement.id],
			name: "contract_designation_arp_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "contract_designation_created_by_fkey"
		}),
	foreignKey({
			columns: [table.empenhoId],
			foreignColumns: [empenhoInFinance.id],
			name: "contract_designation_empenho_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [usersInAuth.id],
			name: "contract_designation_person_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "contract_designation_unit_id_fkey"
		}),
	check("contract_designation_period", sql`(valid_to IS NULL) OR (valid_to >= valid_from)`),
	check("contract_designation_role_check", sql`role = ANY (ARRAY['manager'::text, 'technical_inspector'::text, 'administrative_inspector'::text, 'sectoral_inspector'::text, 'committee_member'::text])`),
	check("contract_designation_source_check", sql`source = ANY (ARRAY['ato'::text, 'empenho'::text, 'permanente'::text])`),
]);

export const purchaseItemIngredientInProcurement = procurement.table("purchase_item_ingredient", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	purchaseItemId: uuid("purchase_item_id").notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	conversionFactor: numeric("conversion_factor", { mode: "number", precision: 12, scale: 6 }).default(1.0).notNull(),
	conversionNotes: text("conversion_notes"),
	isDefault: boolean("is_default").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("purchase_item_ingredient_default_uniq").using("btree", table.ingredientId.asc().nullsLast().op("uuid_ops")).where(sql`is_default`),
	index("purchase_item_ingredient_ingredient_idx").using("btree", table.ingredientId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [itemInCore.id],
			name: "purchase_item_ingredient_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "purchase_item_ingredient_purchase_item_id_fkey"
		}).onDelete("cascade"),
	unique("purchase_item_ingredient_purchase_item_id_ingredient_id_key").on(table.purchaseItemId, table.ingredientId),
]);

export const receiptScanEventInInventory = inventory.table("receipt_scan_event", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	receiptId: uuid("receipt_id").notNull(),
	receiptItemId: uuid("receipt_item_id"),
	seq: bigserial({ mode: "number" }).notNull(),
	clientEventId: text("client_event_id").notNull(),
	method: text().notNull(),
	rawCode: text("raw_code"),
	gtin: text(),
	lotCode: text("lot_code"),
	expiryDate: date("expiry_date"),
	packageFactor: numeric("package_factor", { mode: "number", precision: 14, scale: 6 }),
	quantityBase: numeric("quantity_base", { mode: "number", precision: 14, scale: 4 }).notNull(),
	reversedEventId: uuid("reversed_event_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("receipt_scan_event_item_idx").using("btree", table.receiptItemId.asc().nullsLast().op("uuid_ops"), table.seq.asc().nullsLast().op("int8_ops")),
	index("receipt_scan_event_receipt_idx").using("btree", table.receiptId.asc().nullsLast().op("uuid_ops"), table.seq.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("receipt_scan_event_reversal_key").using("btree", table.reversedEventId.asc().nullsLast().op("uuid_ops")).where(sql`(reversed_event_id IS NOT NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "receipt_scan_event_created_by_fkey"
		}),
	foreignKey({
			columns: [table.receiptId],
			foreignColumns: [goodsReceiptInInventory.id],
			name: "receipt_scan_event_receipt_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.receiptItemId],
			foreignColumns: [goodsReceiptItemInInventory.id],
			name: "receipt_scan_event_receipt_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reversedEventId],
			foreignColumns: [table.id],
			name: "receipt_scan_event_reversed_event_id_fkey"
		}),
	unique("receipt_scan_event_client_key").on(table.receiptId, table.clientEventId),
	check("receipt_scan_event_method_check", sql`method = ANY (ARRAY['scanner'::text, 'camera'::text, 'manual_confirm'::text, 'typed'::text, 'bulk_confirm'::text, 'reversal'::text, 'refusal'::text])`),
	check("receipt_scan_event_reversal", sql`(method <> 'reversal'::text) OR (reversed_event_id IS NOT NULL)`),
]);

export const procurementListSelectionInProcurement = procurement.table("procurement_list_selection", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	listKitchenId: uuid("list_kitchen_id").notNull(),
	templateId: uuid("template_id").notNull(),
	repetitions: integer().default(1).notNull(),
	originTemplateId: uuid("origin_template_id"),
}, (table) => [
	foreignKey({
			columns: [table.listKitchenId],
			foreignColumns: [procurementListKitchenInProcurement.id],
			name: "procurement_ata_selection_ata_kitchen_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "procurement_ata_selection_template_id_fkey"
		}),
	foreignKey({
			columns: [table.originTemplateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "procurement_list_selection_origin_template_id_fkey"
		}).onDelete("set null"),
	check("procurement_ata_selection_repetitions_check", sql`repetitions > 0`),
]);

export const procurementListKitchenInProcurement = procurement.table("procurement_list_kitchen", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	listId: uuid("list_id").notNull(),
	kitchenId: integer("kitchen_id").notNull(),
	deliveryNotes: text("delivery_notes"),
}, (table) => [
	index("idx_procurement_list_kitchen_list_id").using("btree", table.listId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.listId],
			foreignColumns: [procurementListInProcurement.id],
			name: "procurement_ata_kitchen_ata_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "procurement_ata_kitchen_kitchen_id_fkey"
		}),
	unique("procurement_ata_kitchen_ata_id_kitchen_id_key").on(table.listId, table.kitchenId),
]);

export const unitsInCore = core.table("units", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	code: text().notNull(),
	displayName: text("display_name"),
	type: unitTypeInSisub(),
	uasg: text(),
	addressLogradouro: text("address_logradouro"),
	addressNumero: text("address_numero"),
	addressComplemento: text("address_complemento"),
	addressBairro: text("address_bairro"),
	addressMunicipio: text("address_municipio"),
	addressUf: text("address_uf"),
	addressCep: text("address_cep"),
	isTraining: boolean("is_training").default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parentUnitId: bigint("parent_unit_id", { mode: "number" }),
	cnpj: char({ length: 14 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	supportingUnitId: bigint("supporting_unit_id", { mode: "number" }),
}, (table) => [
	uniqueIndex("units_cnpj_key").using("btree", table.cnpj.asc().nullsLast().op("bpchar_ops")).where(sql`(cnpj IS NOT NULL)`),
	index("units_parent_unit_idx").using("btree", table.parentUnitId.asc().nullsLast().op("int8_ops")).where(sql`(parent_unit_id IS NOT NULL)`),
	uniqueIndex("units_single_training_idx").using("btree", table.isTraining.asc().nullsLast().op("bool_ops")).where(sql`is_training`),
	index("units_supporting_unit_idx").using("btree", table.supportingUnitId.asc().nullsLast().op("int8_ops")).where(sql`(supporting_unit_id IS NOT NULL)`),
	foreignKey({
			columns: [table.parentUnitId],
			foreignColumns: [table.id],
			name: "units_parent_unit_id_fkey"
		}),
	foreignKey({
			columns: [table.supportingUnitId],
			foreignColumns: [table.id],
			name: "units_supporting_unit_id_fkey"
		}).onDelete("restrict"),
	unique("units_code_key").on(table.code),
	check("units_cnpj_format", sql`(cnpj IS NULL) OR (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'::text)`),
	check("units_supporting_not_self", sql`(supporting_unit_id IS NULL) OR (supporting_unit_id <> id)`),
]);

export const procurementListInProcurement = procurement.table("procurement_list", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: integer("unit_id").notNull(),
	title: text().notNull(),
	notes: text(),
	status: text().default('draft').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	wizardStep: smallint("wizard_step"),
	validityMonths: smallint("validity_months"),
	maxMarginPercent: smallint("max_margin_percent").default(20).notNull(),
	marginJustification: text("margin_justification"),
}, (table) => [
	index("idx_procurement_list_unit_status").using("btree", table.unitId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("int4_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "procurement_ata_unit_id_fkey"
		}),
	check("procurement_ata_status_check", sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`),
	check("procurement_list_max_margin_percent_check", sql`(max_margin_percent >= 0) AND (max_margin_percent <= 100)`),
	check("procurement_list_validity_months_check", sql`(validity_months IS NULL) OR ((validity_months > 0) AND (validity_months <= 120))`),
	check("procurement_list_wizard_step_check", sql`(wizard_step >= 1) AND (wizard_step <= 5)`),
]);

export const ingredientInKitchen = kitchen.table("ingredient", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	description: text(),
	measureUnit: text("measure_unit"),
	correctionFactor: numeric("correction_factor", { mode: "number" }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	folderId: uuid("folder_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyId: bigint("legacy_id", { mode: "number" }),
	ceafaId: uuid("ceafa_id"),
	densityFactor: numeric("density_factor", { mode: "number" }),
	rehydrationIndex: numeric("rehydration_index", { mode: "number" }),
	preparationGroupId: uuid("preparation_group_id"),
	defaultDeliveryCycle: text("default_delivery_cycle"),
	shelfLifeAfterOpeningDays: integer("shelf_life_after_opening_days"),
	shelfLifeAfterThawDays: integer("shelf_life_after_thaw_days"),
	defaultShelfLifeDays: integer("default_shelf_life_days"),
	issuePackageQuantity: numeric("issue_package_quantity", { mode: "number", precision: 14, scale: 4 }),
	allergens: text().array().default([""]).notNull(),
}, (table) => [
	index("ingredient_preparation_group_id_idx").using("btree", table.preparationGroupId.asc().nullsLast().op("uuid_ops")).where(sql`(preparation_group_id IS NOT NULL)`),
	foreignKey({
			columns: [table.id],
			foreignColumns: [itemInCore.id],
			name: "ingredient_is_item"
		}),
	foreignKey({
			columns: [table.preparationGroupId],
			foreignColumns: [preparationGroupInKitchen.id],
			name: "ingredient_preparation_group_id_fkey"
		}),
	foreignKey({
			columns: [table.ceafaId],
			foreignColumns: [ceafaInKitchen.id],
			name: "product_ceafa_id_fkey"
		}),
	foreignKey({
			columns: [table.folderId],
			foreignColumns: [folderInKitchen.id],
			name: "product_folder_id_fkey"
		}),
	check("ingredient_allergens_check", sql`allergens <@ ARRAY['gluten'::text, 'crustaceos'::text, 'ovos'::text, 'peixes'::text, 'amendoim'::text, 'soja'::text, 'leite'::text, 'castanhas'::text, 'latex_natural'::text]`),
	check("ingredient_default_delivery_cycle_check", sql`(default_delivery_cycle IS NULL) OR (default_delivery_cycle = ANY (ARRAY['weekly'::text, 'monthly'::text]))`),
	check("ingredient_default_shelf_life_days_check", sql`default_shelf_life_days > 0`),
	check("ingredient_issue_package_quantity_check", sql`issue_package_quantity > (0)::numeric`),
	check("ingredient_shelf_life_after_opening_days_check", sql`shelf_life_after_opening_days > 0`),
	check("ingredient_shelf_life_after_thaw_days_check", sql`shelf_life_after_thaw_days > 0`),
]);

export const preparationGroupInKitchen = kitchen.table("preparation_group", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	parentId: uuid("parent_id"),
	legacyId: integer("legacy_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("preparation_group_deleted_at_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("preparation_group_parent_id_idx").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "preparation_group_parent_id_fkey"
		}),
	check("preparation_group_name_not_blank", sql`btrim(name) <> ''::text`),
	check("preparation_group_not_self_parent", sql`(parent_id IS NULL) OR (parent_id <> id)`),
]);

export const purchaseItemInProcurement = procurement.table("purchase_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	description: text().notNull(),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	catmatItemCodigo: integer("catmat_item_codigo"),
	catmatItemDescricao: text("catmat_item_descricao"),
	catmatMatchStatus: text("catmat_match_status"),
	catmatMatchScore: numeric("catmat_match_score", { mode: "number" }),
	gpcSegmentCode: text("gpc_segment_code"),
	gpcFamilyCode: text("gpc_family_code"),
	gpcClassCode: text("gpc_class_code"),
	gpcBrickCode: text("gpc_brick_code"),
	unitPrice: numeric("unit_price", { mode: "number", precision: 12, scale: 4 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	detailedDescription: text("detailed_description"),
	deliveryConditioning: text("delivery_conditioning"),
	conservationClass: text("conservation_class"),
	storageTempMinC: numeric("storage_temp_min_c", { mode: "number", precision: 5, scale: 2 }),
	storageTempMaxC: numeric("storage_temp_max_c", { mode: "number", precision: 5, scale: 2 }),
	minShelfLifeDaysOnDelivery: integer("min_shelf_life_days_on_delivery"),
	packageType: text("package_type"),
	packageNetContent: numeric("package_net_content", { mode: "number", precision: 12, scale: 4 }),
	packageNetContentUnit: text("package_net_content_unit"),
	transportRequirement: text("transport_requirement"),
	quantityTolerancePct: numeric("quantity_tolerance_pct", { mode: "number", precision: 5, scale: 2 }).default(2).notNull(),
}, (table) => [
	index("purchase_item_catmat_idx").using("btree", table.catmatItemCodigo.asc().nullsLast().op("int4_ops")).where(sql`(deleted_at IS NULL)`),
	index("purchase_item_conservation_idx").using("btree", table.conservationClass.asc().nullsLast().op("text_ops")).where(sql`((conservation_class IS NOT NULL) AND (deleted_at IS NULL))`),
	index("purchase_item_description_trgm_idx").using("gin", table.description.asc().nullsLast().op("gin_trgm_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.catmatItemCodigo],
			foreignColumns: [comprasMaterialItemInComprasGovIntegration.codigoItem],
			name: "purchase_item_catmat_item_codigo_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.packageNetContentUnit],
			foreignColumns: [measureUnitInCore.code],
			name: "purchase_item_package_net_content_unit_fkey"
		}),
	check("purchase_item_catmat_match_status_check", sql`catmat_match_status = ANY (ARRAY['pending'::text, 'matched'::text, 'review'::text, 'no_match'::text, 'skip'::text])`),
	check("purchase_item_conservation_class_check", sql`conservation_class = ANY (ARRAY['seco'::text, 'resfriado'::text, 'congelado'::text, 'climatizado'::text, 'nao_aplicavel'::text])`),
	check("purchase_item_min_shelf_life_days_on_delivery_check", sql`(min_shelf_life_days_on_delivery IS NULL) OR (min_shelf_life_days_on_delivery > 0)`),
	check("purchase_item_net_content_pair", sql`(package_net_content IS NULL) = (package_net_content_unit IS NULL)`),
	check("purchase_item_package_net_content_check", sql`(package_net_content IS NULL) OR (package_net_content > (0)::numeric)`),
	check("purchase_item_package_type_check", sql`package_type = ANY (ARRAY['lata'::text, 'vidro'::text, 'pet'::text, 'saco_rafia'::text, 'saco_plastico'::text, 'vacuo'::text, 'bandeja'::text, 'tetra_pak'::text, 'caixa_papelao'::text, 'a_granel'::text, 'outro'::text])`),
	check("purchase_item_quantity_tolerance_pct_check", sql`(quantity_tolerance_pct >= (0)::numeric) AND (quantity_tolerance_pct <= (100)::numeric)`),
	check("purchase_item_temp_range_check", sql`(storage_temp_min_c IS NULL) OR (storage_temp_max_c IS NULL) OR (storage_temp_min_c <= storage_temp_max_c)`),
	check("purchase_item_transport_requirement_check", sql`transport_requirement = ANY (ARRAY['ambiente'::text, 'refrigerado'::text, 'congelado'::text])`),
]);

export const equipmentRoleInKitchen = kitchen.table("equipment_role", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	description: text(),
	category: text().default('coccao').notNull(),
	sortOrder: integer("sort_order").default(100).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("equipment_role_category_idx").using("btree", table.category.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")).where(sql`(deleted_at IS NULL)`),
	uniqueIndex("equipment_role_code_uniq").using("btree", table.code.asc().nullsLast().op("text_ops")),
	check("equipment_role_category_check", sql`category = ANY (ARRAY['coccao'::text, 'preparo'::text, 'conservacao'::text, 'apoio'::text])`),
]);

export const equipmentModelRoleInKitchen = kitchen.table("equipment_model_role", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	modelId: uuid("model_id").notNull(),
	roleId: uuid("role_id").notNull(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("equipment_model_role_primary_uniq").using("btree", table.modelId.asc().nullsLast().op("uuid_ops")).where(sql`(is_primary AND (deleted_at IS NULL))`),
	index("equipment_model_role_role_idx").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	uniqueIndex("equipment_model_role_uniq").using("btree", table.modelId.asc().nullsLast().op("uuid_ops"), table.roleId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.modelId],
			foreignColumns: [equipmentModelInKitchen.id],
			name: "equipment_model_role_model_id_fkey"
		}),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [equipmentRoleInKitchen.id],
			name: "equipment_model_role_role_id_fkey"
		}),
]);

export const equipmentUnitRoleInKitchen = kitchen.table("equipment_unit_role", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: uuid("unit_id").notNull(),
	roleId: uuid("role_id").notNull(),
	available: boolean().notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("equipment_unit_role_uniq").using("btree", table.unitId.asc().nullsLast().op("uuid_ops"), table.roleId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [equipmentRoleInKitchen.id],
			name: "equipment_unit_role_role_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [equipmentUnitInKitchen.id],
			name: "equipment_unit_role_unit_id_fkey"
		}),
]);

export const gtinAliasInGs1Integration = gs1Integration.table("gtin_alias", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	gtin: text().notNull(),
	ingredientItemId: uuid("ingredient_item_id").notNull(),
	supplierCnpj: text("supplier_cnpj"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	status: text().default('pending').notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	reviewedBy: uuid("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewNote: text("review_note"),
}, (table) => [
	index("gtin_alias_gtin_idx").using("btree", table.gtin.asc().nullsLast().op("text_ops")).where(sql`(status <> 'rejected'::text)`),
	index("gtin_alias_pending_idx").using("btree", table.status.asc().nullsLast().op("text_ops")).where(sql`(status = 'pending'::text)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "gtin_alias_created_by_fkey"
		}),
	foreignKey({
			columns: [table.ingredientItemId],
			foreignColumns: [ingredientItemInKitchen.id],
			name: "gtin_alias_ingredient_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "gtin_alias_kitchen_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [usersInAuth.id],
			name: "gtin_alias_reviewed_by_fkey"
		}),
	unique("gtin_alias_unique").on(table.gtin, table.ingredientItemId),
	check("gtin_alias_gtin_check", sql`gtin ~ '^[0-9]{14}$'::text`),
	check("gtin_alias_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const procurementArpInProcurement = procurement.table("procurement_arp", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: integer("unit_id").notNull(),
	ataId: uuid("ata_id").notNull(),
	numeroAta: text("numero_ata").notNull(),
	anoAta: text("ano_ata"),
	uasgGerenciadora: text("uasg_gerenciadora").notNull(),
	nomeUasgGerenciadora: text("nome_uasg_gerenciadora"),
	objeto: text(),
	dataVigenciaInicio: date("data_vigencia_inicio"),
	dataVigenciaFim: date("data_vigencia_fim"),
	statusAta: text("status_ata"),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_procurement_arp_ata").using("btree", table.ataId.asc().nullsLast().op("uuid_ops")),
	index("idx_procurement_arp_unit").using("btree", table.unitId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.ataId],
			foreignColumns: [procurementListInProcurement.id],
			name: "procurement_arp_ata_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "procurement_arp_unit_id_fkey"
		}),
	unique("procurement_arp_unit_id_numero_ata_uasg_gerenciadora_key").on(table.unitId, table.numeroAta, table.uasgGerenciadora),
]);

export const recipeEquipmentRequirementInKitchen = kitchen.table("recipe_equipment_requirement", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	recipeStepId: uuid("recipe_step_id"),
	roleId: uuid("role_id"),
	modelId: uuid("model_id"),
	quantity: integer().default(1).notNull(),
	scaling: text().default('per_batch').notNull(),
	batchPortions: numeric("batch_portions", { mode: "number" }),
	minCapacityLiters: numeric("min_capacity_liters", { mode: "number" }),
	minCapacityGn: smallint("min_capacity_gn"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("recipe_equipment_requirement_recipe_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	index("recipe_equipment_requirement_step_idx").using("btree", table.recipeStepId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	uniqueIndex("recipe_equipment_requirement_target_uniq").using("btree", sql`recipe_id`, sql`COALESCE(recipe_step_id, '00000000-0000-0000-0000-000000000000'`, sql`COALESCE(role_id, model_id)`).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.modelId],
			foreignColumns: [equipmentModelInKitchen.id],
			name: "recipe_equipment_requirement_model_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "recipe_equipment_requirement_recipe_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeStepId],
			foreignColumns: [recipeStepInKitchen.id],
			name: "recipe_equipment_requirement_recipe_step_id_fkey"
		}),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [equipmentRoleInKitchen.id],
			name: "recipe_equipment_requirement_role_id_fkey"
		}),
	check("recipe_equipment_requirement_batch_check", sql`(batch_portions IS NULL) OR (batch_portions > (0)::numeric)`),
	check("recipe_equipment_requirement_capacity_check", sql`(min_capacity_liters IS NULL) OR (min_capacity_liters > (0)::numeric)`),
	check("recipe_equipment_requirement_capacity_gn_check", sql`(min_capacity_gn IS NULL) OR (min_capacity_gn > 0)`),
	check("recipe_equipment_requirement_quantity_check", sql`quantity > 0`),
	check("recipe_equipment_requirement_scaling_check", sql`scaling = ANY (ARRAY['per_batch'::text, 'fixed'::text])`),
	check("recipe_equipment_requirement_target_xor", sql`((role_id IS NOT NULL) AND (model_id IS NULL)) OR ((role_id IS NULL) AND (model_id IS NOT NULL))`),
]);

export const analyticsChatSessionInKitchen = kitchen.table("analytics_chat_session", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	title: text().default('Novo chat').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_analytics_chat_session_user").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "analytics_chat_session_user_id_fkey"
		}).onDelete("cascade"),
]);

export const analyticsChatMessageInKitchen = kitchen.table("analytics_chat_message", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	role: text().notNull(),
	content: text().default("").notNull(),
	chart: jsonb(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	chartTypeOverride: text("chart_type_override"),
	langsmithRunId: text("langsmith_run_id"),
	model: text(),
	latencyMs: integer("latency_ms"),
	inputTokens: integer("input_tokens"),
	outputTokens: integer("output_tokens"),
}, (table) => [
	index("idx_analytics_chat_message_session").using("btree", table.sessionId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [analyticsChatSessionInKitchen.id],
			name: "analytics_chat_message_session_id_fkey"
		}).onDelete("cascade"),
	check("analytics_chat_message_chart_type_override_check", sql`chart_type_override = ANY (ARRAY['bar'::text, 'line'::text, 'area'::text, 'pie'::text, 'table'::text])`),
	check("analytics_chat_message_has_payload", sql`(btrim(content) <> ''::text) OR (chart IS NOT NULL) OR (error IS NOT NULL))) NOT VALID`),
	check("analytics_chat_message_role_check", sql`role = ANY (ARRAY['user'::text, 'assistant'::text])`),
]);

export const productionTaskInKitchen = kitchen.table("production_task", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kitchenId: integer("kitchen_id").notNull(),
	menuItemId: uuid("menu_item_id").notNull(),
	productionDate: date("production_date").notNull(),
	status: text().default('PENDING').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	producedQuantity: numeric("produced_quantity", { mode: "number" }),
	leftoverQuantity: numeric("leftover_quantity", { mode: "number" }),
	issueDate: date("issue_date"),
}, (table) => [
	index("production_task_kitchen_id_production_date_idx").using("btree", table.kitchenId.asc().nullsLast().op("int4_ops"), table.productionDate.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "production_task_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.menuItemId],
			foreignColumns: [menuItemsInKitchen.id],
			name: "production_task_menu_item_id_fkey"
		}).onDelete("cascade"),
	unique("production_task_menu_item_id_key").on(table.menuItemId),
	check("production_task_leftover_quantity_check", sql`leftover_quantity >= (0)::numeric`),
	check("production_task_produced_quantity_check", sql`produced_quantity >= (0)::numeric`),
	check("production_task_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'DONE'::text])`),
]);

export const folderInKitchen = kitchen.table("folder", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	parentId: uuid("parent_id"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	description: text(),
	legacyId: integer("legacy_id"),
	catalogScope: text("catalog_scope").default('alimentacao').notNull(),
}, (table) => [
	index("folder_catalog_scope_idx").using("btree", table.catalogScope.asc().nullsLast().op("text_ops")).where(sql`(catalog_scope <> 'alimentacao'::text)`),
	index("folder_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("folder_deleted_at_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("folder_description_idx").using("btree", table.description.asc().nullsLast().op("text_ops")),
	index("folder_parent_id_idx").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	check("folder_catalog_scope_check", sql`catalog_scope = ANY (ARRAY['alimentacao'::text, 'auxiliar'::text])`),
]);

export const ranchoInKitchen = kitchen.table("rancho", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	eloCode: text("elo_code").notNull(),
	code: text().notNull(),
	displayName: text("display_name").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	producesOwnMeals: boolean("produces_own_meals").default(true).notNull(),
	active: boolean().default(true).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("rancho_code_uniq").using("btree", table.code.asc().nullsLast().op("text_ops")),
	index("rancho_elo_idx").using("btree", table.eloCode.asc().nullsLast().op("text_ops")).where(sql`active`),
	index("rancho_mess_hall_idx").using("btree", table.messHallId.asc().nullsLast().op("int8_ops")).where(sql`(mess_hall_id IS NOT NULL)`),
	index("rancho_unit_idx").using("btree", table.unitId.asc().nullsLast().op("int8_ops")).where(sql`active`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "rancho_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.messHallId],
			foreignColumns: [messHallsInKitchen.id],
			name: "rancho_mess_hall_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "rancho_unit_id_fkey"
		}),
]);

export const workforceCategoryInKitchen = kitchen.table("workforce_category", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	description: text(),
	sortOrder: integer("sort_order").default(100).notNull(),
	isCareer: boolean("is_career").default(false).notNull(),
	isTechnical: boolean("is_technical").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("workforce_category_code_uniq").using("btree", table.code.asc().nullsLast().op("text_ops")),
]);

export const workforceSurveyInKitchen = kitchen.table("workforce_survey", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	referenceDate: date("reference_date").notNull(),
	title: text().notNull(),
	status: text().default('open').notNull(),
	source: text(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("workforce_survey_reference_date_uniq").using("btree", table.referenceDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "workforce_survey_created_by_fkey"
		}),
	check("workforce_survey_status_check", sql`status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text])`),
]);

export const workforceSubmissionInKitchen = kitchen.table("workforce_submission", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	surveyId: uuid("survey_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	ranchoId: bigint("rancho_id", { mode: "number" }).notNull(),
	declaredTotal: integer("declared_total"),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: 'string' }),
	submittedBy: uuid("submitted_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workforce_submission_rancho_idx").using("btree", table.ranchoId.asc().nullsLast().op("int8_ops")),
	uniqueIndex("workforce_submission_uniq").using("btree", table.surveyId.asc().nullsLast().op("int8_ops"), table.ranchoId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.ranchoId],
			foreignColumns: [ranchoInKitchen.id],
			name: "workforce_submission_rancho_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.submittedBy],
			foreignColumns: [usersInAuth.id],
			name: "workforce_submission_submitted_by_fkey"
		}),
	foreignKey({
			columns: [table.surveyId],
			foreignColumns: [workforceSurveyInKitchen.id],
			name: "workforce_submission_survey_id_fkey"
		}).onDelete("restrict"),
	check("workforce_submission_declared_total_check", sql`(declared_total IS NULL) OR (declared_total >= 0)`),
]);

export const stockIssueRequestInInventory = inventory.table("stock_issue_request", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	issueDate: date("issue_date").notNull(),
	origin: text().default('production').notNull(),
	status: text().default('open').notNull(),
	destination: text(),
	purpose: text(),
	authorizationReference: text("authorization_reference"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	closedBy: uuid("closed_by"),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("stock_issue_request_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("date_ops"), table.issueDate.desc().nullsFirst().op("int8_ops")),
	uniqueIndex("stock_issue_request_production_day_key").using("btree", table.kitchenId.asc().nullsLast().op("date_ops"), table.issueDate.asc().nullsLast().op("date_ops")).where(sql`(origin = 'production'::text)`),
	foreignKey({
			columns: [table.closedBy],
			foreignColumns: [usersInAuth.id],
			name: "stock_issue_request_closed_by_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "stock_issue_request_created_by_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "stock_issue_request_kitchen_id_fkey"
		}),
	check("stock_issue_request_origin_check", sql`origin = ANY (ARRAY['production'::text, 'ad_hoc'::text])`),
	check("stock_issue_request_status_check", sql`status = ANY (ARRAY['open'::text, 'closed'::text, 'closed_unexplained'::text])`),
]);

export const stockIssueRequestItemInInventory = inventory.table("stock_issue_request_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	mealTypeId: uuid("meal_type_id"),
	suggestedQty: numeric("suggested_qty", { mode: "number", precision: 14, scale: 4 }),
	suggestedFrozenAt: timestamp("suggested_frozen_at", { withTimezone: true, mode: 'string' }),
	varianceReason: text("variance_reason"),
	varianceNote: text("variance_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("stock_issue_request_item_request_idx").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "stock_issue_request_item_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.mealTypeId],
			foreignColumns: [mealTypeInKitchen.id],
			name: "stock_issue_request_item_meal_type_id_fkey"
		}),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [stockIssueRequestInInventory.id],
			name: "stock_issue_request_item_request_id_fkey"
		}).onDelete("cascade"),
	unique("stock_issue_request_item_key").on(table.requestId, table.ingredientId),
	check("stock_issue_request_item_variance_reason_check", sql`variance_reason = ANY (ARRAY['headcount_change'::text, 'production_loss'::text, 'yield_difference'::text, 'recipe_substitution'::text, 'portion_adjustment'::text, 'other'::text])`),
]);

export const workforceHeadcountInKitchen = kitchen.table("workforce_headcount", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	submissionId: uuid("submission_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	headcount: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("workforce_headcount_uniq").using("btree", table.submissionId.asc().nullsLast().op("uuid_ops"), table.categoryId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [workforceCategoryInKitchen.id],
			name: "workforce_headcount_category_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.submissionId],
			foreignColumns: [workforceSubmissionInKitchen.id],
			name: "workforce_headcount_submission_id_fkey"
		}).onDelete("cascade"),
	check("workforce_headcount_nonnegative", sql`headcount >= 0`),
]);

export const mealPresencesInKitchen = kitchen.table("meal_presences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	date: date().notNull(),
	meal: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("meal_presences_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("meal_presences_date_meal_idx").using("btree", table.date.asc().nullsLast().op("date_ops"), table.meal.asc().nullsLast().op("text_ops")),
	index("meal_presences_mess_hall_id_idx").using("btree", table.messHallId.asc().nullsLast().op("int8_ops")),
	index("meal_presences_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.date.asc().nullsLast().op("uuid_ops")),
	index("rancho_presencas_date_meal_idx").using("btree", table.date.asc().nullsLast().op("date_ops"), table.meal.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.messHallId],
			foreignColumns: [messHallsInKitchen.id],
			name: "meal_presences_mess_hall_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "meal_presences_user_id_fkey"
		}),
	unique("meal_presences_user_id_date_meal_key").on(table.userId, table.date, table.meal),
	check("meal_presences_meal_check", sql`meal = ANY (ARRAY['cafe'::text, 'almoco'::text, 'janta'::text, 'ceia'::text])`),
]);

export const workforceNoteInKitchen = kitchen.table("workforce_note", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	submissionId: uuid("submission_id").notNull(),
	kind: text().notNull(),
	quantity: integer(),
	detail: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("workforce_note_submission_idx").using("btree", table.submissionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.submissionId],
			foreignColumns: [workforceSubmissionInKitchen.id],
			name: "workforce_note_submission_id_fkey"
		}).onDelete("cascade"),
	check("workforce_note_kind_check", sql`kind = ANY (ARRAY['outsourced'::text, 'leave'::text, 'reassigned'::text, 'shared'::text, 'scope'::text, 'change'::text, 'counting'::text, 'other'::text])`),
	check("workforce_note_quantity_check", sql`(quantity IS NULL) OR (quantity >= 0)`),
]);

export const sourceInNutritionReference = nutritionReference.table("source", {
	id: text().primaryKey().notNull(),
	displayName: text("display_name").notNull(),
	publisher: text(),
	countryCode: text("country_code"),
	licenseName: text("license_name"),
	licenseUrl: text("license_url"),
	citation: text(),
	importMode: text("import_mode").default('disabled').notNull(),
	syncEnabled: boolean("sync_enabled").default(false).notNull(),
	sourcePriority: integer("source_priority").default(100).notNull(),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	check("nutrition_source_import_mode_check", sql`import_mode = ANY (ARRAY['auto_download'::text, 'manual_file'::text, 'external_lookup'::text, 'disabled'::text])`),
]);

export const ingredientNutritionReferenceInKitchen = kitchen.table("ingredient_nutrition_reference", {
	ingredientId: uuid("ingredient_id").primaryKey().notNull(),
	foodRevisionId: uuid("food_revision_id").notNull(),
	matchStatus: text("match_status").default('manual').notNull(),
	linkedAt: timestamp("linked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	linkedBy: uuid("linked_by"),
	notes: text(),
}, (table) => [
	index("ingredient_nutrition_reference_food_idx").using("btree", table.foodRevisionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.foodRevisionId],
			foreignColumns: [foodItemRevisionInNutritionReference.id],
			name: "ingredient_nutrition_reference_food_revision_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "ingredient_nutrition_reference_ingredient_id_fkey"
		}).onDelete("cascade"),
	check("ingredient_nutrition_reference_status_check", sql`match_status = ANY (ARRAY['manual'::text, 'suggested'::text, 'reviewed'::text])`),
]);

export const menuTemplateMealInKitchen = kitchen.table("menu_template_meal", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	menuTemplateId: uuid("menu_template_id").notNull(),
	dayOfWeek: smallint("day_of_week").notNull(),
	mealTypeId: uuid("meal_type_id").notNull(),
	baseHeadcount: integer("base_headcount"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("menu_template_meal_template_idx").using("btree", table.menuTemplateId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.mealTypeId],
			foreignColumns: [mealTypeInKitchen.id],
			name: "menu_template_meal_meal_type_id_fkey"
		}),
	foreignKey({
			columns: [table.menuTemplateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "menu_template_meal_menu_template_id_fkey"
		}).onDelete("cascade"),
	unique("menu_template_meal_unique").on(table.menuTemplateId, table.dayOfWeek, table.mealTypeId),
	check("menu_template_meal_day_check", sql`(day_of_week >= 1) AND (day_of_week <= 7)`),
	check("menu_template_meal_headcount_check", sql`(base_headcount IS NULL) OR (base_headcount > 0)`),
]);

export const otherPresencesInKitchen = kitchen.table("other_presences", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "kitchen.other_presences_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	adminId: uuid("admin_id"),
	date: date().notNull(),
	meal: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }).notNull(),
}, (table) => [
	index("other_presences_admin_id_idx").using("btree", table.adminId.asc().nullsLast().op("uuid_ops")),
	index("other_presences_date_meal_idx").using("btree", table.date.asc().nullsLast().op("date_ops"), table.meal.asc().nullsLast().op("date_ops")),
	index("other_presences_mess_hall_id_idx").using("btree", table.messHallId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.adminId],
			foreignColumns: [usersInAuth.id],
			name: "other_presences_admin_id_fkey"
		}),
	foreignKey({
			columns: [table.messHallId],
			foreignColumns: [messHallsInKitchen.id],
			name: "other_presences_mess_hall_id_fkey"
		}).onDelete("restrict"),
	check("other_presences_meal_check", sql`meal = ANY (ARRAY['cafe'::text, 'almoco'::text, 'janta'::text, 'ceia'::text])`),
]);

export const stepTemplateUtensilInKitchen = kitchen.table("step_template_utensil", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stepTemplateId: uuid("step_template_id").notNull(),
	utensilId: uuid("utensil_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("step_template_utensil_uniq").using("btree", table.stepTemplateId.asc().nullsLast().op("uuid_ops"), table.utensilId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.stepTemplateId],
			foreignColumns: [stepTemplateInKitchen.id],
			name: "step_template_utensil_step_template_id_fkey"
		}),
	foreignKey({
			columns: [table.utensilId],
			foreignColumns: [utensilInKitchen.id],
			name: "step_template_utensil_utensil_id_fkey"
		}),
]);

export const recipeIngredientAlternativesInKitchen = kitchen.table("recipe_ingredient_alternatives", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	recipeIngredientId: uuid("recipe_ingredient_id").notNull(),
	ingredientId: uuid("ingredient_id"),
	netQuantity: numeric("net_quantity", { mode: "number" }),
	priorityOrder: smallint("priority_order"),
	frozenPreparationId: uuid("frozen_preparation_id"),
}, (table) => [
	index("recipe_ingredient_alt_frozen_prep_idx").using("btree", table.frozenPreparationId.asc().nullsLast().op("uuid_ops")).where(sql`(frozen_preparation_id IS NOT NULL)`),
	uniqueIndex("recipe_ingredient_alt_frozen_unique").using("btree", table.recipeIngredientId.asc().nullsLast().op("uuid_ops"), table.frozenPreparationId.asc().nullsLast().op("uuid_ops")).where(sql`(frozen_preparation_id IS NOT NULL)`),
	uniqueIndex("recipe_ingredient_alt_ingredient_unique").using("btree", table.recipeIngredientId.asc().nullsLast().op("uuid_ops"), table.ingredientId.asc().nullsLast().op("uuid_ops")).where(sql`(ingredient_id IS NOT NULL)`),
	index("recipe_ingredient_alt_recipe_ingredient_idx").using("btree", table.recipeIngredientId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "recipe_ingredient_alternatives_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "recipe_ingredient_alternatives_product_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeIngredientId],
			foreignColumns: [recipeIngredientsInKitchen.id],
			name: "recipe_ingredient_alternatives_recipe_ingredient_id_fkey"
		}).onDelete("cascade"),
	check("recipe_ingredient_alt_source_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) = 1`),
]);

export const ingredientNutrientInKitchen = kitchen.table("ingredient_nutrient", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	nutrientId: uuid("nutrient_id").notNull(),
	nutrientValue: numeric("nutrient_value", { mode: "number" }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.nutrientId],
			foreignColumns: [nutrientInKitchen.id],
			name: "product_nutrient_nutrient_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "product_nutrient_product_id_fkey"
		}),
	unique("product_nutrient_unique").on(table.ingredientId, table.nutrientId),
]);

export const nutrientInKitchen = kitchen.table("nutrient", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	name: text().notNull(),
	dailyValue: numeric("daily_value", { mode: "number" }),
	minimumValue: numeric("minimum_value", { mode: "number" }),
	isEnergyValue: boolean("is_energy_value"),
	enumName: text("enum_name"),
	displayOrder: integer("display_order"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	legacyId: integer("legacy_id"),
}, (table) => [
	unique("nutrient_legacy_id_key").on(table.legacyId),
]);

export const ceafaInKitchen = kitchen.table("ceafa", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	quantity: numeric({ mode: "number" }).notNull(),
	description: text().notNull(),
	legacyId: integer("legacy_id"),
}, (table) => [
	unique("ceafa_legacy_id_key").on(table.legacyId),
]);

export const ingredientVersionInKitchen = kitchen.table("ingredient_version", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	versionNumber: integer("version_number").notNull(),
	snapshot: jsonb().notNull(),
	changeSummary: text("change_summary"),
	changedBy: uuid("changed_by"),
	changedByName: text("changed_by_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ingredient_version_ingredient_idx").using("btree", table.ingredientId.asc().nullsLast().op("uuid_ops"), table.versionNumber.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "ingredient_version_ingredient_id_fkey"
		}).onDelete("cascade"),
	unique("ingredient_version_ingredient_id_version_number_key").on(table.ingredientId, table.versionNumber),
]);

export const utensilInKitchen = kitchen.table("utensil", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	roleId: uuid("role_id"),
}, (table) => [
	uniqueIndex("utensil_name_active_uniq").using("btree", sql`lower(name)`, sql`COALESCE(kitchen_id, (0)::bigint)`).where(sql`(deleted_at IS NULL)`),
	index("utensil_role_idx").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")).where(sql`((role_id IS NOT NULL) AND (deleted_at IS NULL))`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "utensil_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [equipmentRoleInKitchen.id],
			name: "utensil_role_id_fkey"
		}),
]);

export const moduleChatSessionInKitchen = kitchen.table("module_chat_session", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	module: text().notNull(),
	scopeId: integer("scope_id"),
	title: text().default('Novo chat').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_mcs_user").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.module.asc().nullsLast().op("uuid_ops"), table.updatedAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "module_chat_session_user_id_fkey"
		}).onDelete("cascade"),
	check("module_chat_session_module_check", sql`module = ANY (ARRAY['global'::text, 'kitchen'::text, 'unit'::text, 'local-analytics'::text])`),
]);

export const moduleChatMessageInKitchen = kitchen.table("module_chat_message", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	role: text().notNull(),
	content: text().default("").notNull(),
	toolCalls: jsonb("tool_calls"),
	toolCallId: text("tool_call_id"),
	toolName: text("tool_name"),
	toolResult: jsonb("tool_result"),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	langsmithRunId: text("langsmith_run_id"),
	model: text(),
	latencyMs: integer("latency_ms"),
	inputTokens: integer("input_tokens"),
	outputTokens: integer("output_tokens"),
}, (table) => [
	index("idx_mcm_session").using("btree", table.sessionId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [moduleChatSessionInKitchen.id],
			name: "module_chat_message_session_id_fkey"
		}).onDelete("cascade"),
	check("module_chat_message_has_payload", sql`(btrim(content) <> ''::text) OR (tool_calls IS NOT NULL) OR (tool_result IS NOT NULL) OR (error IS NOT NULL))) NOT VALID`),
	check("module_chat_message_role_check", sql`role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])`),
]);

export const mealForecastsInKitchen = kitchen.table("meal_forecasts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	date: date().notNull(),
	userId: uuid("user_id").notNull(),
	meal: text().notNull(),
	willEat: boolean("will_eat").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }).notNull(),
}, (table) => [
	index("meal_forecasts_date_idx").using("btree", table.date.asc().nullsLast().op("date_ops")),
	index("meal_forecasts_mess_hall_id_idx").using("btree", table.messHallId.asc().nullsLast().op("int8_ops")),
	index("meal_forecasts_user_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.date.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.messHallId],
			foreignColumns: [messHallsInKitchen.id],
			name: "meal_forecasts_mess_hall_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "meal_forecasts_user_id_fkey"
		}),
	unique("meal_forecasts_user_id_date_meal_key").on(table.date, table.userId, table.meal),
	unique("rancho_previsoes_user_data_refeicao_key").on(table.date, table.userId, table.meal),
	check("meal_forecasts_meal_check", sql`meal = ANY (ARRAY['cafe'::text, 'almoco'::text, 'janta'::text, 'ceia'::text])`),
]);

export const messHallsInKitchen = kitchen.table("mess_halls", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	code: text().notNull(),
	displayName: text("display_name"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	isTraining: boolean("is_training").default(false).notNull(),
}, (table) => [
	uniqueIndex("mess_halls_single_training_idx").using("btree", table.isTraining.asc().nullsLast().op("bool_ops")).where(sql`is_training`),
	index("mess_halls_unit_id_idx").using("btree", table.unitId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "mess_halls_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "mess_halls_unit_fk"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "mess_halls_unit_id_fkey"
		}).onDelete("restrict"),
	unique("mess_halls_code_key").on(table.code),
]);

export const dailyMenuInKitchen = kitchen.table("daily_menu", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	serviceDate: date("service_date"),
	mealTypeId: uuid("meal_type_id"),
	forecastedHeadcount: smallint("forecasted_headcount"),
	status: text(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("daily_menu_active_unique").using("btree", table.serviceDate.asc().nullsLast().op("date_ops"), table.mealTypeId.asc().nullsLast().op("uuid_ops"), table.kitchenId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "daily_menu_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.mealTypeId],
			foreignColumns: [mealTypeInKitchen.id],
			name: "daily_menu_meal_type_id_fkey"
		}),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const inventoryCountItemInInventory = inventory.table("inventory_count_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	countId: uuid("count_id").notNull(),
	lotId: uuid("lot_id").notNull(),
	countedQty: numeric("counted_qty", { mode: "number", precision: 14, scale: 4 }).notNull(),
	ledgerQty: numeric("ledger_qty", { mode: "number", precision: 14, scale: 4 }),
}, (table) => [
	foreignKey({
			columns: [table.countId],
			foreignColumns: [inventoryCountInInventory.id],
			name: "inventory_count_item_count_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.lotId],
			foreignColumns: [stockLotInInventory.id],
			name: "inventory_count_item_lot_id_fkey"
		}),
	unique("inventory_count_item_lot_key").on(table.countId, table.lotId),
	check("inventory_count_item_counted_qty_check", sql`counted_qty >= (0)::numeric`),
]);

export const mealTypeInKitchen = kitchen.table("meal_type", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	name: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	sortOrder: smallint("sort_order"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	systemKey: text("system_key"),
	groupSetId: uuid("group_set_id"),
}, (table) => [
	index("meal_type_group_set_idx").using("btree", table.groupSetId.asc().nullsLast().op("uuid_ops")).where(sql`(group_set_id IS NOT NULL)`),
	uniqueIndex("meal_type_system_key_unique").using("btree", table.systemKey.asc().nullsLast().op("text_ops")).where(sql`(system_key IS NOT NULL)`),
	foreignKey({
			columns: [table.groupSetId],
			foreignColumns: [menuGroupSetInKitchen.id],
			name: "meal_type_group_set_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "meal_type_kitchen_id_fkey"
		}),
	check("meal_type_system_key_check", sql`(system_key IS NULL) OR (system_key = 'snack_request'::text)`),
]);

export const menuTemplateInKitchen = kitchen.table("menu_template", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	name: text(),
	description: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	baseTemplateId: uuid("base_template_id"),
	templateType: text("template_type").default('weekly').notNull(),
	expectedMonthlyOccurrences: smallint("expected_monthly_occurrences"),
	snackFamily: text("snack_family"),
	snackClass: text("snack_class"),
	snackVariant: text("snack_variant"),
	requiresGalley: boolean("requires_galley").default(false).notNull(),
	requiresOven: boolean("requires_oven").default(false).notNull(),
	reviewedAt: date("reviewed_at"),
	shelfLifeHours: smallint("shelf_life_hours"),
	orderable: boolean().default(false).notNull(),
}, (table) => [
	index("menu_template_kitchen_lineage_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.baseTemplateId.asc().nullsLast().op("int8_ops")).where(sql`((base_template_id IS NOT NULL) AND (deleted_at IS NULL))`),
	foreignKey({
			columns: [table.baseTemplateId],
			foreignColumns: [table.id],
			name: "menu_template_base_template_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "menu_template_kitchen_id_fkey"
		}),
	check("menu_template_expected_monthly_occurrences_check", sql`(expected_monthly_occurrences IS NULL) OR (expected_monthly_occurrences > 0)`),
	check("menu_template_shelf_life_hours_check", sql`(shelf_life_hours IS NULL) OR ((shelf_life_hours >= 1) AND (shelf_life_hours <= 720))`),
	check("menu_template_snack_apoio_class_check", sql`(snack_family IS DISTINCT FROM 'apoio'::text) OR (snack_class = ANY (ARRAY['A'::text, 'B'::text]))`),
	check("menu_template_snack_class_check", sql`(snack_class IS NULL) OR (snack_class = ANY (ARRAY['A'::text, 'B'::text, 'C'::text]))`),
	check("menu_template_snack_complete_check", sql`((snack_family IS NULL) AND (snack_class IS NULL) AND (snack_variant IS NULL) AND (orderable = false)) OR ((snack_family IS NOT NULL) AND (snack_class IS NOT NULL) AND (snack_variant IS NOT NULL) AND (template_type = 'exception'::text))`),
	check("menu_template_snack_family_check", sql`(snack_family IS NULL) OR (snack_family = ANY (ARRAY['bordo'::text, 'apoio'::text]))`),
	check("menu_template_snack_variant_check", sql`(snack_variant IS NULL) OR (snack_variant = ANY (ARRAY['lanche'::text, 'refeicao'::text]))`),
	check("menu_template_template_type_check", sql`template_type = ANY (ARRAY['weekly'::text, 'event'::text, 'exception'::text])`),
]);

export const stockCostInInventory = inventory.table("stock_cost", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	quantity: numeric({ mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	avgUnitCost: numeric("avg_unit_cost", { mode: "number", precision: 12, scale: 4 }).default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("stock_cost_frozen_key").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.frozenPreparationId.asc().nullsLast().op("uuid_ops")).where(sql`(frozen_preparation_id IS NOT NULL)`),
	uniqueIndex("stock_cost_ingredient_key").using("btree", table.kitchenId.asc().nullsLast().op("uuid_ops"), table.ingredientId.asc().nullsLast().op("int8_ops")).where(sql`(ingredient_id IS NOT NULL)`),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "stock_cost_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "stock_cost_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "stock_cost_kitchen_id_fkey"
		}),
	check("stock_cost_item_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) = 1`),
]);

export const sensitiveOperationLogInAccessControl = accessControl.table("sensitive_operation_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	actorId: uuid("actor_id").notNull(),
	operation: text().notNull(),
	assurance: text().notNull(),
	target: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("sensitive_operation_log_actor_created_idx").using("btree", table.actorId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("sensitive_operation_log_created_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("sensitive_operation_log_target_user_idx").using("btree", sql`((target ->> 'target_user_id'::text))`, sql`created_at`),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [usersInAuth.id],
			name: "sensitive_operation_log_actor_id_fkey"
		}).onDelete("restrict"),
	check("sensitive_operation_log_assurance_check", sql`assurance = ANY (ARRAY['session'::text, 'fresh'::text])`),
]);

export const recipeStepInKitchen = kitchen.table("recipe_step", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	stepTemplateId: uuid("step_template_id"),
	label: text(),
	description: text(),
	durationMinutes: integer("duration_minutes"),
	canvasX: doublePrecision("canvas_x").default(0).notNull(),
	canvasY: doublePrecision("canvas_y").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("recipe_step_recipe_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "recipe_step_recipe_id_fkey"
		}),
	foreignKey({
			columns: [table.stepTemplateId],
			foreignColumns: [stepTemplateInKitchen.id],
			name: "recipe_step_step_template_id_fkey"
		}),
]);

export const recipeStepOutputInKitchen = kitchen.table("recipe_step_output", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeStepId: uuid("recipe_step_id").notNull(),
	recipeId: uuid("recipe_id").notNull(),
	label: text(),
	quantity: numeric({ mode: "number" }),
	measureUnit: text("measure_unit"),
	isFinal: boolean("is_final").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("recipe_step_output_final_uniq").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")).where(sql`(is_final AND (deleted_at IS NULL))`),
	index("recipe_step_output_step_idx").using("btree", table.recipeStepId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "recipe_step_output_recipe_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeStepId],
			foreignColumns: [recipeStepInKitchen.id],
			name: "recipe_step_output_recipe_step_id_fkey"
		}),
]);

export const stepTemplateInKitchen = kitchen.table("step_template", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	defaultDurationMinutes: integer("default_duration_minutes"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("step_template_name_active_uniq").using("btree", sql`lower(name)`, sql`COALESCE(kitchen_id, (0)::bigint)`).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "step_template_kitchen_id_fkey"
		}),
]);

export const ingredientSubstitutionInKitchen = kitchen.table("ingredient_substitution", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	substituteIngredientId: uuid("substitute_ingredient_id").notNull(),
	factor: numeric({ mode: "number" }).default(1).notNull(),
}, (table) => [
	index("ingredient_substitution_ingredient_id_idx").using("btree", table.ingredientId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "ingredient_substitution_ingredient_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.substituteIngredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "ingredient_substitution_substitute_ingredient_id_fkey"
		}).onDelete("cascade"),
	unique("ingredient_substitution_unique").on(table.ingredientId, table.substituteIngredientId),
	check("ingredient_substitution_not_self", sql`ingredient_id <> substitute_ingredient_id`),
]);

export const recipeStepInputInKitchen = kitchen.table("recipe_step_input", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeStepId: uuid("recipe_step_id").notNull(),
	recipeIngredientId: uuid("recipe_ingredient_id"),
	sourceOutputId: uuid("source_output_id"),
	quantity: numeric({ mode: "number" }),
	measureUnit: text("measure_unit"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("recipe_step_input_ri_idx").using("btree", table.recipeIngredientId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	index("recipe_step_input_source_idx").using("btree", table.sourceOutputId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	index("recipe_step_input_step_idx").using("btree", table.recipeStepId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.recipeIngredientId],
			foreignColumns: [recipeIngredientsInKitchen.id],
			name: "recipe_step_input_recipe_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeStepId],
			foreignColumns: [recipeStepInKitchen.id],
			name: "recipe_step_input_recipe_step_id_fkey"
		}),
	foreignKey({
			columns: [table.sourceOutputId],
			foreignColumns: [recipeStepOutputInKitchen.id],
			name: "recipe_step_input_source_output_id_fkey"
		}),
	check("recipe_step_input_source_xor", sql`((recipe_ingredient_id IS NOT NULL) AND (source_output_id IS NULL)) OR ((recipe_ingredient_id IS NULL) AND (source_output_id IS NOT NULL))`),
]);

export const recipeStepUtensilInKitchen = kitchen.table("recipe_step_utensil", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeStepId: uuid("recipe_step_id").notNull(),
	utensilId: uuid("utensil_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("recipe_step_utensil_uniq").using("btree", table.recipeStepId.asc().nullsLast().op("uuid_ops"), table.utensilId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.recipeStepId],
			foreignColumns: [recipeStepInKitchen.id],
			name: "recipe_step_utensil_recipe_step_id_fkey"
		}),
	foreignKey({
			columns: [table.utensilId],
			foreignColumns: [utensilInKitchen.id],
			name: "recipe_step_utensil_utensil_id_fkey"
		}),
]);

export const mfaRecoveryCodeInAccessControl = accessControl.table("mfa_recovery_code", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	codeHash: text("code_hash").notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("mfa_recovery_code_user_unused_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")).where(sql`(used_at IS NULL)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "mfa_recovery_code_user_id_fkey"
		}).onDelete("cascade"),
	unique("mfa_recovery_code_code_hash_key").on(table.codeHash),
	pgPolicy("mfa_recovery_code: owner read", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(( SELECT auth.uid() AS uid) = user_id)` }),
]);

export const opinionsInKitchen = kitchen.table("opinions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "kitchen.opinions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	value: smallint(),
	question: text(),
	userId: uuid().defaultRandom(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "opinions_userId_fkey"
		}),
]);

export const recipeIngredientsInKitchen = kitchen.table("recipe_ingredients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id"),
	ingredientId: uuid("ingredient_id"),
	netQuantity: numeric("net_quantity", { mode: "number" }),
	isOptional: boolean("is_optional"),
	priorityOrder: smallint("priority_order"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	correctionFactor: numeric("correction_factor", { mode: "number" }),
	rehydrationIndex: numeric("rehydration_index", { mode: "number" }),
	frozenPreparationId: uuid("frozen_preparation_id"),
}, (table) => [
	index("recipe_ingredients_frozen_prep_idx").using("btree", table.frozenPreparationId.asc().nullsLast().op("uuid_ops")).where(sql`(frozen_preparation_id IS NOT NULL)`),
	index("recipe_ingredients_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "recipe_ingredients_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "recipe_ingredients_product_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "recipe_ingredients_recipe_id_fkey"
		}),
	check("recipe_ingredients_source_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) <= 1`),
]);

export const mfaResetLogInAccessControl = accessControl.table("mfa_reset_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	targetUserId: uuid("target_user_id").notNull(),
	performedBy: uuid("performed_by").notNull(),
	method: text().notNull(),
	reason: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("mfa_reset_log_performed_by_created_idx").using("btree", table.performedBy.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("mfa_reset_log_target_created_idx").using("btree", table.targetUserId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.performedBy],
			foreignColumns: [usersInAuth.id],
			name: "mfa_reset_log_performed_by_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.targetUserId],
			foreignColumns: [usersInAuth.id],
			name: "mfa_reset_log_target_user_id_fkey"
		}).onDelete("restrict"),
	check("mfa_reset_log_method_check", sql`method = ANY (ARRAY['recovery-code'::text, 'admin-reset'::text])`),
]);

export const ingredientItemInKitchen = kitchen.table("ingredient_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	description: text(),
	ingredientId: uuid("ingredient_id"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	unitContentQuantity: numeric("unit_content_quantity", { mode: "number" }),
	correctionFactor: numeric("correction_factor", { mode: "number" }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	barcode: text(),
	purchaseItemId: uuid("purchase_item_id"),
	gtin: text(),
}, (table) => [
	uniqueIndex("ingredient_item_gtin_unique").using("btree", table.gtin.asc().nullsLast().op("text_ops")).where(sql`((gtin IS NOT NULL) AND (deleted_at IS NULL))`),
	index("ingredient_item_purchase_item_idx").using("btree", table.purchaseItemId.asc().nullsLast().op("uuid_ops")).where(sql`(purchase_item_id IS NOT NULL)`),
	foreignKey({
			columns: [table.gtin],
			foreignColumns: [gtinInGs1Integration.gtin],
			name: "ingredient_item_gtin_fkey"
		}),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "ingredient_item_purchase_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "product_item_product_id_fkey"
		}),
]);

export const menuTemplateItemsInKitchen = kitchen.table("menu_template_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	menuTemplateId: uuid("menu_template_id"),
	dayOfWeek: smallint("day_of_week"),
	mealTypeId: uuid("meal_type_id"),
	recipeId: uuid("recipe_id"),
	headcountOverride: integer("headcount_override"),
	itemGroup: text("item_group"),
	sortOrder: smallint("sort_order").default(0).notNull(),
	recommendedProportion: numeric("recommended_proportion", { mode: "number" }),
	eventMealId: uuid("event_meal_id"),
}, (table) => [
	index("menu_template_items_event_meal_idx").using("btree", table.eventMealId.asc().nullsLast().op("uuid_ops")).where(sql`(event_meal_id IS NOT NULL)`),
	foreignKey({
			columns: [table.eventMealId],
			foreignColumns: [menuTemplateEventMealInKitchen.id],
			name: "menu_template_items_event_meal_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.mealTypeId],
			foreignColumns: [mealTypeInKitchen.id],
			name: "menu_template_items_meal_type_id_fkey"
		}),
	foreignKey({
			columns: [table.menuTemplateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "menu_template_items_menu_template_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "menu_template_items_recipe_id_fkey"
		}),
	check("menu_template_items_recommended_proportion_range", sql`(recommended_proportion IS NULL) OR ((recommended_proportion >= (0)::numeric) AND (recommended_proportion <= (300)::numeric))`),
]);

export const ingredientReviewInKitchen = kitchen.table("ingredient_review", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
	note: text(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ingredient_review_ingredient_idx").using("btree", table.ingredientId.asc().nullsLast().op("timestamptz_ops"), table.reviewedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "ingredient_review_ingredient_id_fkey"
		}).onDelete("cascade"),
]);

export const frozenPreparationInKitchen = kitchen.table("frozen_preparation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	description: text().notNull(),
	measureUnit: text("measure_unit"),
	yieldQuantity: numeric("yield_quantity", { mode: "number" }),
	correctionFactor: numeric("correction_factor", { mode: "number" }),
	densityFactor: numeric("density_factor", { mode: "number" }),
	category: text().default('preparacao').notNull(),
	productionRecipeId: uuid("production_recipe_id"),
	regenerationRecipeId: uuid("regeneration_recipe_id"),
	shelfLifeDays: integer("shelf_life_days"),
	storageTemperatureC: numeric("storage_temperature_c", { mode: "number" }),
	storageInstructions: text("storage_instructions"),
	ceafaId: uuid("ceafa_id"),
	sourceIngredientId: uuid("source_ingredient_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyId: bigint("legacy_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("frozen_preparation_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")).where(sql`(deleted_at IS NULL)`),
	index("frozen_preparation_legacy_id_idx").using("btree", table.legacyId.asc().nullsLast().op("int8_ops")).where(sql`(deleted_at IS NULL)`),
	index("frozen_preparation_production_recipe_idx").using("btree", table.productionRecipeId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	index("frozen_preparation_source_ingredient_idx").using("btree", table.sourceIngredientId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.ceafaId],
			foreignColumns: [ceafaInKitchen.id],
			name: "frozen_preparation_ceafa_id_fkey"
		}),
	foreignKey({
			columns: [table.productionRecipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "frozen_preparation_production_recipe_id_fkey"
		}),
	foreignKey({
			columns: [table.regenerationRecipeId],
			foreignColumns: [recipesInKitchen.id],
			name: "frozen_preparation_regeneration_recipe_id_fkey"
		}),
	foreignKey({
			columns: [table.sourceIngredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "frozen_preparation_source_ingredient_id_fkey"
		}),
	check("frozen_preparation_category_check", sql`category = ANY (ARRAY['preparacao'::text, 'prato_pronto'::text, 'lanche_pronto'::text])`),
]);

export const snackRequestInKitchen = kitchen.table("snack_request", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	requestedBy: uuid("requested_by").notNull(),
	requesterUnitLabel: text("requester_unit_label").notNull(),
	missionKind: text("mission_kind").notNull(),
	vehicleType: text("vehicle_type"),
	vehicleRegistration: text("vehicle_registration"),
	vehicleOm: text("vehicle_om"),
	missionDescription: text("mission_description").notNull(),
	departureAt: timestamp("departure_at", { withTimezone: true, mode: 'string' }).notNull(),
	origin: text(),
	destination: text(),
	stops: text(),
	totalMinutes: integer("total_minutes").notNull(),
	longestLegMinutes: integer("longest_leg_minutes"),
	stopsWithoutMess: boolean("stops_without_mess").default(false).notNull(),
	groundMinutes: integer("ground_minutes").default(0).notNull(),
	missionOrderNumber: text("mission_order_number"),
	isOperational: boolean("is_operational").notNull(),
	hasGalley: boolean("has_galley").default(false).notNull(),
	hasOven: boolean("has_oven").default(false).notNull(),
	crewCount: integer("crew_count").notNull(),
	paxCount: integer("pax_count").default(0).notNull(),
	waterQuantity: integer("water_quantity").default(0).notNull(),
	cupQuantity: integer("cup_quantity").default(0).notNull(),
	iceQuantity: integer("ice_quantity").default(0).notNull(),
	coffeeQuantity: integer("coffee_quantity").default(0).notNull(),
	includesNonMilitary: boolean("includes_non_military").default(false).notNull(),
	nonMilitaryReason: text("non_military_reason"),
	preference: text().notNull(),
	pickupAt: timestamp("pickup_at", { withTimezone: true, mode: 'string' }).notNull(),
	pickupResponsible: text("pickup_responsible").notNull(),
	fundingSource: text("funding_source").notNull(),
	lateReason: text("late_reason"),
	divergenceReason: text("divergence_reason"),
	calculatorSnapshot: jsonb("calculator_snapshot").notNull(),
	status: text().default('submitted').notNull(),
	unitValue: numeric("unit_value", { mode: "number", precision: 12, scale: 2 }),
	decidedBy: uuid("decided_by"),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	decisionReason: text("decision_reason"),
	sampleCollectedAt: timestamp("sample_collected_at", { withTimezone: true, mode: 'string' }),
	sampleCollectedBy: uuid("sample_collected_by"),
	sampleNotes: text("sample_notes"),
	pickedUpAt: timestamp("picked_up_at", { withTimezone: true, mode: 'string' }),
	pickedUpByName: text("picked_up_by_name"),
	deliveredBy: uuid("delivered_by"),
	cancelledBy: uuid("cancelled_by"),
	cancelReason: text("cancel_reason"),
	materialReturnPending: boolean("material_return_pending").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("snack_request_kitchen_pickup_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.pickupAt.asc().nullsLast().op("timestamptz_ops")),
	index("snack_request_requester_idx").using("btree", table.requestedBy.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.cancelledBy],
			foreignColumns: [usersInAuth.id],
			name: "snack_request_cancelled_by_fkey"
		}),
	foreignKey({
			columns: [table.decidedBy],
			foreignColumns: [usersInAuth.id],
			name: "snack_request_decided_by_fkey"
		}),
	foreignKey({
			columns: [table.deliveredBy],
			foreignColumns: [usersInAuth.id],
			name: "snack_request_delivered_by_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "snack_request_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.requestedBy],
			foreignColumns: [usersInAuth.id],
			name: "snack_request_requested_by_fkey"
		}),
	foreignKey({
			columns: [table.sampleCollectedBy],
			foreignColumns: [usersInAuth.id],
			name: "snack_request_sample_collected_by_fkey"
		}),
	check("snack_request_aerial_order_check", sql`(mission_kind <> 'aerea'::text) OR (NULLIF(btrim(mission_order_number), ''::text) IS NOT NULL)`),
	check("snack_request_coffee_quantity_check", sql`coffee_quantity >= 0`),
	check("snack_request_crew_count_check", sql`crew_count >= 0`),
	check("snack_request_cup_quantity_check", sql`cup_quantity >= 0`),
	check("snack_request_funding_source_check", sql`funding_source = ANY (ARRAY['economia_om'::text, 'recurso_missao'::text])`),
	check("snack_request_ground_minutes_check", sql`ground_minutes >= 0`),
	check("snack_request_ice_quantity_check", sql`ice_quantity >= 0`),
	check("snack_request_longest_leg_minutes_check", sql`(longest_leg_minutes IS NULL) OR (longest_leg_minutes > 0)`),
	check("snack_request_mission_kind_check", sql`mission_kind = ANY (ARRAY['aerea'::text, 'terrestre'::text])`),
	check("snack_request_non_military_check", sql`(NOT includes_non_military) OR (NULLIF(btrim(non_military_reason), ''::text) IS NOT NULL)`),
	check("snack_request_pax_count_check", sql`pax_count >= 0`),
	check("snack_request_people_check", sql`(crew_count + pax_count) > 0`),
	check("snack_request_pickup_after_delivery_check", sql`(status <> ALL (ARRAY['delivered'::text, 'closed'::text])) OR (picked_up_at IS NOT NULL)`),
	check("snack_request_preference_check", sql`preference = ANY (ARRAY['lanche'::text, 'refeicao'::text])`),
	check("snack_request_rejected_reason_check", sql`(status <> 'rejected'::text) OR (NULLIF(btrim(decision_reason), ''::text) IS NOT NULL)`),
	check("snack_request_sample_before_ready_check", sql`(status <> ALL (ARRAY['ready'::text, 'delivered'::text, 'closed'::text])) OR (sample_collected_at IS NOT NULL)`),
	check("snack_request_status_check", sql`status = ANY (ARRAY['submitted'::text, 'accepted'::text, 'rejected'::text, 'in_production'::text, 'ready'::text, 'delivered'::text, 'closed'::text, 'cancelled'::text])`),
	check("snack_request_total_minutes_check", sql`total_minutes > 0`),
	check("snack_request_unit_value_check", sql`(unit_value IS NULL) OR (unit_value >= (0)::numeric)`),
	check("snack_request_value_after_accept_check", sql`(status <> ALL (ARRAY['accepted'::text, 'in_production'::text, 'ready'::text, 'delivered'::text, 'closed'::text])) OR (unit_value IS NOT NULL)`),
	check("snack_request_water_quantity_check", sql`water_quantity >= 0`),
]);

export const snackRequestLineInKitchen = kitchen.table("snack_request_line", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	standardId: uuid("standard_id").notNull(),
	audience: text().notNull(),
	quantity: integer().notNull(),
	approvedQuantity: integer("approved_quantity"),
	optional: boolean().default(false).notNull(),
	standardSnapshot: jsonb("standard_snapshot").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("snack_request_line_request_idx").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	index("snack_request_line_standard_idx").using("btree", table.standardId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [snackRequestInKitchen.id],
			name: "snack_request_line_request_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.standardId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "snack_request_line_standard_id_fkey"
		}),
	check("snack_request_line_approved_quantity_check", sql`(approved_quantity IS NULL) OR (approved_quantity >= 0)`),
	check("snack_request_line_audience_check", sql`audience = ANY (ARRAY['crew'::text, 'pax'::text])`),
	check("snack_request_line_quantity_check", sql`quantity > 0`),
]);

export const snackRequestEventInKitchen = kitchen.table("snack_request_event", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	fromStatus: text("from_status"),
	toStatus: text("to_status").notNull(),
	actorId: uuid("actor_id").notNull(),
	note: text(),
	details: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("snack_request_event_request_idx").using("btree", table.requestId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [usersInAuth.id],
			name: "snack_request_event_actor_id_fkey"
		}),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [snackRequestInKitchen.id],
			name: "snack_request_event_request_id_fkey"
		}).onDelete("cascade"),
]);

export const monthlyClosingInInventory = inventory.table("monthly_closing", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	competencia: date().notNull(),
	balanceSnapshot: jsonb("balance_snapshot").notNull(),
	totalIn: numeric("total_in", { mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	totalOut: numeric("total_out", { mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	valueIn: numeric("value_in", { mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	valueOut: numeric("value_out", { mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	openingValue: numeric("opening_value", { mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	closingValue: numeric("closing_value", { mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	closedBy: uuid("closed_by"),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("monthly_closing_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.competencia.desc().nullsFirst().op("int8_ops")),
	foreignKey({
			columns: [table.closedBy],
			foreignColumns: [usersInAuth.id],
			name: "monthly_closing_closed_by_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "monthly_closing_kitchen_id_fkey"
		}),
	unique("monthly_closing_kitchen_competencia_key").on(table.kitchenId, table.competencia),
	check("monthly_closing_competencia_check", sql`competencia = (date_trunc('month'::text, (competencia)::timestamp with time zone))::date`),
]);

export const snackRequestMaterialInKitchen = kitchen.table("snack_request_material", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	requestId: uuid("request_id").notNull(),
	item: text().notNull(),
	description: text(),
	quantity: integer().notNull(),
	returnedQuantity: integer("returned_quantity").default(0).notNull(),
	issuedAt: timestamp("issued_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	returnedAt: timestamp("returned_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("snack_request_material_request_idx").using("btree", table.requestId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.requestId],
			foreignColumns: [snackRequestInKitchen.id],
			name: "snack_request_material_request_id_fkey"
		}).onDelete("cascade"),
	check("snack_request_material_item_check", sql`item = ANY (ARRAY['garrafa_termica'::text, 'caixa_termica'::text, 'hotbox'::text, 'cooler'::text, 'outro'::text])`),
	check("snack_request_material_other_check", sql`(item <> 'outro'::text) OR (NULLIF(btrim(description), ''::text) IS NOT NULL)`),
	check("snack_request_material_quantity_check", sql`quantity > 0`),
	check("snack_request_material_returned_check", sql`returned_quantity <= quantity`),
	check("snack_request_material_returned_quantity_check", sql`returned_quantity >= 0`),
]);

export const stockPolicyInInventory = inventory.table("stock_policy", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	minStock: numeric("min_stock", { mode: "number", precision: 14, scale: 4 }).default(0).notNull(),
	coverageDays: integer("coverage_days").default(7).notNull(),
	urgencyThresholdDays: integer("urgency_threshold_days"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "stock_policy_ingredient_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "stock_policy_kitchen_id_fkey"
		}),
	unique("stock_policy_kitchen_ingredient_key").on(table.kitchenId, table.ingredientId),
	check("stock_policy_coverage_days_check", sql`coverage_days > 0`),
	check("stock_policy_min_stock_check", sql`min_stock >= (0)::numeric`),
	check("stock_policy_urgency_threshold_days_check", sql`(urgency_threshold_days IS NULL) OR (urgency_threshold_days > 0)`),
]);

export const equipmentModelInKitchen = kitchen.table("equipment_model", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text(),
	manufacturer: text(),
	name: text().notNull(),
	slotCapacityLiters: numeric("slot_capacity_liters", { mode: "number" }),
	slotCapacityGn: smallint("slot_capacity_gn"),
	capacityLabel: text("capacity_label"),
	simultaneousSlots: integer("simultaneous_slots").default(1).notNull(),
	powerKw: numeric("power_kw", { mode: "number" }),
	isGeneric: boolean("is_generic").default(false).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	energySource: text("energy_source"),
	voltage: text(),
	widthCm: numeric("width_cm", { mode: "number" }),
	depthCm: numeric("depth_cm", { mode: "number" }),
	heightCm: numeric("height_cm", { mode: "number" }),
	weightKg: numeric("weight_kg", { mode: "number" }),
	requiresHood: boolean("requires_hood"),
	waterInlet: boolean("water_inlet"),
	drainRequired: boolean("drain_required"),
	manualUrl: text("manual_url"),
	expectedLifespanYears: smallint("expected_lifespan_years"),
}, (table) => [
	index("equipment_model_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops")).where(sql`(deleted_at IS NULL)`),
	uniqueIndex("equipment_model_name_active_uniq").using("btree", sql`lower(COALESCE(manufacturer, ''::text))`, sql`lower(name)`, sql`COALESCE(kitchen_id, (0)::bigint)`).where(sql`(deleted_at IS NULL)`),
	uniqueIndex("equipment_model_slug_uniq").using("btree", table.slug.asc().nullsLast().op("text_ops")).where(sql`(slug IS NOT NULL)`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "equipment_model_kitchen_id_fkey"
		}),
	check("equipment_model_capacity_check", sql`(slot_capacity_liters IS NULL) OR (slot_capacity_liters > (0)::numeric)`),
	check("equipment_model_capacity_gn_check", sql`(slot_capacity_gn IS NULL) OR (slot_capacity_gn > 0)`),
	check("equipment_model_dimensions_check", sql`((width_cm IS NULL) OR (width_cm > (0)::numeric)) AND ((depth_cm IS NULL) OR (depth_cm > (0)::numeric)) AND ((height_cm IS NULL) OR (height_cm > (0)::numeric)) AND ((weight_kg IS NULL) OR (weight_kg > (0)::numeric)) AND ((expected_lifespan_years IS NULL) OR (expected_lifespan_years > 0))`),
	check("equipment_model_energy_source_check", sql`(energy_source IS NULL) OR (energy_source = ANY (ARRAY['electric'::text, 'gas'::text, 'steam'::text, 'mixed'::text, 'manual'::text]))`),
	check("equipment_model_slots_check", sql`simultaneous_slots > 0`),
]);

export const equipmentUnitInKitchen = kitchen.table("equipment_unit", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	modelId: uuid("model_id").notNull(),
	label: text().notNull(),
	assetTag: text("asset_tag"),
	serialNumber: text("serial_number"),
	status: text().default('active').notNull(),
	simultaneousSlots: integer("simultaneous_slots"),
	acquiredOn: date("acquired_on"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	installedOn: date("installed_on"),
	warrantyUntil: date("warranty_until"),
	supplier: text(),
}, (table) => [
	uniqueIndex("equipment_unit_asset_tag_active_uniq").using("btree", sql`kitchen_id`, sql`lower(asset_tag)`).where(sql`((asset_tag IS NOT NULL) AND (deleted_at IS NULL))`),
	index("equipment_unit_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops")).where(sql`(deleted_at IS NULL)`),
	uniqueIndex("equipment_unit_label_active_uniq").using("btree", sql`kitchen_id`, sql`lower(label)`).where(sql`(deleted_at IS NULL)`),
	index("equipment_unit_model_idx").using("btree", table.modelId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "equipment_unit_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.modelId],
			foreignColumns: [equipmentModelInKitchen.id],
			name: "equipment_unit_model_id_fkey"
		}),
	check("equipment_unit_slots_check", sql`(simultaneous_slots IS NULL) OR (simultaneous_slots > 0)`),
	check("equipment_unit_status_check", sql`status = ANY (ARRAY['active'::text, 'maintenance'::text, 'decommissioned'::text])`),
]);

export const expiryAlertPolicyInInventory = inventory.table("expiry_alert_policy", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	ingredientId: uuid("ingredient_id"),
	conservationClass: text("conservation_class"),
	alertDays: integer("alert_days").notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("expiry_alert_policy_class_key").using("btree", sql`COALESCE(kitchen_id, (0)::bigint)`, sql`conservation_class`).where(sql`(conservation_class IS NOT NULL)`),
	uniqueIndex("expiry_alert_policy_ingredient_key").using("btree", sql`COALESCE(kitchen_id, (0)::bigint)`, sql`ingredient_id`).where(sql`(ingredient_id IS NOT NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "expiry_alert_policy_created_by_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "expiry_alert_policy_ingredient_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "expiry_alert_policy_kitchen_id_fkey"
		}).onDelete("cascade"),
	check("expiry_alert_policy_alert_days_check", sql`(alert_days >= 0) AND (alert_days <= 365)`),
	check("expiry_alert_policy_conservation_class_check", sql`conservation_class = ANY (ARRAY['seco'::text, 'resfriado'::text, 'congelado'::text, 'climatizado'::text, 'nao_aplicavel'::text])`),
	check("expiry_alert_policy_target", sql`((ingredient_id IS NOT NULL) AND (conservation_class IS NULL)) OR ((ingredient_id IS NULL) AND (conservation_class IS NOT NULL))`),
]);

export const recipeFolderInKitchen = kitchen.table("recipe_folder", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("recipe_folder_deleted_at_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("recipe_folder_name_active_unique").using("btree", sql`lower(btrim(name))`).where(sql`(deleted_at IS NULL)`),
	check("recipe_folder_name_not_blank", sql`btrim(name) <> ''::text`),
]);

export const inventoryCountInInventory = inventory.table("inventory_count", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	status: text().default('draft').notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	confirmedBy: uuid("confirmed_by"),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
	type: text().default('eventual').notNull(),
	scope: text().default('full').notNull(),
	scopeParams: jsonb("scope_params").default({}).notNull(),
	blind: boolean().default(true).notNull(),
	blindWaiverReason: text("blind_waiver_reason"),
	round: integer().default(1).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).default(sql`(now() + '7 days'::interval)`).notNull(),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	approvalExceptionReason: text("approval_exception_reason"),
	competencia: date().default(sql`((now() AT TIME ZONE 'America/Sao_Paulo'`).notNull(),
	parentCountId: uuid("parent_count_id"),
	approvedBy: uuid("approved_by"),
	adjustmentId: uuid("adjustment_id"),
	approvedByOwnEntry: boolean("approved_by_own_entry").default(false).notNull(),
}, (table) => [
	// FK "inventory_count_adjustment_fkey" omitida (patch-drizzle-pull.ts): ciclo com stockAdjustmentInInventory faria o TS inferir any. Existe no banco; a relação segue em relations.ts.
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [usersInAuth.id],
			name: "inventory_count_approved_by_fkey"
		}),
	foreignKey({
			columns: [table.confirmedBy],
			foreignColumns: [usersInAuth.id],
			name: "inventory_count_confirmed_by_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "inventory_count_created_by_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "inventory_count_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.parentCountId],
			foreignColumns: [table.id],
			name: "inventory_count_parent_fkey"
		}),
	check("inventory_count_round_check", sql`round >= 1`),
	check("inventory_count_scope_check", sql`scope = ANY (ARRAY['full'::text, 'conservation_class'::text, 'location'::text, 'item_list'::text, 'menu_cycle'::text])`),
	check("inventory_count_status_check", sql`status = ANY (ARRAY['draft'::text, 'counting'::text, 'review'::text, 'recount'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'confirmed'::text])`),
	check("inventory_count_type_check", sql`type = ANY (ARRAY['annual'::text, 'responsibility_transfer'::text, 'eventual'::text, 'rotating'::text])`),
]);

export const gpcAttributeInGs1Integration = gs1Integration.table("gpc_attribute", {
	attributeCode: text("attribute_code").primaryKey().notNull(),
	attributeTitle: text("attribute_title").notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const gpcAttributeValueInGs1Integration = gs1Integration.table("gpc_attribute_value", {
	valueCode: text("value_code").primaryKey().notNull(),
	valueTitle: text("value_title").notNull(),
	attributeCode: text("attribute_code").notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("gpc_attribute_value_attribute_idx").using("btree", table.attributeCode.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.attributeCode],
			foreignColumns: [gpcAttributeInGs1Integration.attributeCode],
			name: "gpc_attribute_value_attribute_code_fkey"
		}),
]);

export const gtinSpecificationCheckInGs1Integration = gs1Integration.table("gtin_specification_check", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	gtin: text().notNull(),
	purchaseItemId: uuid("purchase_item_id").notNull(),
	verdict: text().notNull(),
	divergences: jsonb().default([]).notNull(),
	source: text().notNull(),
	specFingerprint: text("spec_fingerprint").notNull(),
	rawResponse: jsonb("raw_response"),
	checkedAt: timestamp("checked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	checkedBy: uuid("checked_by"),
}, (table) => [
	index("gtin_specification_check_gtin_idx").using("btree", table.gtin.asc().nullsLast().op("text_ops"), table.purchaseItemId.asc().nullsLast().op("uuid_ops"), table.checkedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("gtin_specification_check_item_idx").using("btree", table.purchaseItemId.asc().nullsLast().op("text_ops"), table.verdict.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.checkedBy],
			foreignColumns: [usersInAuth.id],
			name: "gtin_specification_check_checked_by_fkey"
		}),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "gtin_specification_check_purchase_item_id_fkey"
		}).onDelete("cascade"),
	check("gtin_specification_check_gtin_check", sql`gtin ~ '^[0-9]{14}$'::text`),
	check("gtin_specification_check_source_check", sql`source = ANY (ARRAY['gs1_api'::text, 'local'::text])`),
	check("gtin_specification_check_verdict_check", sql`verdict = ANY (ARRAY['atende'::text, 'nao_atende'::text, 'indeterminado'::text])`),
]);

export const purchaseItemGpcRequirementInProcurement = procurement.table("purchase_item_gpc_requirement", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	purchaseItemId: uuid("purchase_item_id").notNull(),
	attributeCode: text("attribute_code").notNull(),
	acceptedValueCodes: text("accepted_value_codes").array().notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("purchase_item_gpc_requirement_item_idx").using("btree", table.purchaseItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.attributeCode],
			foreignColumns: [gpcAttributeInGs1Integration.attributeCode],
			name: "purchase_item_gpc_requirement_attribute_code_fkey"
		}),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "purchase_item_gpc_requirement_purchase_item_id_fkey"
		}).onDelete("cascade"),
	unique("purchase_item_gpc_requirement_key").on(table.purchaseItemId, table.attributeCode),
	check("purchase_item_gpc_requirement_accepted_value_codes_check", sql`cardinality(accepted_value_codes) > 0`),
]);

export const equipmentMaintenancePlanInKitchen = kitchen.table("equipment_maintenance_plan", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	roleId: uuid("role_id"),
	modelId: uuid("model_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	code: text(),
	title: text().notNull(),
	kind: text().default('preventive').notNull(),
	intervalDays: integer("interval_days").notNull(),
	toleranceDays: integer("tolerance_days").default(0).notNull(),
	instructions: text(),
	estimatedMinutes: integer("estimated_minutes"),
	isRequired: boolean("is_required").default(true).notNull(),
	sortOrder: integer("sort_order").default(100).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("equipment_maintenance_plan_code_uniq").using("btree", table.code.asc().nullsLast().op("text_ops")).where(sql`(code IS NOT NULL)`),
	index("equipment_maintenance_plan_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops")).where(sql`(deleted_at IS NULL)`),
	index("equipment_maintenance_plan_model_idx").using("btree", table.modelId.asc().nullsLast().op("uuid_ops")).where(sql`((model_id IS NOT NULL) AND (deleted_at IS NULL))`),
	index("equipment_maintenance_plan_role_idx").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")).where(sql`((role_id IS NOT NULL) AND (deleted_at IS NULL))`),
	uniqueIndex("equipment_maintenance_plan_title_uniq").using("btree", sql`COALESCE(role_id, model_id)`, sql`lower(title)`, sql`COALESCE(kitchen_id, (0)::bigint)`).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "equipment_maintenance_plan_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.modelId],
			foreignColumns: [equipmentModelInKitchen.id],
			name: "equipment_maintenance_plan_model_id_fkey"
		}),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [equipmentRoleInKitchen.id],
			name: "equipment_maintenance_plan_role_id_fkey"
		}),
	check("equipment_maintenance_plan_code_scope_check", sql`(code IS NULL) OR (kitchen_id IS NULL)`),
	check("equipment_maintenance_plan_interval_check", sql`interval_days > 0`),
	check("equipment_maintenance_plan_kind_check", sql`kind = ANY (ARRAY['preventive'::text, 'inspection'::text, 'cleaning'::text, 'calibration'::text, 'legal'::text])`),
	check("equipment_maintenance_plan_minutes_check", sql`(estimated_minutes IS NULL) OR (estimated_minutes > 0)`),
	check("equipment_maintenance_plan_target_xor", sql`((role_id IS NOT NULL) AND (model_id IS NULL)) OR ((role_id IS NULL) AND (model_id IS NOT NULL))`),
	check("equipment_maintenance_plan_tolerance_check", sql`(tolerance_days >= 0) AND (tolerance_days < interval_days)`),
]);

export const equipmentMaintenanceLogInKitchen = kitchen.table("equipment_maintenance_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: uuid("unit_id").notNull(),
	planId: uuid("plan_id"),
	issueId: uuid("issue_id"),
	kind: text().default('preventive').notNull(),
	performedOn: date("performed_on").notNull(),
	performedBy: uuid("performed_by"),
	provider: text().default('in_house').notNull(),
	cost: numeric({ mode: "number" }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("equipment_maintenance_log_issue_idx").using("btree", table.issueId.asc().nullsLast().op("uuid_ops")).where(sql`((issue_id IS NOT NULL) AND (deleted_at IS NULL))`),
	index("equipment_maintenance_log_plan_idx").using("btree", table.planId.asc().nullsLast().op("date_ops"), table.unitId.asc().nullsLast().op("uuid_ops"), table.performedOn.desc().nullsFirst().op("uuid_ops")).where(sql`((plan_id IS NOT NULL) AND (deleted_at IS NULL))`),
	index("equipment_maintenance_log_unit_idx").using("btree", table.unitId.asc().nullsLast().op("date_ops"), table.performedOn.desc().nullsFirst().op("date_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.issueId],
			foreignColumns: [equipmentIssueInKitchen.id],
			name: "equipment_maintenance_log_issue_id_fkey"
		}),
	foreignKey({
			columns: [table.performedBy],
			foreignColumns: [usersInAuth.id],
			name: "equipment_maintenance_log_performed_by_fkey"
		}),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [equipmentMaintenancePlanInKitchen.id],
			name: "equipment_maintenance_log_plan_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [equipmentUnitInKitchen.id],
			name: "equipment_maintenance_log_unit_id_fkey"
		}),
	check("equipment_maintenance_log_cost_check", sql`(cost IS NULL) OR (cost >= (0)::numeric)`),
	check("equipment_maintenance_log_kind_check", sql`kind = ANY (ARRAY['preventive'::text, 'inspection'::text, 'cleaning'::text, 'calibration'::text, 'legal'::text, 'corrective'::text])`),
	check("equipment_maintenance_log_provider_check", sql`provider = ANY (ARRAY['in_house'::text, 'contract'::text, 'manufacturer'::text])`),
]);

export const equipmentIssueInKitchen = kitchen.table("equipment_issue", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: uuid("unit_id").notNull(),
	severity: text().notNull(),
	status: text().default('open').notNull(),
	category: text().default('other').notNull(),
	description: text().notNull(),
	reportedBy: uuid("reported_by"),
	reportedAt: timestamp("reported_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	resolvedBy: uuid("resolved_by"),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	resolutionNote: text("resolution_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("equipment_issue_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.reportedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(deleted_at IS NULL)`),
	index("equipment_issue_unit_idx").using("btree", table.unitId.asc().nullsLast().op("timestamptz_ops"), table.reportedAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(deleted_at IS NULL)`),
	index("equipment_issue_unit_open_idx").using("btree", table.unitId.asc().nullsLast().op("text_ops"), table.severity.asc().nullsLast().op("uuid_ops")).where(sql`((status = ANY (ARRAY['open'::text, 'in_repair'::text])) AND (deleted_at IS NULL))`),
	foreignKey({
			columns: [table.reportedBy],
			foreignColumns: [usersInAuth.id],
			name: "equipment_issue_reported_by_fkey"
		}),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [usersInAuth.id],
			name: "equipment_issue_resolved_by_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [equipmentUnitInKitchen.id],
			name: "equipment_issue_unit_id_fkey"
		}),
	check("equipment_issue_category_check", sql`category = ANY (ARRAY['mechanical'::text, 'electrical'::text, 'gas'::text, 'hydraulic'::text, 'refrigeration'::text, 'structural'::text, 'other'::text])`),
	check("equipment_issue_closure_check", sql`((status = ANY (ARRAY['open'::text, 'in_repair'::text])) AND (resolved_at IS NULL) AND (resolved_by IS NULL)) OR ((status = 'resolved'::text) AND (resolved_at IS NOT NULL) AND (resolved_by IS NOT NULL)) OR ((status = 'dismissed'::text) AND (resolved_at IS NOT NULL) AND (resolved_by IS NOT NULL) AND (resolution_note IS NOT NULL) AND (length(btrim(resolution_note)) > 0))`),
	check("equipment_issue_description_check", sql`length(btrim(description)) > 0`),
	check("equipment_issue_severity_check", sql`severity = ANY (ARRAY['degraded'::text, 'inoperative'::text])`),
	check("equipment_issue_status_check", sql`status = ANY (ARRAY['open'::text, 'in_repair'::text, 'resolved'::text, 'dismissed'::text])`),
]);

export const policyStatementInAccessControl = accessControl.table("policy_statement", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	policyId: uuid("policy_id").notNull(),
	module: text().notNull(),
	level: smallint().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("policy_statement_policy_idx").using("btree", table.policyId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "policy_statement_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.messHallId],
			foreignColumns: [messHallsInKitchen.id],
			name: "policy_statement_mess_hall_id_fkey"
		}),
	foreignKey({
			columns: [table.policyId],
			foreignColumns: [policyInAccessControl.id],
			name: "policy_statement_policy_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "policy_statement_unit_id_fkey"
		}),
	check("policy_statement_admin_global_unscoped", sql`(module <> ALL (ARRAY['admin'::text, 'global'::text])) OR ((unit_id IS NULL) AND (kitchen_id IS NULL) AND (mess_hall_id IS NULL))`),
	check("policy_statement_level_check", sql`(level >= 0) AND (level <= 3)`),
	check("policy_statement_single_scope_check", sql`((
CASE
    WHEN (unit_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (kitchen_id IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN (mess_hall_id IS NOT NULL) THEN 1
    ELSE 0
END) <= 1`),
]);

export const userPolicyAttachmentInAccessControl = accessControl.table("user_policy_attachment", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	policyId: uuid("policy_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid("created_by"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("user_policy_attachment_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(expires_at IS NOT NULL)`),
	index("user_policy_attachment_policy_idx").using("btree", table.policyId.asc().nullsLast().op("uuid_ops")),
	index("user_policy_attachment_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.policyId],
			foreignColumns: [policyInAccessControl.id],
			name: "user_policy_attachment_policy_id_fkey"
		}).onDelete("cascade"),
	unique("user_policy_attachment_unique").on(table.userId, table.policyId),
]);

export const policyInAccessControl = accessControl.table("policy", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	managed: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("policy_name_unique_alive_idx").using("btree", table.name.asc().nullsLast().op("text_ops")).where(sql`(deleted_at IS NULL)`),
]);

export const importBatchInSiafiIntegration = siafiIntegration.table("import_batch", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	reportType: text("report_type").notNull(),
	fileName: text("file_name").notNull(),
	contentHash: text("content_hash").notNull(),
	competencia: date(),
	status: text().default('parsed').notNull(),
	totalRows: integer("total_rows").default(0).notNull(),
	recognizedRows: integer("recognized_rows").default(0).notNull(),
	appliedRows: integer("applied_rows").default(0).notNull(),
	errorMessage: text("error_message"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("import_batch_unit_idx").using("btree", table.unitId.asc().nullsLast().op("timestamptz_ops"), table.reportType.asc().nullsLast().op("int8_ops"), table.createdAt.desc().nullsFirst().op("int8_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "import_batch_created_by_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "import_batch_unit_id_fkey"
		}),
	unique("import_batch_hash_key").on(table.unitId, table.contentHash),
	check("import_batch_report_type_check", sql`report_type = ANY (ARRAY['credito'::text, 'ne'::text, 'ns'::text, 'ob'::text])`),
	check("import_batch_status_check", sql`status = ANY (ARRAY['parsed'::text, 'applied'::text, 'failed'::text])`),
]);

export const importRowInSiafiIntegration = siafiIntegration.table("import_row", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	batchId: uuid("batch_id").notNull(),
	rowNumber: integer("row_number").notNull(),
	raw: jsonb().notNull(),
	parsed: jsonb(),
	parseStatus: text("parse_status").default('pending').notNull(),
	parseError: text("parse_error"),
	appliedTable: text("applied_table"),
	appliedId: uuid("applied_id"),
}, (table) => [
	index("import_row_batch_status_idx").using("btree", table.batchId.asc().nullsLast().op("uuid_ops"), table.parseStatus.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [importBatchInSiafiIntegration.id],
			name: "import_row_batch_id_fkey"
		}).onDelete("cascade"),
	unique("import_row_batch_number_key").on(table.batchId, table.rowNumber),
	check("import_row_parse_status_check", sql`parse_status = ANY (ARRAY['pending'::text, 'parsed'::text, 'unrecognized'::text, 'invalid'::text])`),
]);

export const budgetCreditInFinance = finance.table("budget_credit", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	ug: text(),
	nd: text().notNull(),
	ptres: text(),
	fonte: text(),
	competencia: date().notNull(),
	dotacao: numeric({ mode: "number", precision: 14, scale: 2 }).default(0).notNull(),
	empenhadoSiafi: numeric("empenhado_siafi", { mode: "number", precision: 14, scale: 2 }).default(0).notNull(),
	saldoSiafi: numeric("saldo_siafi", { mode: "number", precision: 14, scale: 2 }).default(0).notNull(),
	snapshotAt: timestamp("snapshot_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	importBatchId: uuid("import_batch_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("budget_credit_nd_idx").using("btree", table.unitId.asc().nullsLast().op("text_ops"), table.nd.asc().nullsLast().op("int8_ops")),
	index("budget_credit_unit_competencia_idx").using("btree", table.unitId.asc().nullsLast().op("int8_ops"), table.competencia.desc().nullsFirst().op("int8_ops")),
	foreignKey({
			columns: [table.importBatchId],
			foreignColumns: [importBatchInSiafiIntegration.id],
			name: "budget_credit_import_batch_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "budget_credit_unit_id_fkey"
		}),
	unique("budget_credit_classification_key").on(table.unitId, table.ug, table.nd, table.ptres, table.fonte, table.competencia),
]);

export const empenhoInFinance = finance.table("empenho", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: integer("unit_id").notNull(),
	arpItemId: uuid("arp_item_id").notNull(),
	numeroEmpenho: text("numero_empenho").notNull(),
	dataEmpenho: date("data_empenho").notNull(),
	quantidadeEmpenhada: numeric("quantidade_empenhada", { mode: "number", precision: 14, scale: 4 }).notNull(),
	valorUnitario: numeric("valor_unitario", { mode: "number", precision: 12, scale: 4 }).notNull(),
	valorTotal: numeric("valor_total", { mode: "number", precision: 14, scale: 4 }).notNull(),
	notaLancamento: text("nota_lancamento"),
	status: text().default('ativo').notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tipo: text(),
	favorecidoCnpj: text("favorecido_cnpj"),
	favorecidoNome: text("favorecido_nome"),
	nd: text(),
	ptres: text(),
	fonte: text(),
	ugEmitente: text("ug_emitente"),
	exercicio: integer(),
	origem: text().default('manual').notNull(),
	siafiSyncedAt: timestamp("siafi_synced_at", { withTimezone: true, mode: 'string' }),
	importBatchId: uuid("import_batch_id"),
	rpInscrito: boolean("rp_inscrito").default(false).notNull(),
	rpTipo: text("rp_tipo"),
	rpExercicio: integer("rp_exercicio"),
}, (table) => [
	index("empenho_exercicio_idx").using("btree", table.unitId.asc().nullsLast().op("int4_ops"), table.exercicio.asc().nullsLast().op("int4_ops")),
	index("empenho_nd_idx").using("btree", table.unitId.asc().nullsLast().op("text_ops"), table.nd.asc().nullsLast().op("text_ops")).where(sql`(nd IS NOT NULL)`),
	index("idx_empenho_arp_item").using("btree", table.arpItemId.asc().nullsLast().op("uuid_ops")),
	index("idx_empenho_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_empenho_unit").using("btree", table.unitId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.arpItemId],
			foreignColumns: [procurementArpItemInProcurement.id],
			name: "empenho_arp_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "empenho_created_by_fkey"
		}),
	foreignKey({
			columns: [table.importBatchId],
			foreignColumns: [importBatchInSiafiIntegration.id],
			name: "empenho_import_batch_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "empenho_unit_id_fkey"
		}),
	unique("empenho_unit_id_numero_empenho_key").on(table.unitId, table.numeroEmpenho),
	check("empenho_favorecido_cnpj_check", sql`(favorecido_cnpj IS NULL) OR (favorecido_cnpj ~ '^[0-9]{14}$'::text)`),
	check("empenho_origem_check", sql`origem = ANY (ARRAY['manual'::text, 'siafi'::text])`),
	check("empenho_quantidade_empenhada_check", sql`quantidade_empenhada > (0)::numeric`),
	check("empenho_rp_tipo_check", sql`(rp_tipo IS NULL) OR (rp_tipo = ANY (ARRAY['processado'::text, 'nao_processado'::text]))`),
	check("empenho_status_check", sql`status = ANY (ARRAY['ativo'::text, 'anulado'::text])`),
	check("empenho_tipo_check", sql`tipo = ANY (ARRAY['ordinario'::text, 'estimativo'::text, 'global'::text])`),
]);

export const empenhoEventInFinance = finance.table("empenho_event", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	empenhoId: uuid("empenho_id").notNull(),
	tipo: text().notNull(),
	valor: numeric({ mode: "number", precision: 14, scale: 2 }).notNull(),
	data: date().default(sql`CURRENT_DATE`).notNull(),
	documento: text(),
	justificativa: text().notNull(),
	origem: text().default('manual').notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("empenho_event_empenho_idx").using("btree", table.empenhoId.asc().nullsLast().op("date_ops"), table.data.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "empenho_event_created_by_fkey"
		}),
	foreignKey({
			columns: [table.empenhoId],
			foreignColumns: [empenhoInFinance.id],
			name: "empenho_event_empenho_id_fkey"
		}).onDelete("cascade"),
	check("empenho_event_justificativa_check", sql`btrim(justificativa) <> ''::text`),
	check("empenho_event_origem_check", sql`origem = ANY (ARRAY['manual'::text, 'siafi'::text])`),
	check("empenho_event_tipo_check", sql`tipo = ANY (ARRAY['reforco'::text, 'anulacao'::text, 'cancelamento'::text, 'rp_inscricao'::text])`),
	check("empenho_event_valor_check", sql`valor >= (0)::numeric`),
]);

export const liquidacaoInFinance = finance.table("liquidacao", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	empenhoId: uuid("empenho_id").notNull(),
	numeroNs: text("numero_ns").notNull(),
	data: date().notNull(),
	valor: numeric({ mode: "number", precision: 14, scale: 2 }).notNull(),
	competencia: date(),
	goodsReceiptId: uuid("goods_receipt_id"),
	nfeDocumentId: uuid("nfe_document_id"),
	observacao: text(),
	origem: text().default('manual').notNull(),
	importBatchId: uuid("import_batch_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("liquidacao_empenho_idx").using("btree", table.empenhoId.asc().nullsLast().op("uuid_ops")),
	index("liquidacao_receipt_idx").using("btree", table.goodsReceiptId.asc().nullsLast().op("uuid_ops")).where(sql`(goods_receipt_id IS NOT NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "liquidacao_created_by_fkey"
		}),
	foreignKey({
			columns: [table.empenhoId],
			foreignColumns: [empenhoInFinance.id],
			name: "liquidacao_empenho_id_fkey"
		}),
	foreignKey({
			columns: [table.goodsReceiptId],
			foreignColumns: [goodsReceiptInInventory.id],
			name: "liquidacao_goods_receipt_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.importBatchId],
			foreignColumns: [importBatchInSiafiIntegration.id],
			name: "liquidacao_import_batch_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.nfeDocumentId],
			foreignColumns: [nfeDocumentInInventory.id],
			name: "liquidacao_nfe_document_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "liquidacao_unit_id_fkey"
		}),
	unique("liquidacao_numero_key").on(table.unitId, table.numeroNs),
	check("liquidacao_origem_check", sql`origem = ANY (ARRAY['manual'::text, 'siafi'::text])`),
	check("liquidacao_valor_check", sql`valor > (0)::numeric`),
]);

export const pagamentoInFinance = finance.table("pagamento", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	liquidacaoId: uuid("liquidacao_id").notNull(),
	numeroOb: text("numero_ob").notNull(),
	data: date().notNull(),
	valor: numeric({ mode: "number", precision: 14, scale: 2 }).notNull(),
	banco: text(),
	agencia: text(),
	conta: text(),
	origem: text().default('manual').notNull(),
	importBatchId: uuid("import_batch_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("pagamento_liquidacao_idx").using("btree", table.liquidacaoId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "pagamento_created_by_fkey"
		}),
	foreignKey({
			columns: [table.importBatchId],
			foreignColumns: [importBatchInSiafiIntegration.id],
			name: "pagamento_import_batch_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.liquidacaoId],
			foreignColumns: [liquidacaoInFinance.id],
			name: "pagamento_liquidacao_id_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "pagamento_unit_id_fkey"
		}),
	unique("pagamento_numero_key").on(table.unitId, table.numeroOb),
	check("pagamento_origem_check", sql`origem = ANY (ARRAY['manual'::text, 'siafi'::text])`),
	check("pagamento_valor_check", sql`valor > (0)::numeric`),
]);

export const folderReviewInKitchen = kitchen.table("folder_review", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	folderId: uuid("folder_id").notNull(),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
	note: text(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("folder_review_folder_idx").using("btree", table.folderId.asc().nullsLast().op("timestamptz_ops"), table.reviewedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.folderId],
			foreignColumns: [folderInKitchen.id],
			name: "folder_review_folder_id_fkey"
		}).onDelete("cascade"),
]);

export const reconciliationDecisionInFinance = finance.table("reconciliation_decision", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	documentoTipo: text("documento_tipo").notNull(),
	numeroDocumento: text("numero_documento").notNull(),
	valorSisub: numeric("valor_sisub", { mode: "number", precision: 14, scale: 2 }),
	valorSiafi: numeric("valor_siafi", { mode: "number", precision: 14, scale: 2 }),
	decisao: text().notNull(),
	justificativa: text(),
	decidedBy: uuid("decided_by"),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.decidedBy],
			foreignColumns: [usersInAuth.id],
			name: "reconciliation_decision_decided_by_fkey"
		}),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "reconciliation_decision_unit_id_fkey"
		}),
	unique("reconciliation_decision_key").on(table.unitId, table.documentoTipo, table.numeroDocumento),
	check("reconciliation_decision_decisao_check", sql`decisao = ANY (ARRAY['adotado_siafi'::text, 'mantido_local'::text])`),
	check("reconciliation_decision_documento_tipo_check", sql`documento_tipo = ANY (ARRAY['ne'::text, 'ns'::text, 'ob'::text])`),
]);

export const procurementListItemInProcurement = procurement.table("procurement_list_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	listId: uuid("list_id").notNull(),
	ingredientId: uuid("ingredient_id"),
	catmatItemCodigo: integer("catmat_item_codigo"),
	catmatItemDescricao: text("catmat_item_descricao"),
	ingredientName: text("ingredient_name").notNull(),
	folderId: text("folder_id"),
	folderDescription: text("folder_description"),
	measureUnit: text("measure_unit"),
	totalQuantity: numeric("total_quantity", { mode: "number", precision: 14, scale: 4 }).notNull(),
	unitPrice: numeric("unit_price", { mode: "number", precision: 12, scale: 4 }),
	purchaseItemId: uuid("purchase_item_id"),
	purchaseItemDescription: text("purchase_item_description"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	purchaseQuantity: numeric("purchase_quantity", { mode: "number", precision: 14, scale: 4 }),
	conversionFactor: numeric("conversion_factor", { mode: "number", precision: 12, scale: 6 }),
	itemDescription: text("item_description"),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }),
	maxMarginPercent: smallint("max_margin_percent"),
	deliveryCycle: text("delivery_cycle"),
	minOrderQuantity: numeric("min_order_quantity", { mode: "number", precision: 14, scale: 4 }),
}, (table) => [
	index("idx_procurement_list_item_list_id").using("btree", table.listId.asc().nullsLast().op("uuid_ops")),
	index("procurement_list_item_purchase_item_idx").using("btree", table.purchaseItemId.asc().nullsLast().op("uuid_ops")).where(sql`(purchase_item_id IS NOT NULL)`),
	foreignKey({
			columns: [table.listId],
			foreignColumns: [procurementListInProcurement.id],
			name: "procurement_ata_item_ata_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "procurement_ata_item_product_id_fkey"
		}),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "procurement_list_item_purchase_item_id_fkey"
		}),
	check("procurement_list_item_delivery_cycle_check", sql`(delivery_cycle IS NULL) OR (delivery_cycle = ANY (ARRAY['weekly'::text, 'monthly'::text]))`),
	check("procurement_list_item_max_margin_percent_check", sql`(max_margin_percent IS NULL) OR ((max_margin_percent >= 0) AND (max_margin_percent <= 100))`),
	check("procurement_list_item_min_order_quantity_check", sql`(min_order_quantity IS NULL) OR (min_order_quantity > (0)::numeric)`),
]);

export const trainingResetLogInKitchen = kitchen.table("training_reset_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	actorId: uuid("actor_id").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	durationMs: integer("duration_ms"),
	deletedCounts: jsonb("deleted_counts").default({}).notNull(),
	status: text().default('running').notNull(),
	errorMessage: text("error_message"),
	queuedMs: integer("queued_ms"),
}, (table) => [
	index("training_reset_log_started_idx").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	check("training_reset_log_status_check", sql`status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text, 'abandoned'::text])`),
]);

export const superAdminControllerInKitchen = kitchen.table("super_admin_controller", {
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	key: text().primaryKey().notNull(),
	active: boolean(),
	value: text(),
}, (table) => [
	unique("super_admin_controller_key_key").on(table.key),
]);

export const migrationFolderLookupInKitchen = kitchen.table("migration_folder_lookup", {
	legacyIdGrupoProduto: integer("legacy_id_grupo_produto").primaryKey().notNull(),
	newFolderId: uuid("new_folder_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("migration_folder_lookup_new_folder_id_key").on(table.newFolderId),
]);

export const migrationProductLookupInKitchen = kitchen.table("migration_product_lookup", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyIdInsumo: bigint("legacy_id_insumo", { mode: "number" }).primaryKey().notNull(),
	newProductId: uuid("new_product_id").notNull(),
	legacyDescricao: text("legacy_descricao"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_migration_product_lookup_new_id").using("btree", table.newProductId.asc().nullsLast().op("uuid_ops")),
	unique("migration_product_lookup_new_product_id_key").on(table.newProductId),
]);

export const userPermissionsInAccessControl = accessControl.table("user_permissions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	module: text().notNull(),
	level: integer().default(1).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_user_permissions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("user_permissions_allow_uniq").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.module.asc().nullsLast().op("int8_ops"), table.messHallId.asc().nullsLast().op("int8_ops"), table.kitchenId.asc().nullsLast().op("int8_ops"), table.unitId.asc().nullsLast().op("int8_ops")).where(sql`(level > 0)`),
	uniqueIndex("user_permissions_deny_uniq").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.module.asc().nullsLast().op("int8_ops"), table.messHallId.asc().nullsLast().op("int8_ops"), table.kitchenId.asc().nullsLast().op("int8_ops"), table.unitId.asc().nullsLast().op("uuid_ops")).where(sql`(level <= 0)`),
	index("user_permissions_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(expires_at IS NOT NULL)`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "user_permissions_kitchen_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.messHallId],
			foreignColumns: [messHallsInKitchen.id],
			name: "user_permissions_mess_hall_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "user_permissions_unit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "user_permissions_user_id_fkey"
		}).onDelete("cascade"),
	check("exclusive_scope", sql`num_nonnulls(mess_hall_id, kitchen_id, unit_id) <= 1`),
	check("user_permissions_admin_global_unscoped", sql`(module <> ALL (ARRAY['admin'::text, 'global'::text])) OR ((unit_id IS NULL) AND (kitchen_id IS NULL) AND (mess_hall_id IS NULL))`),
]);

export const userMilitaryDataInCore = core.table("user_military_data", {
	nrOrdem: text(),
	nrCpf: text().primaryKey().notNull(),
	nmGuerra: text(),
	nmPessoa: text(),
	sgPosto: text(),
	sgOrg: text(),
	dataAtualizacao: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	index("user_military_data_dataAtualizacao_idx").using("btree", table.dataAtualizacao.asc().nullsLast().op("timestamptz_ops")),
	index("user_military_data_nrOrdem_idx").using("btree", table.nrOrdem.asc().nullsLast().op("text_ops")),
]);

export const openingBalanceInInventory = inventory.table("opening_balance", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	status: text().default('draft').notNull(),
	source: text().notNull(),
	sourceFilename: text("source_filename"),
	notes: text(),
	importRejections: jsonb("import_rejections").default([]).notNull(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	postedBy: uuid("posted_by"),
	postedAt: timestamp("posted_at", { withTimezone: true, mode: 'string' }),
	postedValue: numeric("posted_value", { mode: "number", precision: 14, scale: 4 }),
	cancelledBy: uuid("cancelled_by"),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("opening_balance_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.createdAt.desc().nullsFirst().op("int8_ops")),
	uniqueIndex("opening_balance_one_draft_per_kitchen").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops")).where(sql`(status = 'draft'::text)`),
	foreignKey({
			columns: [table.cancelledBy],
			foreignColumns: [usersInAuth.id],
			name: "opening_balance_cancelled_by_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "opening_balance_created_by_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "opening_balance_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.postedBy],
			foreignColumns: [usersInAuth.id],
			name: "opening_balance_posted_by_fkey"
		}),
	check("opening_balance_cancelled_consistent", sql`(status = 'cancelled'::text) = ((cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL))`),
	check("opening_balance_notes_check", sql`length(notes) <= 1000`),
	check("opening_balance_posted_consistent", sql`(status = 'posted'::text) = ((posted_at IS NOT NULL) AND (posted_by IS NOT NULL))`),
	check("opening_balance_source_check", sql`source = ANY (ARRAY['spreadsheet'::text, 'catalog_sheet'::text])`),
	check("opening_balance_source_filename_check", sql`length(source_filename) <= 200`),
	check("opening_balance_status_check", sql`status = ANY (ARRAY['draft'::text, 'posted'::text, 'cancelled'::text])`),
]);

export const openingBalanceItemInInventory = inventory.table("opening_balance_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	openingBalanceId: uuid("opening_balance_id").notNull(),
	lineNumber: integer("line_number").notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	quantity: numeric({ mode: "number", precision: 14, scale: 4 }).notNull(),
	lotCode: text("lot_code"),
	expiryDate: date("expiry_date"),
	location: text(),
	unitCost: numeric("unit_cost", { mode: "number", precision: 12, scale: 4 }),
	costSource: text("cost_source"),
	costReference: text("cost_reference"),
	lotId: uuid("lot_id"),
	movementId: uuid("movement_id"),
}, (table) => [
	index("opening_balance_item_doc_idx").using("btree", table.openingBalanceId.asc().nullsLast().op("int4_ops"), table.lineNumber.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("opening_balance_item_unique_lot").using("btree", sql`opening_balance_id`, sql`ingredient_id`, sql`COALESCE(lot_code, ''::text)`, sql`COALESCE(expiry_date, 'infinity'::date)`),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "opening_balance_item_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.lotId],
			foreignColumns: [stockLotInInventory.id],
			name: "opening_balance_item_lot_id_fkey"
		}),
	foreignKey({
			columns: [table.movementId],
			foreignColumns: [stockMovementInInventory.id],
			name: "opening_balance_item_movement_id_fkey"
		}),
	foreignKey({
			columns: [table.openingBalanceId],
			foreignColumns: [openingBalanceInInventory.id],
			name: "opening_balance_item_opening_balance_id_fkey"
		}).onDelete("cascade"),
	check("opening_balance_item_cost_has_source", sql`(unit_cost IS NULL) = (cost_source IS NULL)`),
	check("opening_balance_item_cost_reference_check", sql`length(cost_reference) <= 200`),
	check("opening_balance_item_cost_source_check", sql`cost_source = ANY (ARRAY['ata'::text, 'price_research'::text, 'manual'::text])`),
	check("opening_balance_item_line_number_check", sql`line_number > 0`),
	check("opening_balance_item_location_check", sql`length(location) <= 60`),
	check("opening_balance_item_lot_code_check", sql`length(lot_code) <= 60`),
	check("opening_balance_item_quantity_check", sql`quantity > (0)::numeric`),
	check("opening_balance_item_unit_cost_check", sql`unit_cost > (0)::numeric`),
]);

export const comprasMaterialGrupoInComprasGovIntegration = comprasGovIntegration.table("compras_material_grupo", {
	codigoGrupo: integer("codigo_grupo").primaryKey().notNull(),
	nomeGrupo: text("nome_grupo").notNull(),
	statusGrupo: boolean("status_grupo").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const comprasMaterialClasseInComprasGovIntegration = comprasGovIntegration.table("compras_material_classe", {
	codigoClasse: integer("codigo_classe").primaryKey().notNull(),
	codigoGrupo: integer("codigo_grupo").notNull(),
	nomeClasse: text("nome_classe").notNull(),
	statusClasse: boolean("status_classe").default(true).notNull(),
	dataHoraAtualizacao: timestamp("data_hora_atualizacao", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.codigoGrupo],
			foreignColumns: [comprasMaterialGrupoInComprasGovIntegration.codigoGrupo],
			name: "compras_material_classe_codigo_grupo_fkey"
		}),
]);

export const comprasMaterialNaturezaDespesaInComprasGovIntegration = comprasGovIntegration.table("compras_material_natureza_despesa", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	codigoPdm: integer("codigo_pdm").notNull(),
	codigoNaturezaDespesa: text("codigo_natureza_despesa").notNull(),
	nomeNaturezaDespesa: text("nome_natureza_despesa").notNull(),
	statusNaturezaDespesa: boolean("status_natureza_despesa").default(true).notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_material_natureza_des_codigo_pdm_codigo_natureza_de_key").on(table.codigoPdm, table.codigoNaturezaDespesa),
]);

export const goodsReceiptItemInInventory = inventory.table("goods_receipt_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	receiptId: uuid("receipt_id").notNull(),
	nfeItemId: uuid("nfe_item_id"),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	ingredientItemId: uuid("ingredient_item_id"),
	purchaseItemId: uuid("purchase_item_id"),
	invoicedQtyBase: numeric("invoiced_qty_base", { mode: "number", precision: 14, scale: 4 }),
	receivedQtyBase: numeric("received_qty_base", { mode: "number", precision: 14, scale: 4 }).notNull(),
	unitCost: numeric("unit_cost", { mode: "number", precision: 12, scale: 4 }),
	divergenceReason: text("divergence_reason"),
}, (table) => [
	index("goods_receipt_item_receipt_idx").using("btree", table.receiptId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "goods_receipt_item_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "goods_receipt_item_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientItemId],
			foreignColumns: [ingredientItemInKitchen.id],
			name: "goods_receipt_item_ingredient_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.nfeItemId],
			foreignColumns: [nfeItemInInventory.id],
			name: "goods_receipt_item_nfe_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "goods_receipt_item_purchase_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.receiptId],
			foreignColumns: [goodsReceiptInInventory.id],
			name: "goods_receipt_item_receipt_id_fkey"
		}).onDelete("cascade"),
	check("goods_receipt_item_received_qty_base_check", sql`received_qty_base >= (0)::numeric`),
	check("goods_receipt_item_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) = 1`),
]);

export const kitchenStockSettingsInInventory = inventory.table("kitchen_stock_settings", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).primaryKey().notNull(),
	segregation: text().default('dual').notNull(),
	adjustmentApprovalValue: numeric("adjustment_approval_value", { mode: "number", precision: 14, scale: 2 }).default(500).notNull(),
	issueTolerancePct: numeric("issue_tolerance_pct", { mode: "number", precision: 5, scale: 2 }).default(10).notNull(),
	issueToleranceFloorValue: numeric("issue_tolerance_floor_value", { mode: "number", precision: 14, scale: 2 }).default(20).notNull(),
	countTolerancePct: numeric("count_tolerance_pct", { mode: "number", precision: 5, scale: 2 }).default(5).notNull(),
	countToleranceValue: numeric("count_tolerance_value", { mode: "number", precision: 14, scale: 2 }).default(50).notNull(),
	updatedBy: uuid("updated_by"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "kitchen_stock_settings_kitchen_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [usersInAuth.id],
			name: "kitchen_stock_settings_updated_by_fkey"
		}),
	check("kitchen_stock_settings_adjustment_approval_value_check", sql`adjustment_approval_value >= (0)::numeric`),
	check("kitchen_stock_settings_count_tolerance_pct_check", sql`(count_tolerance_pct >= (0)::numeric) AND (count_tolerance_pct <= (100)::numeric)`),
	check("kitchen_stock_settings_count_tolerance_value_check", sql`count_tolerance_value >= (0)::numeric`),
	check("kitchen_stock_settings_issue_tolerance_floor_value_check", sql`issue_tolerance_floor_value >= (0)::numeric`),
	check("kitchen_stock_settings_issue_tolerance_pct_check", sql`(issue_tolerance_pct >= (0)::numeric) AND (issue_tolerance_pct <= (100)::numeric)`),
	check("kitchen_stock_settings_segregation_check", sql`segregation = ANY (ARRAY['strict'::text, 'dual'::text])`),
]);

export const menuGroupSetInKitchen = kitchen.table("menu_group_set", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	slug: text(),
	sortOrder: smallint("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("menu_group_set_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops")).where(sql`(deleted_at IS NULL)`),
	uniqueIndex("menu_group_set_slug_key").using("btree", table.slug.asc().nullsLast().op("text_ops")).where(sql`((slug IS NOT NULL) AND (deleted_at IS NULL))`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "menu_group_set_kitchen_id_fkey"
		}),
	check("menu_group_set_name_not_blank", sql`btrim(name) <> ''::text`),
	check("menu_group_set_slug_is_global", sql`(slug IS NULL) OR (kitchen_id IS NULL)`),
	check("menu_group_set_slug_shape", sql`(slug IS NULL) OR (slug ~ '^[a-z][a-z0-9_]{1,39}$'::text)`),
]);

export const menuGroupInKitchen = kitchen.table("menu_group", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	groupSetId: uuid("group_set_id").notNull(),
	key: text().notNull(),
	label: text().notNull(),
	sortOrder: smallint("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("menu_group_set_idx").using("btree", table.groupSetId.asc().nullsLast().op("int2_ops"), table.sortOrder.asc().nullsLast().op("int2_ops")),
	foreignKey({
			columns: [table.groupSetId],
			foreignColumns: [menuGroupSetInKitchen.id],
			name: "menu_group_group_set_id_fkey"
		}).onDelete("cascade"),
	unique("menu_group_key_unique").on(table.groupSetId, table.key),
	check("menu_group_key_shape", sql`key ~ '^[a-z][a-z0-9_]{1,39}$'::text`),
	check("menu_group_label_not_blank", sql`btrim(label) <> ''::text`),
]);

export const menuItemsInKitchen = kitchen.table("menu_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	dailyMenuId: uuid("daily_menu_id"),
	recipe: json(),
	plannedPortionQuantity: numeric("planned_portion_quantity", { mode: "number" }),
	excludedFromProcurement: numeric("excluded_from_procurement", { mode: "number" }),
	substitutions: json(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	recipeOriginId: uuid("recipe_origin_id"),
	itemGroup: text("item_group"),
	sortOrder: smallint("sort_order").default(0).notNull(),
	recommendedProportion: numeric("recommended_proportion", { mode: "number" }),
	originTemplateId: uuid("origin_template_id"),
	originTemplateType: text("origin_template_type"),
	originSnackRequestId: uuid("origin_snack_request_id"),
}, (table) => [
	index("menu_items_origin_snack_request_idx").using("btree", table.originSnackRequestId.asc().nullsLast().op("uuid_ops")).where(sql`(origin_snack_request_id IS NOT NULL)`),
	index("menu_items_origin_template_id_idx").using("btree", table.originTemplateId.asc().nullsLast().op("uuid_ops")).where(sql`(origin_template_id IS NOT NULL)`),
	foreignKey({
			columns: [table.dailyMenuId],
			foreignColumns: [dailyMenuInKitchen.id],
			name: "menu_items_daily_menu_id_fkey"
		}),
	foreignKey({
			columns: [table.originSnackRequestId],
			foreignColumns: [snackRequestInKitchen.id],
			name: "menu_items_origin_snack_request_id_fkey"
		}),
	foreignKey({
			columns: [table.originTemplateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "menu_items_origin_template_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.recipeOriginId],
			foreignColumns: [recipesInKitchen.id],
			name: "menu_items_recipe_origin_id_fkey"
		}),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	check("menu_items_origin_template_type_check", sql`origin_template_type = ANY (ARRAY['weekly'::text, 'event'::text, 'exception'::text])`),
	check("menu_items_recommended_proportion_range", sql`(recommended_proportion IS NULL) OR ((recommended_proportion >= (0)::numeric) AND (recommended_proportion <= (300)::numeric))`),
]);

export const measureUnitInCore = core.table("measure_unit", {
	code: text().primaryKey().notNull(),
	description: text().notNull(),
	dimension: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	pgPolicy("measure_unit_read", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`true` }),
	check("measure_unit_code_check", sql`(code = upper(btrim(code))) AND (code <> ''::text)`),
	check("measure_unit_dimension_check", sql`dimension = ANY (ARRAY['mass'::text, 'volume'::text, 'count'::text, 'package'::text])`),
]);

export const stockMovementInInventory = inventory.table("stock_movement", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	lotId: uuid("lot_id"),
	type: text().notNull(),
	quantity: numeric({ mode: "number", precision: 14, scale: 4 }).notNull(),
	unitCost: numeric("unit_cost", { mode: "number", precision: 12, scale: 4 }),
	totalCost: numeric("total_cost", { mode: "number", precision: 14, scale: 4 }),
	justification: text(),
	productionTaskId: uuid("production_task_id"),
	inventoryCountId: uuid("inventory_count_id"),
	transferPairId: uuid("transfer_pair_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	goodsReceiptItemId: uuid("goods_receipt_item_id"),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	reasonCode: text("reason_code"),
	issueRequestId: uuid("issue_request_id"),
	emissionId: text("emission_id"),
}, (table) => [
	index("stock_movement_created_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("stock_movement_emission_key").using("btree", sql`emission_id`, sql`COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`(emission_id IS NOT NULL)`),
	index("stock_movement_issue_request_idx").using("btree", table.issueRequestId.asc().nullsLast().op("uuid_ops")).where(sql`(issue_request_id IS NOT NULL)`),
	index("stock_movement_kitchen_item_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.ingredientId.asc().nullsLast().op("uuid_ops"), table.frozenPreparationId.asc().nullsLast().op("int8_ops")),
	index("stock_movement_lot_idx").using("btree", table.lotId.asc().nullsLast().op("uuid_ops")),
	index("stock_movement_occurred_idx").using("btree", table.kitchenId.asc().nullsLast().op("timestamptz_ops"), table.occurredAt.desc().nullsFirst().op("int8_ops")),
	index("stock_movement_task_idx").using("btree", table.productionTaskId.asc().nullsLast().op("uuid_ops")).where(sql`(production_task_id IS NOT NULL)`),
	foreignKey({
			columns: [table.inventoryCountId],
			foreignColumns: [inventoryCountInInventory.id],
			name: "stock_movement_count_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "stock_movement_created_by_fkey"
		}),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "stock_movement_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.goodsReceiptItemId],
			foreignColumns: [goodsReceiptItemInInventory.id],
			name: "stock_movement_goods_receipt_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "stock_movement_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.issueRequestId],
			foreignColumns: [stockIssueRequestInInventory.id],
			name: "stock_movement_issue_request_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "stock_movement_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.lotId],
			foreignColumns: [stockLotInInventory.id],
			name: "stock_movement_lot_id_fkey"
		}),
	foreignKey({
			columns: [table.productionTaskId],
			foreignColumns: [productionTaskInKitchen.id],
			name: "stock_movement_production_task_id_fkey"
		}).onDelete("set null"),
	check("stock_movement_adjustment_justified", sql`(type <> ALL (ARRAY['adjustment_in'::text, 'adjustment_out'::text])) OR (justification IS NOT NULL)`),
	check("stock_movement_item_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) = 1`),
	check("stock_movement_quantity_check", sql`quantity > (0)::numeric`),
	check("stock_movement_reason_code_check", sql`reason_code = ANY (ARRAY['expired'::text, 'spoiled'::text, 'damaged'::text, 'cold_chain_failure'::text, 'sanitary_recall'::text, 'lost'::text, 'theft'::text, 'quality_sample'::text, 'supplier_return'::text, 'donation'::text, 'entry_error_in'::text, 'entry_error_out'::text, 'count_gain'::text, 'count_loss'::text, 'found_stock'::text, 'opening_balance'::text, 'production_leftover_discard'::text])`),
	check("stock_movement_reason_direction", sql`(reason_code IS NULL) OR ((reason_code = ANY (ARRAY['entry_error_in'::text, 'count_gain'::text, 'found_stock'::text, 'opening_balance'::text])) AND (type = 'adjustment_in'::text)) OR ((reason_code = ANY (ARRAY['expired'::text, 'spoiled'::text, 'damaged'::text, 'cold_chain_failure'::text, 'sanitary_recall'::text, 'lost'::text, 'theft'::text, 'quality_sample'::text, 'supplier_return'::text, 'donation'::text, 'entry_error_out'::text, 'count_loss'::text])) AND (type = 'adjustment_out'::text)) OR ((reason_code = 'production_leftover_discard'::text) AND (type = 'waste'::text))`),
	check("stock_movement_reason_required", sql`(type <> ALL (ARRAY['waste'::text, 'adjustment_in'::text, 'adjustment_out'::text])) OR (reason_code IS NOT NULL)`),
	check("stock_movement_type_check", sql`type = ANY (ARRAY['receipt'::text, 'production_issue'::text, 'issue_return'::text, 'leftover_return'::text, 'waste'::text, 'transfer_in'::text, 'transfer_out'::text, 'lot_split_in'::text, 'lot_split_out'::text, 'adjustment_in'::text, 'adjustment_out'::text])`),
]);

export const countScopeItemInInventory = inventory.table("count_scope_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	countId: uuid("count_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	found: boolean().default(false).notNull(),
	notCountedAccepted: boolean("not_counted_accepted").default(false).notNull(),
	open: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("count_scope_item_count_idx").using("btree", table.countId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("count_scope_item_key").using("btree", sql`count_id`, sql`COALESCE(ingredient_id, frozen_preparation_id)`),
	uniqueIndex("count_scope_item_open_key").using("btree", sql`kitchen_id`, sql`COALESCE(ingredient_id, frozen_preparation_id)`).where(sql`open`),
	foreignKey({
			columns: [table.countId],
			foreignColumns: [inventoryCountInInventory.id],
			name: "count_scope_item_count_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "count_scope_item_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "count_scope_item_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "count_scope_item_kitchen_id_fkey"
		}),
	check("count_scope_item_target", sql`((ingredient_id IS NOT NULL) AND (frozen_preparation_id IS NULL)) OR ((ingredient_id IS NULL) AND (frozen_preparation_id IS NOT NULL))`),
]);

export const itemInCore = core.table("item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kind: text().default('insumo').notNull(),
	description: text().notNull(),
	catalogScope: text("catalog_scope").default('alimentacao').notNull(),
	measureUnit: text("measure_unit"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("item_kind_idx").using("btree", table.kind.asc().nullsLast().op("text_ops")).where(sql`(deleted_at IS NULL)`),
	index("item_scope_idx").using("btree", table.catalogScope.asc().nullsLast().op("text_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.measureUnit],
			foreignColumns: [measureUnitInCore.code],
			name: "item_measure_unit_fkey"
		}),
	check("item_catalog_scope_check", sql`catalog_scope = ANY (ARRAY['alimentacao'::text, 'auxiliar'::text, 'permanente'::text])`),
	check("item_description_check", sql`btrim(description) <> ''::text`),
	check("item_kind_check", sql`kind = ANY (ARRAY['insumo'::text, 'equipamento'::text, 'material'::text])`),
]);

export const stockLotInInventory = inventory.table("stock_lot", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	lotCode: text("lot_code").notNull(),
	expiryDate: date("expiry_date"),
	unitCost: numeric("unit_cost", { mode: "number", precision: 12, scale: 4 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	goodsReceiptItemId: uuid("goods_receipt_item_id"),
	goodsReceiptItemLotId: uuid("goods_receipt_item_lot_id"),
	conservationClass: text("conservation_class"),
	shortCode: text("short_code").default(sql`inventory.lot_short_code()`).notNull(),
	location: text(),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	useFirst: boolean("use_first").default(false).notNull(),
	quarantinedAt: timestamp("quarantined_at", { withTimezone: true, mode: 'string' }),
	quarantinedBy: uuid("quarantined_by"),
	quarantineReason: text("quarantine_reason"),
	parentLotId: uuid("parent_lot_id"),
	derivation: text(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("stock_lot_conservation_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.conservationClass.asc().nullsLast().op("int8_ops")).where(sql`(conservation_class IS NOT NULL)`),
	index("stock_lot_expiry_idx").using("btree", table.expiryDate.asc().nullsLast().op("date_ops")).where(sql`(expiry_date IS NOT NULL)`),
	index("stock_lot_kitchen_item_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.ingredientId.asc().nullsLast().op("int8_ops"), table.frozenPreparationId.asc().nullsLast().op("int8_ops")),
	index("stock_lot_parent_idx").using("btree", table.parentLotId.asc().nullsLast().op("uuid_ops")).where(sql`(parent_lot_id IS NOT NULL)`),
	index("stock_lot_quarantine_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops")).where(sql`(quarantined_at IS NOT NULL)`),
	uniqueIndex("stock_lot_short_code_key").using("btree", table.shortCode.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "stock_lot_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.goodsReceiptItemId],
			foreignColumns: [goodsReceiptItemInInventory.id],
			name: "stock_lot_goods_receipt_item_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.goodsReceiptItemLotId],
			foreignColumns: [goodsReceiptItemLotInInventory.id],
			name: "stock_lot_goods_receipt_item_lot_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "stock_lot_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "stock_lot_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.parentLotId],
			foreignColumns: [table.id],
			name: "stock_lot_parent_lot_id_fkey"
		}),
	foreignKey({
			columns: [table.quarantinedBy],
			foreignColumns: [usersInAuth.id],
			name: "stock_lot_quarantined_by_fkey"
		}),
	check("stock_lot_conservation_class_check", sql`conservation_class = ANY (ARRAY['seco'::text, 'resfriado'::text, 'congelado'::text, 'climatizado'::text, 'nao_aplicavel'::text])`),
	check("stock_lot_derivation_check", sql`derivation = ANY (ARRAY['opened'::text, 'portioned'::text, 'thawed'::text])`),
	check("stock_lot_item_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) = 1`),
	check("stock_lot_location_check", sql`length(location) <= 60`),
]);

export const inventoryCountEntryInInventory = inventory.table("inventory_count_entry", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	countId: uuid("count_id").notNull(),
	lotId: uuid("lot_id"),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	quantity: numeric({ mode: "number", precision: 14, scale: 4 }).notNull(),
	clientEventId: text("client_event_id").notNull(),
	countedAt: timestamp("counted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deviceAt: timestamp("device_at", { withTimezone: true, mode: 'string' }),
	clockSkewMs: integer("clock_skew_ms"),
	overwrite: boolean().default(false).notNull(),
	countedBy: uuid("counted_by"),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("count_entry_client_key").using("btree", table.countId.asc().nullsLast().op("text_ops"), table.clientEventId.asc().nullsLast().op("text_ops")),
	index("count_entry_count_idx").using("btree", table.countId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.countId],
			foreignColumns: [inventoryCountInInventory.id],
			name: "inventory_count_entry_count_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.countedBy],
			foreignColumns: [usersInAuth.id],
			name: "inventory_count_entry_counted_by_fkey"
		}),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "inventory_count_entry_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "inventory_count_entry_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.lotId],
			foreignColumns: [stockLotInInventory.id],
			name: "inventory_count_entry_lot_id_fkey"
		}),
	check("count_entry_target", sql`((((lot_id IS NOT NULL))::integer + ((ingredient_id IS NOT NULL))::integer) + ((frozen_preparation_id IS NOT NULL))::integer) = 1`),
	check("inventory_count_entry_quantity_check", sql`quantity >= (0)::numeric`),
]);

export const stockAdjustmentInInventory = inventory.table("stock_adjustment", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	status: text().default('draft').notNull(),
	notes: text(),
	evidenceStatus: text("evidence_status").default('complete').notNull(),
	inventoryCountId: uuid("inventory_count_id"),
	approvalExceptionReason: text("approval_exception_reason"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: 'string' }),
	decidedBy: uuid("decided_by"),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	rejectionReason: text("rejection_reason"),
	postedValue: numeric("posted_value", { mode: "number", precision: 14, scale: 4 }),
	approvalRequired: boolean("approval_required"),
}, (table) => [
	index("stock_adjustment_kitchen_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops"), table.createdAt.desc().nullsFirst().op("int8_ops")),
	index("stock_adjustment_pending_idx").using("btree", table.kitchenId.asc().nullsLast().op("int8_ops")).where(sql`(status = 'pending_approval'::text)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [usersInAuth.id],
			name: "stock_adjustment_created_by_fkey"
		}),
	foreignKey({
			columns: [table.decidedBy],
			foreignColumns: [usersInAuth.id],
			name: "stock_adjustment_decided_by_fkey"
		}),
	foreignKey({
			columns: [table.inventoryCountId],
			foreignColumns: [inventoryCountInInventory.id],
			name: "stock_adjustment_inventory_count_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "stock_adjustment_kitchen_id_fkey"
		}),
	check("stock_adjustment_evidence_status_check", sql`evidence_status = ANY (ARRAY['complete'::text, 'pending'::text])`),
	check("stock_adjustment_status_check", sql`status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'posted'::text, 'rejected'::text])`),
]);

export const stockAdjustmentItemInInventory = inventory.table("stock_adjustment_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	adjustmentId: uuid("adjustment_id").notNull(),
	lotId: uuid("lot_id"),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	direction: text().notNull(),
	quantity: numeric({ mode: "number", precision: 14, scale: 4 }).notNull(),
	unitCost: numeric("unit_cost", { mode: "number", precision: 12, scale: 4 }),
	reasonCode: text("reason_code").notNull(),
	note: text(),
	evidenceKind: text("evidence_kind"),
	evidenceReference: text("evidence_reference"),
	measuredTemperatureC: numeric("measured_temperature_c", { mode: "number", precision: 5, scale: 2 }),
	correctedMovementId: uuid("corrected_movement_id"),
	investigationReference: text("investigation_reference"),
	movementId: uuid("movement_id"),
}, (table) => [
	index("stock_adjustment_item_doc_idx").using("btree", table.adjustmentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.adjustmentId],
			foreignColumns: [stockAdjustmentInInventory.id],
			name: "stock_adjustment_item_adjustment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.correctedMovementId],
			foreignColumns: [stockMovementInInventory.id],
			name: "stock_adjustment_item_corrected_movement_id_fkey"
		}),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "stock_adjustment_item_frozen_preparation_id_fkey"
		}),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "stock_adjustment_item_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.lotId],
			foreignColumns: [stockLotInInventory.id],
			name: "stock_adjustment_item_lot_id_fkey"
		}),
	foreignKey({
			columns: [table.movementId],
			foreignColumns: [stockMovementInInventory.id],
			name: "stock_adjustment_item_movement_id_fkey"
		}),
	check("stock_adjustment_item_direction_check", sql`direction = ANY (ARRAY['in'::text, 'out'::text])`),
	check("stock_adjustment_item_direction_reason", sql`((direction = 'in'::text) AND (reason_code = ANY (ARRAY['entry_error_in'::text, 'count_gain'::text, 'found_stock'::text, 'opening_balance'::text]))) OR ((direction = 'out'::text) AND (reason_code = ANY (ARRAY['expired'::text, 'spoiled'::text, 'damaged'::text, 'cold_chain_failure'::text, 'sanitary_recall'::text, 'lost'::text, 'theft'::text, 'quality_sample'::text, 'supplier_return'::text, 'donation'::text, 'entry_error_out'::text, 'count_loss'::text])))`),
	check("stock_adjustment_item_evidence_kind_check", sql`evidence_kind = ANY (ARRAY['photo'::text, 'term'::text, 'report'::text, 'process'::text, 'nfe_key'::text, 'temperature'::text, 'other'::text])`),
	check("stock_adjustment_item_quantity_check", sql`quantity > (0)::numeric`),
	check("stock_adjustment_item_reason_code_check", sql`reason_code = ANY (ARRAY['expired'::text, 'spoiled'::text, 'damaged'::text, 'cold_chain_failure'::text, 'sanitary_recall'::text, 'lost'::text, 'theft'::text, 'quality_sample'::text, 'supplier_return'::text, 'donation'::text, 'entry_error_in'::text, 'entry_error_out'::text, 'count_gain'::text, 'count_loss'::text, 'found_stock'::text, 'opening_balance'::text])`),
	check("stock_adjustment_item_target", sql`num_nonnulls(lot_id, ingredient_id, frozen_preparation_id) >= 1`),
]);

export const pncpPcaItemInComprasGovIntegration = comprasGovIntegration.table("pncp_pca_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cnpjOrgao: text("cnpj_orgao").notNull(),
	anoPca: integer("ano_pca").notNull(),
	idItemPca: text("id_item_pca").notNull(),
	uasg: text().notNull(),
	nomeUnidade: text("nome_unidade"),
	categoriaItem: text("categoria_item"),
	identificadorContratacao: text("identificador_contratacao"),
	nomeContratacao: text("nome_contratacao"),
	catalogo: text(),
	classificacaoCatalogo: text("classificacao_catalogo"),
	codigoClasse: text("codigo_classe"),
	nomeClasse: text("nome_classe"),
	codigoPdm: text("codigo_pdm"),
	nomePdm: text("nome_pdm"),
	codigoItem: text("codigo_item"),
	descricaoItem: text("descricao_item"),
	unidadeFornecimento: text("unidade_fornecimento"),
	quantidadeEstimada: numeric("quantidade_estimada", { mode: "number", precision: 18, scale: 4 }),
	valorUnitarioEstimado: numeric("valor_unitario_estimado", { mode: "number", precision: 18, scale: 4 }),
	valorTotalEstimado: numeric("valor_total_estimado", { mode: "number", precision: 18, scale: 4 }),
	valorOrcamentario: numeric("valor_orcamentario", { mode: "number", precision: 18, scale: 4 }),
	dataDesejada: date("data_desejada"),
	collectedAt: timestamp("collected_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	removedAt: timestamp("removed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_pncp_pca_item_classe").using("btree", table.codigoClasse.asc().nullsLast().op("text_ops")).where(sql`(removed_at IS NULL)`),
	index("idx_pncp_pca_item_codigo_item").using("btree", table.codigoItem.asc().nullsLast().op("text_ops")).where(sql`((codigo_item IS NOT NULL) AND (removed_at IS NULL))`),
	index("idx_pncp_pca_item_orgao_ano").using("btree", table.cnpjOrgao.asc().nullsLast().op("int4_ops"), table.anoPca.asc().nullsLast().op("int4_ops")),
	index("idx_pncp_pca_item_uasg").using("btree", table.uasg.asc().nullsLast().op("text_ops")).where(sql`(removed_at IS NULL)`),
	unique("pncp_pca_item_cnpj_orgao_ano_pca_id_item_pca_key").on(table.cnpjOrgao, table.anoPca, table.idItemPca),
]);

export const stockAdjustmentAttachmentInInventory = inventory.table("stock_adjustment_attachment", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	adjustmentId: uuid("adjustment_id").notNull(),
	storagePath: text("storage_path").notNull(),
	contentType: text("content_type"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	byteSize: bigint("byte_size", { mode: "number" }),
	uploadedBy: uuid("uploaded_by"),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.adjustmentId],
			foreignColumns: [stockAdjustmentInInventory.id],
			name: "stock_adjustment_attachment_adjustment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [usersInAuth.id],
			name: "stock_adjustment_attachment_uploaded_by_fkey"
		}),
]);

export const goodsReceiptItemLotInInventory = inventory.table("goods_receipt_item_lot", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	receiptItemId: uuid("receipt_item_id").notNull(),
	lotCode: text("lot_code").notNull(),
	expiryDate: date("expiry_date"),
	quantityBase: numeric("quantity_base", { mode: "number", precision: 14, scale: 4 }).notNull(),
	unitCost: numeric("unit_cost", { mode: "number", precision: 12, scale: 4 }),
	measuredTemperatureC: numeric("measured_temperature_c", { mode: "number", precision: 5, scale: 2 }),
	temperatureAckBy: uuid("temperature_ack_by"),
	temperatureAckAt: timestamp("temperature_ack_at", { withTimezone: true, mode: 'string' }),
	divergenceReason: text("divergence_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	conservationClass: text("conservation_class"),
	divergenceNote: text("divergence_note"),
}, (table) => [
	index("goods_receipt_item_lot_expiry_idx").using("btree", table.expiryDate.asc().nullsLast().op("date_ops")).where(sql`(expiry_date IS NOT NULL)`),
	index("goods_receipt_item_lot_item_idx").using("btree", table.receiptItemId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.receiptItemId],
			foreignColumns: [goodsReceiptItemInInventory.id],
			name: "goods_receipt_item_lot_receipt_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.temperatureAckBy],
			foreignColumns: [usersInAuth.id],
			name: "goods_receipt_item_lot_temperature_ack_by_fkey"
		}),
	unique("goods_receipt_item_lot_code_key").on(table.receiptItemId, table.lotCode),
	check("goods_receipt_item_lot_ack_pair", sql`(temperature_ack_by IS NULL) = (temperature_ack_at IS NULL)`),
	check("goods_receipt_item_lot_conservation_class_check", sql`conservation_class = ANY (ARRAY['seco'::text, 'resfriado'::text, 'congelado'::text, 'climatizado'::text, 'nao_aplicavel'::text])`),
	check("goods_receipt_item_lot_divergence_note_len", sql`char_length(divergence_note) <= 280`),
	check("goods_receipt_item_lot_lot_code_check", sql`btrim(lot_code) <> ''::text`),
	check("goods_receipt_item_lot_quantity_base_check", sql`quantity_base >= (0)::numeric`),
]);

export const gpcBrickAttributeInGs1Integration = gs1Integration.table("gpc_brick_attribute", {
	brickCode: text("brick_code").notNull(),
	attributeCode: text("attribute_code").notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("gpc_brick_attribute_attribute_idx").using("btree", table.attributeCode.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.attributeCode],
			foreignColumns: [gpcAttributeInGs1Integration.attributeCode],
			name: "gpc_brick_attribute_attribute_code_fkey"
		}),
	primaryKey({ columns: [table.brickCode, table.attributeCode], name: "gpc_brick_attribute_pkey"}),
]);

export const gtinGpcAttributeInGs1Integration = gs1Integration.table("gtin_gpc_attribute", {
	gtin: text().notNull(),
	attributeCode: text("attribute_code").notNull(),
	valueCode: text("value_code").notNull(),
	source: text().default('fornecedor').notNull(),
	declaredAt: timestamp("declared_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	declaredBy: uuid("declared_by"),
}, (table) => [
	index("gtin_gpc_attribute_value_idx").using("btree", table.attributeCode.asc().nullsLast().op("text_ops"), table.valueCode.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.attributeCode],
			foreignColumns: [gpcAttributeInGs1Integration.attributeCode],
			name: "gtin_gpc_attribute_attribute_code_fkey"
		}),
	foreignKey({
			columns: [table.declaredBy],
			foreignColumns: [usersInAuth.id],
			name: "gtin_gpc_attribute_declared_by_fkey"
		}),
	foreignKey({
			columns: [table.gtin],
			foreignColumns: [gtinInGs1Integration.gtin],
			name: "gtin_gpc_attribute_gtin_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.valueCode],
			foreignColumns: [gpcAttributeValueInGs1Integration.valueCode],
			name: "gtin_gpc_attribute_value_code_fkey"
		}),
	primaryKey({ columns: [table.gtin, table.attributeCode], name: "gtin_gpc_attribute_pkey"}),
	check("gtin_gpc_attribute_source_check", sql`source = ANY (ARRAY['fornecedor'::text, 'gs1_api'::text, 'manual'::text])`),
]);

export const pncpPcaSnapshotInComprasGovIntegration = comprasGovIntegration.table("pncp_pca_snapshot", {
	cnpjOrgao: text("cnpj_orgao").notNull(),
	anoPca: integer("ano_pca").notNull(),
	contentHash: text("content_hash").notNull(),
	rowCount: integer("row_count").notNull(),
	byteSize: integer("byte_size").notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	primaryKey({ columns: [table.cnpjOrgao, table.anoPca], name: "pncp_pca_snapshot_pkey"}),
]);

export const scannerProfileInInventory = inventory.table("scanner_profile", {
	userId: uuid("user_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }).notNull(),
	maxKeyIntervalMs: integer("max_key_interval_ms").default(80).notNull(),
	minLength: integer("min_length").default(8).notNull(),
	terminator: text().default('enter').notNull(),
	idleTimeoutMs: integer("idle_timeout_ms").default(120).notNull(),
	prefix: text(),
	suffix: text(),
	gsSubstitute: text("gs_substitute"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInKitchen.id],
			name: "scanner_profile_kitchen_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "scanner_profile_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.kitchenId], name: "scanner_profile_pkey"}),
	check("scanner_profile_gs_substitute_check", sql`length(gs_substitute) = 1`),
	check("scanner_profile_idle_timeout_ms_check", sql`(idle_timeout_ms >= 30) AND (idle_timeout_ms <= 1000)`),
	check("scanner_profile_max_key_interval_ms_check", sql`(max_key_interval_ms >= 10) AND (max_key_interval_ms <= 500)`),
	check("scanner_profile_min_length_check", sql`(min_length >= 4) AND (min_length <= 48)`),
	check("scanner_profile_prefix_check", sql`length(prefix) <= 8`),
	check("scanner_profile_suffix_check", sql`length(suffix) <= 8`),
	check("scanner_profile_terminator_check", sql`terminator = ANY (ARRAY['enter'::text, 'tab'::text, 'none'::text])`),
]);
export const vBarcodeReviewInGs1Integration = gs1Integration.view("v_barcode_review", {	ingredientItemId: uuid("ingredient_item_id"),
	description: text(),
	rawBarcode: text("raw_barcode"),
	ingredientId: uuid("ingredient_id"),
}).with({"securityInvoker":true}).as(sql`SELECT id AS ingredient_item_id, COALESCE(description, ''::text) AS description, barcode AS raw_barcode, ingredient_id FROM kitchen.ingredient_item ii WHERE deleted_at IS NULL AND barcode IS NOT NULL AND gtin IS NULL`);

export const vMeasureUnitReviewInCore = core.view("v_measure_unit_review", {	sourceTable: text("source_table"),
	sourceId: text("source_id"),
	sourceDescription: text("source_description"),
	rawValue: text("raw_value"),
}).with({"securityInvoker":true}).as(sql`SELECT 'kitchen.ingredient'::text AS source_table, ingredient.id::text AS source_id, COALESCE(ingredient.description, ''::text) AS source_description, ingredient.measure_unit AS raw_value FROM kitchen.ingredient WHERE ingredient.deleted_at IS NULL AND ingredient.measure_unit IS NOT NULL AND NOT (ingredient.measure_unit IN ( SELECT measure_unit.code FROM core.measure_unit)) UNION ALL SELECT 'kitchen.ingredient_item'::text AS source_table, ingredient_item.id::text AS source_id, COALESCE(ingredient_item.description, ''::text) AS source_description, ingredient_item.purchase_measure_unit AS raw_value FROM kitchen.ingredient_item WHERE ingredient_item.deleted_at IS NULL AND ingredient_item.purchase_measure_unit IS NOT NULL AND NOT (ingredient_item.purchase_measure_unit IN ( SELECT measure_unit.code FROM core.measure_unit)) UNION ALL SELECT 'procurement.purchase_item'::text AS source_table, purchase_item.id::text AS source_id, purchase_item.description AS source_description, purchase_item.purchase_measure_unit AS raw_value FROM procurement.purchase_item WHERE purchase_item.deleted_at IS NULL AND purchase_item.purchase_measure_unit IS NOT NULL AND NOT (purchase_item.purchase_measure_unit IN ( SELECT measure_unit.code FROM core.measure_unit)) UNION ALL SELECT 'procurement.procurement_list_item'::text AS source_table, procurement_list_item.id::text AS source_id, procurement_list_item.ingredient_name AS source_description, procurement_list_item.measure_unit AS raw_value FROM procurement.procurement_list_item WHERE procurement_list_item.measure_unit IS NOT NULL AND NOT (procurement_list_item.measure_unit IN ( SELECT measure_unit.code FROM core.measure_unit)) UNION ALL SELECT 'procurement.procurement_list_item (compra)'::text AS source_table, procurement_list_item.id::text AS source_id, procurement_list_item.ingredient_name AS source_description, procurement_list_item.purchase_measure_unit AS raw_value FROM procurement.procurement_list_item WHERE procurement_list_item.purchase_measure_unit IS NOT NULL AND NOT (procurement_list_item.purchase_measure_unit IN ( SELECT measure_unit.code FROM core.measure_unit))`);

export const personIdentityInCore = core.view("person_identity", {	id: uuid(),
	displayName: text("display_name"),
	nrOrdem: text("nr_ordem"),
	userId: uuid("user_id"),
	active: boolean(),
	email: text(),
	posto: text(),
	nomeGuerra: text("nome_guerra"),
	label: text(),
}).with({"securityInvoker":true}).as(sql`SELECT p.id, p.display_name, p.nr_ordem, p.user_id, p.active, ud.email, umd."sgPosto" AS posto, umd."nmGuerra" AS nome_guerra, COALESCE(NULLIF(btrim((COALESCE(umd."sgPosto", ''::text) || ' '::text) || COALESCE(umd."nmGuerra", ''::text)), ''::text), ud.email, p.display_name) AS label FROM core.person p LEFT JOIN core.user_data ud ON ud.id = p.user_id LEFT JOIN core.user_military_data umd ON umd."nrOrdem" = p.nr_ordem`);

export const vPurchaseItemConditioningReviewInProcurement = procurement.view("v_purchase_item_conditioning_review", {	purchaseItemId: uuid("purchase_item_id"),
	description: text(),
	catmatItemCodigo: integer("catmat_item_codigo"),
	deliveryConditioning: text("delivery_conditioning"),
	conservationClass: text("conservation_class"),
	pendencia: text(),
	pistaCatmat: text("pista_catmat"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	itensVinculados: bigint("itens_vinculados", { mode: "number" }),
}).with({"securityInvoker":true}).as(sql`SELECT id AS purchase_item_id, description, catmat_item_codigo, delivery_conditioning, conservation_class, CASE WHEN conservation_class IS NULL THEN 'sem_classe'::text WHEN (conservation_class = ANY (ARRAY['resfriado'::text, 'congelado'::text])) AND storage_temp_max_c IS NULL THEN 'sem_faixa_de_temperatura'::text ELSE 'completo'::text END AS pendencia, (regexp_match(description, 'ESTADO\s+DE\s+CONSERVA[ÇC][ÃA]O\s*:\s*([^,]+)'::text, 'i'::text))[1] AS pista_catmat, ( SELECT count(*) AS count FROM procurement.purchase_item_ingredient pii WHERE pii.purchase_item_id = pi.id) AS itens_vinculados FROM procurement.purchase_item pi WHERE deleted_at IS NULL AND (conservation_class IS NULL OR (conservation_class = ANY (ARRAY['resfriado'::text, 'congelado'::text])) AND storage_temp_max_c IS NULL)`);

export const recipeLastReviewInKitchen = kitchen.view("recipe_last_review", {	recipeId: uuid("recipe_id"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
}).with({ securityInvoker: true }).as(sql`SELECT DISTINCT ON (recipe_id) recipe_id, reviewed_at, reviewed_by, reviewed_by_name FROM kitchen.recipe_review ORDER BY recipe_id, reviewed_at DESC`);

export const vMealPresencesWithUserInKitchen = kitchen.view("v_meal_presences_with_user", {	id: uuid(),
	userId: uuid("user_id"),
	date: date(),
	meal: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	displayName: text("display_name"),
}).with({ securityInvoker: true }).as(sql`SELECT mp.id, mp.user_id, mp.date, mp.meal, mp.created_at, mp.mess_hall_id, mp.updated_at, vui.display_name FROM kitchen.meal_presences mp LEFT JOIN core.v_user_identity vui ON vui.id = mp.user_id`);

export const vStockBalanceInInventory = inventory.view("v_stock_balance", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	lotId: uuid("lot_id"),
	lotCode: text("lot_code"),
	expiryDate: date("expiry_date"),
	balance: numeric({ mode: "number" }),
	balanceValue: numeric("balance_value", { mode: "number" }),
	lastMovementAt: timestamp("last_movement_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT m.kitchen_id, m.ingredient_id, m.frozen_preparation_id, m.lot_id, l.lot_code, l.expiry_date, sum( CASE WHEN m.type = ANY (ARRAY['receipt'::text, 'issue_return'::text, 'leftover_return'::text, 'transfer_in'::text, 'lot_split_in'::text, 'adjustment_in'::text]) THEN m.quantity ELSE - m.quantity END) AS balance, sum( CASE WHEN m.type = ANY (ARRAY['receipt'::text, 'issue_return'::text, 'leftover_return'::text, 'transfer_in'::text, 'lot_split_in'::text, 'adjustment_in'::text]) THEN COALESCE(m.total_cost, 0::numeric) ELSE - COALESCE(m.total_cost, 0::numeric) END) AS balance_value, max(m.occurred_at) AS last_movement_at FROM inventory.stock_movement m LEFT JOIN inventory.stock_lot l ON l.id = m.lot_id GROUP BY m.kitchen_id, m.ingredient_id, m.frozen_preparation_id, m.lot_id, l.lot_code, l.expiry_date`);

export const vUserIdentityInCore = core.view("v_user_identity", {	id: uuid(),
	displayName: text("display_name"),
}).with({ securityInvoker: true }).as(sql`SELECT ud.id, CASE WHEN NULLIF(TRIM(BOTH FROM (COALESCE(umd."sgPosto", ''::text) || ' '::text) || COALESCE(umd."nmGuerra", ''::text)), ''::text) IS NOT NULL THEN TRIM(BOTH FROM (COALESCE(umd."sgPosto", ''::text) || ' '::text) || initcap(COALESCE(umd."nmGuerra", ''::text))) ELSE ud.email END AS display_name FROM core.user_data ud LEFT JOIN core.user_military_data umd ON umd."nrOrdem" = ud."nrOrdem"`);

export const vLotExpiryInInventory = inventory.view("v_lot_expiry", {	lotId: uuid("lot_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	lotCode: text("lot_code"),
	shortCode: text("short_code"),
	location: text(),
	useFirst: boolean("use_first"),
	quarantinedAt: timestamp("quarantined_at", { withTimezone: true, mode: 'string' }),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }),
	expiryDate: date("expiry_date"),
	conservationClass: text("conservation_class"),
	balance: numeric({ mode: "number" }),
	balanceValue: numeric("balance_value", { mode: "number" }),
	avgUnitCost: numeric("avg_unit_cost", { mode: "number" }),
	alertDays: integer("alert_days"),
	daysLeft: integer("days_left"),
	band: text(),
}).with({"securityInvoker":true}).as(sql`WITH lot_balance AS ( SELECT l.id AS lot_id, l.kitchen_id, l.ingredient_id, l.frozen_preparation_id, l.lot_code, l.short_code, l.expiry_date, l.location, l.use_first, l.quarantined_at, l.received_at, COALESCE(l.conservation_class, pi.conservation_class) AS conservation_class, COALESCE(sum( CASE WHEN m.type = ANY (ARRAY['receipt'::text, 'issue_return'::text, 'leftover_return'::text, 'transfer_in'::text, 'lot_split_in'::text, 'adjustment_in'::text]) THEN m.quantity ELSE - m.quantity END), 0::numeric) AS balance FROM inventory.stock_lot l LEFT JOIN inventory.stock_movement m ON m.lot_id = l.id LEFT JOIN LATERAL ( SELECT p.conservation_class FROM procurement.purchase_item_ingredient pii JOIN procurement.purchase_item p ON p.id = pii.purchase_item_id WHERE pii.ingredient_id = l.ingredient_id AND pii.is_default AND p.deleted_at IS NULL AND p.conservation_class IS NOT NULL LIMIT 1) pi ON true GROUP BY l.id, pi.conservation_class HAVING COALESCE(sum( CASE WHEN m.type = ANY (ARRAY['receipt'::text, 'issue_return'::text, 'leftover_return'::text, 'transfer_in'::text, 'lot_split_in'::text, 'adjustment_in'::text]) THEN m.quantity ELSE - m.quantity END), 0::numeric) > 0::numeric ) SELECT b.lot_id, b.kitchen_id, b.ingredient_id, b.frozen_preparation_id, b.lot_code, b.short_code, b.location, b.use_first, b.quarantined_at, b.received_at, b.expiry_date, b.conservation_class, b.balance, round(b.balance * COALESCE(c.avg_unit_cost, 0::numeric), 4) AS balance_value, COALESCE(c.avg_unit_cost, 0::numeric) AS avg_unit_cost, inventory.expiry_alert_days(b.kitchen_id, b.ingredient_id, b.conservation_class) AS alert_days, CASE WHEN b.expiry_date IS NULL THEN NULL::integer ELSE b.expiry_date - (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date END AS days_left, CASE WHEN b.expiry_date IS NULL THEN CASE WHEN b.conservation_class = ANY (ARRAY['resfriado'::text, 'congelado'::text]) THEN 'no_expiry'::text ELSE 'ok'::text END WHEN b.expiry_date < (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date THEN 'expired'::text WHEN (b.expiry_date - (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date) <= inventory.expiry_alert_days(b.kitchen_id, b.ingredient_id, b.conservation_class) THEN 'critical'::text WHEN (b.expiry_date - (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date) <= (inventory.expiry_alert_days(b.kitchen_id, b.ingredient_id, b.conservation_class) * 2) THEN 'warning'::text ELSE 'ok'::text END AS band FROM lot_balance b LEFT JOIN inventory.stock_cost c ON c.kitchen_id = b.kitchen_id AND NOT c.ingredient_id IS DISTINCT FROM b.ingredient_id AND NOT c.frozen_preparation_id IS DISTINCT FROM b.frozen_preparation_id`);

export const vGtinSpecificationLatestInGs1Integration = gs1Integration.view("v_gtin_specification_latest", {	gtin: text(),
	purchaseItemId: uuid("purchase_item_id"),
	verdict: text(),
	divergences: jsonb(),
	source: text(),
	specFingerprint: text("spec_fingerprint"),
	checkedAt: timestamp("checked_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT DISTINCT ON (gtin, purchase_item_id) gtin, purchase_item_id, verdict, divergences, source, spec_fingerprint, checked_at FROM gs1_integration.gtin_specification_check c ORDER BY gtin, purchase_item_id, checked_at DESC`);

export const vEmpenhoVigenteInFinance = finance.view("v_empenho_vigente", {	empenhoId: uuid("empenho_id"),
	unitId: integer("unit_id"),
	valorOriginal: numeric("valor_original", { mode: "number", precision: 14, scale: 4 }),
	ajustes: numeric({ mode: "number" }),
	valorVigente: numeric("valor_vigente", { mode: "number" }),
}).with({"securityInvoker":true}).as(sql`SELECT e.id AS empenho_id, e.unit_id, e.valor_total AS valor_original, COALESCE(sum( CASE WHEN ev.tipo = 'reforco'::text THEN ev.valor WHEN ev.tipo = ANY (ARRAY['anulacao'::text, 'cancelamento'::text]) THEN - ev.valor ELSE 0::numeric END), 0::numeric) AS ajustes, e.valor_total + COALESCE(sum( CASE WHEN ev.tipo = 'reforco'::text THEN ev.valor WHEN ev.tipo = ANY (ARRAY['anulacao'::text, 'cancelamento'::text]) THEN - ev.valor ELSE 0::numeric END), 0::numeric) AS valor_vigente FROM finance.empenho e LEFT JOIN finance.empenho_event ev ON ev.empenho_id = e.id GROUP BY e.id, e.unit_id, e.valor_total`);

export const vEmpenhoSaldoInFinance = finance.view("v_empenho_saldo", {	empenhoId: uuid("empenho_id"),
	unitId: integer("unit_id"),
	valorOriginal: numeric("valor_original", { mode: "number", precision: 14, scale: 4 }),
	ajustes: numeric({ mode: "number" }),
	valorVigente: numeric("valor_vigente", { mode: "number" }),
	valorLiquidado: numeric("valor_liquidado", { mode: "number" }),
	valorPago: numeric("valor_pago", { mode: "number" }),
	saldoALiquidar: numeric("saldo_a_liquidar", { mode: "number" }),
	valorAPagar: numeric("valor_a_pagar", { mode: "number" }),
}).with({"securityInvoker":true}).as(sql`SELECT v.empenho_id, v.unit_id, v.valor_original, v.ajustes, v.valor_vigente, COALESCE(l.liquidado, 0::numeric) AS valor_liquidado, COALESCE(p.pago, 0::numeric) AS valor_pago, v.valor_vigente - COALESCE(l.liquidado, 0::numeric) AS saldo_a_liquidar, COALESCE(l.liquidado, 0::numeric) - COALESCE(p.pago, 0::numeric) AS valor_a_pagar FROM finance.v_empenho_vigente v LEFT JOIN ( SELECT liquidacao.empenho_id, sum(liquidacao.valor) AS liquidado FROM finance.liquidacao GROUP BY liquidacao.empenho_id) l ON l.empenho_id = v.empenho_id LEFT JOIN ( SELECT li.empenho_id, sum(pg.valor) AS pago FROM finance.pagamento pg JOIN finance.liquidacao li ON li.id = pg.liquidacao_id GROUP BY li.empenho_id) p ON p.empenho_id = v.empenho_id`);

export const folderLastReviewInKitchen = kitchen.view("folder_last_review", {	folderId: uuid("folder_id"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
}).with({ securityInvoker: true }).as(sql`SELECT DISTINCT ON (folder_id) folder_id, reviewed_at, reviewed_by, reviewed_by_name FROM kitchen.folder_review ORDER BY folder_id, reviewed_at DESC`);

export const vSiafiReconciliationInFinance = finance.view("v_siafi_reconciliation", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	documentoTipo: text("documento_tipo"),
	numeroDocumento: text("numero_documento"),
	valorSisub: numeric("valor_sisub", { mode: "number" }),
	valorSiafi: numeric("valor_siafi", { mode: "number" }),
	batchId: uuid("batch_id"),
	loteEm: timestamp("lote_em", { withTimezone: true, mode: 'string' }),
	situacao: text(),
	diferenca: numeric({ mode: "number" }),
	decisao: text(),
	justificativa: text(),
	decisaoVigente: boolean("decisao_vigente"),
}).with({"securityInvoker":true}).as(sql`WITH siafi_rows AS ( SELECT b.unit_id, b.report_type AS documento_tipo, COALESCE(r.parsed ->> 'numero_ne'::text, r.parsed ->> 'numero_ns'::text, r.parsed ->> 'numero_ob'::text) AS numero_documento, (r.parsed ->> 'valor'::text)::numeric AS valor_siafi, b.created_at AS lote_em, b.id AS batch_id, row_number() OVER (PARTITION BY b.unit_id, b.report_type, (COALESCE(r.parsed ->> 'numero_ne'::text, r.parsed ->> 'numero_ns'::text, r.parsed ->> 'numero_ob'::text)) ORDER BY b.created_at DESC) AS recencia FROM siafi_integration.import_row r JOIN siafi_integration.import_batch b ON b.id = r.batch_id WHERE r.parse_status = 'parsed'::text AND (b.report_type = ANY (ARRAY['ne'::text, 'ns'::text, 'ob'::text])) ), latest_siafi AS ( SELECT siafi_rows.unit_id, siafi_rows.documento_tipo, siafi_rows.numero_documento, siafi_rows.valor_siafi, siafi_rows.lote_em, siafi_rows.batch_id, siafi_rows.recencia FROM siafi_rows WHERE siafi_rows.recencia = 1 AND siafi_rows.numero_documento IS NOT NULL ), sisub_rows AS ( SELECT e.unit_id, 'ne'::text AS documento_tipo, e.numero_empenho AS numero_documento, v.valor_vigente AS valor_sisub FROM finance.empenho e JOIN finance.v_empenho_vigente v ON v.empenho_id = e.id UNION ALL SELECT l.unit_id, 'ns'::text, l.numero_ns, l.valor FROM finance.liquidacao l UNION ALL SELECT p.unit_id, 'ob'::text, p.numero_ob, p.valor FROM finance.pagamento p ) SELECT COALESCE(s.unit_id, f.unit_id) AS unit_id, COALESCE(s.documento_tipo, f.documento_tipo) AS documento_tipo, COALESCE(s.numero_documento, f.numero_documento) AS numero_documento, s.valor_sisub, f.valor_siafi, f.batch_id, f.lote_em, CASE WHEN f.numero_documento IS NULL THEN 'apenas_sisub'::text WHEN s.numero_documento IS NULL THEN 'apenas_siafi'::text WHEN abs(COALESCE(s.valor_sisub, 0::numeric) - COALESCE(f.valor_siafi, 0::numeric)) > 0.009 THEN 'divergente'::text ELSE 'conciliado'::text END AS situacao, COALESCE(f.valor_siafi, 0::numeric) - COALESCE(s.valor_sisub, 0::numeric) AS diferenca, d.decisao, d.justificativa, d.id IS NOT NULL AND NOT d.valor_sisub IS DISTINCT FROM s.valor_sisub AND NOT d.valor_siafi IS DISTINCT FROM f.valor_siafi AS decisao_vigente FROM sisub_rows s FULL JOIN latest_siafi f ON f.unit_id = s.unit_id AND f.documento_tipo = s.documento_tipo AND f.numero_documento = s.numero_documento LEFT JOIN finance.reconciliation_decision d ON d.unit_id = COALESCE(s.unit_id, f.unit_id) AND d.documento_tipo = COALESCE(s.documento_tipo, f.documento_tipo) AND d.numero_documento = COALESCE(s.numero_documento, f.numero_documento)`);

export const vPhysicalAccountingReconciliationInFinance = finance.view("v_physical_accounting_reconciliation", {	goodsReceiptId: uuid("goods_receipt_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	definitiveAt: timestamp("definitive_at", { withTimezone: true, mode: 'string' }),
	valorRecebido: numeric("valor_recebido", { mode: "number" }),
	liquidacaoId: uuid("liquidacao_id"),
	numeroNs: text("numero_ns"),
	valorLiquidado: numeric("valor_liquidado", { mode: "number", precision: 14, scale: 2 }),
	situacao: text(),
	diasDesdeRecebimento: integer("dias_desde_recebimento"),
}).with({"securityInvoker":true}).as(sql`SELECT gr.id AS goods_receipt_id, gr.kitchen_id, gr.definitive_at, COALESCE(sum(gri.received_qty_base * COALESCE(gri.unit_cost, 0::numeric)), 0::numeric) AS valor_recebido, l.id AS liquidacao_id, l.numero_ns, l.valor AS valor_liquidado, CASE WHEN l.id IS NULL THEN 'sem_liquidacao'::text WHEN abs(COALESCE(sum(gri.received_qty_base * COALESCE(gri.unit_cost, 0::numeric)), 0::numeric) - l.valor) > 0.009 THEN 'valor_divergente'::text ELSE 'conciliado'::text END AS situacao, CURRENT_DATE - gr.definitive_at::date AS dias_desde_recebimento FROM inventory.goods_receipt gr JOIN inventory.goods_receipt_item gri ON gri.receipt_id = gr.id LEFT JOIN finance.liquidacao l ON l.id = gr.liquidacao_id WHERE gr.definitive_at IS NOT NULL GROUP BY gr.id, gr.kitchen_id, gr.definitive_at, l.id, l.numero_ns, l.valor`);

export const ingredientLastReviewInKitchen = kitchen.view("ingredient_last_review", {	ingredientId: uuid("ingredient_id"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
}).with({ securityInvoker: true }).as(sql`SELECT DISTINCT ON (ingredient_id) ingredient_id, reviewed_at, reviewed_by, reviewed_by_name FROM kitchen.ingredient_review ORDER BY ingredient_id, reviewed_at DESC`);

export const vIngredientKgLtItemsInKitchen = kitchen.view("v_ingredient_kg_lt_items", {	productId: uuid("product_id"),
	description: text(),
	baseUnit: text("base_unit"),
	densityFactor: numeric("density_factor", { mode: "number" }),
	productItemId: uuid("product_item_id"),
	itemDescription: text("item_description"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	kgToBaseFactor: numeric("kg_to_base_factor", { mode: "number" }),
	itemCreatedAt: timestamp("item_created_at", { withTimezone: true, mode: 'string' }),
}).with({ securityInvoker: true }).as(sql`SELECT p.id AS product_id, p.description, p.measure_unit AS base_unit, p.density_factor, pi.id AS product_item_id, pi.description AS item_description, pi.purchase_measure_unit, pi.unit_content_quantity AS kg_to_base_factor, pi.created_at AS item_created_at FROM kitchen.ingredient p JOIN kitchen.ingredient_item pi ON pi.ingredient_id = p.id AND pi.deleted_at IS NULL AND upper(pi.purchase_measure_unit) = 'KG'::text WHERE p.measure_unit = 'LT'::text AND p.deleted_at IS NULL ORDER BY p.description`);

export const workforceNoteInCore = core.view("workforce_note", {	id: uuid(),
	submissionId: uuid("submission_id"),
	kind: text(),
	quantity: integer(),
	detail: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, submission_id, kind, quantity, detail, created_at FROM kitchen.workforce_note`);

export const migrationFolderLookupInCore = core.view("migration_folder_lookup", {	legacyIdGrupoProduto: integer("legacy_id_grupo_produto"),
	newFolderId: uuid("new_folder_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT legacy_id_grupo_produto, new_folder_id, created_at FROM kitchen.migration_folder_lookup`);

export const workforceSurveyInCore = core.view("workforce_survey", {	id: uuid(),
	referenceDate: date("reference_date"),
	title: text(),
	status: text(),
	source: text(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, reference_date, title, status, source, opened_at, closed_at, created_by, created_at FROM kitchen.workforce_survey`);

export const workforceSubmissionInCore = core.view("workforce_submission", {	id: uuid(),
	surveyId: uuid("survey_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	ranchoId: bigint("rancho_id", { mode: "number" }),
	declaredTotal: integer("declared_total"),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: 'string' }),
	submittedBy: uuid("submitted_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, survey_id, rancho_id, declared_total, submitted_at, submitted_by, created_at, updated_at FROM kitchen.workforce_submission`);

export const workforceHeadcountInCore = core.view("workforce_headcount", {	id: uuid(),
	submissionId: uuid("submission_id"),
	categoryId: uuid("category_id"),
	headcount: integer(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, submission_id, category_id, headcount, created_at, updated_at FROM kitchen.workforce_headcount`);

export const migrationProductLookupInCore = core.view("migration_product_lookup", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyIdInsumo: bigint("legacy_id_insumo", { mode: "number" }),
	newProductId: uuid("new_product_id"),
	legacyDescricao: text("legacy_descricao"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT legacy_id_insumo, new_product_id, legacy_descricao, created_at FROM kitchen.migration_product_lookup`);

export const migrationRecipeLookupInCore = core.view("migration_recipe_lookup", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyIdPreparacao: bigint("legacy_id_preparacao", { mode: "number" }),
	newRecipeId: uuid("new_recipe_id"),
	legacyRendimento: numeric("legacy_rendimento", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT legacy_id_preparacao, new_recipe_id, legacy_rendimento, created_at FROM kitchen.migration_recipe_lookup`);

export const ranchoInCore = core.view("rancho", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	eloCode: text("elo_code"),
	code: text(),
	displayName: text("display_name"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	producesOwnMeals: boolean("produces_own_meals"),
	active: boolean(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, unit_id, elo_code, code, display_name, mess_hall_id, kitchen_id, produces_own_meals, active, notes, created_at, updated_at FROM kitchen.rancho`);

export const opinionsInCore = core.view("opinions", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	value: smallint(),
	question: text(),
	userId: uuid(),
}).with({"securityInvoker":true}).as(sql`SELECT id, created_at, value, question, "userId" FROM kitchen.opinions`);

export const analyticsChatSessionInCore = core.view("analytics_chat_session", {	id: uuid(),
	userId: uuid("user_id"),
	title: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, user_id, title, created_at, updated_at FROM kitchen.analytics_chat_session`);

export const kitchenInCore = core.view("kitchen", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	type: kitchenTypeInSisub(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	purchaseUnitId: bigint("purchase_unit_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	displayName: text("display_name"),
	addressLogradouro: text("address_logradouro"),
	addressNumero: text("address_numero"),
	addressComplemento: text("address_complemento"),
	addressBairro: text("address_bairro"),
	addressMunicipio: text("address_municipio"),
	addressUf: text("address_uf"),
	addressCep: text("address_cep"),
	isTraining: boolean("is_training"),
}).with({"securityInvoker":true}).as(sql`SELECT id, unit_id, created_at, type, purchase_unit_id, kitchen_id, display_name, address_logradouro, address_numero, address_complemento, address_bairro, address_municipio, address_uf, address_cep, is_training FROM kitchen.kitchen`);

export const messHallsInCore = core.view("mess_halls", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }),
	code: text(),
	displayName: text("display_name"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	isTraining: boolean("is_training"),
}).with({"securityInvoker":true}).as(sql`SELECT id, unit_id, code, display_name, kitchen_id, is_training FROM kitchen.mess_halls`);

export const trainingResetLogInCore = core.view("training_reset_log", {	id: uuid(),
	actorId: uuid("actor_id"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	durationMs: integer("duration_ms"),
	deletedCounts: jsonb("deleted_counts"),
	status: text(),
	errorMessage: text("error_message"),
	queuedMs: integer("queued_ms"),
}).with({"securityInvoker":true}).as(sql`SELECT id, actor_id, started_at, finished_at, duration_ms, deleted_counts, status, error_message, queued_ms FROM kitchen.training_reset_log`);

export const analyticsChatMessageInCore = core.view("analytics_chat_message", {	id: uuid(),
	sessionId: uuid("session_id"),
	role: text(),
	content: text(),
	chart: jsonb(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	chartTypeOverride: text("chart_type_override"),
	langsmithRunId: text("langsmith_run_id"),
	model: text(),
	latencyMs: integer("latency_ms"),
	inputTokens: integer("input_tokens"),
	outputTokens: integer("output_tokens"),
}).with({"securityInvoker":true}).as(sql`SELECT id, session_id, role, content, chart, error, created_at, chart_type_override, langsmith_run_id, model, latency_ms, input_tokens, output_tokens FROM kitchen.analytics_chat_message`);

export const moduleChatSessionInCore = core.view("module_chat_session", {	id: uuid(),
	userId: uuid("user_id"),
	module: text(),
	scopeId: integer("scope_id"),
	title: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, user_id, module, scope_id, title, created_at, updated_at FROM kitchen.module_chat_session`);

export const moduleChatMessageInCore = core.view("module_chat_message", {	id: uuid(),
	sessionId: uuid("session_id"),
	role: text(),
	content: text(),
	toolCalls: jsonb("tool_calls"),
	toolCallId: text("tool_call_id"),
	toolName: text("tool_name"),
	toolResult: jsonb("tool_result"),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	langsmithRunId: text("langsmith_run_id"),
	model: text(),
	latencyMs: integer("latency_ms"),
	inputTokens: integer("input_tokens"),
	outputTokens: integer("output_tokens"),
}).with({"securityInvoker":true}).as(sql`SELECT id, session_id, role, content, tool_calls, tool_call_id, tool_name, tool_result, error, created_at, langsmith_run_id, model, latency_ms, input_tokens, output_tokens FROM kitchen.module_chat_message`);

export const changelogInCore = core.view("changelog", {	id: uuid(),
	version: text(),
	title: text(),
	body: text(),
	tags: text(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	published: boolean(),
}).with({"securityInvoker":true}).as(sql`SELECT id, version, title, body, tags, published_at, published FROM kitchen.changelog`);

export const superAdminControllerInCore = core.view("super_admin_controller", {	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	key: text(),
	active: boolean(),
	value: text(),
}).with({"securityInvoker":true}).as(sql`SELECT created_at, key, active, value FROM kitchen.super_admin_controller`);

export const workforceCategoryInCore = core.view("workforce_category", {	id: uuid(),
	code: text(),
	name: text(),
	description: text(),
	sortOrder: integer("sort_order"),
	isCareer: boolean("is_career"),
	isTechnical: boolean("is_technical"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT id, code, name, description, sort_order, is_career, is_technical, created_at, deleted_at FROM kitchen.workforce_category`);

export const vSupplierLeadTimeInInventory = inventory.view("v_supplier_lead_time", {	niFornecedor: text("ni_fornecedor"),
	purchaseItemId: uuid("purchase_item_id"),
	supplyOrderId: uuid("supply_order_id"),
	sentAt: date("sent_at"),
	expectedDelivery: date("expected_delivery"),
	receivedAt: date("received_at"),
	leadTimeDays: integer("lead_time_days"),
	deviationDays: integer("deviation_days"),
}).with({"securityInvoker":true}).as(sql`SELECT arpitem.ni_fornecedor, soi.purchase_item_id, so.id AS supply_order_id, so.sent_at, so.expected_delivery, gr.definitive_at::date AS received_at, gr.definitive_at::date - so.sent_at AS lead_time_days, gr.definitive_at::date - so.expected_delivery AS deviation_days FROM procurement.supply_order so JOIN inventory.goods_receipt gr ON gr.supply_order_id = so.id AND gr.definitive_at IS NOT NULL JOIN procurement.supply_order_item soi ON soi.supply_order_id = so.id LEFT JOIN procurement.procurement_arp_item arpitem ON arpitem.id = soi.arp_item_id WHERE so.sent_at IS NOT NULL`);

export const migrationNutrientLookupInCore = core.view("migration_nutrient_lookup", {	legacyIdNutriente: integer("legacy_id_nutriente"),
	newNutrientId: uuid("new_nutrient_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
}).with({"securityInvoker":true}).as(sql`SELECT legacy_id_nutriente, new_nutrient_id, created_at FROM kitchen.migration_nutrient_lookup`);