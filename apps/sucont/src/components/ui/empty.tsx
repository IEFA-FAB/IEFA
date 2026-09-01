import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "#/lib/utils"

/**
 * Zero state. Portado do sisub.
 *
 * O §7.1 do contrato exige que vazio, carregando e falha sejam TRÊS telas. Este é
 * o vazio real — o que ensina o que a ferramenta espera receber.
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="empty"
			className={cn(
				"gap-4 rounded-xl border border-dashed border-border p-10 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance",
				className
			)}
			{...props}
		/>
	)
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="empty-header" className={cn("gap-2 flex max-w-md flex-col items-center", className)} {...props} />
}

const emptyMediaVariants = cva("mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0", {
	variants: {
		variant: {
			default: "bg-transparent",
			icon: "bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-5",
		},
	},
	defaultVariants: {
		variant: "default",
	},
})

function EmptyMedia({ className, variant = "default", ...props }: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
	return <div data-slot="empty-icon" data-variant={variant} className={cn(emptyMediaVariants({ variant, className }))} {...props} />
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="empty-title" className={cn("text-heading text-foreground", className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="empty-description"
			className={cn("text-body text-muted-foreground [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4", className)}
			{...props}
		/>
	)
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="empty-content" className={cn("gap-3 flex w-full max-w-md min-w-0 flex-col items-center text-balance", className)} {...props} />
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle }
