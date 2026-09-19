/**
 * Contrato de LIGAÇÃO entre o registro de classificação e a auditoria.
 *
 * `assurance-registry.contract.test.ts` responde "esta fn está classificada?".
 * `audit.test.ts` responde "o envelope grava o que deve, quando deve?". Falta a pergunta
 * que junta as duas e é a que a especificação faz: *toda* operação classificada passa
 * pelo envelope?
 *
 * Sem este teste, classificar uma operação nova como `"session"`/`"fresh"` e esquecer de
 * envolvê-la não quebra nada em lugar nenhum: ela roda para sempre sem deixar linha no
 * registro, em silêncio. É o mesmo formato de defeito do `kitchen:2` — o esquecimento tem
 * que reprovar a suíte.
 *
 * ## Dois envelopes
 *
 *   - `withSensitiveAudit` — o log é gravado pelo app, DEPOIS da operação. Serve às operações
 *     que não são mudança de acesso (empenho, crédito, fator de MFA…);
 *   - `withAtomicAudit` — mudança de ACESSO (permissão, política, anexo, chave MCP). Quem grava
 *     a linha é a função SQL, na MESMA transação da mudança (migration 20260921120000); o
 *     envelope só resolve nome e grau. Usar `withSensitiveAudit` nestas duplicaria a linha — e
 *     voltaria a gravar depois, que era o defeito. `ACCESS_CHANGE_OPERATIONS` é a lista delas.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { ASSURANCE_REGISTRY, classifiedOperations } from "./assurance-registry"

const serverDir = dirname(fileURLToPath(import.meta.url))

type ServerFnBlock = { file: string; name: string; body: string }

/** Mesmo corte por `export const` dos contratos vizinhos. */
function extractBlocks(file: string): ServerFnBlock[] {
	const source = readFileSync(join(serverDir, file), "utf8")
	const out: ServerFnBlock[] = []
	const exportRe = /export const (\w+) = /g

	let match = exportRe.exec(source)
	while (match !== null) {
		const start = match.index
		const next = exportRe.exec(source)
		const body = source.slice(start, next ? next.index : undefined)
		if (body.includes("createServerFn(")) out.push({ file, name: match[1], body })
		match = next
	}
	return out
}

const blocks = readdirSync(serverDir)
	.filter((f) => f.endsWith(".fn.ts"))
	.sort()
	.flatMap(extractBlocks)

const byName = new Map(blocks.map((block) => [block.name, block]))

/**
 * Server functions que MUDAM ACESSO: passam por `withAtomicAudit`, e o log sai da função SQL.
 * Inclui as `"none"` do registro que retiram credencial (revogar/apagar chave MCP) — mudança de
 * acesso é registrada sempre, independentemente do piso de garantia.
 */
const ACCESS_CHANGE_OPERATIONS = [
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
	"revokeMcpKeyFn",
	"deleteMcpKeyFn",
] as const

const ENVELOPE = /\b(withSensitiveAudit|withAtomicAudit)\(\s*"(\w+)"/g

describe("contrato de ligação da auditoria", () => {
	test("o scanner encontra as server functions (proteção contra um teste que passa vazio)", () => {
		expect(blocks.length).toBeGreaterThan(40)
		expect(classifiedOperations().length).toBeGreaterThan(0)
	})

	test("toda operação classificada passa pelo envelope de auditoria", () => {
		const missing: string[] = []

		for (const { operation } of classifiedOperations()) {
			const block = byName.get(operation)
			if (!block) {
				missing.push(`${operation} — classificada no registro, mas nenhuma server fn com esse nome existe`)
				continue
			}
			// A chamada quebra em várias linhas quando o extrator de alvo é longo — por isso
			// regex com `\s*`, e não `includes`.
			if (!new RegExp(`(withSensitiveAudit|withAtomicAudit)\\(\\s*"${operation}"`).test(block.body)) {
				missing.push(`${block.file}:${operation} — classificada, mas não envolvida em withSensitiveAudit/withAtomicAudit("${operation}", ...)`)
			}
		}

		expect(missing, "operação classificada que executa sem gravar no registro de operações sensíveis").toEqual([])
	})

	test("o envelope só é usado com nome de operação classificada", () => {
		const problems: string[] = []

		for (const file of readdirSync(serverDir).filter((f) => f.endsWith(".fn.ts"))) {
			const source = readFileSync(join(serverDir, file), "utf8")
			for (const match of source.matchAll(ENVELOPE)) {
				const [, envelope, operation] = match
				const entry = (ASSURANCE_REGISTRY as Record<string, { require: string } | undefined>)[operation]
				if (!entry) {
					problems.push(`${file}: ${envelope}("${operation}") — nome fora do registro de classificação`)
					continue
				}
				// Envolver uma operação de rotina no envelope pós-operação não grava nada (ele lê o
				// grau do registro), mas é ruído que sugere uma garantia inexistente. O atômico é
				// diferente: mudança de acesso é registrada sempre, com o grau que for.
				if (envelope === "withSensitiveAudit" && entry.require === "none") {
					problems.push(`${file}: withSensitiveAudit("${operation}") — a operação está classificada como "none"`)
				}
			}
		}

		expect(problems).toEqual([])
	})

	test("o envelope é chamado com o nome da PRÓPRIA fn, não com o de outra", () => {
		const mismatched: string[] = []

		for (const block of blocks) {
			for (const match of block.body.matchAll(ENVELOPE)) {
				if (match[2] !== block.name) mismatched.push(`${block.file}:${block.name} audita como "${match[2]}"`)
			}
		}

		expect(mismatched, "o nome gravado no log tem que ser o da operação executada — senão a trilha aponta para a ação errada").toEqual([])
	})

	test("a auditoria vem DEPOIS do guard, nunca antes", () => {
		const early: string[] = []
		const guard = /\brequire[A-Z]\w*\(/

		for (const block of blocks) {
			const auditIdx = block.body.search(/\b(withSensitiveAudit|withAtomicAudit)\(/)
			if (auditIdx === -1) continue
			const guardIdx = block.body.search(guard)
			if (guardIdx === -1 || guardIdx > auditIdx) early.push(`${block.file}:${block.name}`)
		}

		expect(early, "o envelope recebe o contexto do guard; chamá-lo antes registraria como feito o que o gate ainda vai rejeitar").toEqual([])
	})

	test("mudança de ACESSO passa pelo envelope atômico — e só por ele", () => {
		const wrong: string[] = []
		for (const operation of ACCESS_CHANGE_OPERATIONS) {
			const block = byName.get(operation)
			if (!block) {
				wrong.push(`${operation} — nenhuma server fn com esse nome existe`)
				continue
			}
			if (!new RegExp(`withAtomicAudit\\(\\s*"${operation}"`).test(block.body)) wrong.push(`${block.file}:${operation} — não passa por withAtomicAudit`)
			// O log sai da função SQL; o envelope pós-operação gravaria uma SEGUNDA linha, depois.
			if (/withSensitiveAudit\(/.test(block.body)) wrong.push(`${block.file}:${operation} — também usa withSensitiveAudit (linha de log em dobro)`)
		}
		expect(wrong, "mudança de acesso tem de gravar o log na mesma transação da escrita").toEqual([])
	})

	test("o envelope atômico só envolve mudança de acesso", () => {
		const unexpected = blocks
			.filter((block) => /withAtomicAudit\(/.test(block.body))
			.map((block) => block.name)
			.filter((name) => !(ACCESS_CHANGE_OPERATIONS as readonly string[]).includes(name))
		// Operação atômica nova entra na lista acima — e a função SQL dela grava o log.
		expect(unexpected).toEqual([])
	})
})
