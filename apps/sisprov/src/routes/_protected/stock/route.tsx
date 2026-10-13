import { SISPROV_STOCK_MODULE } from "@iefa/sisprov-domain/modules"
import { createFileRoute } from "@tanstack/react-router"
import { requireModules } from "@/auth/pbac"
import { AppShell } from "@/components/layout/AppShell"

export const Route = createFileRoute("/_protected/stock")({
	beforeLoad: (opts) => requireModules(opts, [SISPROV_STOCK_MODULE], 1),
	component: AppShell,
})
