import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { RootProvider } from "fumadocs-ui/provider/tanstack"
import appCss from "@/styles/app.css?url"

export const Route = createRootRoute({
	head: () => ({
		meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "IEFA Docs" }],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
		],
	}),
	component: RootComponent,
})

function RootComponent() {
	return (
		<html lang="pt-BR" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="flex flex-col min-h-screen">
				{/*
				 * Busca 100% client-side: o navegador baixa o índice Orama exportado em
				 * /api/search e consulta localmente, sem servidor. `type: "static"` é a
				 * via suportada nesta versão do fumadocs-ui — está marcada como
				 * deprecated em favor de recriar o diálogo com um client próprio, o que
				 * só compensa se precisarmos customizar a UI da busca.
				 */}
				<RootProvider search={{ options: { type: "static", api: "/api/search" } }}>
					<Outlet />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	)
}
