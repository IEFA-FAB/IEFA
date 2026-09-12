import { ASSURANCE_FRESHNESS_WINDOW_SECONDS } from "@iefa/pbac"
import { useQueryClient } from "@tanstack/react-query"
import { KeyRound, Loader2, RotateCcw, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { MfaEnrollDialog } from "@/components/features/diner/MfaEnrollDialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { useMfaOverview, useVerifyMfaChallenge } from "@/hooks/data/useMfa"
import { type AssurancePrompt, resolveElevationStep } from "@/lib/assurance/assurance-error"
import { syncElevatedSession } from "@/lib/assurance/session-elevation"
import { verificationCodeErrorMessage } from "@/lib/mfa-messages"
import { queryKeys } from "@/lib/query-keys"
import supabase from "@/lib/supabase"

/**
 * Modal de elevação, aberto POR CIMA da tela que estava sendo usada.
 *
 * ## O que este componente não faz, e é o ponto dele
 *
 * Não navega. Nem para `/auth`, nem para `/auth/challenge`, nem para `/diner/security`. Sair
 * da rota descartaria o formulário que a pessoa acabou de preencher — e perder meia hora de
 * digitação por causa de seis dígitos é o que faz uma organização inteira odiar segundo
 * fator. Todos os três caminhos (`enroll`, `challenge`, `step-up`) se resolvem aqui dentro, e
 * o cancelamento devolve o usuário ao formulário intacto, com a sessão ativa.
 *
 * ## O motivo fica visível, sempre
 *
 * Pedir um código sem dizer por quê é o treinamento perfeito para phishing: a pessoa aprende
 * a digitar seis dígitos toda vez que uma caixa aparece. O `reason` vem do servidor, descreve
 * a OPERAÇÃO barrada, e é a primeira coisa do modal.
 *
 * @domain app
 */

interface AssuranceElevationDialogProps {
	prompt: AssurancePrompt
	/** `true` quando a sessão foi elevada (a mutação será reenviada), `false` no cancelamento. */
	onResolved: (elevated: boolean) => void
}

const FRESHNESS_WINDOW_MINUTES = Math.round(ASSURANCE_FRESHNESS_WINDOW_SECONDS / 60)

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback
}

export function AssuranceElevationDialog({ prompt, onResolved }: AssuranceElevationDialogProps) {
	const queryClient = useQueryClient()
	const { data: overview, isLoading } = useMfaOverview()
	const verifyChallenge = useVerifyMfaChallenge()

	const [enrolling, setEnrolling] = useState(false)
	const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null)
	const [code, setCode] = useState("")
	const [failedAttempts, setFailedAttempts] = useState(0)
	const [error, setError] = useState<string | null>(null)
	const [adopting, setAdopting] = useState(false)
	/** `true` quando a verificação passou mas a sessão desta aba não subiu — só a recarga resolve. */
	const [sessionStuck, setSessionStuck] = useState(false)

	const factors = overview?.factors ?? []
	const factorId = selectedFactorId ?? factors[0]?.id ?? null
	const step = resolveElevationStep(prompt.nextStep, overview?.verifiedCount)

	/**
	 * Depois da verificação: adotar o par de tokens novo SEM recarregar a página.
	 *
	 * As telas do cadastro concluem com `window.location.reload()` porque o client do
	 * navegador precisa reler os cookies. Aqui a recarga é proibida — ela levaria junto o
	 * formulário preenchido. Ver `lib/assurance/session-elevation.ts`.
	 */
	const adoptElevatedSession = async () => {
		setAdopting(true)
		const result = await syncElevatedSession(supabase.auth)
		// O AAL da sessão mudou: o cartão de segurança e o desafio leem daqui.
		queryClient.invalidateQueries({ queryKey: queryKeys.sisub.mfaOverview() })
		setAdopting(false)

		if (result === "elevated") {
			onResolved(true)
			return
		}

		// Caminho raro e honesto: a verificação foi aceita pelo GoTrue, mas esta aba não
		// enxergou o par novo. Reenviar agora seria recusado outra vez. A recarga é oferecida,
		// nunca automática — quem decide perder o formulário é o usuário.
		setSessionStuck(true)
		setError(
			result === "no-session"
				? "Sua sessão não está mais ativa nesta aba. Recarregue a página para entrar de novo."
				: "O código foi aceito, mas esta aba não recebeu a sessão atualizada. Recarregue a página e refaça a operação."
		)
	}

	const handleSubmitCode = async (event: React.FormEvent) => {
		event.preventDefault()
		if (!factorId) return
		// Enter repetido dispara o submit antes de o botão desabilitar, e o segundo envio
		// queimaria o mesmo código de 6 dígitos — que é de uso único.
		if (verifyChallenge.isPending || adopting) return
		setError(null)
		try {
			await verifyChallenge.mutateAsync({ factorId, code })
			setCode("")
			setFailedAttempts(0)
			await adoptElevatedSession()
		} catch (caught) {
			const attempts = failedAttempts + 1
			setFailedAttempts(attempts)
			setCode("")
			setError(verificationCodeErrorMessage(attempts, errorMessage(caught, "Não foi possível verificar o código.")))
		}
	}

	/**
	 * Cadastro concluído a partir daqui: a sessão ATUAL é promovida a AAL2 (são as OUTRAS que
	 * o GoTrue encerra), então o formulário desta aba sobrevive e a mutação segue.
	 */
	const handleEnrolled = async () => {
		setEnrolling(false)
		toast.success("Verificação em duas etapas ativada", {
			description: "Gerencie dispositivos e códigos de recuperação em Perfil › Segurança.",
		})
		await adoptElevatedSession()
	}

	// Passo curto e sem controle nenhum: entre a verificação aceita e a adoção do par de
	// tokens, mostrar de volta o formulário de cadastro (ou o campo de código, já vazio)
	// pareceria que a verificação não pegou — e alguém tentaria de novo.
	if (adopting) {
		return (
			<Dialog open>
				<DialogContent className="sm:max-w-md" showCloseButton={false} data-testid="assurance-elevation-dialog">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
							Concluindo a verificação
						</DialogTitle>
						<DialogDescription>Só um instante — sua ação será enviada em seguida.</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		)
	}

	if (enrolling) {
		return (
			<MfaEnrollDialog
				open
				// A conta chegou aqui sem fator verificado — este é o primeiro, e a senha é o que
				// impede uma sessão roubada de cadastrar o autenticador do atacante (design.md D14).
				requiresPassword
				onOpenChange={(next) => {
					// Desistir do cadastro volta ao modal de elevação, não ao formulário: quem fecha
					// o cadastro ainda pode querer trocar de conta ou cancelar de vez.
					if (!next) setEnrolling(false)
				}}
				onEnrolled={handleEnrolled}
			/>
		)
	}

	return (
		<Dialog
			open
			onOpenChange={(next) => {
				if (!next) onResolved(false)
			}}
		>
			<DialogContent className="sm:max-w-md" data-testid="assurance-elevation-dialog">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
						Confirme sua identidade
					</DialogTitle>
					<DialogDescription>
						{step === "enroll"
							? "Esta ação exige verificação em duas etapas, e sua conta ainda não tem um dispositivo cadastrado."
							: "Informe o código de 6 dígitos do seu aplicativo autenticador para concluir a ação."}
					</DialogDescription>
				</DialogHeader>

				{/* O motivo vem primeiro e sempre: código pedido sem explicação treina a pessoa a
				    digitar seis dígitos para qualquer caixa que apareça. */}
				<Alert data-testid="assurance-elevation-reason">
					<ShieldCheck aria-hidden />
					<AlertTitle>Por que estamos pedindo</AlertTitle>
					<AlertDescription>{prompt.reason}</AlertDescription>
				</Alert>

				{prompt.origin === "api-key" ? (
					<>
						<p className="text-body text-muted-foreground">
							Esta operação não pode ser executada por chave de API. Entre no sistema com sua conta e refaça a ação.
						</p>
						<DialogFooter>
							<Button type="button" onClick={() => onResolved(false)}>
								Entendi
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						{isLoading && <Skeleton className="h-24 w-full rounded-lg" />}

						{!isLoading && step === "enroll" && (
							<>
								<p className="text-body text-muted-foreground">
									O cadastro leva cerca de dois minutos e não descarta o que você preencheu: ao terminar, esta ação é enviada automaticamente.
								</p>
								{/* A sessão travada precisa aparecer TAMBÉM aqui: sem isto, um cadastro
								    concluído que não promoveu a aba voltaria a oferecer "Cadastrar
								    dispositivo", como se nada tivesse acontecido. */}
								{error && <p className="text-caption text-destructive">{error}</p>}
								<DialogFooter>
									<Button type="button" variant="outline" data-testid="assurance-elevation-cancel" onClick={() => onResolved(false)}>
										Agora não
									</Button>
									{sessionStuck ? (
										<Button type="button" onClick={() => window.location.reload()}>
											<RotateCcw className="size-4" aria-hidden />
											Recarregar a página
										</Button>
									) : (
										<Button type="button" data-testid="assurance-elevation-enroll" onClick={() => setEnrolling(true)}>
											Cadastrar dispositivo
										</Button>
									)}
								</DialogFooter>
							</>
						)}

						{!isLoading && step === "code" && (
							<form onSubmit={handleSubmitCode} className="space-y-4">
								<FieldGroup>
									{factors.length > 1 && (
										<Field>
											<FieldLabel htmlFor="assurance-factor">Dispositivo</FieldLabel>
											<Select value={factorId} onValueChange={(value) => setSelectedFactorId(value as string)}>
												<SelectTrigger id="assurance-factor" className="w-full">
													<SelectValue>{factors.find((factor) => factor.id === factorId)?.friendlyName ?? "Dispositivo sem nome"}</SelectValue>
												</SelectTrigger>
												<SelectContent alignItemWithTrigger={false}>
													{factors.map((factor) => (
														<SelectItem key={factor.id} value={factor.id}>
															{factor.friendlyName ?? "Dispositivo sem nome"}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</Field>
									)}

									<Field>
										<FieldLabel htmlFor="assurance-code">Código de 6 dígitos</FieldLabel>
										<Input
											id="assurance-code"
											data-testid="assurance-elevation-code"
											value={code}
											onChange={(event) => setCode(event.target.value)}
											inputMode="numeric"
											autoComplete="one-time-code"
											autoFocus
											maxLength={7}
											placeholder="000000"
											className="font-mono text-center"
											required
										/>
										<FieldDescription>
											{prompt.grade === "fresh"
												? `A confirmação vale por ${FRESHNESS_WINDOW_MINUTES} minutos — as próximas ações deste bloco não pedem o código de novo.`
												: "Sua sessão precisa ter passado pela verificação em duas etapas para concluir esta ação."}
										</FieldDescription>
										<FieldError>{error}</FieldError>
									</Field>
								</FieldGroup>

								<DialogFooter>
									<Button type="button" variant="outline" data-testid="assurance-elevation-cancel" onClick={() => onResolved(false)}>
										Cancelar
									</Button>
									{sessionStuck ? (
										<Button type="button" onClick={() => window.location.reload()}>
											<RotateCcw className="size-4" aria-hidden />
											Recarregar a página
										</Button>
									) : (
										<Button type="submit" data-testid="assurance-elevation-confirm" disabled={verifyChallenge.isPending || adopting || code.trim().length < 6}>
											{verifyChallenge.isPending || adopting ? (
												<Loader2 className="size-4 animate-spin" aria-hidden />
											) : (
												<KeyRound className="size-4" aria-hidden />
											)}
											Confirmar
										</Button>
									)}
								</DialogFooter>
							</form>
						)}

						{/* Nenhum atalho para os códigos de recuperação aqui, e é deliberado: a tela de
						    recuperação fica em /auth/recovery-code e navegar até ela descartaria o
						    formulário. Quem perdeu o aparelho cancela, resolve pelo login e volta. */}
						<p className="text-caption text-muted-foreground">Cancelar não encerra sua sessão, e o que você preencheu continua na tela.</p>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
