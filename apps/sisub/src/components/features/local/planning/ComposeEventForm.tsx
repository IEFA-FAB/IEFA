import { useQueries, useQuery } from "@tanstack/react-query"
import { type LinkOptions, useNavigate } from "@tanstack/react-router"
import { Layers, Loader2 } from "lucide-react"
import { useState } from "react"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { mealTypesQueryOptions } from "@/hooks/data/useMealTypes"
import { useComposeOccasionMenu, useTemplateFolders } from "@/hooks/data/useTemplateFolders"
import { templateQueryOptions } from "@/hooks/data/useTemplates"
import { catalogFolderPath } from "@/lib/template-catalog-tree"
import { OCCASION_SLOT_HINT, OccasionSlotFields, type OccasionSlotRow, occasionSlotsPayload } from "./OccasionSlotFields"

interface ComposeEventFormProps {
	kitchenId: number
	/** Modelos escolhidos na árvore, na ordem em que as refeições vão entrar. */
	templateIds: readonly string[]
	listLink: LinkOptions
	editorLink: (templateId: string) => LinkOptions
}

/**
 * Monta um evento da cozinha a partir de modelos — a composição que substitui adaptar o padrão
 * e desmarcar refeições. Cada modelo vira uma refeição do evento (copiada, com a procedência), no
 * horário escolhido aqui. O efetivo se informa no editor, depois.
 */
export function ComposeEventForm({ kitchenId, templateIds, listLink, editorLink }: ComposeEventFormProps) {
	const navigate = useNavigate()
	const models = useQueries({ queries: templateIds.map((id) => templateQueryOptions(id)) })
	const { data: folders } = useTemplateFolders("event")
	const { data: mealTypes } = useQuery(mealTypesQueryOptions(kitchenId))
	const { mutate: compose, isPending } = useComposeOccasionMenu()

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [slots, setSlots] = useState<Record<string, string>>({})

	const isLoading = models.some((m) => m.isLoading)
	const loaded = models.flatMap((m) => (m.data ? [m.data] : []))
	const failed = models.filter((m) => m.isError).length
	const rowsOf = (model: (typeof loaded)[number]): OccasionSlotRow[] =>
		model.event_meals.map((meal) => ({ id: meal.id, label: meal.name, suggestedMealTypeId: meal.meal_type_id }))
	const totalMeals = loaded.reduce((sum, m) => sum + m.event_meals.length, 0)

	const submit = () => {
		if (!name.trim() || loaded.length === 0) return
		compose(
			{
				kitchenId,
				name: name.trim(),
				description: description.trim() || undefined,
				sources: loaded.map((model) => {
					const modelSlots = occasionSlotsPayload(rowsOf(model), slots)
					return { templateId: model.id, ...(modelSlots && { slots: modelSlots }) }
				}),
			},
			{ onSuccess: (created) => navigate(editorLink(created.id)) }
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Montar Evento"
				description="Junte os modelos que o evento vai servir. Cada um entra como uma refeição, copiada: mudar o modelo depois não mexe neste evento."
				onBack={() => navigate(listLink)}
			/>
			<div className="mx-auto w-full max-w-2xl space-y-6">
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm flex items-center gap-2">
							<Layers className="size-4 text-muted-foreground" />
							Modelos escolhidos
						</CardTitle>
						<CardDescription>
							Vêm as preparações, os grupos e as proporções. O efetivo de cada refeição você informa no editor, depois de montar. {OCCASION_SLOT_HINT}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						{isLoading ? (
							<div className="flex justify-center p-4">
								<Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Carregando os modelos" />
							</div>
						) : (
							loaded.map((model) => (
								<div key={model.id} className="space-y-3">
									<div className="flex items-center gap-2">
										<p className="text-subheading">{model.name}</p>
										<Badge variant="outline" className="ml-auto">
											{model.kitchen_id == null ? (catalogFolderPath(folders, model.folder_id) ?? "Global · SDAB") : "Desta cozinha"}
										</Badge>
									</div>
									{model.event_meals.length === 0 ? (
										<p className="text-sm text-muted-foreground">Este modelo ainda não tem refeição: não acrescenta nada ao evento.</p>
									) : (
										<OccasionSlotFields
											idPrefix={`compose-${model.id}`}
											rows={rowsOf(model)}
											mealTypes={mealTypes}
											value={slots}
											onChange={(mealId, mealTypeId) => setSlots((prev) => ({ ...prev, [mealId]: mealTypeId }))}
											legend="Horário"
											description=""
										/>
									)}
								</div>
							))
						)}
						{failed > 0 && (
							<p className="text-sm text-destructive">{failed === 1 ? "Um modelo não pôde ser carregado." : `${failed} modelos não puderam ser carregados.`}</p>
						)}
					</CardContent>
				</Card>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						submit()
					}}
					className="space-y-4"
				>
					<div className="rounded-md border bg-card p-6 space-y-4">
						<Field>
							<FieldLabel htmlFor="compose-name">
								Nome do evento <span className="text-destructive">*</span>
							</FieldLabel>
							<Input id="compose-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Aniversário da OM — 2026" required />
						</Field>
						<Field>
							<FieldLabel htmlFor="compose-description">Descrição (opcional)</FieldLabel>
							<Textarea id="compose-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
						</Field>
					</div>
					<div className="flex items-center justify-between">
						<p className="text-xs text-muted-foreground">
							{totalMeals} {totalMeals === 1 ? "refeição" : "refeições"} no evento. Depois de montar, dá para acrescentar outra pelo editor.
						</p>
						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={() => navigate(listLink)}>
								Cancelar
							</Button>
							<Button
								type="submit" // Modelo que não carregou ficaria de fora do evento em silêncio: não monta sem todos.
								disabled={isPending || isLoading || failed > 0 || !name.trim() || totalMeals === 0}
							>
								{isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
								Montar evento
							</Button>
						</div>
					</div>
				</form>
			</div>
		</div>
	)
}
