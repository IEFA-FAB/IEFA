import { formatForDisplay } from "@tanstack/react-hotkeys"
import { Link } from "@tanstack/react-router"
import { Book, Flask, InfoCircle, Map as MapIcon, Menu, NavArrowDown, OpenNewWindow, Page, PrivacyPolicy, Search, Wrench } from "iconoir-react"
import { type ReactNode, useState } from "react"
import { useCommandPalette } from "@/components/command-palette/CommandPaletteProvider"
import { useTheme } from "@/hooks/useTheme"
import { COMMAND_PALETTE_HOTKEY } from "@/lib/command-palette"
import { cn } from "@/lib/utils"
import { AnimatedThemeToggler } from "./animated-theme-toggler"
import { UserMenu } from "./UserMenu"
import { Button } from "./ui/button"
import { Kbd } from "./ui/kbd"
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "./ui/navigation-menu"
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
	const [mobileGroup, setMobileGroup] = useState<string | null>(null)
	const { toggle } = useTheme()
	const { openPalette } = useCommandPalette()
	const shortcutLabel = formatForDisplay(COMMAND_PALETTE_HOTKEY)

	// Container: full em mobile/tablet; "wide" contido em desktop
	const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

	const mobileItemClass =
		"px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground"

	const closeMobile = () => {
		setMobileOpen(false)
		setMobileGroup(null)
	}

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

						{/* Desktop: NavigationMenu com dropdowns */}
						<nav className="hidden md:flex items-center" aria-label="Navegação principal">
							<NavigationMenu>
								<NavigationMenuList>
									{/* Recursos */}
									<NavigationMenuItem>
										<NavigationMenuTrigger>Recursos</NavigationMenuTrigger>
										<NavigationMenuContent className="min-w-[280px]">
											<ul className="flex flex-col">
												<li>
													<NavigationMenuLink render={<Link to="/facilities" />}>
														<Wrench className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
														<div className="flex flex-col gap-0.5">
															<span className="font-medium leading-none">Soluções</span>
															<span className="text-xs text-muted-foreground leading-snug">Ferramentas e serviços para organizações militares</span>
														</div>
													</NavigationMenuLink>
												</li>
											</ul>
										</NavigationMenuContent>
									</NavigationMenuItem>

									{/* Pesquisa */}
									<NavigationMenuItem>
										<NavigationMenuTrigger>Pesquisa</NavigationMenuTrigger>
										<NavigationMenuContent className="min-w-[280px]">
											<ul className="flex flex-col">
												<li>
													<NavigationMenuLink render={<Link to="/research" />}>
														<Flask className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
														<div className="flex flex-col gap-0.5">
															<span className="font-medium leading-none">Pesquisa & Inovação</span>
															<span className="text-xs text-muted-foreground leading-snug">Linhas de pesquisa, áreas temáticas e banco de temas</span>
														</div>
													</NavigationMenuLink>
												</li>
												<li className="border-t border-border">
													<NavigationMenuLink render={<Link to="/journal" />}>
														<Book className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
														<div className="flex flex-col gap-0.5">
															<span className="font-medium leading-none">Journal</span>
															<span className="text-xs text-muted-foreground leading-snug">Revista científica do IEFA</span>
														</div>
													</NavigationMenuLink>
												</li>
												<li className="border-t border-border">
													<NavigationMenuLink render={<Link to="/journal/articles" />}>
														<Page className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
														<div className="flex flex-col gap-0.5">
															<span className="font-medium leading-none">Artigos</span>
															<span className="text-xs text-muted-foreground leading-snug">Publicações acadêmicas revisadas por pares</span>
														</div>
													</NavigationMenuLink>
												</li>
												<li className="border-t border-border">
													<NavigationMenuLink render={<Link to="/roadmap" />}>
														<MapIcon className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
														<div className="flex flex-col gap-0.5">
															<span className="font-medium leading-none">Roadmap</span>
															<span className="text-xs text-muted-foreground leading-snug">Planejamento e evolução do portal</span>
														</div>
													</NavigationMenuLink>
												</li>
											</ul>
										</NavigationMenuContent>
									</NavigationMenuItem>

									{/* Institucional */}
									<NavigationMenuItem>
										<NavigationMenuTrigger>Institucional</NavigationMenuTrigger>
										<NavigationMenuContent className="min-w-[280px]">
											<ul className="flex flex-col">
												<li>
													<NavigationMenuLink render={<Link to="/about" />}>
														<InfoCircle className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
														<div className="flex flex-col gap-0.5">
															<span className="font-medium leading-none">Sobre</span>
															<span className="text-xs text-muted-foreground leading-snug">Conheça o Instituto de Economia, Finanças e Administração</span>
														</div>
													</NavigationMenuLink>
												</li>
												<li className="border-t border-border">
													<NavigationMenuLink render={<Link to="/innovation-policy" />}>
														<PrivacyPolicy className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
														<div className="flex flex-col gap-0.5">
															<span className="font-medium leading-none">Política de Inovação</span>
															<span className="text-xs text-muted-foreground leading-snug">Diretrizes institucionais de inovação</span>
														</div>
													</NavigationMenuLink>
												</li>
											</ul>
										</NavigationMenuContent>
									</NavigationMenuItem>
								</NavigationMenuList>
							</NavigationMenu>
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

				{/* Navegação mobile — collapsible groups */}
				{mobileOpen && (
					<div id="mobile-nav" className="md:hidden border-t bg-background">
						<div className={`${container} py-3 flex flex-col`}>
							{/* Recursos */}
							<button
								type="button"
								className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
								onClick={() => setMobileGroup((prev) => (prev === "recursos" ? null : "recursos"))}
								aria-expanded={mobileGroup === "recursos"}
							>
								Recursos
								<NavArrowDown className={cn("size-3.5 transition-transform duration-200", mobileGroup === "recursos" && "rotate-180")} aria-hidden="true" />
							</button>
							{mobileGroup === "recursos" && (
								<div className="border-l border-border ml-3 flex flex-col">
									<Link to="/facilities" className={mobileItemClass} onClick={closeMobile}>
										Soluções
									</Link>
								</div>
							)}

							{/* Pesquisa */}
							<button
								type="button"
								className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
								onClick={() => setMobileGroup((prev) => (prev === "pesquisa" ? null : "pesquisa"))}
								aria-expanded={mobileGroup === "pesquisa"}
							>
								Pesquisa
								<NavArrowDown className={cn("size-3.5 transition-transform duration-200", mobileGroup === "pesquisa" && "rotate-180")} aria-hidden="true" />
							</button>
							{mobileGroup === "pesquisa" && (
								<div className="border-l border-border ml-3 flex flex-col">
									<Link to="/research" className={mobileItemClass} onClick={closeMobile}>
										Pesquisa & Inovação
									</Link>
									<Link to="/journal" className={mobileItemClass} onClick={closeMobile}>
										Journal
									</Link>
									<Link to="/journal/articles" className={mobileItemClass} onClick={closeMobile}>
										Artigos
									</Link>
									<Link to="/roadmap" className={mobileItemClass} onClick={closeMobile}>
										Roadmap
									</Link>
								</div>
							)}

							{/* Institucional */}
							<button
								type="button"
								className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
								onClick={() => setMobileGroup((prev) => (prev === "institucional" ? null : "institucional"))}
								aria-expanded={mobileGroup === "institucional"}
							>
								Institucional
								<NavArrowDown
									className={cn("size-3.5 transition-transform duration-200", mobileGroup === "institucional" && "rotate-180")}
									aria-hidden="true"
								/>
							</button>
							{mobileGroup === "institucional" && (
								<div className="border-l border-border ml-3 flex flex-col">
									<Link to="/about" className={mobileItemClass} onClick={closeMobile}>
										Sobre
									</Link>
									<Link to="/innovation-policy" className={mobileItemClass} onClick={closeMobile}>
										Política de Inovação
									</Link>
								</div>
							)}
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
									Soluções
								</Link>
							</li>
							<li>
								<Link to="/research" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Pesquisa & Inovação
								</Link>
							</li>
							<li>
								<Link to="/journal" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Journal
								</Link>
							</li>
							<li>
								<Link to="/about" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Sobre
								</Link>
							</li>
							<li>
								<Link to="/innovation-policy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Política de Inovação
								</Link>
							</li>
							<li>
								<Link to="/roadmap" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
									Roadmap
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
