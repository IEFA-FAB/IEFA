import { createFileRoute, redirect } from "@tanstack/react-router"

// Movida para /admin/sync-routines (módulo de administração do sistema). Mantido como
// redirect para não quebrar bookmarks/links antigos de /global/sync-routines.
export const Route = createFileRoute("/_protected/_modules/global/sync-routines")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/sync-routines", replace: true })
	},
})
