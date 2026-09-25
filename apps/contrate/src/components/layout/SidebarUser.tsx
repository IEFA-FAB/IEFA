import { Link, useRouterState } from "@tanstack/react-router"
import { HalfMoon, LogIn, LogOut, MoreHoriz, SunLight } from "iconoir-react"
import { useTheme } from "@/components/themeService"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/useAuth"
import { getUserIdentity } from "./user-identity"

/**
 * Troca de tema como item de menu da barra — recolhe para o ícone junto com os
 * outros. Os dois ícones ficam montados e o CSS (`dark:`) escolhe qual aparece:
 * antes da hidratação o estado em JS ainda não sabe o tema do SO, a folha sabe.
 */
export function SidebarThemeToggle() {
	const { theme, toggle } = useTheme()
	const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro"

	return (
		<SidebarMenuItem>
			<SidebarMenuButton tooltip={label} aria-label={label} onClick={toggle}>
				<SunLight className="hidden dark:block" aria-hidden="true" />
				<HalfMoon className="dark:hidden" aria-hidden="true" />
				<span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}

/**
 * Rodapé da barra: tema e quem está usando.
 *
 * Sem sessão (o Pregoeiro é aberto) o bloco da pessoa vira "Entrar", e o login
 * devolve para a MESMA tela — quem estava lendo a biblioteca de frases e quis
 * salvar uma preferência não deve cair na home depois de entrar.
 */
export function SidebarUser() {
	const {
		user,
		isAuthenticated,
		actions: { signOut },
	} = useAuth()
	const { isMobile, setOpenMobile } = useSidebar()
	const href = useRouterState({ select: (s) => s.location.href })

	if (!isAuthenticated || !user) {
		return (
			<SidebarMenu>
				<SidebarThemeToggle />
				<SidebarMenuItem>
					<SidebarMenuButton
						tooltip="Entrar"
						className="border-sidebar-foreground bg-sidebar-foreground font-medium text-sidebar hover:bg-sidebar-foreground hover:text-sidebar"
						render={
							<Link to="/auth" search={{ redirect: href }} onClick={() => setOpenMobile(false)}>
								<LogIn aria-hidden="true" />
								<span>Entrar</span>
							</Link>
						}
					/>
				</SidebarMenuItem>
			</SidebarMenu>
		)
	}

	const { displayName, initials, email } = getUserIdentity(user)

	return (
		<SidebarMenu>
			<SidebarThemeToggle />
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								tooltip={displayName}
								aria-label={`Conta: ${displayName}`}
								className="data-popup-open:border-sidebar-foreground data-popup-open:bg-background"
							>
								<span
									className="flex aspect-square size-8 shrink-0 items-center justify-center border border-sidebar-foreground bg-background font-mono font-semibold text-2xs text-sidebar-foreground tracking-(--tracking-label)"
									aria-hidden="true"
								>
									{initials}
								</span>
								<span className="grid flex-1 text-left leading-tight">
									<span className="truncate font-medium text-sm">{displayName}</span>
									<span className="truncate font-mono text-2xs text-sidebar-foreground/60">{email}</span>
								</span>
								<MoreHoriz className="ml-auto size-4 shrink-0 text-sidebar-foreground/60" aria-hidden="true" />
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent
						className="w-auto min-w-56 border border-foreground shadow-[3px_3px_0_0_var(--foreground)] ring-0"
						side={isMobile ? "top" : "right"}
						align="end"
						sideOffset={6}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="p-0 font-normal">
								<span className="flex flex-col gap-1 border-border border-b px-2 py-2.5">
									<span className="font-semibold text-2xs text-foreground uppercase leading-none tracking-(--tracking-label)">{displayName}</span>
									<span className="font-mono text-2xs text-muted-foreground leading-none">{email}</span>
								</span>
							</DropdownMenuLabel>
						</DropdownMenuGroup>
						<DropdownMenuItem
							variant="destructive"
							onClick={async () => {
								await signOut()
							}}
						>
							<LogOut aria-hidden="true" />
							Sair
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
