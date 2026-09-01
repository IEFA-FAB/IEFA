import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "#/lib/utils"

const toggleVariants = cva(
	"hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm focus-visible:border-ring focus-visible:ring-ring/50 gap-1.5 rounded-md text-sm font-medium transition-all [&_svg:not([class*='size-'])]:size-4 group/toggle text-foreground/60 inline-flex items-center justify-center whitespace-nowrap outline-none focus-visible:ring-[3px] cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				outline: "border-input hover:bg-muted border bg-transparent",
			},
			size: {
				default: "h-7 min-w-7 px-2.5",
				sm: "h-6 min-w-6 px-2 text-xs",
				lg: "h-9 min-w-9 px-4",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	}
)

function Toggle({ className, variant = "default", size = "default", ...props }: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	return <TogglePrimitive data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
}

export { Toggle, toggleVariants }
