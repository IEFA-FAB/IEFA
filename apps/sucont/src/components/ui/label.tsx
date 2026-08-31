/** biome-ignore-all lint/a11y/noLabelWithoutControl: primitivo genérico — o controle vem do call site via htmlFor */
import type * as React from "react"

import { cn } from "#/lib/utils"

/**
 * Rótulo de campo. `<label>` nativo, como no sisub: o Base UI não expõe um
 * primitivo de Label, e o do Radix só embrulhava a tag por nada.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
	return (
		<label
			data-slot="label"
			className={cn(
				"flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className
			)}
			{...props}
		/>
	)
}

export { Label }
