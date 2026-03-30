import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import { type AuthState, authActions, authQueryOptions } from "@/auth/service"
import { supabase } from "@/lib/supabase"
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
		queryClient: rqContext.queryClient,
	})

	supabase.auth.onAuthStateChange(async (event, session) => {
		// Immediately update cache based on auth events
		// This ensures UI updates instantly without waiting for refetch
		if (event === "SIGNED_IN" && session) {
			rqContext.queryClient.setQueryData(authQueryOptions().queryKey, {
				user: session.user,
				session: session,
				isAuthenticated: true,
				isLoading: false,
			})
			router.invalidate()
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

	return router
}
