import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ChefHat } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useUserKitchens } from "@/hooks/data/useKitchens"

export const Route = createFileRoute("/_protected/_modules/kitchen-production/")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen-production", 1),
	component: KitchenProductionHubPage,
	head: () => ({
		meta: [{ title: "Produção Cozinha - SISUB" }],
	}),
})

function KitchenProductionHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { data: kitchens, isLoading } = useUserKitchens()

	const isGlobal = permissions.some((p) => p.module === "kitchen-production" && p.kitchen_id === null && p.unit_id === null && p.mess_hall_id === null)
	const allowedIds = new Set(permissions.filter((p) => p.module === "kitchen-production" && p.kitchen_id !== null).map((p) => p.kitchen_id as number))

	const allKitchens = kitchens ?? []
	const items = (isGlobal ? allKitchens : allKitchens.filter((k) => allowedIds.has(k.id))).map((k) => ({
		id: k.id,
		name: k.unit?.display_name ?? k.unit?.code ?? `Cozinha ${k.id}`,
		subtitle: k.unit?.code !== k.unit?.display_name ? k.unit?.code : undefined,
	}))

	return (
		<ScopeSelector
			title="Produção Cozinha"
			description="Selecione a cozinha para acessar a produção."
			icon={ChefHat}
			items={items}
			isLoading={isLoading}
			onSelect={(id) =>
				navigate({
					to: "/kitchen-production/$kitchenId",
					params: { kitchenId: String(id) },
				})
			}
			emptyTitle="Nenhuma cozinha disponível"
			emptyDescription="Você não possui acesso a nenhuma cozinha no módulo de produção."
		/>
	)
}
