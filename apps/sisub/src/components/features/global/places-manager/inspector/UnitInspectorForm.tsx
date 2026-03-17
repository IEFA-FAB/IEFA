import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUpdatePlacesEntity } from "@/hooks/data/usePlaces"
import type { DbUnit } from "@/types/domain/places"

const unitSchema = z.object({
	display_name: z.string().min(1, "Nome é obrigatório"),
	code: z.string().min(1, "Código é obrigatório"),
	type: z.enum(["consumption", "purchase"]).nullable(),
})

interface UnitInspectorFormProps {
	unit: DbUnit
}

export function UnitInspectorForm({ unit }: UnitInspectorFormProps) {
	const updateMutation = useUpdatePlacesEntity()

	const form = useForm({
		defaultValues: {
			display_name: unit.display_name ?? "",
			code: unit.code,
			type: unit.type ?? null,
		},
		onSubmit: async ({ value }) => {
			const parsed = unitSchema.safeParse(value)
			if (!parsed.success) return
			await updateMutation.mutateAsync({
				entityType: "unit",
				id: unit.id,
				display_name: parsed.data.display_name,
				code: parsed.data.code,
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
									placeholder="Nome da unidade"
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
									placeholder="Ex: 1ºBE"
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
								<Select value={field.state.value ?? ""} onValueChange={(val) => field.handleChange(val === "" ? null : (val as "consumption" | "purchase"))}>
									<SelectTrigger size="sm" className="w-full">
										<SelectValue placeholder="Selecione o tipo" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="consumption">Consumo</SelectItem>
										<SelectItem value="purchase">Compra</SelectItem>
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
