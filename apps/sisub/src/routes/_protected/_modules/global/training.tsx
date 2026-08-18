import { createFileRoute, redirect } from "@tanstack/react-router"

// Movida para /admin/training (módulo de administração do sistema). Mantido como
// redirect para não quebrar bookmarks/links antigos de /global/training.
export const Route = createFileRoute("/_protected/_modules/global/training")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/training", replace: true })
	},
})
