import { SISPROV_ADMIN_MODULE, SISPROV_STOCK_MODULE } from "@iefa/sisprov-domain/modules"
import { createFileRoute } from "@tanstack/react-router"
import { requireModules } from "@/auth/pbac"
import { AppShell } from "@/components/layout/AppShell"

export const Route = createFileRoute("/_protected/stock")({
	// a SDAB (sisprov-admin) entra para criar locais e montar endereços, mesmo sem operar o estoque
	beforeLoad: (opts) => requireModules(opts, [SISPROV_STOCK_MODULE, SISPROV_ADMIN_MODULE], 1),
	component: AppShell,
})
