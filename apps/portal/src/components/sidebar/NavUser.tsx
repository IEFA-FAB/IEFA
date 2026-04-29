import { useNavigate } from "@tanstack/react-router"
import { LogOut, User } from "iconoir-react"
import { useAuth } from "@/hooks/useAuth"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar"

function getInitials(nameOrEmail?: string) {
	if (!nameOrEmail?.trim()) return "US"
	const name = nameOrEmail.split("@")[0]
	const parts = name.trim().split(/\s+/)
	if (parts.length === 0 || !parts[0]) return "US"
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getFirstName(displayName: string): string {
	if (displayName.includes("@")) return displayName.split("@")[0] ?? displayName
	return displayName.split(/\s+/)[0] ?? displayName
}

export function NavUser() {
	const { isMobile } = useSidebar()
	const {
		user,
		actions: { signOut },
	} = useAuth()
	const navigate = useNavigate()

	const meta = (user?.user_metadata as Record<string, string>) ?? {}
	const email = user?.email ?? meta.email ?? ""
	const displayName = meta.display_name || meta.first_name || meta.full_name || email || "Usuário"
	const initials = getInitials(displayName)
	const firstName = getFirstName(displayName)

	const handleLogout = async () => {
		try {
			await signOut()
		} catch (_error) {}
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="default"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground gap-2"
							>
								{/* Iniciais — visíveis no estado colapsado (icon-only) */}
								<span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
									{initials}
								</span>
								{/* Primeiro nome — só aparece no estado expandido */}
								<span className="flex-1 truncate text-[11px] font-medium uppercase tracking-[0.06em]">
									{firstName}
								</span>
							</SidebarMenuButton>
						}
					/>

					<DropdownMenuContent
						className="ring-0 border border-foreground min-w-56 shadow-[3px_3px_0_0_var(--foreground)]"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex flex-col gap-1 px-2 py-2.5 border-b border-border">
									<span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground leading-none">
										{displayName}
									</span>
									<span className="font-mono text-[11px] leading-none text-muted-foreground">
										{email}
									</span>
								</div>
							</DropdownMenuLabel>
						</DropdownMenuGroup>

						<DropdownMenuItem onClick={() => navigate({ to: "/" })}>
							<User />
							Perfil
						</DropdownMenuItem>

						<DropdownMenuSeparator />

						<DropdownMenuItem variant="destructive" onClick={handleLogout}>
							<LogOut />
							Sair
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
