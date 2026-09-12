/**
 * Contrato EXAUSTIVO de classificação de garantia das server functions de mutação.
 *
 * O irmão `server-fn-auth.contract.test.ts` responde "esta fn tem guard?". Este responde
 * "esta fn está classificada?" — e a diferença importa porque a classificação é a única
 * coisa que decide se uma operação sensível vai pedir segundo fator. Uma fn de mutação nova
 * que nasce sem entrada no registro NÃO falha em lugar nenhum em produção: ela simplesmente
 * roda sem piso de garantia, para sempre, em silêncio. É exatamente o formato de defeito que
 * o gate do `kitchen:2` fechou — o esquecimento tem que reprovar a suíte.
 *
 * Escopo: `createServerFn({ method: "POST" })` em `src/server/*.fn.ts`. Leitura não entra
 * (design.md D3: guard de rota e leitura NUNCA disparam elevação).
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isProtectedAccount } from "@iefa/pbac"
import type { UserPermission } from "@iefa/sisub-domain/types"
import { describe, expect, test } from "vitest"
import {
	ASSURANCE_ENFORCEMENT,
	ASSURANCE_REGISTRY,
	assuranceFor,
	assuranceReachability,
	classifiedOperations,
	enforcedAssuranceFor,
} from "./assurance-registry"

const serverDir = dirname(fileURLToPath(import.meta.url))

type MutationFn = { file: string; name: string }

/**
 * Fatia o arquivo em blocos `export const X = ...` até o próximo `export`, no mesmo estilo do
 * `server-fn-auth.contract.test.ts`. Um parser de AST seria mais preciso, mas amarraria o
 * contrato ao compiler API do TS; o corte por `export const` cobre 100% do estilo em uso e
 * falha de forma visível se ele mudar (a âncora de contagem abaixo é a prova disso).
 */
function extractMutationFns(file: string): MutationFn[] {
	const source = readFileSync(join(serverDir, file), "utf8")
	const out: MutationFn[] = []
	const exportRe = /export const (\w+) = /g

	let match = exportRe.exec(source)
	while (match !== null) {
		const start = match.index
		const next = exportRe.exec(source)
		const body = source.slice(start, next ? next.index : undefined)
		if (body.includes("createServerFn(")) {
			const method = body.match(/createServerFn\(\s*\{[^}]*method:\s*"(\w+)"/)?.[1]
			if (method === "POST") out.push({ file, name: match[1] })
		}
		match = next
	}
	return out
}

const mutationFns = readdirSync(serverDir)
	.filter((f) => f.endsWith(".fn.ts"))
	.sort()
	.flatMap(extractMutationFns)

describe("assurance registry contract", () => {
	test("o scanner encontra as fns de mutação (proteção contra um teste que passa vazio)", () => {
		// Se a extração quebrar, TODOS os testes abaixo passariam sem verificar nada — foi
		// assim que a suíte de integração do split de schema rodou vazia e ninguém percebeu.
		expect(mutationFns.length).toBeGreaterThan(150)
		const names = new Set(mutationFns.map((fn) => fn.name))
		for (const anchor of ["createUserPermissionFn", "createMcpKeyFn", "createLiquidacaoFn", "upsertForecastFn"]) {
			expect(names, `${anchor} deveria ser detectada como fn de mutação`).toContain(anchor)
		}
	})

	test("toda server function de mutação está classificada no registro", () => {
		const unclassified = mutationFns.filter((fn) => assuranceFor(fn.name) === undefined).map((fn) => `${fn.file}:${fn.name}`)

		expect(
			unclassified,
			'server fn de mutação sem entrada em ASSURANCE_REGISTRY. Classifique-a em src/server/assurance-registry.ts — `{ require: "none" }` se for operação de rotina, `"session"`/`"fresh"` com o `reason` que o usuário vai ler no modal.'
		).toEqual([])
	})

	test("o registro não tem entradas obsoletas", () => {
		const existing = new Set(mutationFns.map((fn) => fn.name))
		const stale = Object.keys(ASSURANCE_REGISTRY).filter((name) => !existing.has(name))

		expect(stale, "entradas de ASSURANCE_REGISTRY que não correspondem a nenhuma server fn de mutação — remova-as").toEqual([])
	})

	test("toda operação classificada tem motivo legível e requisito de autorização declarado", () => {
		const problems: string[] = []

		for (const { operation, entry } of classifiedOperations()) {
			// O `reason` vai para o modal. Frase curta demais não explica nada, e o usuário
			// aprende a digitar 6 dígitos sem ler — o contrário do controle.
			if (entry.reason.trim().length < 20) problems.push(`${operation}: reason curto demais`)
			if (!entry.reason.trim().endsWith(".")) problems.push(`${operation}: reason não é uma frase completa`)
			if (entry.authorization.length === 0) problems.push(`${operation}: sem authorization declarada`)
			for (const requirement of entry.authorization) {
				if (requirement.kind !== "permission" && requirement.note.trim().length < 20) {
					problems.push(`${operation}: authorization ${requirement.kind} sem nota explicando por que não há módulo/nível`)
				}
			}
		}

		expect(problems, "entradas classificadas incompletas").toEqual([])
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// As classificações que o desenho nomeia (design.md D2)
	// ─────────────────────────────────────────────────────────────────────────────

	test('permissões, política de acesso, chave MCP e reset de treino são "fresh"', () => {
		const fresh = [
			"createUserPermissionFn",
			"updateUserPermissionFn",
			"deleteUserPermissionFn",
			"createPolicyFn",
			"updatePolicyFn",
			"deletePolicyFn",
			"addPolicyStatementFn",
			"updatePolicyStatementFn",
			"removePolicyStatementFn",
			"attachPolicyFn",
			"detachPolicyFn",
			"createMcpKeyFn",
			"resetTrainingScopeFn",
		]

		for (const operation of fresh) {
			expect(assuranceFor(operation)?.require, `${operation} deveria ser "fresh"`).toBe("fresh")
		}
	})

	test('empenho, liquidação, pagamento, conciliação e crédito orçamentário são "session"', () => {
		const session = [
			"createEmpenhoFn",
			"anularEmpenhoFn",
			"updateEmpenhoClassificationFn",
			"registerEmpenhoEventFn",
			"inscribeRestosAPagarFn",
			"createLiquidacaoFn",
			"createPagamentoFn",
			"applyDocumentBatchFn",
			"resolveDivergenceFn",
			"applyCreditBatchFn",
		]

		for (const operation of session) {
			expect(assuranceFor(operation)?.require, `${operation} deveria ser "session"`).toBe("session")
		}
	})

	test("as operações de volume continuam sem exigência — é a decisão D2, não um esquecimento", () => {
		// Previsão, presença, produção, cardápio e estoque são o trabalho diário de centenas
		// de pessoas. Qualquer piso aqui é atrito multiplicado por volume.
		const routine = [
			"upsertForecastFn",
			"deleteForecastFn",
			"insertPresenceFn",
			"submitEvaluationFn",
			"updateProductionTaskStatusFn",
			"upsertDailyMenuFn",
			"createAdjustmentFn",
			"createKitchenDraftFn",
		]

		for (const operation of routine) {
			expect(assuranceFor(operation)?.require, `${operation} não deveria exigir garantia`).toBe("none")
		}
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Derivação de conta protegida (design.md D9)
	// ─────────────────────────────────────────────────────────────────────────────

	function permission(module: UserPermission["module"], level: number, scope?: Partial<UserPermission>): UserPermission {
		return { module, level, mess_hall_id: null, kitchen_id: null, unit_id: null, ...scope }
	}

	test("a lista de alcance é derivada do registro, sem lista paralela", () => {
		const reachability = assuranceReachability()

		// `unit` nível 2 é o piso que a execução orçamentária aplica hoje
		// (`empenho.fn.ts:137` → `requireUnitScope(2, …)`), e é ele que tem que sair daqui —
		// não o 3 de `inscribeRestosAPagarFn`, que deixaria o operador de fora.
		expect(reachability).toContainEqual({ module: "unit", level: 2 })
		expect(reachability).toContainEqual({ module: "admin", level: 2 })
		// Ninguém alcança operação classificada por ser comensal.
		expect(reachability.map((r) => r.module)).not.toContain("diner")
	})

	test("quem tem `unit` nível 2 é conta protegida — alcança empenho e liquidação", () => {
		expect(isProtectedAccount([permission("unit", 2)], assuranceReachability())).toBe(true)
	})

	test("quem só tem `diner` NÃO é conta protegida", () => {
		expect(isProtectedAccount([permission("diner", 1)], assuranceReachability())).toBe(false)
	})

	test("`unit` nível 1 (só leitura orçamentária) não é conta protegida", () => {
		expect(isProtectedAccount([permission("unit", 1)], assuranceReachability())).toBe(false)
	})

	test("permissão ESCOPADA numa unidade já torna a conta protegida", () => {
		// Alcançar o empenho de uma unidade só já é alcançar o empenho: o critério é sobre a
		// conta, não sobre o escopo.
		expect(isProtectedAccount([permission("unit", 2, { unit_id: 7 })], assuranceReachability())).toBe(true)
	})

	test("deny sem escopo tira a conta da lista", () => {
		// `hasPermission` aplica a precedência de deny, e é o resultado certo: um allow global
		// anulado por um deny global não alcança mais nada naquele módulo.
		expect(isProtectedAccount([permission("unit", 2), permission("unit", 0)], assuranceReachability())).toBe(false)
	})

	test("conta sem permissão nenhuma não é protegida", () => {
		expect(isProtectedAccount([], assuranceReachability())).toBe(false)
	})

	test("operação self-scoped não entra na derivação", () => {
		// `createMcpKeyFn` age só sobre a conta do próprio chamador. Se contribuísse para a
		// derivação, TODA conta autenticada viraria conta protegida — e os ~800 comensais
		// receberiam exigência de fator reserva sem alcançar nada de alto impacto.
		const selfScoped = classifiedOperations().filter(({ entry }) => entry.authorization.every((a) => a.kind !== "permission"))

		// As de MFA entram pelo mesmo motivo e com a mesma consequência: são classificadas para
		// que cadastro, remoção de fator e uso de código de recuperação deixem linha no log
		// (spec de auditoria), e agem só sobre a conta de quem chama.
		expect(selfScoped.map((o) => o.operation).sort()).toEqual([
			"consumeRecoveryCodeFn",
			"createMcpKeyFn",
			"generateRecoveryCodesFn",
			"unenrollMfaFactorFn",
			"verifyMfaEnrollmentFn",
		])
		expect(isProtectedAccount([permission("diner", 3)], assuranceReachability())).toBe(false)
	})
})

describe("piso efetivo — a inércia da etapa 4", () => {
	test("a chave de enforcement está DESLIGADA", () => {
		// Ligar o piso hoje barraria toda operação classificada de todo mundo: não existe uma
		// única conta com segundo fator cadastrado (as telas de cadastro são a etapa 5). Quem
		// mudar esta constante tem que passar por aqui e ler o motivo.
		expect(ASSURANCE_ENFORCEMENT).toBe("off")
	})

	test("nenhuma operação classificada exige garantia enquanto a chave estiver desligada", () => {
		const exigindo = classifiedOperations()
			.map(({ operation }) => ({ operation, applied: enforcedAssuranceFor(operation) }))
			.filter(({ applied }) => applied.require !== "none")

		expect(exigindo, "operação exigindo segundo fator antes da etapa 9 do plano").toEqual([])
	})

	test("operação de rotina e nome desconhecido também devolvem `none`", () => {
		// Nome fora do registro não pode LANÇAR: este caminho roda dentro da requisição do
		// usuário. Quem reprova nome não classificado é o contrato acima, na suíte.
		expect(enforcedAssuranceFor("upsertForecastFn").require).toBe("none")
		expect(enforcedAssuranceFor("fnQueNaoExiste").require).toBe("none")
	})

	test("o grau e o motivo, quando aplicados, saem do registro — nunca redigitados", () => {
		// Prova a fonte única sem ligar a chave: o mapeamento entrada→exigência é o mesmo que a
		// etapa 9 passará a aplicar, e ele deriva do registro linha por linha.
		for (const { operation, entry } of classifiedOperations()) {
			const fromRegistry = assuranceFor(operation)
			expect(fromRegistry?.require).toBe(entry.require)
			if (fromRegistry?.require !== "none") expect(fromRegistry?.reason).toBe(entry.reason)
		}
	})
})
