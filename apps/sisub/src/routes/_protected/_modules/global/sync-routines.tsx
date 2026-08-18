import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"

// Movida para /admin/sync-routines (módulo de administração do sistema). Mantido como
// redirect para não quebrar bookmarks/links antigos de /global/sync-routines — inclusive
// o parâmetro `tab`, que a rota antiga validava e é encaminhado para não cair no default.
export const Route = createFileRoute("/_protected/_modules/global/sync-routines")({
	validateSearch: z.object({ tab: z.enum(["compras", "nutrition"]).optional() }),
	beforeLoad: ({ search }) => {
		throw redirect({ to: "/admin/sync-routines", search, replace: true })
	},
})
