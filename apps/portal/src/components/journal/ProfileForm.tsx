import { Button, Input, Label, Textarea } from "@iefa/ui"
import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { z } from "zod"
import { useUpsertUserProfile } from "@/lib/journal/hooks"
import type { UserProfile } from "@/lib/journal/types"

const profileSchema = z.object({
	full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
	affiliation: z.string().optional(),
	orcid: z
		.string()
		.optional()
		.refine(
			(val) => {
				if (!val) return true
				// ORCID format: 0000-0000-0000-0000
				return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(val)
			},
			{ message: "Formato ORCID inválido (exemplo: 0000-0002-1825-0097)" }
		),
	bio: z.string().max(500, "Bio deve ter no máximo 500 caracteres").optional(),
	expertise: z.string().optional(), // Comma-separated, will be converted to array
	email_notifications: z.boolean().default(true),
})

interface ProfileFormProps {
	userId: string
	profile: UserProfile | null | undefined
	userEmail?: string | null
}

export function ProfileForm({ userId, profile, userEmail }: ProfileFormProps) {
	const [isSaving, setIsSaving] = useState(false)
	const [message, setMessage] = useState<{
		type: "success" | "error"
		text: string
	} | null>(null)

	const upsertProfile = useUpsertUserProfile()

	const form = useForm({
		defaultValues: {
			full_name: profile?.full_name || "",
			affiliation: profile?.affiliation || "",
			orcid: profile?.orcid || "",
			bio: profile?.bio || "",
			expertise: profile?.expertise?.join(", ") || "",
			email_notifications: profile?.email_notifications ?? true,
		},
		onSubmit: async ({ value }) => {
			setIsSaving(true)
			setMessage(null)

			try {
				// Validate form data
				const validation = profileSchema.safeParse(value)
				if (!validation.success) {
					const firstError = validation.error.issues[0]
					setMessage({
						type: "error",
						text: firstError.message,
					})
					setIsSaving(false)
					return
				}

				// Convert expertise string to array
				const expertiseArray = value.expertise
					? value.expertise
							.split(",")
							.map((e) => e.trim())
							.filter(Boolean)
					: []

				await upsertProfile.mutateAsync({
					id: userId,
					full_name: value.full_name,
					affiliation: value.affiliation || null,
					orcid: value.orcid || null,
					bio: value.bio || null,
					expertise: expertiseArray.length > 0 ? expertiseArray : null,
					email_notifications: value.email_notifications,
					role: profile?.role || "author", // Keep existing role or default to author
				})

				setMessage({
					type: "success",
					text: "Perfil atualizado com sucesso!",
				})
			} catch (error) {
				console.error("Error updating profile:", error)
				setMessage({
					type: "error",
					text: error instanceof Error ? error.message : "Erro ao salvar perfil. Tente novamente.",
				})
			} finally {
				setIsSaving(false)
			}
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
			{/* Email (read-only) */}
			<div className="space-y-2">
				<Label htmlFor="email">E-mail</Label>
				<Input id="email" type="email" value={userEmail || ""} disabled className="bg-muted" />
				<p className="text-sm text-muted-foreground">O e-mail não pode ser alterado nesta página</p>
			</div>

			{/* Full Name */}
			<form.Field name="full_name">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="full_name">
							Nome Completo <span className="text-destructive">*</span>
						</Label>
						<Input
							id="full_name"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							placeholder="Seu nome completo"
						/>
						{field.state.meta.errors?.length > 0 && (
							<p className="text-sm text-destructive">{String(field.state.meta.errors[0])}</p>
						)}
					</div>
				)}
			</form.Field>

			{/* Affiliation */}
			<form.Field name="affiliation">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="affiliation">Afiliação Institucional</Label>
						<Input
							id="affiliation"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							placeholder="Universidade ou instituição de pesquisa"
						/>
						<p className="text-sm text-muted-foreground">Será exibida em suas publicações</p>
					</div>
				)}
			</form.Field>

			{/* ORCID */}
			<form.Field name="orcid">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="orcid">ORCID iD</Label>
						<Input
							id="orcid"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							placeholder="0000-0000-0000-0000"
						/>
						{field.state.meta.errors?.length > 0 ? (
							<p className="text-sm text-destructive">{String(field.state.meta.errors[0])}</p>
						) : (
							<p className="text-sm text-muted-foreground">
								Identificador único para pesquisadores.{" "}
								<a
									href="https://orcid.org"
									target="_blank"
									rel="noopener noreferrer"
									className="text-primary hover:underline"
								>
									Obtenha seu ORCID
								</a>
							</p>
						)}
					</div>
				)}
			</form.Field>

			{/* Bio */}
			<form.Field name="bio">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="bio">Bio</Label>
						<Textarea
							id="bio"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							placeholder="Breve descrição sobre você e sua área de pesquisa"
							rows={4}
							maxLength={500}
						/>
						{field.state.meta.errors?.length > 0 ? (
							<p className="text-sm text-destructive">{String(field.state.meta.errors[0])}</p>
						) : (
							<p className="text-sm text-muted-foreground">
								{field.state.value.length}/500 caracteres
							</p>
						)}
					</div>
				)}
			</form.Field>

			{/* Expertise */}
			<form.Field name="expertise">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="expertise">Áreas de Expertise</Label>
						<Input
							id="expertise"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
							placeholder="Machine Learning, Biologia Molecular, etc."
						/>
						<p className="text-sm text-muted-foreground">
							Separe múltiplas áreas com vírgulas. Usado para seleção de revisores.
						</p>
					</div>
				)}
			</form.Field>

			{/* Email Notifications */}
			<form.Field name="email_notifications">
				{(field) => (
					<div className="flex items-center space-x-2">
						<input
							id="email_notifications"
							type="checkbox"
							checked={field.state.value}
							onChange={(e) => field.handleChange(e.target.checked)}
							className="size-4 rounded border-gray-300"
						/>
						<Label htmlFor="email_notifications" className="cursor-pointer">
							Receber notificações por e-mail sobre submissões e revisões
						</Label>
					</div>
				)}
			</form.Field>

			{/* Role Display (read-only for now) */}
			{profile?.role && (
				<div className="space-y-2">
					<Label>Função no Sistema</Label>
					<div className="rounded-md border bg-muted px-3 py-2">
						<span className="capitalize">{profile.role}</span>
					</div>
					<p className="text-sm text-muted-foreground">
						Contate os administradores para alterar sua função
					</p>
				</div>
			)}

			{/* Messages */}
			{message && (
				<div
					className={`rounded-md p-4 ${
						message.type === "success"
							? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
							: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
					}`}
				>
					{message.text}
				</div>
			)}

			{/* Submit Button */}
			<div className="flex gap-4">
				<Button type="submit" disabled={isSaving}>
					{isSaving ? "Salvando..." : "Salvar Perfil"}
				</Button>
			</div>
		</form>
	)
}
