import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import type { ReactNode } from "react"
import { isPasswordRecovery, markPasswordRecovery } from "@/auth/recovery-session"
import { type AuthState, authActions, authQueryOptions } from "@/auth/service"
import { reportError } from "@/lib/observability/report-error"
import { recoverIfStaleChunk } from "@/lib/recover-stale-chunk"
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
		// Sink central das quebras de rota/render do TanStack — cobre tudo que
		// cai no errorComponent (loaders, render, hidratação de match).
		defaultOnCatch: (error, errorInfo) => {
			// Chunk de rota obsoleto pós-deploy que resolve para módulo vazio: o
			// lazyRouteComponent estoura TypeError ao ler o export e o TanStack
			// captura aqui (nunca chega aos listeners de window). Hard-reload busca
			// manifest novo; o guard de janela evita loop se for bug genuíno.
			if (recoverIfStaleChunk(error, "router.defaultOnCatch")) return
			reportError(error, { source: "router", ...errorInfo })
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
			if (event === "PASSWORD_RECOVERY") markPasswordRecovery()
			if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
				// Authentic path: never trust session.user — it comes from the
				// storage medium (cookies) and is not server-verified. Refetch the
				// auth query so it re-runs getServerSessionFn() → supabase.auth.getUser(),
				// which validates the token against the Supabase Auth server.
				//
				// O refetch precisa RESOLVER antes de navegar: o beforeLoad do root usa
				// query({ …, staleTime: "static" }), que devolve o cache existente mesmo stale/em voo. Navegar
				// antes faria o _protected ler `user: null` e devolver o usuário para /auth.
				// Não dá pra `await` dentro do callback do Supabase (segura o lock do auth),
				// então encadeia via .then().
				rqContext.queryClient
					.refetchQueries({ queryKey: authQueryOptions().queryKey })
					.catch(() => {})
					.then(() => {
						// When signing in from the auth page, navigate directly instead of
						// invalidating. Invalidation triggers auth/route.tsx's beforeLoad which
						// throws a redirect from the /auth/ index route — TanStack Router then
						// fails to match /auth/ as a source path, producing a spurious error.
						// Sessão de recuperação não é login concluído: o usuário está na
						// tela de nova senha e mandá-lo para /hub o deixaria dentro do app
						// com a senha antiga, sem ter trocado nada.
						if (isPasswordRecovery() || router.state.location.pathname.startsWith("/auth/reset-password")) {
							return router.invalidate()
						}
						if (router.state.location.pathname.startsWith("/auth")) {
							const redirectTo = (router.state.location.search as Record<string, string>)?.redirect || "/hub"
							return router.navigate({ to: redirectTo })
						}
						return router.invalidate()
					})
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
