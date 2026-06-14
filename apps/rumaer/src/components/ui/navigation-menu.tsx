import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu"
import { cva } from "class-variance-authority"
import { NavArrowDown } from "iconoir-react"
import { cn } from "../../lib/utils"

function NavigationMenu({ className, children, ...props }: NavigationMenuPrimitive.Root.Props) {
	return (
		<NavigationMenuPrimitive.Root
			data-slot="navigation-menu"
			className={cn("group/navigation-menu relative flex max-w-max flex-1 items-center justify-center", className)}
			{...props}
		>
			{children}
			<NavigationMenuPositioner />
		</NavigationMenuPrimitive.Root>
	)
}

function NavigationMenuList({ className, ...props }: React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.List>) {
	return (
		<NavigationMenuPrimitive.List
			data-slot="navigation-menu-list"
			className={cn("gap-0 group flex flex-1 list-none items-center justify-center", className)}
			{...props}
		/>
	)
}

function NavigationMenuItem({ className, ...props }: React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.Item>) {
	return <NavigationMenuPrimitive.Item data-slot="navigation-menu-item" className={cn("relative", className)} {...props} />
}

const navigationMenuTriggerStyle = cva(
	"bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50 inline-flex h-9 w-max items-center justify-center disabled:pointer-events-none outline-none cursor-pointer"
)

function NavigationMenuTrigger({ className, children, ...props }: NavigationMenuPrimitive.Trigger.Props) {
	return (
		<NavigationMenuPrimitive.Trigger data-slot="navigation-menu-trigger" className={cn(navigationMenuTriggerStyle(), "group", className)} {...props}>
			{children}{" "}
			<NavArrowDown
				className="relative top-[1px] ml-1 size-3 transition duration-200 group-data-open/navigation-menu-trigger:rotate-180 group-data-popup-open/navigation-menu-trigger:rotate-180"
				aria-hidden="true"
			/>
		</NavigationMenuPrimitive.Trigger>
	)
}

function NavigationMenuContent({ className, ...props }: NavigationMenuPrimitive.Content.Props) {
	return (
		<NavigationMenuPrimitive.Content
			data-slot="navigation-menu-content"
			className={cn(
				"data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:data-open:animate-in group-data-[viewport=false]/navigation-menu:data-closed:animate-out group-data-[viewport=false]/navigation-menu:data-closed:zoom-out-95 group-data-[viewport=false]/navigation-menu:data-open:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-open:fade-in-0 group-data-[viewport=false]/navigation-menu:data-closed:fade-out-0 group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:border-border p-1 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[viewport=false]/navigation-menu:duration-200 h-full w-auto **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none",
				className
			)}
			{...props}
		/>
	)
}

function NavigationMenuPositioner({
	className,
	side = "bottom",
	sideOffset = 6,
	align = "start",
	alignOffset = 0,
	...props
}: NavigationMenuPrimitive.Positioner.Props) {
	return (
		<NavigationMenuPrimitive.Portal>
			<NavigationMenuPrimitive.Positioner
				side={side}
				sideOffset={sideOffset}
				align={align}
				alignOffset={alignOffset}
				className={cn(
					"transition-[top,left,right,bottom] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-[side=bottom]:before:top-[-10px] data-[side=bottom]:before:right-0 data-[side=bottom]:before:left-0 isolate z-50 h-[var(--positioner-height)] w-[var(--positioner-width)] max-w-[var(--available-width)] data-[instant]:transition-none",
					className
				)}
				{...props}
			>
				<NavigationMenuPrimitive.Popup className="bg-popover text-popover-foreground border border-border transition-all ease-[cubic-bezier(0.22,1,0.36,1)] outline-none data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[starting-style]:opacity-0 xs:w-(--popup-width) relative h-(--popup-height) w-(--popup-width) origin-(--transform-origin)">
					<NavigationMenuPrimitive.Viewport className="relative size-full overflow-hidden" />
				</NavigationMenuPrimitive.Popup>
			</NavigationMenuPrimitive.Positioner>
		</NavigationMenuPrimitive.Portal>
	)
}

function NavigationMenuLink({ className, ...props }: NavigationMenuPrimitive.Link.Props) {
	return (
		<NavigationMenuPrimitive.Link
			data-slot="navigation-menu-link"
			className={cn(
				"data-active:bg-accent hover:bg-accent focus:bg-accent flex items-center gap-3 p-2.5 text-sm transition-colors outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
				className
			)}
			{...props}
		/>
	)
}

function NavigationMenuIndicator({ className, ...props }: React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.Icon>) {
	return (
		<NavigationMenuPrimitive.Icon
			data-slot="navigation-menu-indicator"
			className={cn(
				"data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
				className
			)}
			{...props}
		>
			<div className="bg-border relative top-[60%] h-2 w-2 rotate-45" />
		</NavigationMenuPrimitive.Icon>
	)
}

export {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuIndicator,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuPositioner,
	NavigationMenuTrigger,
	navigationMenuTriggerStyle,
}
