import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Convite ao dispositivo reserva, logo depois do primeiro cadastro.
 *
 * O Supabase não tem código de recuperação nativo, e a documentação é explícita: perdidos
 * todos os fatores, a conta é irrecuperável pelo próprio usuário. O segundo dispositivo é o
 * caminho de volta — e para CONTA PROTEGIDA (a que alcança empenho, liquidação, permissão) ele
 * é obrigatório, então esta tela não oferece a opção de pular.
 */

interface MfaBackupInviteDialogProps {
	open: boolean
	/** Conta protegida: sem opção de pular. */
	mandatory: boolean
	onEnroll: () => void
	onSkip: () => void
}

export function MfaBackupInviteDialog({ open, mandatory, onEnroll, onSkip }: MfaBackupInviteDialogProps) {
	return (
		<Dialog open={open} onOpenChange={(next) => !next && !mandatory && onSkip()}>
			<DialogContent showCloseButton={!mandatory}>
				<DialogHeader>
					<DialogTitle>Cadastre um segundo dispositivo</DialogTitle>
					<DialogDescription>
						{mandatory
							? "Sua conta alcança operações críticas do sistema e precisa de um dispositivo reserva. Sem ele, perder o aparelho significa perder o acesso — e só um administrador poderá devolvê-lo."
							: "Se você perder o aparelho que acabou de cadastrar, um segundo dispositivo é o que devolve o acesso à sua conta sem depender de ninguém."}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					{!mandatory && (
						<Button type="button" variant="outline" onClick={onSkip}>
							Agora não
						</Button>
					)}
					<Button type="button" onClick={onEnroll}>
						Cadastrar dispositivo reserva
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
