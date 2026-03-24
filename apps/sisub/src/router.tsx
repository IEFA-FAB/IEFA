import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import { type AuthState, authActions, authQueryOptions } from "@/auth/service"
import { applyThemeToDom, getStoredTheme, type Theme, type ThemeContextType } from "@/components/common/shared/themeService"
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

	// --- THEME SETUP ---
	const initialTheme = getStoredTheme()

	// --- ROUTER CREATION ---
	const router = createRouter({
		routeTree,
		context: {
			...rqContext,
			auth: initialAuthData,
			authActions: authActions,
			theme: {
				theme: initialTheme,
				setTheme: () => {},
				toggle: () => {},
			} as ThemeContextType,
		},
		defaultPreload: "intent",
		scrollRestoration: true,
		Wrap: (props: { children: ReactNode }) => {
			return <TanstackQuery.Provider {...rqContext}>{props.children}</TanstackQuery.Provider>
		},
	})

	const themeActions: ThemeContextType = {
		theme: initialTheme,
		setTheme: (newTheme: Theme) => {
			applyThemeToDom(newTheme)
			router.update({
				context: {
					...router.options.context,
					theme: { ...themeActions, theme: newTheme },
				},
			})
		},
		toggle: () => {
			const current = router.options.context.theme.theme
			const next = current === "dark" ? "light" : "dark"
			themeActions.setTheme(next)
		},
	}

	// Atualiza o contexto inicial com as ações reais
	router.update({
		context: {
			...router.options.context,
			theme: themeActions,
		},
	})

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	})

	// Auth state change listener — browser only.
	// Supabase v2.63+ fires INITIAL_SESSION (not SIGNED_IN) on page load,
	// so SIGNED_IN here means an actual new sign-in, not a session restore.
	if (typeof window !== "undefined") {
		supabase.auth.onAuthStateChange((event, session) => {
			if (event === "SIGNED_IN" && session) {
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
