// src/routes/__root.tsx

import { Toaster } from "@iefa/ui";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { AuthContextType } from "@/auth/service";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { NotFound } from "@/components/NotFound";
import type { ThemeContextType } from "@/components/themeService";
import { ThemeScript } from "@/components/themeService";
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools";
import AppStyles from "@/styles.css?url";

export interface MyRouterContext {
	queryClient: QueryClient;
	auth: AuthContextType;
	theme: ThemeContextType;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Portal IEFA" },
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
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
			},
		],
	}),
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
});

function RootDocument() {
	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<HeadContent />
				<ThemeScript />
			</head>
			<body className="min-h-screen bg-background text-foreground antialiased">
				<Outlet />
				<Toaster />
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
	);
}
