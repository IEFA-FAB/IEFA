import { TanStackDevtools } from "@tanstack/react-devtools"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import type { QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { useEffect } from "react"
import { type AuthContextType, type AuthState, authQueryOptions } from "@/auth/service"
import { DatabaseStatusBanner } from "@/components/DatabaseStatusBanner"
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary"
import { NotFound } from "@/components/NotFound"
import { readThemePreference, ThemeProvider } from "@/components/themeService"
import { Toaster } from "@/components/ui/toast"
import { env } from "@/env"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"
import { supabase } from "@/lib/supabase"
import { TenantProvider } from "@/lib/tenant"
// A folha entra pelo grafo de módulos, não por `?url`: assim quem emite o
// <link> é o manifesto do build do cliente — o mesmo `/assets/styles.css` que o
// nitro serve e que o routeRules trata como no-cache. Com `?url` o bundle do
// SERVIDOR emitia um SEGUNDO nome, hasheado, e bastava divergir do nome do
// cliente para o HTML pedir um CSS que não existe no público: era o 404 que a
// suíte servia em cinco apps (e o download duplicado da folha no sisub).
import "@/styles.css"

export interface MyRouterContext {
	queryClient: QueryClient
	auth: AuthState
	authActions: Omit<AuthContextType, keyof AuthState>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	beforeLoad: async ({ context }) => {
		try {
			const authState = await context.queryClient.ensureQueryData(authQueryOptions())
			return { auth: authState }
		} catch (_error) {
			return { auth: { user: null, isAuthenticated: false } }
		}
	},
	head: () => {
		const isCincoS = env.VITE_APP_TENANT === "cinco-s"
		const faviconHref = isCincoS ? "/5s/favicon.svg" : "/favicon.svg"
		const title = isCincoS ? "Programa VETOR 5S — SEFA" : "Formulários IEFA"
		return {
			meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title }],
			links: [
				{
					rel: "icon",
					type: "image/svg+xml",
					sizes: "any",
					href: faviconHref,
				},
				{
					rel: "manifest",
					href: "/manifest.json",
				},
				{ rel: "icon", href: faviconHref },
			],
		}
	},
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
})

function AuthSync() {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (event, session) => {
			if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
				// Caminho autêntico: nunca confiar em session.user — vem do storage
				// (cookies) e não é verificado pelo servidor. Invalida a auth query
				// para refetch via getServerSessionFn() → supabase.auth.getUser(),
				// que valida o token no servidor Supabase Auth.
				queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
				router.invalidate()
			}
			if (event === "SIGNED_OUT") {
				queryClient.setQueryData(authQueryOptions().queryKey, {
					user: null,
					session: null,
					isAuthenticated: false,
					isLoading: false,
				})
				router.invalidate()
			}
		})
		return () => subscription.unsubscribe()
	}, [queryClient, router])

	return null
}

function RootDocument() {
	const isLoading = useRouterState({ select: (s) => s.isLoading })
	// Lido no render: no servidor vem do cookie da requisição, no cliente do
	// document.cookie. Mesmo valor dos dois lados, então o <html> hidrata sem
	// divergir — e o tema certo já está na primeira pintura, sem script inline.
	// Sem cookie: nenhuma classe, e a media query do CSS segue o sistema.
	const theme = readThemePreference()
	return (
		<html
			lang="pt-BR"
			data-tenant={env.VITE_APP_TENANT}
			className={theme ?? undefined}
			style={theme ? { colorScheme: theme } : undefined}
			suppressHydrationWarning
		>
			<head>
				<link rel="preload" href="/fonts/Lora-Variable.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
				<link rel="preload" href="/fonts/IBMPlexSans-Variable.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
				<HeadContent />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<div
					suppressHydrationWarning
					className={`fixed top-0 left-0 h-1 bg-primary z-50 transition-all duration-300 ease-out ${isLoading ? "w-full opacity-100" : "w-0 opacity-0"}`}
				/>
				<DatabaseStatusBanner className="fixed inset-x-0 top-1" />
				<TenantProvider tenant={env.VITE_APP_TENANT}>
					<HotkeysProvider defaultOptions={{ hotkey: { preventDefault: true, stopPropagation: true } }}>
						<ThemeProvider initialTheme={theme}>
							<Outlet />
							<Toaster position="bottom-right" />
						</ThemeProvider>
					</HotkeysProvider>
				</TenantProvider>
				<AuthSync />
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	)
}
