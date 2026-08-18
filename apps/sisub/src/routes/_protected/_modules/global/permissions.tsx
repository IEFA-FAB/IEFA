import { createFileRoute, redirect } from "@tanstack/react-router"

// Movida para /admin/permissions (módulo de administração do sistema). Mantido como
// redirect para não quebrar bookmarks/links antigos de /global/permissions.
export const Route = createFileRoute("/_protected/_modules/global/permissions")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/permissions", replace: true })
	},
})
