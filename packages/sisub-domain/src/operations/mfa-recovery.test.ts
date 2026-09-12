/**
 * Contrato dos códigos de recuperação de segundo fator.
 *
 * O que precisa ser verdade aqui não aparece em nenhuma tela e falha em silêncio:
 *
 *   1. **Só o hash persiste.** O código em claro existe uma vez, na tela que o usuário
 *      imprime. Se um dia ele encostar num `values()`, a tabela vira uma lista de
 *      credenciais em claro — e ninguém notaria olhando o app funcionar.
 *   2. **Geração e consumo normalizam IGUAL.** Os dois lados só se encontram pelo hash.
 *      Divergirem faz o código impresso deixar de casar com a linha gravada exatamente
 *      quando ele é o último caminho de volta.
 *   3. **Uso único é único.** A marcação é uma UPDATE só, com `used_at is null` no
 *      `where`; ler-depois-marcar deixaria duas requisições simultâneas consumirem o
 *      mesmo código.
 *   4. **Regerar invalida o anterior APAGANDO, não marcando como usado** — `used_at` é
 *      prova de uso, e dez usos que não aconteceram envenenam a investigação.
 *   5. **`performed_by` sai da sessão.** Log de remoção de MFA assinável por terceiro é
 *      pior que log nenhum: parece prova.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { RECOVERY_CODE_ALPHABET, RECOVERY_CODE_COUNT, RECOVERY_CODE_ENTROPY_BITS } from "../schemas/mfa-recovery.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import * as recoveryModule from "./mfa-recovery.ts"
import {
	consumeRecoveryCode,
	generateRecoveryCode,
	generateRecoveryCodes,
	getRecoveryCodeStatus,
	hashRecoveryCode,
	normalizeRecoveryCode,
	recordMfaReset,
	revokeRecoveryCodes,
} from "./mfa-recovery.ts"

const SESSION_USER = "11111111-1111-1111-1111-111111111111"
const OTHER_USER = "22222222-2222-2222-2222-222222222222"

const ctx: UserContext = { userId: SESSION_USER, permissions: [], aal: 1, lastFactorAt: null, origin: "session" }

type Captured = {
	/** Verbos na ordem em que foram chamados — é como a ordem "apaga, depois insere" é provada. */
	calls: string[]
	values: unknown[]
	sets: Record<string, unknown>[]
}

/**
 * Stub do handle Drizzle. Cada verbo anota a chamada e devolve o próximo resultado da fila
 * de `returning()`; `select().from().where()` resolve a própria fila (o `count` da leitura).
 */
function fakeDb(captured: Captured, results: unknown[][]): SisubDb {
	let cursor = 0
	const next = () => results[cursor++] ?? []

	// biome-ignore lint/suspicious/noExplicitAny: stub de chain fluente do Drizzle
	const chain: any = {}
	chain.values = (v: unknown) => {
		captured.values.push(v)
		return chain
	}
	chain.set = (v: Record<string, unknown>) => {
		captured.sets.push(v)
		return chain
	}
	chain.from = () => chain
	// `where()` devolve um thenable PREGUIÇOSO: só consome a fila se for aguardado direto
	// (`select().from().where()`), e não quando ainda vem um `.returning()` atrás.
	chain.where = () => ({
		...chain,
		// O thenable É o ponto: ele deixa `select().from().where()` ser aguardado direto, como o
		// Drizzle permite, sem consumir a fila quando ainda vem um `.returning()` atrás.
		// biome-ignore lint/suspicious/noThenProperty: stub deliberado do chain do Drizzle
		then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(next()).then(resolve, reject),
	})
	chain.returning = () => Promise.resolve(next())

	const verb = (name: string) => () => {
		captured.calls.push(name)
		return chain
	}

	const db = {
		insert: verb("insert"),
		update: verb("update"),
		delete: verb("delete"),
		select: verb("select"),
		transaction: (run: (tx: unknown) => Promise<unknown>) => run(db),
	}
	return db as unknown as SisubDb
}

function emptyCapture(): Captured {
	return { calls: [], values: [], sets: [] }
}

const source = readFileSync(join(import.meta.dir, "mfa-recovery.ts"), "utf8")

/** O arquivo sem comentário nenhum — o que o runtime realmente executa. */
const runtimeCode = source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/^\s*\/\/.*$/gm, "")

/** Corpo de uma função exportada, do `export` dela até o próximo `export`. */
function blockOf(name: string): string {
	const start = source.indexOf(`export async function ${name}`)
	expect(start, `${name} não existe em mfa-recovery.ts`).toBeGreaterThan(-1)
	const next = source.indexOf("\nexport ", start + 1)
	return source.slice(start, next === -1 ? undefined : next)
}

// ============================================================================
// Formato e entropia
// ============================================================================

describe("generateRecoveryCode", () => {
	test("usa o formato XXXX-XXXX-XXXX com o alfabeto sem símbolos ambíguos", () => {
		for (let i = 0; i < 200; i++) {
			const code = generateRecoveryCode()
			expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
			for (const char of code.replaceAll("-", "")) {
				expect(RECOVERY_CODE_ALPHABET, `${char} não está no alfabeto`).toContain(char)
			}
			// `I`, `L`, `O` e `U` ficam de fora para que a transcrição à mão não invente um
			// código diferente do impresso.
			expect(code).not.toMatch(/[ILOU]/)
		}
	})

	test("não repete — 500 códigos, 500 valores distintos", () => {
		const codes = new Set(Array.from({ length: 500 }, () => generateRecoveryCode()))
		expect(codes.size).toBe(500)
	})

	test("o alfabeto tem exatamente 32 símbolos, que é o que torna `byte & 31` não enviesado", () => {
		expect(RECOVERY_CODE_ALPHABET.length).toBe(32)
		expect(new Set(RECOVERY_CODE_ALPHABET).size).toBe(32)
		expect(RECOVERY_CODE_ENTROPY_BITS).toBe(60)
	})

	test("o sorteio é criptográfico — `Math.random` não aparece no módulo", () => {
		expect(runtimeCode).toContain("crypto.getRandomValues")
		expect(runtimeCode).not.toContain("Math.random")
	})
})

// ============================================================================
// Normalização e hash (a ponte entre geração e consumo)
// ============================================================================

describe("normalizeRecoveryCode", () => {
	test("separador, espaço e caixa não mudam o código", () => {
		const canonical = normalizeRecoveryCode("ABCD-2345-6789")
		expect(normalizeRecoveryCode("abcd 2345 6789")).toBe(canonical)
		expect(normalizeRecoveryCode("ABCD23456789")).toBe(canonical)
		expect(normalizeRecoveryCode("  abcd–2345–6789 ")).toBe(canonical)
	})

	test("os aliases do Crockford valem: I/L viram 1, O vira 0", () => {
		expect(normalizeRecoveryCode("IL0O")).toBe("1100")
	})
})

describe("hashRecoveryCode", () => {
	test("é SHA-256 em hex, e o mesmo código escrito de outro jeito dá o mesmo hash", async () => {
		const hash = await hashRecoveryCode("ABCD-2345-6789")
		expect(hash).toMatch(/^[0-9a-f]{64}$/)
		expect(await hashRecoveryCode("abcd 2345 6789")).toBe(hash)
	})

	test("código diferente, hash diferente", async () => {
		expect(await hashRecoveryCode("ABCD-2345-6789")).not.toBe(await hashRecoveryCode("ABCD-2345-678A"))
	})
})

// ============================================================================
// Geração
// ============================================================================

describe("generateRecoveryCodes", () => {
	const insertedRows = Array.from({ length: RECOVERY_CODE_COUNT }, () => ({ createdAt: "2026-09-11T12:00:00Z" }))

	test("emite 10 códigos e persiste SÓ o hash de cada um", async () => {
		const captured = emptyCapture()
		const result = await generateRecoveryCodes(fakeDb(captured, [[], insertedRows]), ctx)

		expect(result.codes).toHaveLength(RECOVERY_CODE_COUNT)

		const rows = captured.values[0] as { userId: string; codeHash: string }[]
		expect(rows).toHaveLength(RECOVERY_CODE_COUNT)
		for (const [index, row] of rows.entries()) {
			expect(row.userId).toBe(SESSION_USER)
			expect(row.codeHash).toBe(await hashRecoveryCode(result.codes[index] as string))
			expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/)
		}
	})

	test("nenhum código em claro entra no payload gravado", async () => {
		const captured = emptyCapture()
		const result = await generateRecoveryCodes(fakeDb(captured, [[], insertedRows]), ctx)

		const persisted = JSON.stringify(captured.values)
		for (const code of result.codes) {
			expect(persisted, "o código em claro vazou para o INSERT").not.toContain(code)
			expect(persisted).not.toContain(normalizeRecoveryCode(code))
		}
		// E nenhuma coluna de texto claro foi inventada no caminho.
		const columns = new Set(Object.keys((captured.values[0] as Record<string, unknown>[])[0] ?? {}))
		expect([...columns].sort()).toEqual(["codeHash", "userId"])
	})

	test("a geração anterior é APAGADA antes da nova entrar — e nunca marcada como usada", async () => {
		const captured = emptyCapture()
		const previous = [{ id: "a" }, { id: "b" }]
		const result = await generateRecoveryCodes(fakeDb(captured, [previous, insertedRows]), ctx)

		expect(captured.calls).toEqual(["delete", "insert"])
		expect(result.invalidated).toBe(previous.length)
		// `used_at` gravado num código que ninguém usou envenena a única coluna que a
		// investigação lê.
		expect(captured.sets).toEqual([])
	})

	test("insert que devolve menos linhas do que os códigos emitidos falha em vez de entregar folha incompleta", async () => {
		const captured = emptyCapture()
		const call = generateRecoveryCodes(fakeDb(captured, [[], insertedRows.slice(0, 3)]), ctx)

		await expect(call).rejects.toBeInstanceOf(DomainError)
	})

	test("o dono é o da sessão, e o input não tem como sobrescrevê-lo", () => {
		// A assinatura não aceita `userId`: a única origem é `ctx`.
		expect(runtimeCode).toContain("userId: ctx.userId")
		expect(runtimeCode).not.toMatch(/userId:\s*input\.userId/)
	})
})

// ============================================================================
// Consumo
// ============================================================================

describe("consumeRecoveryCode", () => {
	test("marca o uso e devolve a linha, sem tocar em fator nenhum", async () => {
		const captured = emptyCapture()
		const result = await consumeRecoveryCode(fakeDb(captured, [[{ id: "code-1", usedAt: "2026-09-11T12:30:00Z" }], [{ value: 9 }]]), ctx, {
			code: "ABCD-2345-6789",
		})

		expect(result).toEqual({ codeId: "code-1", usedAt: "2026-09-11T12:30:00Z", remaining: 9 })
		// UPDATE, e a leitura do saldo depois. Nenhum SELECT antes: ler para depois marcar
		// deixaria duas requisições simultâneas consumirem o mesmo código.
		expect(captured.calls).toEqual(["update", "select"])
	})

	test("código inválido, de outra conta ou já usado dão a MESMA recusa", async () => {
		const captured = emptyCapture()
		const call = consumeRecoveryCode(fakeDb(captured, [[]]), ctx, { code: "ABCD-2345-6789" })

		await expect(call).rejects.toBeInstanceOf(DomainError)
		// Mensagem única de propósito: "já utilizado" confirmaria a existência do código.
		await expect(call).rejects.toThrow(/inválido ou já utilizado/)
	})

	test("nenhum fator é removido aqui — a operation não conhece sessão", () => {
		for (const symbol of ["deleteFactor", "refreshSession", "listFactors", "aal2"]) {
			expect(runtimeCode, `mfa-recovery.ts executa \`${symbol}\``).not.toContain(symbol)
		}
	})

	test("o `where` do consumo carrega dono, hash e `used_at is null`", () => {
		const block = blockOf("consumeRecoveryCode")
		expect(block).toContain("eq(mfaRecoveryCodeInAccessControl.userId, ctx.userId)")
		expect(block).toContain("eq(mfaRecoveryCodeInAccessControl.codeHash, codeHash)")
		expect(block).toContain("isNull(mfaRecoveryCodeInAccessControl.usedAt)")
		// `now()` do BANCO: relógio de processo não carimba prova de uso.
		expect(block).toContain("sql`now()`")
	})
})

// ============================================================================
// Invalidação por mudança de permissão (conta que VIRA protegida)
// ============================================================================

describe("revokeRecoveryCodes", () => {
	test("apaga os códigos não usados do alvo e devolve quantos caíram", async () => {
		const captured = emptyCapture()
		const removed = await revokeRecoveryCodes(fakeDb(captured, [[{ id: "a" }, { id: "b" }, { id: "c" }]]), OTHER_USER)

		expect(removed).toBe(3)
		expect(captured.calls).toEqual(["delete"])
	})

	test("sem código nenhum devolve zero em vez de falhar — a chamada é consequência de outra operação", async () => {
		const captured = emptyCapture()
		expect(await revokeRecoveryCodes(fakeDb(captured, [[]]), OTHER_USER)).toBe(0)
	})
})

describe("getRecoveryCodeStatus", () => {
	test("conta só os não usados e nunca devolve hash nem código", async () => {
		const captured = emptyCapture()
		const status = await getRecoveryCodeStatus(fakeDb(captured, [[{ value: 7, generatedAt: "2026-09-11T12:00:00Z" }]]), ctx)

		expect(status).toEqual({ available: 7, generatedAt: "2026-09-11T12:00:00Z" })
		const block = blockOf("getRecoveryCodeStatus")
		expect(block).not.toContain("codeHash")
	})
})

// ============================================================================
// Log de remoção de MFA
// ============================================================================

describe("recordMfaReset", () => {
	const ROW = [{ id: "log-1" }]

	test("grava alvo, método e justificativa, com `performed_by` saído da sessão", async () => {
		const captured = emptyCapture()
		await recordMfaReset(fakeDb(captured, [ROW]), ctx, { targetUserId: OTHER_USER, method: "admin-reset", reason: "Perdeu o aparelho." })

		expect(captured.values[0]).toEqual({
			targetUserId: OTHER_USER,
			performedBy: SESSION_USER,
			method: "admin-reset",
			reason: "Perdeu o aparelho.",
		})
		expect(captured.calls).toEqual(["insert"])
	})

	test("no autoatendimento por código, ator e alvo são o mesmo titular", async () => {
		const captured = emptyCapture()
		await recordMfaReset(fakeDb(captured, [ROW]), ctx, { targetUserId: ctx.userId, method: "recovery-code" })

		expect(captured.values[0]).toEqual({ targetUserId: SESSION_USER, performedBy: SESSION_USER, method: "recovery-code", reason: null })
	})

	test("o ator não é falsificável pelo input", async () => {
		const captured = emptyCapture()
		const forged = { targetUserId: OTHER_USER, method: "admin-reset", performedBy: OTHER_USER, performed_by: OTHER_USER } as never
		await recordMfaReset(fakeDb(captured, [ROW]), ctx, forged)

		expect((captured.values[0] as Record<string, unknown>).performedBy).toBe(SESSION_USER)
	})

	test("insert que não devolve linha propaga — remover fator sem rastro é pior que não remover", async () => {
		const captured = emptyCapture()
		await expect(recordMfaReset(fakeDb(captured, [[]]), ctx, { targetUserId: OTHER_USER, method: "admin-reset" })).rejects.toBeInstanceOf(DomainError)
	})
})

// ============================================================================
// Superfície do módulo
// ============================================================================

describe("integridade do módulo", () => {
	test("nenhuma função altera ou apaga linha do log de reset", () => {
		const forbidden = Object.keys(recoveryModule).filter((name) => /MfaReset/.test(name) && /update|delete|remove|purge|clear/i.test(name))
		expect(forbidden).toEqual([])
	})

	test("o extrator enxerga o arquivo (proteção contra um contrato que passa vazio)", () => {
		expect(source.length).toBeGreaterThan(2000)
		for (const name of ["generateRecoveryCodes", "consumeRecoveryCode", "revokeRecoveryCodes", "recordMfaReset"]) {
			expect(source).toContain(`export async function ${name}`)
		}
	})
})
