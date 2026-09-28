/**
 * O que conta como falha na resposta de uma server function.
 *
 * O cliente do TanStack Start (`serverFnFetcher`, start-client-core 1.170) devolve como
 * RESULTADO qualquer resposta JSON sem o cabeçalho `x-tss-serialized`, sem olhar o status.
 * Erro que o h3 monta fora do handler (server function que a task não conhece, no deploy
 * rolante; erro de middleware) chega como `500 {"status":500,"unhandled":true,…}` e a tela
 * o recebia como sucesso: "Nova versão criada", rascunho apagado, nada gravado. E o 502/504
 * do ALB (HTML) virava toast com a página de erro crua.
 *
 * Esta regra transforma essas respostas em erro com mensagem legível. O resto passa intacto
 * para o TanStack: sucesso, erro serializado (a mensagem de domínio) e `notFound()`.
 */
import { BUILD_ID, BUILD_ID_HEADER, compareBuildIds } from "./build-id"

/** O servidor não confirmou a operação: nada do que a tela tem deve ser tratado como gravado. */
export class ServerFnTransportError extends Error {
	readonly status: number
	/** A resposta veio de um build diferente do da aba (deploy em andamento). */
	readonly fromOtherBuild: boolean

	constructor(message: string, status: number, fromOtherBuild = false) {
		super(message)
		this.name = "ServerFnTransportError"
		this.status = status
		this.fromOtherBuild = fromOtherBuild
	}
}

/** Mensagem da falha, completando o "Erro ao salvar X:" que as telas põem na frente. */
export function describeTransportFailure(status: number, fromOtherBuild: boolean): string {
	const code = status >= 400 ? ` (erro ${status})` : ""
	const cause =
		fromOtherBuild || status === 502 || status === 503
			? `o SISUB está sendo atualizado e não confirmou a operação${code}.`
			: status === 0
				? "a conexão com o SISUB caiu antes da resposta."
				: `o servidor não confirmou a operação${code}.`
	// 502, 504 e conexão caída: o servidor pode ter terminado depois que a resposta se perdeu
	// (o ALB devolve 502 também quando a task derruba a conexão no meio da requisição).
	const next =
		status === 502 || status === 504 || status === 0
			? " Ela pode ter sido gravada: confira antes de repetir. O que você digitou continua na tela."
			: " O que você digitou continua na tela; tente de novo em alguns segundos."
	return `${cause.charAt(0).toUpperCase()}${cause.slice(1)}${next}`
}

/**
 * A gravação devolveu a linha gravada? Sem `id`, o servidor não confirmou: lança, para a tela
 * tratar como erro (rascunho fica, sem toast de sucesso). Chamar no `mutationFn`, antes do
 * `onSuccess`.
 */
export function assertSavedRow<T extends { id?: unknown }>(row: T | null | undefined): asserts row is T & { id: string } {
	if (typeof row?.id === "string" && row.id !== "") return
	throw new ServerFnTransportError("O servidor não confirmou a gravação. O que você digitou continua na tela; tente de novo em alguns segundos.", 200)
}

function isFromOtherBuild(response: Response, clientBuild: string): boolean {
	const order = compareBuildIds(response.headers.get(BUILD_ID_HEADER), clientBuild)
	return order !== null && order !== 0
}

/**
 * Devolve a resposta quando o TanStack a interpreta certo; lança `ServerFnTransportError`
 * quando ele a tomaria por sucesso (JSON sem serialização com status de erro) ou mostraria
 * a página de erro do ALB como mensagem.
 */
export async function checkServerFnResponse(response: Response, clientBuild: string = BUILD_ID): Promise<Response> {
	// 0 = redirecionamento opaco; o TanStack cuida.
	if (response.status === 0) return response
	const { headers } = response
	if (response.ok) {
		// Página HTML com 200 no lugar do resultado (redirecionamento seguido até uma página):
		// o TanStack a devolveria como resultado. `Response` crua do handler vem com `x-tss-raw`.
		if (!headers.get("x-tss-raw") && (headers.get("content-type") ?? "").includes("text/html")) {
			throw new ServerFnTransportError(describeTransportFailure(response.status, isFromOtherBuild(response, clientBuild)), response.status)
		}
		return response
	}
	// Erro serializado pelo handler (mensagem de domínio) ou `Response` crua do handler.
	if (headers.get("x-tss-serialized") || headers.get("x-tss-raw")) return response
	const contentType = headers.get("content-type") ?? ""
	const fromOtherBuild = isFromOtherBuild(response, clientBuild)
	if (contentType.includes("application/json")) {
		const payload: unknown = await response
			.clone()
			.json()
			.catch(() => null)
		// `notFound()` do servidor volta como 404 JSON sem serialização, e o TanStack o relança.
		if (payload !== null && typeof payload === "object" && "isNotFound" in payload) return response
		throw new ServerFnTransportError(describeTransportFailure(response.status, fromOtherBuild), response.status, fromOtherBuild)
	}
	if (contentType.includes("text/html") || response.status >= 502) {
		throw new ServerFnTransportError(describeTransportFailure(response.status, fromOtherBuild), response.status, fromOtherBuild)
	}
	// Texto curto do próprio TanStack (405, CSRF): ele lança com essa mensagem.
	return response
}
