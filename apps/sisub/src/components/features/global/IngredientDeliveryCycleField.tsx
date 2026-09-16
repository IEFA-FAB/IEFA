import { DELIVERY_CYCLE_LABELS, type DeliveryCycle, isDeliveryCycle } from "@iefa/sisub-domain"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { updateIngredientDeliveryCycleFn } from "@/server/ingredients.fn"
import { ingredientQueryOptions } from "@/services/IngredientsService"

const UNSET = "__UNSET__"

const OPTION_LABELS: Record<DeliveryCycle | typeof UNSET, string> = {
	weekly: `${DELIVERY_CYCLE_LABELS.weekly} — perecível`,
	monthly: `${DELIVERY_CYCLE_LABELS.monthly} — não perecível`,
	[UNSET]: "Não classificado",
}

/**
 * Ciclo de entrega padrão do insumo nas ATAs. Grava ao escolher, fora do botão Salvar do
 * formulário: o save completo reescreve a linha do insumo e não conhece esta coluna.
 */
export function IngredientDeliveryCycleField({ ingredientId, value }: { ingredientId: string; value: string | null }) {
	const queryClient = useQueryClient()
	const current = isDeliveryCycle(value) ? value : UNSET

	const { mutate, isPending } = useMutation({
		mutationFn: (deliveryCycle: DeliveryCycle | null) => updateIngredientDeliveryCycleFn({ data: { id: ingredientId, deliveryCycle } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ingredientQueryOptions(ingredientId).queryKey })
			toast.success("Ciclo de entrega atualizado.")
		},
		onError: (error) => toast.error(`Erro ao atualizar ciclo de entrega: ${error.message}`),
	})

	return (
		<Field orientation="horizontal" className="border-t border-border/60 pt-4">
			<FieldContent>
				<FieldLabel htmlFor="default_delivery_cycle">Ciclo de entrega padrão (ATA)</FieldLabel>
				<FieldDescription>
					Perecível (salada, fruta, verdura) entra toda semana; não perecível, uma vez por mês. Define o mínimo por pedido sugerido nas atas novas — cada ata
					guarda o ciclo que escolheu. Salvo ao escolher.
				</FieldDescription>
			</FieldContent>
			<Select
				value={current}
				disabled={isPending}
				onValueChange={(next) => {
					if (next == null || next === current) return
					mutate(isDeliveryCycle(next) ? next : null)
				}}
			>
				<SelectTrigger id="default_delivery_cycle" className="w-56 shrink-0">
					<SelectValue>{OPTION_LABELS[current]}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={UNSET}>{OPTION_LABELS[UNSET]}</SelectItem>
					<SelectItem value="weekly">{OPTION_LABELS.weekly}</SelectItem>
					<SelectItem value="monthly">{OPTION_LABELS.monthly}</SelectItem>
				</SelectContent>
			</Select>
		</Field>
	)
}
