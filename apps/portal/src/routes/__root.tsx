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
	head: () => ({
		meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Portal IEFA" }],
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
	}),
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
})

// Registers the Supabase auth listener exactly once per browser session.
// Lives in a React component so useEffect guarantees cleanup on unmount —
// preventing the listener from accumulating on the module-level singleton
// across SSR requests (which was causing the OOM crash on Fly.io).
function AuthSync() {
	const router = useRouter()
	const queryClient = useQueryClient()

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (event, session) => {
			if (event === "SIGNED_IN" && session) {
				queryClient.setQueryData(authQueryOptions().queryKey, {
					user: session.user,
					session,
					isAuthenticated: true,
					isLoading: false,
				})
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
				<HotkeysProvider defaultOptions={{ hotkey: { preventDefault: true, stopPropagation: true } }}>
					<ThemeProvider>
						<CommandPaletteProvider>
							<Outlet />
							<Toaster />
						</CommandPaletteProvider>
					</ThemeProvider>
				</HotkeysProvider>
				<AuthSync />
				{import.meta.env.DEV && (
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
				)}
				<Scripts />
			</body>
		</html>
	)
}
