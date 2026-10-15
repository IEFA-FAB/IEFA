import { SISPROV_ADMIN_MODULE, SISPROV_GRANT_ADMIN_LEVEL } from "@iefa/sisprov-domain/modules"
import { createFileRoute } from "@tanstack/react-router"
import { requireModules } from "@/auth/pbac"
import { SisprovPermissionsManager } from "@/components/admin/permissions-manager"

export const Route = createFileRoute("/_protected/admin/permissoes")({
	// A rota /admin exige nível 2; aqui a administração de grants exige 3.
	beforeLoad: (opts) => requireModules(opts, [SISPROV_ADMIN_MODULE], SISPROV_GRANT_ADMIN_LEVEL),
	component: SisprovPermissionsManager,
})
