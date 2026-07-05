import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import * as TanstackQuery from "./integrations/tanstack-query/root-provider"
import { authQueryOptions } from "./lib/auth"
import { supabase } from "./lib/supabase"
import { routeTree } from "./routeTree.gen"

// Registra o listener de auth uma única vez por página, mesmo com HMR chamando
// getRouter() de novo — evita acúmulo de subscribers na lista interna do Supabase.
let authListenerBound = false

export const getRouter = () => {
	const rqContext = TanstackQuery.getContext()

	const router = createRouter({
		routeTree,
		context: {
			...rqContext,
		},
		defaultPreload: "intent",
		scrollRestoration: true,
		Wrap: (props: { children: ReactNode }) => {
			return <TanstackQuery.Provider {...rqContext}>{props.children}</TanstackQuery.Provider>
		},
	})

	setupRouterSsrQueryIntegration({
		router,
		// Cast via unknown: tsgo resolve @tanstack/query-core por dois caminhos (hoisting
		// de workspace do Bun); ambos apontam pro mesmo runtime (5.10x).
		queryClient: rqContext.queryClient as unknown as Parameters<typeof setupRouterSsrQueryIntegration>[0]["queryClient"],
	})

	// No cliente, mantém a query de auth em sincronia com os eventos do Supabase
	// (login/logout, inclusive entre abas) e revalida as rotas.
	if (typeof window !== "undefined" && !authListenerBound) {
		authListenerBound = true
		supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
				rqContext.queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
				router.invalidate()
			}
		})
	}

	return router
}
