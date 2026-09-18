import { Link, useRouterState } from "@tanstack/react-router"
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import type { ContrateModule, ModuleNavItem } from "@/lib/modules"

/** Tira a barra final: `/aci/` e `/aci` são a mesma tela para quem compara caminho. */
export function normalizePath(path: string): string {
	return path.replace(/\/+$/, "") || "/"
}

/**
 * O item corresponde ao caminho? `exact` é para o painel do módulo, que é prefixo
 * de todas as outras telas dele — sem isso "Painel" ficaria aceso em toda a ACI.
 */
export function isNavItemActive(pathname: string, item: ModuleNavItem): boolean {
	const current = normalizePath(pathname)
	const target = normalizePath(item.to)
	return item.exact ? current === target : current === target || current.startsWith(`${target}/`)
}

/** O item aceso na tela atual, se houver — a trilha do cabeçalho usa o mesmo critério da barra. */
export function findActiveNavItem(pathname: string, module: ContrateModule): ModuleNavItem | null {
	return module.nav.find((item) => isNavItemActive(pathname, item)) ?? null
}

/**
 * Navegação do módulo aberto — e SÓ dele. Trocar de módulo troca a barra inteira;
 * nenhum item aqui leva a outro módulo (é o seletor, acima, que faz isso).
 */
export function ModuleNav({ module }: { module: ContrateModule }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const { setOpenMobile } = useSidebar()

	return (
		<nav aria-label={`Navegação — ${module.label}`}>
			<SidebarGroup>
				<SidebarMenu>
					{module.nav.map((item) => {
						const Icon = item.icon
						const isActive = isNavItemActive(pathname, item)
						return (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton
									tooltip={item.label}
									isActive={isActive}
									render={
										// Na gaveta mobile, escolher a tela fecha a gaveta — senão ela
										// continua cobrindo a página que acabou de abrir.
										<Link to={item.to} aria-current={isActive ? "page" : undefined} onClick={() => setOpenMobile(false)}>
											<Icon aria-hidden="true" />
											<span>{item.label}</span>
										</Link>
									}
								/>
							</SidebarMenuItem>
						)
					})}
				</SidebarMenu>
			</SidebarGroup>
		</nav>
	)
}
