import { Link } from "@tanstack/react-router"
import { ArrowSeparateVertical, Check } from "iconoir-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { CONTRATE_MODULES, type ContrateModule } from "@/lib/modules"
import { cn } from "@/lib/utils"
import { useModuleAccess } from "./useModuleAccess"

/**
 * Seletor de módulo, no topo da barra lateral — portado do sucont, que o trouxe do
 * sisub (e este do `TeamSwitcher` do shadcn). A escolha NAVEGA: cada item é um
 * `<Link>` de verdade, então o módulo em que se está é propriedade da URL, e não
 * estado de componente que se perde no F5.
 *
 * É o ÚNICO caminho entre módulos: a navegação de um módulo nunca aponta para
 * dentro de outro (`lib/modules.ts`).
 *
 * Com um módulo só alcançável o cabeçalho vira o atalho para a entrada dele. Menu
 * de uma opção não é escolha — é um clique a mais para chegar no mesmo lugar, e
 * ainda anunciaria a existência de módulos que o visitante não pode abrir. É o caso
 * de quem chega ao Pregoeiro sem sessão.
 */
export function ModuleSwitcher({ active }: { active: ContrateModule }) {
	const { modules: reachable, isPending } = useModuleAccess()
	const { isMobile, setOpenMobile } = useSidebar()

	// O módulo aberto entra sempre na lista: se a rota deixou entrar, ele é
	// alcançável — e as permissões podem ainda estar a caminho. A ordem segue o
	// registro, para o menu não reordenar quando elas chegam.
	const modules = CONTRATE_MODULES.filter((m) => m.id === active.id || reachable.some((r) => r.id === m.id))

	if (modules.length <= 1 || isPending) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						size="lg"
						tooltip={active.label}
						className={TRIGGER_CLASS}
						render={
							<Link to={active.home} onClick={() => setOpenMobile(false)}>
								<ModuleTile module={active} />
								<ModuleIdentity module={active} />
							</Link>
						}
					/>
				</SidebarMenuItem>
			</SidebarMenu>
		)
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								tooltip={`${active.label} — trocar de módulo`}
								aria-label={`Módulo atual: ${active.label}. Trocar de módulo`}
								className={cn(
									TRIGGER_CLASS,
									"data-popup-open:-translate-x-0.5 data-popup-open:-translate-y-0.5 data-popup-open:shadow-[3px_3px_0_0_var(--sidebar-foreground)]"
								)}
							>
								<ModuleTile module={active} />
								<ModuleIdentity module={active} />
								<ArrowSeparateVertical className="ml-auto size-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
							</SidebarMenuButton>
						}
					/>

					<DropdownMenuContent
						className="w-auto min-w-64 border border-foreground p-1 shadow-[3px_3px_0_0_var(--foreground)] ring-0"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={6}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-label px-2 py-1.5 text-muted-foreground">Módulos</DropdownMenuLabel>
							{modules.map((module) => {
								const isActive = module.id === active.id
								return (
									<DropdownMenuItem
										key={module.id}
										className="gap-3 p-2"
										onClick={() => setOpenMobile(false)}
										render={
											<Link to={module.home} aria-current={isActive ? "page" : undefined}>
												<ModuleTile module={module} size="sm" inverted={isActive} />
												<span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
													<span className="truncate font-medium text-foreground text-sm">{module.label}</span>
													<span className="truncate text-muted-foreground text-xs">{module.caption}</span>
												</span>
												{isActive && <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />}
											</Link>
										}
									/>
								)
							})}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}

/**
 * Gatilho com borda inteira e o idioma de hover do portal — o bloco sobe e deixa a
 * sombra dura para trás. Na barra recolhida sobra só o ladrilho, sem moldura.
 */
const TRIGGER_CLASS =
	"border-sidebar-border bg-background transition-[width,height,padding,transform,box-shadow,border-color] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-sidebar-foreground hover:bg-background hover:shadow-[3px_3px_0_0_var(--sidebar-foreground)] data-popup-open:border-sidebar-foreground group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent"

export function ModuleTile({ module, size = "md", inverted = true }: { module: ContrateModule; size?: "sm" | "md"; inverted?: boolean }) {
	const Icon = module.icon
	return (
		<span
			className={cn(
				"flex shrink-0 items-center justify-center border",
				size === "sm" ? "size-7" : "aspect-square size-8",
				inverted ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground"
			)}
			aria-hidden="true"
		>
			<Icon className={size === "sm" ? "size-3.5!" : "size-4!"} />
		</span>
	)
}

function ModuleIdentity({ module }: { module: ContrateModule }) {
	return (
		<span className="grid flex-1 text-left leading-tight">
			<span className="truncate font-semibold text-sidebar-foreground text-sm tracking-tight">{module.label}</span>
			<span className="text-label truncate text-sidebar-foreground/60">{module.caption}</span>
		</span>
	)
}
