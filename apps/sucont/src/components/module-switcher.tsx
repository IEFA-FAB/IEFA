"use client"

import { Link, useRouterState } from "@tanstack/react-router"
import { Check, ChevronsUpDown } from "lucide-react"
import { useSucontAccess } from "#/auth/pbac"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "#/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "#/components/ui/sidebar"
import { accessibleModules, defaultDivisionFor, findModuleByPath, type SucontModule } from "#/lib/modules"
import { cn } from "#/lib/utils"

/**
 * Seletor de módulo, no topo da barra lateral — o mesmo lugar (e o mesmo desenho)
 * do cabeçalho que antes era só a marca "SUCONT-4 HUB".
 *
 * Portado do `ModuleSwitcher` do sisub, que por sua vez veio do `TeamSwitcher` do
 * shadcn. A diferença é o que a escolha faz: aqui ela NAVEGA. Cada item é um
 * `<Link>` de verdade, então o módulo em que se está é uma propriedade da URL, e
 * não estado de componente que se perde ao recarregar.
 *
 * Com um módulo só alcançável, o cabeçalho volta a ser o que era: o atalho para a
 * casa. Menu de uma opção não é escolha — é um clique a mais para chegar no mesmo
 * lugar, e ainda anuncia a existência de um módulo que o usuário não pode abrir.
 */
export function ModuleSwitcher() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const divisao = useRouterState({ select: (s) => (s.location.search as { divisao?: string }).divisao })
	const { permissions } = useSucontAccess()
	const { isMobile } = useSidebar()

	// O padrão do fallback é a primeira divisão ACESSÍVEL, não a SUCONT-4 crua: com o
	// acesso separado por divisão, quem só tem a SUCONT-3 veria o cabeçalho anunciando
	// um módulo que o seletor abaixo nem lista.
	const active = findModuleByPath(pathname, divisao, defaultDivisionFor(permissions))
	const modules = accessibleModules(permissions)

	if (modules.length <= 1) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						size="lg"
						tooltip={active.label}
						render={
							<Link to={active.home as string} search={moduleSearch(active)}>
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
								className="cursor-pointer data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
							>
								<ModuleTile module={active} />
								<ModuleIdentity module={active} />
								<ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
							</SidebarMenuButton>
						}
					/>

					<DropdownMenuContent className="min-w-60 p-2" align="start" side={isMobile ? "bottom" : "right"} sideOffset={4}>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-label text-muted-foreground">Módulos</DropdownMenuLabel>
							{modules.map((module) => {
								const isActive = module.id === active.id
								return (
									<DropdownMenuItem
										key={module.id}
										className="cursor-pointer gap-2 p-2"
										render={
											<Link to={module.home as string} search={moduleSearch(module)} aria-current={isActive ? "page" : undefined}>
												<ModuleTile module={module} size="sm" />
												<span className="flex min-w-0 flex-1 flex-col text-left">
													<span className="truncate text-body text-foreground">{module.label}</span>
													<span className="truncate text-hint text-muted-foreground">{module.caption}</span>
												</span>
												{isActive && <Check className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
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
 * Busca da URL ao entrar num módulo.
 *
 * Leva só a divisão, e deliberadamente NÃO carrega `?q=`, `?etapa=` nem `?rac=`:
 * trocar de módulo é começar de novo em outra divisão, e herdar um filtro de
 * questão da divisão anterior abriria o catálogo novo vazio, parecendo que a
 * divisão não tem ferramenta nenhuma.
 *
 * O `admin` não é divisão e entra sem parâmetro.
 */
function moduleSearch(module: SucontModule): Record<string, string> {
	return module.division ? { divisao: module.division } : {}
}

function ModuleTile({ module, size = "md" }: { module: SucontModule; size?: "sm" | "md" }) {
	const Icon = module.icon
	return (
		<div
			className={cn("flex shrink-0 items-center justify-center rounded-lg", size === "sm" ? "size-6" : "aspect-square size-8", module.tileClassName)}
			aria-hidden="true"
		>
			<Icon className={size === "sm" ? "size-3.5" : "size-4"} />
		</div>
	)
}

function ModuleIdentity({ module }: { module: SucontModule }) {
	return (
		<div className="grid flex-1 text-left leading-tight">
			<span className="truncate text-subheading text-foreground">{module.label}</span>
			<span className="truncate text-label text-muted-foreground">{module.caption}</span>
		</div>
	)
}
