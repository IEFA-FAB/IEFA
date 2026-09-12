/**
 * Códigos de recuperação de segundo fator e o registro de remoção de MFA.
 *
 * ## O que um código de recuperação FAZ, e o que ele não faz
 *
 * Consumir um código **remove o fator** e obriga o recadastro (design.md D8). Ele não
 * produz AAL2 e não é credencial de elevação: não temos como fazer o GoTrue aceitar um
 * código nosso como fator, e um hook de token que emitisse `aal2` mentiria sobre a
 * garantia — contaminando toda decisão a jusante, inclusive RLS. Por isso NADA neste
 * arquivo toca sessão: a operation valida, marca o uso e devolve ao chamador a
 * responsabilidade de chamar `auth.admin.mfa.deleteFactor` + `refreshSession()`.
 *
 * ## O dono sai da sessão, nunca do input
 *
 * `ctx.userId` entra no `where` de toda leitura e de toda escrita de código. É a mesma
 * regra de `mcp-keys.ts`, e aqui ela pesa mais: um `userId` de payload transformaria o
 * consumo num caminho para apagar o segundo fator de qualquer conta do sistema.
 *
 * A exceção é `revokeRecoveryCodes`, que age sobre OUTRO usuário — e por isso não recebe
 * `ctx`: ela é a consequência de uma concessão de permissão já autorizada, e fingir que o
 * ator é o dono da linha só criaria um `ctx` falso. A autorização mora em quem a chama.
 *
 * ## Segredo
 *
 * O código em claro existe uma única vez, no retorno de `generateRecoveryCodes` — a tela
 * que o usuário copia, baixa ou imprime. O que persiste é o SHA-256, mesmo padrão de
 * `access_control.mcp_api_keys.key_hash`.
 */

import { mfaRecoveryCodeInAccessControl, mfaResetLogInAccessControl, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, count, eq, isNull, sql } from "drizzle-orm"
import { type AssuranceRequirement, NO_ASSURANCE, requireAssurance } from "../guards/require-assurance.ts"
import {
	type ConsumeRecoveryCode,
	RECOVERY_CODE_ALPHABET,
	RECOVERY_CODE_COUNT,
	RECOVERY_CODE_GROUP_SIZE,
	RECOVERY_CODE_GROUPS,
} from "../schemas/mfa-recovery.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

/** Método pelo qual um segundo fator foi removido — o `check` de `mfa_reset_log.method`. */
export type MfaResetMethod = "recovery-code" | "admin-reset"

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

async function sha256hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
	return toHex(new Uint8Array(buf))
}

/**
 * Um código aleatório no formato `XXXX-XXXX-XXXX`.
 *
 * `crypto.getRandomValues` e `byte & 31`: o alfabeto tem 32 símbolos exatos, então o
 * mascaramento sorteia sem viés. `Math.random()` aqui seria o defeito clássico — código
 * de recuperação previsível é senha publicada.
 */
export function generateRecoveryCode(): string {
	const symbols = RECOVERY_CODE_GROUP_SIZE * RECOVERY_CODE_GROUPS
	const bytes = crypto.getRandomValues(new Uint8Array(symbols))
	const chars = Array.from(bytes, (byte) => RECOVERY_CODE_ALPHABET[byte & 31])

	const groups: string[] = []
	for (let index = 0; index < RECOVERY_CODE_GROUPS; index++) {
		groups.push(chars.slice(index * RECOVERY_CODE_GROUP_SIZE, (index + 1) * RECOVERY_CODE_GROUP_SIZE).join(""))
	}
	return groups.join("-")
}

/**
 * Forma canônica de um código digitado.
 *
 * Quem informa um código de recuperação está lendo papel — com hífen, sem hífen, em
 * minúscula, com espaço no meio. A canonicalização acontece ANTES do hash, dos dois
 * lados (geração e consumo), porque o hash é de igualdade exata: sem isto, o mesmo código
 * escrito com espaço seria "inválido" e o usuário queimaria tentativas por causa de um
 * separador.
 *
 * `I`/`L` → `1` e `O` → `0` são os aliases do Crockford Base32: os quatro símbolos estão
 * FORA do alfabeto de geração justamente para poderem significar o dígito parecido.
 */
export function normalizeRecoveryCode(raw: string): string {
	return raw
		.toUpperCase()
		.replaceAll(/[^0-9A-Z]/g, "")
		.replaceAll(/[IL]/g, "1")
		.replaceAll("O", "0")
}

/**
 * Hash persistido de um código — SHA-256 hex da forma canônica.
 *
 * Exportado porque é a ÚNICA ponte entre a geração e o consumo: se os dois lados
 * normalizassem diferente, o código impresso deixaria de casar com a linha gravada e a
 * recuperação falharia justamente na hora em que ela é o último caminho. Uma função só,
 * usada pelos dois, e o teste confere o ida-e-volta.
 */
export async function hashRecoveryCode(raw: string): Promise<string> {
	return sha256hex(normalizeRecoveryCode(raw))
}

/** Projeção de quantos códigos ainda valem — o que a tela de segurança mostra. */
export type RecoveryCodeStatus = {
	/** Códigos gerados e ainda não usados. */
	available: number
	/** Quando a geração corrente foi emitida; `null` quando não há código nenhum. */
	generatedAt: string | null
}

/** Códigos disponíveis do titular da sessão. Nunca devolve hash nem código em claro. */
export async function getRecoveryCodeStatus(db: SisubDb, ctx: UserContext): Promise<RecoveryCodeStatus> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ value: count(), generatedAt: sql<string | null>`max(${mfaRecoveryCodeInAccessControl.createdAt})::text` })
			.from(mfaRecoveryCodeInAccessControl)
			.where(and(eq(mfaRecoveryCodeInAccessControl.userId, ctx.userId), isNull(mfaRecoveryCodeInAccessControl.usedAt)))
	)

	return { available: Number(rows[0]?.value ?? 0), generatedAt: rows[0]?.generatedAt ?? null }
}

/** Resultado da geração. O texto claro existe AQUI e em nenhum outro lugar. */
export type GeneratedRecoveryCodes = {
	/** Os códigos em claro, na ordem em que a tela deve exibi-los. */
	codes: string[]
	/** Quantos códigos da geração anterior foram invalidados. */
	invalidated: number
	generatedAt: string
}

/**
 * Emite um jogo novo de códigos e invalida o anterior.
 *
 * ## Por que a geração anterior é APAGADA, e não marcada como usada
 *
 * `used_at` significa "este código foi usado, nesta data" — é o que sustenta a
 * investigação depois. Marcar a geração anterior como usada gravaria dez usos que nunca
 * aconteceram e envenenaria exatamente a coluna em que alguém vai reparar. Código não
 * usado é CREDENCIAL, não prova (é a razão do `on delete cascade` desta tabela, ao
 * contrário dos dois logs), e credencial invalidada se apaga.
 *
 * ## Por que transação
 *
 * Apagar e inserir são um ato só. Sem transação, uma falha entre os dois deixaria o
 * usuário sem os códigos velhos e sem os novos — o pior dos dois mundos, e justamente na
 * conta de quem foi cuidadoso o bastante para regerar.
 *
 * O piso de garantia é do chamador (`assurance`): minerar dez códigos que contornam o
 * segundo fator é ato de credencial, e credencial sem senha e sem fator é o que D11 trata
 * como `fresh`.
 */
export async function generateRecoveryCodes(db: SisubDb, ctx: UserContext, assurance: AssuranceRequirement = NO_ASSURANCE): Promise<GeneratedRecoveryCodes> {
	requireAssurance(ctx, assurance)

	const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode())
	// Hash FORA da transação: falha de Web Crypto não é falha de banco e não deve chegar ao
	// chamador com o código de erro de um insert (mesma razão de `createMcpApiKey`).
	const hashes = await Promise.all(codes.map(hashRecoveryCode))

	return runQuery("RECOVERY_CODE_INSERT_FAILED", async () =>
		db.transaction(async (tx) => {
			const invalidated = await tx
				.delete(mfaRecoveryCodeInAccessControl)
				.where(and(eq(mfaRecoveryCodeInAccessControl.userId, ctx.userId), isNull(mfaRecoveryCodeInAccessControl.usedAt)))
				.returning({ id: mfaRecoveryCodeInAccessControl.id })

			const inserted = await tx
				.insert(mfaRecoveryCodeInAccessControl)
				.values(hashes.map((codeHash) => ({ userId: ctx.userId, codeHash })))
				.returning({ createdAt: mfaRecoveryCodeInAccessControl.createdAt })

			const generatedAt = inserted[0]?.createdAt
			if (!generatedAt || inserted.length !== codes.length) {
				// Entregar à tela menos códigos do que ela vai afirmar que existem é pior do
				// que falhar: o usuário guardaria uma folha incompleta acreditando no contrário.
				throw new DomainError("RECOVERY_CODE_INSERT_FAILED", `esperava ${codes.length} códigos, gravou ${inserted.length}`)
			}

			return { codes, invalidated: invalidated.length, generatedAt }
		})
	)
}

/** O que o chamador recebe para então remover os fatores. */
export type ConsumedRecoveryCode = {
	/** Id da linha marcada como usada — entra no alvo da auditoria. */
	codeId: string
	usedAt: string
	/** Códigos que sobraram depois deste. */
	remaining: number
}

/**
 * Valida um código, marca-o como usado e devolve o resultado — **sem** tocar em fator
 * nenhum e **sem** produzir AAL2.
 *
 * ## Uma única UPDATE, e é ela que valida
 *
 * Ler a linha e depois marcá-la seria check-then-act: duas requisições simultâneas com o
 * mesmo código passariam as duas pela leitura e as duas concluiriam o consumo — uso único
 * que se usa duas vezes não é uso único. O `where` carrega as três condições (dono, hash,
 * `used_at is null`) e o banco decide quem ganhou; zero linha afetada é, ao mesmo tempo,
 * "código errado", "código de outra pessoa" e "código já usado".
 *
 * ## A mensagem de erro não distingue os três casos
 *
 * De propósito. "Código já utilizado" confirmaria a um atacante que aquele código existe
 * nesta conta, e transformaria a recusa num oráculo de enumeração.
 *
 * `now()` é do BANCO: relógio de processo não carimba prova de uso.
 */
export async function consumeRecoveryCode(db: SisubDb, ctx: UserContext, input: ConsumeRecoveryCode): Promise<ConsumedRecoveryCode> {
	const codeHash = await hashRecoveryCode(input.code)

	const consumed = await runQuery("RECOVERY_CODE_CONSUME_FAILED", () =>
		db
			.update(mfaRecoveryCodeInAccessControl)
			.set({ usedAt: sql`now()` })
			.where(
				and(
					eq(mfaRecoveryCodeInAccessControl.userId, ctx.userId),
					eq(mfaRecoveryCodeInAccessControl.codeHash, codeHash),
					isNull(mfaRecoveryCodeInAccessControl.usedAt)
				)
			)
			.returning({ id: mfaRecoveryCodeInAccessControl.id, usedAt: mfaRecoveryCodeInAccessControl.usedAt })
	)

	const row = consumed[0]
	if (!row) throw new DomainError("RECOVERY_CODE_INVALID", "Código de recuperação inválido ou já utilizado.")

	const { available } = await getRecoveryCodeStatus(db, ctx)
	return { codeId: row.id, usedAt: row.usedAt ?? new Date().toISOString(), remaining: available }
}

/**
 * Invalida os códigos não usados de um usuário e devolve quantos caíram.
 *
 * Existe para a conta que **vira** protegida: no instante em que uma permissão passa a
 * alcançar operação classificada, "senha + folha de papel" volta a valer empenho — que é
 * exatamente o que a mudança fecha (design.md D9). Quem decide se a conta virou protegida
 * é o registro de classificação, no app; aqui só se executa a consequência.
 *
 * Idempotente: sem código nenhum, devolve zero em vez de falhar. Chamada de dentro de uma
 * operação já autorizada, é por isso que não há `ctx` — não existe ator a conferir aqui,
 * e inventar um seria fingir uma autorização que quem chama já fez.
 */
export async function revokeRecoveryCodes(db: SisubDb, userId: string): Promise<number> {
	const removed = await runQuery("RECOVERY_CODE_REVOKE_FAILED", () =>
		db
			.delete(mfaRecoveryCodeInAccessControl)
			.where(and(eq(mfaRecoveryCodeInAccessControl.userId, userId), isNull(mfaRecoveryCodeInAccessControl.usedAt)))
			.returning({ id: mfaRecoveryCodeInAccessControl.id })
	)
	return removed.length
}

export type MfaResetLogRow = {
	id: string
	target_user_id: string
	performed_by: string
	method: string
	reason: string | null
	created_at: string
}

export type RecordMfaResetInput = {
	/** Quem ficou sem fator. */
	targetUserId: string
	method: MfaResetMethod
	/** Justificativa. Obrigatória em `admin-reset`, exigida pela server fn que a coleta. */
	reason?: string | null
}

/**
 * Grava uma linha em `access_control.mfa_reset_log`.
 *
 * Apenas-inserção, como o registro de operações sensíveis: não há update nem delete aqui,
 * e não deve haver — este log é a resposta a "como esta conta ficou sem fator", e um log
 * que o próprio sistema edita não responde nada.
 *
 * `performed_by` sai de `ctx.userId`, nunca do input. No autoatendimento por código o ator
 * é o próprio titular, e os dois campos coincidem; no reset administrativo eles divergem, e
 * é a divergência que a investigação lê.
 *
 * Falha PROPAGA. A spec exige que o evento esteja gravado ANTES de a resposta voltar:
 * remover o segundo fator de alguém sem deixar rastro é pior do que não remover.
 */
export async function recordMfaReset(db: SisubDb, ctx: UserContext, input: RecordMfaResetInput): Promise<MfaResetLogRow> {
	return insertOneOrFail("MFA_RESET_LOG_INSERT_FAILED", "no row returned", () =>
		db
			.insert(mfaResetLogInAccessControl)
			.values({
				targetUserId: input.targetUserId,
				// Ator = sessão. Nunca um id vindo do input.
				performedBy: ctx.userId,
				method: input.method,
				reason: input.reason ?? null,
			})
			.returning({
				id: mfaResetLogInAccessControl.id,
				target_user_id: mfaResetLogInAccessControl.targetUserId,
				performed_by: mfaResetLogInAccessControl.performedBy,
				method: mfaResetLogInAccessControl.method,
				reason: mfaResetLogInAccessControl.reason,
				created_at: mfaResetLogInAccessControl.createdAt,
			})
	)
}
