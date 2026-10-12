import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "../../lib/utils"

/** Situação em texto + tint. A cor reforça, nunca é o único sinal. */
const badgeVariants = cva(
	"inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
	{
		variants: {
			variant: {
				neutral: "border-border bg-muted text-muted-foreground",
				info: "border-info/30 bg-info/10 text-info",
				success: "border-success/30 bg-success/10 text-success",
				warning: "border-warning/40 bg-warning/10 text-warning",
			},
		},
		defaultVariants: { variant: "neutral" },
	}
)

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
