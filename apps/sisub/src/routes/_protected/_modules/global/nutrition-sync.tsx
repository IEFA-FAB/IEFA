import { createFileRoute, redirect } from "@tanstack/react-router"

// Consolidada em /admin/sync-routines (aba "nutrition"). Mantido como redirect
// para não quebrar bookmarks/links antigos.
export const Route = createFileRoute("/_protected/_modules/global/nutrition-sync")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/sync-routines", search: { tab: "nutrition" }, replace: true })
	},
})
