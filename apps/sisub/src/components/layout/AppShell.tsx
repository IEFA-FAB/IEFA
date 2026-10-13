import { Link, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router"
import { ChevronLeft, Search } from "lucide-react"
import { Fragment, useCallback, useEffect, useState } from "react"
import { usePBAC } from "@/auth/pbac"
import { FlowReturn } from "@/components/features/flows/FlowReturn"
import { MilitaryRecordNotice } from "@/components/features/military-record/MilitaryRecordNotice"
import { AnimatedThemeToggler } from "@/components/layout/AnimatedThemeToggler"
import { getModuleFromPath, getModulesForPermissions, getNavItemsForPermissions, type ModuleId, type NavItem } from "@/components/layout/sidebar/NavItems"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { useTheme } from "@/hooks/ui/useTheme"
import { applyEntityLabel, buildCrumbs, linkCrumbs, type NavCrumb } from "@/lib/breadcrumbs"
import { presentedPath } from "@/lib/nav-paths"
import {
	applyScopeToModules,
	buildDocumentTitle,
	buildSidebarScope,
	findParentCrumb,
	APP_SHELL_LABELS as R,
	resolveActiveEntityLabel,
	resolveEffectiveModuleId,
	resolveScopeContext,
} from "./app-shell"
import { CommandPalette, openCommandPalette } from "./CommandPalette"
import { CrumbLabelContext } from "./crumb-label"
import { OpenDraftsMenu } from "./OpenDraftsMenu"
import { AppSidebar } from "./sidebar/AppSidebar"
import { MainSurface } from "./sidebar/MainSurface"

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
	const { isMobile, setOpenMobile } = useSidebar()

	const { permissions, isLoading: levelLoading } = usePBAC()
	const levelError = false

	// Escopo do layout route do módulo ativo, só se o id dele estiver na URL descrita.
	const scopeContext = resolveScopeContext(matches, pathname)

	const availableModules = getModulesForPermissions(permissions)

	// Auto-detect active module from current path
	const pathModuleId = getModuleFromPath(pathname)
	const [selectedModuleId, setSelectedModuleId] = useState<ModuleId | null>(pathModuleId)

	// Sync selected module when path changes to a different module
	const effectiveModuleId = resolveEffectiveModuleId(pathModuleId, selectedModuleId, availableModules)

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
		// A troca de módulo sai de um menu (não é link), então a gaveta do celular não fecha sozinha
		if (isMobile) setOpenMobile(false)
		if (targetUrl) {
			navigate({ to: targetUrl as Parameters<typeof navigate>[0]["to"] })
		}
	}

	// Aplica URLs dinâmicas na sidebar quando dentro de um escopo
	const scopedModules = applyScopeToModules(availableModules, effectiveModuleId, scopeContext)

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
	const activeEntityLabel = resolveActiveEntityLabel(entityLabel, pathname)
	const crumbs: NavCrumb[] = applyEntityLabel(linkCrumbs(buildCrumbs(pathname, navItems, scopeContext), pathname, availableModules), activeEntityLabel)

	// Título da aba: fonte única (ver `buildDocumentTitle`).
	const documentTitle = buildDocumentTitle(crumbs, activeEntityLabel, scopeContext)
	useEffect(() => {
		document.title = documentTitle
	})

	// Mobile: "voltar" leva ao crumb navegável mais próximo acima da página atual
	const parentCrumb = findParentCrumb(crumbs)
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
				scope={buildSidebarScope(scopeContext, effectiveModule)}
				collapsible={showSidebar ? "icon" : "offExamples"}
			/>
			<CommandPalette scopeType={effectiveModule?.scopeType ?? null} scope={scopeContext ?? null} />

			<SidebarInset className="bg-transparent h-full overflow-hidden w-full flex flex-col">
				<header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
					<div className="flex min-w-0 flex-1 items-center gap-3">
						{/* No hub de escopo a sidebar do desktop já está à vista; no celular a gaveta é o
						    único caminho para trocar de módulo ou sair, então o gatilho fica */}
						{(!isOnScopeHub || isMobile) && (
							<>
								<SidebarTrigger className="size-9 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" />
								<Separator orientation="vertical" className="mx-2 h-6 data-[orientation=vertical]:self-center" />
							</>
						)}
						{isMobile ? (
							// Mobile: ← pai navegável  /  página atual
							<MobileCrumbs parentCrumb={parentCrumb} currentCrumb={currentCrumb} />
						) : (
							// Desktop: trilha completa
							<DesktopBreadcrumb crumbs={crumbs} />
						)}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{/* No celular a sidebar vira gaveta: a busca precisa de um ponto de entrada à vista */}
						{isMobile && (
							<Button variant="subtle" size="icon" onClick={openCommandPalette} aria-label="Buscar página">
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
								<FlowReturn />
								<MilitaryRecordNotice />
								<Outlet />
							</div>
						</main>
					</MainSurface>
				</div>
			</SidebarInset>
		</CrumbLabelContext>
	)
}

/** Mobile: ← pai navegável  /  página atual */
function MobileCrumbs({ parentCrumb, currentCrumb }: { parentCrumb: NavCrumb | undefined; currentCrumb: NavCrumb | undefined }) {
	return (
		<div className="flex items-center gap-1 text-subheading min-w-0">
			<Link
				to={(parentCrumb?.to ?? "/hub") as Parameters<typeof Link>[0]["to"]}
				className="flex min-w-0 max-w-[50%] items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
			>
				<ChevronLeft className="size-4 shrink-0" />
				<span className="truncate">{parentCrumb?.label ?? R.breadcrumbRoot}</span>
			</Link>
			{currentCrumb && (
				<>
					<span className="text-muted-foreground px-1">/</span>
					<span className="text-subheading truncate">{currentCrumb.label}</span>
				</>
			)}
		</div>
	)
}

/** Desktop: trilha completa */
function DesktopBreadcrumb({ crumbs }: { crumbs: NavCrumb[] }) {
	return (
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
	)
}
