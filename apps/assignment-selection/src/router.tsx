import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import * as TanstackQuery from "./integrations/tanstack-query/root-provider"
import { routeTree } from "./routeTree.gen"

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

	return router
}
