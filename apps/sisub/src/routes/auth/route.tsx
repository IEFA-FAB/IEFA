// Routing
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router"
// Icons
import { ArrowLeft } from "lucide-react"
// Validation
import { z } from "zod"
// Layout
import { AnimatedThemeToggler } from "@/components/layout/AnimatedThemeToggler"
import { Button } from "@/components/ui/button"
import { Container } from "@/components/ui/container"
import { Separator } from "@/components/ui/separator"
// Hooks
import { useTheme } from "@/hooks/ui/useTheme"

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

const authSearchSchema = z.object({
	redirect: z.string().optional(),
})

export const Route = createFileRoute("/auth")({
	validateSearch: authSearchSchema,
	// Proteção Inversa: se já estiver autenticado, redireciona para o sistema
	beforeLoad: ({ context, search }) => {
		const { user } = context.auth
		if (user) {
			throw redirect({ to: search.redirect || "/hub" })
		}
	},
	component: AuthLayout,
})

/* ========================================================================
   LAYOUT
   ======================================================================== */

function AuthLayout() {
	const { toggle } = useTheme()

	return (
		<div className="relative flex flex-col min-h-svh bg-background text-foreground">
			{/* ============================================================
			    HEADER — mesma família do _public/route.tsx, sem nav principal
			    ============================================================ */}
			<header className="border-b border-border/60 bg-background">
				<Container className="h-14 flex items-center justify-between gap-4">
					{/* Brand + Breadcrumb */}
					<div className="flex items-center gap-4">
						<Link
							to="/"
							className="font-mono font-bold text-base tracking-widest uppercase focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
							aria-label="Página inicial — SISUB"
						>
							SISUB
						</Link>
						<Separator orientation="vertical" className="h-5 hidden md:block" />
						<span className="hidden md:block font-mono text-xs text-muted-foreground tracking-[0.15em] uppercase">Acesso ao Sistema</span>
					</div>

					{/* Actions: Voltar + Theme Toggle */}
					<div className="flex items-center gap-3">
						<Button
							variant="ghost"
							size="sm"
							nativeButton={false}
							render={
								<Link to="/" className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
									<ArrowLeft className="h-3.5 w-3.5" aria-hidden />
									Início
								</Link>
							}
						/>
						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</Container>
			</header>

			{/* ============================================================
			    MAIN — flex-1 flex passa a altura toda para o Outlet
			    ============================================================ */}
			<main id="conteudo" className="flex-1 flex">
				<Outlet />
			</main>

			{/* ============================================================
			    FOOTER
			    ============================================================ */}
			<footer className="border-t">
				<Container className="h-14 flex items-center justify-center font-mono text-xs text-muted-foreground">
					© {new Date().getFullYear()} SISUB · Sistema de Subsistência · FAB
				</Container>
			</footer>
		</div>
	)
}
