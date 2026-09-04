import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "#/lib/utils"

/**
 * Pílula de status/metadado. Portado do sisub.
 *
 * O `rounded-full` aqui é a "pílula explícita" que o contrato admite — não é raio
 * de superfície. Substitui as dezenas de `px-3 py-1 rounded-full` escritos à mão
 * em cada ferramenta, cada um com sua altura e seu peso de fonte.
 */
const badgeVariants = cva(
	"h-5 gap-1 rounded-full border border-transparent px-2 py-0.5 text-caption font-medium transition-all [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] overflow-hidden group/badge",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				destructive: "bg-destructive/10 text-destructive border-destructive/30 dark:bg-destructive/20 [a]:hover:bg-destructive/20",
				outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				muted: "bg-muted/60 text-muted-foreground border-border",
				success: "bg-success/10 text-success border-success/30 dark:bg-success/20 [a]:hover:bg-success/20",
				warning: "bg-warning/10 text-warning border-warning/30 dark:bg-warning/20 [a]:hover:bg-warning/20",
				action: "bg-action/10 text-action border-action/30 dark:bg-action/20 [a]:hover:bg-action/20",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
)

function Badge({ className, variant = "default", render, ...props }: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">({ className: cn(badgeVariants({ className, variant })) }, props),
		render,
		state: { slot: "badge", variant },
	})
}

export { Badge, badgeVariants }
