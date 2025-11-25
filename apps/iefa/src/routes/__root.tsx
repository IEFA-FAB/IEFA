// src/routes/__root.tsx
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
import type { ThemeContextType } from "@/components/themeService";
import { ThemeScript } from "@/components/themeService";
import { Toaster } from "@iefa/ui";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import "../styles.css";

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
		links: [
			{ rel: "stylesheet", href: "../styles.css" },
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
			},
		],
	}),
	component: RootDocument,
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
