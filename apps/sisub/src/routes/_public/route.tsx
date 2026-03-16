// Routing
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { AnimatedThemeToggler } from "@/components/animated-theme-toggler"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/auth/useAuth"
// Hooks
import { useTheme } from "@/hooks/ui/useTheme"
import { cn } from "@/lib/utils"

/* ========================================================================
   STYLE CONSTANTS
   ======================================================================== */

/**
 * Container responsivo padrão
 * Segue o padrão do design system: w-full mx-auto
 */
const CONTAINER_CLASSES = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

/**
 * Classes base para links de navegação
 */
const NAV_LINK_BASE_CLASSES =
	"inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"

/**
 * Classes para link de navegação não ativo
 */
const NAV_LINK_INACTIVE_CLASSES = cn(NAV_LINK_BASE_CLASSES, "text-foreground hover:bg-accent hover:text-accent-foreground")

/**
 * Classes para link de navegação ativo
 */
const NAV_LINK_ACTIVE_CLASSES = cn(NAV_LINK_BASE_CLASSES, "bg-accent text-accent-foreground")

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

export const Route = createFileRoute("/_public")({
	component: PublicLayout,
})

/* ========================================================================
   COMPONENTS
   ======================================================================== */

/**
 * Layout para rotas públicas (não requer autenticação)
 *
 * Estrutura:
 * - Header com logo, navegação e botão de login
 * - Main com conteúdo dinâmico (Outlet)
 * - Footer com informações de copyright
 *
 * Features:
 * - Background animado com gradientes
 * - Theme toggle integrado
 * - Navegação responsiva
 * - Acessibilidade completa (ARIA labels, foco visível)
 */
function PublicLayout() {
	const { toggle } = useTheme()
	const { isAuthenticated } = useAuth()

	return (
		<div className="relative flex flex-col min-h-svh bg-background text-foreground">
			{/* ============================================================
			    HEADER
			    ============================================================ */}
			<header className="border-b bg-background">
				<div className={cn(CONTAINER_CLASSES, "h-14 flex items-center justify-between gap-3")}>
					{/* Logo e Navegação */}
					<div className="flex items-center gap-3">
						<Link
							to="/"
							className="text-base sm:text-lg font-bold tracking-tight rounded-md px-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
							aria-label="Página inicial - SISUB"
						>
							SISUB
						</Link>
						<Separator orientation="vertical" className="h-6 hidden sm:block" />
						<nav className="hidden md:flex items-center gap-1" aria-label="Navegação pública">
							<Link
								to="/"
								className={NAV_LINK_INACTIVE_CLASSES}
								activeProps={{
									className: NAV_LINK_ACTIVE_CLASSES,
								}}
								activeOptions={{ exact: true }}
							>
								Início
							</Link>
							<Link
								to="/tutorial"
								className={NAV_LINK_INACTIVE_CLASSES}
								activeProps={{
									className: NAV_LINK_ACTIVE_CLASSES,
								}}
							>
								Tutorial
							</Link>
							<Link
								to="/changelog"
								className={NAV_LINK_INACTIVE_CLASSES}
								activeProps={{
									className: NAV_LINK_ACTIVE_CLASSES,
								}}
							>
								Novidades
							</Link>
						</nav>
					</div>

					{/* Actions: Login + Theme Toggle */}
					<div className="flex items-center gap-2">
						{isAuthenticated ? (
							<Button nativeButton={false} render={<Link to="/hub">Acessar Sistema</Link>} size="sm" />
						) : (
							<Button nativeButton={false} render={<Link to="/auth">Entrar</Link>} size="sm" />
						)}

						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</div>
			</header>

			{/* ============================================================
			    MAIN CONTENT
			    ============================================================ */}
			<main id="conteudo" className="flex-1">
				<div className={cn(CONTAINER_CLASSES, "py-8 md:py-10")}>
					<Outlet />
				</div>
			</main>

			{/* ============================================================
			    FOOTER
			    ============================================================ */}
			<footer className="border-t">
				<div className={cn(CONTAINER_CLASSES, "h-14 flex items-center justify-center text-xs text-muted-foreground")}>
					© {new Date().getFullYear()} SISUB • Desenvolvido por Ten. Nanni (IEFA) e Ten. Bruno (GAP-MN).
				</div>
			</footer>
		</div>
	)
}
