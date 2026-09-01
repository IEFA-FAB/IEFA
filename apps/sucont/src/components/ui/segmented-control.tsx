import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import type { VariantProps } from "class-variance-authority"

import { Toggle, type toggleVariants } from "#/components/ui/toggle"
import { cn } from "#/lib/utils"

/**
 * Segmentado de escolha única — o controle de FILTRO do sucont.
 *
 * Não é `Tabs`. Uma aba controla um `tabpanel`; estes controles filtram ou
 * reconfiguram o conteúdo que já está na tela (nível de agregação do auditor,
 * conferente do analista de compatibilidade, tipo de documento, visão do
 * monitoramento). Renderizá-los como `role="tab"` sem `tabpanel` promete ao leitor
 * de tela uma região que não existe.
 *
 * Antes eram quatro grupos de `<button>` nativos pintados à mão — cada um com sua
 * altura e seu estado ativo, e nenhum navegável por seta do teclado. A aparência
 * aqui é deliberadamente a mesma do `TabsList`: para o usuário que enxerga, o hub
 * tem UM segmentado; a diferença é de semântica, não de forma.
 */
interface SegmentedControlProps<T extends string> extends VariantProps<typeof toggleVariants> {
	value: T
	onValueChange: (value: T) => void
	options: ReadonlyArray<{ value: T; label: React.ReactNode }>
	/** Rótulo acessível do grupo — obrigatório: sem ele o conjunto não se anuncia. */
	label: string
	className?: string
}

export function SegmentedControl<T extends string>({ value, onValueChange, options, label, size, className }: SegmentedControlProps<T>) {
	return (
		<ToggleGroupPrimitive
			aria-label={label}
			multiple={false}
			value={[value]}
			// Clicar no item já ativo devolve `[]`. Um segmentado de escolha única não
			// tem estado "nenhum": ignorar o vazio mantém a seleção onde está.
			onValueChange={(next) => {
				const picked = next[0] as T | undefined
				if (picked) onValueChange(picked)
			}}
			className={cn("inline-flex w-fit items-center justify-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground", className)}
		>
			{options.map((option) => (
				<Toggle key={option.value} value={option.value} size={size}>
					{option.label}
				</Toggle>
			))}
		</ToggleGroupPrimitive>
	)
}
