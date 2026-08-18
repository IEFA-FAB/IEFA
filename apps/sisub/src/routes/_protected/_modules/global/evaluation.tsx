import { createFileRoute, redirect } from "@tanstack/react-router"

// Movida para /admin/evaluation (módulo de administração do sistema). Mantido como
// redirect para não quebrar bookmarks/links antigos de /global/evaluation.
export const Route = createFileRoute("/_protected/_modules/global/evaluation")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/evaluation", replace: true })
	},
})
