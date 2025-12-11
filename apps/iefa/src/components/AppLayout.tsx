import { AnimatedThemeToggler, Button, Separator } from "@iefa/ui";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Menu } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { UserMenu } from "./UserMenu";

interface AppLayoutProps {
	children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
	const [mobileOpen, setMobileOpen] = useState(false);
	const { toggle } = useTheme();

	// Container: full em mobile/tablet; "wide" contido em desktop
	const container =
		"w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]";

	const navLinkClass =
		"inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&.active]:bg-accent [&.active]:text-accent-foreground text-foreground hover:bg-accent hover:text-accent-foreground";

	return (
		<div
			className="
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
      "
		>
			{/* Skip link para acessibilidade */}
			<a
				href="#conteudo"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100
                     rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow"
			>
				Ir para o conteúdo
			</a>

			{/* Cabeçalho (sticky sem transform) */}
			<header className="sticky top-0 z-50 border-b backdrop-blur supports-backdrop-filter:bg-background/60">
				<div
					className={`${container} h-14 flex items-center justify-between gap-3`}
				>
					{/* Esquerda: Marca + Navegação desktop */}
					<div className="flex items-center gap-3">
						<Link
							to="/"
							className="text-base sm:text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md px-1"
							aria-label="Página inicial - Portal IEFA"
						>
							Portal IEFA
						</Link>

						<Separator orientation="vertical" className="h-6 hidden sm:block" />

						<nav
							className="hidden md:flex items-center gap-1"
							aria-label="Navegação principal"
						>
							<Link to="/facilities" className={navLinkClass}>
								Facilidades
							</Link>
							<a
								href="https://app.previsaosisub.com.br/"
								target="_blank"
								rel="noreferrer noopener"
								className={[
									"inline-flex items-center rounded-md text-sm font-medium transition-colors",
									"px-3 py-2 text-foreground hover:bg-accent hover:text-accent-foreground",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
								].join(" ")}
								aria-label="Abrir SISUB em nova aba"
							>
								SISUB
								<ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
							</a>
						</nav>
					</div>

					{/* Direita: Ações */}
					<div className="flex items-center gap-2">
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
						<div className={`${container} py-3 flex flex-col gap-2`}>
							<Link
								to="/facilities/pregoeiro"
								className="w-full px-3 py-2 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
								onClick={() => setMobileOpen(false)}
							>
								Facilidades
							</Link>

							<a
								href="https://app.previsaosisub.com.br/"
								target="_blank"
								rel="noreferrer noopener"
								className="w-full px-3 py-2 rounded-md text-sm inline-flex items-center justify-between transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
								onClick={() => setMobileOpen(false)}
								aria-label="Abrir SISUB em nova aba"
							>
								SISUB
								<ExternalLink className="h-4 w-4" aria-hidden="true" />
							</a>
						</div>
					</div>
				)}
			</header>

			{/* Conteúdo */}
			<main
				id="conteudo"
				className="flex-1 flex items-center align-middle content-center"
			>
				<div className={`${container} py-8 md:py-10`}>{children}</div>
			</main>

			{/* Rodapé */}
			<footer className="border-t">
				<div
					className={`${container} h-14 flex items-center justify-center text-xs text-muted-foreground`}
				>
					© {new Date().getFullYear()} IEFA.{" "}
					<b>Desenvolvido por Ten Nanni (IEFA)</b>. Alguns serviços são externos
					e podem exigir login próprio.
				</div>
			</footer>
		</div>
	);
}
