import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "#/lib/utils"

const buttonVariants = cva(
	"inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-']):not([class*='w-']):not([class*='h-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
				outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
				// `success` e `warning` existem para os estados que hoje viram `emerald-*`
				// e `amber-*` crus nas features. Sem a variant, a migração não tem destino.
				success: "bg-success text-success-foreground shadow-xs hover:bg-success/90",
				warning: "bg-warning text-warning-foreground shadow-xs hover:bg-warning/90",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-']):not([class*='w-']):not([class*='h-'])]:size-3",
				sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
				lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
				icon: "size-9",
				"icon-xs": "size-6 rounded-md [&_svg:not([class*='size-']):not([class*='w-']):not([class*='h-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
)

/**
 * Botão do sucont. Base UI, não Radix — o monorepo padroniza `@base-ui/react`
 * (ver CLAUDE.md). O `asChild` do Slot do Radix vira a prop `render` do Base UI:
 * para renderizar um link com cara de botão, `render={<Link to="…" />}` junto de
 * `nativeButton={false}`, nunca aninhando `<Link><Button/></Link>` — isso quebra
 * a semântica de acessibilidade do HTML.
 */
function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: React.ComponentProps<typeof ButtonPrimitive> & VariantProps<typeof buttonVariants>) {
	return <ButtonPrimitive data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
