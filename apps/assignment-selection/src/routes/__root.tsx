import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { Toaster } from "@/components/ui/sonner"
import AppStyles from "@/styles.css?url"

export interface MyRouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Escolha de Vagas — CPAINT" },
			{ name: "description", content: "Painel de escolha de vagas (billet selection) por ordem de classificação — FAB." },
		],
		links: [
			{ rel: "preload", href: AppStyles, as: "style" },
			{ rel: "stylesheet", href: AppStyles },
			{ rel: "icon", href: "/favicon.svg" },
		],
	}),
	shellComponent: RootDocument,
})

function RootDocument() {
	return (
		<html lang="pt-BR">
			<head>
				<link rel="preload" href={AppStyles} as="style" />
				<link rel="stylesheet" href={AppStyles} />
				<HeadContent />
			</head>
			<body className="min-h-screen bg-slate-950 text-white antialiased">
				<Outlet />
				<Toaster />
				<Scripts />
			</body>
		</html>
	)
}
