import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"

// Movida para /admin/permissions (módulo de administração do sistema). Mantido como
// redirect para não quebrar bookmarks/links antigos de /global/permissions — inclusive
// o parâmetro `view`, que a rota antiga validava e é encaminhado para não cair no default.
export const Route = createFileRoute("/_protected/_modules/global/permissions")({
	validateSearch: z.object({ view: z.enum(["usuarios", "politicas"]).optional() }),
	beforeLoad: ({ search }) => {
		throw redirect({ to: "/admin/permissions", search, replace: true })
	},
})
