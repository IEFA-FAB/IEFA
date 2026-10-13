import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import { ChevronRight } from "lucide-react"

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
	return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
	return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

/** Cabeçalho de seção recolhível: seta que gira ao abrir, foco por ring. Envolva num `<h2>`/`<h3>`. */
function CollapsibleSectionTrigger({ children, ...props }: Omit<React.ComponentProps<typeof CollapsiblePrimitive.Trigger>, "className">) {
	return (
		<CollapsiblePrimitive.Trigger
			data-slot="collapsible-section-trigger"
			className="group/section inline-flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			{...props}
		>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/section:rotate-90" aria-hidden="true" />
			{children}
		</CollapsiblePrimitive.Trigger>
	)
}

function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
	return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleContent, CollapsibleSectionTrigger, CollapsibleTrigger }
