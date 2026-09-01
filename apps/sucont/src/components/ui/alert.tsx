import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "#/lib/utils"

/**
 * Aviso em linha. Portado do sisub.
 *
 * Cada ferramenta tinha o seu: `bg-destructive/10 border border-destructive/30
 * rounded-xl` aqui, `rounded-2xl` ali, um com ícone e outro com um ponto colorido
 * de 8px. Mesma informação, cinco formas.
 */
const alertVariants = cva(
	"grid gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 w-full relative group/alert",
	{
		variants: {
			variant: {
				default: "bg-card text-card-foreground border-border",
				destructive: "text-destructive bg-destructive/10 border-destructive/30 *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
				warning: "text-warning bg-warning/10 border-warning/30 *:data-[slot=alert-description]:text-warning/90 *:[svg]:text-current",
				success: "text-success bg-success/10 border-success/30 *:data-[slot=alert-description]:text-success/90 *:[svg]:text-current",
				info: "text-action bg-action/10 border-action/30 *:data-[slot=alert-description]:text-action/90 *:[svg]:text-current",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
)

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="alert-title" className={cn("font-medium group-has-[>svg]/alert:col-start-2", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="alert-description" className={cn("text-caption text-muted-foreground text-pretty", className)} {...props} />
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="alert-action" className={cn("absolute top-2 right-2", className)} {...props} />
}

export { Alert, AlertAction, AlertDescription, AlertTitle }
