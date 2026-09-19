import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check } from "iconoir-react"
import { cn } from "../../lib/utils"

/**
 * Caixa de seleção sobre `@base-ui/react/checkbox` — sem raio, borda de 1px, marcada em preto.
 * O ponteiro vem da regra base (`[role="checkbox"]` em `styles.css`), não daqui.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"peer relative flex size-4 shrink-0 items-center justify-center border border-input bg-background outline-none transition-colors",
				"data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
				"focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
				"data-disabled:opacity-50 aria-invalid:border-destructive",
				className
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current">
				<Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	)
}

export { Checkbox }
