import { createFileRoute, Link } from "@tanstack/react-router"
import { usePBAC } from "@/auth/pbac"
import {
	getModulesForPermissions,
	type ModuleDef,
} from "@/components/common/layout/sidebar/NavItems"
import { useAuth } from "@/hooks/auth/useAuth"

export const Route = createFileRoute("/_protected/hub")({
	component: HubPage,
})

function ModuleCard({ module }: { module: ModuleDef }) {
	const firstUrl = module.hubUrl ?? module.items[0]?.url ?? "/"
	const Icon = module.icon

	return (
		<div className="group relative flex flex-col gap-4 rounded-2xl border border-border/50 bg-background/60 backdrop-blur-sm p-6 transition-all duration-200 hover:border-primary/30 hover:bg-background/80 hover:shadow-lg hover:shadow-primary/5">
			<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
				<Icon className="h-6 w-6" />
			</div>

			<div className="flex flex-col gap-1">
				<h3 className="font-semibold text-foreground">{module.name}</h3>
				<ul className="mt-1 space-y-0.5">
					{module.items.map((item) => (
						<li key={item.url} className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<item.icon className="h-3 w-3 shrink-0" />
							<span>{item.title}</span>
						</li>
					))}
				</ul>
			</div>

			<Link
				to={firstUrl as Parameters<typeof Link>[0]["to"]}
				className="mt-auto flex h-9 w-full items-center justify-center rounded-md border border-border/50 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
			>
				Acessar
			</Link>
		</div>
	)
}

function HubPage() {
	const { user } = useAuth()
	const { permissions, isLoading } = usePBAC()

	const modules = getModulesForPermissions(permissions)

	const userName =
		(user?.user_metadata?.full_name as string | undefined) ??
		(user?.user_metadata?.name as string | undefined) ??
		user?.email?.split("@")[0] ??
		"Usuário"

	return (
		<div className="flex h-full flex-col items-center justify-center px-4 py-12">
			<div className="w-full max-w-4xl space-y-10">
				<div className="space-y-2 text-center">
					<h1 className="text-3xl font-bold tracking-tight text-foreground">Olá, {userName}</h1>
					<p className="text-muted-foreground">Escolha um módulo para começar</p>
				</div>

				{isLoading ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div
								key={i}
								className="h-52 rounded-2xl border border-border/50 bg-background/40 animate-pulse"
							/>
						))}
					</div>
				) : modules.length === 0 ? (
					<p className="text-center text-sm text-muted-foreground">
						Nenhum módulo disponível para o seu perfil.
					</p>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{modules.map((mod) => (
							<ModuleCard key={mod.id} module={mod} />
						))}
					</div>
				)}
			</div>
		</div>
	)
}
