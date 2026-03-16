import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ChefHat } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useUserKitchens } from "@/hooks/data/useKitchens"

export const Route = createFileRoute("/_protected/_modules/kitchen/")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 1),
	component: KitchenHubPage,
	head: () => ({
		meta: [{ title: "Gestão Cozinha — Selecionar Cozinha" }],
	}),
})

function KitchenHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { data: kitchens, isLoading } = useUserKitchens()

	const isGlobal = permissions.some((p) => p.module === "kitchen" && p.kitchen_id === null && p.unit_id === null && p.mess_hall_id === null)
	const allowedIds = new Set(permissions.filter((p) => p.module === "kitchen" && p.kitchen_id !== null).map((p) => p.kitchen_id as number))

	const allKitchens = kitchens ?? []
	const items = (isGlobal ? allKitchens : allKitchens.filter((k) => allowedIds.has(k.id))).map((k) => ({
		id: k.id,
		name: k.unit?.display_name ?? k.unit?.code ?? `Cozinha ${k.id}`,
		subtitle: k.unit?.display_name ?? k.unit?.code,
	}))

	const handleSelect = (id: number) => {
		navigate({
			to: "/kitchen/$kitchenId/weekly-menus",
			params: { kitchenId: String(id) },
		})
	}

	return (
		<ScopeSelector
			title="Selecionar Cozinha"
			description="Escolha a cozinha para gestão"
			icon={ChefHat}
			items={items}
			isLoading={isLoading}
			onSelect={handleSelect}
			emptyTitle="Nenhuma cozinha disponível"
			emptyDescription="Você não tem permissão para gerir nenhuma cozinha."
		/>
	)
}
