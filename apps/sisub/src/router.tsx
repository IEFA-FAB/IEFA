import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import { type AuthState, authActions, authQueryOptions } from "@/auth/service"
import {
	applyThemeToDom,
	getStoredTheme,
	type Theme,
	type ThemeContextType,
} from "@/components/common/shared/themeService"
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

	// No need for manual initial load - __root.tsx beforeLoad handles this

	// Auth state change listener - Updates cache immediately
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
