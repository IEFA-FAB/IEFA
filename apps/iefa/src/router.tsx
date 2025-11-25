import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { type AuthContextType, authActions } from "@/auth/service";

import {
	applyThemeToDom,
	getStoredTheme,
	type Theme,
	type ThemeContextType,
} from "@/components/themeService";
import { supabaseApp } from "@/lib/supabase";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	// --- AUTH SETUP ---
	const initialAuth: AuthContextType = {
		user: null,
		session: null,
		isLoading: true,
		isAuthenticated: false,
		...authActions,
	};

	// --- THEME SETUP ---
	// 1. Lê o tema inicial (síncrono)
	const initialTheme = getStoredTheme();

	// --- ROUTER CREATION ---
	const router = createRouter({
		routeTree,
		context: {
			...rqContext,
			auth: initialAuth,
			theme: {
				theme: initialTheme,
				setTheme: () => {}, // Placeholder, será sobrescrito
				toggle: () => {}, // Placeholder
			} as ThemeContextType,
		},
		defaultPreload: "intent",
		Wrap: (props: { children: React.ReactNode }) => {
			return (
				<TanstackQuery.Provider {...rqContext}>
					{props.children}
				</TanstackQuery.Provider>
			);
		},
	});

	// 2. Define as ações de tema que atualizam o Router E o DOM
	const themeActions: ThemeContextType = {
		theme: initialTheme,
		setTheme: (newTheme: Theme) => {
			applyThemeToDom(newTheme);
			// Atualiza o contexto do router para re-renderizar ícones/botões
			router.update({
				context: {
					...router.options.context,
					theme: { ...themeActions, theme: newTheme },
				},
			});
		},
		toggle: () => {
			const current = router.options.context.theme.theme;
			const next = current === "dark" ? "light" : "dark";
			themeActions.setTheme(next);
		},
	};

	// Atualiza o contexto inicial com as ações reais
	router.update({
		context: {
			...router.options.context,
			theme: themeActions,
		},
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	});

	// 3. Lógica de Autenticação (Fora do React!)
	// Função para atualizar o contexto do router
	const updateAuth = (session: any | null, isLoading = false) => {
		router.update({
			context: {
				...router.options.context, // Mantém o contexto do QueryClient e Theme
				auth: {
					...initialAuth,
					session,
					user: session?.user ?? null,
					isAuthenticated: !!session?.user,
					isLoading,
				},
			},
		});
	};

	// A. Check Inicial
	supabaseApp.auth.getSession().then(({ data: { session } }) => {
		updateAuth(session, false);
		router.invalidate(); // Força re-verificação das rotas (beforeLoad)
	});

	// B. Listener de Mudanças
	supabaseApp.auth.onAuthStateChange((_event, session) => {
		updateAuth(session, false);
		router.invalidate();

		// Opcional: Redirecionar no logout
		if (_event === "SIGNED_OUT") {
			router.navigate({ to: "/auth" });
		}
	});

	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
