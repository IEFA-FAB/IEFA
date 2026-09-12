import { Loader2, ShieldCheck, Smartphone, Trash2 } from "lucide-react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import type { MfaFactor } from "@/server/mfa.fn"

/**
 * Lista dos dispositivos de verificação cadastrados, com substituir e remover.
 *
 * O padrão `item.tsx` é obrigatório para linha de entidade (STYLE_CONTRACT §4.3) — nada de
 * `div.border.rounded` montada à mão.
 */

interface MfaFactorListProps {
	factors: MfaFactor[]
	/** `true` enquanto uma remoção está em andamento (qualquer fator). */
	isRemoving: boolean
	/** `false` em sessão de recuperação de senha: a tela mostra, mas não deixa mexer. */
	canManage: boolean
	onReplace: (factor: MfaFactor) => void
	onRemove: (factor: MfaFactor) => void
}

function formatDate(value: string): string {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function MfaFactorList({ factors, isRemoving, canManage, onReplace, onRemove }: MfaFactorListProps) {
	return (
		<ItemGroup>
			{factors.map((factor) => (
				<Item key={factor.id} variant="outline">
					<ItemMedia variant="icon">
						<Smartphone className="size-4" aria-hidden />
					</ItemMedia>
					<ItemContent>
						<ItemTitle className="flex items-center gap-2">
							{factor.friendlyName ?? "Dispositivo sem nome"}
							<Badge variant="success">
								<ShieldCheck className="size-3" aria-hidden />
								Verificado
							</Badge>
						</ItemTitle>
						<ItemDescription>Aplicativo autenticador · cadastrado em {formatDate(factor.createdAt)}</ItemDescription>
					</ItemContent>
					<ItemActions>
						<Button variant="outline" size="sm" disabled={!canManage} onClick={() => onReplace(factor)}>
							Substituir
						</Button>
						<AlertDialog>
							<AlertDialogTrigger
								render={
									<Button variant="ghost" size="icon-sm" aria-label={`Remover ${factor.friendlyName ?? "dispositivo"}`} disabled={!canManage || isRemoving}>
										{isRemoving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
									</Button>
								}
							/>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Remover este dispositivo?</AlertDialogTitle>
									<AlertDialogDescription>
										{factors.length === 1
											? "Este é o seu único dispositivo de verificação. Sem ele, sua conta volta a ser protegida apenas pela senha."
											: "Você continuará com os demais dispositivos cadastrados para entrar na sua conta."}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancelar</AlertDialogCancel>
									<AlertDialogAction onClick={() => onRemove(factor)}>Remover</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</ItemActions>
				</Item>
			))}
		</ItemGroup>
	)
}
