/**
 * Contrato do registro de operações sensíveis.
 *
 * Duas coisas precisam ser verdade e nenhuma delas é verificável lendo o código
 * com os olhos depois que o arquivo crescer:
 *
 *   1. **O ator sai da sessão.** Se o `actor_id` puder vir do input, a trilha de
 *      auditoria aceita assinatura falsificada — e um log assinável por terceiro
 *      não é pior que nenhum log, é mais perigoso, porque parece prova.
 *   2. **Não existe superfície de update nem de delete.** O requisito
 *      "Integridade do registro" diz que nenhum caminho de aplicação altera ou
 *      remove linha. Isso não é uma propriedade do banco (service role escreve o
 *      que quiser): é uma propriedade do que este módulo EXPÕE. O teste inspeciona
 *      o módulo e o handle do banco, então falha quando alguém acrescentar o
 *      `deleteOldAuditRows` "só para limpar".
 *
 * A metade que o banco sustenta — `on delete restrict`, para a prova não sumir com
 * o usuário — é conferida contra o SQL da migration, no mesmo espírito dos
 * `*.sql-contract.test.ts`. Só um teste de integração contra banco real prova a
 * recusa do `delete`; aqui se garante que a cláusula não foi trocada por `cascade`
 * numa edição distraída.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { AssuranceLevelSchema } from "../schemas/audit.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import * as auditModule from "./audit.ts"
import { recordSensitiveOperation } from "./audit.ts"

const SESSION_USER = "11111111-1111-1111-1111-111111111111"
const OTHER_USER = "22222222-2222-2222-2222-222222222222"

const ctx: UserContext = { userId: SESSION_USER, permissions: [], aal: 1, lastFactorAt: null, origin: "session" }

type Captured = { values?: Record<string, unknown>; calls: string[] }

/** Stub do handle Drizzle que captura o payload e anota qual verbo foi usado. */
function fakeDb(captured: Captured, rows: unknown[]): SisubDb {
	const chain = {
		values: (v: Record<string, unknown>) => {
			captured.values = v
			return chain
		},
		set: () => chain,
		where: () => chain,
		from: () => chain,
		orderBy: () => Promise.resolve(rows),
		returning: () => Promise.resolve(rows),
	}
	const verb = (name: string) => () => {
		captured.calls.push(name)
		return chain
	}
	return { insert: verb("insert"), update: verb("update"), delete: verb("delete"), select: verb("select") } as unknown as SisubDb
}

const ROW = [{ id: "33333333-3333-3333-3333-333333333333" }]

describe("recordSensitiveOperation", () => {
	test("grava ator, operação, grau e alvo", async () => {
		const captured: Captured = { calls: [] }
		await recordSensitiveOperation(fakeDb(captured, ROW), ctx, {
			operation: "createUserPermissionFn",
			assurance: "fresh",
			target: { userId: OTHER_USER, module: "admin" },
		})

		expect(captured.values).toEqual({
			actorId: SESSION_USER,
			operation: "createUserPermissionFn",
			assurance: "fresh",
			target: { userId: OTHER_USER, module: "admin" },
		})
	})

	test("o ator é o da sessão, e o input não consegue sobrescrevê-lo", async () => {
		const captured: Captured = { calls: [] }
		// `actorId`/`actor_id` não existem no tipo de entrada. O cast força a
		// situação que um chamador descuidado (ou malicioso) criaria em runtime.
		const forged = { operation: "op", assurance: "session", actorId: OTHER_USER, actor_id: OTHER_USER } as never
		await recordSensitiveOperation(fakeDb(captured, ROW), ctx, forged)

		expect(captured.values?.actorId).toBe(SESSION_USER)
		expect(Object.keys(captured.values ?? {})).not.toContain("actor_id")
	})

	test("alvo ausente vira coluna nula, não objeto vazio", async () => {
		const captured: Captured = { calls: [] }
		await recordSensitiveOperation(fakeDb(captured, ROW), ctx, { operation: "generateRecoveryCodesFn", assurance: "fresh" })

		expect(captured.values?.target).toBeUndefined()
	})

	test("usa INSERT e nenhum outro verbo", async () => {
		const captured: Captured = { calls: [] }
		await recordSensitiveOperation(fakeDb(captured, ROW), ctx, { operation: "op", assurance: "session" })

		expect(captured.calls).toEqual(["insert"])
	})

	test("insert que não devolve linha propaga DomainError — gravação silenciosa não existe", async () => {
		const captured: Captured = { calls: [] }
		const call = recordSensitiveOperation(fakeDb(captured, []), ctx, { operation: "op", assurance: "session" })

		await expect(call).rejects.toBeInstanceOf(DomainError)
	})
})

describe("integridade do registro", () => {
	test("o módulo não exporta nenhuma operação de update ou delete", () => {
		const surface = Object.keys(auditModule).filter((name) => /update|delete|remove|purge|clear|prune/i.test(name))
		expect(surface).toEqual([])
	})

	/**
	 * Uma escrita e uma leitura. A leitura entrou junto da tela de auditoria e não fere a
	 * regra apenas-inserção — ela não altera nada. O que a lista literal protege é o
	 * contrário: qualquer função nova neste módulo reprova a suíte e passa por revisão, que
	 * é como `deleteOldAuditRows` "só para limpar" é barrado antes de existir.
	 */
	test("o módulo exporta exatamente uma escrita (inserção) e uma leitura", () => {
		expect(Object.keys(auditModule).sort()).toEqual(["listSensitiveOperations", "recordSensitiveOperation"])
	})

	test("a leitura exige `admin` nível 3 — é a consulta mais sensível do sistema", () => {
		const source = readFileSync(join(import.meta.dir, "audit.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
		const body = source.slice(source.indexOf("export async function listSensitiveOperations"))
		expect(body).toContain('requirePermission(ctx, "admin", 3)')
	})

	test("o código-fonte não monta update nem delete sobre o log", () => {
		const source = readFileSync(join(import.meta.dir, "audit.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
		expect(source).not.toMatch(/db\s*\.\s*(update|delete)\s*\(/)
	})
})

const MIGRATIONS = join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations")

/** Só o SQL executável — comentário é onde as decisões são explicadas, e explicar não é aplicar. */
function migrationSql(file: string): string {
	return readFileSync(join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "")
}

const SENSITIVE_LOG = migrationSql("20260911120000_access_control_sensitive_operation_log.sql")
const RECOVERY_CODE = migrationSql("20260911120100_access_control_mfa_recovery_code.sql")
const RESET_LOG = migrationSql("20260911120200_access_control_mfa_reset_log.sql")

describe("migrations", () => {
	test("sensitive_operation_log.actor_id é on delete restrict — a prova não some com o usuário", () => {
		expect(SENSITIVE_LOG).toMatch(/actor_id\s+uuid\s+not null\s+references auth\.users\(id\)\s+on delete restrict/i)
	})

	test("mfa_reset_log referencia auth.users com restrict nas duas pontas", () => {
		expect(RESET_LOG).toMatch(/target_user_id\s+uuid\s+not null\s+references auth\.users\(id\)\s+on delete restrict/i)
		expect(RESET_LOG).toMatch(/performed_by\s+uuid\s+not null\s+references auth\.users\(id\)\s+on delete restrict/i)
	})

	test("mfa_recovery_code cascateia — é credencial, não prova", () => {
		expect(RECOVERY_CODE).toMatch(/user_id\s+uuid\s+not null\s+references auth\.users\(id\)\s+on delete cascade/i)
		expect(RECOVERY_CODE).toMatch(/code_hash\s+text\s+not null\s+unique/i)
	})

	test("o CHECK de `assurance` declara exatamente os graus do schema TS", () => {
		const match = /assurance in \(([^)]*)\)/i.exec(SENSITIVE_LOG)
		expect(match, "CHECK de `assurance` não encontrado na migration").not.toBeNull()
		const values = [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1])
		expect(values.sort()).toEqual([...AssuranceLevelSchema.options].sort())
	})

	test("as três tabelas ligam RLS, e só o código de recuperação tem policy — e só de leitura", () => {
		for (const sql of [SENSITIVE_LOG, RECOVERY_CODE, RESET_LOG]) {
			expect(sql).toMatch(/enable row level security/i)
		}
		expect(SENSITIVE_LOG).not.toMatch(/create policy/i)
		expect(RESET_LOG).not.toMatch(/create policy/i)
		expect(RECOVERY_CODE).toMatch(/create policy[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?auth\.uid\(\)\) = user_id/i)
	})

	test("nada é exposto ao papel anon", () => {
		for (const sql of [SENSITIVE_LOG, RECOVERY_CODE, RESET_LOG]) {
			expect(sql).not.toMatch(/\banon\b/i)
		}
	})
})
