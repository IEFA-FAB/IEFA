/**
 * @module jwt-claims
 * Leitura LOCAL das claims de garantia de identidade do access token do GoTrue.
 *
 * ## Por que decodificar aqui, e não chamar `getClaims()`
 *
 * A verificação prévia V3 do desenho mediu o projeto: `.well-known/jwks.json` devolve
 * `{"keys":[]}` — o JWT é assinado com segredo SIMÉTRICO. Nesse modo, `getClaims()` do
 * supabase-js não valida nada localmente: ele manda uma requisição ao GoTrue por chamada.
 * Num repo cujo histórico de incidente inclui 502 no ALB por TTFB de SSR, dobrar o custo de
 * auth de toda server function protegida é caro demais para ler dois números.
 *
 * A leitura aqui é sem verificação de assinatura, DE PROPÓSITO, e só é chamada depois de
 * `getUser()` ter validado ESSE MESMO token contra o GoTrue. A assinatura já foi provada por
 * quem podia prová-la; o que sobra é ler um payload que acabou de ser declarado autêntico.
 * Custo: zero round-trip. Fora dessa ordem — token não validado antes — esta função NÃO é
 * uma fonte de verdade, e é por isso que ela não é chamada em lugar nenhum sozinha.
 *
 * ## `lastFactorAt` sai da entrada `totp`, nunca de `amr[0]`
 *
 * O `amr` é uma lista de métodos de autenticação, cada um com o instante em que foi usado.
 * Ler a posição zero é o defeito clássico: `token_refresh` entra na lista a cada renovação,
 * e uma janela de elevação que se renova a cada refresh não expira nunca — silenciosamente.
 *
 * Isso não é hipótese: no token medido em V1, logo após o PRIMEIRO `verify` de TOTP, o `amr`
 * veio `[{ method: "password", … }, { method: "totp", … }]`. A posição zero já estava errada
 * no caso mais comum de todos.
 */

/** Método do `amr` que conta como verificação de segundo fator. */
const FACTOR_METHOD = "totp"

/** O que o access token diz sobre a garantia de identidade da sessão. */
export interface AssuranceClaims {
	/** 1 = só o primeiro fator; 2 = segundo fator verificado nesta sessão. */
	aal: 1 | 2
	/** Instante (epoch em segundos) da última verificação de segundo fator, ou `null`. */
	lastFactorAt: number | null
}

/**
 * Valor de partida, e também o resultado de todo caminho de falha de leitura.
 *
 * Falhar para AAL1 é falhar FECHADO: token malformado, claim ausente ou `amr` estranho
 * nunca podem produzir uma sessão que satisfaça uma exigência de segundo fator.
 */
export const NO_ASSURANCE_CLAIMS: AssuranceClaims = { aal: 1, lastFactorAt: null }

/** Decodifica um segmento base64url. Devolve `null` em vez de lançar — entrada externa. */
function decodeBase64Url(segment: string): string | null {
	const normalized = segment.replaceAll("-", "+").replaceAll("_", "/")
	const padding = (4 - (normalized.length % 4)) % 4
	try {
		const binary = atob(normalized + "=".repeat(padding))
		// `atob` devolve uma string de bytes (latin1). O payload de um JWT é UTF-8, e um
		// e-mail com acento viraria lixo se fosse lido direto — daí o TextDecoder.
		return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
	} catch {
		return null
	}
}

/**
 * Payload de um JWT, SEM verificar a assinatura.
 *
 * Exportada para teste e para o ponto único que a usa (`createRequestAuth`). Chamar isto
 * com um token que não passou por `getUser()` é ler o que o cliente escreveu.
 */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
	if (!token) return null
	const parts = token.split(".")
	if (parts.length !== 3) return null
	const json = decodeBase64Url(parts[1])
	if (json === null) return null
	try {
		const parsed: unknown = JSON.parse(json)
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
		return parsed as Record<string, unknown>
	} catch {
		return null
	}
}

/**
 * Instante da verificação mais recente de segundo fator dentro de um `amr`.
 *
 * Percorre TODAS as entradas de método `totp` e fica com a maior — uma sessão que refez o
 * desafio tem duas, e a janela de elevação tem que contar da última. Entrada sem timestamp
 * numérico é ignorada: um `null` ali não é "agora", é ausência de informação.
 */
export function readLastFactorAt(amr: unknown): number | null {
	if (!Array.isArray(amr)) return null

	let latest: number | null = null
	for (const entry of amr) {
		if (typeof entry !== "object" || entry === null) continue
		const record = entry as Record<string, unknown>
		if (record.method !== FACTOR_METHOD) continue
		const timestamp = record.timestamp
		if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue
		if (latest === null || timestamp > latest) latest = timestamp
	}
	return latest
}

/**
 * Extrai `aal` e `lastFactorAt` de um payload já decodificado.
 *
 * A claim `aal` do GoTrue é a string `"aal1"`/`"aal2"`. Qualquer outro valor — ausente,
 * `"aal3"` de uma versão futura, número — cai em 1. Um valor desconhecido tratado como
 * elevado seria exatamente o inverso do que um piso de segurança deve fazer.
 */
export function readAssuranceClaims(payload: Record<string, unknown> | null): AssuranceClaims {
	if (!payload) return { ...NO_ASSURANCE_CLAIMS }
	return {
		aal: payload.aal === "aal2" ? 2 : 1,
		lastFactorAt: readLastFactorAt(payload.amr),
	}
}

/** `sub` do payload — usado só para conferir que o token lido é o do usuário já validado. */
export function readSubject(payload: Record<string, unknown> | null): string | null {
	if (!payload) return null
	return typeof payload.sub === "string" ? payload.sub : null
}
