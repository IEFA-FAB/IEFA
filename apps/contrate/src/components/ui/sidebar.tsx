import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { SidebarCollapse, SidebarExpand } from "iconoir-react"
import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Separator } from "./separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet"
import { Skeleton } from "./skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/**
 * Barra lateral do shadcn, portada do sucont (que a trouxe do sisub) e reduzida ao
 * que o contrate usa. A ARQUITETURA é a dos dois apps; o DESENHO é o Pale
 * Brutalism do portal (`STYLE_CONTRACT.md`):
 *
 * - **Zero raio.** Nenhum `rounded-*` — nem no item, nem no esqueleto, nem na
 *   variante flutuante (que aqui não existe: a barra é coluna de borda a borda).
 * - **Ativo é borda inteira, não faixa.** O item da tela aberta ganha borda de 1px
 *   em volta e fundo do canvas; a faixa lateral colorida é proibida no monorepo.
 *   Os itens têm borda transparente em repouso para o ativo não deslocar o texto.
 * - **Foco é contorno de 2px** na cor do `ring`, com afastamento — nunca anel
 *   difuso.
 *
 * Herdado dos dois apps: sem Radix (o `asChild` vira `render` do Base UI, que é o
 * que deixa o item virar um `<Link>` sem aninhar botão em âncora) e estado em
 * cookie legível no SSR, para a barra já sair do servidor aberta ou recolhida.
 */

export const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
	state: "expanded" | "collapsed"
	open: boolean
	setOpen: (open: boolean) => void
	openMobile: boolean
	setOpenMobile: (open: boolean) => void
	isMobile: boolean
	toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
	const context = React.useContext(SidebarContext)
	if (!context) {
		throw new Error("useSidebar precisa estar dentro de um SidebarProvider.")
	}
	return context
}

/** Grava a escolha. Cookie bloqueado (iframe sandboxed) não vira erro: a barra só não lembra. */
function persistSidebarState(open: boolean) {
	try {
		const secure = window.location.protocol === "https:" ? "; secure" : ""
		// biome-ignore lint/suspicious/noDocumentCookie: o estado da barra precisa sobreviver ao F5 e ser legível no SSR; a CookieStore API não existe no Safari nem no Firefox.
		document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax${secure}`
	} catch {
		// sem cookie, sem memória — a barra segue funcionando
	}
}

function SidebarProvider({
	defaultOpen = true,
	open: openProp,
	onOpenChange: setOpenProp,
	className,
	style,
	children,
	...props
}: React.ComponentProps<"div"> & {
	defaultOpen?: boolean
	open?: boolean
	onOpenChange?: (open: boolean) => void
}) {
	const isMobile = useIsMobile()
	const [openMobile, setOpenMobile] = React.useState(false)

	const [_open, _setOpen] = React.useState(defaultOpen)
	const open = openProp ?? _open
	const setOpen = React.useCallback(
		(value: boolean | ((value: boolean) => boolean)) => {
			const openState = typeof value === "function" ? value(open) : value
			if (setOpenProp) {
				setOpenProp(openState)
			} else {
				_setOpen(openState)
			}
			persistSidebarState(openState)
		},
		[setOpenProp, open]
	)

	const toggleSidebar = React.useCallback(() => {
		return isMobile ? setOpenMobile((v) => !v) : setOpen((v) => !v)
	}, [isMobile, setOpen])

	// Ctrl/Cmd+B alterna — o mesmo atalho do sisub e do sucont.
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
				event.preventDefault()
				toggleSidebar()
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [toggleSidebar])

	const state = open ? "expanded" : "collapsed"

	const contextValue = React.useMemo<SidebarContextProps>(
		() => ({ state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }),
		[state, open, setOpen, isMobile, openMobile, toggleSidebar]
	)

	return (
		<SidebarContext.Provider value={contextValue}>
			<div
				data-slot="sidebar-wrapper"
				style={{ "--sidebar-width": SIDEBAR_WIDTH, "--sidebar-width-icon": SIDEBAR_WIDTH_ICON, ...style } as React.CSSProperties}
				className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
				{...props}
			>
				{children}
			</div>
		</SidebarContext.Provider>
	)
}

function Sidebar({
	side = "left",
	collapsible = "offcanvas",
	mobileTitle = "Menu",
	mobileDescription = "Navegação do módulo.",
	className,
	children,
	...props
}: React.ComponentProps<"div"> & {
	side?: "left" | "right"
	collapsible?: "offcanvas" | "icon" | "none"
	/** Título da gaveta mobile — só para leitor de tela, a gaveta é um diálogo e precisa de nome. */
	mobileTitle?: string
	mobileDescription?: string
}) {
	const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

	if (collapsible === "none") {
		return (
			<div data-slot="sidebar" className={cn("flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground", className)} {...props}>
				{children}
			</div>
		)
	}

	if (isMobile) {
		return (
			<Sheet open={openMobile} onOpenChange={setOpenMobile}>
				<SheetContent
					data-sidebar="sidebar"
					data-slot="sidebar"
					data-mobile="true"
					showCloseButton={false}
					className="w-(--sidebar-width)! max-w-none! gap-0 bg-sidebar p-0 text-sidebar-foreground sm:max-w-none!"
					style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
					side={side}
				>
					<SheetHeader className="sr-only">
						<SheetTitle>{mobileTitle}</SheetTitle>
						<SheetDescription>{mobileDescription}</SheetDescription>
					</SheetHeader>
					<div className="flex size-full flex-col">{children}</div>
				</SheetContent>
			</Sheet>
		)
	}

	return (
		<div
			className="group peer hidden text-sidebar-foreground md:block print:hidden"
			data-state={state}
			data-collapsible={state === "collapsed" ? collapsible : ""}
			data-side={side}
			data-slot="sidebar"
		>
			{/* Reserva a largura no fluxo: a barra em si é `fixed`. */}
			<div
				data-slot="sidebar-gap"
				className={cn(
					"relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
					"group-data-[collapsible=offcanvas]:w-0 group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
					"group-data-[side=right]:rotate-180"
				)}
			/>
			<div
				data-slot="sidebar-container"
				className={cn(
					"fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
					side === "left"
						? "left-0 border-r group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
						: "right-0 border-l group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
					"border-sidebar-border group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
					className
				)}
				{...props}
			>
				<div data-sidebar="sidebar" data-slot="sidebar-inner" className="flex size-full flex-col bg-sidebar">
					{children}
				</div>
			</div>
		</div>
	)
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
	const { toggleSidebar, open, openMobile, isMobile } = useSidebar()
	const expanded = isMobile ? openMobile : open
	const Icon = expanded ? SidebarCollapse : SidebarExpand

	return (
		<Button
			data-sidebar="trigger"
			data-slot="sidebar-trigger"
			variant="ghost"
			size="icon-sm"
			aria-label={expanded ? "Recolher barra lateral" : "Abrir barra lateral"}
			// Sem isto o leitor de tela anuncia um botão sem estado.
			aria-expanded={expanded}
			className={cn(className)}
			onClick={(event) => {
				onClick?.(event)
				toggleSidebar()
			}}
			{...props}
		>
			<Icon aria-hidden="true" />
		</Button>
	)
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
	const { toggleSidebar, isMobile } = useSidebar()

	// A trilha arrasta a largura da barra fixa, que não existe no mobile: ali ela só
	// montaria um Tooltip inútil dentro da gaveta.
	if (isMobile) return null

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						data-sidebar="rail"
						data-slot="sidebar-rail"
						aria-label="Alternar barra lateral"
						tabIndex={-1}
						onClick={toggleSidebar}
						className={cn(
							"absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-sidebar-foreground group-data-[side=left]:-right-4 group-data-[side=right]:left-0 md:flex",
							"in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
							"[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
							"group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
							"[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
							"[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
							className
						)}
						{...props}
					/>
				}
			/>
			<TooltipContent side="right">Alternar barra lateral</TooltipContent>
		</Tooltip>
	)
}

/**
 * Coluna de conteúdo ao lado da barra. É `div`, e não o `<main>` do shadcn: a
 * barra superior mora aqui dentro, e o landmark `main` (alvo do "Ir para o
 * conteúdo") tem que envolver só a página — não o cabeçalho.
 */
function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="sidebar-inset" className={cn("relative flex w-full min-w-0 flex-1 flex-col bg-background", className)} {...props} />
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="sidebar-header" data-sidebar="header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="sidebar-footer" data-sidebar="footer" className={cn("flex flex-col gap-2 p-2", className)} {...props} />
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
	return <Separator data-slot="sidebar-separator" data-sidebar="separator" className={cn("mx-2 w-auto bg-sidebar-border", className)} {...props} />
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-content"
			data-sidebar="content"
			className={cn("flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden", className)}
			{...props}
		/>
	)
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="sidebar-group" data-sidebar="group" className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />
}

function SidebarGroupLabel({ className, render, ...props }: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
	return useRender({
		defaultTagName: "div",
		props: mergeProps<"div">(
			{
				className: cn(
					"text-label flex h-8 shrink-0 items-center px-2 text-sidebar-foreground/60 outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0",
					className
				),
			},
			props
		),
		render,
		state: { slot: "sidebar-group-label", sidebar: "group-label" },
	})
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
	return <ul data-slot="sidebar-menu" data-sidebar="menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
	return <li data-slot="sidebar-menu-item" data-sidebar="menu-item" className={cn("group/menu-item relative", className)} {...props} />
}

const sidebarMenuButtonVariants = cva(
	"peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden border border-transparent p-2 text-left text-sm text-sidebar-foreground outline-hidden transition-[width,height,padding,background-color,border-color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-sidebar-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:border-sidebar-foreground data-active:bg-background data-active:font-medium data-active:text-sidebar-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			size: {
				default: "h-8 text-sm",
				sm: "h-7 text-xs",
				lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
			},
		},
		defaultVariants: { size: "default" },
	}
)

function SidebarMenuButton({
	render,
	isActive = false,
	size = "default",
	tooltip,
	className,
	...props
}: useRender.ComponentProps<"button"> &
	React.ComponentProps<"button"> & {
		isActive?: boolean
		tooltip?: string | React.ComponentProps<typeof TooltipContent>
	} & VariantProps<typeof sidebarMenuButtonVariants>) {
	const { isMobile, state } = useSidebar()

	/*
	 * O tooltip só é MONTADO quando serve: barra recolhida, no desktop. Expandida, o
	 * rótulo já está na tela, e na gaveta mobile também.
	 *
	 * Montar sempre e esconder o balão — como faz o shadcn de origem — não basta: o
	 * Tooltip continua no ar e trata o Escape. Na gaveta o foco cai no primeiro item,
	 * o tooltip abre no foco, e o primeiro Escape fechava o BALÃO em vez da gaveta
	 * (o defeito que o sucont já corrigiu).
	 */
	const showTooltip = Boolean(tooltip) && state === "collapsed" && !isMobile

	const comp = useRender({
		defaultTagName: "button",
		props: mergeProps<"button">({ className: cn(sidebarMenuButtonVariants({ size }), className) }, props),
		render: !showTooltip ? render : (renderProps) => <TooltipTrigger {...renderProps} render={render} />,
		state: { slot: "sidebar-menu-button", sidebar: "menu-button", size, active: isActive },
	})

	if (!showTooltip) return comp

	const tooltipProps = typeof tooltip === "string" ? { children: tooltip } : tooltip

	return (
		<Tooltip>
			{comp}
			<TooltipContent side="right" align="center" {...tooltipProps} />
		</Tooltip>
	)
}

function SidebarMenuSkeleton({ className, showIcon = false, ...props }: React.ComponentProps<"div"> & { showIcon?: boolean }) {
	return (
		<div data-slot="sidebar-menu-skeleton" data-sidebar="menu-skeleton" className={cn("flex h-8 items-center gap-2 px-2", className)} {...props}>
			{showIcon && <Skeleton className="size-4" data-sidebar="menu-skeleton-icon" />}
			<Skeleton className="h-4 max-w-[70%] flex-1" data-sidebar="menu-skeleton-text" />
		</div>
	)
}

export {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
}
