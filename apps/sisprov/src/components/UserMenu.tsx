import { Link, useNavigate } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/useAuth"
import { toNameCase } from "@/lib/utils"

type UserMeta = { name?: string; full_name?: string; display_name?: string }

function initialsOf(nameOrEmail: string): string {
	const base = nameOrEmail.includes("@") ? (nameOrEmail.split("@")[0] ?? nameOrEmail) : nameOrEmail
	const parts = base
		.trim()
		.split(/[\s.]+/)
		.filter(Boolean)
	if (parts.length === 0) return "US"
	if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase()
	return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase()
}

/**
 * Identidade da sessão e saída. O posto e o nome de guerra (via `core.military_identity`)
 * entram quando o app tiver a leitura do vínculo SARAM (change seguinte); até lá, nome da
 * conta ou e-mail.
 */
export function UserMenu() {
	const { user, isAuthenticated, isLoading, actions } = useAuth()
	const navigate = useNavigate()

	if (isLoading) return <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
	if (!isAuthenticated) return <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/auth">Entrar</Link>} />

	const meta = (user?.user_metadata ?? {}) as UserMeta
	const email = user?.email ?? ""
	const displayName = toNameCase(meta.display_name || meta.full_name || meta.name || email.split("@")[0] || "Usuário")

	return (
		<div className="flex items-center gap-2">
			<Avatar className="size-8">
				<AvatarFallback>{initialsOf(displayName)}</AvatarFallback>
			</Avatar>
			<div className="hidden min-w-0 text-left leading-tight sm:grid">
				<span className="truncate text-subheading">{displayName}</span>
				<span className="truncate text-caption text-muted-foreground">{email}</span>
			</div>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							className="shrink-0"
							aria-label="Sair"
							onClick={async () => {
								await actions.signOut()
								navigate({ to: "/auth" })
							}}
						>
							<LogOut className="size-4" />
						</Button>
					}
				/>
				<TooltipContent>Sair</TooltipContent>
			</Tooltip>
		</div>
	)
}
