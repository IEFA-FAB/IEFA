import { hasPermission } from "@iefa/pbac"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Menu, OpenNewWindow } from "iconoir-react"
import { type ReactNode, useState } from "react"
import { useTheme } from "@/components/themeService"
import { useAuth } from "@/hooks/useAuth"
import { myAlphaPermissionsQueryOptions } from "@/lib/alpha/permissions"
import { AnimatedThemeToggler } from "./animated-theme-toggler"
import { LegalNoticeBanner } from "./LegalNoticeBanner"
import { UserMenu } from "./UserMenu"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"

/** Portal institucional — o ChatRADA e a suíte de aplicações continuam lá. */
const PORTAL_URL = "https://portal.iefa.com.br"

type NavItem = { to: "/aci" | "/pregoeiro" | "/alpha/fontes" | "/admin/acessos"; label: string }

const NAV: readonly NavItem[] = [
	{ to: "/aci", label: "Plataforma ACI" },
	{ to: "/pregoeiro", label: "Pregoeiro" },
]

const FOOTER_EXTERNAL_LINKS = [
	{ label: "Portal IEFA", href: PORTAL_URL, description: "Suíte de aplicações e ChatRADA" },
	{ label: "SEFA", href: "https://www.fab.mil.br/sefa", description: "Secretaria de Ec., Fin. e Adm." },
] as const

export function AppLayout({ children }: { children: ReactNode }) {
	const [mobileOpen, setMobileOpen] = useState(false)
	const { toggle } = useTheme()
	const { isAuthenticated } = useAuth()

	// Console e Acessos só aparecem para quem pode abri-los. É conveniência de tela: a
	// regra continua no servidor (α e `requireAlphaAdmin`).
	const permissions = useQuery({ ...myAlphaPermissionsQueryOptions(), enabled: isAuthenticated })
	const items: NavItem[] = [
		...NAV,
		...(hasPermission(permissions.data ?? [], "alpha", 3) ? [{ to: "/alpha/fontes", label: "Console α" } as const] : []),
		...(hasPermission(permissions.data ?? [], "alpha-admin", 3) ? [{ to: "/admin/acessos", label: "Acessos" } as const] : []),
	]

	const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"
	const desktopItemClass =
		"px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground [&.active]:underline underline-offset-8"
	const mobileItemClass =
		"px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"

	return (
		<div className="relative isolate flex flex-col bg-background text-foreground min-h-svh supports-[height:100dvh]:min-h-dvh">
			<a
				href="#conteudo"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 bg-primary px-3 py-2 text-sm text-primary-foreground"
			>
				Ir para o conteúdo
			</a>

			<header className="sticky top-0 z-50 border-b backdrop-blur supports-backdrop-filter:bg-background/60">
				<div className={`${container} h-14 flex items-center justify-between gap-3`}>
					<div className="flex items-center gap-3">
						<Link
							to="/"
							className="text-base sm:text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 px-1"
							aria-label="Página inicial - Contrate"
						>
							Contrate
						</Link>

						<Separator orientation="vertical" className="h-6 hidden sm:block" />

						<nav className="hidden md:flex items-center" aria-label="Navegação principal">
							{items.map((item) => (
								<Link key={item.to} to={item.to} className={desktopItemClass}>
									{item.label}
								</Link>
							))}
						</nav>
					</div>

					<div className="flex items-center gap-2">
						<UserMenu />
						<AnimatedThemeToggler toggle={toggle} />
						<Button
							variant="ghost"
							size="icon"
							className="md:hidden"
							onClick={() => setMobileOpen((v) => !v)}
							aria-label="Abrir menu"
							aria-expanded={mobileOpen}
							aria-controls="mobile-nav"
						>
							<Menu className="h-5 w-5" aria-hidden="true" />
						</Button>
					</div>
				</div>

				{mobileOpen && (
					<nav id="mobile-nav" className="md:hidden border-t bg-background" aria-label="Navegação principal">
						<div className={`${container} py-3 flex flex-col`}>
							{items.map((item) => (
								<Link key={item.to} to={item.to} className={mobileItemClass} onClick={() => setMobileOpen(false)}>
									{item.label}
								</Link>
							))}
						</div>
					</nav>
				)}
			</header>

			<main id="conteudo" className="flex-1">
				<div className={`${container} py-8 md:py-10`}>{children}</div>
			</main>

			<footer className="border-t">
				<div className={`${container} py-10 grid grid-cols-1 sm:grid-cols-3 gap-8`}>
					<div className="flex flex-col gap-3">
						<span className="font-bold text-sm">Contrate</span>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Copiloto de aquisições da FAB — verificação de ETP e TR contra a Lei 14.133/21 e apoio à condução do pregão.
						</p>
						<p className="text-xs text-muted-foreground">IEFA · SEFA · Comando da Aeronáutica</p>
					</div>

					<nav aria-label="Links do rodapé">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Navegação</p>
						<ul className="flex flex-col gap-2">
							{[{ to: "/", label: "Início" } as const, ...NAV].map((item) => (
								<li key={item.to}>
									<Link to={item.to} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
										{item.label}
									</Link>
								</li>
							))}
							<li>
								<Link to="/termos-de-uso" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Termos de Uso
								</Link>
							</li>
							<li>
								<Link to="/politica-de-privacidade" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Política de Privacidade
								</Link>
							</li>
							<li>
								<Link to="/politica-de-cookies" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Política de Cookies
								</Link>
							</li>
						</ul>
					</nav>

					<div>
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Links externos</p>
						<ul className="flex flex-col gap-3">
							{FOOTER_EXTERNAL_LINKS.map(({ label, href, description }) => (
								<li key={label}>
									<a href={href} target="_blank" rel="noreferrer noopener" className="group flex flex-col gap-0.5" aria-label={`Abrir ${label} em nova aba`}>
										<span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
											{label}
											<OpenNewWindow className="h-3 w-3" aria-hidden="true" />
										</span>
										<span className="text-xs text-muted-foreground/60">{description}</span>
									</a>
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className="border-t">
					<div className={`${container} h-12 flex items-center justify-between gap-4 text-xs text-muted-foreground`}>
						<span>
							© {new Date().getFullYear()} IEFA. <strong>Desenvolvido por Ten Nanni (IEFA)</strong>.
						</span>
						<span className="hidden sm:inline shrink-0">A palavra final é do gestor.</span>
					</div>
				</div>
			</footer>

			<LegalNoticeBanner />
		</div>
	)
}
