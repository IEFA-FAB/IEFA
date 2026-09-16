import { useBlocker } from "@tanstack/react-router"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/**
 * Trava a saída do editor enquanto houver alteração não gravada.
 *
 * Os editores de cardápio gravam em dois ritmos: os locais auto-salvam 1,5 s depois da última
 * tecla, e os globais (plano da SDAB, ou template global aberto numa cozinha) só gravam no
 * botão Salvar. Nos dois casos dava para perder tudo clicando em "Imprimir" — que é um link —
 * ou em "Cancelar": o app não tinha nenhuma guarda de saída.
 *
 * Cobre navegação interna (pelo roteador) e fechar/recarregar a aba (`enableBeforeUnload`).
 */
export function UnsavedChangesGuard({ when, message }: { when: boolean; message?: string }) {
	const blocker = useBlocker({
		shouldBlockFn: () => when,
		enableBeforeUnload: () => when,
		disabled: !when,
		withResolver: true,
	})

	return (
		<AlertDialog open={blocker.status === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
					<AlertDialogDescription>{message ?? "Há alterações que ainda não foram gravadas. Se sair agora, elas serão perdidas."}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => blocker.reset?.()}>Continuar editando</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
						Sair sem salvar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
