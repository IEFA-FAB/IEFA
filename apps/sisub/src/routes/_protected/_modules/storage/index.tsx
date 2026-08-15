import { resolveModuleScopes } from "@iefa/pbac"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Package } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useUserKitchens } from "@/hooks/data/useKitchens"

export const Route = createFileRoute("/_protected/_modules/storage/")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	component: StorageHubPage,
	head: () => ({
		meta: [{ title: "Estoque — Selecionar Cozinha" }],
	}),
})

function StorageHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { data: kitchens, isLoading } = useUserKitchens()

	const { isGlobal, ids: allowedIds } = resolveModuleScopes(permissions, "storage", "kitchen")

	const allKitchens = kitchens ?? []
	const items = (isGlobal ? allKitchens : allKitchens.filter((k) => allowedIds.has(k.id))).map((k) => ({
		id: k.id,
		name: k.unit?.display_name ?? k.unit?.code ?? `Cozinha ${k.id}`,
		subtitle: k.unit?.display_name ?? k.unit?.code,
	}))

	const handleSelect = (id: number) => {
		navigate({
			to: "/storage/$kitchenId/dashboard",
			params: { kitchenId: String(id) },
		})
	}

	return (
		<ScopeSelector
			title="Selecionar Cozinha"
			description="Escolha a cozinha para gestão de estoque"
			icon={Package}
			items={items}
			isLoading={isLoading}
			onSelect={handleSelect}
			emptyTitle="Nenhuma cozinha disponível"
			emptyDescription="Você não tem permissão de estoque em nenhuma cozinha."
		/>
	)
}
