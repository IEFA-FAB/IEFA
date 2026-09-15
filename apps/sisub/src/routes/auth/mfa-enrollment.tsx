import { createFileRoute, redirect } from "@tanstack/react-router"
import { LogOut, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { MfaEnrollDialog } from "@/components/features/diner/MfaEnrollDialog"
import { RecoveryCodesDialog } from "@/components/features/diner/RecoveryCodesDialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMfaOverview } from "@/hooks/data/useMfa"
import { useGenerateRecoveryCodes, useRecoveryCodeOverview } from "@/hooks/data/useMfaRecovery"
import { MFA_AVAILABLE, MFA_ENFORCEMENT_ALLOWED } from "@/lib/assurance/mfa-availability"
import { readableMfaError } from "@/lib/mfa-messages"

/**
 * Recadastro obrigatório do segundo fator, depois de um código de recuperação consumido.
 *
 * ## O que "obrigatória" significa aqui, e o que não significa
 *
 * A tela não tem navegação: nem barra lateral, nem atalho para o sistema — só o cadastro e a
 * saída. O que a torna obrigatória de verdade, porém, não é a ausência de links: é que a
 * sessão está em AAL1 e **nenhuma operação classificada é alcançável** enquanto o fator não
 * for cadastrado (design.md D8). Um bloqueio de navegação seria teatro sobre um controle que
 * já existe no servidor.
 *
 * A ação de sair fica SEMPRE visível: quem chegou aqui pode ter chegado sem querer, e uma
 * tela de segurança sem saída é como se trancam pessoas fora da própria conta.
 */
export const Route = createFileRoute("/auth/mfa-enrollment")({
	beforeLoad: ({ context, location }) => {
		// Sem sessão não há o que cadastrar: a senha vem primeiro, e o destino é preservado.
		if (!context.auth.user) throw redirect({ to: "/auth", search: { redirect: location.href } })
		// Verificação em duas etapas desligada (`MFA_AVAILABLE`): esta etapa não existe.
		if (!MFA_AVAILABLE) throw redirect({ to: "/hub", replace: true })
	},
	component: MfaEnrollmentPage,
	head: () => ({
		meta: [{ title: "Cadastrar verificação em duas etapas — SISUB" }],
	}),
})

function MfaEnrollmentPage() {
	const { data: overview, isLoading, error: overviewError } = useMfaOverview()
	const recovery = useRecoveryCodeOverview()
	const generateCodes = useGenerateRecoveryCodes()
	const { signOut } = useAuth()

	const [enrollOpen, setEnrollOpen] = useState(false)
	/** Texto claro dos códigos novos — só na memória desta tela, nunca no cache. */
	const [freshCodes, setFreshCodes] = useState<string[] | null>(null)

	const hasFactor = (overview?.verifiedCount ?? 0) > 0

	const handleEnrolled = async () => {
		setEnrollOpen(false)

		// Conta protegida não recebe códigos (design.md D9) — ela segue para o sistema e é
		// convidada ao dispositivo reserva pela tela de segurança.
		if (overview?.isProtectedAccount === false && recovery.data?.eligible !== false) {
			try {
				const generated = await generateCodes.mutateAsync()
				setFreshCodes(generated.codes)
				return
			} catch (error) {
				toast.error("Dispositivo cadastrado, mas os códigos de recuperação não foram gerados", {
					description: readableMfaError(error, "Gere-os pela tela de segurança."),
				})
			}
		}

		window.location.assign("/hub")
	}

	return (
		<div className="flex-1 flex w-full items-center justify-center px-4 py-12">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
						Cadastre a verificação em duas etapas
					</CardTitle>
					<CardDescription>
						{isLoading || overviewError
							? "Verificando o estado da verificação em duas etapas da sua conta."
							: hasFactor
								? "Sua conta já tem um dispositivo cadastrado. Você pode seguir para o sistema."
								: MFA_ENFORCEMENT_ALLOWED
									? "Sua conta está sem segundo fator. Cadastre um dispositivo para voltar a usar as funções protegidas do sistema."
									: "Sua conta está sem segundo fator. Cadastrar um novo dispositivo é opcional — você pode seguir para o sistema agora e fazer isso depois pela tela de segurança."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Só é verdade no modo `enforced`: fora dele nada exige segundo fator, e dizer que
					    as funções "continuam bloqueadas" seria mentir para quem acabou de perder o dispositivo. */}
					{isLoading && <Skeleton className="h-20 w-full rounded-lg" />}

					{/* Falha de leitura não vira "sem segundo fator": oferecer o cadastro a quem já tem
					    dispositivo levaria a um erro do GoTrue que esta tela não explica. */}
					{!isLoading && overviewError && (
						<div className="space-y-4">
							<p className="text-body text-destructive">{readableMfaError(overviewError, "Não foi possível verificar os dispositivos da sua conta.")}</p>
							<Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
								Tentar de novo
							</Button>
						</div>
					)}

					{!isLoading && !overviewError && !hasFactor && MFA_ENFORCEMENT_ALLOWED && (
						<Alert>
							<ShieldCheck aria-hidden />
							<AlertTitle>As funções protegidas seguem indisponíveis</AlertTitle>
							<AlertDescription>
								Enquanto não houver um dispositivo cadastrado, as operações que exigem confirmação de identidade continuam bloqueadas — inclusive para você.
							</AlertDescription>
						</Alert>
					)}

					{isLoading || overviewError ? null : hasFactor ? (
						<Button className="w-full" onClick={() => window.location.assign("/hub")}>
							Ir para o sistema
						</Button>
					) : (
						<Button className="w-full" onClick={() => setEnrollOpen(true)}>
							Cadastrar dispositivo
						</Button>
					)}

					{/* Segundo fator é opcional fora do modo `enforced` (`MFA_MODE`): quem gastou um código
					    de recuperação não pode ficar preso entre "cadastrar" e "sair". */}
					{!isLoading && !overviewError && !hasFactor && !MFA_ENFORCEMENT_ALLOWED && (
						<Button variant="outline" className="w-full" onClick={() => window.location.assign("/hub")}>
							Continuar sem verificação em duas etapas
						</Button>
					)}

					{/* Sempre visível: tela de segurança sem saída tranca a pessoa fora da conta. */}
					<Button
						variant="ghost"
						size="sm"
						className="w-full"
						onClick={async () => {
							await signOut()
							// Página inteira: a sessão acabou de ser descartada, e um `navigate()`
							// manteria em memória o client que ainda acha que ela existe.
							window.location.assign("/auth")
						}}
					>
						<LogOut className="size-4" aria-hidden />
						Sair da conta
					</Button>
				</CardContent>
			</Card>

			{/* `requiresPassword`: a conta ficou SEM fator, então este é o primeiro de novo — e a
			    senha é o que impede uma sessão roubada de cadastrar o autenticador do atacante
			    (design.md D14). */}
			<MfaEnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} requiresPassword onEnrolled={handleEnrolled} />

			{freshCodes && (
				<RecoveryCodesDialog
					open
					codes={freshCodes}
					emailNoticeAvailable={recovery.data?.emailNoticeAvailable !== false}
					onDone={() => window.location.assign("/hub")}
				/>
			)}
		</div>
	)
}
