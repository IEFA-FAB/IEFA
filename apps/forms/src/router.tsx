import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import { type AuthState, authActions } from "@/auth/service"
import * as TanstackQuery from "./integrations/tanstack-query/root-provider"
import { routeTree } from "./routeTree.gen"

export const getRouter = () => {
	const rqContext = TanstackQuery.getContext()

	const initialAuthData: AuthState = {
		user: null,
		session: null,
		isLoading: false,
		isAuthenticated: false,
	}

	const router = createRouter({
		routeTree,
		context: {
			...rqContext,
			auth: initialAuthData,
			authActions: authActions,
		},
		defaultPreload: "intent",
		scrollRestoration: true,
		Wrap: (props: { children: ReactNode }) => {
			return <TanstackQuery.Provider {...rqContext}>{props.children}</TanstackQuery.Provider>
		},
	})

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient as unknown as Parameters<typeof setupRouterSsrQueryIntegration>[0]["queryClient"],
	})

	return router
}
