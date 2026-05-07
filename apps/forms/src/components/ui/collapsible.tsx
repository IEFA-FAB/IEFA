import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { cn } from "../../lib/utils"

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
	return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ className, ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
	return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" className={cn("cursor-pointer", className)} {...props} />
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
	return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
