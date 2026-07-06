import { createFileRoute, redirect } from "@tanstack/react-router"
import { uniformSearchSchema } from "@/lib/uniforms/search"

// A antiga tela de listagem foi absorvida pela home (`/`): chat de busca no topo,
// lista completa logo abaixo. Mantemos esta rota como redirect para não quebrar
// links/bookmarks (`/uniformes?grupo=…`) e a navegação do layout.
export const Route = createFileRoute("/_public/uniformes/")({
	validateSearch: uniformSearchSchema,
	beforeLoad: ({ search }) => {
		throw redirect({ to: "/", search })
	},
})
