/**
 * Harness visual da casca do hub — NÃO faz parte do app.
 *
 * A casca (barra lateral, cabeçalho, bloco da conta) e o catálogo só aparecem
 * com sessão, e o app compartilha o projeto Supabase com produção — criar
 * usuário de teste lá só para olhar um layout não é aceitável. Aqui os
 * componentes reais rodam num router de memória, com a sessão semeada no cache
 * do react-query, contra a folha de estilo real.
 *
 * Foi a ausência desta tela que deixou passar um `ReferenceError` de avaliação
 * de módulo: typecheck, build e `/health` estavam verdes e nenhum deles montava
 * a casca.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import type React from "react"
import { createRoot } from "react-dom/client"
import { z } from "zod"
import { HubLayout } from "#/components/hub-layout"
import { Route as IndexRoute } from "#/routes/index"
import "./harness.css"

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
queryClient.setQueryData(["auth", "user"], {
	user: { email: "nannijpsn@fab.mil.br", user_metadata: { name: "Nanni JPSN" } },
	session: null,
	isAuthenticated: true,
	isLoading: false,
})

const Catalogo = IndexRoute.options.component as () => React.ReactNode

// Mesmo `validateSearch` da raiz do app: os filtros do catálogo leem `?q=`,
// `?etapa=` e `?rac=`.
// Lê o mesmo cookie que a raiz do app lê no `beforeLoad`. Sem isto o harness
// entregava `sidebarOpen` indefinido, o provider caía no padrão "aberta", e um
// reload sempre voltava expandida — o harness não cobria a persistência que é
// justamente o ponto da implementação.
function sidebarOpenFromCookie(): boolean {
	const raw = Object.fromEntries(
		document.cookie.split(";").map((c) => {
			const [name, ...v] = c.trim().split("=")
			return [name.trim(), v.join("=")]
		})
	).sidebar_state
	return raw === undefined ? true : raw === "true"
}

const rootRoute = createRootRoute({
	beforeLoad: () => ({ sidebarOpen: sidebarOpenFromCookie() }),
	validateSearch: z.object({
		q: z.coerce.string().optional().catch(undefined),
		etapa: z.string().optional().catch(undefined),
		rac: z.coerce.number().int().optional().catch(undefined),
	}),
})
const screen = (path: string) => createRoute({ getParentRoute: () => rootRoute, path, component: Catalogo })

// Rotas de ferramenta, para inspecionar a orientação DENTRO de uma delas: item
// ativo na barra e trilha no cabeçalho. O conteúdo é um marcador — o que está sob
// exame é a casca, não a ferramenta.
const toolScreen = (path: string) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path,
		component: () => (
			<HubLayout>
				<p className="text-body text-muted-foreground">Conteúdo da ferramenta (marcador do harness).</p>
			</HubLayout>
		),
	})

const TOOL_PATHS = [
	"/auditor",
	"/monitoramento",
	"/documentacao",
	"/subitens-genericos",
	"/cruzamento-contas",
	"/analista-compatibilidade",
	"/conta-generica",
	"/analistasaldoalongado",
	"/sac-dgc",
]

const router = createRouter({
	routeTree: rootRoute.addChildren([screen("/"), screen("/workspace"), screen("/reports"), ...TOOL_PATHS.map(toolScreen)]),
	history: createMemoryHistory({ initialEntries: ["/"] }),
})

const el = document.getElementById("root")
if (!el) throw new Error("harness: #root ausente")
createRoot(el).render(
	<QueryClientProvider client={queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>
)
