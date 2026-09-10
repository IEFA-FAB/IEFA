"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import type * as React from "react"

import { cn } from "#/lib/utils"

/**
 * Menu suspenso. Portado do sisub, sobre `@base-ui/react` — nunca Radix.
 *
 * Só as partes que o app usa: raiz, gatilho, conteúdo, grupo, rótulo e item. O
 * submenu, o item de checkbox e o de rádio ficam de fora até existir tela que os
 * peça — primitivo sem consumidor é superfície que ninguém mantém.
 *
 * `MenuItem` responde a `onClick`, NÃO a `onSelect`: o segundo é a API do Radix e
 * some em silêncio aqui, deixando o item sem ação nenhuma.
 */

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({ ...props }: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
	return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
	align = "start",
	alignOffset = 0,
	side = "bottom",
	sideOffset = 4,
	className,
	...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner className="isolate z-50 outline-none" align={align} alignOffset={alignOffset} side={side} sideOffset={sideOffset}>
				<MenuPrimitive.Popup
					data-slot="dropdown-menu-content"
					className={cn(
						"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 duration-100 data-closed:overflow-hidden",
						className
					)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	)
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
	return <MenuPrimitive.GroupLabel data-slot="dropdown-menu-label" className={cn("px-1.5 py-1 text-caption text-muted-foreground", className)} {...props} />
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
	return (
		<MenuPrimitive.Item
			data-slot="dropdown-menu-item"
			className={cn(
				"group/dropdown-menu-item relative flex select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-body outline-hidden transition-colors focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			{...props}
		/>
	)
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger }
