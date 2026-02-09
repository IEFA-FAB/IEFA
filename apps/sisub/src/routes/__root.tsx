// src/routes/__root.tsx

import { Toaster } from "@iefa/ui"
import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { type AuthState, authQueryOptions } from "@/auth/service"
import { DefaultCatchBoundary } from "@/components/common/errors/DefaultCatchBoundary"
import { NotFound } from "@/components/common/errors/NotFound"
import { RealtimeProvider } from "@/components/common/providers/RealtimeProvider"
import type { ThemeContextType } from "@/components/common/shared/themeService"
import { ThemeScript } from "@/components/common/shared/themeService"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"
import AppStyles from "@/styles.css?url"
import type { AuthContextType } from "@/types/domain/"

export interface MyRouterContext {
	queryClient: QueryClient
	auth: AuthState
	authActions: Omit<AuthContextType, keyof AuthState>
	theme: ThemeContextType
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
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Previsão SISUB" },
		],
		favicon: "/favicon.svg",
		links: [
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
				href: "/fonts/Manrope-Variable.ttf",
				as: "font",
				type: "font/ttf",
				crossOrigin: "anonymous",
			},
			{
				rel: "preload",
				href: "/fonts/JetBrainsMono-Variable.ttf",
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

function RootDocument() {
	const isLoading = useRouterState({ select: (s) => s.isLoading })

	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<HeadContent />
				<ThemeScript />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<div
					className={`fixed top-0 left-0 h-1 bg-primary z-50 transition-all duration-300 ease-out ${isLoading ? "w-full opacity-100" : "w-0 opacity-0"}`}
				/>
				<RealtimeProvider>
					<Outlet />
				</RealtimeProvider>
				<Toaster position="bottom-center" richColors expand className="z-2147483647" />
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
