import type * as React from "react"

import { READ_ONLY_FIELD } from "#/components/ui/field-states"
import { cn } from "#/lib/utils"

// O `size` nativo do `<input>` (largura em caracteres) não é usado no app; o nome fica para a
// densidade, como no `SelectTrigger`. O `default` não leva prefixo `data-[size=default]:` para que
// os pontos de uso que ainda trocam `h-*`/`px-*` por `className` continuem vencendo.
type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
	size?: "default" | "sm"
}

function Input({ className, type, size = "default", ...props }: InputProps) {
	return (
		<input
			type={type}
			data-slot="input"
			data-size={size}
			className={cn(
				"h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
				"data-[size=sm]:h-8 data-[size=sm]:px-2.5",
				READ_ONLY_FIELD,
				"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
				className
			)}
			{...props}
		/>
	)
}

export { Input }
