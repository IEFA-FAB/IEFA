// src/routes/__root.tsx

import { TanStackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import XyflowStyles from "@xyflow/react/dist/style.css?url"
import { type AuthState, authQueryOptions } from "@/auth/service"
import { DefaultCatchBoundary } from "@/components/layout/errors/DefaultCatchBoundary"
import { NotFound } from "@/components/layout/errors/NotFound"
import { Toaster } from "@/components/ui/sonner"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"
import { cn } from "@/lib/cn"
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

	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<link rel="preload" href={AppStyles} as="style" />
				<link rel="preload" href={XyflowStyles} as="style" />
				<link rel="stylesheet" href={AppStyles} />
				<link rel="stylesheet" href={XyflowStyles} />
				<link rel="preload" href="/fonts/Manrope-Variable.ttf" as="font" crossOrigin="anonymous" />
				<link rel="preload" href="/fonts/JetBrainsMono-Variable.ttf" as="font" crossOrigin="anonymous" />

				<HeadContent />
				<ThemeScript />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<div
					suppressHydrationWarning
					className={cn("fixed top-0 left-0 h-1 bg-primary z-50 transition-all duration-300 ease-out", isLoading ? "w-full opacity-100" : "w-0 opacity-0")}
				/>
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
