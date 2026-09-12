import { createFileRoute, Link } from "@tanstack/react-router"
import { AlertTriangle, KeyRound, LifeBuoy, ShieldAlert, ShieldCheck, Terminal } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ActiveSessionsCard } from "@/components/features/diner/ActiveSessionsCard"
import { MfaBackupInviteDialog } from "@/components/features/diner/MfaBackupInviteDialog"
import { MfaEnrollDialog } from "@/components/features/diner/MfaEnrollDialog"
import { MfaFactorList } from "@/components/features/diner/MfaFactorList"
import { RecoveryCodesDialog } from "@/components/features/diner/RecoveryCodesDialog"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { useActiveSessions, useMfaOverview, useSignOutOtherSessions, useUnenrollMfaFactor } from "@/hooks/data/useMfa"
import { useGenerateRecoveryCodes, useRecoveryCodeOverview } from "@/hooks/data/useMfaRecovery"

/**
 * Tela de segurança da conta.
 *
 * O guard é `diner` nível 1 e NADA além disso: abrir esta tela é leitura, e leitura nunca
 * pede segundo fator (design.md D3). Quem entra aqui sem fator nenhum precisa justamente
 * desta tela para cadastrar o primeiro — exigir prova de segundo fator para abri-la seria um
 * beco sem saída.
 */
export const Route = createFileRoute("/_protected/_modules/diner/security")({
	beforeLoad: (opts) => requirePermission(opts, "diner", 1),
	component: SecurityPage,
	head: () => ({
		meta: [{ title: "Segurança — SISUB" }, { name: "description", content: "Verificação em duas etapas, dispositivos e sessões da sua conta." }],
	}),
})

/**
 * Recarga completa da página depois de uma operação que trocou os tokens da sessão.
 *
 * `verify` e `refreshSession` emitem um par de tokens novo, gravado nos cookies pelo servidor.
 * O client do navegador mantém a sessão ANTIGA em memória e continuaria renovando com um
 * refresh token já rodado — `router.invalidate()` não resolve isso, porque não recria o
 * client. A recarga recria, e ele lê os cookies novos.
 */
function reloadAfterSessionChange() {
	window.location.reload()
}

function SecurityPage() {
	const { data: overview, isLoading, error: overviewError } = useMfaOverview()
	const sessions = useActiveSessions()
	const unenrollFactor = useUnenrollMfaFactor()
	const signOutOthers = useSignOutOtherSessions()
	const recovery = useRecoveryCodeOverview()
	const generateCodes = useGenerateRecoveryCodes()

	const [enrollOpen, setEnrollOpen] = useState(false)
	const [enrollIsFirstFactor, setEnrollIsFirstFactor] = useState(false)
	const [replacingFactorId, setReplacingFactorId] = useState<string | null>(null)
	const [backupInviteOpen, setBackupInviteOpen] = useState(false)
	/**
	 * Os códigos em claro vivem AQUI e em nenhum outro lugar do cliente — nem no cache do
	 * react-query, que sobrevive à navegação e aparece nas devtools. Saem da memória quando a
	 * pessoa conclui o diálogo.
	 */
	const [freshCodes, setFreshCodes] = useState<string[] | null>(null)
	/** `true` quando o diálogo de códigos precede o convite ao dispositivo reserva. */
	const [invitesBackupAfterCodes, setInvitesBackupAfterCodes] = useState(false)

	const factors = overview?.factors ?? []
	const hasFactor = factors.length > 0
	const canManage = overview?.canManageFactors !== false

	const openEnrollment = (options: { replacingFactorId?: string; knownExistingFactor?: boolean } = {}) => {
		// `knownExistingFactor` existe para o convite ao dispositivo reserva: ele abre logo
		// depois de um cadastro concluído, quando a consulta ainda pode não ter recarregado —
		// e sem isso a tela pediria a senha de novo por achar que ainda não há fator nenhum.
		setEnrollIsFirstFactor(!(options.knownExistingFactor ?? hasFactor))
		setReplacingFactorId(options.replacingFactorId ?? null)
		setBackupInviteOpen(false)
		setEnrollOpen(true)
	}

	const handleEnrolled = async () => {
		setEnrollOpen(false)

		if (replacingFactorId) {
			// Ordem deliberada: o dispositivo novo já está verificado quando o antigo sai, de
			// modo que a conta nunca fica sem fator nenhum no meio da substituição.
			try {
				await unenrollFactor.mutateAsync(replacingFactorId)
			} catch (error) {
				toast.error("Dispositivo novo cadastrado, mas o antigo não foi removido", {
					description: error instanceof Error ? error.message : "Tente removê-lo pela lista.",
				})
			}
			setReplacingFactorId(null)
			reloadAfterSessionChange()
			return
		}

		if (enrollIsFirstFactor) {
			// Conta protegida NÃO recebe códigos (design.md D9) — para ela o caminho de volta é o
			// dispositivo reserva, e o convite vem direto.
			if (overview?.isProtectedAccount === false) {
				const generated = await issueCodes({ inviteBackupAfter: true })
				if (generated) return
			}
			setBackupInviteOpen(true)
			return
		}

		reloadAfterSessionChange()
	}

	/**
	 * Emite os códigos e abre o diálogo. Devolve `false` quando a emissão falha — e aí o fluxo
	 * segue sem eles: um erro ao gerar códigos não pode desfazer o cadastro do fator que
	 * acabou de ser concluído, nem prender a pessoa numa tela intermediária.
	 */
	const issueCodes = async ({ inviteBackupAfter }: { inviteBackupAfter: boolean }): Promise<boolean> => {
		try {
			const generated = await generateCodes.mutateAsync()
			setInvitesBackupAfterCodes(inviteBackupAfter)
			setFreshCodes(generated.codes)
			return true
		} catch (error) {
			toast.error("Não foi possível gerar os códigos de recuperação", {
				description: error instanceof Error ? error.message : "Tente novamente pela tela de segurança.",
			})
			return false
		}
	}

	const handleCodesAcknowledged = () => {
		setFreshCodes(null)
		if (invitesBackupAfterCodes) {
			setInvitesBackupAfterCodes(false)
			setBackupInviteOpen(true)
			return
		}
		reloadAfterSessionChange()
	}

	const handleRemove = async (factorId: string) => {
		try {
			await unenrollFactor.mutateAsync(factorId)
			reloadAfterSessionChange()
		} catch (error) {
			toast.error("Não foi possível remover o dispositivo", {
				description: error instanceof Error ? error.message : "Tente novamente.",
			})
		}
	}

	const handleSignOutOthers = async () => {
		try {
			await signOutOthers.mutateAsync()
			toast.success("As demais sessões foram encerradas.")
		} catch (error) {
			toast.error("Não foi possível encerrar as outras sessões", {
				description: error instanceof Error ? error.message : "Tente novamente.",
			})
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Segurança da conta" description="Verificação em duas etapas, dispositivos cadastrados e sessões abertas." />

			{!canManage && (
				<Alert>
					<AlertTriangle aria-hidden />
					<AlertTitle>Sessão aberta por link de recuperação</AlertTitle>
					<AlertDescription>
						Nesta sessão você pode consultar, mas não alterar os dispositivos de verificação. Saia e entre novamente com sua senha para gerenciá-los.
					</AlertDescription>
				</Alert>
			)}

			{overview?.needsBackupFactor && (
				<Alert>
					<ShieldAlert aria-hidden />
					<AlertTitle>Cadastre um dispositivo reserva</AlertTitle>
					<AlertDescription>
						Sua conta alcança operações críticas do sistema. Com um único dispositivo cadastrado, perder o aparelho significa perder o acesso até que um
						administrador o restabeleça.
					</AlertDescription>
				</Alert>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Verificação em duas etapas</CardTitle>
					<CardDescription>
						Um código de 6 dígitos, gerado pelo seu aplicativo autenticador, além da senha. Protege a conta mesmo que a senha vaze.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading && (
						<div className="space-y-2">
							<Skeleton className="h-16 w-full rounded-lg" />
						</div>
					)}

					{/* Falha de leitura tem tela PRÓPRIA: cair no estado vazio afirmaria "sua conta
					    usa apenas senha" justamente quando o sistema não conseguiu verificar. */}
					{!isLoading && overviewError && (
						<Alert variant="destructive">
							<AlertTriangle aria-hidden />
							<AlertTitle>Não foi possível verificar o estado da sua conta</AlertTitle>
							<AlertDescription>
								{overviewError instanceof Error && overviewError.message ? overviewError.message : "Recarregue a página e tente novamente."}
							</AlertDescription>
						</Alert>
					)}

					{!isLoading && !overviewError && !hasFactor && (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ShieldCheck className="size-5" aria-hidden />
								</EmptyMedia>
								<EmptyTitle>Sua conta usa apenas senha</EmptyTitle>
								<EmptyDescription>
									Leva menos de dois minutos: você lê um QR code no aplicativo autenticador e confirma um código de 6 dígitos.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button disabled={!canManage} onClick={() => openEnrollment()}>
									Configurar verificação em duas etapas
								</Button>
							</EmptyContent>
						</Empty>
					)}

					{!isLoading && !overviewError && hasFactor && (
						<>
							<MfaFactorList
								factors={factors}
								canManage={canManage}
								isRemoving={unenrollFactor.isPending}
								onReplace={(factor) => openEnrollment({ replacingFactorId: factor.id })}
								onRemove={(factor) => handleRemove(factor.id)}
							/>
							<Button variant="outline" size="sm" disabled={!canManage} onClick={() => openEnrollment()}>
								Cadastrar segundo dispositivo
							</Button>
						</>
					)}
				</CardContent>
			</Card>

			<ActiveSessionsCard data={sessions.data} isLoading={sessions.isLoading} isSigningOut={signOutOthers.isPending} onSignOutOthers={handleSignOutOthers} />

			{hasFactor && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<LifeBuoy className="size-4 text-muted-foreground" aria-hidden />
							Códigos de recuperação
						</CardTitle>
						<CardDescription>Códigos de uso único que devolvem o acesso à conta se você perder o aparelho com o aplicativo autenticador.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{recovery.isLoading && <Skeleton className="h-10 w-full rounded-lg" />}

						{!recovery.isLoading && recovery.data?.eligible === false && (
							<p className="text-body text-muted-foreground">
								Sua conta alcança operações críticas do sistema e, por isso, não utiliza códigos de recuperação — uma folha de papel não pode valer um empenho.
								Seus caminhos de volta são o dispositivo reserva e o restabelecimento por um administrador.
							</p>
						)}

						{!recovery.isLoading && recovery.data?.eligible && (
							<>
								<p className="text-body text-muted-foreground">
									{recovery.data.available > 0
										? `${recovery.data.available} de ${recovery.data.perGeneration} códigos ainda disponíveis.`
										: "Você não tem códigos de recuperação disponíveis."}
								</p>
								{recovery.data.emailNoticeAvailable === false && (
									<p className="text-caption text-muted-foreground">
										Este ambiente não envia aviso por e-mail: o uso de um código fica registrado no histórico do sistema.
									</p>
								)}
								<Button variant="outline" size="sm" disabled={!canManage || generateCodes.isPending} onClick={() => issueCodes({ inviteBackupAfter: false })}>
									{recovery.data.available > 0 ? "Gerar novos códigos" : "Gerar códigos de recuperação"}
								</Button>
								{recovery.data.available > 0 && <p className="text-caption text-muted-foreground">Gerar novos códigos invalida os anteriores.</p>}
							</>
						)}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Terminal className="size-4 text-muted-foreground" aria-hidden />
						Chaves de API
					</CardTitle>
					<CardDescription>
						Credenciais de prazo longo que agem em seu nome no sisub-mcp, sem senha e sem segundo fator. Elas vencem, e não executam operação protegida por
						verificação em duas etapas.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="outline"
						size="sm"
						nativeButton={false}
						render={
							<Link to="/diner/mcp-keys" className="gap-2">
								<KeyRound className="size-4" aria-hidden />
								Gerenciar chaves MCP
							</Link>
						}
					/>
				</CardContent>
			</Card>

			{/* `key` amarrado ao modo: o nome padrão do dispositivo ("Meu autenticador" x
			    "Dispositivo reserva") nasce no `useState`, e sem remontar o diálogo o segundo
			    cadastro herdaria o nome do primeiro — e o GoTrue recusa nome repetido. */}
			<MfaEnrollDialog
				key={`${enrollIsFirstFactor}-${replacingFactorId ?? "new"}`}
				open={enrollOpen}
				onOpenChange={setEnrollOpen}
				requiresPassword={enrollIsFirstFactor}
				isBackup={!enrollIsFirstFactor && replacingFactorId === null}
				takenNames={factors.map((factor) => factor.friendlyName ?? "").filter((name) => name.length > 0)}
				onEnrolled={handleEnrolled}
			/>

			{freshCodes && (
				<RecoveryCodesDialog open codes={freshCodes} emailNoticeAvailable={recovery.data?.emailNoticeAvailable !== false} onDone={handleCodesAcknowledged} />
			)}

			<MfaBackupInviteDialog
				open={backupInviteOpen}
				mandatory={overview?.isProtectedAccount === true}
				onEnroll={() => openEnrollment({ knownExistingFactor: true })}
				onSkip={() => {
					setBackupInviteOpen(false)
					reloadAfterSessionChange()
				}}
			/>
		</div>
	)
}
