import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

interface EditableMessageProps {
	/** Texto atual — o gerado, ou o rascunho do usuário. */
	value: string
	onChange: (text: string) => void
	/** Descarta o rascunho e volta ao texto gerado. */
	onReset: () => void
	isEdited: boolean
	/** Os metadados mudaram depois da edição — o texto exibido pode estar desatualizado. */
	isStale?: boolean
	/** Rótulo lido por leitor de tela; a tela já tem o título visível. */
	label: string
	className?: string
	/** Classes da própria área de texto — usar quando a tela mostra a mensagem em fonte monoespaçada. */
	textClassName?: string
	rows?: number
}

/**
 * Pré-visualização editável da mensagem institucional.
 *
 * A área de texto é o próprio preview: não há modo "editar" para entrar. Trocar
 * os metadados regenera o texto e descarta o rascunho — o aviso de edição some
 * junto, que é como o usuário percebe que o ajuste foi refeito do zero.
 */
export function EditableMessage({ value, onChange, onReset, isEdited, isStale, label, className, textClassName, rows }: EditableMessageProps) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<textarea
				aria-label={label}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={rows}
				spellCheck={false}
				className={cn(
					"w-full min-h-0 flex-1 resize-none rounded border border-border bg-muted p-4 text-body text-foreground leading-relaxed outline-none",
					"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
					textClassName
				)}
			/>
			{isEdited && (
				<div className="flex items-center justify-between gap-3">
					{isStale ? (
						<span className="flex items-center gap-1.5 text-caption text-warning">
							<AlertTriangle className="h-3 w-3 shrink-0" />
							Os dados da mensagem mudaram depois da sua edição. O texto acima continua sendo o seu — revise antes de copiar.
						</span>
					) : (
						<span className="text-caption text-muted-foreground">Texto editado à mão. É ele que será copiado.</span>
					)}
					<Button type="button" variant="ghost" size="xs" className="gap-1" onClick={onReset}>
						<RotateCcw className="h-3 w-3" />
						<span>Restaurar gerado</span>
					</Button>
				</div>
			)}
		</div>
	)
}
