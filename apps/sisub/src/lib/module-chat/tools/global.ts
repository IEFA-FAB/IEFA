/**
 * Global module tools — recipes, ingredients, templates, permissions management.
 * Ported from server functions: recipes.fn.ts, ingredients.fn.ts, templates.fn.ts
 */

import {
	CreateRecipeSchema,
	fetchIngredient as fetchIngredientOp,
	listIngredientItems as listIngredientItemsOp,
	listIngredientNutrients as listIngredientNutrientsOp,
	toJsonSchema,
} from "@iefa/sisub-domain"
import {
	AgentListEquipmentCatalogSchema,
	AgentListIngredientsSchema,
	AgentListLegacyPreparationsSchema,
	AgentListRecipesSchema,
	AgentRecipeEquipmentSchema,
	agentGetRecipe,
	agentGetRecipeEquipment,
	agentListEquipmentCatalog,
	agentListIngredients,
	agentListLegacyPreparations,
	agentListRecipes,
	agentUpdateRecipe,
	clampLimit,
} from "@iefa/sisub-domain/agent"
import type { ModuleToolDefinition } from "./shared"
import { domainCtx, MAX_VALUE_CHARS, requireGlobalPermission, requireUuid, sanitizeDbError, ToolValidationError, toolErr, toolOk, untypedFrom } from "./shared"

const LIST_DEFAULT = 30
const LIST_MAX = 100

/**
 * Catálogo global: as listagens vêm de `@iefa/sisub-domain/agent`, as mesmas que o
 * servidor MCP usa. Entrada, teto e projeção ficam definidos uma vez só — a versão
 * anterior montava PostgREST na mão aqui e no MCP, e as duas divergiam (esta não
 * deduplicava versões, e devolvia o catálogo inteiro com os ingredientes: 10,6 MB).
 */
const listRecipes: ModuleToolDefinition = {
	name: "list_recipes",
	description:
		"Lista receitas globais (padrão SDAB), só com os campos de identificação (nome, versão, rendimento, pasta pelo nome). Suporta busca por nome. O id serve para a chamada seguinte (get_recipe, update_recipe), não para exibir na resposta. Para ingredientes e modo de preparo, chame get_recipe com o id da receita.",
	parameters: toJsonSchema(AgentListRecipesSchema.omit({ kitchenId: true })),
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const input = AgentListRecipesSchema.omit({ kitchenId: true }).parse(args)
		const { items, ...counts } = await agentListRecipes(ctx.db, domainCtx(ctx), { ...input, globalOnly: true })
		return toolOk({ recipes: items, ...counts })
	},
}

const getRecipe: ModuleToolDefinition = {
	name: "get_recipe",
	description: "Retorna a ficha técnica de uma receita: rendimento, tempo, modo de preparo e os insumos com quantidade e unidade.",
	parameters: {
		type: "object",
		properties: { recipeId: { type: "string", description: "ID (UUID) da receita" } },
		required: ["recipeId"],
	},
	requiredLevel: 1,
	// A versão anterior devolvia a linha crua da receita com a linha crua de cada insumo
	// aninhada: ~23 campos por insumo (`deleted_at`, `legacy_id`, `ceafa_id`…) para o modelo
	// escrever "500 g de arroz".
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const recipeId = requireUuid(args.recipeId, "recipeId")
		return toolOk(await agentGetRecipe(ctx.db, domainCtx(ctx), { recipeId }))
	},
}

/**
 * Insumos e preparações passam pelas operations do domínio, não por PostgREST cru.
 *
 * A versão anterior montava a query na mão e errava em três pontos ao mesmo tempo,
 * todos fatais em runtime: ordenava e buscava por uma coluna `name` que
 * `kitchen.ingredient` não tem (a coluna é `description`), convertia `folder_id`
 * — um `uuid` — com `Number()`, e embutia `ingredient_nutrients`/`ingredient_items`
 * no plural quando as tabelas são singulares. Nada disso o typecheck via, porque
 * `untypedFrom` devolve `any` de propósito.
 *
 * Delegar também faz a tool herdar o escopo do catálogo: `list_ingredients` para de
 * devolver, misturadas, as preparações herdadas do SISUBWEB.
 */
const listIngredients: ModuleToolDefinition = {
	name: "list_ingredients",
	description:
		"Lista insumos do catálogo global. Suporta busca por descrição. Não inclui as preparações herdadas do SISUBWEB — para essas, use list_legacy_preparations.",
	parameters: toJsonSchema(AgentListIngredientsSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const input = AgentListIngredientsSchema.parse(args)
		const { items, ...counts } = await agentListIngredients(ctx.db, domainCtx(ctx), input)
		return toolOk({ ingredients: items, ...counts })
	},
}

const listLegacyPreparations: ModuleToolDefinition = {
	name: "list_legacy_preparations",
	description: "Lista as preparações herdadas do SISUBWEB. Elas moram na mesma tabela dos insumos mas não são insumos — os nomes colidem com os das receitas.",
	parameters: toJsonSchema(AgentListLegacyPreparationsSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const input = AgentListLegacyPreparationsSchema.parse(args)
		const { items, ...counts } = await agentListLegacyPreparations(ctx.db, domainCtx(ctx), input)
		return toolOk({ legacy_preparations: items, ...counts })
	},
}

const getIngredient: ModuleToolDefinition = {
	name: "get_ingredient",
	description: "Retorna detalhes de um insumo com nutrientes e itens de produto (SKUs). Funciona também para uma preparação do SISUBWEB, buscando pelo ID.",
	parameters: {
		type: "object",
		properties: { ingredientId: { type: "string", description: "ID (UUID) do insumo" } },
		required: ["ingredientId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const ingredientId = requireUuid(args.ingredientId, "ingredientId")
		const db = ctx.db
		const dctx = domainCtx(ctx)
		// `fetchIngredient` lança NotFoundError; wrapTool converte em erro de tool.
		const [ingredient, nutrients, items] = await Promise.all([
			fetchIngredientOp(db, dctx, { id: ingredientId }),
			listIngredientNutrientsOp(db, dctx, { ingredientId }),
			listIngredientItemsOp(db, dctx, { ingredientId }),
		])
		return toolOk({ ...ingredient, nutrients, items })
	},
}

const listMenuTemplates: ModuleToolDefinition = {
	name: "list_menu_templates",
	description:
		"Lista os modelos globais (SDAB) com contagem de itens: cardápios semanais, eventos e cardápios de apoio — `template_type` distingue (weekly, event, apoio).",
	parameters: {
		type: "object",
		properties: {
			limit: { type: "number", description: `Quantos templates retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)

		const { data, error, count } = await ctx.supabase
			.from("menu_template")
			.select(`id, name, description, template_type, items:menu_template_items(count)`, { count: "exact" })
			.is("deleted_at", null)
			.is("kitchen_id", null)
			.order("name")
			.limit(limit)

		if (error) return toolErr(sanitizeDbError(error, "list_menu_templates"))

		const templates = (data ?? []).map(({ items, ...t }) => ({
			...t,
			item_count: Array.isArray(items) ? ((items[0] as { count: number } | undefined)?.count ?? 0) : 0,
		}))

		return toolOk({ templates, returned: templates.length, total: count ?? templates.length, limit })
	},
}

// ── Argumentos das escritas ─────────────────────────────────────────────────
//
// `parseArgs` é o crivo da tool e também o do cartão de aprovação (`describe-action.ts`): o que
// ele aceita é exatamente o que o handler grava.

export type CreateRecipeArgs = { name: string; preparationTime?: number; cookingFactor?: number }

export type UpdateRecipeArgs = { recipeId: string; name?: string; preparationTime?: number; cookingFactor?: number }

/**
 * Regras do domínio para os dois números da receita, as mesmas que a ficha técnica aplica
 * (`CreateRecipeSchema`): tempo de preparo inteiro, não negativo e dentro do `smallint` da coluna
 * (acima dele o insert morre no driver com `22003`); fator de cocção positivo — fator zero zera
 * o peso cozido de toda a receita.
 */
const PREPARATION_TIME_SCHEMA = CreateRecipeSchema.shape.preparationTimeMinutes
const COOKING_FACTOR_SCHEMA = CreateRecipeSchema.shape.cookingFactor

/** Número em texto que o modelo às vezes manda no lugar do número (`"45"`, `"0.85"`). */
const NUMERIC_TEXT_RE = /^-?\d+(?:\.\d+)?$/

/**
 * Campo numérico opcional: ausente fica ausente; presente tem de passar na regra do domínio.
 * Aceita o número em texto (`"45"`), convertido antes da regra. Não é `Number()` cru: com ele
 * "abc" virava `NaN`, gravado como `null` sem aviso, e o cartão de aprovação mostrava "NaN min";
 * e `""` viraria `0`.
 */
function optionalNumber(value: unknown, schema: typeof PREPARATION_TIME_SCHEMA | typeof COOKING_FACTOR_SCHEMA, message: string): number | undefined {
	if (value == null) return undefined
	const trimmed = typeof value === "string" ? value.trim() : null
	const candidate = trimmed !== null && NUMERIC_TEXT_RE.test(trimmed) ? Number(trimmed) : value
	const result = schema.safeParse(candidate)
	if (!result.success || result.data === undefined) throw new ToolValidationError(message)
	return result.data
}

const PREPARATION_TIME_MESSAGE = `Tempo de preparo deve ser um número inteiro de minutos, de 0 a ${PREPARATION_TIME_SCHEMA.unwrap().maxValue}`
const COOKING_FACTOR_MESSAGE = "Fator de cocção deve ser um número maior que zero"

/**
 * Quebra de linha, caractere de controle (inclusive os separadores de linha/parágrafo Unicode) e
 * de formatação invisível (`\p{Cf}`: override bidi, largura zero) — com U+202E o cartão desenharia
 * o nome invertido, e o que se confirma não seria o que se grava.
 */
const NAME_CONTROL_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

/**
 * Nome obrigatório (create) ou presente (update): texto com algo além de espaço, numa linha só e
 * até `MAX_VALUE_CHARS`. O cartão de aprovação mostra o nome numa linha e corta acima do teto;
 * com as duas recusas aqui, o nome que o usuário confirma é exatamente o gravado. O
 * `CreateRecipeSchema` do domínio não tem teto de nome, então vale o do cartão.
 */
function requireName(value: unknown, message: string): string {
	if (typeof value !== "string") throw new ToolValidationError(message)
	const trimmed = value.trim()
	if (!trimmed) throw new ToolValidationError(message)
	if (NAME_CONTROL_RE.test(trimmed)) throw new ToolValidationError("Nome não pode ter quebra de linha nem caractere de controle")
	// Espaço repetido (inclusive NBSP e os espaços Unicode) vira um: o cartão de aprovação mostra o
	// nome assim (`formatText`), e o gravado tem de ser o mostrado.
	const name = trimmed.replace(/\s+/gu, " ")
	if (name.length > MAX_VALUE_CHARS) throw new ToolValidationError(`Nome deve ter no máximo ${MAX_VALUE_CHARS} caracteres`)
	return name
}

function parseCreateRecipeArgs(args: Record<string, unknown>): CreateRecipeArgs {
	const name = requireName(args.name, "Nome é obrigatório")
	const preparationTime = optionalNumber(args.preparationTime, PREPARATION_TIME_SCHEMA, PREPARATION_TIME_MESSAGE)
	const cookingFactor = optionalNumber(args.cookingFactor, COOKING_FACTOR_SCHEMA, COOKING_FACTOR_MESSAGE)
	return {
		name,
		...(preparationTime !== undefined && { preparationTime }),
		...(cookingFactor !== undefined && { cookingFactor }),
	}
}

function parseUpdateRecipeArgs(args: Record<string, unknown>): UpdateRecipeArgs {
	const recipeId = requireUuid(args.recipeId, "recipeId")
	// Mesma regra do `create_recipe`: número, objeto ou só espaços não viram nome gravado.
	const name = args.name != null ? requireName(args.name, "Novo nome deve ser um texto não vazio") : undefined
	const preparationTime = optionalNumber(args.preparationTime, PREPARATION_TIME_SCHEMA, PREPARATION_TIME_MESSAGE)
	const cookingFactor = optionalNumber(args.cookingFactor, COOKING_FACTOR_SCHEMA, COOKING_FACTOR_MESSAGE)
	if (name === undefined && preparationTime === undefined && cookingFactor === undefined) throw new ToolValidationError("Nenhum campo para atualizar")
	return {
		recipeId,
		...(name !== undefined && { name }),
		...(preparationTime !== undefined && { preparationTime }),
		...(cookingFactor !== undefined && { cookingFactor }),
	}
}

const createRecipe: ModuleToolDefinition<CreateRecipeArgs> = {
	name: "create_recipe",
	description: "Cria uma nova receita global. Requer permissão de escrita.",
	parameters: {
		type: "object",
		properties: {
			name: { type: "string", description: "Nome da receita" },
			preparationTime: { type: "number", description: "Tempo de preparo em minutos inteiros (opcional)" },
			cookingFactor: { type: "number", description: "Fator de cocção, maior que zero (opcional, ex: 0.85)" },
		},
		required: ["name"],
	},
	requiredLevel: 2,
	parseArgs: parseCreateRecipeArgs,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 2)

		// `version` é NOT NULL e não tem default: sem ele o insert violava a constraint e a
		// tool nunca criou receita nenhuma. Linhagem nova começa em 1, como no domínio.
		const insert: Record<string, unknown> = {
			name: args.name,
			kitchen_id: null,
			version: 1,
		}
		// A coluna é `preparation_time_minutes`. Com `preparation_time` o PostgREST recusava a
		// inserção inteira (PGRST204) sempre que o modelo informava o tempo de preparo.
		if (args.preparationTime !== undefined) insert.preparation_time_minutes = args.preparationTime
		if (args.cookingFactor !== undefined) insert.cooking_factor = args.cookingFactor

		const { data, error } = await untypedFrom(ctx, "recipes").insert(insert).select("id, name, version, preparation_time_minutes, cooking_factor").single()
		if (error) return toolErr(sanitizeDbError(error, "create_recipe"))
		return toolOk(data)
	},
}

const updateRecipe: ModuleToolDefinition<UpdateRecipeArgs> = {
	name: "update_recipe",
	description:
		"Atualiza uma receita global criando uma VERSÃO NOVA (a anterior fica no histórico). recipeId tem de ser a versão vigente, a que list_recipes/get_recipe mostram; versão já superada é recusada sem gravar nada, e aí releia a receita antes de tentar de novo.",
	parameters: {
		type: "object",
		properties: {
			recipeId: { type: "string", description: "ID (UUID) da receita" },
			name: { type: "string", description: "Novo nome (opcional)" },
			preparationTime: { type: "number", description: "Tempo de preparo em minutos inteiros (opcional)" },
			cookingFactor: { type: "number", description: "Fator de cocção, maior que zero (opcional)" },
		},
		required: ["recipeId"],
	},
	requiredLevel: 2,
	parseArgs: parseUpdateRecipeArgs,
	// Versão nova pela operation da tela, nunca UPDATE na linha: a linha é uma versão publicada
	// (cardápios a referenciam) e o `recipeId` é a versão que o modelo leu e o cartão de aprovação
	// descreveu — se outra pessoa gravou depois, `saveRecipeEdit` recusa (EDIT-SAFETY.md).
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 2)
		const result = await agentUpdateRecipe(ctx.db, domainCtx(ctx), {
			recipeId: args.recipeId,
			...(args.name !== undefined && { name: args.name }),
			...(args.preparationTime !== undefined && { preparationTimeMinutes: args.preparationTime }),
			...(args.cookingFactor !== undefined && { cookingFactor: args.cookingFactor }),
		})
		return toolOk(result)
	},
}

/**
 * Catálogo de equipamentos — a SDAB é quem cura papéis e modelos, e é aqui que a pergunta
 * "que modelo assume forno combinado?" tem resposta. O parque instalado NÃO entra no módulo
 * global: ele é de cada cozinha, e listá-lo daqui seria expor o inventário da FAB inteira a
 * quem cuida do catálogo.
 */
const listEquipmentCatalogTool: ModuleToolDefinition = {
	name: "list_equipment_catalog",
	description:
		"Lista o catálogo de equipamentos: os modelos (com fabricante, capacidade, zonas independentes e as funções que assumem) e o vocabulário completo de funções. É por esse vocabulário que a preparação declara o que exige.",
	parameters: toJsonSchema(AgentListEquipmentCatalogSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		requireGlobalPermission(ctx, 1)
		const input = AgentListEquipmentCatalogSchema.parse(args)
		const { items, ...rest } = await agentListEquipmentCatalog(ctx.db, domainCtx(ctx), input)
		return toolOk({ models: items, ...rest })
	},
}

const getRecipeEquipmentTool: ModuleToolDefinition = {
	name: "get_recipe_equipment",
	description:
		"Lista o que UMA BATELADA de uma preparação exige de equipamento (papel ou modelo específico, quantidade, capacidade mínima). Volume não muda esta lista: 900 porções de uma receita que rende 100 são nove rodadas do mesmo forno, não nove fornos.",
	parameters: toJsonSchema(AgentRecipeEquipmentSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const input = AgentRecipeEquipmentSchema.parse(args)
		const { items, ...counts } = await agentGetRecipeEquipment(ctx.db, domainCtx(ctx), input)
		return toolOk({ requirements: items, ...counts })
	},
}

export const globalTools: ModuleToolDefinition[] = [
	listRecipes,
	getRecipe,
	listIngredients,
	listLegacyPreparations,
	getIngredient,
	listMenuTemplates,
	createRecipe,
	updateRecipe,
	listEquipmentCatalogTool,
	getRecipeEquipmentTool,
]
