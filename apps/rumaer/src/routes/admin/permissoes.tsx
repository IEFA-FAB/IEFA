import { createFileRoute, redirect } from "@tanstack/react-router"
import { hasPermission, myRumaerPermissionsQueryOptions } from "@/auth/pbac"
import { RumaerPermissionsManager } from "@/components/admin/permissions-manager"

export const Route = createFileRoute("/admin/permissoes")({
	// A rota /admin já exige nível 2; aqui exigimos nível 3 (administração de grants).
	beforeLoad: async ({ context }) => {
		const permissions = await context.queryClient.ensureQueryData(myRumaerPermissionsQueryOptions())
		if (!hasPermission(permissions, "rumaer", 3)) {
			throw redirect({ to: "/admin" })
		}
	},
	component: RumaerPermissionsManager,
})
