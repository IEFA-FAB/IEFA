"use client"

import { useNavigate } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMilitaryData, useUserData } from "@/hooks/auth/useProfile"
import { toNameCase } from "@/lib/utils"

type UserMeta = {
	name?: string
	full_name?: string
	avatar_url?: string
	picture?: string
}

export function UserProfileRow() {
	const { user, isAuthenticated, isLoading, signOut } = useAuth()
	const navigate = useNavigate()

	const { data: userData } = useUserData(user?.id)
	const { data: military } = useMilitaryData(userData?.nrOrdem ?? null)

	const meta = (user?.user_metadata ?? {}) as UserMeta
	const displayName = toNameCase(military?.nmGuerra ?? meta.full_name ?? meta.name ?? user?.email?.split("@")[0] ?? "Usuário")
	const email = user?.email ?? ""
	const posto = military?.sgPosto ?? ""
	const avatarUrl = meta.avatar_url ?? meta.picture ?? ""

	if (isLoading) return <div className="h-8 w-full rounded-lg bg-muted animate-pulse" aria-hidden="true" />
	if (!isAuthenticated)
		return (
			<Button variant="outline" size="sm" onClick={() => navigate({ to: "/auth" })}>
				Entrar
			</Button>
		)

	return (
		<div className="flex items-center gap-2 px-2 py-1.5">
			<Avatar className="size-8 rounded-lg grayscale shrink-0">
				<AvatarImage src={avatarUrl} alt={displayName} />
				<AvatarFallback className="rounded-lg text-[10px] font-semibold">{posto || "—"}</AvatarFallback>
			</Avatar>
			<div className="hidden sm:grid flex-1 text-left text-sm leading-tight min-w-0">
				<span className="truncate font-medium">{displayName}</span>
				<span className="text-muted-foreground truncate text-xs">{email}</span>
			</div>
			<Tooltip>
				<TooltipTrigger
					render={
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
					}
				/>
				<TooltipContent>Sair</TooltipContent>
			</Tooltip>
		</div>
	)
}

export function NavUser() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<UserProfileRow />
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
