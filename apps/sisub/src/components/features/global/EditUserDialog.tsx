import { useForm } from "@tanstack/react-form"
import * as React from "react"
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
import type { EditUserPayload, ProfileAdmin, UserLevelOrNull } from "@/types/domain/admin"
import type { Unit } from "@/types/domain/meal"

// Validations
const editUserSchema = z.object({
	saram: z.string().regex(/^\d{7}$/, "SARAM deve ter 7 dígitos numéricos"),
	role: z.enum(["user", "admin", "superadmin"] as const),
	om: z.string(),
})

export default function EditUserDialog({
	open,
	onOpenChange,
	isLoading,
	profile,
	units,
	isLoadingUnits,
	unitsError,
	onSubmit,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	isLoading: boolean
	profile: ProfileAdmin | null
	units: Unit[]
	isLoadingUnits: boolean
	unitsError?: string | null
	onSubmit: (payload: EditUserPayload) => void | Promise<void>
}) {
	const form = useForm({
		defaultValues: {
			saram: profile?.saram || "",
			role: (profile?.role || "user") as UserLevelOrNull,
			om: profile?.om || "",
		},
		validators: {
			onChange: editUserSchema,
		},
		onSubmit: async ({ value }) => {
			if (!profile) return
			await onSubmit({
				saram: value.saram,
				role: value.role,
				om: value.om || null,
			})
		},
	})

	// Sync form values when profile/open changes
	React.useEffect(() => {
		if (profile && open) {
			form.reset({
				saram: profile.saram || "",
				role: profile.role || null,
				om: profile.om || "",
			})
		}
	}, [profile, open, form])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>Editar Perfil</DialogTitle>
					<DialogDescription>
						Altere o SARAM, OM e a Role do usuário:{" "}
						<span className="font-medium text-gray-900">{profile?.email}</span>
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
												placeholder={isLoadingUnits ? "Carregando OMs..." : "Selecione a OM"}
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
										value={field.state.value ?? ""}
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

					<DialogFooter className="mt-4">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancelar
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? "Salvando..." : "Salvar alterações"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
