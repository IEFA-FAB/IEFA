import { Link } from "@tanstack/react-router"
import { OpenNewWindow } from "iconoir-react"
import type { ReactNode } from "react"
import { useModuleAccess } from "@/components/layout/useModuleAccess"
import { useTheme } from "@/components/themeService"
import { AnimatedThemeToggler } from "./animated-theme-toggler"
import { LegalNoticeBanner } from "./LegalNoticeBanner"
import { UserMenu } from "./UserMenu"
import { Button } from "./ui/button"

/** Portal institucional — o ChatRADA e a suíte de aplicações continuam lá. */
const PORTAL_URL = "https://portal.iefa.com.br"

const LEGAL_LINKS = [
	{ to: "/termos-de-uso", label: "Termos de Uso" },
	{ to: "/politica-de-privacidade", label: "Política de Privacidade" },
	{ to: "/politica-de-cookies", label: "Política de Cookies" },
] as const

const FOOTER_EXTERNAL_LINKS = [
	{ label: "Portal IEFA", href: PORTAL_URL, description: "Suíte de aplicações e ChatRADA" },
	{ label: "SEFA", href: "https://www.fab.mil.br/sefa", description: "Secretaria de Ec., Fin. e Adm." },
] as const

/**
 * Casca das páginas FORA dos módulos — home, login e páginas legais.
 *
 * É a porta de entrada, não um menu do miolo: o cabeçalho não lista os módulos
 * (quem apresenta cada um é a home, e dentro de um módulo quem troca é o seletor da
 * barra lateral — `components/layout/ModuleShell`). Para quem já entrou, um único
 * "Abrir" leva ao primeiro módulo que a pessoa alcança.
 */
export function AppLayout({ children }: { children: ReactNode }) {
	const { toggle } = useTheme()

	const container = "w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

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
					<Link
						to="/"
						className="px-1 text-base sm:text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
						aria-label="Página inicial - Contrate"
					>
						Contrate
					</Link>

					<div className="flex items-center gap-2">
						<AnimatedThemeToggler toggle={toggle} className="rounded-none" />
						<OpenModuleLink />
						<UserMenu />
					</div>
				</div>
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

					<nav aria-label="Documentos legais">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Documentos</p>
						<ul className="flex flex-col gap-2">
							{LEGAL_LINKS.map((item) => (
								<li key={item.to}>
									<Link to={item.to} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
										{item.label}
									</Link>
								</li>
							))}
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

/**
 * Entrada no app para quem já tem sessão: o primeiro módulo que a pessoa alcança,
 * na ordem do registro. Some enquanto as permissões chegam — mostrar o Pregoeiro e
 * trocar para a ACI um instante depois seria apontar para o lugar errado.
 */
function OpenModuleLink() {
	const { modules, isPending, isAuthenticated } = useModuleAccess()
	const target = modules[0]
	if (!isAuthenticated || isPending || !target) return null

	return (
		<Button
			nativeButton={false}
			variant="default"
			size="sm"
			aria-label={`Abrir ${target.label}`}
			render={
				<Link to={target.home}>
					Abrir<span className="hidden sm:inline">{target.label}</span>
				</Link>
			}
		/>
	)
}
