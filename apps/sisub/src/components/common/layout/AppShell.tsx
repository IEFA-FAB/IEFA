import { AnimatedThemeToggler, Button, Separator, SidebarInset, SidebarTrigger } from "@iefa/ui"
import { Link, Outlet, useLocation } from "@tanstack/react-router"
import { QrCode } from "lucide-react"
import { useEffect } from "react"
import {
	buildSidebarData,
	getNavItemsForLevel,
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
	const { user } = useAuth()
	const userId = user?.id ?? null
	const { toggle } = useTheme()

	const { data: userLevel, isLoading: levelLoading, isError: levelError } = useUserLevel(user?.id)

	let userDisplay = { name: "Usuário", email: "", avatar: "" }
	if (user) {
		const name =
			(user.user_metadata?.full_name as string | undefined) ??
			(user.user_metadata?.name as string | undefined) ??
			user.email ??
			"Usuário"
		const avatar = (user.user_metadata?.avatar_url as string | undefined) ?? ""
		userDisplay = { name, email: user.email ?? "", avatar }
	}

	let sidebarData = null
	if (userLevel && user) {
		sidebarData = buildSidebarData({
			level: userLevel,
			activePath: location.pathname,
			user: userDisplay,
		})
	}

	const navItems: NavItem[] = userLevel ? getNavItemsForLevel(userLevel) : []

	// Show sidebar if we have data OR if we are loading the level (to show skeleton)
	// But don't show if there was an error fetching the level
	const showSidebar = (!!sidebarData || levelLoading) && !levelError

	const showInitialLoading = levelLoading && !userLevel
	const showInitialError = !levelLoading && levelError

	const handleRetry = () => {
		if (typeof window !== "undefined") window.location.reload()
	}

	// Generate breadcrumbs from current path
	const crumbs = (() => {
		const path = location.pathname.replace(/\/+$/, "")
		if (!path || path === "/") {
			return [{ to: "/forecast", label: "Previsão" }]
		}
		const segments = path.split("/").filter(Boolean)
		const mapLabel = (seg: string) => {
			const found = navItems.find((n) => n.to.replace(/^\//, "") === seg)
			if (found) return found.label
			return seg.charAt(0).toUpperCase() + seg.slice(1)
		}
		let acc = ""
		return segments.map((seg) => {
			acc += `/${seg}`
			return { to: acc, label: mapLabel(seg) }
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
				data={sidebarData ?? undefined}
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
												<Link to="/forecast" className="hover:text-primary transition-colors">
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
