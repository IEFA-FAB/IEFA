import { createFileRoute, redirect } from "@tanstack/react-router"
import { LogOut, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { MfaEnrollDialog } from "@/components/features/diner/MfaEnrollDialog"
import { RecoveryCodesDialog } from "@/components/features/diner/RecoveryCodesDialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMfaOverview } from "@/hooks/data/useMfa"
import { useGenerateRecoveryCodes, useRecoveryCodeOverview } from "@/hooks/data/useMfaRecovery"

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
	},
	component: MfaEnrollmentPage,
	head: () => ({
		meta: [{ title: "Cadastrar verificação em duas etapas — SISUB" }],
	}),
})

function MfaEnrollmentPage() {
	const { data: overview } = useMfaOverview()
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
					description: error instanceof Error ? error.message : "Gere-os pela tela de segurança.",
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
						{hasFactor
							? "Sua conta já tem um dispositivo cadastrado. Você pode seguir para o sistema."
							: "Sua conta está sem segundo fator. Cadastre um dispositivo para voltar a usar as funções protegidas do sistema."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{!hasFactor && (
						<Alert>
							<ShieldCheck aria-hidden />
							<AlertTitle>As funções protegidas seguem indisponíveis</AlertTitle>
							<AlertDescription>
								Enquanto não houver um dispositivo cadastrado, as operações que exigem confirmação de identidade continuam bloqueadas — inclusive para você.
							</AlertDescription>
						</Alert>
					)}

					{hasFactor ? (
						<Button className="w-full" onClick={() => window.location.assign("/hub")}>
							Ir para o sistema
						</Button>
					) : (
						<Button className="w-full" onClick={() => setEnrollOpen(true)}>
							Cadastrar dispositivo
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
