import { existsSync, readFileSync } from "node:fs"
import { dirname, join, parse } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const serverDir = dirname(fileURLToPath(import.meta.url))

/**
 * Walk up from `serverDir` until the monorepo root (the dir holding `turbo.json`)
 * so cross-package paths survive any change in nesting depth. Falls back to a
 * thrown error with a clear message instead of a later opaque ENOENT.
 */
function findMonorepoRoot(): string {
	let dir = serverDir
	while (true) {
		if (existsSync(join(dir, "turbo.json"))) return dir
		const parent = dirname(dir)
		if (parent === dir || dir === parse(dir).root) {
			throw new Error(`monorepo root (turbo.json) not found walking up from ${serverDir}`)
		}
		dir = parent
	}
}

const monorepoRoot = findMonorepoRoot()

function readServerFile(fileName: string) {
	return readFileSync(join(serverDir, fileName), "utf8")
}

/**
 * Resolve a file inside a workspace package from the monorepo root. Asserts the
 * file exists first so a moved/renamed source produces a readable failure
 * ("contract target missing") rather than a raw ENOENT — keeping the contract
 * enforceable regardless of layout changes.
 */
function readPackageFile(packageRelativePath: string) {
	const path = join(monorepoRoot, packageRelativePath)
	if (!existsSync(path)) {
		throw new Error(`security contract target missing: ${packageRelativePath} (resolved to ${path})`)
	}
	return readFileSync(path, "utf8")
}

// DB client handle a server fn forwards to a domain op. Pré-Drizzle era sempre
// `getSupabaseServerClient()`; ops migradas (Fase 1+) usam `getDb()`. O contrato de
// segurança independe de qual — basta que `requireAuth()` venha ANTES dele.
const DB_CLIENT = "(?:getSupabaseServerClient|getDb)\\(\\)"

describe("server function security contracts", () => {
	// Since the Onda 4 migration the admin guard lives in two layers:
	//   - the server fn authenticates (requireAuth) and forwards the ctx
	//   - the @iefa/sisub-domain operation enforces global level 2
	test("permission admin functions require auth and forward ctx to a global-write-guarded domain op", () => {
		const source = readServerFile("permissions.fn.ts")
		const domainSource = readPackageFile("packages/sisub-domain/src/operations/permissions.ts")

		expect(source).toContain("requireAuth")

		for (const { fn, op } of [
			{ fn: "searchUsersByEmailFn", op: "searchUsersByEmail" },
			{ fn: "fetchUserPermissionsAdminFn", op: "fetchUserPermissionsAdmin" },
			{ fn: "createUserPermissionFn", op: "createUserPermission" },
			{ fn: "updateUserPermissionFn", op: "updateUserPermission" },
			{ fn: "deleteUserPermissionFn", op: "deleteUserPermission" },
		]) {
			const fnStart = source.indexOf(`export const ${fn}`)
			expect(fnStart).toBeGreaterThan(-1)
			const nextExport = source.indexOf("export const ", fnStart + 1)
			const fnSource = source.slice(fnStart, nextExport === -1 ? undefined : nextExport)
			// authenticate, then forward the resolved ctx into the domain op
			expect(fnSource).toContain("const ctx = await requireAuth()")
			expect(fnSource).toMatch(new RegExp(`${op}\\(${DB_CLIENT}, ctx,`))

			// the domain op enforces global level-2 (write) before touching the DB
			const opStart = domainSource.indexOf(`export async function ${op}(`)
			expect(opStart).toBeGreaterThan(-1)
			const nextOp = domainSource.indexOf("export async function ", opStart + 1)
			const opSource = domainSource.slice(opStart, nextOp === -1 ? undefined : nextOp)
			expect(opSource).toContain('requirePermission(ctx, "global", 2)')
		}
	})

	/**
	 * Tabelas que guardam ativo GLOBAL (`kitchen_id IS NULL`, da SDAB) e LOCAL na mesma
	 * estrutura eram guardadas por um fallback que autorizava mutação do global com
	 * `kitchen:2`:
	 *
	 *     if (input.kitchenId != null) requireKitchen(ctx, 2, input.kitchenId)
	 *     else requirePermission(ctx, "kitchen", 2)
	 *
	 * Doze ocorrências (recipes 2, templates 6, meal-types 4). O caminho explorável ia de
	 * `/kitchen/$kitchenId/recipes/$recipeId` até `createRecipeVersion`, e como a dedup por
	 * família mantém a maior versão, a edição de uma cozinha virava a receita canônica da
	 * FAB inteira. A autorização agora passa por `guards/asset-ownership.ts`, que resolve o
	 * dono no banco. Este contrato impede o 13º sítio.
	 */
	test("no domain operation authorizes a global asset mutation with kitchen level 2", () => {
		const OPERATION_FILES = [
			"packages/sisub-domain/src/operations/recipes.ts",
			"packages/sisub-domain/src/operations/templates.ts",
			"packages/sisub-domain/src/operations/meal-types.ts",
			"packages/sisub-domain/src/operations/recipe-flow.ts",
		]

		for (const file of OPERATION_FILES) {
			const source = readPackageFile(file)
			// O nível 2 de `kitchen` só é legítimo COM escopo (requireKitchen). Sem escopo,
			// ele é o fallback que abria o ativo global.
			expect(source, `${file} still uses the unscoped kitchen:2 fallback`).not.toContain('requirePermission(ctx, "kitchen", 2)')
			// `requireAnyPermission(["kitchen", "global"], 2)` tinha o mesmo efeito: kitchen:2
			// sozinho satisfazia o "any" e criava ativo global.
			expect(source, `${file} accepts kitchen:2 as sufficient for a global asset`).not.toMatch(/requireAnyPermission\(ctx, \["kitchen", "global"\], 2\)/)
		}
	})

	test("global/local asset mutations resolve ownership through the shared guard", () => {
		const guardSource = readPackageFile("packages/sisub-domain/src/guards/asset-ownership.ts")

		// O guard decide pelo dono LIDO DO BANCO: global → global:2; local → kitchen:2 escopado.
		expect(guardSource).toContain('requirePermission(ctx, "global", 2)')
		expect(guardSource).toContain("requireKitchen(ctx, 2, targetKitchenId)")

		// Cada operação que muta ativo global/local existente passa pelo guard.
		for (const { file, ops } of [
			{ file: "packages/sisub-domain/src/operations/meal-types.ts", ops: ["updateMealType", "deleteMealType", "restoreMealType"] },
			{ file: "packages/sisub-domain/src/operations/recipes.ts", ops: ["authorizeRecipeMutation"] },
			{ file: "packages/sisub-domain/src/operations/recipe-flow.ts", ops: ["authorizeFlowMutation"] },
		]) {
			const source = readPackageFile(file)
			for (const op of ops) {
				const start = source.indexOf(`function ${op}(`)
				expect(start, `${op} not found in ${file}`).toBeGreaterThan(-1)
				const nextFn = source.indexOf("\nexport async function ", start + 1)
				const opSource = source.slice(start, nextFn === -1 ? undefined : nextFn)
				expect(opSource, `${op} does not authorize through the ownership guard`).toContain("authorizeAssetMutation(db, ctx,")
			}
		}

		// Criação: o escopo vem da intenção do chamador, mas destino nulo = global → global:2.
		for (const { file, ops } of [
			{ file: "packages/sisub-domain/src/operations/recipes.ts", ops: ["createRecipe", "saveRecipeEdit"] },
			{
				file: "packages/sisub-domain/src/operations/templates.ts",
				ops: ["createTemplate", "createBlankTemplate", "forkTemplate", "saveTemplateEdit", "deleteTemplate", "restoreTemplate"],
			},
			{ file: "packages/sisub-domain/src/operations/meal-types.ts", ops: ["createMealType"] },
			{ file: "packages/sisub-domain/src/operations/recipe-flow.ts", ops: ["createStepTemplate", "createUtensil"] },
		]) {
			const source = readPackageFile(file)
			for (const op of ops) {
				const start = source.indexOf(`export async function ${op}(`)
				expect(start, `${op} not found in ${file}`).toBeGreaterThan(-1)
				const nextFn = source.indexOf("\nexport async function ", start + 1)
				const opSource = source.slice(start, nextFn === -1 ? undefined : nextFn)
				expect(opSource, `${op} does not gate the target scope`).toContain("requireAssetWriteForScope(ctx,")
			}
		}
	})

	test("saveRecipeEdit decides fork vs global version from the declared context, never from permissions", () => {
		const source = readPackageFile("packages/sisub-domain/src/operations/recipes.ts")
		const start = source.indexOf("export async function saveRecipeEdit(")
		expect(start).toBeGreaterThan(-1)
		const nextFn = source.indexOf("\nexport async function ", start + 1)
		const opSource = source.slice(start, nextFn === -1 ? undefined : nextFn)

		// O destino sai do contexto DECLARADO na requisição. Inferir da permissão faria quem
		// tem global:2 e kitchen:2 alterar o catálogo global ao editar pela tela da cozinha.
		expect(opSource).toContain('input.context.scope === "kitchen" ? input.context.kitchenId : null')

		// Base local só pode ser editada pela cozinha dona — nem por outra, nem promovida a global.
		expect(opSource).toContain("base.kitchenId != null && base.kitchenId !== targetKitchenId")
		expect(opSource).toContain("RECIPE_SCOPE_MISMATCH")

		// Autorização pelo destino resolvido, não pelo escopo que veio do cliente.
		expect(opSource).toContain("requireAssetWriteForScope(ctx, targetKitchenId)")

		// base_recipe_id aponta para a RAIZ da linhagem, e a versão é calculada no servidor.
		expect(opSource).toContain("baseRecipeId: rootId")
		expect(opSource).toContain("version: nextVersion")
	})

	test("saveTemplateEdit forks a global template edited from a kitchen instead of mutating it", () => {
		const source = readPackageFile("packages/sisub-domain/src/operations/templates.ts")
		const start = source.indexOf("export async function saveTemplateEdit(")
		expect(start).toBeGreaterThan(-1)
		const nextFn = source.indexOf("\nexport async function ", start + 1)
		const opSource = source.slice(start, nextFn === -1 ? undefined : nextFn)

		expect(opSource).toContain('input.context.scope === "kitchen" ? input.context.kitchenId : null')
		expect(opSource).toContain("TEMPLATE_SCOPE_MISMATCH")
		expect(opSource).toContain("requireAssetWriteForScope(ctx, targetKitchenId)")
		// Um fork por cozinha por linhagem: a segunda edição aplica no fork existente.
		expect(opSource).toContain("existingFork")
		expect(opSource).toContain("baseTemplateId: rootId")
	})

	test("no context-free template edit entry point survives", () => {
		// `updateTemplate` mutava in-place sem contexto; mantê-lo deixaria de pé exatamente o
		// caminho que este trabalho fecha — inclusive para o servidor MCP, que o consumia.
		const source = readPackageFile("packages/sisub-domain/src/operations/templates.ts")
		expect(source).not.toContain("export async function updateTemplate(")

		const mcp = readPackageFile("apps/sisub-mcp/src/tools/templates.ts")
		expect(mcp).toContain("saveTemplateEdit(getDb(), ctx, input)")
		expect(mcp).not.toContain("updateTemplate(getDb(), ctx, input)")
	})

	test("the edit input carries no client-controlled version or scope", () => {
		const schema = readPackageFile("packages/sisub-domain/src/schemas/recipes.ts")
		const start = schema.indexOf("export const SaveRecipeEditSchema")
		expect(start).toBeGreaterThan(-1)
		const end = schema.indexOf("export type SaveRecipeEdit", start)
		const schemaSource = schema.slice(start, end)

		// `version` do cliente permitia fixar a própria linha como canônica (a dedup mantém a
		// maior versão); `kitchenId` do cliente era o vetor da edição global a partir da cozinha.
		expect(schemaSource).toContain("CreateRecipeSchema.omit({ kitchenId: true })")
		expect(schemaSource).not.toMatch(/\bversion:\s*z\./)
		expect(schemaSource).toContain("context: EditScopeSchema")
	})

	/**
	 * `global:1` tem de ser leitura estrita — é o que a política "Conjunto Treino" promete
	 * ("pode clicar em tudo na SDAB mas não pode alterar nada") e a única barreira entre um
	 * treinando e os dados reais de contratação.
	 *
	 * O levantamento encontrou três classes de furo:
	 *   - `ingredients.ts` guardava TODAS as ops (leitura e escrita) em nível 1, então até
	 *     `kitchen:1` criava e apagava insumos do catálogo global;
	 *   - `places.ts`, `frozen-preparation.ts` e `purchase-item.ts` recebiam `_ctx` e não
	 *     autorizavam nada — qualquer sessão válida reescrevia a estrutura organizacional
	 *     da FAB e os catálogos globais;
	 *   - as versões/revisões de insumo exigiam apenas `kitchen:1`.
	 */
	test("every global-catalog write requires global level 2", () => {
		const GLOBAL_WRITES: Record<string, string[]> = {
			"packages/sisub-domain/src/operations/ingredients.ts": [
				"createFolder",
				"updateFolder",
				"deleteFolder",
				"restoreFolder",
				"createIngredient",
				"updateIngredient",
				"deleteIngredient",
				"restoreIngredient",
				"setIngredientSubstitutions",
				"createIngredientItem",
				"updateIngredientItem",
				"deleteIngredientItem",
				"setIngredientNutritionReference",
				"setIngredientNutrients",
			],
			"packages/sisub-domain/src/operations/ingredient-versions.ts": ["recordIngredientVersion", "restoreIngredientVersion"],
			"packages/sisub-domain/src/operations/places.ts": ["updatePlacesEntity", "applyPlacesDiff"],
			"packages/sisub-domain/src/operations/frozen-preparation.ts": ["createFrozenPreparation", "updateFrozenPreparation", "deleteFrozenPreparation"],
			"packages/sisub-domain/src/operations/purchase-item.ts": [
				"createPurchaseItem",
				"updatePurchaseItem",
				"deletePurchaseItem",
				"upsertPurchaseItemIngredient",
				"deletePurchaseItemIngredient",
				"setDefaultPurchaseItemIngredient",
			],
		}

		for (const [file, ops] of Object.entries(GLOBAL_WRITES)) {
			const source = readPackageFile(file)
			for (const op of ops) {
				const start = source.indexOf(`export async function ${op}(`)
				expect(start, `${op} not found in ${file}`).toBeGreaterThan(-1)
				const nextFn = source.indexOf("\nexport async function ", start + 1)
				const opSource = source.slice(start, nextFn === -1 ? undefined : nextFn)

				expect(opSource, `${op} does not require global:2`).toContain('requirePermission(ctx, "global", 2)')
				// `_ctx` significa que a operação nem recebe o contexto — não há como autorizar.
				expect(opSource, `${op} still discards the user context`).not.toContain("_ctx: UserContext")
			}
		}
	})

	test("catalog reads stay at level 1 so global:1 can browse everything", () => {
		// A leitura precisa continuar aberta: o Conjunto Treino dá `global:1` justamente para
		// o treinando navegar a SDAB inteira. Apertar isso quebraria a política.
		const source = readPackageFile("packages/sisub-domain/src/operations/ingredients.ts")
		for (const op of ["listIngredients", "fetchIngredient", "listFolders", "listIngredientItems", "listCatmatItems"]) {
			const start = source.indexOf(`export async function ${op}(`)
			expect(start, `${op} not found`).toBeGreaterThan(-1)
			const nextFn = source.indexOf("\nexport async function ", start + 1)
			const opSource = source.slice(start, nextFn === -1 ? undefined : nextFn)
			expect(opSource, `${op} should stay readable at level 1`).toContain('requireAnyPermission(ctx, ["kitchen", "global"], 1)')
		}
	})

	test("catalog review actions require write level", () => {
		// Revisão é ato de conferência sobre o catálogo — segue aceitando a cozinha (que revisa
		// as próprias preparações locais), mas exige nível de escrita.
		for (const { file, op } of [
			{ file: "packages/sisub-domain/src/operations/ingredient-reviews.ts", op: "recordIngredientReview" },
			{ file: "packages/sisub-domain/src/operations/recipe-reviews.ts", op: "recordRecipeReview" },
		]) {
			const source = readPackageFile(file)
			const start = source.indexOf(`export async function ${op}(`)
			const nextFn = source.indexOf("\nexport async function ", start + 1)
			const opSource = source.slice(start, nextFn === -1 ? undefined : nextFn)
			expect(opSource, `${op} accepts read-level permission`).toContain('requireAnyPermission(ctx, ["kitchen", "global"], 2)')
		}
	})

	test("policy rule mutations require global level 2", () => {
		// Regras de política de revisão são do catálogo da SDAB e não passam por operação de
		// domínio — o gate vive no próprio server fn. Antes bastava `requireAuth()`.
		const source = readServerFile("policy.fn.ts")
		for (const fn of ["createPolicyRuleFn", "updatePolicyRuleFn", "deletePolicyRuleFn"]) {
			const start = source.indexOf(`export const ${fn}`)
			expect(start, `${fn} not found`).toBeGreaterThan(-1)
			const next = source.indexOf("export const ", start + 1)
			const fnSource = source.slice(start, next === -1 ? undefined : next)
			expect(fnSource, `${fn} does not require global:2`).toContain('requireAuthWithPermission("global", 2)')
		}
	})

	test("sync triggers stay behind global level 2", () => {
		// Estes endpoints carregam o ADMIN_SECRET nos headers, então nem a LEITURA de status
		// é aberta a global:1 — exceção consciente ao "global:1 lê todas as telas".
		for (const fileName of ["compras-sync.fn.ts", "nutrition-sync.fn.ts"]) {
			const source = readServerFile(fileName)
			expect(source).toContain('requireAuthWithPermission("global", 2)')
			const handlers = source.match(/export const \w+Fn = createServerFn[\s\S]*?(?=\nexport const |$)/g) ?? []
			expect(handlers.length).toBeGreaterThan(0)
			for (const handler of handlers) {
				expect(handler, `a sync endpoint in ${fileName} skips the admin guard`).toContain("requireSyncAdmin()")
			}
		}
	})

	test("places and settings write functions require authentication before service-role writes", () => {
		for (const fileName of ["places.fn.ts", "unit-settings.fn.ts", "kitchen-settings.fn.ts"]) {
			const source = readServerFile(fileName)
			const postHandlers = source.match(
				new RegExp(`createServerFn\\(\\{ method: "POST" \\}\\)[\\s\\S]*?\\.handler\\(async \\(\\{ data \\}\\) => \\{[\\s\\S]*?${DB_CLIENT}`, "g")
			)

			expect(postHandlers?.length ?? 0).toBeGreaterThan(0)
			for (const handler of postHandlers ?? []) {
				expect(handler).toContain("requireAuth()")
				// requireAuth() precede a obtenção do client de DB (seja getSupabaseServerClient ou getDb)
				const clientIdx = handler.search(new RegExp(DB_CLIENT))
				expect(handler.indexOf("requireAuth()")).toBeLessThan(clientIdx)
			}
		}
	})
})
