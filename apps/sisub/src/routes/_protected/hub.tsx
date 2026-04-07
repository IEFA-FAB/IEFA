import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { usePBAC } from "@/auth/pbac"
import { AnimatedThemeToggler } from "@/components/layout/AnimatedThemeToggler"
import { getModulesForPermissions, type ModuleDef, type ModuleId } from "@/components/layout/sidebar/NavItems"
import { UserProfileRow } from "@/components/layout/sidebar/NavUser"
import { Card, CardContent } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMilitaryData, useUserData } from "@/hooks/auth/useProfile"
import { useTheme } from "@/hooks/ui/useTheme"
import { cn } from "@/lib/cn"
import { toNameCase } from "@/lib/utils"

export const Route = createFileRoute("/_protected/hub")({
	component: HubPage,
})

// ── Module groups ────────────────────────────────────────────────────────────

type GroupColor = "success" | "primary" | "warning" | "governance"

const MODULE_GROUPS: { label: string; ids: ModuleId[]; color: GroupColor }[] = [
	{ label: "Usuário", ids: ["diner"], color: "success" },
	{ label: "Operacional", ids: ["messhall", "kitchen-production"], color: "primary" },
	{ label: "Gestão", ids: ["kitchen", "unit"], color: "warning" },
	{ label: "Governança", ids: ["global", "analytics"], color: "governance" },
]

const ICON_CLASSES: Record<GroupColor, string> = {
	success: "bg-success/10 text-success",
	primary: "bg-primary/10 text-primary",
	warning: "bg-warning/10 text-warning",
	governance: "bg-governance/10 text-governance",
}

const ACCENT_CLASSES: Record<GroupColor, string> = {
	success: "text-success",
	primary: "text-primary",
	warning: "text-warning",
	governance: "text-governance",
}

const CARD_HOVER_CLASSES: Record<GroupColor, string> = {
	success: "hover:ring-success/40",
	primary: "hover:ring-primary/40",
	warning: "hover:ring-warning/40",
	governance: "hover:ring-governance/40",
}

// ── Hub header ───────────────────────────────────────────────────────────────

function HubHeader() {
	const { toggle } = useTheme()

	return (
		<header className="shrink-0 border-b border-border/60 bg-background">
			<Container className="h-14 flex items-center justify-between gap-4">
				<div className="flex items-center gap-4">
					<Link
						to="/"
						className="font-mono font-bold text-base tracking-widest uppercase focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
						aria-label="Página inicial - SISUB"
					>
						SISUB
					</Link>
					<Separator orientation="vertical" className="h-5" />
					<span className="text-sm text-muted-foreground">Hub</span>
				</div>
				<div className="flex items-center gap-3">
					<UserProfileRow />
					<AnimatedThemeToggler toggle={toggle} />
				</div>
			</Container>
		</header>
	)
}

// ── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({ module, color }: { module: ModuleDef; color: GroupColor }) {
	const firstUrl = module.hubUrl ?? module.items[0]?.url ?? "/"
	const Icon = module.icon

	return (
		<Tooltip>
			<Card className={cn("relative overflow-visible cursor-pointer transition-colors hover:ring-2", CARD_HOVER_CLASSES[color])}>
				<TooltipTrigger
					render={
						<Link
							to={firstUrl as Parameters<typeof Link>[0]["to"]}
							className="absolute inset-0 z-10 rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2"
							aria-label={`Entrar no módulo ${module.name}`}
						/>
					}
				/>

				<CardContent className="flex flex-col gap-4">
					{/* Header: icon + name + arrow */}
					<div className="flex items-start gap-3">
						<div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0 mt-0.5", ICON_CLASSES[color])}>
							<Icon className="h-4 w-4" />
						</div>
						<span className="flex-1 font-semibold text-foreground text-sm leading-snug pt-1">{module.name}</span>
						<ArrowUpRight
							className={cn(
								"h-4 w-4 shrink-0 mt-0.5 transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5",
								ACCENT_CLASSES[color]
							)}
						/>
					</div>

					{/* Pages: two-column grid */}
					{module.items.length > 0 && (
						<div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
							{module.items.map((item) => (
								<div key={item.url} className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
									<item.icon className="h-3 w-3 shrink-0" />
									<span className="truncate">{item.title}</span>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
			<TooltipContent side="bottom">Entrar no módulo {module.name}</TooltipContent>
		</Tooltip>
	)
}

// ── Hub page ─────────────────────────────────────────────────────────────────

type UserMeta = { name?: string; full_name?: string; avatar_url?: string; picture?: string }

function HubPage() {
	const { user } = useAuth()
	const { permissions, isLoading } = usePBAC()
	const { data: userData } = useUserData(user?.id)
	const { data: military } = useMilitaryData(userData?.nrOrdem ?? null)

	const modules = getModulesForPermissions(permissions)

	const meta = (user?.user_metadata ?? {}) as UserMeta
	const greetName = toNameCase(military?.nmGuerra ?? meta.full_name ?? meta.name ?? user?.email?.split("@")[0] ?? "Usuário")

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<HubHeader />

			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-4xl px-4 py-10 space-y-10">
					<div className="space-y-1">
						<h1 className="text-2xl font-bold tracking-tight text-foreground">Bem-vindo, {greetName}</h1>
						<p className="text-sm text-muted-foreground">Escolha um módulo</p>
					</div>

					{isLoading ? (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{Array.from({ length: 3 }).map((_, i) => (
								<Skeleton key={i} className="h-36" />
							))}
						</div>
					) : modules.length === 0 ? (
						<p className="text-center text-sm text-muted-foreground">Nenhum módulo disponível para o seu perfil.</p>
					) : (
						<div className="space-y-8">
							{MODULE_GROUPS.map((group) => {
								const groupModules = modules.filter((m) => group.ids.includes(m.id))
								if (groupModules.length === 0) return null
								return (
									<section key={group.label}>
										<h2 className={cn("text-xs font-semibold tracking-wide mb-3", ACCENT_CLASSES[group.color])}>{group.label}</h2>
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
											{groupModules.map((mod) => (
												<ModuleCard key={mod.id} module={mod} color={group.color} />
											))}
										</div>
									</section>
								)
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
