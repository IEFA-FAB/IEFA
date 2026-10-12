import { SISPROV_SUPPLY_MODULE } from "@iefa/sisprov-domain/modules"
import { createFileRoute } from "@tanstack/react-router"
import { requireModules } from "@/auth/pbac"
import { AppShell } from "@/components/layout/AppShell"

export const Route = createFileRoute("/_protected/supply")({
	beforeLoad: (opts) => requireModules(opts, [SISPROV_SUPPLY_MODULE], 1),
	component: AppShell,
})
