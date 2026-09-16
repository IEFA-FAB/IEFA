"use client"

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import type * as React from "react"
import { cn } from "../../lib/cn"

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
	return <ContextMenuPrimitive.Root {...props} />
}

function ContextMenuTrigger({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
	return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
}

function ContextMenuContent({ className, ...props }: ContextMenuPrimitive.Popup.Props) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-content"
					className={cn(
						"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 bg-popover text-popover-foreground min-w-40 rounded-lg p-1 shadow-md ring-1 duration-100 origin-(--transform-origin) outline-none",
						className
					)}
					{...props}
				/>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPrimitive.Portal>
	)
}

function ContextMenuItem({ className, ...props }: ContextMenuPrimitive.Item.Props) {
	return (
		<ContextMenuPrimitive.Item
			data-slot="context-menu-item"
			className={cn(
				"data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className
			)}
			{...props}
		/>
	)
}

function ContextMenuGroupLabel({ className, ...props }: ContextMenuPrimitive.GroupLabel.Props) {
	return (
		<ContextMenuPrimitive.GroupLabel
			data-slot="context-menu-label"
			className={cn("text-muted-foreground px-2 py-1 text-xs font-medium", className)}
			{...props}
		/>
	)
}

export { ContextMenu, ContextMenuContent, ContextMenuGroupLabel, ContextMenuItem, ContextMenuTrigger }
