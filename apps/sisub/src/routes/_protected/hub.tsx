import { createFileRoute, Link } from "@tanstack/react-router"
import { usePBAC } from "@/auth/pbac"
import { getModulesForPermissions, type ModuleDef } from "@/components/common/layout/sidebar/NavItems"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/auth/useAuth"

export const Route = createFileRoute("/_protected/hub")({
	component: HubPage,
})

function ModuleCard({ module }: { module: ModuleDef }) {
	const firstUrl = module.hubUrl ?? module.items[0]?.url ?? "/"
	const Icon = module.icon

	return (
		<Card className="relative transition-colors hover:ring-primary/50">
			<CardContent className="flex grow flex-col gap-4">
				<div className="flex h-12 w-12 items-center justify-center bg-primary/10 text-primary transition-colors group-hover/card:bg-primary/20">
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

				<Button variant="outline" className="mt-auto w-full" nativeButton={false} render={<Link to={firstUrl as Parameters<typeof Link>[0]["to"]} />}>
					Acessar
				</Button>
			</CardContent>
		</Card>
	)
}

function HubPage() {
	const { user } = useAuth()
	const { permissions, isLoading } = usePBAC()

	const modules = getModulesForPermissions(permissions)

	const userName =
		(user?.user_metadata?.full_name as string | undefined) ?? (user?.user_metadata?.name as string | undefined) ?? user?.email?.split("@")[0] ?? "Usuário"

	return (
		<div className="flex flex-col items-center px-4 py-12 h-full overflow-y-auto">
			<div className="w-full max-w-4xl space-y-10">
				<div className="space-y-2 text-center">
					<h1 className="text-3xl font-bold tracking-tight text-foreground">Olá, {userName}</h1>
					<p className="text-muted-foreground">Escolha um módulo para começar</p>
				</div>

				{isLoading ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-52" />
						))}
					</div>
				) : modules.length === 0 ? (
					<p className="text-center text-sm text-muted-foreground">Nenhum módulo disponível para o seu perfil.</p>
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
