import { Users } from "lucide-react"
import { useId, useState } from "react"
import type { MealTypeInfo } from "@/components/features/local/planning/MealTypeSection"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { HeadcountPlan } from "@/lib/menu-fill"

/**
 * Auxiliador de quantitativos: um campo por refeição, aplicado de uma vez ao cardápio todo.
 *
 * O editor pede o efetivo no cabeçalho de cada refeição, dentro da aba de cada dia — informar
 * "almoço = 800" custava sete idas a abas diferentes. Aqui é um número por refeição.
 *
 * Onde o número cai é do chamador (`onApply`): no cardápio semanal ele vira efetivo BASE da
 * refeição, que é o que alcança todas as preparações; em evento e exceção, que não têm efetivo
 * base, vira o pax de cada preparação.
 */
export function MenuHeadcountDialog({
	open,
	onOpenChange,
	mealTypes,
	scope,
	countTargets,
	onApply,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	mealTypes: MealTypeInfo[]
	/** Só muda o texto: o destino de verdade é decidido no `onApply`. */
	scope: "meal-base" | "item-headcount"
	/** Quantos destinos a aplicação vai mudar — vem do rascunho do editor. */
	countTargets: (plan: HeadcountPlan, overwrite: boolean) => number
	onApply: (plan: HeadcountPlan, overwrite: boolean) => void
}) {
	const overwriteId = useId()
	const [values, setValues] = useState<Record<string, string>>({})
	const [overwrite, setOverwrite] = useState(false)

	const plan: HeadcountPlan = new Map(
		mealTypes.map((mealType) => {
			const raw = values[mealType.id]?.trim()
			if (!raw) return [mealType.id, null]
			const parsed = Number.parseInt(raw, 10)
			return [mealType.id, Number.isFinite(parsed) && parsed > 0 ? parsed : null]
		})
	)

	const targets = countTargets(plan, overwrite)

	const handleOpenChange = (next: boolean) => {
		if (next) {
			setValues({})
			setOverwrite(false)
		}
		onOpenChange(next)
	}

	const handleApply = () => {
		onApply(plan, overwrite)
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Users className="size-4" />
						Quantitativo por refeição
					</DialogTitle>
					<DialogDescription>
						{scope === "meal-base"
							? "Informe quantas pessoas comem em cada refeição. O número vira o efetivo da refeição em todos os dias do cardápio e vale para todas as preparações dela."
							: "Informe quantas pessoas comem em cada refeição. O número vai para todas as preparações da refeição."}
					</DialogDescription>
				</DialogHeader>

				{mealTypes.length === 0 ? (
					<p className="text-caption text-muted-foreground">Nenhum tipo de refeição configurado.</p>
				) : (
					<FieldGroup>
						{mealTypes.map((mealType) => (
							<Field key={mealType.id} orientation="horizontal">
								<FieldLabel htmlFor={`headcount-${mealType.id}`}>{mealType.name}</FieldLabel>
								<Input
									id={`headcount-${mealType.id}`}
									type="number"
									min="1"
									inputMode="numeric"
									className="w-28"
									placeholder="pessoas"
									value={values[mealType.id] ?? ""}
									onChange={(e) => setValues((prev) => ({ ...prev, [mealType.id]: e.target.value }))}
								/>
							</Field>
						))}
						<Field orientation="horizontal">
							<FieldLabel htmlFor={overwriteId}>Substituir o que já está preenchido</FieldLabel>
							<Switch id={overwriteId} checked={overwrite} onCheckedChange={setOverwrite} />
						</Field>
						<FieldDescription>
							{overwrite ? "Os valores já informados serão trocados pelos daqui." : "Só o que está em branco é preenchido — nenhum ajuste seu é sobrescrito."}
						</FieldDescription>
					</FieldGroup>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button type="button" disabled={targets === 0} onClick={handleApply}>
						{targets === 0 ? "Preencher" : `Preencher ${targets}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
