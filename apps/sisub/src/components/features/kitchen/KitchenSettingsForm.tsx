import { useForm } from "@tanstack/react-form"
import { MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useUpdateKitchenSettings } from "@/hooks/data/useKitchenSettings"
import type { KitchenSettingsInput } from "@/server/kitchen-settings.fn"

function formatCep(value: string) {
	const digits = value.replace(/\D/g, "").slice(0, 8)
	if (digits.length <= 5) return digits
	return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function KitchenSettingsForm({ kitchenId, defaultValues }: { kitchenId: number; defaultValues: KitchenSettingsInput }) {
	const updateMutation = useUpdateKitchenSettings(kitchenId)

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			await updateMutation.mutateAsync(value)
		},
	})

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				form.handleSubmit()
			}}
			className="space-y-6"
		>
			{/* ── Endereço de Entrega ────────────────────────────────────────── */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
						<CardTitle className="text-base">Endereço de Entrega</CardTitle>
					</div>
					<CardDescription>
						Endereço físico desta cozinha onde os suprimentos devem ser entregues. Utilizado nos documentos de licitação e nas atas de Registro de Preços.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						{/* Logradouro + Número */}
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div className="sm:col-span-2">
								<form.Field name="address_logradouro">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={field.name}>Logradouro</FieldLabel>
											<FieldContent>
												<Input
													id={field.name}
													value={field.state.value ?? ""}
													onChange={(e) => field.handleChange(e.target.value || null)}
													onBlur={field.handleBlur}
													placeholder="Rua das Acácias"
												/>
											</FieldContent>
										</Field>
									)}
								</form.Field>
							</div>
							<div>
								<form.Field name="address_numero">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={field.name}>Número</FieldLabel>
											<FieldContent>
												<Input
													id={field.name}
													value={field.state.value ?? ""}
													onChange={(e) => field.handleChange(e.target.value || null)}
													onBlur={field.handleBlur}
													placeholder="S/N"
												/>
											</FieldContent>
										</Field>
									)}
								</form.Field>
							</div>
						</div>

						{/* Complemento */}
						<form.Field name="address_complemento">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>
										Complemento
										<span className="text-muted-foreground font-normal ml-1 text-xs">(opcional)</span>
									</FieldLabel>
									<FieldContent>
										<Input
											id={field.name}
											value={field.state.value ?? ""}
											onChange={(e) => field.handleChange(e.target.value || null)}
											onBlur={field.handleBlur}
											placeholder="Galpão 2, Portão Lateral..."
										/>
									</FieldContent>
								</Field>
							)}
						</form.Field>

						{/* Bairro + Município + UF */}
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div>
								<form.Field name="address_bairro">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={field.name}>Bairro</FieldLabel>
											<FieldContent>
												<Input
													id={field.name}
													value={field.state.value ?? ""}
													onChange={(e) => field.handleChange(e.target.value || null)}
													onBlur={field.handleBlur}
													placeholder="Centro"
												/>
											</FieldContent>
										</Field>
									)}
								</form.Field>
							</div>
							<div>
								<form.Field name="address_municipio">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={field.name}>Município</FieldLabel>
											<FieldContent>
												<Input
													id={field.name}
													value={field.state.value ?? ""}
													onChange={(e) => field.handleChange(e.target.value || null)}
													onBlur={field.handleBlur}
													placeholder="Brasília"
												/>
											</FieldContent>
										</Field>
									)}
								</form.Field>
							</div>
							<div>
								<form.Field name="address_uf">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={field.name}>UF</FieldLabel>
											<FieldContent>
												<Input
													id={field.name}
													value={field.state.value ?? ""}
													onChange={(e) => field.handleChange(e.target.value.toUpperCase().slice(0, 2) || null)}
													onBlur={field.handleBlur}
													placeholder="DF"
													maxLength={2}
													className="uppercase max-w-20"
												/>
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
							</div>
						</div>

						{/* CEP */}
						<form.Field name="address_cep">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>CEP</FieldLabel>
									<FieldContent>
										<Input
											id={field.name}
											value={field.state.value ?? ""}
											onChange={(e) => field.handleChange(formatCep(e.target.value) || null)}
											onBlur={field.handleBlur}
											placeholder="00000-000"
											inputMode="numeric"
											maxLength={9}
											className="max-w-36"
										/>
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
				</CardContent>
			</Card>

			{/* ── Ações ──────────────────────────────────────────────────────── */}
			<div className="flex justify-end">
				{updateMutation.isSuccess && !updateMutation.isPending && (
					<p className="self-center mr-4 text-sm text-green-600 dark:text-green-400">Salvo com sucesso.</p>
				)}
				{updateMutation.isError && <p className="self-center mr-4 text-sm text-destructive">{updateMutation.error?.message ?? "Erro ao salvar."}</p>}
				<Button type="submit" disabled={updateMutation.isPending}>
					{updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
				</Button>
			</div>
		</form>
	)
}
