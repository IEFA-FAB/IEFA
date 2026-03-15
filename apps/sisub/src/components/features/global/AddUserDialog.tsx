import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import type { NewUserPayload, UserLevelOrNull } from "@/types/domain/admin"
import type { Unit } from "@/types/domain/meal"

// Remove local NewUserPayload definition and import from domain
// Schema de validação
const addUserSchema = z.object({
	id: z.string().uuid("ID inválido. Informe um UUID válido.").nonempty("ID é obrigatório"),
	email: z.string().email("Email inválido").nonempty("Email é obrigatório"),
	name: z.string().nonempty("Nome é obrigatório"),
	saram: z.string().regex(/^\d{7}$/, "SARAM deve ter 7 dígitos numéricos"),
	role: z.enum(["user", "admin", "superadmin"] as const),
	om: z.string(),
})

export default function AddUserDialog({
	open,
	onOpenChange,
	isLoading,
	units,
	isLoadingUnits,
	unitsError,
	onSubmit,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	isLoading: boolean
	units: Unit[]
	isLoadingUnits: boolean
	unitsError?: string | null
	onSubmit: (payload: NewUserPayload) => void | Promise<void>
}) {
	const form = useForm({
		defaultValues: {
			id: "",
			email: "",
			name: "",
			saram: "",
			role: "user" as UserLevelOrNull,
			om: "",
		},
		validators: {
			onChange: addUserSchema,
		},
		onSubmit: async ({ value }) => {
			await onSubmit({
				...value,
				role: value.role as UserLevelOrNull,
				om: value.om || null,
			})
			form.reset()
		},
	})

	// Reset form on close is handled by the parent or manually if needed,
	// but strictly speaking TanStack Form handles state internally.
	// We can force reset when dialog opens if needed, but it's often better to reset on submit success.

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>Adicionar Novo Usuário</DialogTitle>
					<DialogDescription>
						Preencha todos os campos para cadastrar o usuário em profiles_admin. O ID deve ser o
						UUID do usuário que se tornará Admin.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="grid gap-4 py-2"
				>
					<form.Field name="id">
						{(field) => (
							<Field
								className="grid grid-cols-4 items-center gap-4"
								data-invalid={field.state.meta.errors.length > 0}
							>
								<FieldLabel htmlFor="id" className="text-right">
									ID (UUID)
								</FieldLabel>
								<FieldContent className="col-span-3">
									<Input
										id="id"
										name="id"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
										className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
									/>
									<FieldError
										errors={field.state.meta.errors
											.filter(Boolean)
											.map((err) => ({ message: err?.toString() }))}
									/>
								</FieldContent>
							</Field>
						)}
					</form.Field>

					<form.Field name="name">
						{(field) => (
							<Field
								className="grid grid-cols-4 items-center gap-4"
								data-invalid={field.state.meta.errors.length > 0}
							>
								<FieldLabel htmlFor="name" className="text-right">
									Nome
								</FieldLabel>
								<FieldContent className="col-span-3">
									<Input
										id="name"
										name="name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Nome completo"
										className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
									/>
									<FieldError
										errors={field.state.meta.errors
											.filter(Boolean)
											.map((err) => ({ message: err?.toString() }))}
									/>
								</FieldContent>
							</Field>
						)}
					</form.Field>

					<form.Field name="email">
						{(field) => (
							<Field
								className="grid grid-cols-4 items-center gap-4"
								data-invalid={field.state.meta.errors.length > 0}
							>
								<FieldLabel htmlFor="email" className="text-right">
									Email
								</FieldLabel>
								<FieldContent className="col-span-3">
									<Input
										id="email"
										name="email"
										type="email"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="usuario@exemplo.com"
										className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
									/>
									<FieldError
										errors={field.state.meta.errors
											.filter(Boolean)
											.map((err) => ({ message: err?.toString() }))}
									/>
								</FieldContent>
							</Field>
						)}
					</form.Field>

					<form.Field name="saram">
						{(field) => (
							<Field
								className="grid grid-cols-4 items-center gap-4"
								data-invalid={field.state.meta.errors.length > 0}
							>
								<FieldLabel htmlFor="saram" className="text-right">
									SARAM
								</FieldLabel>
								<FieldContent className="col-span-3">
									<Input
										id="saram"
										name="saram"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										maxLength={7}
										placeholder="Apenas 7 números"
										className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
									/>
									<FieldError
										errors={field.state.meta.errors
											.filter(Boolean)
											.map((err) => ({ message: err?.toString() }))}
									/>
								</FieldContent>
							</Field>
						)}
					</form.Field>

					<form.Field name="role">
						{(field) => (
							<Field
								className="grid grid-cols-4 items-center gap-4"
								data-invalid={field.state.meta.errors.length > 0}
							>
								<FieldLabel htmlFor="role" className="text-right">
									Role
								</FieldLabel>
								<FieldContent className="col-span-3">
									<Select
										value={field.state.value || ""}
										onValueChange={(value) => field.handleChange(value as UserLevelOrNull)}
									>
										<SelectTrigger
											className={field.state.meta.errors.length > 0 ? "border-destructive" : ""}
										>
											<SelectValue placeholder="Selecione uma role" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="user">User</SelectItem>
											<SelectItem value="admin">Admin</SelectItem>
											<SelectItem value="superadmin">Superadmin</SelectItem>
										</SelectContent>
									</Select>
									<FieldError
										errors={field.state.meta.errors
											.filter(Boolean)
											.map((err) => ({ message: err?.toString() }))}
									/>
								</FieldContent>
							</Field>
						)}
					</form.Field>

					<form.Field name="om">
						{(field) => (
							<Field
								className="grid grid-cols-4 items-center gap-4"
								data-invalid={field.state.meta.errors.length > 0 || !!unitsError}
							>
								<FieldLabel htmlFor="om" className="text-right">
									OM
								</FieldLabel>
								<FieldContent className="col-span-3">
									<Select
										value={field.state.value || ""}
										onValueChange={(value) => field.handleChange(value || "")}
										disabled={isLoadingUnits}
									>
										<SelectTrigger
											className={
												unitsError || field.state.meta.errors.length > 0 ? "border-destructive" : ""
											}
										>
											<SelectValue
												placeholder={
													isLoadingUnits ? "Carregando OMs..." : "Selecione a OM (opcional)"
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{(units || []).map((u) => (
												<SelectItem key={u.code} value={u.code}>
													{u.display_name ? u.display_name : u.code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError
										errors={[
											...field.state.meta.errors
												.filter(Boolean)
												.map((err) => ({ message: err?.toString() })),
											...(unitsError ? [{ message: unitsError }] : []),
										]}
									/>
								</FieldContent>
							</Field>
						)}
					</form.Field>

					<DialogFooter className="mt-4">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancelar
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? "Adicionando..." : "Adicionar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
