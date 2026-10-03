"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { cn } from "../../lib/cn"

/** Grupo de opções exclusivas (Base UI). Setas do teclado movem a escolha; o grupo é um `radiogroup`. */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
	return <RadioGroupPrimitive data-slot="radio-group" className={cn("grid w-full gap-2", className)} {...props} />
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
	return (
		<RadioPrimitive.Root
			data-slot="radio-group-item"
			className={cn(
				"border-muted-foreground/60 bg-background dark:bg-input/30 data-checked:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive relative flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border outline-none transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
				className
			)}
			{...props}
		>
			<RadioPrimitive.Indicator data-slot="radio-group-indicator" className="flex size-2 items-center justify-center rounded-full bg-primary" />
		</RadioPrimitive.Root>
	)
}

export { RadioGroup, RadioGroupItem }
