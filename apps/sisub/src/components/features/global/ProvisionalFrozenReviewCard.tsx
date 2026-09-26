import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Snowflake } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { toast } from "@/components/ui/toast"
import { listPendingProvisionalFrozenPreparationsFn, reviewProvisionalFrozenPreparationFn } from "@/server/frozen_preparation.fn"

const PENDING_KEY = ["frozen-preparations", "provisional-pending"] as const

/**
 * Congeladas que as cozinhas criaram para guardar sobra sem esperar o catálogo. A sobra já está
 * no estoque delas; aqui a SDAB aceita o cadastro no catálogo global — depois de aceita, a
 * preparação aparece na lista abaixo e se corrige como qualquer outra.
 */
export function ProvisionalFrozenReviewCard({ canWrite }: { canWrite: boolean }) {
	const queryClient = useQueryClient()
	const { data } = useQuery({ queryKey: PENDING_KEY, queryFn: () => listPendingProvisionalFrozenPreparationsFn() })
	const review = useMutation({
		mutationFn: (id: string) => reviewProvisionalFrozenPreparationFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["frozen-preparations"] })
			toast.success("Preparação aceita no catálogo")
		},
		onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao aceitar a preparação"),
	})

	if (!data || data.length === 0) return null

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<span className="flex items-center gap-2">
						<Snowflake className="size-4" aria-hidden="true" />
						Criadas pelas cozinhas para sobra ({data.length})
					</span>
				</CardTitle>
				<CardDescription>
					A sobra já está no estoque da cozinha. Aceite no catálogo para valer para todas; depois de aceita, corrija nome, unidade ou validade na lista abaixo.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup>
					{data.map((prep) => (
						<Item key={prep.id} variant="outline" size="sm">
							<ItemContent>
								<ItemTitle>{prep.description}</ItemTitle>
								<ItemDescription>
									{prep.kitchen_name} · desde {new Date(prep.since).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
									{prep.shelf_life_days ? ` · validade ${prep.shelf_life_days} dias` : " · sem validade informada"}
									{prep.created_by ? ` · ${prep.created_by}` : ""} · {prep.lots} lote(s)
								</ItemDescription>
							</ItemContent>
							{canWrite && (
								<ItemActions>
									<Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate(prep.id)}>
										<CheckCircle2 className="size-4" aria-hidden="true" />
										Aceitar no catálogo
									</Button>
								</ItemActions>
							)}
						</Item>
					))}
				</ItemGroup>
			</CardContent>
		</Card>
	)
}
