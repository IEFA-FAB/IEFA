import { LEGAL_DOC_PATHS } from "@iefa/legal-kit"
import type { UserPermission } from "@iefa/pbac"
import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, redirect, Scripts } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { useEffect } from "react"
import { Toaster } from "sonner"
import { hasPermission, mySucontPermissionsQueryOptions } from "#/auth/pbac"
import { type AuthState, type authActions, authQueryOptions } from "#/auth/service"
import { supabase } from "#/lib/supabase"
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools"
import appCss from "../styles.css?url"

interface MyRouterContext {
	queryClient: QueryClient
	auth: AuthState
	authActions: typeof authActions
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

export const Route = createRootRouteWithContext<MyRouterContext>()({
	beforeLoad: async ({ context, location }) => {
		const emptyAuth: AuthState = { user: null, session: null, isAuthenticated: false, isLoading: false }

		// /health não depende de Supabase/sessão — curto-circuito antes de qualquer auth.
		if (location.pathname === "/health") return { auth: emptyAuth }

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
			return { auth }
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

		return { auth }
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
	return (
		<html lang="pt-BR">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Toaster richColors position="top-right" />
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
