import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { LogOut, Settings } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { militaryProfileQueryOptions } from "@/lib/uniforms/hooks"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu"

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
	const { data: military } = useQuery({ ...militaryProfileQueryOptions(), enabled: isAuthenticated })

	const displayName = meta.display_name || meta.first_name || meta.name || meta.full_name || email || "Usuário"
	const initials = getInitials(displayName)
	// Quando logado com perfil militar, prefere posto + nome de guerra.
	const postoNome = military?.sgPosto ? `${military.sgPosto}${military.nmGuerra ? ` ${military.nmGuerra}` : ""}` : null
	const firstName = postoNome ?? getFirstName(displayName)

	if (!isAuthenticated) {
		return <Button nativeButton={false} render={<Link to="/auth">Entrar</Link>} variant="outline" size="sm" />
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2.5 data-[state=open]:bg-accent data-[state=open]:text-foreground">
						{/* Avatar com iniciais — navy + dourado, alinhado à marca */}
						<span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary text-[11px] font-bold text-gold" aria-hidden="true">
							{initials}
						</span>
						{/* Primeiro nome — oculto em mobile */}
						<span className="hidden text-sm font-medium sm:block">{firstName}</span>
					</Button>
				}
			/>

			<DropdownMenuContent className="min-w-56" side="bottom" align="end" sideOffset={6}>
				<div className="flex items-center gap-2.5 px-2 py-2.5">
					<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-gold" aria-hidden="true">
						{initials}
					</span>
					<div className="flex min-w-0 flex-col">
						<span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
						<span className="truncate text-xs text-muted-foreground">{email}</span>
					</div>
				</div>

				<DropdownMenuSeparator />

				<DropdownMenuItem render={<Link to="/admin">Administração</Link>}>
					<Settings />
					Administração
				</DropdownMenuItem>

				<DropdownMenuItem
					variant="destructive"
					onClick={async () => {
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
