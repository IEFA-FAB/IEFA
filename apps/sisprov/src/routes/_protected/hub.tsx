import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowUpRight, Mail, ShieldAlert, TriangleAlert } from "lucide-react"
import { useEffect } from "react"
import { z } from "zod"
import { useSisprovAccess } from "@/auth/pbac"
import { AnimatedThemeToggler } from "@/components/AnimatedThemeToggler"
import { UserMenu } from "@/components/UserMenu"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/useAuth"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/cn"
import { accessibleModules, NAV_MODULES, type NavModule } from "@/lib/modules"
import { toNameCase } from "@/lib/utils"

const SHELL_WIDTH = "mx-auto w-full px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px]"

export const Route = createFileRoute("/_protected/hub")({
	validateSearch: z.object({
		// Módulo cujo acesso foi negado, preenchido por `requireModules` ao redirecionar.
		denied: z.string().optional(),
	}),
	head: () => ({ meta: [{ title: "Início — SISPROV" }] }),
	component: HubPage,
})

const ICON_CLASSES: Record<NavModule["color"], string> = {
	primary: "bg-primary/10 text-primary",
	warning: "bg-warning/10 text-warning",
	governance: "bg-governance/10 text-governance",
}

const ACCENT_CLASSES: Record<NavModule["color"], string> = {
	primary: "text-primary",
	warning: "text-warning",
	governance: "text-governance",
}

const CARD_HOVER_CLASSES: Record<NavModule["color"], string> = {
	primary: "hover:ring-primary/40",
	warning: "hover:ring-warning/40",
	governance: "hover:ring-governance/40",
}

function HubHeader() {
	const { toggle } = useTheme()
	return (
		<header className="shrink-0 border-b border-border/60 bg-background">
			<div className={cn(SHELL_WIDTH, "flex h-14 items-center justify-between gap-4")}>
				<div className="flex items-center gap-4">
					<Link
						to="/hub"
						className="font-mono text-base font-bold rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
						aria-label="Página inicial - SISPROV"
					>
						SISPROV
					</Link>
					<Separator orientation="vertical" className="h-5" />
					<span className="text-body text-muted-foreground">Início</span>
				</div>
				<div className="flex items-center gap-3">
					<UserMenu />
					<AnimatedThemeToggler toggle={toggle} />
				</div>
			</div>
		</header>
	)
}

function ModuleCard({ module }: { module: NavModule }) {
	const Icon = module.icon
	return (
		<div className={cn("relative rounded-xl transition-shadow hover:ring-2", CARD_HOVER_CLASSES[module.color])}>
			<Card className="overflow-visible">
				{/* O card inteiro é o link; a seta já diz "entrar". Sem preload: cada card dispararia o beforeLoad do módulo a cada hover. */}
				<Link
					to={module.basePath}
					preload={false}
					className="absolute inset-0 z-10 rounded-xl focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label={`Entrar no módulo ${module.label}`}
				/>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-start gap-3">
						<div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", ICON_CLASSES[module.color])}>
							<Icon className="size-4" />
						</div>
						<div className="min-w-0 flex-1 pt-0.5">
							<span className="text-heading text-foreground">{module.label}</span>
							<p className="text-caption text-muted-foreground">{module.caption}</p>
						</div>
						<ArrowUpRight className={cn("mt-0.5 size-4 shrink-0", ACCENT_CLASSES[module.color])} />
					</div>
					<p className="text-caption text-muted-foreground">{module.description}</p>
				</CardContent>
			</Card>
		</div>
	)
}

/** Sessão sem nenhum módulo do SISPROV: diz o que falta e a quem pedir, em vez de uma grade vazia. */
function NoAccess() {
	return (
		<Alert>
			<ShieldAlert className="size-4" />
			<AlertTitle>Seu acesso ao SISPROV ainda não foi concedido</AlertTitle>
			<AlertDescription>
				<div className="space-y-2">
					<p>
						Você está autenticado, mas sua conta não tem nenhum dos papéis do sistema: Planejamento (elo SISPROV na OM), Almoxarifado da OM ou Administração
						(SDAB). Quem concede o acesso é o administrador do SISPROV na SDAB, informando a sua OM.
					</p>
					<p className="flex items-center gap-1.5">
						<Mail className="size-3.5" />
						Dúvidas e pedidos de acesso: <span className="text-subheading text-foreground">iefa@fab.mil.br</span>
					</p>
				</div>
			</AlertDescription>
		</Alert>
	)
}

function HubPage() {
	const { user } = useAuth()
	const { permissions, isLoading, isError } = useSisprovAccess()
	const { denied } = Route.useSearch()
	const navigate = useNavigate()

	useEffect(() => {
		if (!denied) return
		const names = denied
			.split("+")
			.map((id) => NAV_MODULES.find((m) => m.id === id)?.label ?? id)
			.join(" ou ")
		toast.error("Acesso negado", { id: "access-denied", description: `Sua conta não tem o papel ${names}.` })
		navigate({ to: "/hub", replace: true, search: {} })
	}, [denied, navigate])

	const modules = accessibleModules(permissions)
	const meta = (user?.user_metadata ?? {}) as { name?: string; full_name?: string }
	const greetName = toNameCase(meta.full_name ?? meta.name ?? user?.email?.split("@")[0] ?? "Usuário")

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<HubHeader />
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
					<div className="space-y-1">
						<h1 className="text-display text-foreground">
							<span className="text-muted-foreground">Bem-vindo,</span> {greetName}
						</h1>
						<p className="text-caption text-muted-foreground">
							Escolha um módulo. O SISPROV está em fundação: os módulos abrem com o que já existe e dizem o que vem a seguir.
						</p>
					</div>

					{isLoading ? (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{Array.from({ length: 3 }).map((_, i) => (
								<Skeleton key={i} className="h-36" />
							))}
						</div>
					) : isError ? (
						<Alert variant="destructive">
							<TriangleAlert className="size-4" />
							<AlertTitle>Não foi possível ler suas permissões</AlertTitle>
							<AlertDescription>
								<div className="flex flex-col gap-2">
									<span>A consulta falhou. Isso não significa que você está sem acesso.</span>
									<Button size="sm" variant="outline" className="self-start" onClick={() => window.location.reload()}>
										Tentar de novo
									</Button>
								</div>
							</AlertDescription>
						</Alert>
					) : modules.length === 0 ? (
						<NoAccess />
					) : (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{modules.map((module) => (
								<ModuleCard key={module.id} module={module} />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
