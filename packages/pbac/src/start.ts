/**
 * @module start
 * Ligação do PBAC com o TanStack Start: cache request-scoped do usuário
 * autenticado e gates de autorização que já sinalizam o status HTTP.
 *
 * Por que existe: seis apps (sisub, portal, rumaer, sucont, forms,
 * assignment-selection) tinham a MESMA `WeakMap<Request, Promise<User|null>>`
 * copiada em `src/lib/auth.server.ts`, com o mesmo comentário explicando por quê.
 * Seis cópias de um cache é seis lugares para a próxima correção não chegar — e
 * a variante do assignment-selection já tinha divergido, devolvendo `null` fora
 * de um contexto de request em vez de resolver sem cache.
 *
 * Fica num subpath (`@iefa/pbac/start`) e não no índice porque importa
 * `@tanstack/react-start/server`. O `@iefa/pbac` raiz continua agnóstico de
 * framework — o `sisub-mcp` o consome de um processo Bun sem router nenhum.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { PermissionDeniedError } from "./errors.ts"
import { type MinLevel, requirePermission } from "./guards.ts"
import { resolveUserPermissions } from "./resolve-permissions.ts"
import type { AppModule, PermissionScope, UserContext } from "./types.ts"

/**
 * Sinaliza 401 no HTTP e lança. O `setResponseStatus` antes do `throw` é o ponto
 * inteiro: sem ele o TanStack Start devolve 500 e o cliente não distingue "sua
 * sessão expirou" de "o servidor quebrou".
 */
export function unauthorized(message = "UNAUTHORIZED"): never {
	setResponseStatus(401)
	throw new Error(message)
}

/** Sinaliza 403 e lança — autenticado, porém sem acesso ao recurso. */
export function forbidden(message = "FORBIDDEN"): never {
	setResponseStatus(403)
	throw new Error(message)
}

/** Cliente Supabase capaz de validar o JWT do cookie da sessão. */
interface AuthCapableClient {
	auth: { getUser(): Promise<{ data: { user: User | null } }> }
}

export interface RequestAuthConfig {
	/**
	 * Client SSR de autenticação do app (chave publishable, nunca a service role):
	 * `getUser()` valida o JWT no servidor Supabase.
	 */
	getAuthClient: () => AuthCapableClient
	/**
	 * Client service-role apontando para o schema `access_control`, onde mora a
	 * `user_permissions` compartilhada pelos apps do ERP. Opcional: app cujo modelo
	 * de autorização não é PBAC (assignment-selection resolve por `access_grant`)
	 * usa só a parte de autenticação.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
	getPermissionsClient?: () => SupabaseClient<any, any>
}

export interface RequestAuth {
	/** Usuário da request, ou `null`. Nunca lança — para caminhos de auth opcional. */
	getRequestUser: () => Promise<User | null>
	/** Usuário completo. Use quando precisar do e-mail: ele DEVE vir da sessão, nunca do payload. */
	requireUser: () => Promise<User>
	/** Só o id do usuário autenticado. 401 se não houver sessão. */
	requireUserId: () => Promise<string>
	/** Usuário + permissões PBAC resolvidas. Exige `getPermissionsClient`. */
	requireAuth: () => Promise<UserContext>
	/** `requireAuth` + gate de módulo/nível, traduzindo a negativa em 403. */
	requireLevel: (module: AppModule, minLevel?: MinLevel, scope?: PermissionScope) => Promise<UserContext>
}

/**
 * Monta os helpers de auth de um app. Chame UMA vez, no escopo do módulo:
 * o cache vive no closure, então uma segunda chamada cria um cache paralelo e
 * desfaz a coalescência (perda de desempenho, não de correção).
 *
 * ```ts
 * const auth = createRequestAuth({
 *   getAuthClient: getSucontAuthClient,
 *   getPermissionsClient: getAccessControlClient,
 * })
 * export const { getRequestUser, requireUser, requireUserId, requireAuth } = auth
 * export const requireSucontEditor = () => auth.requireLevel("sucont", 2)
 * ```
 */
export function createRequestAuth({ getAuthClient, getPermissionsClient }: RequestAuthConfig): RequestAuth {
	/**
	 * `getUser()` valida o JWT contra o servidor Supabase — é um round-trip de rede,
	 * e num único SSR ele é chamado várias vezes: a sessão no `__root` mais o gate de
	 * cada server function filha. Sem cache, cada chamada paga a rede de novo e soma
	 * um GoTrue inteiro ao TTFB de toda navegação protegida.
	 *
	 * Chaveado pelo objeto `Request` (estável dentro de um request pelo
	 * AsyncLocalStorage do Start; instância nova a cada request HTTP). O WeakMap solta
	 * a entrada quando o request é coletado. Guarda a PROMISE e não o valor resolvido,
	 * para que duas chamadas concorrentes dividam um round-trip só.
	 */
	const userByRequest = new WeakMap<Request, Promise<User | null>>()

	const getRequestUser = (): Promise<User | null> => {
		// Sem `.catch`, de propósito. `getUser()` devolve `{ user: null }` para JWT
		// ausente ou expirado — isso já é "sem sessão". Rejeição aqui significa que o
		// GoTrue não respondeu, e engolir isso num `null` deslogaria a base inteira
		// durante uma indisponibilidade em vez de falhar. Falha de infra propaga.
		const resolve = () =>
			getAuthClient()
				.auth.getUser()
				.then(({ data }) => data.user ?? null)

		const request = getRequest()
		// Fora de um contexto de request (improvável numa server fn) segue sem cache,
		// em vez de devolver `null` — devolver null aqui inventaria um logout.
		if (!request) return resolve()

		let cached = userByRequest.get(request)
		if (!cached) {
			cached = resolve()
			userByRequest.set(request, cached)
		}
		return cached
	}

	const requireUser = async (): Promise<User> => {
		const user = await getRequestUser()
		if (!user) unauthorized()
		return user
	}

	const requireUserId = async (): Promise<string> => (await requireUser()).id

	const requireAuth = async (): Promise<UserContext> => {
		if (!getPermissionsClient) {
			throw new Error("createRequestAuth: requireAuth exige `getPermissionsClient`.")
		}
		const user = await requireUser()
		const permissions = await resolveUserPermissions(user.id, getPermissionsClient())
		return { userId: user.id, permissions }
	}

	const requireLevel = async (module: AppModule, minLevel: MinLevel = 1, scope?: PermissionScope): Promise<UserContext> => {
		const ctx = await requireAuth()
		try {
			requirePermission(ctx, module, minLevel, scope)
		} catch (error) {
			if (error instanceof PermissionDeniedError) forbidden(`FORBIDDEN: ${module}`)
			throw error
		}
		return ctx
	}

	return { getRequestUser, requireUser, requireUserId, requireAuth, requireLevel }
}
