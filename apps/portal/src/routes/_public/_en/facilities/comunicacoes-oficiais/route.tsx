import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"

export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais")({
	staticData: {
		nav: {
			title: "Comunicações Oficiais",
			section: "Facilidades",
			subtitle: "Redigir ofício, despacho, parecer e demais espécies conforme a NSCA 5-3",
			keywords: ["oficio", "despacho", "parecer", "requerimento", "nsca", "sigadaer", "redacao oficial"],
			order: 21,
		},
	},
	/**
	 * Exige sessão para a biblioteca e para o editor: os dois gravam no schema `documents`
	 * e falam com o modelo, e as duas coisas têm dono. O guard real está nas server
	 * functions — este `beforeLoad` só evita mostrar uma tela que não funcionaria.
	 */
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) throw redirect({ to: "/auth" })
		return { auth }
	},
	component: Outlet,
})
