import { Link } from "@tanstack/react-router"
import { ExternalLink, Menu } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useTheme } from "@/hooks/useTheme"
import { AnimatedThemeToggler } from "./animated-theme-toggler"
import { UserMenu } from "./UserMenu"
import { Button } from "./ui/button"

const FOOTER_EXTERNAL_LINKS = [
	{ label: "Força Aérea Brasileira", href: "https://www.fab.mil.br/", description: "Portal oficial da FAB" },
	{ label: "SEFA", href: "https://www.fab.mil.br/sefa", description: "Secretaria de Ec., Fin. e Adm." },
] as const

const NAV_LINKS = [
	{ to: "/uniformes", label: "Uniformes" },
	{ to: "/admin", label: "Administração" },
] as const

const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1180px]"

/** Marca: quepe estilizado em navy com asa dourada. */
function BrandMark() {
	return (
		<span className="grid size-7 place-items-center rounded-lg bg-primary text-gold" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true">
				<path d="M12 11 L3 8 Q8 10.5 12 10.5 Q16 10.5 21 8 Z" />
				<path d="M12 12.5 L6 15 Q9 13 12 13 Q15 13 18 15 Z" />
				<circle cx="12" cy="11.5" r="2" />
			</svg>
		</span>
	)
}

interface AppLayoutProps {
	children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
	const [mobileOpen, setMobileOpen] = useState(false)
	const { toggle } = useTheme()

	const navItemClass =
		"rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:text-foreground"

	return (
		<div className="relative isolate flex min-h-svh flex-col bg-background text-foreground supports-[height:100dvh]:min-h-dvh">
			<a
				href="#conteudo"
				className="sr-only rounded-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
			>
				Ir para o conteúdo
			</a>

			<header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60">
				<div className={`${container} flex h-15 items-center justify-between gap-3`}>
					<div className="flex items-center gap-2.5">
						<Link
							to="/"
							className="flex items-center gap-2.5 rounded-md px-1 font-extrabold tracking-tight text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							aria-label="Página inicial — RUMAER"
						>
							<BrandMark />
							<span className="text-lg">RUMAER</span>
						</Link>

						<nav className="ml-2 hidden items-center md:flex" aria-label="Navegação principal">
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
					<div id="mobile-nav" className="border-t border-border/70 bg-background md:hidden">
						<div className={`${container} flex flex-col py-3`}>
							{NAV_LINKS.map((l) => (
								<Link
									key={l.to}
									to={l.to}
									className="rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
									onClick={() => setMobileOpen(false)}
								>
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

			<footer className="border-t border-border/70 bg-card">
				<div className={`${container} grid grid-cols-1 gap-8 py-10 sm:grid-cols-3`}>
					<div className="flex flex-col gap-3">
						<span className="flex items-center gap-2 font-extrabold text-primary">
							<BrandMark />
							RUMAER
						</span>
						<p className="text-xs leading-relaxed text-muted-foreground">Regulamento de Uniformes da Aeronáutica — versão interativa.</p>
						<p className="text-xs text-muted-foreground">SEFA · Comando da Aeronáutica · Ministério da Defesa</p>
					</div>

					<nav aria-label="Links do rodapé">
						<p className="mb-3 text-label text-muted-foreground">Navegação</p>
						<ul className="flex flex-col gap-2">
							<li>
								<Link to="/" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
									Início
								</Link>
							</li>
							<li>
								<Link to="/uniformes" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
									Uniformes
								</Link>
							</li>
						</ul>
					</nav>

					<div>
						<p className="mb-3 text-label text-muted-foreground">Links externos</p>
						<ul className="flex flex-col gap-3">
							{FOOTER_EXTERNAL_LINKS.map(({ label, href, description }) => (
								<li key={label}>
									<a href={href} target="_blank" rel="noreferrer noopener" className="group flex flex-col gap-0.5" aria-label={`Abrir ${label} em nova aba`}>
										<span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
											{label}
											<ExternalLink className="h-3 w-3" aria-hidden="true" />
										</span>
										<span className="text-xs text-muted-foreground/60">{description}</span>
									</a>
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className="border-t border-border/70">
					<div className={`${container} flex h-12 items-center justify-between gap-4 text-xs text-muted-foreground`}>
						<span>
							© {new Date().getFullYear()} IEFA. <strong className="font-semibold text-primary">Desenvolvido por Ten Nanni (IEFA)</strong>.
						</span>
						<span className="hidden shrink-0 sm:inline">Login opcional — leitura pública.</span>
					</div>
				</div>
			</footer>
		</div>
	)
}
