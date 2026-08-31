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
const rootRoute = createRootRoute({
	validateSearch: z.object({
		q: z.coerce.string().optional().catch(undefined),
		etapa: z.string().optional().catch(undefined),
		rac: z.coerce.number().int().optional().catch(undefined),
	}),
})
const screen = (path: string) => createRoute({ getParentRoute: () => rootRoute, path, component: Catalogo })
const router = createRouter({
	routeTree: rootRoute.addChildren([screen("/"), screen("/workspace"), screen("/reports")]),
	history: createMemoryHistory({ initialEntries: ["/"] }),
})

const el = document.getElementById("root")
if (!el) throw new Error("harness: #root ausente")
createRoot(el).render(
	<QueryClientProvider client={queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>
)
