import { Button, Separator } from "@iefa/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { AppCard } from "@/components/AppCard"
import { DynamicIcon } from "@/components/dynamicIcon"
import { useAppsData } from "@/hooks/useAppsData"
import type { AppItem } from "@/types/domain"

export const Route = createFileRoute("/_public/")({
	component: Home,
	head: () => ({
		meta: [{ title: "IEFA" }, { name: "description", content: "Suite de Soluções do IEFA" }],
	}),
})

function Home() {
	// usa TanStack Query
	const { data, isLoading, error } = useAppsData(6)

	// mapeia DbApp -> AppItem com React nodes (DynamicIcon)
	const apps: AppItem[] = (data ?? []).map((a) => ({
		title: a.title,
		description: a.description,
		to: a.to_path ?? undefined,
		href: a.href ?? undefined,
		icon: <DynamicIcon name={a.icon_key ?? undefined} className="h-5 w-5" />,
		badges: a.badges ?? [],
		external: !!a.external,
		contributors: (a.contributors ?? []).map((c) => ({
			label: c.label,
			url: c.url ?? undefined,
			icon: c.icon_key ? <DynamicIcon name={c.icon_key} className="h-4 w-4" /> : undefined,
		})),
	}))

	return (
		<div className="relative flex flex-col items-center justify-center w-full text-foreground">
			{/* Hero */}
			<header className="relative w-full">
				<div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-8 md:pt-12">
					<div
						className="relative w-full overflow-hidden rounded-3xl border border-border
                       bg-linear-to-b from-background/60 via-background/40 to-background/20
                       backdrop-blur supports-backdrop-filter:backdrop-blur-md"
					>
						<div className="relative mx-auto flex min-h-[40vh] sm:min-h-[50vh] flex-col items-center justify-center text-center p-6 md:p-10">
							<h1 className="text-balance text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
								Portal IEFA
							</h1>
							<p className="mt-4 max-w-3xl text-pretty text-base sm:text-lg text-muted-foreground">
								Suite de aplicações do Instituto de Economia, Finanças e Administração.
							</p>
							<div className="mt-6 flex flex-wrap gap-3 align-middle justify-center items-center">
								<Button
									render={
										<Link to="/facilities" aria-label="Ver aplicações da suite">
											Ver aplicações
										</Link>
									}
									size="lg"
									variant="default"
								/>
								<Button
									render={
										<Link to="/journal" aria-label="Acessar Sistema de Gestão de Publicações">
											Gestão de Publicações
										</Link>
									}
									size="lg"
									variant="secondary"
								/>
							</div>
						</div>
					</div>
				</div>
			</header>

			{/* Seção Apps */}
			<section id="apps" className="mt-10 md:mt-12 w-full" aria-labelledby="apps-heading">
				<div className="flex items-center justify-between px-1 md:px-0">
					<h2
						id="apps-heading"
						className="text-2xl md:text-3xl font-bold tracking-tight text-balance"
					>
						Aplicações da suite
					</h2>
				</div>
				<p className="text-muted-foreground mt-2 px-1 md:px-0 text-pretty">
					Acesse rapidamente os módulos internos e serviços externos integrados.
				</p>

				<Separator className="my-6" />

				{isLoading ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
						<div className="h-40 animate-pulse rounded-xl bg-muted" />
						<div className="h-40 animate-pulse rounded-xl bg-muted" />
					</div>
				) : error ? (
					<div className="text-sm text-destructive">
						Erro ao carregar apps: {error instanceof Error ? error.message : "Erro desconhecido"}
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
						{apps.map((app) => (
							<AppCard key={app.title} app={app} />
						))}
					</div>
				)}
			</section>
		</div>
	)
}
