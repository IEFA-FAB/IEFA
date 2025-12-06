import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import type { ReactNode } from "react";
import { type AuthContextType, authActions } from "@/auth/service";
import {
	applyThemeToDom,
	getStoredTheme,
	type Theme,
	type ThemeContextType,
} from "@/components/themeService";
import supabase from "@/utils/supabase";
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
	const initialTheme = getStoredTheme();

	// --- ROUTER CREATION ---
	const router = createRouter({
		routeTree,
		context: {
			...rqContext,
			auth: initialAuth,
			theme: {
				theme: initialTheme,
				setTheme: () => {},
				toggle: () => {},
			} as ThemeContextType,
		},
		defaultPreload: "intent",
		scrollRestoration: true,
		Wrap: (props: { children: ReactNode }) => {
			return (
				<TanstackQuery.Provider {...rqContext}>
					{props.children}
				</TanstackQuery.Provider>
			);
		},
	});

	const themeActions: ThemeContextType = {
		theme: initialTheme,
		setTheme: (newTheme: Theme) => {
			applyThemeToDom(newTheme);
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

	supabase.auth.getSession().then(({ data: { session } }) => {
		updateAuth(session, false);
		router.invalidate();
	});

	supabase.auth.onAuthStateChange((_event, session) => {
		updateAuth(session, false);
		router.invalidate();
		if (_event === "SIGNED_OUT") {
			router.navigate({ to: "/auth" });
		}
	});

	return router;
};
