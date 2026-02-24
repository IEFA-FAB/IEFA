import { AnimatedThemeToggler, Button, Separator, SidebarInset, SidebarTrigger } from "@iefa/ui"
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { QrCode } from "lucide-react"
import { useEffect, useState } from "react"
import {
	getModuleFromPath,
	getModulesForLevel,
	getNavItemsForLevel,
	type ModuleId,
	type NavItem,
} from "@/components/common/layout/sidebar/NavItems"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useAuth } from "@/hooks/auth/useAuth"
import { useTheme } from "@/hooks/ui/useTheme"
import { useUserLevel } from "@/services/AdminService"
import { AppSidebar } from "./sidebar/AppSidebar"
import { MainSurface } from "./sidebar/MainSurface"

interface AppShellProps {
	onOpenQr: () => void
}

const R = {
	appName: "SISUB",
	breadcrumbRoot: "Início",
}

export function AppShell({ onOpenQr }: AppShellProps) {
	const location = useLocation()
	const navigate = useNavigate()
	const { user } = useAuth()
	const userId = user?.id ?? null
	const { toggle } = useTheme()

	const { data: userLevel, isLoading: levelLoading, isError: levelError } = useUserLevel(user?.id)

	const availableModules = userLevel ? getModulesForLevel(userLevel) : []

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
		const firstUrl = mod?.items[0]?.url
		if (firstUrl) {
			navigate({ to: firstUrl as Parameters<typeof navigate>[0]["to"] })
		}
	}

	const showSidebar = (availableModules.length > 0 || levelLoading) && !levelError
	const showInitialLoading = levelLoading && !userLevel
	const showInitialError = !levelLoading && levelError

	const handleRetry = () => {
		if (typeof window !== "undefined") window.location.reload()
	}

	// Generate breadcrumbs from current path
	const navItems: NavItem[] = userLevel ? getNavItemsForLevel(userLevel) : []
	const crumbs = (() => {
		const path = location.pathname.replace(/\/+$/, "")
		if (!path || path === "/") {
			return [{ to: "/hub", label: "Hub" }]
		}
		const segments = path.split("/").filter(Boolean)
		const mapLabel = (seg: string, fullPath: string) => {
			const found = navItems.find((n) => n.to === fullPath || n.to === `/${seg}`)
			if (found) return found.label
			return seg.charAt(0).toUpperCase() + seg.slice(1)
		}
		let acc = ""
		return segments.map((seg) => {
			acc += `/${seg}`
			return { to: acc, label: mapLabel(seg, acc) }
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
				variant="floating"
				modules={availableModules}
				activeModuleId={effectiveModuleId}
				onModuleChange={handleModuleChange}
				isLoading={levelLoading}
				collapsible={showSidebar ? "icon" : "offExamples"}
			/>

			<SidebarInset className="bg-transparent h-full overflow-y-auto w-full flex flex-col">
				<header className="max-w-6xl w-full mx-auto sticky top-2 z-40 border-b border-white/5 bg-background/40 backdrop-blur-md supports-backdrop-filter:bg-background/40 shrink-0 rounded-full shadow-xl shadow-foreground">
					<div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-3 sm:px-6">
						<div className="flex items-center gap-3">
							<SidebarTrigger className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors" />
							<Separator orientation="vertical" className="mx-2 h-5 bg-border/50" />
							<Breadcrumb>
								<BreadcrumbList className="text-sm font-medium">
									<BreadcrumbItem>
										<BreadcrumbLink
											render={
												<Link to="/hub" className="hover:text-primary transition-colors">
													{R.breadcrumbRoot}
												</Link>
											}
										/>
									</BreadcrumbItem>
									{crumbs.map((c, idx) => (
										<span key={c.to} className="inline-flex items-center">
											<BreadcrumbSeparator className="text-muted-foreground/50" />
											<BreadcrumbItem>
												{idx === crumbs.length - 1 ? (
													<span className="text-foreground bg-primary/5 px-2 py-0.5 rounded-md">
														{c.label}
													</span>
												) : (
													<BreadcrumbLink
														render={
															<Link to={c.to} className="hover:text-primary transition-colors">
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
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={onOpenQr}
								className="flex items-center gap-2 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
								aria-label="Abrir QR do usuário"
								disabled={!userId}
								title={userId ? "Mostrar QR" : "Usuário não identificado"}
							>
								<QrCode className="h-4 w-4" />
								<span className="hidden font-medium sm:inline">QR</span>
							</Button>
							<AnimatedThemeToggler toggle={toggle} />
						</div>
					</div>
				</header>

				<MainSurface
					showInitialError={showInitialError}
					showInitialLoading={showInitialLoading}
					onRetry={handleRetry}
				>
					<main className="mx-auto w-full max-w-screen-2xl flex-1 px-3 py-6 sm:px-6 md:py-8 focus:outline-none">
						<Outlet />
					</main>
				</MainSurface>
			</SidebarInset>
		</>
	)
}
