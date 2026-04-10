import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUpdatePlacesEntity } from "@/hooks/data/usePlaces"
import type { DbKitchen } from "@/types/domain/places"

const kitchenSchema = z.object({
	display_name: z.string().min(1, "Nome é obrigatório"),
	type: z.enum(["consumption", "production"]).nullable(),
})

interface KitchenInspectorFormProps {
	kitchen: DbKitchen
}

export function KitchenInspectorForm({ kitchen }: KitchenInspectorFormProps) {
	const updateMutation = useUpdatePlacesEntity()

	const form = useForm({
		defaultValues: {
			display_name: kitchen.display_name ?? "",
			type: kitchen.type ?? null,
		},
		onSubmit: async ({ value }) => {
			const parsed = kitchenSchema.safeParse(value)
			if (!parsed.success) return
			await updateMutation.mutateAsync({
				entityType: "kitchen",
				id: kitchen.id,
				display_name: parsed.data.display_name,
				type: parsed.data.type,
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
									placeholder="Nome da cozinha"
								/>
							</FieldContent>
						</Field>
					)}
				</form.Field>

				<form.Field name="type">
					{(field) => (
						<Field>
							<FieldLabel>Tipo</FieldLabel>
							<FieldContent>
								<Select value={field.state.value ?? ""} onValueChange={(val) => field.handleChange(val === "" ? null : (val as "consumption" | "production"))}>
									<SelectTrigger size="sm" className="w-full">
										<SelectValue placeholder="Selecione o tipo">
											{field.state.value === "production" ? "Produção" : field.state.value === "consumption" ? "Consumo" : undefined}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="production">Produção</SelectItem>
										<SelectItem value="consumption">Consumo</SelectItem>
									</SelectContent>
								</Select>
							</FieldContent>
							<FieldError>
								{field.state.meta.errors
									.map((e) => (e == null ? "" : typeof e === "string" ? e : ((e as unknown as { message?: string })?.message ?? "")))
									.filter(Boolean)
									.join(", ")}
							</FieldError>
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
