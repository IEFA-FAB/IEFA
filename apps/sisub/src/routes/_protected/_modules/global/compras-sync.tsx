import { createFileRoute, redirect } from "@tanstack/react-router"

// Consolidada em /admin/sync-routines (aba "compras"). Mantido como redirect
// para não quebrar bookmarks/links antigos.
export const Route = createFileRoute("/_protected/_modules/global/compras-sync")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/sync-routines", search: { tab: "compras" }, replace: true })
	},
})
