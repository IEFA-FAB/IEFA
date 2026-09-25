import { Link } from "@tanstack/react-router"
import { LogOut } from "iconoir-react"
import { getUserIdentity } from "@/components/layout/user-identity"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "./ui/dropdown-menu"

/**
 * Conta no cabeçalho das páginas fora dos módulos (home, login, legais). Dentro de
 * um módulo a mesma pessoa aparece no rodapé da barra lateral (`SidebarUser`); os
 * dois leem nome e iniciais de `getUserIdentity`.
 */
export function UserMenu() {
	const {
		user,
		isAuthenticated,
		actions: { signOut },
	} = useAuth()

	const { displayName, firstName, initials, email } = getUserIdentity(user)

	if (!isAuthenticated) {
		return <Button nativeButton={false} render={<Link to="/auth">Entrar</Link>} variant="outline" size="sm" />
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="ghost" size="sm" className="data-popup-open:bg-accent data-popup-open:text-accent-foreground gap-2 px-2">
						{/* Iniciais em mono — único identificador visual */}
						<span className="font-mono text-[11px] font-semibold uppercase tracking-(--tracking-label) text-muted-foreground">{initials}</span>
						{/* Primeiro nome — oculto em mobile */}
						<span className="hidden sm:block text-[11px] font-medium uppercase tracking-(--tracking-label)">{firstName}</span>
					</Button>
				}
			/>

			<DropdownMenuContent className="ring-0 border border-foreground min-w-56 shadow-[3px_3px_0_0_var(--foreground)]" side="bottom" align="end" sideOffset={6}>
				<DropdownMenuGroup>
					<DropdownMenuLabel className="p-0 font-normal">
						<div className="flex flex-col gap-1 px-2 py-2.5 border-b border-border">
							<span className="text-[11px] font-semibold uppercase tracking-(--tracking-label) text-foreground leading-none">{displayName}</span>
							<span className="font-mono text-[11px] leading-none text-muted-foreground">{email}</span>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>

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
