import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMilitaryData, useUserData } from "@/hooks/auth/useProfile"
import { useUpdateNrOrdem } from "@/hooks/business/useUserNrOrdem"
import { queryKeys } from "@/lib/query-keys"
import { toNameCase } from "@/lib/utils"
import type { MilitaryDataRow } from "@/types/domain/admin"

export const Route = createFileRoute("/_protected/_modules/diner/profile")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: ProfilePage,
	head: () => ({
		meta: [{ title: "Perfil - SISUB" }, { name: "description", content: "Gerencie seu perfil e dados militares" }],
	}),
})

const profileSchema = z.object({
	nrOrdem: z.string().regex(/^\d*$/, "Apenas números são permitidos").max(20, "Máximo de 20 caracteres"),
})

function DataField({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
	return (
		<div className="space-y-0.5">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className={mono ? "text-sm font-mono" : "text-sm"}>{value && String(value).trim().length > 0 ? value : "—"}</dd>
		</div>
	)
}

function onlyDigits(value: string | null | undefined) {
	return String(value ?? "").replace(/\D/g, "")
}

function formatCpf(value: string | null | undefined) {
	const digits = onlyDigits(value)
	if (digits.length !== 11) return value && String(value).trim().length > 0 ? String(value) : "—"
	return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

function maskCpfGov(value: string | null | undefined) {
	const digits = onlyDigits(value)
	if (digits.length !== 11) return value && String(value).trim().length > 0 ? "***.***.***-**" : "—"
	return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}

function CpfField({ value }: { value: string | null | undefined }) {
	const [isVisible, setIsVisible] = useState(false)
	const hasValue = !!value && String(value).trim().length > 0
	const displayValue = isVisible ? formatCpf(value) : maskCpfGov(value)
	const Icon = isVisible ? EyeOff : Eye

	return (
		<div className="space-y-0.5">
			<dt className="text-xs text-muted-foreground">CPF</dt>
			<dd className="flex min-h-8 items-center gap-2">
				<span className="text-sm font-mono">{displayValue}</span>
				{hasValue && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={isVisible ? "Ocultar CPF" : "Visualizar CPF"}
						aria-pressed={isVisible}
						onClick={() => setIsVisible((current) => !current)}
					>
						<Icon className="size-4" aria-hidden="true" />
					</Button>
				)}
			</dd>
		</div>
	)
}

function MilitaryPanel({ military, effectiveNrOrdem }: { military: MilitaryDataRow; effectiveNrOrdem: string }) {
	return (
		<dl className="space-y-4">
			<div className="grid grid-cols-2 gap-x-6 gap-y-4">
				<div className="col-span-2">
					<DataField label="Nome" value={military.nmPessoa ? toNameCase(military.nmPessoa) : military.nmPessoa} />
				</div>
				<DataField label="Nome de Guerra" value={military.nmGuerra ? toNameCase(military.nmGuerra) : military.nmGuerra} />
				<DataField label="Nr. de Ordem" value={military.nrOrdem ?? effectiveNrOrdem} mono />
				<CpfField value={military.nrCpf} />
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
	const effectiveNrOrdem = userData?.nrOrdem ?? ""
	const { data: military, isLoading: isLoadingMilitary } = useMilitaryData(effectiveNrOrdem)
	const updateNrOrdem = useUpdateNrOrdem()

	const form = useForm({
		defaultValues: { nrOrdem: "" },
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
			if (!user) return
			await updateNrOrdem.mutateAsync({ user, nrOrdem: value.nrOrdem ?? "" })
			await queryClient.invalidateQueries({ queryKey: queryKeys.user.data(user.id) })
		},
	})

	useEffect(() => {
		if (userData?.nrOrdem) {
			form.setFieldValue("nrOrdem", userData.nrOrdem)
		}
	}, [userData?.nrOrdem, form])

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
								<form.Field name="nrOrdem">
									{(field) => (
										<Field>
											<FieldLabel htmlFor={field.name}>Nr. de Ordem</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												placeholder="Ex.: 1234567"
												inputMode="numeric"
												pattern="[0-9]*"
											/>
											<FieldError errors={field.state.meta.errors?.map((e) => ({ message: String(e) }))} />
											<FieldDescription>Vincula sua conta ao cadastro militar automaticamente.</FieldDescription>
										</Field>
									)}
								</form.Field>
							</FieldGroup>

							<div className="flex items-center gap-3">
								<Button type="submit" disabled={updateNrOrdem.isPending || !!form.state.isSubmitting}>
									{updateNrOrdem.isPending ? (
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
						<CardDescription>
							{effectiveNrOrdem ? "Encontrados a partir do Nr. de Ordem." : "Informe seu Nr. de Ordem para localizar seus dados."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{!effectiveNrOrdem ? (
							<div className="py-10 text-center">
								<p className="text-sm text-muted-foreground">Nenhum Nr. de Ordem informado.</p>
							</div>
						) : isLoadingMilitary ? (
							<div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								<span className="text-sm">Buscando dados...</span>
							</div>
						) : military ? (
							<MilitaryPanel military={military} effectiveNrOrdem={effectiveNrOrdem} />
						) : (
							<div className="py-10 text-center space-y-1">
								<p className="text-sm text-muted-foreground">
									Nenhum registro encontrado para <span className="font-mono text-foreground">{effectiveNrOrdem}</span>.
								</p>
								<p className="text-xs text-muted-foreground">Verifique se o número está correto.</p>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
