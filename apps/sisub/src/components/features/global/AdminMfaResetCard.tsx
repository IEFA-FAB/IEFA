import { Loader2, ShieldOff } from "lucide-react"
import * as React from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { useResetUserMfa, useUserMfaStatus } from "@/hooks/data/useAdminMfa"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { ADMIN_RESET_REASON_HINT, ADMIN_RESET_REASON_MAX_LENGTH, ADMIN_RESET_REASON_MIN_LENGTH, IDENTITY_CHANNEL_CONFIRMATION } from "@/lib/mfa-admin-reset"

/**
 * Reset administrativo do segundo fator de um usuário, na tela de Gestão de Acesso.
 *
 * ## Por que fica separado do resto da tela
 *
 * Conceder e revogar permissão é rotina; remover o segundo fator de alguém desconecta o
 * titular de todas as sessões e não tem desfazer. Misturar a ação à tabela de permissões a
 * transformaria num botão a mais numa linha — e é assim que uma operação de exceção vira
 * clique de reflexo. Daí o bloco próprio, ao final, com borda destacada em TODOS os lados:
 * faixa de acento lateral é proibida pelo contrato de estilo.
 *
 * ## As duas perguntas que o diálogo faz antes de deixar prosseguir
 *
 * A identidade foi verificada fora do e-mail? E por quê? A primeira existe porque, no cenário
 * em que o segundo fator é a última defesa, o adversário já tem a caixa de e-mail do titular —
 * confirmar por e-mail seria confirmar com ele. A segunda vira `reason` em
 * `access_control.mfa_reset_log`, lido em auditoria. As duas são validadas TAMBÉM no servidor:
 * o endpoint é chamável direto por HTTP, e trava que só existe na tela não é trava.
 */

interface AdminMfaResetCardProps {
	user: { id: string; email: string }
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback
}

export function AdminMfaResetCard({ user }: AdminMfaResetCardProps) {
	const status = useUserMfaStatus(user.id)
	const [open, setOpen] = React.useState(false)

	const totalFactors = (status.data?.verifiedFactors ?? 0) + (status.data?.pendingFactors ?? 0)

	return (
		<div className="rounded-lg border border-destructive/40 bg-card p-6 space-y-4">
			<div className="space-y-1">
				<h3 className="text-heading">Verificação em duas etapas</h3>
				<p className="text-sm text-muted-foreground">
					Remover o segundo fator de {user.email} desconecta a pessoa de todas as sessões e invalida os códigos de recuperação dela. Use apenas quando o titular
					perdeu o acesso ao dispositivo e a identidade dele já foi confirmada fora do e-mail.
				</p>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3">
				{status.isLoading ? (
					<Skeleton className="h-5 w-56" />
				) : status.isError ? (
					// Estado vazio que mente sobre falha é pior que erro visível: sem o dado, a tela
					// não afirma que a pessoa está sem dispositivo nenhum.
					<p className="text-sm text-destructive">Não foi possível consultar os dispositivos deste usuário.</p>
				) : (
					<p className="text-sm">
						{totalFactors === 0 ? (
							<span className="text-muted-foreground">Nenhum dispositivo cadastrado.</span>
						) : (
							<>
								<span className="text-subheading">{status.data?.verifiedFactors ?? 0}</span> dispositivo(s) ativo(s)
								{(status.data?.pendingFactors ?? 0) > 0 && <> e {status.data?.pendingFactors} cadastro(s) não concluído(s)</>}.
							</>
						)}
					</p>
				)}

				<Button variant="destructive" disabled={status.isLoading || totalFactors === 0} onClick={() => setOpen(true)} className="gap-1.5 shrink-0">
					<ShieldOff className="size-4" aria-hidden />
					Remover segundo fator
				</Button>
			</div>

			{/* A contagem de dispositivos se atualiza sozinha: `useResetUserMfa` invalida a
			    query desta tela no sucesso, e ela está montada aqui. */}
			<AdminMfaResetDialog open={open} onOpenChange={setOpen} user={user} emailNoticeAvailable={status.data?.emailNoticeAvailable ?? false} />
		</div>
	)
}

function AdminMfaResetDialog({
	open,
	onOpenChange,
	user,
	emailNoticeAvailable,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	user: { id: string; email: string }
	emailNoticeAvailable: boolean
}) {
	const [identityConfirmed, setIdentityConfirmed] = React.useState(false)
	const [reason, setReason] = React.useState("")
	const [error, setError] = React.useState<string | null>(null)
	const resetMfa = useResetUserMfa()

	const reasonLength = reason.trim().length
	const canSubmit = identityConfirmed && reasonLength >= ADMIN_RESET_REASON_MIN_LENGTH

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setIdentityConfirmed(false)
			setReason("")
			setError(null)
		}
		onOpenChange(next)
	}

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		setError(null)
		try {
			const result = await resetMfa.mutateAsync({
				targetUserId: user.id,
				reason: reason.trim(),
				identityVerifiedOutsideEmail: identityConfirmed,
			})
			toast.success("Segundo fator removido", {
				description: result.emailNotified
					? `${user.email} foi avisado por e-mail e precisa cadastrar um novo dispositivo no próximo acesso.`
					: `O registro em auditoria foi gravado, mas ${user.email} NÃO foi avisado por e-mail. Avise a pessoa por outro canal.`,
			})
			handleOpenChange(false)
		} catch (caught) {
			// Fechar o modal de elevação não é falha: o diálogo continua aberto, com a
			// justificativa digitada, e nada foi removido. Um erro em vermelho ali mandaria o
			// administrador investigar uma desistência dele mesmo.
			if (isElevationCancelled(caught)) return
			setError(errorMessage(caught, "Não foi possível remover o segundo fator."))
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Remover a verificação em duas etapas</DialogTitle>
					<DialogDescription>Esta ação vale para a conta {user.email}.</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					<Alert variant="destructive">
						<ShieldOff aria-hidden />
						<AlertTitle>O que acontece ao confirmar</AlertTitle>
						<AlertDescription>
							Todos os dispositivos e os códigos de recuperação da pessoa são removidos, e ela é desconectada de todas as sessões. A operação fica registrada
							com o seu nome e a justificativa abaixo.
						</AlertDescription>
					</Alert>

					{!emailNoticeAvailable && (
						<Alert>
							<AlertTitle>O titular não será avisado por e-mail</AlertTitle>
							<AlertDescription>Não há provider de e-mail configurado neste ambiente. O registro em auditoria é gravado do mesmo jeito.</AlertDescription>
						</Alert>
					)}

					<Label className="flex items-start gap-3 text-body font-normal">
						<Checkbox checked={identityConfirmed} onCheckedChange={(value) => setIdentityConfirmed(value === true)} />
						<span>{IDENTITY_CHANNEL_CONFIRMATION}</span>
					</Label>

					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="mfa-reset-reason">Justificativa</FieldLabel>
							<Textarea
								id="mfa-reset-reason"
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								maxLength={ADMIN_RESET_REASON_MAX_LENGTH}
								rows={3}
								placeholder="Ex.: celular institucional extraviado, identidade confirmada por telefone com a chefia da seção."
								required
							/>
							<FieldDescription>{ADMIN_RESET_REASON_HINT}</FieldDescription>
							<FieldError>{error}</FieldError>
						</Field>
					</FieldGroup>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={resetMfa.isPending}>
							Cancelar
						</Button>
						<Button type="submit" variant="destructive" disabled={!canSubmit || resetMfa.isPending}>
							{resetMfa.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
							Remover segundo fator
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
