"use client"

import { useNavigate } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMilitaryData, useUserData } from "@/hooks/auth/useProfile"

type UserMeta = {
	name?: string
	full_name?: string
	avatar_url?: string
	picture?: string
}

export function NavUser() {
	const { user, isAuthenticated, isLoading, signOut } = useAuth()
	const navigate = useNavigate()

	const { data: userData } = useUserData(user?.id)
	const { data: military } = useMilitaryData(userData?.nrOrdem ?? null)

	const meta = (user?.user_metadata ?? {}) as UserMeta
	const displayName = military?.nmGuerra ?? meta.full_name ?? meta.name ?? user?.email?.split("@")[0] ?? "Usuário"
	const email = user?.email ?? ""
	const posto = military?.sgPosto ?? ""
	const avatarUrl = meta.avatar_url ?? meta.picture ?? ""

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				{isLoading ? (
					<div className="h-8 w-full rounded-lg bg-muted animate-pulse" aria-hidden="true" />
				) : !isAuthenticated ? (
					<Button variant="outline" size="sm" onClick={() => navigate({ to: "/auth" })}>
						Entrar
					</Button>
				) : (
					<div className="flex items-center gap-2 px-2 py-1.5">
						<Avatar className="size-8 rounded-lg grayscale shrink-0">
							<AvatarImage src={avatarUrl} alt={displayName} />
							<AvatarFallback className="rounded-lg text-[10px] font-semibold">{posto || "—"}</AvatarFallback>
						</Avatar>
						<div className="hidden sm:grid flex-1 text-left text-sm leading-tight min-w-0">
							<span className="truncate font-medium">{displayName}</span>
							<span className="text-muted-foreground truncate text-xs">{email}</span>
						</div>
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground hover:text-destructive shrink-0"
							onClick={async () => {
								await signOut()
								navigate({ to: "/auth" })
							}}
							aria-label="Sair"
						>
							<LogOut className="h-4 w-4" />
						</Button>
					</div>
				)}
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
