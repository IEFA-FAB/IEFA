// Routing
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { AnimatedThemeToggler } from "@/components/layout/AnimatedThemeToggler"
import { Button } from "@/components/ui/button"
import { Container } from "@/components/ui/container"
import { NavLink } from "@/components/ui/nav-link"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/auth/useAuth"
// Hooks
import { useTheme } from "@/hooks/ui/useTheme"

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

export const Route = createFileRoute("/_public")({
	component: PublicLayout,
})

/* ========================================================================
   COMPONENTS
   ======================================================================== */

function PublicLayout() {
	const { toggle } = useTheme()
	const { isAuthenticated } = useAuth()

	return (
		<div className="relative flex flex-col min-h-svh bg-background text-foreground">
			{/* ============================================================
			    HEADER
			    ============================================================ */}
			<header className="border-b border-border/60 bg-background">
				<Container className="h-14 flex items-center justify-between gap-4">
					{/* Logo e Navegação */}
					<div className="flex items-center gap-4">
						<Link
							to="/"
							className="font-mono font-bold text-base tracking-widest uppercase focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
							aria-label="Página inicial - SISUB"
						>
							SISUB
						</Link>
						<Separator orientation="vertical" className="h-5 hidden md:block" />
						<nav className="hidden md:flex items-center gap-5" aria-label="Navegação pública">
							<NavLink to="/" activeOptions={{ exact: true }}>
								Início
							</NavLink>
							<NavLink to="/tutorial">Tutorial</NavLink>
							<NavLink to="/changelog">Novidades</NavLink>
						</nav>
					</div>

					{/* Actions: Login + Theme Toggle */}
					<div className="flex items-center gap-3">
						{isAuthenticated ? (
							<Button size="sm" nativeButton={false} render={<Link to="/hub">Acessar Sistema</Link>} />
						) : (
							<Button size="sm" nativeButton={false} render={<Link to="/auth">Entrar</Link>} />
						)}
						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</Container>
			</header>

			{/* ============================================================
			    MAIN CONTENT
			    ============================================================ */}
			<main id="conteudo" className="flex-1">
				<Container className="py-8 md:py-10">
					<Outlet />
				</Container>
			</main>

			{/* ============================================================
			    FOOTER
			    ============================================================ */}
			<footer className="border-t">
				<Container className="h-14 flex items-center justify-center text-xs text-muted-foreground">
					© {new Date().getFullYear()} SISUB • Desenvolvido por Ten. Nanni (IEFA) e Ten. Bruno (GAP-MN).
				</Container>
			</footer>
		</div>
	)
}
