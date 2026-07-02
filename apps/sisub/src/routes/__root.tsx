// src/routes/__root.tsx

import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { useEffect } from "react"
import { type AuthState, authQueryOptions } from "@/auth/service"
import { DatabaseStatusBanner } from "@/components/DatabaseStatusBanner"
import { DefaultCatchBoundary } from "@/components/layout/errors/DefaultCatchBoundary"
import { NotFound } from "@/components/layout/errors/NotFound"
import { Toaster } from "@/components/ui/sonner"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"
import { cn } from "@/lib/cn"
import supabase from "@/lib/supabase"
import { ThemeProvider, ThemeScript } from "@/services/themeService"
import AppStyles from "@/styles.css?url"
import type { AuthContextType } from "@/types/domain/auth"

export interface MyRouterContext {
	queryClient: QueryClient
	auth: AuthState
	authActions: Omit<AuthContextType, keyof AuthState>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	// Pre-load auth state for all routes
	beforeLoad: async ({ context }) => {
		try {
			const authState = await context.queryClient.ensureQueryData(authQueryOptions())
			return { auth: authState }
		} catch (_error) {
			// Return unauthenticated state on failure
			return {
				auth: {
					user: null,
					session: null,
					isAuthenticated: false,
					isLoading: false,
				},
			}
		}
	},
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const ogImage = `${baseUrl}/og-image.png`
		const description = "Sistema de Subsistência — planejamento de menus, receitas e analytics para a FAB."
		const title = "Previsão SISUB"
		return {
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title },
				{ name: "description", content: description },
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: "SISUB" },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: baseUrl },
				{ property: "og:image", content: ogImage },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:url", content: baseUrl },
				{ name: "twitter:image", content: ogImage },
			],
			favicon: "/favicon.svg",
			links: [
				{
					rel: "icon",
					type: "image/svg+xml",
					sizes: "any",
					href: "/favicon.svg",
				},
				{
					rel: "manifest",
					href: "/manifest.json",
				},
				{ rel: "icon", href: "/favicon.svg" },
			],
		}
	},
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
})

function RootDocument() {
	const isLoading = useRouterState({ select: (s) => s.isLoading })
	const router = useRouter()

	// Safety net: Supabase may land password-recovery links on the Site URL root
	// (instead of the requested redirectTo) when the path isn't honored by the
	// Redirect URLs allow-list. Forward to the reset form for both auth flows.
	useEffect(() => {
		if (typeof window === "undefined") return

		// PKCE flow: the link resolves to the root with a `?code=` query. Forward to
		// the reset form with the code intact (full reload) so that page's Supabase
		// client exchanges it. No OAuth/code login exists here, so `?code=` is always
		// a recovery code; email confirmation uses `token_hash` instead.
		if (!window.location.pathname.startsWith("/auth")) {
			const params = new URLSearchParams(window.location.search)
			if (params.has("code")) {
				window.location.replace(`/auth/reset-password${window.location.search}`)
				return
			}
		}

		// Implicit/hash flow: Supabase fires PASSWORD_RECOVERY after parsing the
		// token from the URL hash. Route to the reset form from wherever it landed.
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event) => {
			if (event !== "PASSWORD_RECOVERY") return
			if (window.location.pathname.startsWith("/auth/reset-password")) return
			router.navigate({ to: "/auth/reset-password", replace: true })
		})
		return () => subscription.unsubscribe()
	}, [router])

	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<link rel="preload" href={AppStyles} as="style" />
				<link rel="stylesheet" href={AppStyles} />
				<link rel="preload" href="/fonts/Manrope-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
				<link rel="preload" href="/fonts/JetBrainsMono-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />

				<HeadContent />
				<ThemeScript />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<div
					suppressHydrationWarning
					className={cn("fixed top-0 left-0 h-1 bg-primary z-50 transition-all duration-300 ease-out", isLoading ? "w-full opacity-100" : "w-0 opacity-0")}
				/>
				<DatabaseStatusBanner className="fixed inset-x-0 top-1" />
				<ThemeProvider>
					<Outlet />
					<Toaster position="bottom-center" richColors expand className="z-2147483647" />
				</ThemeProvider>
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
