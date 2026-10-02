/**
 * Validação do access token do Supabase, com cache curto.
 *
 * O `authMiddleware` chamava `auth.getUser(token)` — um round-trip ao GoTrue — em TODA
 * requisição. Um turno de chat, uma tela do processo com meia dúzia de leituras, um
 * script com tokens inventados: tudo virava carga no GoTrue, que é compartilhado com todos
 * os apps.
 *
 * ## Por que não `getClaims()`/JWKS
 *
 * O projeto assina o JWT com segredo SIMÉTRICO: `/auth/v1/.well-known/jwks.json` devolve
 * `{"keys":[]}` (conferido em 2026-10-01, e o mesmo registrado em `packages/pbac/src/
 * jwt-claims.ts`). Nesse modo o `getClaims()` do supabase-js não valida nada localmente — ele
 * próprio chama o GoTrue. Validar o HS256 aqui exigiria o segredo de assinatura no α, e quem
 * tem esse segredo emite token em nome de qualquer pessoa: espalhá-lo para mais um serviço
 * aumenta o estrago de um vazamento, e é variável de produção nova (decisão do mantenedor).
 *
 * ## O que este módulo faz
 *
 * 1. Filtro local, sem rede: o token precisa ser um JWT com payload legível, `sub` e `exp`
 *    no futuro. Token malformado ou vencido morre aqui. Isto NÃO autentica (a assinatura não
 *    é conferida) — só evita gastar o GoTrue com lixo.
 * 2. `getUser(token)` no GoTrue, que confere assinatura, existência do usuário e da sessão.
 *    O resultado positivo fica em cache por `TOKEN_CACHE_TTL_MS` (nunca além do `exp`),
 *    chaveado pelo SHA-256 do token; requisições simultâneas com o mesmo token esperam a
 *    mesma consulta.
 *
 * Revogação: logout, exclusão do usuário ou sessão encerrada passam a valer em até
 * `TOKEN_CACHE_TTL_MS` (60 s), em vez de imediatamente. Sem o GoTrue no meio, com validação
 * só local, a janela seria o `exp` inteiro do token (1 h) — por isso o GoTrue continua sendo
 * a fonte da verdade, só que uma vez por minuto por token, não uma vez por requisição.
 * Resultado negativo não entra no cache: um token recusado por instabilidade não fica
 * recusado por um minuto.
 */

import { createHash } from "node:crypto"
import { decodeJwtPayload } from "@iefa/pbac"
import type { User } from "@supabase/supabase-js"

export const TOKEN_CACHE_TTL_MS = 60_000
export const TOKEN_CACHE_MAX_ENTRIES = 2_000

export type TokenVerification = { ok: true; user: User } | { ok: false; reason: "INVALID_TOKEN" | "ANONYMOUS_USER" }

type GetUser = (token: string) => Promise<{ data: { user: User | null }; error: unknown }>

/** Filtro local: JWT legível, com `sub` e ainda dentro do `exp`. Não confere assinatura. */
export function isPlausibleAccessToken(token: string, now: number): boolean {
	const payload = decodeJwtPayload(token)
	if (!payload) return false
	if (typeof payload.sub !== "string" || payload.sub.length === 0) return false
	return typeof payload.exp === "number" && payload.exp * 1000 > now
}

function tokenExpiry(token: string): number {
	const exp = decodeJwtPayload(token)?.exp
	return typeof exp === "number" ? exp * 1000 : 0
}

export function createTokenVerifier(getUser: GetUser, options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
	const ttlMs = options.ttlMs ?? TOKEN_CACHE_TTL_MS
	const maxEntries = options.maxEntries ?? TOKEN_CACHE_MAX_ENTRIES
	const now = options.now ?? Date.now
	const cache = new Map<string, { expiresAt: number; result: Promise<TokenVerification> }>()

	async function lookup(token: string): Promise<TokenVerification> {
		const { data, error } = await getUser(token)
		if (error || !data.user) return { ok: false, reason: "INVALID_TOKEN" }
		// Login anônimo do Supabase é um JWT válido sem pessoa por trás: dava a qualquer um
		// as rotas que chamam modelo, com uma conta descartável por requisição.
		if (data.user.is_anonymous) return { ok: false, reason: "ANONYMOUS_USER" }
		return { ok: true, user: data.user }
	}

	return {
		async verify(token: string): Promise<TokenVerification> {
			const at = now()
			if (!isPlausibleAccessToken(token, at)) return { ok: false, reason: "INVALID_TOKEN" }

			const key = createHash("sha256").update(token).digest("hex")
			const cached = cache.get(key)
			if (cached && cached.expiresAt > at) return cached.result
			if (cached) cache.delete(key)

			// Falha de rede vira recusa aqui, para quem espera a mesma consulta não receber exceção.
			const result = lookup(token).catch((cause): TokenVerification => {
				console.error("[auth] GoTrue não respondeu à validação do token", cause)
				return { ok: false, reason: "INVALID_TOKEN" }
			})
			const entry = { expiresAt: Math.min(at + ttlMs, tokenExpiry(token)), result }
			cache.set(key, entry)
			// O mais antigo sai primeiro (o `Map` guarda a ordem de inserção).
			while (cache.size > maxEntries) {
				const oldest = cache.keys().next().value
				if (oldest === undefined) break
				cache.delete(oldest)
			}

			const settled = await result
			// Só o positivo fica. A recusa sai na hora: uma instabilidade do GoTrue não pode
			// recusar o token pelo minuto seguinte.
			if (!settled.ok && cache.get(key) === entry) cache.delete(key)
			return settled
		},
		/** Para teste: quantos tokens estão em cache. */
		size: () => cache.size,
	}
}
