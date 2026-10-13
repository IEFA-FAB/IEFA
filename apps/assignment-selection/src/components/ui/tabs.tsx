import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "../../lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
	return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />
}

/** Segmentado: fundo neutro, aba ativa em relevo. Nada de sublinhado colorido. */
function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
	return <TabsPrimitive.List data-slot="tabs-list" className={cn("inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1", className)} {...props} />
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-tab"
			className={cn(
				"inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors select-none",
				"hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-active:bg-background data-active:text-foreground data-active:shadow-sm dark:data-active:bg-input/40",
				"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			{...props}
		/>
	)
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
	return <TabsPrimitive.Panel data-slot="tabs-panel" className={cn("outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsPanel, TabsTab }
