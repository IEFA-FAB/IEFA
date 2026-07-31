import { resolveModuleScopes } from "@iefa/pbac"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ChefHat } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useUserKitchens } from "@/hooks/data/useKitchens"

export const Route = createFileRoute("/_protected/_modules/kitchen/")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: KitchenHubPage,
	head: () => ({
		meta: [{ title: "Gestão Cozinha — Selecionar Cozinha" }],
	}),
})

function KitchenHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { data: kitchens, isLoading } = useUserKitchens()

	const { isGlobal, ids: allowedIds } = resolveModuleScopes(permissions, "kitchen", "kitchen")

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
