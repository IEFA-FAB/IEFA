import { LegalFooterLinks } from "@iefa/legal-kit/react"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { Toaster } from "@/components/ui/sonner"
// A folha entra pelo grafo de módulos, não por `?url`: assim quem emite o
// <link> é o manifesto do build do cliente — o mesmo `/assets/styles.css` que o
// nitro serve e que o routeRules trata como no-cache. Com `?url` o bundle do
// SERVIDOR emitia um SEGUNDO nome, hasheado, e bastava divergir do nome do
// cliente para o HTML pedir um CSS que não existe no público: era o 404 que a
// suíte servia em cinco apps (e o download duplicado da folha no sisub).
import "@/styles.css"

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
		links: [{ rel: "icon", href: "/favicon.svg" }],
	}),
	shellComponent: RootDocument,
})

function RootDocument() {
	return (
		<html lang="pt-BR">
			<head>
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
