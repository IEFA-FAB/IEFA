import { LegalFooterLinks } from "@iefa/legal-kit/react"
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

				{/*
				  O telão (`/`) exibe nome, classificação e localidade SEM autenticação, e isso
				  é correto: são dados já publicados no Boletim Ostensivo do COMAER e, em parte,
				  no DOU — o painel reproduz publicidade oficial, não cria exposição nova. Ainda
				  assim é a superfície pública onde esses dados aparecem, então os documentos
				  legais precisam ser alcançáveis daqui, e não só das telas logadas. Discreto o
				  bastante para não competir com a projeção.
				*/}
				<LegalFooterLinks
					className="fixed bottom-2 left-3 z-40 flex items-center gap-x-3"
					linkClassName="text-[10px] text-slate-600 transition-colors hover:text-slate-300"
				/>
				<Toaster />
				<Scripts />
			</body>
		</html>
	)
}
