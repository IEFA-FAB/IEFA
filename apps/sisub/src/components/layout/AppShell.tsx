import { Link, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router"
import { ChevronLeft, Search } from "lucide-react"
import { Fragment, useCallback, useEffect, useState } from "react"
import { usePBAC } from "@/auth/pbac"
import { AnimatedThemeToggler } from "@/components/layout/AnimatedThemeToggler"
import { getModuleFromPath, getModulesForPermissions, getNavItemsForPermissions, type ModuleId, type NavItem } from "@/components/layout/sidebar/NavItems"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { useTheme } from "@/hooks/ui/useTheme"
import { applyEntityLabel, buildCrumbs, linkCrumbs, type NavCrumb } from "@/lib/breadcrumbs"
import { isScopeInPath, normalizePath, presentedPath, scopeUrl } from "@/lib/nav-paths"
import type { ScopeContext } from "@/types/domain/scope"
import { CommandPalette, openCommandPalette } from "./CommandPalette"
import { CrumbLabelContext } from "./crumb-label"
import { OpenDraftsMenu } from "./OpenDraftsMenu"
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

	// Caminho da página MONTADA, não da URL pedida — ver `presentedPath`. Misturar os dois
	// montava a sidebar do módulo novo com o id de escopo do antigo durante a navegação.
	const pathname = presentedPath(location.pathname, matches[matches.length - 1]?.pathname)

	// Reutiliza o isMobile já computado pelo SidebarProvider (768px breakpoint),
	// consistente com o modo sheet/drawer do sidebar em mobile.
	const { isMobile } = useSidebar()

	const { permissions, isLoading: levelLoading } = usePBAC()
	const levelError = false

	// Lê o ScopeContext injetado pelo layout route do módulo ativo (ex: $messHallId/route.tsx),
	// e só o aceita se o id dele estiver na URL descrita — escopo de outra página não vaza.
	const matchedScope = matches.map((m) => (m.context as Record<string, unknown>)?.scopeContext as ScopeContext | undefined).find(Boolean)
	const scopeContext = matchedScope && isScopeInPath(pathname, matchedScope.id) ? matchedScope : undefined

	const availableModules = getModulesForPermissions(permissions)

	// Auto-detect active module from current path
	const pathModuleId = getModuleFromPath(pathname)
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
		return { ...mod, items: mod.items.map((item) => ({ ...item, url: scopeUrl(item.url, mod.id, scopeContext.id) })) }
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

	// Nome do registro aberto, informado pela página de detalhe via `useCrumbLabel`
	const [entityLabel, setEntityLabel] = useState<{ path: string; label: string } | null>(null)
	const setCrumbLabel = useCallback((path: string, label: string | null) => {
		setEntityLabel((prev) => (label ? { path, label } : prev?.path === path ? null : prev))
	}, [])

	// Trilha derivada da URL; `linkCrumbs` troca os destinos que não são página (layout sem
	// index, `print`, a própria página) e usa os nomes de módulo da sidebar.
	const navItems: NavItem[] = getNavItemsForPermissions(permissions)
	const activeEntityLabel = entityLabel && entityLabel.path === normalizePath(pathname) ? entityLabel.label : null
	const crumbs: NavCrumb[] = applyEntityLabel(linkCrumbs(buildCrumbs(pathname, navItems, scopeContext), pathname, availableModules), activeEntityLabel)

	// Título da aba: fonte única — as rotas do AppShell não declaram `title` no head, senão
	// as duas fontes disputam a aba. Formato: "Página · Registro · Escopo — SISUB". O registro
	// entra quando não é a própria página (Imprimir, Versões): o título vira o nome do PDF salvo.
	const currentLabel = crumbs[crumbs.length - 1]?.label || R.breadcrumbRoot
	const titleParts = [currentLabel]
	if (activeEntityLabel && activeEntityLabel !== currentLabel) titleParts.push(activeEntityLabel)
	if (scopeContext && currentLabel !== scopeContext.name) titleParts.push(scopeContext.name)
	const documentTitle = `${titleParts.join(" · ")} — ${R.appName}`
	useEffect(() => {
		document.title = documentTitle
	})

	// Mobile: "voltar" leva ao crumb navegável mais próximo acima da página atual
	const parentCrumb = crumbs
		.slice(0, -1)
		.reverse()
		.find((c) => c.to !== null)
	const currentCrumb = crumbs[crumbs.length - 1]

	return (
		<CrumbLabelContext value={setCrumbLabel}>
			<AppSidebar
				variant="sidebar"
				modules={scopedModules}
				activeModuleId={effectiveModuleId}
				onModuleChange={handleModuleChange}
				isLoading={levelLoading}
				scopeLocked={isOnScopeHub}
				scope={
					scopeContext && effectiveModule?.hubUrl
						? { name: scopeContext.name, hubUrl: effectiveModule.hubUrl, noun: effectiveModule.scopeNoun ?? "escopo" }
						: null
				}
				collapsible={showSidebar ? "icon" : "offExamples"}
			/>
			<CommandPalette scopeType={effectiveModule?.scopeType ?? null} scope={scopeContext ?? null} />

			<SidebarInset className="bg-transparent h-full overflow-hidden w-full flex flex-col">
				<header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
					<div className="flex items-center gap-3">
						{!isOnScopeHub && (
							<>
								<SidebarTrigger className="size-9 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" />
								<Separator orientation="vertical" className="mx-2 h-6 bg-border data-[orientation=vertical]:self-center" />
							</>
						)}
						{isMobile ? (
							// Mobile: ← pai navegável  /  página atual
							<div className="flex items-center gap-1 text-subheading min-w-0">
								<Link
									to={(parentCrumb?.to ?? "/hub") as Parameters<typeof Link>[0]["to"]}
									className="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
								>
									<ChevronLeft className="size-4" />
									<span>{parentCrumb?.label ?? R.breadcrumbRoot}</span>
								</Link>
								{currentCrumb && (
									<>
										<span className="text-muted-foreground px-1">/</span>
										<span className="text-subheading truncate">{currentCrumb.label}</span>
									</>
								)}
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
										<Fragment key={c.key}>
											<BreadcrumbSeparator className="text-muted-foreground/50 px-2" />
											<BreadcrumbItem>
												{c.to !== null ? (
													<BreadcrumbLink
														render={
															<Link to={c.to} className="cursor-pointer hover:text-primary transition-colors text-center items-center max-w-64 truncate">
																{c.label}
															</Link>
														}
													/>
												) : idx === crumbs.length - 1 ? (
													<BreadcrumbPage className="text-subheading text-center max-w-64 truncate">{c.label}</BreadcrumbPage>
												) : (
													<span className="text-muted-foreground text-center max-w-64 truncate">{c.label}</span>
												)}
											</BreadcrumbItem>
										</Fragment>
									))}
								</BreadcrumbList>
							</Breadcrumb>
						)}
					</div>
					<div className="flex items-center gap-2">
						{/* No celular a sidebar vira gaveta: a busca precisa de um ponto de entrada à vista */}
						{isMobile && (
							<Button variant="ghost" size="icon" onClick={openCommandPalette} aria-label="Buscar página" className="text-muted-foreground">
								<Search className="size-4" />
							</Button>
						)}
						<OpenDraftsMenu />
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
		</CrumbLabelContext>
	)
}
