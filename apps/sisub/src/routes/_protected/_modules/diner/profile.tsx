import { describeSaramStatus } from "@iefa/database/saram-link"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { SecuritySummaryCard } from "@/components/features/diner/SecuritySummaryCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMilitaryData, useUserData } from "@/hooks/auth/useProfile"
import { useSaramStatus } from "@/hooks/business/useUserSaram"
import { MFA_AVAILABLE } from "@/lib/assurance/mfa-availability"
import { toNameCase } from "@/lib/utils"
import type { MilitaryDataRow } from "@/types/domain/admin"

export const Route = createFileRoute("/_protected/_modules/diner/profile")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: ProfilePage,
	head: () => ({
		meta: [{ name: "description", content: "Gerencie seu perfil e dados militares" }],
	}),
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

	const { data: userData, isLoading: isLoadingUserData } = useUserData(user?.id)
	const effectiveSaram = userData?.saram ?? ""
	const { data: military, isLoading: isLoadingMilitary } = useMilitaryData(effectiveSaram)
	// O SARAM não se digita aqui: o vínculo é verificado em "Meu cadastro militar" (change
	// `saram-verified-link`), e o perfil só mostra o estado e leva até lá.
	const { data: saramStatus } = useSaramStatus()
	const statusView = saramStatus ? describeSaramStatus(saramStatus) : null
	const badgeVariant =
		statusView?.tone === "ok" ? "success" : statusView?.tone === "blocked" ? "destructive" : statusView?.tone === "attention" ? "warning" : "outline"

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
							<span className="text-caption text-muted-foreground">E-mail</span>
							<p className="text-body">{user?.email ?? userData?.email ?? "Carregando..."}</p>
						</div>

						<Separator />

						<div className="space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-caption text-muted-foreground">Cadastro militar</span>
								{statusView && <Badge variant={badgeVariant}>{statusView.badge}</Badge>}
								{isLoadingUserData && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Carregando" />}
							</div>
							{statusView && <p className="text-body text-foreground">{statusView.title}</p>}
							<Button
								variant={statusView?.needsAttention ? "default" : "outline"}
								size="sm"
								nativeButton={false}
								render={<Link to="/diner/military-record">{statusView?.notice?.cta ?? "Ver meu cadastro militar"}</Link>}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Dados militares */}
				<Card>
					<CardHeader>
						<CardTitle>Dados militares</CardTitle>
						<CardDescription>
							{military ? "Do cadastro de pessoal, pelo SARAM verificado." : "Aparecem quando o vínculo do SARAM estiver confirmado."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{!effectiveSaram || (!isLoadingMilitary && !military) ? (
							<div className="py-10 text-center space-y-1">
								<p className="text-body text-muted-foreground">{statusView?.title ?? "Nenhum cadastro militar vinculado."}</p>
								<p className="text-caption text-muted-foreground">
									<Link to="/diner/military-record" className="underline underline-offset-2 hover:text-foreground">
										Ver o que fazer
									</Link>
								</p>
							</div>
						) : isLoadingMilitary ? (
							<div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								<span className="text-sm">Buscando dados...</span>
							</div>
						) : military ? (
							<MilitaryPanel military={military} effectiveSaram={effectiveSaram} />
						) : null}
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
