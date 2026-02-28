import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
} from "@iefa/ui"
import { useForm } from "@tanstack/react-form"
import { Loader2 } from "lucide-react"
import React from "react"
import { z } from "zod"
import { useCreateMealType, useUpdateMealType } from "@/hooks/data/useMealTypes"
import type { MealType } from "@/types/supabase.types"

const mealTypeSchema = z.object({
	name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
	sort_order: z.number().min(0, "Ordem deve ser maior ou igual a 0"),
})

interface MealTypeFormProps {
	open: boolean
	onClose: () => void
	kitchenId: number
	mealType?: MealType | null // null = create, MealType = edit
}

/**
 * Form para criar ou editar tipos de refeição customizados
 *
 * @example
 * ```tsx
 * <MealTypeForm
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   kitchenId={1}
 *   mealType={null} // ou mealType={existingType} para editar
 * />
 * ```
 */
export function MealTypeForm({ open, onClose, kitchenId, mealType }: MealTypeFormProps) {
	const { mutate: createMealType, isPending: isCreating } = useCreateMealType()
	const { mutate: updateMealType, isPending: isUpdating } = useUpdateMealType()

	const isEditing = !!mealType
	const isPending = isCreating || isUpdating

	const form = useForm({
		defaultValues: {
			name: mealType?.name || "",
			sort_order: mealType?.sort_order || 0,
		},
		validators: {
			onChange: mealTypeSchema,
		},
		onSubmit: async ({ value }) => {
			if (isEditing) {
				updateMealType(
					{
						id: mealType.id,
						name: value.name,
						sort_order: value.sort_order,
					},
					{
						onSuccess: () => {
							onClose()
							form.reset()
						},
					}
				)
			} else {
				createMealType(
					{
						name: value.name,
						kitchen_id: kitchenId,
						sort_order: value.sort_order,
					},
					{
						onSuccess: () => {
							onClose()
							form.reset()
						},
					}
				)
			}
		},
	})

	// Reset form when dialog closes
	React.useEffect(() => {
		if (!open) {
			form.reset()
		}
	}, [open, form])

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Editar Tipo de Refeição" : "Novo Tipo de Refeição"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Altere os dados do tipo de refeição customizado."
							: "Crie um novo tipo de refeição para esta cozinha."}
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4 py-4"
				>
					{/* Name Field */}
					<form.Field name="name">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="name">Nome</Label>
								<Input
									id="name"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									placeholder="Ex: Jantar Especial, Lanche da Tarde"
									aria-invalid={field.state.meta.errors.length > 0}
								/>
								{field.state.meta.errors.length > 0 && (
									<p className="text-sm text-destructive">{String(field.state.meta.errors[0])}</p>
								)}
							</div>
						)}
					</form.Field>

					{/* Sort Order Field */}
					<form.Field name="sort_order">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="sort_order">Ordem de Exibição</Label>
								<Input
									id="sort_order"
									type="number"
									min="0"
									value={field.state.value}
									onChange={(e) => field.handleChange(Number.parseInt(e.target.value, 10))}
									onBlur={field.handleBlur}
									aria-invalid={field.state.meta.errors.length > 0}
								/>
								{field.state.meta.errors.length > 0 && (
									<p className="text-sm text-destructive">{String(field.state.meta.errors[0])}</p>
								)}
								<p className="text-xs text-muted-foreground">
									Número usado para ordenar os tipos de refeição. Menor = aparece primeiro.
								</p>
							</div>
						)}
					</form.Field>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
							{isEditing ? "Salvar Alterações" : "Criar Tipo"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
