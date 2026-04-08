import { formatForDisplay } from "@tanstack/react-hotkeys"
import { Link } from "@tanstack/react-router"
import { Menu, OpenNewWindow, Search } from "iconoir-react"
import { type ReactNode, useState } from "react"
import { useCommandPalette } from "@/components/command-palette/CommandPaletteProvider"
import { useTheme } from "@/hooks/useTheme"
import { COMMAND_PALETTE_HOTKEY } from "@/lib/command-palette"
import { AnimatedThemeToggler } from "./animated-theme-toggler"
import { UserMenu } from "./UserMenu"
import { Button } from "./ui/button"
import { Kbd } from "./ui/kbd"
import { Separator } from "./ui/separator"

const FOOTER_EXTERNAL_LINKS = [
	{ label: "IEFA Virtual", href: "https://iefavirtual.educaer.fab.mil.br/", description: "Plataforma EaD do IEFA" },
	{ label: "Força Aérea Brasileira", href: "https://www.fab.mil.br/", description: "Portal oficial da FAB" },
	{ label: "SEFA", href: "https://www.fab.mil.br/sefa", description: "Secretaria de Ec., Fin. e Adm." },
] as const

interface AppLayoutProps {
	children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
	const [mobileOpen, setMobileOpen] = useState(false)
	const { toggle } = useTheme()
	const { openPalette } = useCommandPalette()
	const shortcutLabel = formatForDisplay(COMMAND_PALETTE_HOTKEY)

	// Container: full em mobile/tablet; "wide" contido em desktop
	const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

	const navLinkClass =
		"inline-flex items-center text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&.active]:bg-accent [&.active]:text-accent-foreground text-foreground hover:bg-accent hover:text-accent-foreground"

	return (
		<div className="relative isolate flex flex-col bg-background text-foreground min-h-svh supports-[height:100dvh]:min-h-dvh">
			{/* Skip link para acessibilidade */}
			<a
				href="#conteudo"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 bg-primary px-3 py-2 text-sm text-primary-foreground"
			>
				Ir para o conteúdo
			</a>

			{/* Cabeçalho (sticky sem transform) */}
			<header className="sticky top-0 z-50 border-b backdrop-blur supports-backdrop-filter:bg-background/60">
				<div className={`${container} h-14 flex items-center justify-between gap-3`}>
					{/* Esquerda: Marca + Navegação desktop */}
					<div className="flex items-center gap-3">
						<Link
							to="/"
							className="text-base sm:text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 px-1"
							aria-label="Página inicial - Portal IEFA"
						>
							Portal IEFA
						</Link>

						<Separator orientation="vertical" className="h-6 hidden sm:block" />

						<nav className="hidden md:flex items-center gap-1" aria-label="Navegação principal">
							<Link to="/facilities" className={navLinkClass}>
								Facilidades
							</Link>
							<Link to="/journal" className={navLinkClass}>
								Publicações
							</Link>
							<Link to="/about" className={navLinkClass}>
								Sobre
							</Link>
						</nav>
					</div>

					{/* Direita: Ações */}
					<div className="flex items-center gap-2">
						<Button variant="outline" size="sm" className="hidden md:inline-flex items-center gap-2" onClick={openPalette} aria-label="Abrir busca rápida">
							<Search className="size-4" aria-hidden="true" />
							<span>Buscar</span>
							<Kbd className="ml-1">{shortcutLabel}</Kbd>
						</Button>

						<Button variant="ghost" size="icon" className="md:hidden" onClick={openPalette} aria-label="Abrir busca rápida">
							<Search className="size-4" aria-hidden="true" />
						</Button>

						{/* Botão do usuário (avatar + menu) */}
						<UserMenu />

						{/* Tema */}
						<AnimatedThemeToggler toggle={toggle} />

						{/* Menu mobile */}
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

				{/* Navegação mobile */}
				{mobileOpen && (
					<div id="mobile-nav" className="md:hidden border-t bg-background">
						<div className={`${container} py-3 flex flex-col gap-1`}>
							<Link
								to="/facilities"
								className="w-full px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
								onClick={() => setMobileOpen(false)}
							>
								Facilidades
							</Link>
							<Link
								to="/journal"
								className="w-full px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
								onClick={() => setMobileOpen(false)}
							>
								Publicações
							</Link>
							<Link
								to="/about"
								className="w-full px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
								onClick={() => setMobileOpen(false)}
							>
								Sobre o IEFA
							</Link>
						</div>
					</div>
				)}
			</header>

			{/* Conteúdo */}
			<main id="conteudo" className="flex-1">
				<div className={`${container} py-8 md:py-10`}>{children}</div>
			</main>

			{/* Rodapé */}
			<footer className="border-t">
				{/* Corpo do footer */}
				<div className={`${container} py-10 grid grid-cols-1 sm:grid-cols-3 gap-8`}>
					{/* Coluna 1 — Identidade */}
					<div className="flex flex-col gap-3">
						<span className="font-bold text-sm">Portal IEFA</span>
						<p className="text-xs text-muted-foreground leading-relaxed">Instituto de Economia, Finanças e Administração da Aeronáutica.</p>
						<p className="text-xs text-muted-foreground">SEFA · Comando da Aeronáutica · Ministério da Defesa</p>
						<p className="text-xs text-muted-foreground">Rio de Janeiro — RJ</p>
					</div>

					{/* Coluna 2 — Navegação */}
					<nav aria-label="Links do rodapé">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Navegação</p>
						<ul className="flex flex-col gap-2">
							<li>
								<Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Início
								</Link>
							</li>
							<li>
								<Link to="/facilities" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Facilidades
								</Link>
							</li>
							<li>
								<Link to="/journal" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Publicações
								</Link>
							</li>
							<li>
								<Link to="/about" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Sobre o IEFA
								</Link>
							</li>
						</ul>
					</nav>

					{/* Coluna 3 — Links externos */}
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

				{/* Barra inferior */}
				<div className="border-t">
					<div className={`${container} h-12 flex items-center justify-between gap-4 text-xs text-muted-foreground`}>
						<span>
							© {new Date().getFullYear()} IEFA. <strong>Desenvolvido por Ten Nanni (IEFA)</strong>.
						</span>
						<span className="hidden sm:inline shrink-0">Serviços externos podem exigir login próprio.</span>
					</div>
				</div>
			</footer>
		</div>
	)
}
