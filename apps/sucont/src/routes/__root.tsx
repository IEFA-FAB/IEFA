import { LEGAL_DOC_PATHS } from "@iefa/legal-kit"
import type { UserPermission } from "@iefa/pbac"
import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, redirect, Scripts } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { createIsomorphicFn } from "@tanstack/react-start"
import { useEffect } from "react"
import { z } from "zod"
import { hasPermission, mySucontPermissionsQueryOptions } from "#/auth/pbac"
import { type AuthState, type authActions, authQueryOptions } from "#/auth/service"
import { Toaster } from "#/components/ui/toast"
import { supabase } from "#/lib/supabase"
import { ThemeProvider } from "#/services/theme"
import { readThemePreference } from "#/services/theme-preference"
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools"
import appCss from "../styles.css?url"

interface MyRouterContext {
	queryClient: QueryClient
	auth: AuthState
	authActions: typeof authActions
	/** Barra lateral aberta? Vem do cookie, resolvido antes do primeiro render. */
	sidebarOpen: boolean
}

function isAuthPath(pathname: string): boolean {
	return pathname === "/auth" || pathname.startsWith("/auth/")
}

/**
 * Rotas isentas do guard: tela de login, health check do ALB e os documentos legais.
 *
 * Os documentos precisam estar aqui explicitamente. Sem isso o `beforeLoad` abaixo
 * redireciona todo visitante anônimo para `/auth` — e uma política de privacidade
 * que exige login para ser lida não informa ninguém. O redirect também atingiria o
 * usuário autenticado sem acesso ao módulo `sucont`, que cai no mesmo ramo.
 */
const LEGAL_PATHS = new Set<string>(Object.values(LEGAL_DOC_PATHS["pt-BR"]))

function isPublicPath(pathname: string): boolean {
	return isAuthPath(pathname) || pathname === "/health" || LEGAL_PATHS.has(pathname)
}

/**
 * Busca, etapa e questão do RAC vivem na URL, não em memória: link de filtro é
 * compartilhável e sobrevive ao F5. Declarados na raiz porque o HubLayout — que
 * lê e escreve os três — é montado por nove rotas diferentes.
 *
 * `z.coerce` porque o roteador entrega `?q=35` como NÚMERO; um `z.string()` puro
 * derrubaria a rota inteira em qualquer busca que só tenha dígitos. O `.catch`
 * em cada campo garante que um valor inválido vindo de link velho degrade para
 * "sem filtro" em vez de derrubar a rota.
 */
const hubSearchSchema = z.object({
	q: z.coerce.string().optional().catch(undefined),
	/** Etapa do ciclo de conformidade. Substituiu `cat`, que classificava a ferramenta pela tecnologia. */
	etapa: z.enum(["analisar", "comunicar", "acompanhar", "consultar"]).optional().catch(undefined),
	/** Questão do RAC (5–43). O escopo do trabalho, no mesmo papel que `kitchen`/`unit` têm no sisub. */
	rac: z.coerce.number().int().min(1).max(99).optional().catch(undefined),
})

const SIDEBAR_COOKIE_NAME = "sidebar_state"

function parseCookies(cookieStr: string): Record<string, string> {
	return Object.fromEntries(
		cookieStr.split(";").map((c) => {
			const [name, ...v] = c.trim().split("=")
			return [name.trim(), v.join("=")]
		})
	)
}

/**
 * Estado da barra lateral, lido antes de renderizar — mesmo padrão do sisub.
 *
 * No servidor sai do header `cookie`; no cliente, de `document.cookie`, para não
 * gastar um RPC em navegação interna. O import do `/server` é dinâmico para não
 * vazar no bundle do browser.
 *
 * Sem isto o SSR emite a sidebar aberta e a hidratação a fecha: um salto de 16rem
 * na primeira pintura, toda vez que o usuário que a deixou fechada abre o app.
 */
const getSidebarState = createIsomorphicFn()
	.server(async () => {
		const { getRequest } = await import("@tanstack/react-start/server")
		const cookieHeader = getRequest()?.headers.get("cookie") ?? ""
		const raw = parseCookies(cookieHeader)[SIDEBAR_COOKIE_NAME]
		return raw === undefined ? true : raw === "true"
	})
	.client(() => {
		const raw = parseCookies(document.cookie)[SIDEBAR_COOKIE_NAME]
		return raw === undefined ? true : raw === "true"
	})

export const Route = createRootRouteWithContext<MyRouterContext>()({
	validateSearch: hubSearchSchema,
	beforeLoad: async ({ context, location }) => {
		const emptyAuth: AuthState = { user: null, session: null, isAuthenticated: false, isLoading: false }

		// /health não depende de Supabase/sessão — curto-circuito antes de qualquer auth.
		if (location.pathname === "/health") return { auth: emptyAuth, sidebarOpen: true }

		const sidebarOpen = await getSidebarState()

		const onPublicRoute = isPublicPath(location.pathname)

		let auth: AuthState
		try {
			auth = await context.queryClient.ensureQueryData(authQueryOptions())
		} catch {
			auth = emptyAuth
		}

		// Não autenticado → só rotas públicas (login) são acessíveis.
		if (!auth.isAuthenticated) {
			if (!onPublicRoute) throw redirect({ to: "/auth", search: { redirect: location.href } })
			return { auth, sidebarOpen }
		}

		// Autenticado → exige grant `sucont` nível 1 para entrar no hub.
		let permissions: UserPermission[] = []
		try {
			permissions = await context.queryClient.ensureQueryData(mySucontPermissionsQueryOptions())
		} catch {
			permissions = []
		}
		const canAccess = hasPermission(permissions, "sucont", 1)
		if (!canAccess && !onPublicRoute) throw redirect({ to: "/auth", search: { denied: "1" } })

		return { auth, sidebarOpen }
	},
	head: () => ({
		meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "SUCONT-4 HUB" }],
		// Ícone e manifesto no mesmo formato dos demais apps do monorepo: um único
		// favicon.svg (o mesmo arquivo em portal/sisub/rumaer/forms/docs/api).
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", sizes: "any", href: "/favicon.svg" },
			{ rel: "manifest", href: "/manifest.json" },
			{ rel: "icon", href: "/favicon.svg" },
		],
	}),
	shellComponent: RootDocument,
})

// Registra o listener de auth do Supabase uma vez por sessão de browser: quando o
// estado muda (login/logout), invalida a auth query (refetch server-side via
// getServerSessionFn → getUser) e re-executa os guards de rota.
function AuthSync() {
	const queryClient = useQueryClient()
	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
				queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
				queryClient.invalidateQueries({ queryKey: mySucontPermissionsQueryOptions().queryKey })
			}
			if (event === "SIGNED_OUT") {
				queryClient.setQueryData(authQueryOptions().queryKey, { user: null, session: null, isAuthenticated: false, isLoading: false })
				queryClient.removeQueries({ queryKey: mySucontPermissionsQueryOptions().queryKey })
			}
		})
		return () => subscription.unsubscribe()
	}, [queryClient])
	return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
	// Isomórfico: no servidor sai do header `cookie`, no cliente de
	// `document.cookie`. Mesmo valor dos dois lados, então o `<html>` hidrata sem
	// divergir e o tema certo já está na PRIMEIRA pintura — sem script inline,
	// que é o que fazia o React 19 descartar a árvore no portal (#418).
	//
	// Sem cookie a escolha é o tema claro, escrito explicitamente. O sisub segue a
	// preferência do SO, mas isso exige repetir o bloco inteiro de tokens escuros
	// dentro de uma `@media`: duas fontes para a mesma decisão, livres para
	// divergir sem ninguém notar. Aqui o `.dark` do `styles.css` continua sendo a
	// única.
	const theme = readThemePreference() ?? "light"

	return (
		<html lang="pt-BR" className={theme} style={{ colorScheme: theme }} suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
				<Toaster position="top-right" />
				<AuthSync />
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }, TanStackQueryDevtools]}
				/>
				<Scripts />
			</body>
		</html>
	)
}
