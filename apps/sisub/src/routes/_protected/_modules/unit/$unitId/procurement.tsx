import { createFileRoute, Outlet } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"

/**
 * Layout transparente para o módulo de ATAs da unidade.
 * Todas as sub-rotas (index, new, $ataId) são renderizadas via Outlet.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/procurement")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: () => <Outlet />,
})
