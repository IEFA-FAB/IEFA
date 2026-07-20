import { pgEnum, pgSchema, index, foreignKey, unique, uuid, varchar, text, timestamp, bigint, numeric, boolean, pgPolicy, json, integer, smallint, check, date, uniqueIndex, bigserial, jsonb, doublePrecision } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const accessControl = pgSchema("access_control");
export const core = pgSchema("core");
export const kitchen = pgSchema("kitchen");
export const procurement = pgSchema("procurement");
export const comprasGovIntegration = pgSchema("compras_gov_integration");
export const nutritionReference = pgSchema("nutrition_reference");
export const finance = pgSchema("finance");
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

export const migrationRecipeLookupInCore = core.table("migration_recipe_lookup", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyIdPreparacao: bigint("legacy_id_preparacao", { mode: "number" }).primaryKey().notNull(),
	newRecipeId: uuid("new_recipe_id").notNull(),
	legacyRendimento: numeric("legacy_rendimento"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_migration_recipe_lookup_new_id").using("btree", table.newRecipeId.asc().nullsLast().op("uuid_ops")),
	unique("migration_recipe_lookup_new_recipe_id_key").on(table.newRecipeId),
]);

export const changelogInCore = core.table("changelog", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	version: text(),
	title: text().notNull(),
	body: text().notNull(),
	tags: text().array().default([""]),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	published: boolean().default(true).notNull(),
});

export const menuItemsInKitchen = kitchen.table("menu_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	dailyMenuId: uuid("daily_menu_id"),
	recipe: json(),
	plannedPortionQuantity: numeric("planned_portion_quantity"),
	excludedFromProcurement: numeric("excluded_from_procurement"),
	substitutions: json(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	recipeOriginId: uuid("recipe_origin_id"),
	itemGroup: text("item_group"),
	sortOrder: smallint("sort_order").default(0).notNull(),
	recommendedProportion: numeric("recommended_proportion"),
}, (table) => [
	foreignKey({
			columns: [table.dailyMenuId],
			foreignColumns: [dailyMenuInKitchen.id],
			name: "menu_items_daily_menu_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeOriginId],
			foreignColumns: [recipesInKitchen.id],
			name: "menu_items_recipe_origin_id_fkey"
		}),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const kitchenInCore = core.table("kitchen", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "core.kitchen_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
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
}, (table) => [
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
			foreignColumns: [messHallsInCore.id],
			name: "user_data_default_mess_hall_id_fkey"
		}),
	foreignKey({
			columns: [table.id],
			foreignColumns: [usersInAuth.id],
			name: "user_email_id_fkey"
		}),
	unique("user_email_email_key").on(table.email),
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

export const superAdminControllerInCore = core.table("super_admin_controller", {
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	key: text().primaryKey().notNull(),
	active: boolean(),
	value: text(),
}, (table) => [
	unique("super_admin_controller_key_key").on(table.key),
]);

export const migrationFolderLookupInCore = core.table("migration_folder_lookup", {
	legacyIdGrupoProduto: integer("legacy_id_grupo_produto").primaryKey().notNull(),
	newFolderId: uuid("new_folder_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("migration_folder_lookup_new_folder_id_key").on(table.newFolderId),
]);

export const mealTypeInKitchen = kitchen.table("meal_type", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	name: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	sortOrder: smallint("sort_order"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInCore.id],
			name: "meal_type_kitchen_id_fkey"
		}),
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
			foreignColumns: [messHallsInCore.id],
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
			foreignColumns: [messHallsInCore.id],
			name: "other_presences_mess_hall_id_fkey"
		}).onDelete("restrict"),
	check("other_presences_meal_check", sql`meal = ANY (ARRAY['cafe'::text, 'almoco'::text, 'janta'::text, 'ceia'::text])`),
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
			foreignColumns: [kitchenInCore.id],
			name: "daily_menu_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.mealTypeId],
			foreignColumns: [mealTypeInKitchen.id],
			name: "daily_menu_meal_type_id_fkey"
		}),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
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
	recommendedProportion: numeric("recommended_proportion"),
}, (table) => [
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
]);

export const recipesInKitchen = kitchen.table("recipes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	version: smallint().notNull(),
	name: text().notNull(),
	preparationMethod: text("preparation_method"),
	portionYield: numeric("portion_yield"),
	preparationTimeMinutes: smallint("preparation_time_minutes"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	baseRecipeId: uuid("base_recipe_id"),
	upstreamVersionSnapshot: smallint("upstream_version_snapshot"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	rationalId: text("rational_id"),
	cookingFactor: numeric("cooking_factor"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyId: bigint("legacy_id", { mode: "number" }),
}, (table) => [
	index("recipes_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInCore.id],
			name: "recipes_kitchen_id_fkey"
		}),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
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
}, (table) => [
	index("idx_user_permissions_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInCore.id],
			name: "user_permissions_kitchen_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.messHallId],
			foreignColumns: [messHallsInCore.id],
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

export const mcpApiKeysInAccessControl = accessControl.table("mcp_api_keys", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	label: text().notNull(),
	keyHash: text("key_hash").notNull(),
	keyPrefix: text("key_prefix").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("mcp_api_keys_hash_active_idx").using("btree", table.keyHash.asc().nullsLast().op("text_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [usersInAuth.id],
			name: "mcp_api_keys_user_id_fkey"
		}).onDelete("cascade"),
	unique("mcp_api_keys_key_hash_key").on(table.keyHash),
]);

export const comprasMaterialNaturezaDespesaInComprasGovIntegration = comprasGovIntegration.table("compras_material_natureza_despesa", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	codigoPdm: integer("codigo_pdm").notNull(),
	codigoNaturezaDespesa: text("codigo_natureza_despesa").notNull(),
	nomeNaturezaDespesa: text("nome_natureza_despesa").notNull(),
	statusNaturezaDespesa: boolean("status_natureza_despesa").default(true).notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_material_natureza_des_codigo_pdm_codigo_natureza_de_key").on(table.codigoPdm, table.codigoNaturezaDespesa),
]);

export const migrationNutrientLookupInCore = core.table("migration_nutrient_lookup", {
	legacyIdNutriente: integer("legacy_id_nutriente").primaryKey().notNull(),
	newNutrientId: uuid("new_nutrient_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("migration_nutrient_lookup_new_nutrient_id_key").on(table.newNutrientId),
]);

export const comprasMaterialCaracteristicaInComprasGovIntegration = comprasGovIntegration.table("compras_material_caracteristica", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
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

export const purchaseItemInProcurement = procurement.table("purchase_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	description: text().notNull(),
	detailedDescription: text("detailed_description"),
	deliveryConditioning: text("delivery_conditioning"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	catmatItemCodigo: integer("catmat_item_codigo"),
	catmatItemDescricao: text("catmat_item_descricao"),
	catmatMatchStatus: text("catmat_match_status"),
	catmatMatchScore: numeric("catmat_match_score"),
	gpcSegmentCode: text("gpc_segment_code"),
	gpcFamilyCode: text("gpc_family_code"),
	gpcClassCode: text("gpc_class_code"),
	gpcBrickCode: text("gpc_brick_code"),
	unitPrice: numeric("unit_price", { precision: 12, scale:  4 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("purchase_item_catmat_idx").using("btree", table.catmatItemCodigo.asc().nullsLast().op("int4_ops")).where(sql`(deleted_at IS NULL)`),
	index("purchase_item_description_trgm_idx").using("gin", table.description.asc().nullsLast().op("gin_trgm_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.catmatItemCodigo],
			foreignColumns: [comprasMaterialItemInComprasGovIntegration.codigoItem],
			name: "purchase_item_catmat_item_codigo_fkey"
		}).onDelete("set null"),
	check("purchase_item_catmat_match_status_check", sql`catmat_match_status = ANY (ARRAY['pending'::text, 'matched'::text, 'review'::text, 'no_match'::text, 'skip'::text])`),
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

export const comprasServicoNaturezaDespesaInComprasGovIntegration = comprasGovIntegration.table("compras_servico_natureza_despesa", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	codigoServico: integer("codigo_servico").notNull(),
	codigoNaturezaDespesa: text("codigo_natureza_despesa").notNull(),
	nomeNaturezaDespesa: text("nome_natureza_despesa").notNull(),
	statusNaturezaDespesa: boolean("status_natureza_despesa").default(true).notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_servico_natureza_desp_codigo_servico_codigo_naturez_key").on(table.codigoServico, table.codigoNaturezaDespesa),
]);

export const comprasSyncLogInComprasGovIntegration = comprasGovIntegration.table("compras_sync_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
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
}, (table) => [
	index("idx_compras_sync_log_started_at").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const ingredientInKitchen = kitchen.table("ingredient", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	description: text(),
	measureUnit: text("measure_unit"),
	correctionFactor: numeric("correction_factor"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	folderId: uuid("folder_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyId: bigint("legacy_id", { mode: "number" }),
	ceafaId: uuid("ceafa_id"),
	densityFactor: numeric("density_factor"),
	rehydrationIndex: numeric("rehydration_index"),
}, (table) => [
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
]);

export const frozenPreparationInKitchen = kitchen.table("frozen_preparation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	description: text().notNull(),
	measureUnit: text("measure_unit"),
	yieldQuantity: numeric("yield_quantity"),
	correctionFactor: numeric("correction_factor"),
	densityFactor: numeric("density_factor"),
	category: text().default('preparacao').notNull(),
	productionRecipeId: uuid("production_recipe_id"),
	regenerationRecipeId: uuid("regeneration_recipe_id"),
	shelfLifeDays: integer("shelf_life_days"),
	storageTemperatureC: numeric("storage_temperature_c"),
	storageInstructions: text("storage_instructions"),
	ceafaId: uuid("ceafa_id"),
	sourceIngredientId: uuid("source_ingredient_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyId: bigint("legacy_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("frozen_preparation_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")).where(sql`(deleted_at IS NULL)`),
	index("frozen_preparation_source_ingredient_idx").using("btree", table.sourceIngredientId.asc().nullsLast().op("uuid_ops")).where(sql`(deleted_at IS NULL)`),
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
			columns: [table.ceafaId],
			foreignColumns: [ceafaInKitchen.id],
			name: "frozen_preparation_ceafa_id_fkey"
		}),
	foreignKey({
			columns: [table.sourceIngredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "frozen_preparation_source_ingredient_id_fkey"
		}),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
	check("frozen_preparation_category_check", sql`category = ANY (ARRAY['preparacao'::text, 'prato_pronto'::text, 'lanche_pronto'::text])`),
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
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "ingredient_nutrition_reference_ingredient_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.foodRevisionId],
			foreignColumns: [nutritionFoodItemRevisionInNutritionReference.id],
			name: "ingredient_nutrition_reference_food_revision_id_fkey"
		}).onDelete("restrict"),
	check("ingredient_nutrition_reference_status_check", sql`match_status = ANY (ARRAY['manual'::text, 'suggested'::text, 'reviewed'::text])`),
]);

export const purchaseItemIngredientInProcurement = procurement.table("purchase_item_ingredient", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	purchaseItemId: uuid("purchase_item_id").notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	conversionFactor: numeric("conversion_factor", { precision: 12, scale:  6 }).default('1.0').notNull(),
	conversionNotes: text("conversion_notes"),
	isDefault: boolean("is_default").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("purchase_item_ingredient_ingredient_idx").using("btree", table.ingredientId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "purchase_item_ingredient_ingredient_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.purchaseItemId],
			foreignColumns: [purchaseItemInProcurement.id],
			name: "purchase_item_ingredient_purchase_item_id_fkey"
		}).onDelete("cascade"),
	unique("purchase_item_ingredient_purchase_item_id_ingredient_id_key").on(table.purchaseItemId, table.ingredientId),
]);

export const comprasSyncStepInComprasGovIntegration = comprasGovIntegration.table("compras_sync_step", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
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
			foreignColumns: [comprasSyncLogInComprasGovIntegration.id],
			name: "compras_sync_step_sync_id_fkey"
		}).onDelete("cascade"),
	unique("compras_sync_step_sync_id_step_name_key").on(table.syncId, table.stepName),
]);

export const nutritionSourceInNutritionReference = nutritionReference.table("source", {
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

export const nutritionSourceReleaseInNutritionReference = nutritionReference.table("source_release", {
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
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [nutritionSourceInNutritionReference.id],
			name: "source_release_source_id_fkey"
		}).onDelete("cascade"),
	unique("nutrition_source_release_source_version_key").on(table.sourceId, table.versionLabel),
	check("nutrition_source_release_status_check", sql`status = ANY (ARRAY['active'::text, 'superseded'::text, 'blocked'::text, 'failed'::text])`),
]);

export const nutritionFoodItemInNutritionReference = nutritionReference.table("food_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sourceId: text("source_id").notNull(),
	externalCode: text("external_code").notNull(),
	currentRevisionId: uuid("current_revision_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [nutritionSourceInNutritionReference.id],
			name: "food_item_source_id_fkey"
		}).onDelete("cascade"),
	unique("food_item_source_id_external_code_key").on(table.sourceId, table.externalCode),
]);

export const nutritionFoodItemRevisionInNutritionReference = nutritionReference.table("food_item_revision", {
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
	baseQuantity: numeric("base_quantity").default('100').notNull(),
	baseUnit: text("base_unit").default('g').notNull(),
	ediblePortionFactor: numeric("edible_portion_factor"),
	normalizedName: text("normalized_name").notNull(),
	contentHash: text("content_hash").notNull(),
	raw: jsonb().default({}).notNull(),
	isCurrent: boolean("is_current").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("nutrition_food_revision_current_idx").using("btree", table.foodItemId.asc().nullsLast().op("uuid_ops")).where(sql`is_current`),
	foreignKey({
			columns: [table.foodItemId],
			foreignColumns: [nutritionFoodItemInNutritionReference.id],
			name: "food_item_revision_food_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceReleaseId],
			foreignColumns: [nutritionSourceReleaseInNutritionReference.id],
			name: "food_item_revision_source_release_id_fkey"
		}).onDelete("restrict"),
	unique("food_item_revision_food_item_id_source_release_id_content_hash_key").on(table.foodItemId, table.sourceReleaseId, table.contentHash),
]);

export const nutritionNutrientComponentInNutritionReference = nutritionReference.table("nutrient_component", {
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
			foreignColumns: [nutritionSourceInNutritionReference.id],
			name: "nutrient_component_source_id_fkey"
		}).onDelete("cascade"),
	unique("nutrient_component_source_id_external_code_key").on(table.sourceId, table.externalCode),
]);

export const nutritionNutrientComponentMappingInNutritionReference = nutritionReference.table("nutrient_component_mapping", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	componentId: uuid("component_id").notNull(),
	nutrientId: uuid("nutrient_id").notNull(),
	conversionMultiplier: numeric("conversion_multiplier").default('1').notNull(),
	conversionOffset: numeric("conversion_offset").default('0').notNull(),
	isPreferred: boolean("is_preferred").default(true).notNull(),
	confidence: text().default('seeded').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.componentId],
			foreignColumns: [nutritionNutrientComponentInNutritionReference.id],
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

export const nutritionFoodNutrientValueInNutritionReference = nutritionReference.table("food_nutrient_value", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	foodRevisionId: uuid("food_revision_id").notNull(),
	componentId: uuid("component_id").notNull(),
	value: numeric(),
	valueKind: text("value_kind").default('measured').notNull(),
	rawValue: text("raw_value"),
	raw: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.foodRevisionId],
			foreignColumns: [nutritionFoodItemRevisionInNutritionReference.id],
			name: "food_nutrient_value_food_revision_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.componentId],
			foreignColumns: [nutritionNutrientComponentInNutritionReference.id],
			name: "food_nutrient_value_component_id_fkey"
		}).onDelete("cascade"),
	unique("food_nutrient_value_food_revision_id_component_id_key").on(table.foodRevisionId, table.componentId),
	check("nutrition_food_nutrient_value_kind_check", sql`value_kind = ANY (ARRAY['measured'::text, 'calculated'::text, 'assumed'::text, 'trace'::text, 'not_analyzed'::text, 'missing'::text])`),
]);

export const nutritionSyncLogInNutritionReference = nutritionReference.table("nutrition_sync_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	triggeredBy: text("triggered_by").default('cron').notNull(),
	status: text().default('running').notNull(),
	totalSteps: integer("total_steps").default(0).notNull(),
	completedSteps: integer("completed_steps").default(0).notNull(),
	successfulSteps: integer("successful_steps").default(0).notNull(),
	failedSteps: integer("failed_steps").default(0).notNull(),
	totalUpserted: integer("total_upserted").default(0).notNull(),
	totalDeactivated: integer("total_deactivated").default(0).notNull(),
	errorMessage: text("error_message"),
	heartbeatAt: timestamp("heartbeat_at", { withTimezone: true, mode: 'string' }),
	stopRequested: boolean("stop_requested").default(false).notNull(),
}, (table) => [
	index("nutrition_sync_log_started_at_idx").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const nutritionSyncStepInNutritionReference = nutritionReference.table("nutrition_sync_step", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
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
			foreignColumns: [nutritionSyncLogInNutritionReference.id],
			name: "nutrition_sync_step_sync_id_fkey"
		}).onDelete("cascade"),
	unique("nutrition_sync_step_sync_id_step_name_key").on(table.syncId, table.stepName),
]);

export const unitsInCore = core.table("units", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
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
}, (table) => [
	unique("units_code_key").on(table.code),
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
}, (table) => [
	index("idx_procurement_list_unit_status").using("btree", table.unitId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("int4_ops")).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "procurement_ata_unit_id_fkey"
		}),
	check("procurement_ata_status_check", sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`),
	check("procurement_list_wizard_step_check", sql`(wizard_step >= 1) AND (wizard_step <= 4)`),
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
	totalQuantity: numeric("total_quantity", { precision: 14, scale:  4 }).notNull(),
	unitPrice: numeric("unit_price", { precision: 12, scale:  4 }),
	purchaseItemId: uuid("purchase_item_id"),
	purchaseItemDescription: text("purchase_item_description"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	purchaseQuantity: numeric("purchase_quantity", { precision: 14, scale:  4 }),
	conversionFactor: numeric("conversion_factor", { precision: 12, scale:  6 }),
	itemDescription: text("item_description"),
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
			foreignColumns: [kitchenInCore.id],
			name: "procurement_ata_kitchen_kitchen_id_fkey"
		}),
	unique("procurement_ata_kitchen_ata_id_kitchen_id_key").on(table.listId, table.kitchenId),
]);

export const procurementListSelectionInProcurement = procurement.table("procurement_list_selection", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	listKitchenId: uuid("list_kitchen_id").notNull(),
	templateId: uuid("template_id").notNull(),
	repetitions: integer().default(1).notNull(),
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
	check("procurement_ata_selection_repetitions_check", sql`repetitions > 0`),
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
}, (table) => [
	index("production_task_kitchen_id_production_date_idx").using("btree", table.kitchenId.asc().nullsLast().op("int4_ops"), table.productionDate.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInCore.id],
			name: "production_task_kitchen_id_fkey"
		}),
	foreignKey({
			columns: [table.menuItemId],
			foreignColumns: [menuItemsInKitchen.id],
			name: "production_task_menu_item_id_fkey"
		}).onDelete("cascade"),
	unique("production_task_menu_item_id_key").on(table.menuItemId),
	check("production_task_status_check", sql`status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'DONE'::text])`),
]);

export const empenhoInFinance = finance.table("empenho", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: integer("unit_id").notNull(),
	arpItemId: uuid("arp_item_id").notNull(),
	numeroEmpenho: text("numero_empenho").notNull(),
	dataEmpenho: date("data_empenho").notNull(),
	quantidadeEmpenhada: numeric("quantidade_empenhada", { precision: 14, scale:  4 }).notNull(),
	valorUnitario: numeric("valor_unitario", { precision: 12, scale:  4 }).notNull(),
	valorTotal: numeric("valor_total", { precision: 14, scale:  4 }).notNull(),
	notaLancamento: text("nota_lancamento"),
	status: text().default('ativo').notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
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
			columns: [table.unitId],
			foreignColumns: [unitsInCore.id],
			name: "empenho_unit_id_fkey"
		}),
	unique("empenho_unit_id_numero_empenho_key").on(table.unitId, table.numeroEmpenho),
	check("empenho_quantidade_empenhada_check", sql`quantidade_empenhada > (0)::numeric`),
	check("empenho_status_check", sql`status = ANY (ARRAY['ativo'::text, 'anulado'::text])`),
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

export const analyticsChatMessageInCore = core.table("analytics_chat_message", {
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
			foreignColumns: [analyticsChatSessionInCore.id],
			name: "analytics_chat_message_session_id_fkey"
		}).onDelete("cascade"),
	check("analytics_chat_message_chart_type_override_check", sql`chart_type_override = ANY (ARRAY['bar'::text, 'line'::text, 'area'::text, 'pie'::text, 'table'::text])`),
	check("analytics_chat_message_has_payload", sql`(btrim(content) <> ''::text) OR (chart IS NOT NULL) OR (error IS NOT NULL))) NOT VALID`),
	check("analytics_chat_message_role_check", sql`role = ANY (ARRAY['user'::text, 'assistant'::text])`),
]);

export const analyticsChatSessionInCore = core.table("analytics_chat_session", {
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

export const moduleChatSessionInCore = core.table("module_chat_session", {
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

export const moduleChatMessageInCore = core.table("module_chat_message", {
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
			foreignColumns: [moduleChatSessionInCore.id],
			name: "module_chat_message_session_id_fkey"
		}).onDelete("cascade"),
	check("module_chat_message_has_payload", sql`(btrim(content) <> ''::text) OR (tool_calls IS NOT NULL) OR (tool_result IS NOT NULL) OR (error IS NOT NULL))) NOT VALID`),
	check("module_chat_message_role_check", sql`role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])`),
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
			foreignColumns: [kitchenInCore.id],
			name: "step_template_kitchen_id_fkey"
		}),
]);

export const utensilInKitchen = kitchen.table("utensil", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("utensil_name_active_uniq").using("btree", sql`lower(name)`, sql`COALESCE(kitchen_id, (0)::bigint)`).where(sql`(deleted_at IS NULL)`),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInCore.id],
			name: "utensil_kitchen_id_fkey"
		}),
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
	quantity: numeric(),
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

export const recipeStepInputInKitchen = kitchen.table("recipe_step_input", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeStepId: uuid("recipe_step_id").notNull(),
	recipeIngredientId: uuid("recipe_ingredient_id"),
	sourceOutputId: uuid("source_output_id"),
	quantity: numeric(),
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
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	codigoPdm: integer("codigo_pdm").notNull(),
	numeroSequencialUnidadeFornecimento: integer("numero_sequencial_unidade_fornecimento"),
	siglaUnidadeFornecimento: text("sigla_unidade_fornecimento"),
	nomeUnidadeFornecimento: text("nome_unidade_fornecimento"),
	descricaoUnidadeFornecimento: text("descricao_unidade_fornecimento"),
	siglaUnidadeMedida: text("sigla_unidade_medida"),
	capacidadeUnidadeFornecimento: numeric("capacidade_unidade_fornecimento", { precision: 12, scale:  4 }),
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
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	codigoServico: integer("codigo_servico").notNull(),
	siglaUnidadeMedida: text("sigla_unidade_medida").notNull(),
	nomeUnidadeMedida: text("nome_unidade_medida"),
	statusUnidadeMedida: boolean("status_unidade_medida").default(true).notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("compras_servico_unidade_medid_codigo_servico_sigla_unidade__key").on(table.codigoServico, table.siglaUnidadeMedida),
]);

export const messHallsInCore = core.table("mess_halls", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	code: text().notNull(),
	displayName: text("display_name"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	kitchenId: bigint("kitchen_id", { mode: "number" }),
}, (table) => [
	index("mess_halls_unit_id_idx").using("btree", table.unitId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInCore.id],
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

export const opinionsInCore = core.table("opinions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "core.opinions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
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

export const migrationProductLookupInCore = core.table("migration_product_lookup", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	legacyIdInsumo: bigint("legacy_id_insumo", { mode: "number" }).primaryKey().notNull(),
	newProductId: uuid("new_product_id").notNull(),
	legacyDescricao: text("legacy_descricao"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_migration_product_lookup_new_id").using("btree", table.newProductId.asc().nullsLast().op("uuid_ops")),
	unique("migration_product_lookup_new_product_id_key").on(table.newProductId),
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
}, (table) => [
	foreignKey({
			columns: [table.baseTemplateId],
			foreignColumns: [table.id],
			name: "menu_template_base_template_id_fkey"
		}),
	foreignKey({
			columns: [table.kitchenId],
			foreignColumns: [kitchenInCore.id],
			name: "menu_template_kitchen_id_fkey"
		}),
	check("menu_template_template_type_check", sql`template_type = ANY (ARRAY['weekly'::text, 'event'::text, 'exception'::text])`),
	check("menu_template_expected_monthly_occurrences_check", sql`expected_monthly_occurrences IS NULL OR expected_monthly_occurrences > 0`),
]);

export const menuTemplateMealInKitchen = kitchen.table("menu_template_meal", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	menuTemplateId: uuid("menu_template_id").notNull(),
	dayOfWeek: smallint("day_of_week").notNull(),
	mealTypeId: uuid("meal_type_id").notNull(),
	baseHeadcount: integer("base_headcount"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("menu_template_meal_unique").using("btree", table.menuTemplateId.asc().nullsLast().op("uuid_ops"), table.dayOfWeek.asc().nullsLast().op("int2_ops"), table.mealTypeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.menuTemplateId],
			foreignColumns: [menuTemplateInKitchen.id],
			name: "menu_template_meal_menu_template_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.mealTypeId],
			foreignColumns: [mealTypeInKitchen.id],
			name: "menu_template_meal_meal_type_id_fkey"
		}),
	check("menu_template_meal_day_check", sql`day_of_week >= 1 AND day_of_week <= 7`),
	check("menu_template_meal_headcount_check", sql`base_headcount IS NULL OR base_headcount > 0`),
	pgPolicy("realtime_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const recipeIngredientsInKitchen = kitchen.table("recipe_ingredients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id"),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	netQuantity: numeric("net_quantity"),
	isOptional: boolean("is_optional"),
	priorityOrder: smallint("priority_order"),
	correctionFactor: numeric("correction_factor"),
	rehydrationIndex: numeric("rehydration_index"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("recipe_ingredients_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")),
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
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "recipe_ingredients_frozen_preparation_id_fkey"
		}),
	check("recipe_ingredients_source_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) <= 1`),
]);

export const recipeIngredientAlternativesInKitchen = kitchen.table("recipe_ingredient_alternatives", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	recipeIngredientId: uuid("recipe_ingredient_id"),
	ingredientId: uuid("ingredient_id"),
	frozenPreparationId: uuid("frozen_preparation_id"),
	netQuantity: numeric("net_quantity"),
	priorityOrder: smallint("priority_order"),
}, (table) => [
	foreignKey({
			columns: [table.ingredientId],
			foreignColumns: [ingredientInKitchen.id],
			name: "recipe_ingredient_alternatives_product_id_fkey"
		}),
	foreignKey({
			columns: [table.recipeIngredientId],
			foreignColumns: [recipeIngredientsInKitchen.id],
			name: "recipe_ingredient_alternatives_recipe_ingredient_id_fkey"
		}),
	foreignKey({
			columns: [table.frozenPreparationId],
			foreignColumns: [frozenPreparationInKitchen.id],
			name: "recipe_ingredient_alternatives_frozen_preparation_id_fkey"
		}),
	check("recipe_ingredient_alt_source_xor", sql`num_nonnulls(ingredient_id, frozen_preparation_id) <= 1`),
]);

export const ingredientSubstitutionInKitchen = kitchen.table("ingredient_substitution", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	substituteIngredientId: uuid("substitute_ingredient_id").notNull(),
	factor: numeric().default('1').notNull(),
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
			foreignColumns: [messHallsInCore.id],
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

export const ingredientItemInKitchen = kitchen.table("ingredient_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	description: text(),
	ingredientId: uuid("ingredient_id"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	unitContentQuantity: numeric("unit_content_quantity"),
	correctionFactor: numeric("correction_factor"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	barcode: text(),
	purchaseItemId: uuid("purchase_item_id"),
}, (table) => [
	index("ingredient_item_purchase_item_idx").using("btree", table.purchaseItemId.asc().nullsLast().op("uuid_ops")).where(sql`(purchase_item_id IS NOT NULL)`),
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

export const ingredientNutrientInKitchen = kitchen.table("ingredient_nutrient", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ingredientId: uuid("ingredient_id").notNull(),
	nutrientId: uuid("nutrient_id").notNull(),
	nutrientValue: numeric("nutrient_value"),
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
	dailyValue: numeric("daily_value"),
	minimumValue: numeric("minimum_value"),
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
	quantity: numeric().notNull(),
	description: text().notNull(),
	legacyId: integer("legacy_id"),
}, (table) => [
	unique("ceafa_legacy_id_key").on(table.legacyId),
]);

export const folderInKitchen = kitchen.table("folder", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	parentId: uuid("parent_id"),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	description: text(),
	legacyId: integer("legacy_id"),
}, (table) => [
	index("folder_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("folder_deleted_at_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("folder_description_idx").using("btree", table.description.asc().nullsLast().op("text_ops")),
	index("folder_parent_id_idx").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
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

export const procurementArpItemInProcurement = procurement.table("procurement_arp_item", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	arpId: uuid("arp_id").notNull(),
	ataItemId: uuid("ata_item_id"),
	numeroItem: integer("numero_item"),
	catmatItemCodigo: integer("catmat_item_codigo"),
	descricaoItem: text("descricao_item"),
	niFornecedor: text("ni_fornecedor"),
	nomeFornecedor: text("nome_fornecedor"),
	valorUnitario: numeric("valor_unitario", { precision: 12, scale:  4 }),
	quantidadeHomologada: numeric("quantidade_homologada", { precision: 14, scale:  4 }),
	medidaCatmat: text("medida_catmat"),
	quantidadeEmpenhada: numeric("quantidade_empenhada", { precision: 14, scale:  4 }).default('0'),
	saldoEmpenho: numeric("saldo_empenho", { precision: 14, scale:  4 }),
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

export const procurementPesquisaPrecoInProcurement = procurement.table("procurement_pesquisa_preco", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ataId: uuid("ata_id"),
	referenceMethod: text("reference_method").default('median').notNull(),
	periodMonths: smallint("period_months").default(12),
	similarityThreshold: numeric("similarity_threshold", { precision: 4, scale:  3 }),
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
	priceMin: numeric("price_min", { precision: 12, scale:  4 }),
	priceMax: numeric("price_max", { precision: 12, scale:  4 }),
	priceMean: numeric("price_mean", { precision: 12, scale:  4 }),
	priceMedian: numeric("price_median", { precision: 12, scale:  4 }),
	stdDev: numeric("std_dev", { precision: 12, scale:  4 }),
	cvPct: numeric("cv_pct", { precision: 8, scale:  2 }),
	uniqueSources: integer("unique_sources"),
	referencePrice: numeric("reference_price", { precision: 12, scale:  4 }),
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

export const procurementPesquisaPrecoAmostraInProcurement = procurement.table("procurement_pesquisa_preco_amostra", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	researchItemId: uuid("research_item_id").notNull(),
	sampleType: text("sample_type").notNull(),
	similarity: numeric({ precision: 4, scale:  3 }),
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
			foreignColumns: [kitchenInCore.id],
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
	precoUnitario: numeric("preco_unitario", { precision: 12, scale:  4 }),
	capacidadeUnidadeFornecimento: numeric("capacidade_unidade_fornecimento", { precision: 12, scale:  4 }),
	siglaUnidadeFornecimento: text("sigla_unidade_fornecimento"),
	siglaUnidadeMedida: text("sigla_unidade_medida"),
	quantidade: numeric({ precision: 14, scale:  4 }),
	codigoUasg: text("codigo_uasg"),
	nomeUasg: text("nome_uasg"),
	municipio: text(),
	estado: text(),
	esfera: text(),
	marca: text(),
	normalizedPrice: numeric("normalized_price", { precision: 12, scale:  4 }),
	referenceDate: date("reference_date"),
	fingerprint: text().generatedAlwaysAs(sql`sisub.compras_amostra_fingerprint(id_compra, id_item_compra, descricao_item, preco_unitario, capacidade_unidade_fornecimento, sigla_unidade_fornecimento, sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg, municipio, estado, esfera, marca, normalized_price, reference_date)`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_compras_amostra_compra").using("btree", table.idCompra.asc().nullsLast().op("int4_ops"), table.idItemCompra.asc().nullsLast().op("int4_ops")),
	uniqueIndex("uq_compras_amostra_fingerprint").using("btree", table.fingerprint.asc().nullsLast().op("text_ops")),
]);
export const vUserIdentityInCore = core.view("v_user_identity", {	id: uuid(),
	displayName: text("display_name"),
}).with({ securityInvoker: true }).as(sql`SELECT ud.id, CASE WHEN NULLIF(TRIM(BOTH FROM (COALESCE(umd."sgPosto", ''::text) || ' '::text) || COALESCE(umd."nmGuerra", ''::text)), ''::text) IS NOT NULL THEN TRIM(BOTH FROM (COALESCE(umd."sgPosto", ''::text) || ' '::text) || initcap(COALESCE(umd."nmGuerra", ''::text))) ELSE ud.email END AS display_name FROM core.user_data ud LEFT JOIN core.user_military_data umd ON umd."nrOrdem" = ud."nrOrdem"`);

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

export const vIngredientKgLtItemsInKitchen = kitchen.view("v_ingredient_kg_lt_items", {	productId: uuid("product_id"),
	description: text(),
	baseUnit: text("base_unit"),
	densityFactor: numeric("density_factor"),
	productItemId: uuid("product_item_id"),
	itemDescription: text("item_description"),
	purchaseMeasureUnit: text("purchase_measure_unit"),
	kgToBaseFactor: numeric("kg_to_base_factor"),
	itemCreatedAt: timestamp("item_created_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT p.id AS product_id, p.description, p.measure_unit AS base_unit, p.density_factor, pi.id AS product_item_id, pi.description AS item_description, pi.purchase_measure_unit, pi.unit_content_quantity AS kg_to_base_factor, pi.created_at AS item_created_at FROM kitchen.ingredient p JOIN kitchen.ingredient_item pi ON pi.ingredient_id = p.id AND pi.deleted_at IS NULL AND upper(pi.purchase_measure_unit) = 'KG'::text WHERE p.measure_unit = 'LT'::text AND p.deleted_at IS NULL ORDER BY p.description`);

export const ingredientLastReviewInKitchen = kitchen.view("ingredient_last_review", {	ingredientId: uuid("ingredient_id"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
}).as(sql`SELECT DISTINCT ON (ingredient_id) ingredient_id, reviewed_at, reviewed_by, reviewed_by_name FROM kitchen.ingredient_review ORDER BY ingredient_id, reviewed_at DESC`);

export const recipeLastReviewInKitchen = kitchen.view("recipe_last_review", {	recipeId: uuid("recipe_id"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	reviewedBy: uuid("reviewed_by"),
	reviewedByName: text("reviewed_by_name"),
}).as(sql`SELECT DISTINCT ON (recipe_id) recipe_id, reviewed_at, reviewed_by, reviewed_by_name FROM kitchen.recipe_review ORDER BY recipe_id, reviewed_at DESC`);
