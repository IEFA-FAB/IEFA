// ~/routes/_protected/superAdmin.tsx

import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Label,
	Switch,
	Textarea,
} from "@iefa/ui"
import { useForm } from "@tanstack/react-form"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { toast } from "sonner"
import { z } from "zod"
import { PageHeader } from "@/components/common/layout/PageHeader"
import IndicatorsCard from "@/components/features/super-admin/IndicatorsCard"
import ProfilesManager from "@/components/features/super-admin/ProfilesManager"
import { useAuth } from "@/hooks/auth/useAuth"
import { useEvalConfig } from "@/hooks/business/useEvalConfig"
import { adminProfileQueryOptions } from "@/services/AdminService"
import type { EvalConfig } from "@/types/domain/"

export const Route = createFileRoute("/_protected/superAdmin/")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}

		const profile = await context.queryClient.ensureQueryData(adminProfileQueryOptions(user.id))

		if (profile?.role !== "superadmin") {
			throw redirect({ to: "/forecast" })
		}
	},
	component: SuperAdminPanel,
	head: () => ({
		meta: [
			{ title: "Painel SuperAdmin" },
			{
				name: "description",
				content: "Controle o sistema de subsistência",
			},
		],
	}),
})

// Schema de validação
const evalSchema = z.object({
	active: z.boolean(),
	value: z.string().max(240, "Máximo de 240 caracteres"),
})

function SuperAdminPanel() {
	const { user } = useAuth()

	// Ensure hook order
	// Suspense Query for Admin Profile (kept for pattern consistency)
	useSuspenseQuery(adminProfileQueryOptions(user?.id ?? ""))

	// Suspense Query for Eval Config is inside useEvalConfig
	const { config, updateConfig, isSaving } = useEvalConfig()

	if (!user) {
		return null
	}

	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section id="hero" className="container mx-auto max-w-screen-2xl px-4 pt-10">
				<PageHeader title="Painel SuperAdmin" description="Controle o sistema de subsistência" />
			</section>

			{/* Conteúdo */}
			<section id="content" className="container mx-auto max-w-screen-2xl px-4 py-10 md:py-14">
				<div className="grid grid-cols-1 gap-6 lg:gap-8">
					<IndicatorsCard />
					<ProfilesManager />

					<Card className="border-2">
						<CardHeader>
							<CardTitle>Configuração da Pergunta de Avaliação</CardTitle>
							<CardDescription>
								Ligue/desligue a pergunta global de avaliação e defina o texto exibido aos usuários.
							</CardDescription>
						</CardHeader>

						<CardContent>
							<EvaluationForm initialData={config} onSubmit={updateConfig} isSaving={isSaving} />
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	)
}

interface EvaluationFormProps {
	initialData: EvalConfig
	onSubmit: (data: EvalConfig) => Promise<EvalConfig>
	isSaving: boolean
}

function EvaluationForm({ initialData, onSubmit, isSaving }: EvaluationFormProps) {
	const form = useForm({
		defaultValues: initialData,
		validators: {
			onChange: ({ value }) => {
				const result = evalSchema.safeParse(value)
				if (result.success) return undefined
				const errors: Record<string, string> = {}
				result.error.issues.forEach((issue) => {
					errors[issue.path.join(".")] = issue.message
				})
				return errors
			},
		},
		onSubmit: async ({ value }) => {
			try {
				await onSubmit(value)
				toast.success("Configuração salva com sucesso.")
			} catch (error: any) {
				toast.error("Erro ao salvar configuração", {
					description: error?.message || "Ocorreu um erro desconhecido",
				})
			}
		},
	})

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
			className="space-y-6"
		>
			<form.Field name="active">
				{(field) => (
					<div className="flex items-center justify-between gap-4">
						<div>
							<Label htmlFor={field.name} className="text-base">
								Ativar pergunta
							</Label>
							<p className="text-sm text-muted-foreground">
								Quando ativo, usuários que ainda não responderam verão a pergunta.
							</p>
						</div>
						<Switch
							id={field.name}
							className="cursor-pointer"
							checked={field.state.value}
							onCheckedChange={field.handleChange}
							disabled={isSaving || form.state.isSubmitting}
						/>
					</div>
				)}
			</form.Field>

			<form.Field name="value">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor={field.name}>Texto da pergunta</Label>
						<Textarea
							id={field.name}
							placeholder="Ex.: Como você avalia sua experiência no Rancho?"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={isSaving || form.state.isSubmitting}
							rows={3}
							className="resize-y"
						/>
						<div className="flex justify-between text-xs">
							<span className="text-destructive">{field.state.meta.errors.join(", ")}</span>
							<span className="text-muted-foreground">{field.state.value.length}/240</span>
						</div>
					</div>
				)}
			</form.Field>

			<CardFooter className="-mx-6 -mb-6 flex items-center justify-end gap-2 bg-muted/20 px-6 py-4 mt-6">
				<form.Subscribe selector={(state) => [state.isDirty, state.canSubmit, state.isSubmitting]}>
					{([isDirty, canSubmit, isSubmitting]) => (
						<>
							<Button
								type="button"
								variant="ghost"
								onClick={() => form.reset()}
								disabled={!isDirty || isSaving || isSubmitting}
							>
								Reverter
							</Button>
							<Button type="submit" disabled={!canSubmit || isSaving || isSubmitting}>
								{isSaving || isSubmitting ? (
									<span className="inline-flex items-center gap-2">
										<span className="h-4 w-4 animate-spin rounded-full border-2 border-b-transparent" />
										Salvando...
									</span>
								) : (
									"Salvar alterações"
								)}
							</Button>
						</>
					)}
				</form.Subscribe>
			</CardFooter>
		</form>
	)
}
