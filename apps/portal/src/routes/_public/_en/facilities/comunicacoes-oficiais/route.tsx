import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"

export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais")({
	staticData: {
		nav: {
			title: "Comunicações Oficiais",
			section: "Facilidades",
			subtitle: "Redigir ofício, despacho, parecer e demais espécies conforme a NSCA 5-3",
			keywords: ["oficio", "despacho", "parecer", "requerimento", "nsca", "sigadaer", "redacao oficial"],
			// Sem isto a ferramenta vaza duas vezes: o command palette a oferece a quem
			// está deslogado (`canAccessCommandItem` cai no `default: return true`) e o
			// `WebMcpTools` a exporta para `navigator.modelContext` como página pública
			// (o filtro lá é `nav.access && nav.access !== "public"`).
			access: "authenticated",
			order: 21,
		},
	},
	/**
	 * Exige sessão para a biblioteca e para o editor: os dois gravam no schema `documents`
	 * e falam com o modelo, e as duas coisas têm dono. O guard real está nas server
	 * functions — este `beforeLoad` só evita mostrar uma tela que não funcionaria.
	 */
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) throw redirect({ to: "/auth", search: { redirect: location.href } })
		return { auth }
	},
	component: Outlet,
})
