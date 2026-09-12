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
import { type AssuranceRequirement, assertAssurance, NO_ASSURANCE } from "./assurance.ts"
import { AssuranceRequiredError, PermissionDeniedError } from "./errors.ts"
import { type MinLevel, requireAnyPermission, requirePermission } from "./guards.ts"
import { type AssuranceClaims, decodeJwtPayload, NO_ASSURANCE_CLAIMS, readAssuranceClaims, readSubject } from "./jwt-claims.ts"
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

/**
 * Sinaliza 403 e relança a negativa de GARANTIA preservando `code`/`nextStep`/`reason`.
 *
 * Mesmo motivo de `unauthorized()`/`forbidden()`: sem `setResponseStatus` antes do `throw`, o
 * TanStack Start devolve 500 e o cliente não distingue "prove quem você é" de "o servidor
 * quebrou". O status é 403 e não 401 de propósito — a sessão é válida; o que falta é grau de
 * garantia, e um 401 faria o interceptador de sessão expirada deslogar quem só precisava
 * digitar 6 dígitos.
 *
 * O erro é relançado INTEIRO (e não convertido em `Error` de mensagem solta) porque é o
 * `nextStep` que diz à UI qual das três telas abrir. Perder esse campo aqui transformaria a
 * negativa em "acesso negado" — a leitura errada, numa operação que a pessoa pode fazer.
 */
export function assuranceRequired(error: AssuranceRequiredError): never {
	setResponseStatus(403)
	throw error
}

/** Cliente Supabase capaz de validar o JWT do cookie da sessão. */
interface AuthCapableClient {
	auth: {
		getUser(): Promise<{ data: { user: User | null } }>
		/**
		 * Sessão do cookie — usada SÓ para alcançar o `access_token` que `getUser()` acabou de
		 * validar, e nunca para decidir quem é o usuário (a tipagem do próprio supabase-js avisa
		 * que os valores vindos de cookie não são autênticos).
		 *
		 * Opcional porque um client que não a implemente ainda é um client de auth válido: sem
		 * ela o contexto fica em `aal: 1`, que é a falha FECHADA.
		 */
		getSession?(): Promise<{ data: { session: { access_token?: string | null } | null } }>
	}
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
	/**
	 * Mensagens dos erros lançados pelos gates.
	 *
	 * Existe porque elas CHEGAM AO USUÁRIO: vários apps renderizam `err.message`
	 * direto na tela. O default em inglês serve a quem trata o erro por código; app
	 * com UI em português passa as suas aqui, em vez de redefinir os gates só para
	 * trocar uma string.
	 */
	messages?: { unauthorized?: string; forbidden?: (module: string) => string }
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
	/**
	 * `requireAuth` + gate de módulo/nível, traduzindo a negativa em 403.
	 *
	 * `assurance` é o piso de garantia de identidade da operação, avaliado DEPOIS do gate de
	 * módulo/nível. Opcional e `{ require: "none" }` por default: quem não passa nada tem
	 * exatamente o comportamento anterior a esta mudança. É o parâmetro por onde os apps que
	 * usam estes gates (portal, rumaer, sucont, forms) ligam o piso sem reescrever o guard.
	 */
	requireLevel: (module: AppModule, minLevel?: MinLevel, scope?: PermissionScope, assurance?: AssuranceRequirement) => Promise<UserContext>
	/**
	 * `requireLevel` que passa se QUALQUER um dos módulos conceder o nível.
	 *
	 * Para o recurso compartilhado por vários módulos do mesmo app: no sucont, a área
	 * de trabalho e os relatórios são da seção inteira, e exigi-los de uma divisão
	 * específica trancaria fora quem trabalha nas outras.
	 */
	requireAnyLevel: (modules: readonly AppModule[], minLevel?: MinLevel, scope?: PermissionScope, assurance?: AssuranceRequirement) => Promise<UserContext>
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
 * export const requireSucontEditor = () => auth.requireLevel("sucont-4", 2)
 * ```
 */
/** Avalia o piso de garantia e, na negativa, sinaliza o status HTTP antes de relançar. */
function assertAssuranceOrFail(ctx: UserContext, assurance: AssuranceRequirement): void {
	try {
		assertAssurance(ctx, assurance)
	} catch (error) {
		if (error instanceof AssuranceRequiredError) assuranceRequired(error)
		throw error
	}
}

export function createRequestAuth({ getAuthClient, getPermissionsClient, messages }: RequestAuthConfig): RequestAuth {
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
		if (!user) unauthorized(messages?.unauthorized)
		return user
	}

	const requireUserId = async (): Promise<string> => (await requireUser()).id

	/**
	 * Cache por request das claims de garantia — mesma razão do cache de `getUser()`: uma
	 * navegação protegida chama `requireAuth()` várias vezes, e decodificar o mesmo token a
	 * cada uma seria trabalho repetido dentro do caminho crítico do TTFB.
	 */
	const assuranceByRequest = new WeakMap<Request, Promise<AssuranceClaims>>()

	/**
	 * Lê `aal` e `lastFactorAt` do access token da sessão.
	 *
	 * A ordem é o contrato: `user` chega aqui JÁ validado por `getUser()`, e o token lido de
	 * `getSession()` é o mesmo que acabou de ser provado autêntico (a conferência do `sub`
	 * abaixo é a rede que garante isso). Decodificação local, sem verificar assinatura, porque
	 * o projeto assina com segredo simétrico e `getClaims()` custaria um round-trip por
	 * chamada — ver `jwt-claims.ts`.
	 *
	 * Todo caminho de falha devolve AAL1: sem `getSession`, sem sessão, token malformado ou
	 * `sub` divergente. Nunca uma exceção — indisponibilidade de leitura de claim não pode
	 * derrubar um request que a autenticação já aprovou; ela só rebaixa a garantia.
	 */
	const resolveAssuranceClaims = async (user: User): Promise<AssuranceClaims> => {
		const client = getAuthClient()
		if (!client.auth.getSession) return { ...NO_ASSURANCE_CLAIMS }

		const { data } = await client.auth.getSession().catch(() => ({ data: { session: null } }))
		const payload = decodeJwtPayload(data.session?.access_token)
		// `sub` diferente = o cookie mudou entre as duas leituras (troca de conta numa aba
		// paralela). Ler a garantia de OUTRA sessão seria atribuir a elevação de um usuário a
		// outro — o pior defeito possível neste eixo.
		if (readSubject(payload) !== user.id) return { ...NO_ASSURANCE_CLAIMS }
		return readAssuranceClaims(payload)
	}

	const getAssuranceClaims = (user: User): Promise<AssuranceClaims> => {
		const request = getRequest()
		if (!request) return resolveAssuranceClaims(user)

		let cached = assuranceByRequest.get(request)
		if (!cached) {
			cached = resolveAssuranceClaims(user)
			assuranceByRequest.set(request, cached)
		}
		return cached
	}

	const requireAuth = async (): Promise<UserContext> => {
		if (!getPermissionsClient) {
			throw new Error("createRequestAuth: requireAuth exige `getPermissionsClient`.")
		}
		const user = await requireUser()
		const [permissions, claims] = await Promise.all([resolveUserPermissions(user.id, getPermissionsClient()), getAssuranceClaims(user)])
		return {
			userId: user.id,
			permissions,
			aal: claims.aal,
			lastFactorAt: claims.lastFactorAt,
			// Este caminho é sempre sessão de navegador: quem entra por chave de API não passa
			// pelo TanStack Start (é o `sisub-mcp`, processo Bun sem router).
			origin: "session",
			// `user.factors` já vem do `getUser()` que acabou de ser pago — nenhuma consulta a
			// `auth.mfa_factors` é necessária, e `auth` nem está exposto ao PostgREST. Só conta
			// fator VERIFICADO: um cadastro iniciado e abandonado fica `unverified` e não
			// autentica nada, então tratá-lo como fator mandaria a pessoa para o desafio de um
			// fator que ela não tem.
			hasVerifiedFactor: (user.factors ?? []).some((factor) => factor.status === "verified"),
		}
	}

	const requireLevel = async (
		module: AppModule,
		minLevel: MinLevel = 1,
		scope?: PermissionScope,
		assurance: AssuranceRequirement = NO_ASSURANCE
	): Promise<UserContext> => {
		const ctx = await requireAuth()
		try {
			requirePermission(ctx, module, minLevel, scope)
		} catch (error) {
			if (error instanceof PermissionDeniedError) forbidden(messages?.forbidden?.(module) ?? `FORBIDDEN: ${module}`)
			throw error
		}
		// DEPOIS do gate de módulo/nível, de propósito: quem não tem a permissão recebe
		// negativa de permissão, e não um pedido de segundo fator para uma tela que ele não
		// alcançaria de qualquer jeito.
		assertAssuranceOrFail(ctx, assurance)
		return ctx
	}

	const requireAnyLevel = async (
		modules: readonly AppModule[],
		minLevel: MinLevel = 1,
		scope?: PermissionScope,
		assurance: AssuranceRequirement = NO_ASSURANCE
	): Promise<UserContext> => {
		const ctx = await requireAuth()
		try {
			requireAnyPermission(ctx, modules, minLevel, scope)
		} catch (error) {
			if (error instanceof PermissionDeniedError) forbidden(messages?.forbidden?.(modules.join(" | ")) ?? `FORBIDDEN: ${modules.join(" | ")}`)
			throw error
		}
		assertAssuranceOrFail(ctx, assurance)
		return ctx
	}

	return { getRequestUser, requireUser, requireUserId, requireAuth, requireLevel, requireAnyLevel }
}
