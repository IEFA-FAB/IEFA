import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type UseDraftOptions, useDraft } from "@/hooks/forms/useDraft"
import { cn } from "@/lib/cn"
import { PendingChanges } from "./PendingChanges"

interface DraftSaveBarProps<T extends Record<string, unknown>> extends Omit<UseDraftOptions<T>, "key"> {
	/** Chave do rascunho (`key` é reservada pelo React e não chegaria aqui). */
	draftKey: string | null
	/** Volta o formulário ao estado salvo. O rascunho é apagado junto. */
	onDiscard: () => void
	/**
	 * `true` nas abas da própria entidade. Fora delas (abas de itens, fluxo…) a barra só
	 * aparece com alteração pendente — senão seriam dois "Salvar" disputando a mesma tela.
	 */
	primary: boolean
	/** Esconde a barra sem desmontar o rascunho (ex.: preview de versão). */
	hidden?: boolean
	caption: string
	formId: string
	saveLabel: string
	onBack: () => void
	isPending: boolean
	/** Salvar sem alteração ainda grava (criar, personalizar). Padrão: desabilita. */
	allowCleanSave?: boolean
	contentClassName?: string
}

/**
 * Barra fixa de salvamento explícito (modo A de `docs/SAVE_BEHAVIOR.md`): rascunho,
 * alterações pendentes, Voltar e Salvar. É componente próprio para que só ELA re-renderize
 * a cada tecla — o `useStore` dos valores no topo do formulário re-renderizava a tela
 * inteira (todas as abas) a cada caractere. Fica sempre montada, mesmo invisível: é ela
 * que restaura e grava o rascunho.
 */
export function DraftSaveBar<T extends Record<string, unknown>>({
	draftKey,
	onDiscard,
	primary,
	hidden,
	caption,
	formId,
	saveLabel,
	onBack,
	isPending,
	allowCleanSave = false,
	contentClassName,
	...draftOptions
}: DraftSaveBarProps<T>) {
	const draft = useDraft({ ...draftOptions, key: draftKey })
	if (hidden || !(primary || draft.isDirty)) return null

	return (
		<div className="sticky bottom-0 z-10 -mx-3 border-t border-border bg-background px-3 py-3 sm:-mx-6 sm:px-6">
			<div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", contentClassName)}>
				<p className="text-caption text-muted-foreground">{caption}</p>
				<div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0 sm:flex-nowrap">
					<PendingChanges draft={draft} onDiscard={onDiscard} disabled={isPending} />
					<Button type="button" variant="outline" onClick={onBack}>
						Voltar
					</Button>
					<Button type="submit" form={formId} disabled={isPending || (!allowCleanSave && !draft.isDirty)}>
						{isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
						{saveLabel}
					</Button>
				</div>
			</div>
		</div>
	)
}
