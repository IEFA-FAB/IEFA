import { createFileRoute, useParams } from "@tanstack/react-router"
import { UtensilsCrossed } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { KitchenSettingsForm } from "@/components/features/kitchen/KitchenSettingsForm"
import { MealTypeManager } from "@/components/features/local/planning/MealTypeManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useKitchenSettings } from "@/hooks/data/useKitchenSettings"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/settings")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: KitchenSettingsPage,
	head: () => ({
		meta: [{ title: "Configurações da Cozinha" }],
	}),
})

function KitchenSettingsPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const [mealTypeManagerOpen, setMealTypeManagerOpen] = useState(false)

	const { data: kitchen, isLoading, error } = useKitchenSettings(kitchenId)

	const description = kitchen
		? `Cozinha ${kitchen.display_name ? `"${kitchen.display_name}"` : `#${kitchen.id}`}${kitchen.unit ? ` · ${kitchen.unit.display_name ?? kitchen.unit.code}` : ""}`
		: "Gerencie os dados de entrega utilizados em documentos de licitação."

	return (
		<div className="space-y-6">
			<PageHeader title="Configurações da Cozinha" description={description} />

			{isLoading ? (
				<div className="space-y-4">
					<div className="h-64 animate-pulse rounded-lg border bg-muted" aria-hidden="true" />
				</div>
			) : error ? (
				<p className="text-sm text-destructive">Erro ao carregar dados: {error.message}</p>
			) : kitchen ? (
				<>
					<KitchenSettingsForm
						key={kitchen.id}
						kitchenId={kitchenId}
						defaultValues={{
							address_logradouro: kitchen.address_logradouro ?? null,
							address_numero: kitchen.address_numero ?? null,
							address_complemento: kitchen.address_complemento ?? null,
							address_bairro: kitchen.address_bairro ?? null,
							address_municipio: kitchen.address_municipio ?? null,
							address_uf: kitchen.address_uf ?? null,
							address_cep: kitchen.address_cep ?? null,
						}}
					/>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<UtensilsCrossed className="size-4 text-muted-foreground" aria-hidden="true" />
								Tipos de Refeição
							</CardTitle>
							<CardDescription>
								Além de café, almoço, janta e ceia, crie tipos próprios desta cozinha (ex.: colação). Disponíveis nos cardápios semanais, eventos e exceções.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button variant="outline" size="sm" onClick={() => setMealTypeManagerOpen(true)}>
								Gerenciar tipos de refeição
							</Button>
						</CardContent>
					</Card>

					<MealTypeManager open={mealTypeManagerOpen} onClose={() => setMealTypeManagerOpen(false)} kitchenId={kitchenId} />
				</>
			) : null}
		</div>
	)
}
