import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useEffect } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { SecuritySummaryCard } from "@/components/features/diner/SecuritySummaryCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMilitaryData, useUserData } from "@/hooks/auth/useProfile"
import { useUpdateSaram } from "@/hooks/business/useUserSaram"
import { MFA_AVAILABLE } from "@/lib/assurance/mfa-availability"
import { queryKeys } from "@/lib/query-keys"
import { toNameCase } from "@/lib/utils"
import type { MilitaryDataRow } from "@/types/domain/admin"

export const Route = createFileRoute("/_protected/_modules/diner/profile")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: ProfilePage,
	head: () => ({
		meta: [{ name: "description", content: "Gerencie seu perfil e dados militares" }],
	}),
})

const profileSchema = z.object({
	saram: z.string().regex(/^\d*$/, "Apenas números são permitidos").max(20, "Máximo de 20 caracteres"),
})

function DataField({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
	return (
		<div className="space-y-0.5">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className={mono ? "text-sm font-mono" : "text-sm"}>{value && String(value).trim().length > 0 ? value : "—"}</dd>
		</div>
	)
}

/**
 * O CPF chega MASCARADO (`***.456.789-**`), montado no banco (`core.military_masked_cpf`): o
 * documento inteiro não sai de lá. Não há o que revelar aqui, então não há botão de revelar.
 */
function CpfField({ value }: { value: string | null | undefined }) {
	return <DataField label="CPF" value={value} mono />
}

function MilitaryPanel({ military, effectiveSaram }: { military: MilitaryDataRow; effectiveSaram: string }) {
	return (
		<dl className="space-y-4">
			<div className="grid grid-cols-2 gap-x-6 gap-y-4">
				<DataField label="Nome de Guerra" value={military.nmGuerra ? toNameCase(military.nmGuerra) : military.nmGuerra} />
				<DataField label="SARAM" value={military.saram ?? effectiveSaram} mono />
				<CpfField value={military.maskedCpf} />
				<div className="grid grid-cols-2 gap-x-6 col-span-2">
					<DataField label="Posto" value={military.sgPosto} />
					<DataField label="OM" value={military.sgOrg} />
				</div>
			</div>
			{military.dataAtualizacao && (
				<p className="text-xs text-muted-foreground pt-3 border-t">Atualizado em {new Date(military.dataAtualizacao).toLocaleString("pt-BR")}</p>
			)}
		</dl>
	)
}

function ProfilePage() {
	const { user } = useAuth()
	const queryClient = useQueryClient()

	const { data: userData, isLoading: isLoadingUserData } = useUserData(user?.id)
	const effectiveSaram = userData?.saram ?? ""
	const { data: military, isLoading: isLoadingMilitary } = useMilitaryData(effectiveSaram)
	const updateSaram = useUpdateSaram()
	// SARAM que já localiza um cadastro militar é write-once (`syncUserSaram`): o
	// servidor recusa a troca, então a tela nem a oferece. O que não localiza nada (erro de
	// digitação) segue editável.
	const isSaramLocked = !!effectiveSaram && !!military

	const form = useForm({
		defaultValues: { saram: "" },
		validators: {
			onChange: ({ value }) => {
				const result = profileSchema.safeParse(value)
				if (result.success) return undefined
				const errors: Record<string, string> = {}
				result.error.issues.forEach((issue) => {
					errors[issue.path.join(".")] = issue.message
				})
				return errors
			},
		},
		onSubmit: async ({ value }) => {
			if (!user || isSaramLocked) return
			try {
				await updateSaram.mutateAsync({ user, saram: value.saram ?? "" })
			} catch (error) {
				// Nr. já vinculado a outra conta, ou já travado nesta: a mensagem do servidor diz o que fazer.
				toast.error(error instanceof Error ? error.message : "Não foi possível salvar o SARAM")
				return
			}
			await queryClient.invalidateQueries({ queryKey: queryKeys.user.data(user.id) })
		},
	})

	useEffect(() => {
		if (userData?.saram) {
			form.setFieldValue("saram", userData.saram)
		}
	}, [userData?.saram, form])

	return (
		<div className="space-y-6">
			<PageHeader title="Perfil" />

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* Conta */}
				<Card>
					<CardHeader>
						<CardTitle>Conta</CardTitle>
						<CardDescription>Identificação e vínculo com o cadastro militar.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-5">
						<div className="space-y-0.5">
							<span className="text-xs text-muted-foreground">E-mail</span>
							<p className="text-sm">{user?.email ?? userData?.email ?? "Carregando..."}</p>
						</div>

						<Separator />

						<form
							onSubmit={(e) => {
								e.preventDefault()
								e.stopPropagation()
								form.handleSubmit()
							}}
							className="space-y-4"
						>
							<FieldGroup>
								<form.Field name="saram">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={field.name}>SARAM</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="Ex.: 1234567"
												inputMode="numeric"
												pattern="[0-9]*"
												readOnly={isSaramLocked}
												aria-readonly={isSaramLocked}
											/>
											<FieldError errors={field.state.meta.errors?.map((e) => ({ message: String(e) }))} />
											<FieldDescription>
												{isSaramLocked
													? "Vinculado ao seu cadastro militar. Para corrigi-lo, procure o administrador do sistema."
													: "Vincula sua conta ao cadastro militar automaticamente. Depois de localizado, o vínculo não pode ser alterado por aqui."}
											</FieldDescription>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<div className="flex items-center gap-3">
								<Button type="submit" disabled={isSaramLocked || updateSaram.isPending || !!form.state.isSubmitting}>
									{updateSaram.isPending ? (
										<>
											<Loader2 className="mr-2 size-4 animate-spin" />
											Salvando...
										</>
									) : (
										"Salvar"
									)}
								</Button>
								{isLoadingUserData && (
									<span className="text-muted-foreground text-sm flex items-center gap-1.5">
										<Loader2 className="size-3.5 animate-spin" />
										Carregando...
									</span>
								)}
							</div>
						</form>
					</CardContent>
				</Card>

				{/* Dados militares */}
				<Card>
					<CardHeader>
						<CardTitle>Dados militares</CardTitle>
						<CardDescription>{effectiveSaram ? "Encontrados a partir do SARAM." : "Informe seu SARAM para localizar seus dados."}</CardDescription>
					</CardHeader>
					<CardContent>
						{!effectiveSaram ? (
							<div className="py-10 text-center">
								<p className="text-sm text-muted-foreground">Nenhum SARAM informado.</p>
							</div>
						) : isLoadingMilitary ? (
							<div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								<span className="text-sm">Buscando dados...</span>
							</div>
						) : military ? (
							<MilitaryPanel military={military} effectiveSaram={effectiveSaram} />
						) : (
							<div className="py-10 text-center space-y-1">
								<p className="text-sm text-muted-foreground">
									Nenhum registro encontrado para <span className="font-mono text-foreground">{effectiveSaram}</span>.
								</p>
								<p className="text-xs text-muted-foreground">Verifique se o número está correto.</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Segurança da conta — cartão discreto, nunca bloqueante (spec `mfa-enrollment`).
				    Some enquanto a verificação em duas etapas estiver desligada (`MFA_AVAILABLE`). */}
				{MFA_AVAILABLE && (
					<div className="md:col-span-2">
						<SecuritySummaryCard />
					</div>
				)}
			</div>
		</div>
	)
}
