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
import { buildCrumbs } from "@/lib/breadcrumbs"
import type { ScopeContext } from "@/types/domain/scope"
import { AppSidebar } from "./sidebar/AppSidebar"
import { MainSurface } from "./sidebar/MainSurface"

const R = {
	appName: "SISUB",
	breadcrumbRoot: "Início",
}

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
		if (mod.id !== effectiveModuleId) return mod
		// Módulo com escopo mas sem escopo selecionado → oculta itens para evitar
		// navegação para rotas inválidas (URLs base sem $scopeId não existem no router)
		if (mod.hubUrl && !scopeContext) return { ...mod, items: [] }
		if (!scopeContext) return mod
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

	// Módulo com hubUrl mas sem escopo selecionado → tela de seleção de escopo
	const effectiveModule = availableModules.find((m) => m.id === effectiveModuleId)
	const isOnScopeHub = !!effectiveModule?.hubUrl && !scopeContext

	const showSidebar = (availableModules.length > 0 || levelLoading) && !levelError
	const showInitialLoading = levelLoading && availableModules.length === 0
	const showInitialError = !levelLoading && levelError

	const handleRetry = () => {
		if (typeof window !== "undefined") window.location.reload()
	}

	// Generate breadcrumbs from current path
	const navItems: NavItem[] = getNavItemsForPermissions(permissions)
	const crumbs = buildCrumbs(location.pathname, navItems, scopeContext)

	// Update document title based on breadcrumbs
	const currentLabel = crumbs[crumbs.length - 1]?.label || "Início"
	useEffect(() => {
		document.title = `${R.appName} — ${currentLabel}`
	}, [currentLabel])

	return (
		<>
			<AppSidebar
				variant="sidebar"
				modules={scopedModules}
				activeModuleId={effectiveModuleId}
				onModuleChange={handleModuleChange}
				isLoading={levelLoading}
				scopeLocked={isOnScopeHub}
				collapsible={showSidebar ? "icon" : "offExamples"}
			/>

			<SidebarInset className="bg-transparent h-full overflow-hidden w-full flex flex-col">
				<header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
					<div className="flex items-center gap-3">
						{!isOnScopeHub && <SidebarTrigger className="size-9 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" />}
						<Separator orientation="vertical" className="mx-2 h-6 bg-border data-[orientation=vertical]:self-center" />
						{isMobile ? (
							// Mobile: ← pai  /  página atual
							<div className="flex items-center gap-1 text-subheading min-w-0">
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
												<ChevronLeft className="size-4" />
												<span>{backLabel}</span>
											</Link>
											{currentCrumb && (
												<>
													<span className="text-muted-foreground px-1">/</span>
													<span className="text-subheading truncate">{currentCrumb.label}</span>
												</>
											)}
										</>
									)
								})()}
							</div>
						) : (
							// Desktop: trilha completa
							<Breadcrumb>
								<BreadcrumbList className="text-subheading">
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
													<span className="text-subheading text-center">{c.label}</span>
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
