import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import { type AuthState, authActions, authQueryOptions } from "@/auth/service"
import supabase from "@/lib/supabase"
import * as TanstackQuery from "./integrations/tanstack-query/root-provider"
import { routeTree } from "./routeTree.gen"

export const getRouter = () => {
	const rqContext = TanstackQuery.getContext()

	// --- AUTH SETUP ---
	const initialAuthData: AuthState = {
		user: null,
		session: null,
		isLoading: false,
		isAuthenticated: false,
	}

	// --- ROUTER CREATION ---
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
		// Cast through unknown: tsgo resolves @tanstack/query-core from two paths due to
		// Bun workspace hoisting; both resolve to the same runtime package (5.100.x).
		queryClient: rqContext.queryClient as unknown as Parameters<typeof setupRouterSsrQueryIntegration>[0]["queryClient"],
	})

	// Auth state change listener — browser only.
	// INITIAL_SESSION fires on page load/reload (Supabase v2.63+), restoring an
	// existing session. SIGNED_IN fires only on actual new sign-ins.
	if (typeof window !== "undefined") {
		supabase.auth.onAuthStateChange((event, session) => {
			if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
				rqContext.queryClient.setQueryData(authQueryOptions().queryKey, {
					user: session.user,
					session: session,
					isAuthenticated: true,
					isLoading: false,
				})
				// When signing in from the auth page, navigate directly instead of
				// invalidating. Invalidation triggers auth/route.tsx's beforeLoad which
				// throws a redirect from the /auth/ index route — TanStack Router then
				// fails to match /auth/ as a source path, producing a spurious error.
				if (router.state.location.pathname.startsWith("/auth")) {
					const redirectTo = (router.state.location.search as Record<string, string>)?.redirect || "/hub"
					router.navigate({ to: redirectTo })
				} else {
					router.invalidate()
				}
			}

			if (event === "SIGNED_OUT") {
				rqContext.queryClient.setQueryData(authQueryOptions().queryKey, {
					user: null,
					session: null,
					isAuthenticated: false,
					isLoading: false,
				})
				router.invalidate()
			}
		})
	}

	return router
}
