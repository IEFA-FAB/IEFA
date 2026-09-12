import { Check, Copy, Loader2, ShieldCheck } from "lucide-react"
import { QRCodeCanvas } from "qrcode.react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCancelMfaEnrollment, useStartMfaEnrollment, useVerifyMfaEnrollment } from "@/hooks/data/useMfa"
import { OTHER_SESSIONS_SIGNED_OUT_WARNING, verificationCodeErrorMessage } from "@/lib/mfa-messages"

/**
 * Cadastro de um fator TOTP, em duas etapas: identificação (nome do dispositivo e, no
 * primeiro fator, a senha da conta) e verificação (QR + chave em texto + código de 6 dígitos).
 *
 * A chave aparece em texto SEMPRE, ao lado do QR: metade dos computadores de seção não tem
 * câmera, e um QR code é inútil para quem vai digitar o segredo no autenticador do celular a
 * partir de outra tela.
 */

type Step = "identify" | "verify"

type Enrollment = { factorId: string; secret: string; uri: string }

interface MfaEnrollDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** `true` no primeiro fator da conta: o cadastro exige a senha antes de gerar o segredo. */
	requiresPassword: boolean
	/** `true` quando é o dispositivo reserva — muda só o texto, nunca o fluxo. */
	isBackup?: boolean
	/** Nomes já em uso na conta. O GoTrue recusa nome repetido, inclusive o do fator que está sendo substituído. */
	takenNames?: readonly string[]
	/** Chamado depois da verificação concluída. */
	onEnrolled: () => void
}

/** Agrupa o segredo de 4 em 4 para quem vai digitar à mão sem perder a conta. */
function groupSecret(secret: string): string {
	return secret.replaceAll(/(.{4})/g, "$1 ").trim()
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback
}

/**
 * Primeiro nome livre a partir de `base`.
 *
 * Existe porque "Substituir" abre este diálogo com o mesmo nome padrão que o fator sendo
 * trocado quase certamente tem — e o GoTrue recusa nome repetido. A limpeza de fatores
 * pendentes não ajuda: ela só remove os NÃO verificados, e o que está sendo substituído
 * está verificado. O usuário via `mfa_factor_name_conflict` no primeiro envio.
 */
function firstFreeName(base: string, taken: readonly string[]): string {
	const used = new Set(taken.map((name) => name.trim().toLowerCase()))
	if (!used.has(base.toLowerCase())) return base
	for (let i = 2; i < 50; i++) {
		const candidate = `${base} ${i}`
		if (!used.has(candidate.toLowerCase())) return candidate
	}
	return `${base} ${Date.now()}`
}

export function MfaEnrollDialog({ open, onOpenChange, requiresPassword, isBackup = false, takenNames = [], onEnrolled }: MfaEnrollDialogProps) {
	const [step, setStep] = useState<Step>("identify")
	const [friendlyName, setFriendlyName] = useState(() => firstFreeName(isBackup ? "Dispositivo reserva" : "Meu autenticador", takenNames))
	const [password, setPassword] = useState("")
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
	const [code, setCode] = useState("")
	const [failedAttempts, setFailedAttempts] = useState(0)
	const [error, setError] = useState<string | null>(null)
	const [secretCopied, setSecretCopied] = useState(false)

	const startEnrollment = useStartMfaEnrollment()
	const verifyEnrollment = useVerifyMfaEnrollment()
	const cancelEnrollment = useCancelMfaEnrollment()

	const reset = () => {
		setStep("identify")
		setPassword("")
		setEnrollment(null)
		setCode("")
		setFailedAttempts(0)
		setError(null)
		setSecretCopied(false)
	}

	const handleOpenChange = (next: boolean) => {
		if (!next && enrollment) {
			// Cadastro abandonado no meio deixa um fator não verificado para trás, e o nome
			// repetido barraria a próxima tentativa com um erro que a tela não explica.
			cancelEnrollment.mutate(enrollment.factorId)
		}
		if (!next) reset()
		onOpenChange(next)
	}

	const handleIdentify = async (event: React.FormEvent) => {
		event.preventDefault()
		setError(null)
		try {
			const started = await startEnrollment.mutateAsync({
				friendlyName: friendlyName.trim(),
				password: requiresPassword ? password : undefined,
			})
			setEnrollment(started)
			setStep("verify")
		} catch (caught) {
			setError(errorMessage(caught, "Não foi possível iniciar o cadastro."))
		}
	}

	const handleVerify = async (event: React.FormEvent) => {
		event.preventDefault()
		if (!enrollment) return
		setError(null)
		try {
			await verifyEnrollment.mutateAsync({ factorId: enrollment.factorId, code })
			reset()
			onEnrolled()
		} catch (caught) {
			const attempts = failedAttempts + 1
			setFailedAttempts(attempts)
			setCode("")
			setError(verificationCodeErrorMessage(attempts, errorMessage(caught, "Não foi possível verificar o código.")))
		}
	}

	const copySecret = async () => {
		if (!enrollment) return
		await navigator.clipboard.writeText(enrollment.secret)
		setSecretCopied(true)
		setTimeout(() => setSecretCopied(false), 2000)
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{isBackup ? "Cadastrar dispositivo reserva" : "Configurar verificação em duas etapas"}</DialogTitle>
					<DialogDescription>
						{step === "identify"
							? "Você vai usar um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password, entre outros)."
							: "Leia o QR code no aplicativo autenticador ou digite a chave à mão, e confirme com o código gerado."}
					</DialogDescription>
				</DialogHeader>

				{step === "identify" ? (
					<form onSubmit={handleIdentify} className="space-y-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="mfa-friendly-name">Nome do dispositivo</FieldLabel>
								<Input
									id="mfa-friendly-name"
									value={friendlyName}
									onChange={(event) => setFriendlyName(event.target.value)}
									maxLength={60}
									autoComplete="off"
									required
								/>
								<FieldDescription>Ajuda a saber qual aparelho remover depois. Ex.: "Celular pessoal".</FieldDescription>
							</Field>

							{requiresPassword && (
								<Field>
									<FieldLabel htmlFor="mfa-password">Senha da conta</FieldLabel>
									<Input
										id="mfa-password"
										type="password"
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										autoComplete="current-password"
										required
									/>
									<FieldDescription>
										Confirmamos sua senha antes do primeiro cadastro para que uma sessão aberta em outro computador não consiga cadastrar um dispositivo em seu
										nome.
									</FieldDescription>
								</Field>
							)}

							<FieldError>{error}</FieldError>
						</FieldGroup>

						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
								Cancelar
							</Button>
							<Button type="submit" disabled={startEnrollment.isPending || friendlyName.trim().length === 0}>
								{startEnrollment.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
								Continuar
							</Button>
						</DialogFooter>
					</form>
				) : (
					<form onSubmit={handleVerify} className="space-y-4">
						<div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
							{/* Preto e branco literais: o QR é uma imagem que precisa de contraste máximo
							    para a câmera, e seguir o tema quebraria a leitura no modo escuro. */}
							<div className="shrink-0 rounded-md border-2 bg-white p-3">
								{enrollment ? (
									<QRCodeCanvas
										role="img"
										aria-label="QR code do segundo fator"
										value={enrollment.uri}
										size={160}
										level="M"
										bgColor="#ffffff"
										fgColor="#111827"
									/>
								) : (
									<div className="size-40 animate-pulse rounded-md bg-muted" />
								)}
							</div>

							<div className="w-full space-y-2">
								<p className="text-caption text-muted-foreground">Sem câmera no computador? Digite esta chave no aplicativo:</p>
								<div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
									<code className="flex-1 break-all font-mono text-caption text-foreground">{enrollment ? groupSecret(enrollment.secret) : "—"}</code>
									<Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Copiar chave" onClick={copySecret}>
										{secretCopied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
									</Button>
								</div>
							</div>
						</div>

						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="mfa-code">Código de 6 dígitos</FieldLabel>
								<Input
									id="mfa-code"
									value={code}
									onChange={(event) => setCode(event.target.value)}
									inputMode="numeric"
									autoComplete="one-time-code"
									maxLength={7}
									placeholder="000000"
									className="font-mono text-center"
									required
								/>
								<FieldError>{error}</FieldError>
							</Field>
						</FieldGroup>

						{/* Antes do botão, e não depois: o usuário precisa saber o que vai acontecer
						    ANTES de apertar, não descobrir ao voltar para o outro computador deslogado. */}
						<Alert>
							<ShieldCheck aria-hidden />
							<AlertTitle>Você será desconectado dos outros dispositivos</AlertTitle>
							<AlertDescription>{OTHER_SESSIONS_SIGNED_OUT_WARNING}</AlertDescription>
						</Alert>

						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
								Cancelar
							</Button>
							<Button type="submit" disabled={verifyEnrollment.isPending || code.trim().length < 6}>
								{verifyEnrollment.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
								Confirmar e ativar
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	)
}
