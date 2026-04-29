import { Link } from "@tanstack/react-router"
import { LogOut } from "iconoir-react"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "./ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu"

function getInitials(nameOrEmail?: string) {
	if (!nameOrEmail) return "US"
	const name = nameOrEmail.split("@")[0]
	const parts = name
		.trim()
		.split(/\s+/)
		.filter((p) => p.length > 0)
	if (parts.length === 0) return "US"
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getFirstName(displayName: string): string {
	if (displayName.includes("@")) return displayName.split("@")[0] ?? displayName
	return displayName.split(/\s+/)[0] ?? displayName
}

export function UserMenu() {
	const {
		user,
		isAuthenticated,
		actions: { signOut },
	} = useAuth()

	const meta = (user?.user_metadata ?? {}) as {
		name?: string
		full_name?: string
		display_name?: string
		first_name?: string
	}
	const email = user?.email ?? ""
	const displayName = meta.display_name || meta.first_name || meta.name || meta.full_name || email || "Usuário"
	const initials = getInitials(displayName)
	const firstName = getFirstName(displayName)

	if (!isAuthenticated) {
		return <Button nativeButton={false} render={<Link to="/auth">Entrar</Link>} variant="outline" size="sm" />
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" size="sm" className="data-[state=open]:bg-accent data-[state=open]:text-accent-foreground gap-2 px-2">
						{/* Iniciais em mono — único identificador visual */}
						<span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{initials}</span>
						{/* Primeiro nome — oculto em mobile */}
						<span className="hidden sm:block text-[11px] font-medium uppercase tracking-[0.06em]">{firstName}</span>
					</Button>
				}
			/>

			<DropdownMenuContent className="ring-0 border border-foreground min-w-56 shadow-[3px_3px_0_0_var(--foreground)]" side="bottom" align="end" sideOffset={6}>
				<DropdownMenuGroup>
					<DropdownMenuLabel className="p-0 font-normal">
						<div className="flex flex-col gap-1 px-2 py-2.5 border-b border-border">
							<span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground leading-none">{displayName}</span>
							<span className="font-mono text-[11px] leading-none text-muted-foreground">{email}</span>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>

				<DropdownMenuItem
					variant="destructive"
					onSelect={async () => {
						await signOut()
					}}
				>
					<LogOut />
					Sair
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
