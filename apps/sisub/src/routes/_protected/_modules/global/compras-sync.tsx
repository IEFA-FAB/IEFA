import { createFileRoute, redirect } from "@tanstack/react-router"

// Consolidada em /global/sync-routines (aba "compras"). Mantido como redirect
// para não quebrar bookmarks/links antigos.
export const Route = createFileRoute("/_protected/_modules/global/compras-sync")({
	beforeLoad: () => {
		throw redirect({ to: "/global/sync-routines", search: { tab: "compras" }, replace: true })
	},
})
