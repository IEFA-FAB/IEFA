import { Loader2, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAddExecutionMenuItem, useExecutionOptions } from "@/hooks/data/useProduction"

/** Valor do combobox que troca a escolha do catálogo pela criação de uma provisória. */
const NEW_PROVISIONAL = "__new_provisional__"

interface AddExecutionItemDialogProps {
	kitchenId: number
	/** Data de serviço aberta no quadro. O servidor só aceita hoje (Brasília) e diz isso se não for. */
	date: string
}

/**
 * "Incluir preparação" do turno: joga uma preparação no cardápio de hoje, sem passar pelo
 * agendamento. Se ela não existe no catálogo, nasce provisória só com o nome — funciona no
 * dia, e a nutricionista completa a ficha depois. O motivo curto fica no item e chega a ela
 * como pendência de revisão.
 */
export function AddExecutionItemDialog({ kitchenId, date }: AddExecutionItemDialogProps) {
	const [open, setOpen] = useState(false)
	const [mealTypeId, setMealTypeId] = useState<string | null>(null)
	const [recipeValue, setRecipeValue] = useState<string | null>(null)
	const [provisionalName, setProvisionalName] = useState("")
	const [portions, setPortions] = useState("")
	const [reason, setReason] = useState("")
	const { data: options, isLoading } = useExecutionOptions(kitchenId, open)
	const { mutate: addItem, isPending } = useAddExecutionMenuItem()

	const recipeOptions = useMemo(
		() => [
			{ value: NEW_PROVISIONAL, label: "Não está na lista — criar provisória só com o nome", hint: "ficha depois" },
			...(options?.recipes ?? []).map((recipe) => ({
				value: recipe.id,
				label: recipe.name,
				hint: recipe.provisional ? "provisória" : recipe.portion_yield ? `rende ${recipe.portion_yield}` : undefined,
			})),
		],
		[options]
	)

	const isProvisional = recipeValue === NEW_PROVISIONAL
	const portionsNum = portions.trim() === "" ? undefined : Number(portions.replace(",", "."))
	const portionsValid = portionsNum === undefined || (Number.isFinite(portionsNum) && portionsNum > 0)
	const canSave =
		mealTypeId != null &&
		recipeValue != null &&
		(!isProvisional || provisionalName.trim().length >= 3) &&
		reason.trim().length >= 3 &&
		portionsValid &&
		!isPending

	function reset() {
		setMealTypeId(null)
		setRecipeValue(null)
		setProvisionalName("")
		setPortions("")
		setReason("")
	}

	function handleSave() {
		if (!canSave || mealTypeId == null || recipeValue == null) return
		addItem(
			{
				kitchenId,
				serviceDate: date,
				mealTypeId,
				...(isProvisional ? { provisionalRecipeName: provisionalName.trim() } : { recipeId: recipeValue }),
				...(portionsNum !== undefined && { plannedPortionQuantity: portionsNum }),
				reason: reason.trim(),
			},
			{
				onSuccess: () => {
					reset()
					setOpen(false)
				},
			}
		)
	}

	const mealName = options?.mealTypes.find((m) => m.id === mealTypeId)?.name

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<Plus data-icon="inline-start" aria-hidden="true" />
				Incluir preparação
			</Button>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					setOpen(value)
					if (!value) reset()
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Incluir preparação no dia</DialogTitle>
						<DialogDescription>
							Entra no cardápio de hoje e no quadro na hora. A nutricionista vê a inclusão, com o motivo, para revisar depois.
						</DialogDescription>
					</DialogHeader>

					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="execution-meal">Refeição</FieldLabel>
							<Select value={mealTypeId ?? null} onValueChange={(value) => setMealTypeId(value)}>
								<SelectTrigger id="execution-meal">
									<SelectValue>{mealName ?? (isLoading ? "Carregando…" : "Escolha a refeição")}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{(options?.mealTypes ?? []).map((meal) => (
										<SelectItem key={meal.id} value={meal.id}>
											{meal.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldLabel htmlFor="execution-recipe">Preparação</FieldLabel>
							<SearchableSelect
								id="execution-recipe"
								value={recipeValue}
								onValueChange={setRecipeValue}
								options={recipeOptions}
								placeholder={isLoading ? "Carregando…" : "Escolha a preparação"}
								searchPlaceholder="Pesquisar preparação…"
								emptyLabel="Nenhuma preparação com esse nome. Escolha a primeira opção para criar uma provisória."
							/>
						</Field>

						{isProvisional && (
							<Field>
								<FieldLabel htmlFor="execution-provisional-name">Nome da preparação</FieldLabel>
								<Input
									id="execution-provisional-name"
									value={provisionalName}
									onChange={(event) => setProvisionalName(event.target.value)}
									placeholder="Ex.: Farofa de ovo"
									maxLength={120}
								/>
								<FieldDescription>
									Nasce provisória, desta cozinha. Funciona hoje; não entra em cardápio-modelo nem na compra até a nutricionista completar a ficha.
								</FieldDescription>
							</Field>
						)}

						<Field>
							<FieldLabel htmlFor="execution-portions">Porções (opcional)</FieldLabel>
							<Input
								id="execution-portions"
								inputMode="decimal"
								value={portions}
								onChange={(event) => setPortions(event.target.value)}
								placeholder="Ex.: 120"
								aria-invalid={!portionsValid}
							/>
							<FieldDescription>Sem número, vale o efetivo previsto da refeição, quando houver.</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor="execution-reason">Motivo</FieldLabel>
							<Input
								id="execution-reason"
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								placeholder="Ex.: faltou o feijão; entrou lentilha"
								maxLength={200}
							/>
						</Field>
					</FieldGroup>

					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button onClick={handleSave} disabled={!canSave}>
							{isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
							Incluir no dia
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
