import { useRouteContext } from "@tanstack/react-router";
import { Route as RootRoute } from "@/routes/__root"; // Importe a rota raiz

export function useAuth() {
	// Pega o contexto tipado da rota raiz
	const context = useRouteContext({ from: RootRoute.id });
	return context.auth;
}
