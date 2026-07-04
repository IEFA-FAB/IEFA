import { createFileRoute, redirect } from "@tanstack/react-router"

// Consolidada em /global/sync-routines (aba "nutrition"). Mantido como redirect
// para não quebrar bookmarks/links antigos.
export const Route = createFileRoute("/_protected/_modules/global/nutrition-sync")({
	beforeLoad: () => {
		throw redirect({ to: "/global/sync-routines", search: { tab: "nutrition" }, replace: true })
	},
})
