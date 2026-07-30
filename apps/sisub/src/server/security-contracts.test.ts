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
				ops: ["createTemplate", "createBlankTemplate", "forkTemplate", "updateTemplate", "deleteTemplate", "restoreTemplate"],
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
