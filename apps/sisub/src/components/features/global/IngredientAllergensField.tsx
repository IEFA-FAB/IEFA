import { ALLERGEN_DESCRIPTIONS, ALLERGEN_LABELS, ALLERGENS, type Allergen, normalizeAllergens } from "@iefa/sisub-domain"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { toast } from "@/components/ui/toast"
import { updateIngredientAllergensFn } from "@/server/ingredients.fn"
import { ingredientQueryOptions } from "@/services/IngredientsService"
import { AutoSaveStatus, autoSaveStateOf } from "../shared/AutoSaveStatus"

/**
 * Alergênicos do insumo (grupos da RDC ANVISA 26/2015). Grava a cada marcação, fora do botão
 * Salvar do formulário: o save completo reescreve a linha do insumo e não conhece esta coluna.
 * É o que o cardápio impresso lista na opção "somente alergênicos".
 */
export function IngredientAllergensField({ ingredientId, value }: { ingredientId: string; value: readonly string[] | null | undefined }) {
	const queryClient = useQueryClient()
	const saved = normalizeAllergens(value)
	const savedKey = saved.join(",")
	// Estado local: a próxima marcação parte do que o usuário já marcou, não da prop que só
	// muda depois do refetch — senão dois cliques seguidos gravavam só o segundo.
	const [current, setCurrent] = useState<Allergen[]>(saved)
	// biome-ignore lint/correctness/useExhaustiveDependencies: `savedKey` é a identidade de `saved`
	useEffect(() => setCurrent(saved), [savedKey])

	const mutation = useMutation({
		mutationFn: (allergens: Allergen[]) => updateIngredientAllergensFn({ data: { id: ingredientId, allergens } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ingredientQueryOptions(ingredientId).queryKey })
		},
		onError: (error) => {
			setCurrent(saved)
			toast.error(`Erro ao atualizar alergênicos: ${error.message}`)
		},
	})

	const toggle = (allergen: Allergen, checked: boolean) => {
		const next = normalizeAllergens(checked ? [...current, allergen] : current.filter((a) => a !== allergen))
		setCurrent(next)
		mutation.mutate(next)
	}

	return (
		<Field className="border-t border-border/60 pt-4">
			<FieldContent>
				<FieldLabel>Alergênicos (RDC 26/2015)</FieldLabel>
				<FieldDescription>
					Marque os grupos presentes no insumo. Saem no cardápio impresso, em cada preparação que o usa. Nenhum marcado não significa isento — só que ninguém
					marcou. Salvo ao marcar, fora do histórico de versões do insumo.
				</FieldDescription>
				<AutoSaveStatus
					status={autoSaveStateOf(mutation)}
					savedAt={mutation.submittedAt}
					onRetry={() => mutation.variables !== undefined && mutation.mutate(mutation.variables)}
				/>
			</FieldContent>
			<div className="grid gap-2 sm:grid-cols-2">
				{ALLERGENS.map((allergen) => {
					const id = `allergen-${allergen}`
					return (
						<label key={allergen} htmlFor={id} className="flex items-start gap-2 text-sm">
							<Checkbox
								id={id}
								checked={current.includes(allergen)}
								disabled={mutation.isPending}
								onCheckedChange={(checked) => toggle(allergen, checked === true)}
								className="mt-0.5"
							/>
							<span>
								<span className="font-medium text-foreground">{ALLERGEN_LABELS[allergen]}</span>
								<span className="block text-xs text-muted-foreground">{ALLERGEN_DESCRIPTIONS[allergen]}</span>
							</span>
						</label>
					)
				})}
			</div>
		</Field>
	)
}
