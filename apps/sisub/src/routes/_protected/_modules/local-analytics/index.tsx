import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { LayoutDashboard } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useMessHalls } from "@/hooks/data/useMessHalls"

export const Route = createFileRoute("/_protected/_modules/local-analytics/")({
	beforeLoad: ({ context }) => requirePermission(context, "local-analytics", 1),
	component: LocalAnalyticsHubPage,
	head: () => ({
		meta: [{ title: "Análises da Unidade — Selecionar OM" }],
	}),
})

function LocalAnalyticsHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { units, isLoading } = useMessHalls()

	const isGlobal = permissions.some((p) => p.module === "local-analytics" && p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null)
	const allowedIds = new Set(permissions.filter((p) => p.module === "local-analytics" && p.unit_id !== null).map((p) => p.unit_id as number))

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
