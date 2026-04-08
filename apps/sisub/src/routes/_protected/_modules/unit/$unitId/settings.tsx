import { useForm, useStore } from "@tanstack/react-form"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { Building2, ExternalLink, MapPin, ShieldCheck } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useUasgInfo } from "@/hooks/data/useUasgInfo"
import { useUnitSettings, useUpdateUnitSettings } from "@/hooks/data/useUnitSettings"
import type { UasgInfo } from "@/server/uasg-lookup.fn"
import type { UnitSettingsInput } from "@/server/unit-settings.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/settings")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: UnitSettingsPage,
	head: () => ({
		meta: [{ title: "Configurações da Unidade" }],
	}),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCep(value: string) {
	const digits = value.replace(/\D/g, "").slice(0, 8)
	if (digits.length <= 5) return digits
	return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function formatUasg(value: string) {
	return value.replace(/\D/g, "").slice(0, 6)
}

function formatCnpj(value: string) {
	const d = value.replace(/\D/g, "")
	if (d.length !== 14) return value
	return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function formatDate(iso: string | null | undefined) {
	if (!iso) return "—"
	try {
		return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(iso))
	} catch {
		return iso
	}
}

// ─── UASG Info Panel ─────────────────────────────────────────────────────────

function UasgInfoRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5 min-w-0">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="text-sm font-medium truncate">{value ?? "—"}</span>
		</div>
	)
}

function UasgInfoPanel({ uasg }: { uasg: string }) {
	const { data, isLoading, isError, error } = useUasgInfo(uasg)

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
						<CardTitle className="text-base">Dados da UASG no Compras.gov.br</CardTitle>
					</div>
					<CardDescription>Consultando dados da UASG {uasg}…</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						{Array.from({ length: 9 }).map((_, i) => (
							<div key={i} className="flex flex-col gap-1">
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-4 w-36" />
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		)
	}

	if (isError) {
		return (
			<Card className="border-destructive/40">
				<CardHeader>
					<div className="flex items-center gap-2">
						<ShieldCheck className="h-4 w-4 text-destructive" aria-hidden="true" />
						<CardTitle className="text-base">Dados da UASG no Compras.gov.br</CardTitle>
					</div>
					<CardDescription className="text-destructive">
						Não foi possível consultar a UASG {uasg}: {error?.message}
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	if (!data) {
		return (
			<Card className="border-dashed">
				<CardHeader>
					<div className="flex items-center gap-2">
						<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
						<CardTitle className="text-base">Dados da UASG no Compras.gov.br</CardTitle>
					</div>
					<CardDescription>Nenhuma UASG ativa encontrada para o código {uasg}.</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	return <UasgInfoCard data={data} />
}

function UasgInfoCard({ data }: { data: UasgInfo }) {
	const comprasUrl = `https://www.compras.gov.br/uasg/detalhe/${data.codigoUasg}`

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
						<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
						<CardTitle className="text-base">Dados da UASG no Compras.gov.br</CardTitle>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{data.statusUasg ? <Badge variant="success">Ativa</Badge> : <Badge variant="destructive">Inativa</Badge>}
						<a
							href={comprasUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Compras.gov.br
							<ExternalLink className="h-3 w-3" />
						</a>
					</div>
				</div>
				<CardDescription>Informações oficiais recuperadas diretamente da API pública do Compras.gov.br (módulo UASG 8.1).</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-5">
					{/* Identificação */}
					<section>
						<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Identificação</h4>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<UasgInfoRow label="Nome da UASG" value={data.nomeUasg} />
							<UasgInfoRow label="Código UASG" value={data.codigoUasg} />
							<UasgInfoRow label="CNPJ da UASG" value={data.cnpjCpfUasg ? formatCnpj(data.cnpjCpfUasg) : "—"} />
							<UasgInfoRow label="Código SIORG" value={data.codigoSiorg || "—"} />
							<UasgInfoRow label="Município / UF" value={`${data.nomeMunicipioIbge} / ${data.siglaUf}`} />
							<UasgInfoRow
								label="UASG Cadastradora"
								value={
									<Badge variant={data.uasgCadastradora ? "secondary" : "outline"} className="text-xs font-normal">
										{data.uasgCadastradora ? "Sim" : "Não"}
									</Badge>
								}
							/>
						</div>
					</section>

					{/* Órgão */}
					<section>
						<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Órgão Superior</h4>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<UasgInfoRow label="Código do Órgão" value={data.codigoOrgao || "—"} />
							<UasgInfoRow label="CNPJ do Órgão" value={data.cnpjCpfOrgao ? formatCnpj(data.cnpjCpfOrgao) : "—"} />
							<UasgInfoRow label="CNPJ Órgão Vinculado" value={data.cnpjCpfOrgaoVinculado ? formatCnpj(data.cnpjCpfOrgaoVinculado) : "—"} />
							<UasgInfoRow label="CNPJ Órgão Superior" value={data.cnpjCpfOrgaoSuperior ? formatCnpj(data.cnpjCpfOrgaoSuperior) : "—"} />
						</div>
					</section>

					{/* Sistemas */}
					<section>
						<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Sistemas</h4>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<UasgInfoRow
								label="Uso SISG"
								value={
									<Badge variant={data.usoSisg ? "secondary" : "outline"} className="text-xs font-normal">
										{data.usoSisg ? "Sim" : "Não"}
									</Badge>
								}
							/>
							<UasgInfoRow
								label="Adesão SIASG"
								value={
									<Badge variant={data.adesaoSiasg ? "secondary" : "outline"} className="text-xs font-normal">
										{data.adesaoSiasg ? "Sim" : "Não"}
									</Badge>
								}
							/>
							<UasgInfoRow label="Unidade Polo" value={data.nomeUnidadePolo || "—"} />
							<UasgInfoRow label="Unidade Espelho" value={data.nomeUnidadeEspelho || "—"} />
						</div>
					</section>

					{/* Datas */}
					<section>
						<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Histórico</h4>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<UasgInfoRow label="Implantação SIDEC" value={formatDate(data.dataImplantacaoSidec)} />
							<UasgInfoRow label="Última atualização" value={formatDate(data.dataHoraMovimento)} />
						</div>
					</section>
				</div>
			</CardContent>
		</Card>
	)
}

// ─── Inner form (rendered only after data loads) ──────────────────────────────

function UnitSettingsForm({ unitId, defaultValues }: { unitId: number; defaultValues: UnitSettingsInput }) {
	const updateMutation = useUpdateUnitSettings(unitId)

	const form = useForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			await updateMutation.mutateAsync(value)
		},
	})

	// Subscreve ao valor atual do campo uasg para acionar o lookup reativo
	const uasgValue = useStore(form.store, (state) => state.values.uasg)

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				form.handleSubmit()
			}}
			className="space-y-6"
		>
			{/* ── Dados de Licitação ─────────────────────────────────────────── */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
						<CardTitle className="text-base">Dados de Licitação</CardTitle>
					</div>
					<CardDescription>Informações utilizadas na geração de atas de Registro de Preços no ComprasNet.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<form.Field name="uasg">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>
										UASG
										<span className="text-muted-foreground font-normal ml-1 text-xs">(6 dígitos)</span>
									</FieldLabel>
									<FieldContent>
										<Input
											id={field.name}
											value={field.state.value ?? ""}
											onChange={(e) => field.handleChange(formatUasg(e.target.value) || null)}
											onBlur={field.handleBlur}
											placeholder="Ex: 160074"
											inputMode="numeric"
											maxLength={6}
											className="max-w-48"
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

			{/* ── Endereço da Unidade ────────────────────────────────────────── */}
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
						<CardTitle className="text-base">Endereço da Unidade</CardTitle>
					</div>
					<CardDescription>Endereço oficial da unidade, utilizado nos documentos de licitação e correspondências.</CardDescription>
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
													placeholder="Av. das Forças Armadas"
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
											placeholder="Bloco A, Sala 10..."
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

			{/* ── Integração Compras.gov.br ──────────────────────────────────── */}
			{uasgValue && uasgValue.length === 6 && <UasgInfoPanel uasg={uasgValue} />}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

function UnitSettingsPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)

	const { data: unit, isLoading, error } = useUnitSettings(unitId)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Configurações da Unidade"
				description="Gerencie os dados institucionais e o endereço da unidade utilizados em documentos de licitação."
			/>

			{isLoading ? (
				<div className="space-y-4">
					<div className="h-40 animate-pulse rounded-lg border bg-muted" aria-hidden="true" />
					<div className="h-64 animate-pulse rounded-lg border bg-muted" aria-hidden="true" />
				</div>
			) : error ? (
				<p className="text-sm text-destructive">Erro ao carregar dados: {error.message}</p>
			) : unit ? (
				<UnitSettingsForm
					key={unit.id}
					unitId={unitId}
					defaultValues={{
						uasg: unit.uasg ?? null,
						address_logradouro: unit.address_logradouro ?? null,
						address_numero: unit.address_numero ?? null,
						address_complemento: unit.address_complemento ?? null,
						address_bairro: unit.address_bairro ?? null,
						address_municipio: unit.address_municipio ?? null,
						address_uf: unit.address_uf ?? null,
						address_cep: unit.address_cep ?? null,
					}}
				/>
			) : null}
		</div>
	)
}
