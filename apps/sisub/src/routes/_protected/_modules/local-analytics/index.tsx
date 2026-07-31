import { resolveModuleScopes } from "@iefa/pbac"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { LayoutDashboard } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useMessHalls } from "@/hooks/data/useMessHalls"

export const Route = createFileRoute("/_protected/_modules/local-analytics/")({
	beforeLoad: (opts) => requirePermission(opts, "local-analytics", 1),
	component: LocalAnalyticsHubPage,
	head: () => ({
		meta: [{ title: "Análises da Unidade — Selecionar OM" }],
	}),
})

function LocalAnalyticsHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { units, isLoading } = useMessHalls()

	const { isGlobal, ids: allowedIds } = resolveModuleScopes(permissions, "local-analytics", "unit")

	const items = (isGlobal ? units : units.filter((u) => allowedIds.has(u.id))).map((u) => ({
		id: u.id,
		name: u.display_name ?? u.code,
		subtitle: u.code !== u.display_name ? u.code : undefined,
	}))

	const handleSelect = (id: number) => {
		navigate({
			to: "/local-analytics/$unitId/dashboard",
			params: { unitId: String(id) },
		})
	}

	return (
		<ScopeSelector
			title="Análises da Unidade"
			description="Selecione a OM para visualizar os dashboards e indicadores"
			icon={LayoutDashboard}
			items={items}
			isLoading={isLoading}
			onSelect={handleSelect}
			emptyTitle="Nenhuma unidade disponível"
			emptyDescription="Você não tem permissão para acessar análises de nenhuma unidade."
		/>
	)
}
