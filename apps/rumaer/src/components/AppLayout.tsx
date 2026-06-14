import { Link } from "@tanstack/react-router"
import { Menu, OpenNewWindow } from "iconoir-react"
import { type ReactNode, useState } from "react"
import { useTheme } from "@/hooks/useTheme"
import { AnimatedThemeToggler } from "./animated-theme-toggler"
import { UserMenu } from "./UserMenu"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"

const FOOTER_EXTERNAL_LINKS = [
	{ label: "Força Aérea Brasileira", href: "https://www.fab.mil.br/", description: "Portal oficial da FAB" },
	{ label: "SEFA", href: "https://www.fab.mil.br/sefa", description: "Secretaria de Ec., Fin. e Adm." },
] as const

const NAV_LINKS = [
	{ to: "/uniformes", label: "Uniformes" },
	{ to: "/admin", label: "Administração" },
] as const

interface AppLayoutProps {
	children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
	const [mobileOpen, setMobileOpen] = useState(false)
	const { toggle } = useTheme()

	const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"
	const navItemClass = "px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground"

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
							aria-label="Página inicial — RUMAER"
						>
							RUMAER
						</Link>

						<Separator orientation="vertical" className="h-6 hidden sm:block" />

						<nav className="hidden md:flex items-center" aria-label="Navegação principal">
							{NAV_LINKS.map((l) => (
								<Link key={l.to} to={l.to} className={navItemClass}>
									{l.label}
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
					<div id="mobile-nav" className="md:hidden border-t bg-background">
						<div className={`${container} py-3 flex flex-col`}>
							{NAV_LINKS.map((l) => (
								<Link key={l.to} to={l.to} className="px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent" onClick={() => setMobileOpen(false)}>
									{l.label}
								</Link>
							))}
						</div>
					</div>
				)}
			</header>

			<main id="conteudo" className="flex-1">
				<div className={`${container} py-8 md:py-10`}>{children}</div>
			</main>

			<footer className="border-t">
				<div className={`${container} py-10 grid grid-cols-1 sm:grid-cols-3 gap-8`}>
					<div className="flex flex-col gap-3">
						<span className="font-bold text-sm">RUMAER</span>
						<p className="text-xs text-muted-foreground leading-relaxed">Regulamento de Uniformes da Aeronáutica — versão interativa.</p>
						<p className="text-xs text-muted-foreground">SEFA · Comando da Aeronáutica · Ministério da Defesa</p>
					</div>

					<nav aria-label="Links do rodapé">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Navegação</p>
						<ul className="flex flex-col gap-2">
							<li>
								<Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Início
								</Link>
							</li>
							<li>
								<Link to="/uniformes" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Uniformes
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
						<span className="hidden sm:inline shrink-0">Login opcional — leitura pública.</span>
					</div>
				</div>
			</footer>
		</div>
	)
}
