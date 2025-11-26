import { AnimatedThemeToggler, Button, Separator } from "@iefa/ui";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTheme } from "@/hooks/useTheme";

export const Route = createFileRoute("/_public")({
	component: RouteComponent,
});

function RouteComponent() {
	const { toggle } = useTheme();
	const container =
		"w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]";

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
			{/* Header público simples */}
			<header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
				<div
					className={`${container} h-14 flex items-center justify-between gap-3`}
				>
					<div className="flex items-center gap-3">
						<Link
							to="/"
							end
							className="text-base sm:text-lg font-bold tracking-tight rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
							aria-label="Página inicial - SISUB"
						>
							SISUB
						</Link>
						<Separator orientation="vertical" className="h-6 hidden sm:block" />
						<nav
							className="hidden md:flex items-center gap-1"
							aria-label="Navegação pública"
						>
							<Link
								to="/"
								className="inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-foreground hover:bg-accent hover:text-accent-foreground"
								activeProps={{
									className:
										"inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-accent text-accent-foreground",
								}}
								activeOptions={{ exact: true }}
							>
								Início
							</Link>
							<Link
								to="/tutorial"
								className="inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-foreground hover:bg-accent hover:text-accent-foreground"
								activeProps={{
									className:
										"inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-accent text-accent-foreground",
								}}
							>
								Tutorial
							</Link>
							<Link
								to="/changelog"
								className="inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-foreground hover:bg-accent hover:text-accent-foreground"
								activeProps={{
									className:
										"inline-flex items-center rounded-md text-sm font-medium transition-colors px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-accent text-accent-foreground",
								}}
							>
								Novidades
							</Link>
						</nav>
					</div>

					<div className="flex items-center gap-2">
						<Button asChild size="sm">
							<Link to="/auth">Entrar</Link>
						</Button>
						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</div>
			</header>

			{/* Conteúdo público */}
			<main id="conteudo" className="flex-1">
				<div className={`${container} py-8 md:py-10`}>
					<Outlet />
				</div>
			</main>

			{/* Rodapé */}
			<footer className="border-t">
				<div
					className={`${container} h-14 flex items-center justify-center text-xs text-muted-foreground`}
				>
					© {new Date().getFullYear()} SISUB • Desenvolvido por Ten. Nanni
					(IEFA) e Temn. Bruno (GAP-MN).
				</div>
			</footer>
		</div>
	);
}
