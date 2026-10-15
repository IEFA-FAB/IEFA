import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { Link, Outlet, useLocation } from "@tanstack/react-router"
import { Home } from "lucide-react"
import { useEffect } from "react"
import { useSisprovAccess } from "@/auth/pbac"
import { AnimatedThemeToggler } from "@/components/AnimatedThemeToggler"
import { UserMenu } from "@/components/UserMenu"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from "@/components/ui/sidebar"
import { useTheme } from "@/hooks/useTheme"
import { ADMIN_NAV, accessibleModules, findModuleByPath } from "@/lib/modules"

const APP_NAME = "SISPROV"

/**
 * A casca das rotas de módulo: sidebar com um item por módulo acessível, a navegação interna
 * do módulo ativo, rodapé com links legais, cabeçalho com o nome da página, tema e usuário.
 *
 * Menor que o `AppShell` do sisub de propósito: sem escopo por cozinha na URL, sem paleta de
 * comandos, sem rascunhos. Cresce quando o conteúdo pedir (`STYLE_CONTRACT.md`, §4).
 */
export function AppShell() {
	const location = useLocation()
	const { toggle } = useTheme()
	const { permissions, isLoading, canManage } = useSisprovAccess()
	const modules = accessibleModules(permissions)
	const active = findModuleByPath(location.pathname)

	const pageLabel = active?.label ?? "Início"
	useEffect(() => {
		document.title = `${pageLabel} — ${APP_NAME}`
	}, [pageLabel])

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon" variant="sidebar">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton size="lg" render={<Link to="/hub" />} tooltip="Início">
								<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
									<Home className="size-4" />
								</div>
								<div className="grid flex-1 text-left leading-tight">
									<span className="truncate font-mono text-subheading">{APP_NAME}</span>
									<span className="truncate text-hint text-muted-foreground">Sistema de Provisões</span>
								</div>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>

				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Módulos</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{isLoading && modules.length === 0
									? Array.from({ length: 3 }).map((_, i) => (
											<SidebarMenuItem key={i}>
												<div className="h-8 w-full animate-pulse rounded-md bg-sidebar-accent/10" />
											</SidebarMenuItem>
										))
									: modules.map((module) => (
											<SidebarMenuItem key={module.id}>
												<SidebarMenuButton isActive={active?.id === module.id} tooltip={module.label} render={<Link to={module.basePath} />}>
													<module.icon />
													<span>{module.label}</span>
												</SidebarMenuButton>
											</SidebarMenuItem>
										))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>

					{active?.id === "sisprov-admin" && (
						<SidebarGroup>
							<SidebarGroupLabel>Administração</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{ADMIN_NAV.filter((item) => item.minLevel < 3 || canManage).map((item) => (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton isActive={location.pathname === item.to} tooltip={item.label} render={<Link to={item.to} />}>
												<item.icon />
												<span>{item.label}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					)}
				</SidebarContent>

				<SidebarFooter>
					<LegalFooterLinks
						variant="short"
						separator="·"
						className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1 text-hint text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden"
						linkClassName="text-hint text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
					/>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<SidebarInset className="flex h-full w-full flex-col overflow-hidden">
				<header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
					<div className="flex min-w-0 items-center gap-3">
						<SidebarTrigger className="size-9" />
						<nav aria-label="Trilha" className="flex min-w-0 items-center gap-2 text-subheading">
							<Link to="/hub" className="text-muted-foreground transition-colors hover:text-primary">
								Início
							</Link>
							{active && (
								<>
									<span className="text-muted-foreground/50">/</span>
									<span className="truncate">{active.label}</span>
								</>
							)}
						</nav>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<UserMenu />
						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</header>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<main className="h-full overflow-y-auto focus:outline-none">
						<div className="mx-auto min-h-full w-full max-w-screen-2xl px-3 py-6 sm:px-6 md:py-8">
							<Outlet />
						</div>
					</main>
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
