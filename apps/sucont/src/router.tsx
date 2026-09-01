import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { type AuthState, authActions } from "./auth/service"
import { getContext } from "./integrations/tanstack-query/root-provider"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
	const context = getContext()

	const initialAuth: AuthState = {
		user: null,
		session: null,
		isLoading: false,
		isAuthenticated: false,
	}

	const router = createTanStackRouter({
		routeTree,
		context: {
			...context,
			auth: initialAuth,
			authActions,
			// Valor inicial só para satisfazer o contexto na criação do router; o
			// `beforeLoad` da raiz sobrescreve com o que está no cookie antes de
			// qualquer render.
			sidebarOpen: true,
		},
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	})

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

	return router
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
