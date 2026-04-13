import { Link, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import { useEffect, useState } from "react"
import { usePBAC } from "@/auth/pbac"
import { AnimatedThemeToggler } from "@/components/layout/AnimatedThemeToggler"
import { getModuleFromPath, getModulesForPermissions, getNavItemsForPermissions, type ModuleId, type NavItem } from "@/components/layout/sidebar/NavItems"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { useTheme } from "@/hooks/ui/useTheme"
import type { ScopeContext } from "@/types/domain/scope"
import { AppSidebar } from "./sidebar/AppSidebar"
import { MainSurface } from "./sidebar/MainSurface"

const R = {
	appName: "SISUB",
	breadcrumbRoot: "Início",
}

// ── Breadcrumb i18n ────────────────────────────────────────────────────────────

/** Tradução estática de segmentos de URL para português */
const SEGMENT_PT: Record<string, string> = {
	// Módulos (raiz)
	diner: "Comensal",
	messhall: "Fiscal",
	unit: "Gestão Unidade",
	kitchen: "Gestão Cozinha",
	"kitchen-production": "Produção Cozinha",
	"local-analytics": "Análises Locais",
	global: "SDAB",
	analytics: "Análises",
	// Páginas
	hub: "Hub",
	menu: "Cardápio",
	forecast: "Previsão",
	"qr-code": "QR Code",
	"self-check-in": "Auto Check-in",
	profile: "Perfil",
	presence: "Presenças",
	planning: "Planejamento",
	procurement: "Suprimentos",
	suprimentos: "Suprimentos",
	recipes: "Preparações",
	"weekly-menus": "Cardápios Semanais",
	"weekly-plans": "Planos Semanais",
	ingredients: "Insumos",
	permissions: "Permissões",
	evaluation: "Avaliação",
	changelog: "Registro de Alterações",
	tutorial: "Tutorial",
	dashboard: "Painel",
	indicators: "Indicadores",
	events: "Eventos",
	"compras-sync": "Sincronização Compras",
	"places-manager": "Gerenciador de Locais",
	policy: "Política",
	// Sub-páginas
	new: "Novo",
	fork: "Derivar",
	versions: "Versões",
	settings: "Configurações",
}

/** Quando um segmento é um ID, o rótulo é inferido do segmento anterior */
const ID_LABEL_BY_PARENT: Record<string, string> = {
	recipes: "Preparação",
	"weekly-menus": "Cardápio Semanal",
	"weekly-plans": "Plano Semanal",
	events: "Evento",
	suprimentos: "Rascunho",
	procurement: "ATA",
	ingredients: "Insumo",
}

/** Rótulo contextual para o segmento "new" conforme o segmento pai */
const NEW_LABEL_BY_PARENT: Record<string, string> = {
	recipes: "Nova Preparação",
	"weekly-menus": "Novo Cardápio",
	"weekly-plans": "Novo Plano",
	events: "Novo Evento",
	suprimentos: "Novo Rascunho",
	procurement: "Nova ATA",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC_RE = /^\d+$/
const isId = (seg: string) => UUID_RE.test(seg) || NUMERIC_RE.test(seg)

export function AppShell() {
	const location = useLocation()
	const navigate = useNavigate()
	const { toggle } = useTheme()
	const matches = useMatches()

	// Reutiliza o isMobile já computado pelo SidebarProvider (768px breakpoint),
	// consistente com o modo sheet/drawer do sidebar em mobile.
	const { isMobile } = useSidebar()

	const { permissions, isLoading: levelLoading } = usePBAC()
	const levelError = false

	// Lê o ScopeContext injetado pelo layout route do módulo ativo (ex: $messHallId/route.tsx)
	const scopeContext = matches.map((m) => (m.context as Record<string, unknown>)?.scopeContext as ScopeContext | undefined).find(Boolean)

	const availableModules = getModulesForPermissions(permissions)

	// Auto-detect active module from current path
	const pathModuleId = getModuleFromPath(location.pathname)
	const [selectedModuleId, setSelectedModuleId] = useState<ModuleId | null>(pathModuleId)

	// Sync selected module when path changes to a different module
	const effectiveModuleId = pathModuleId ?? selectedModuleId ?? availableModules[0]?.id ?? null

	// Keep selectedModuleId in sync with path during render (avoid stale state)
	const [prevPathModuleId, setPrevPathModuleId] = useState(pathModuleId)
	if (prevPathModuleId !== pathModuleId && pathModuleId !== null) {
		setPrevPathModuleId(pathModuleId)
		setSelectedModuleId(pathModuleId)
	}

	const handleModuleChange = (moduleId: ModuleId) => {
		setSelectedModuleId(moduleId)
		const mod = availableModules.find((m) => m.id === moduleId)
		// Módulos com escopo navegam para o hub; demais para o primeiro item
		const targetUrl = mod?.hubUrl ?? mod?.items[0]?.url
		if (targetUrl) {
			navigate({ to: targetUrl as Parameters<typeof navigate>[0]["to"] })
		}
	}

	// Aplica URLs dinâmicas na sidebar quando dentro de um escopo
	// Ex: /messhall/presence → /messhall/3/presence
	const scopedModules = availableModules.map((mod) => {
		if (!scopeContext || mod.id !== effectiveModuleId) return mod
		const prefix = `/${mod.id}/`
		const newPrefix = `/${mod.id}/${scopeContext.id}/`
		return {
			...mod,
			items: mod.items.map((item) => ({
				...item,
				url: item.url.startsWith(prefix) ? newPrefix + item.url.slice(prefix.length) : item.url,
			})),
		}
	})

	const showSidebar = (availableModules.length > 0 || levelLoading) && !levelError
	const showInitialLoading = levelLoading && availableModules.length === 0
	const showInitialError = !levelLoading && levelError

	const handleRetry = () => {
		if (typeof window !== "undefined") window.location.reload()
	}

	// Generate breadcrumbs from current path
	const navItems: NavItem[] = getNavItemsForPermissions(permissions)
	const crumbs = (() => {
		const path = location.pathname.replace(/\/+$/, "")
		if (!path || path === "/") {
			return [{ to: "/hub", label: "Hub" }]
		}
		const segments = path.split("/").filter(Boolean)
		const mapLabel = (seg: string, fullPath: string, prevSeg?: string) => {
			// 1. Correspondência exata no navItems
			const found = navItems.find((n) => n.to === fullPath)
			if (found) return found.label
			// 2. Segmento numérico que corresponde ao escopo → usa o nome do escopo (ex: "GAP-AF")
			if (isId(seg) && scopeContext && Number(seg) === scopeContext.id) {
				return scopeContext.name
			}
			// 3. Segmento dinâmico (UUID / numérico) → rótulo contextual pelo segmento pai
			if (isId(seg)) return ID_LABEL_BY_PARENT[prevSeg ?? ""] ?? "Detalhe"
			// 4. "new" com rótulo contextual
			if (seg === "new") return NEW_LABEL_BY_PARENT[prevSeg ?? ""] ?? "Novo"
			// 5. Mapa estático de tradução
			return SEGMENT_PT[seg] ?? seg
		}
		let acc = ""
		return segments.map((seg, i) => {
			acc += `/${seg}`
			const prevSeg = i > 0 ? segments[i - 1] : undefined
			return { to: acc, label: mapLabel(seg, acc, prevSeg) }
		})
	})()

	// Update document title based on breadcrumbs
	useEffect(() => {
		const last = crumbs[crumbs.length - 1]?.label || "Início"
		document.title = `${R.appName} — ${last}`
	}, [crumbs])

	return (
		<>
			<AppSidebar
				variant="sidebar"
				modules={scopedModules}
				activeModuleId={effectiveModuleId}
				onModuleChange={handleModuleChange}
				isLoading={levelLoading}
				collapsible={showSidebar ? "icon" : "offExamples"}
			/>

			<SidebarInset className="bg-transparent h-full overflow-hidden w-full flex flex-col">
				<header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
					<div className="flex items-center gap-3">
						<SidebarTrigger className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" />
						<Separator orientation="vertical" className="mx-2 h-6 bg-border data-[orientation=vertical]:self-center" />
						{isMobile ? (
							// Mobile: ← pai  /  página atual
							<div className="flex items-center gap-1 text-sm font-medium min-w-0">
								{(() => {
									const parentCrumb = crumbs.length >= 2 ? crumbs[crumbs.length - 2] : null
									const currentCrumb = crumbs.length >= 1 ? crumbs[crumbs.length - 1] : null
									const backTo = parentCrumb?.to ?? "/hub"
									const backLabel = parentCrumb?.label ?? R.breadcrumbRoot
									return (
										<>
											<Link
												to={backTo as Parameters<typeof Link>[0]["to"]}
												className="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
											>
												<ChevronLeft className="h-4 w-4" />
												<span>{backLabel}</span>
											</Link>
											{currentCrumb && (
												<>
													<span className="text-muted-foreground/40 px-1">/</span>
													<span className="text-foreground font-semibold truncate">{currentCrumb.label}</span>
												</>
											)}
										</>
									)
								})()}
							</div>
						) : (
							// Desktop: trilha completa
							<Breadcrumb>
								<BreadcrumbList className="text-sm font-medium">
									<BreadcrumbItem>
										<BreadcrumbLink
											render={
												<Link to="/hub" className="cursor-pointer hover:text-primary transition-colors text-center">
													{R.breadcrumbRoot}
												</Link>
											}
										/>
									</BreadcrumbItem>
									{crumbs.map((c, idx) => (
										<span key={c.to} className="inline-flex items-center">
											<BreadcrumbSeparator className="text-muted-foreground/50 px-2" />
											<BreadcrumbItem>
												{idx === crumbs.length - 1 ? (
													<span className="text-foreground font-semibold text-center">{c.label}</span>
												) : (
													<BreadcrumbLink
														render={
															<Link to={c.to} className="cursor-pointer hover:text-primary transition-colors text-center items-center">
																{c.label}
															</Link>
														}
													/>
												)}
											</BreadcrumbItem>
										</span>
									))}
								</BreadcrumbList>
							</Breadcrumb>
						)}
					</div>
					<div className="flex items-center gap-2">
						<AnimatedThemeToggler toggle={toggle} />
					</div>
				</header>

				{/* flex-1 min-h-0 constrains children so h-full resolves correctly in nested pages */}
				<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
					<MainSurface showInitialError={showInitialError} showInitialLoading={showInitialLoading} onRetry={handleRetry}>
						<main className="h-full overflow-y-auto focus:outline-none">
							<div className="mx-auto w-full max-w-screen-2xl min-h-full px-3 py-6 sm:px-6 md:py-8">
								<Outlet />
							</div>
						</main>
					</MainSurface>
				</div>
			</SidebarInset>
		</>
	)
}
