// src/routes/__root.tsx

import { TanStackDevtools } from "@tanstack/react-devtools"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import type { QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { useEffect } from "react"
import { type AuthContextType, type AuthState, authQueryOptions } from "@/auth/service"
import { CommandPaletteProvider } from "@/components/command-palette/CommandPaletteProvider"
import { DatabaseStatusBanner } from "@/components/DatabaseStatusBanner"
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary"
import { NotFound } from "@/components/NotFound"
import { ThemeProvider, ThemeScript } from "@/components/themeService"
import { Toaster } from "@/components/ui/sonner"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"
import { supabase } from "@/lib/supabase"
import AppStyles from "@/styles.css?url"

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
			// Return unauthenticated state on failure
			return { auth: { user: null, isAuthenticated: false } }
		}
	},
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const ogImage = `${baseUrl}/og-image.png`
		const description = "Portal do Instituto de Economia, Finanças e Administração da Aeronáutica — capacitar, pesquisar, inovar."
		const title = "Portal IEFA"
		return {
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ title },
				{ name: "description", content: description },
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: "Portal IEFA" },
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
				{ rel: "preload", href: AppStyles, as: "style" },
				{ rel: "stylesheet", href: AppStyles },
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
				{
					rel: "preload",
					href: "/fonts/Lora-Variable.ttf",
					as: "font",
					type: "font/ttf",
					crossOrigin: "anonymous",
				},
				{
					rel: "preload",
					href: "/fonts/IBMPlexSans-Variable.ttf",
					as: "font",
					type: "font/ttf",
					crossOrigin: "anonymous",
				},
			],
		}
	},
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
})

// Registers the Supabase auth listener exactly once per browser session.
// Lives in a React component so useEffect guarantees cleanup on unmount —
// preventing the listener from accumulating on the module-level singleton
// across SSR requests (which was causing the OOM crash in production).
function AuthSync() {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (event, session) => {
			// INITIAL_SESSION fires on page load/reload (Supabase v2.63+).
			// SIGNED_IN fires only on actual new sign-ins.
			if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
				// Authentic path: never trust session.user — it comes from the
				// storage medium (cookies) and is not server-verified. Invalidate the
				// auth query so it refetches getServerSessionFn() → supabase.auth.getUser(),
				// which validates the token against the Supabase Auth server.
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
	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<link rel="preload" href={AppStyles} as="style" />
				<link rel="stylesheet" href={AppStyles} />
				<link rel="preload" href="/fonts/Lora-Variable.ttf" as="font" type="font/truetype" crossOrigin="anonymous" />
				<link rel="preload" href="/fonts/IBMPlexSans-Variable.ttf" as="font" type="font/truetype" crossOrigin="anonymous" />
				<HeadContent />
				<ThemeScript />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<div
					suppressHydrationWarning
					className={`fixed top-0 left-0 h-1 bg-primary z-50 transition-all duration-300 ease-out ${isLoading ? "w-full opacity-100" : "w-0 opacity-0"}`}
				/>
				<DatabaseStatusBanner className="fixed inset-x-0 top-1" />
				<HotkeysProvider defaultOptions={{ hotkey: { preventDefault: true, stopPropagation: true } }}>
					<ThemeProvider>
						<CommandPaletteProvider>
							<Outlet />
							<Toaster />
						</CommandPaletteProvider>
					</ThemeProvider>
				</HotkeysProvider>
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
