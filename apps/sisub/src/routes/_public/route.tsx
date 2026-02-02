// UI Components (from @iefa/ui)
import { AnimatedThemeToggler, Button, Separator } from "@iefa/ui"

// Routing
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { useAuth } from "@/hooks/auth/useAuth"
// Hooks
import { useTheme } from "@/hooks/ui/useTheme"

/* ========================================================================
   STYLE CONSTANTS
   ======================================================================== */

/**
 * Container responsivo padrão
 * Segue o padrão do design system: w-full mx-auto
 */
const CONTAINER_CLASSES =
	"w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

/**
 * Classes para o background animado com gradientes
 * Utiliza pseudo-elementos ::before e ::after para efeitos visuais
 */
const ANIMATED_BACKGROUND_CLASSES = `
	relative isolate flex flex-col bg-background text-foreground
	min-h-svh supports-[height:100dvh]:min-h-dvh

	before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none
	before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(52_211_153/0.14),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(6_182_212/0.12),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(139_92_246/0.10),transparent_60%)]
	dark:before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(110_231_183/0.18),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(34_211_238/0.16),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(167_139_250/0.14),transparent_60%)]

	before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]

	after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10
	after:bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.8)_1px,transparent_1px)]
	after:bg-size-[12px_12px] after:opacity-[0.02]
	dark:after:opacity-[0.04]
`

/**
 * Classes base para links de navegação
 * Garante foco visível (focus-visible:ring) conforme design system
 */
const NAV_LINK_BASE_CLASSES =
	"inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"

/**
 * Classes para link de navegação não ativo
 * Usa cores semânticas: text-foreground, hover:bg-accent
 */
const NAV_LINK_INACTIVE_CLASSES = `${NAV_LINK_BASE_CLASSES} text-foreground hover:bg-accent hover:text-accent-foreground`

/**
 * Classes para link de navegação ativo
 * Usa cores semânticas: bg-accent, text-accent-foreground
 */
const NAV_LINK_ACTIVE_CLASSES = `${NAV_LINK_BASE_CLASSES} bg-accent text-accent-foreground`

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
		<div className={ANIMATED_BACKGROUND_CLASSES}>
			{/* ============================================================
			    HEADER
			    ============================================================ */}
			<header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
				<div className={`${CONTAINER_CLASSES} h-14 flex items-center justify-between gap-3`}>
					{/* Logo e Navegação */}
					<div className="flex items-center gap-3">
						<Link
							to="/"
							className="text-base sm:text-lg font-bold tracking-tight rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
							<Button render={<Link to="/forecast">Acessar Sistema</Link>} size="sm" />
						) : (
							<Button render={<Link to="/auth">Entrar</Link>} size="sm" />
						)}

						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</div>
			</header>

			{/* ============================================================
			    MAIN CONTENT
			    ============================================================ */}
			<main id="conteudo" className="flex-1">
				<div className={`${CONTAINER_CLASSES} py-8 md:py-10`}>
					<Outlet />
				</div>
			</main>

			{/* ============================================================
			    FOOTER
			    ============================================================ */}
			<footer className="border-t">
				<div
					className={`${CONTAINER_CLASSES} h-14 flex items-center justify-center text-xs text-muted-foreground`}
				>
					© {new Date().getFullYear()} SISUB • Desenvolvido por Ten. Nanni (IEFA) e Temn. Bruno
					(GAP-MN).
				</div>
			</footer>
		</div>
	)
}
