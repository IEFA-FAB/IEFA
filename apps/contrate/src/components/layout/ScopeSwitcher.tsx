import { Link } from "@tanstack/react-router"
import { ArrowSeparateVertical, Check, MapPin } from "iconoir-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { type ContrateModule, moduleScopeOptions, scopedPath } from "@/lib/modules"
import type { ScopeContext, ScopeOption } from "@/lib/scope"
import { cn } from "@/lib/utils"
import { useModuleAccess } from "./useModuleAccess"

/**
 * Seletor de OM, logo abaixo do seletor de módulo — só nos módulos com escopo, e só depois
 * que a rota resolveu a OM da URL (no hub não há o que trocar: a tela inteira é a escolha).
 *
 * Como o seletor de módulo, a escolha NAVEGA: cada item é um `<Link>` para a entrada do
 * módulo na OM nova. Da tela de um processo, trocar de OM leva à fila/lista da OM escolhida —
 * o processo aberto é de outra OM e não tem lugar na nova.
 *
 * Nada é lembrado entre visitas: a OM é da URL, e gravá-la em cookie ou `localStorage`
 * exigiria entrada no inventário da Política de Cookies (LGPD.md).
 */
export function ScopeSwitcher({ module, scope }: { module: ContrateModule; scope: ScopeContext }) {
	const { access } = useModuleAccess()
	const { isMobile, setOpenMobile } = useSidebar()

	// A OM aberta entra sempre: se a rota deixou entrar, ela é alcançável — e o perfil pode
	// ainda estar a caminho no cache desta árvore.
	const fromAccess = access ? moduleScopeOptions(module, access) : []
	const options: ScopeOption[] = fromAccess.some((option) => option.id === scope.id) ? fromAccess : [scope, ...fromAccess]
	const index = module.scope?.index

	if (!index || options.length <= 1) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton size="lg" tooltip={`OM: ${scope.label}`} className={cn(TRIGGER_CLASS, "hover:bg-background")} render={<div />}>
						<ScopeIdentity scope={scope} />
					</SidebarMenuButton>
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
								tooltip={`OM: ${scope.label} — trocar de OM`}
								aria-label={`OM atual: ${scope.label}. Trocar de OM`}
								className={cn(TRIGGER_CLASS, "hover:border-sidebar-foreground data-popup-open:border-sidebar-foreground")}
							>
								<ScopeIdentity scope={scope} />
								<ArrowSeparateVertical className="ml-auto size-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
							</SidebarMenuButton>
						}
					/>

					<DropdownMenuContent
						className="max-h-[min(24rem,var(--available-height))] w-auto min-w-64 overflow-y-auto border border-foreground p-1 shadow-[3px_3px_0_0_var(--foreground)] ring-0"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={6}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-label px-2 py-1.5 text-muted-foreground">OM</DropdownMenuLabel>
							{options.map((option) => {
								const isActive = option.id === scope.id
								return (
									<DropdownMenuItem
										key={option.id}
										className="gap-3 p-2"
										onClick={() => setOpenMobile(false)}
										render={
											<Link to={scopedPath(index, option.id)} aria-current={isActive ? "page" : undefined}>
												<span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
													<span className="truncate font-medium text-foreground text-sm">{option.label}</span>
													{option.caption ? <span className="truncate text-muted-foreground text-xs">{option.caption}</span> : null}
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

const TRIGGER_CLASS =
	"border-sidebar-border bg-background group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent"

function ScopeIdentity({ scope }: { scope: ScopeContext }) {
	return (
		<>
			<MapPin className="ml-1 group-data-[collapsible=icon]:ml-0" aria-hidden="true" />
			<span className="grid flex-1 text-left leading-tight">
				<span className="text-label truncate text-sidebar-foreground/60">OM</span>
				<span className="truncate font-medium text-sidebar-foreground text-sm">{scope.label}</span>
			</span>
		</>
	)
}
