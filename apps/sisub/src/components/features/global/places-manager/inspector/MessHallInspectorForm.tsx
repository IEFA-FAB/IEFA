import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useUpdatePlacesEntity } from "@/hooks/data/usePlaces"
import type { DbMessHall } from "@/types/domain/places"

const messHallSchema = z.object({
	display_name: z.string().min(1, "Nome é obrigatório"),
	code: z.string().min(1, "Código é obrigatório"),
})

interface MessHallInspectorFormProps {
	messHall: DbMessHall
}

export function MessHallInspectorForm({ messHall }: MessHallInspectorFormProps) {
	const updateMutation = useUpdatePlacesEntity()

	const form = useForm({
		defaultValues: {
			display_name: messHall.display_name ?? "",
			code: messHall.code,
		},
		onSubmit: async ({ value }) => {
			const parsed = messHallSchema.safeParse(value)
			if (!parsed.success) return
			await updateMutation.mutateAsync({
				entityType: "mess_hall",
				id: messHall.id,
				display_name: parsed.data.display_name,
				code: parsed.data.code,
			})
		},
	})

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				form.handleSubmit()
			}}
			className="flex flex-col gap-4"
		>
			<FieldGroup>
				<form.Field name="display_name">
					{(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Nome</FieldLabel>
							<FieldContent>
								<Input
									id={field.name}
									className="h-8 text-sm"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									placeholder="Nome do refeitório"
								/>
							</FieldContent>
						</Field>
					)}
				</form.Field>

				<form.Field name="code">
					{(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Código</FieldLabel>
							<FieldContent>
								<Input
									id={field.name}
									className="h-8 text-sm"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									placeholder="Ex: REF-01"
								/>
							</FieldContent>
						</Field>
					)}
				</form.Field>
			</FieldGroup>

			<Button type="submit" size="sm" disabled={updateMutation.isPending} className="w-full">
				{updateMutation.isPending ? "Salvando..." : "Salvar campos"}
			</Button>
		</form>
	)
}
