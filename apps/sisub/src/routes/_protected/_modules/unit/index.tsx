import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Building2 } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useMessHalls } from "@/hooks/data/useMessHalls"

export const Route = createFileRoute("/_protected/_modules/unit/")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: UnitHubPage,
	head: () => ({
		meta: [{ title: "Gestão Unidade — Selecionar OM" }],
	}),
})

function UnitHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { units, isLoading } = useMessHalls()

	const isGlobal = permissions.some(
		(p) =>
			p.module === "unit" && p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null
	)
	const allowedIds = new Set(
		permissions
			.filter((p) => p.module === "unit" && p.unit_id !== null)
			.map((p) => p.unit_id as number)
	)

	const items = (isGlobal ? units : units.filter((u) => allowedIds.has(u.id))).map((u) => ({
		id: u.id,
		name: u.display_name ?? u.code,
		subtitle: u.code !== u.display_name ? u.code : undefined,
	}))

	const handleSelect = (id: number) => {
		navigate({
			to: "/unit/$unitId/dashboard",
			params: { unitId: String(id) },
		})
	}

	return (
		<ScopeSelector
			title="Selecionar Unidade"
			description="Escolha a OM para gestão"
			icon={Building2}
			items={items}
			isLoading={isLoading}
			onSelect={handleSelect}
			emptyTitle="Nenhuma unidade disponível"
			emptyDescription="Você não tem permissão para gerir nenhuma unidade."
		/>
	)
}
