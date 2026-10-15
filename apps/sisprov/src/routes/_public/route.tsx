import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { AnimatedThemeToggler } from "@/components/AnimatedThemeToggler"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/cn"

const SHELL_WIDTH = "mx-auto w-full px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

/** Layout dos documentos legais: a única superfície pública do SISPROV. */
export const Route = createFileRoute("/_public")({
	component: PublicLayout,
})

function PublicLayout() {
	const { toggle } = useTheme()
	const { isAuthenticated } = useAuth()

	return (
		<div className="relative flex min-h-svh flex-col bg-background text-foreground">
			<header className="sticky top-0 z-40 border-b border-border/60 bg-background">
				<div className={cn(SHELL_WIDTH, "flex h-14 items-center justify-between gap-4")}>
					<Link
						to="/"
						className="font-mono text-base font-bold tracking-widest uppercase rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
						aria-label="Página inicial - SISPROV"
					>
						SISPROV
					</Link>
					<div className="flex items-center gap-3">
						<Button
							size="sm"
							nativeButton={false}
							render={<Link to={isAuthenticated ? "/hub" : "/auth"}>{isAuthenticated ? "Acessar o sistema" : "Entrar"}</Link>}
						/>
						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</div>
			</header>

			<main id="conteudo" className="flex-1">
				<div className={cn(SHELL_WIDTH, "py-8 md:py-10")}>
					<Outlet />
				</div>
			</main>

			<footer className="border-t">
				<div suppressHydrationWarning className={cn(SHELL_WIDTH, "flex h-14 items-center justify-between gap-4 text-caption text-muted-foreground")}>
					<span>© {new Date().getFullYear()} IEFA. SISPROV, Projeto SIA.</span>
					<LegalFooterLinks className="flex items-center gap-x-3" />
				</div>
			</footer>
		</div>
	)
}
