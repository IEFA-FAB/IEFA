// src/routes/__root.tsx

import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import XyflowStyles from "@xyflow/react/dist/style.css?url"
import { type AuthState, authQueryOptions } from "@/auth/service"
import { DefaultCatchBoundary } from "@/components/common/errors/DefaultCatchBoundary"
import { NotFound } from "@/components/common/errors/NotFound"
import { RealtimeProvider } from "@/components/common/providers/RealtimeProvider"
import { ThemeProvider, ThemeScript } from "@/components/common/shared/themeService"
import { Toaster } from "@/components/ui/sonner"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"
import { cn } from "@/lib/cn"
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
	head: () => ({
		meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Previsão SISUB" }],
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
				<link rel="preload" href={AppStyles} as="style" />
				<link rel="preload" href={XyflowStyles} as="style" />
				<link rel="stylesheet" href={AppStyles} />
				<link rel="stylesheet" href={XyflowStyles} />
				<link rel="preload" href="/fonts/Manrope-Variable.ttf" as="font" type="font/truetype" crossOrigin="anonymous" />
				<link rel="preload" href="/fonts/JetBrainsMono-Variable.ttf" as="font" type="font/truetype" crossOrigin="anonymous" />

				<HeadContent />
				<ThemeScript />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<div
					suppressHydrationWarning
					className={cn("fixed top-0 left-0 h-1 bg-primary z-50 transition-all duration-300 ease-out", isLoading ? "w-full opacity-100" : "w-0 opacity-0")}
				/>
				<ThemeProvider>
					<RealtimeProvider>
						<Outlet />
					</RealtimeProvider>
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
