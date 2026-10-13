import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { useEffect } from "react"
import { markPasswordRecovery } from "@/auth/recovery-session"
import { type AuthContextType, type AuthState, authQueryOptions } from "@/auth/service"
import { DatabaseStatusBanner } from "@/components/DatabaseStatusBanner"
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary"
import { NotFound } from "@/components/NotFound"
import { readThemePreference, ThemeProvider } from "@/components/themeService"
import { Toaster } from "@/components/ui/toast"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"
import { supabase } from "@/lib/supabase"
// A folha entra pelo grafo de módulos, não por `?url`: quem emite o <link> é o manifesto do
// build do cliente, o mesmo `/assets/styles.css` que o nitro serve como no-cache.
import "@/styles.css"

export interface MyRouterContext {
	queryClient: QueryClient
	auth: AuthState
	authActions: Omit<AuthContextType, keyof AuthState>
}

const TITLE = "SISPROV — Sistema de Provisões"
const DESCRIPTION = "Sistema de Provisões da FAB: estoque de toda classe de suprimento e fardamento gratuito. Sistema de uso interno do COMAER."

export const Route = createRootRouteWithContext<MyRouterContext>()({
	beforeLoad: async ({ context }) => {
		try {
			const authState = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
			return { auth: authState }
		} catch (_error) {
			// Falha de auth não derruba a navegação: as rotas protegidas redirecionam para /auth.
			return { auth: { user: null, session: null, isAuthenticated: false, isLoading: false } satisfies AuthState }
		}
	},
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: TITLE },
			{ name: "description", content: DESCRIPTION },
			{ name: "robots", content: "noindex, nofollow" },
		],
		links: [
			{ rel: "icon", type: "image/svg+xml", sizes: "any", href: "/favicon.svg" },
			{ rel: "manifest", href: "/manifest.json" },
			{ rel: "preload", href: "/fonts/Manrope-Variable.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
		],
	}),
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
})

// Registra o listener de auth do Supabase exatamente uma vez por sessão de browser.
function AuthSync() {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "PASSWORD_RECOVERY") markPasswordRecovery()
			if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
				// Nunca confiar em session.user (vem do storage): invalida a query, que refaz
				// getServerSessionFn() → supabase.auth.getUser() no servidor.
				queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
				router.invalidate()
			}
			if (event === "SIGNED_OUT") {
				queryClient.setQueryData(authQueryOptions().queryKey, { user: null, session: null, isAuthenticated: false, isLoading: false })
				router.invalidate()
			}
		})
		return () => subscription.unsubscribe()
	}, [queryClient, router])

	return null
}

function RootDocument() {
	const isLoading = useRouterState({ select: (s) => s.isLoading })
	// Lido no render: no servidor vem do cookie da requisição, no cliente do document.cookie.
	// Mesmo valor dos dois lados, então o <html> hidrata sem divergir.
	const theme = readThemePreference()
	return (
		<html lang="pt-BR" className={theme ?? undefined} style={theme ? { colorScheme: theme } : undefined} suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<div
					suppressHydrationWarning
					className={`fixed top-0 left-0 h-1 bg-primary z-50 transition-all duration-300 ease-out ${isLoading ? "w-full opacity-100" : "w-0 opacity-0"}`}
				/>
				<DatabaseStatusBanner className="fixed inset-x-0 top-1" />
				<ThemeProvider initialTheme={theme}>
					<Outlet />
					<Toaster position="bottom-right" />
				</ThemeProvider>
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
