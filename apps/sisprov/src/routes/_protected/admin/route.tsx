import { SISPROV_ADMIN_MODULE } from "@iefa/sisprov-domain/modules"
import { createFileRoute } from "@tanstack/react-router"
import { requireModules } from "@/auth/pbac"
import { AppShell } from "@/components/layout/AppShell"

export const Route = createFileRoute("/_protected/admin")({
	// Gestão sistêmica da SDAB começa no nível 2; a tela de acessos exige 3 (guard próprio).
	beforeLoad: (opts) => requireModules(opts, [SISPROV_ADMIN_MODULE], 2),
	component: AppShell,
})
