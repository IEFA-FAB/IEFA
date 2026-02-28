import { Separator } from "@iefa/ui"
import { createFileRoute } from "@tanstack/react-router"
import { AppCard } from "@/components/AppCard"
import { DynamicIcon } from "@/components/dynamicIcon"
import { useAppsData } from "@/hooks/useAppsData"
import type { AppItem } from "@/types/domain"

export const Route = createFileRoute("/_public/facilities/")({
	component: Home,
	head: () => ({
		meta: [
			{ title: "Facilidades IEFA" },
			{ name: "description", content: "Suite de Soluções do IEFA" },
		],
	}),
})

function Home() {
	// usa TanStack Query
	const { data, isLoading, error } = useAppsData()

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
