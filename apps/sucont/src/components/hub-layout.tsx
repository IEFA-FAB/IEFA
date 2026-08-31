import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useRouter, useRouterState } from "@tanstack/react-router"
import { Activity, FileText, LayoutGrid, LogOut, Menu, MessageSquare, Monitor, Search, ShieldCheck, X, Zap } from "lucide-react"
import type React from "react"
import { useEffect, useId, useRef, useState } from "react"
import { authActions, authQueryOptions } from "#/auth/service"
import { LegalNotice } from "#/components/LegalNotice"
import { SidebarRailItem } from "#/components/sidebar-rail-item"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { externalSystems, iaTools, reportTools } from "#/lib/data"
import { ALL_CATEGORIES, useHubFilters } from "#/lib/hub-filters"

const NAV_CATEGORIES = [
	{ id: ALL_CATEGORIES, icon: LayoutGrid },
	{ id: "Auditoria", icon: ShieldCheck },
	{ id: "Monitoramento", icon: Activity },
	{ id: "IA / Chatbot", icon: MessageSquare },
	{ id: "Automação", icon: Zap },
	{ id: "Documentação", icon: FileText },
]

const NAV_TABS = [
	{ to: "/", label: "DASHBOARD" },
	{ to: "/workspace", label: "ÁREA DE TRABALHO" },
	{ to: "/reports", label: "RELATÓRIOS" },
] as const

interface HubLayoutProps {
	children: React.ReactNode
	/** A tela consome `?q=`. Sem isso a barra de busca some — campo que não filtra nada mente sobre o que faz. */
	searchable?: boolean
}

export function HubLayout({ children, searchable = false }: HubLayoutProps) {
	const { category, setCategory } = useHubFilters()
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	// O menu mobile guarda a rota em que foi aberto: navegar muda o pathname e o
	// painel — que é overlay e cobriria a tela nova — se fecha sozinho.
	const [menuPath, setMenuPath] = useState<string | null>(null)
	const menuOpen = menuPath === pathname

	return (
		<div className="min-h-screen bg-tech-bg selection:bg-tech-cyan/10 selection:text-tech-cyan flex">
			{/* ── Left Sidebar (desktop) ───────────────────────── */}
			<aside className="w-64 hidden lg:flex flex-col p-6 fixed top-0 left-0 h-screen bg-card border-r border-border z-20">
				<HubBrand />

				<CategoryNav activeCategory={category} onSelect={setCategory} />

				<div className="mt-auto flex flex-col gap-3">
					<UserBlock />
					<div className="p-4 bg-muted/50 rounded-2xl border border-border">
						<div className="flex items-center gap-2 mb-2">
							<ShieldCheck className="w-3 h-3 text-tech-blue" />
							<span className="text-label text-muted-foreground">Uso Institucional</span>
						</div>
						<p className="text-hint text-muted-foreground leading-relaxed">
							Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF).
						</p>
					</div>
				</div>
			</aside>

			{/* ── Mobile top bar + drawer ───────────────────────── */}
			<div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 py-3 bg-card border-b border-border">
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-8 h-8 bg-tech-blue rounded-lg flex items-center justify-center text-white shrink-0">
						<Monitor className="w-4 h-4" />
					</div>
					<span className="text-xs font-bold text-foreground truncate">SUCONT-4 HUB</span>
				</div>
				<Button
					type="button"
					onClick={() => setMenuPath(pathname)}
					aria-label="Abrir menu"
					aria-expanded={menuOpen}
					variant="ghost"
					size="icon"
					className="rounded-lg text-muted-foreground hover:bg-muted"
				>
					<Menu className="w-5 h-5" />
				</Button>
			</div>

			{menuOpen && <MobileMenu activeCategory={category} onSelect={setCategory} onClose={() => setMenuPath(null)} />}

			{/* ── Main Area ─────────────────────────────────────── */}
			<div className="flex-grow lg:ml-64 lg:mr-16 relative z-10 pt-14 lg:pt-0">
				{/* Header */}
				<header className="pt-8 lg:pt-12 pb-10 px-4 md:px-8 max-w-6xl mx-auto">
					<div className="relative bg-surface-inverted rounded-xl p-6 md:p-12 overflow-hidden mb-8 md:mb-12 shadow-2xl">
						{/* decorative */}
						<div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
							<svg viewBox="0 0 100 100" className="w-full h-full text-white fill-current" aria-hidden="true">
								<path d="M50 10 L90 90 L50 70 L10 90 Z" />
							</svg>
						</div>

						<div className="relative z-10">
							<div className="flex flex-wrap gap-2 mb-6">
								<span className="text-label text-white/70 bg-white/10 px-3 py-1 rounded-full border border-white/10">Força Aérea Brasileira</span>
								<span className="text-label text-white/70 bg-white/10 px-3 py-1 rounded-full border border-white/10">DIREF • SUCONT</span>
							</div>

							<h1 className="text-4xl md:text-6xl font-bold text-white tracking-tighter mb-4 leading-tight">
								SUCONT-4 <span className="text-tech-cyan">HUB</span>
							</h1>

							<p className="text-white/70 max-w-2xl text-sm leading-relaxed mb-10">
								Plataforma centralizada para ferramentas de análise contábil e suporte ao usuário. Promovendo excelência, padronização e apoio à tomada de
								decisão no Comando da Aeronáutica.
							</p>

							<div className="flex flex-wrap gap-3 md:gap-4">
								{NAV_TABS.map((tab) => (
									<Link
										key={tab.to}
										to={tab.to}
										className={`flex items-center gap-2 px-5 md:px-6 py-3 rounded-xl font-bold text-xs md:text-sm transition-all ${
											pathname === tab.to ? "bg-tech-blue text-white shadow-lg" : "bg-white/5 text-white hover:bg-white/10"
										}`}
									>
										{tab.label}
									</Link>
								))}
							</div>
						</div>
					</div>

					{searchable && <HubSearchBar />}
				</header>

				{/* Page content */}
				<main className="px-4 md:px-8 pb-24 max-w-6xl mx-auto">{children}</main>

				{/* Footer */}
				<footer className="px-4 md:px-8 pb-12 max-w-6xl mx-auto mt-4 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6">
					<div className="flex gap-8">
						<SystemStatus />
						<div className="flex flex-col">
							<span className="text-label font-mono text-muted-foreground">Versão Hub</span>
							<span className="text-xs font-mono text-muted-foreground">v4.0.0-START</span>
						</div>
					</div>
					<div className="flex flex-col items-center gap-2 md:items-end">
						<LegalFooterLinks
							className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
							linkClassName="text-label font-mono text-muted-foreground transition-colors hover:text-foreground"
						/>
						<div className="text-hint font-mono text-muted-foreground text-center md:text-right">
							© {new Date().getFullYear()} SUCONT-4 | DIREF | FAB
							<br />
							ACESSO RESTRITO
						</div>
					</div>
				</footer>
			</div>

			{/* ── Right Sidebar Rail (desktop) ──────────────────── */}
			<aside className="fixed right-0 top-0 h-screen w-16 bg-card border-l border-border z-30 hidden lg:flex flex-col items-center py-6 gap-4 overflow-y-auto">
				<div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-muted-foreground mb-4 shrink-0">
					<LayoutGrid className="w-4 h-4" />
				</div>

				<div className="flex flex-col gap-3 shrink-0">
					{externalSystems.map((tool, i) => (
						<SidebarRailItem key={tool.id} tool={tool} index={i} side="right" />
					))}
				</div>

				<div className="w-8 h-[1px] bg-border my-1 shrink-0" />

				<div className="flex flex-col gap-3 shrink-0">
					{iaTools.map((tool, i) => (
						<SidebarRailItem key={tool.id} tool={tool} index={i} side="right" />
					))}
				</div>

				<div className="w-8 h-[1px] bg-border my-1 shrink-0" />

				<div className="flex flex-col gap-3 shrink-0">
					{reportTools.map((tool, i) => (
						<SidebarRailItem key={tool.id} tool={tool} index={i} side="right" />
					))}
				</div>
			</aside>

			<LegalNotice />
		</div>
	)
}

function HubBrand() {
	return (
		<div className="flex items-center gap-3 mb-10">
			<div className="w-10 h-10 bg-tech-blue rounded-xl flex items-center justify-center text-white shadow-lg">
				<Monitor className="w-6 h-6" />
			</div>
			<div className="flex flex-col">
				<h2 className="text-sm font-bold text-foreground leading-tight">Centro de Monitoramento</h2>
				<span className="text-label text-muted-foreground">DIREF • COMAER</span>
			</div>
		</div>
	)
}

function CategoryNav({ activeCategory, onSelect }: { activeCategory: string; onSelect: (category: string) => void }) {
	return (
		<nav className="flex flex-col gap-2" aria-label="Categorias de ferramentas">
			{NAV_CATEGORIES.map((cat) => {
				const Icon = cat.icon
				const isActive = activeCategory === cat.id
				return (
					<Button
						key={cat.id}
						type="button"
						onClick={() => onSelect(cat.id)}
						aria-current={isActive ? "page" : undefined}
						variant="ghost"
						className={`h-auto w-full justify-start gap-3 rounded-xl px-4 py-3 ${
							isActive ? "bg-tech-blue text-white hover:bg-tech-blue shadow-md" : "text-muted-foreground hover:bg-muted/50"
						}`}
					>
						<Icon className="w-4 h-4" />
						<span className="text-xs font-bold">{cat.id}</span>
					</Button>
				)
			})}
		</nav>
	)
}

function MobileMenu({ activeCategory, onSelect, onClose }: { activeCategory: string; onSelect: (category: string) => void; onClose: () => void }) {
	const panelRef = useRef<HTMLDivElement>(null)

	// Esc fecha; o foco vai para o painel para que o leitor de tela anuncie o menu.
	useEffect(() => {
		panelRef.current?.focus()
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [onClose])

	return (
		<div className="lg:hidden fixed inset-0 z-50 flex">
			<button
				type="button"
				aria-label="Fechar menu"
				onClick={onClose}
				className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px] focus-visible:ring-[3px] focus-visible:ring-ring/50"
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label="Menu do hub"
				tabIndex={-1}
				className="relative w-72 max-w-[85vw] h-full bg-card p-6 flex flex-col overflow-y-auto shadow-xl outline-none"
			>
				<div className="flex items-start justify-between gap-2">
					<HubBrand />
					<Button
						type="button"
						onClick={onClose}
						aria-label="Fechar menu"
						variant="ghost"
						size="icon-sm"
						className="rounded-lg text-muted-foreground hover:bg-muted"
					>
						<X className="w-4 h-4" />
					</Button>
				</div>

				<CategoryNav
					activeCategory={activeCategory}
					onSelect={(category) => {
						onSelect(category)
						onClose()
					}}
				/>

				<div className="mt-auto pt-6">
					<UserBlock />
				</div>
			</div>
		</div>
	)
}

function HubSearchBar() {
	const { query, setQuery } = useHubFilters()
	const inputId = useId()
	// Estado local para o campo responder instantaneamente; a URL recebe o valor
	// com atraso curto para não gravar uma navegação por tecla digitada.
	const [draft, setDraft] = useState(query)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		setDraft(query)
	}, [query])

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current)
		},
		[]
	)

	function onChange(value: string) {
		setDraft(value)
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => setQuery(value), 200)
	}

	function clear() {
		if (timer.current) clearTimeout(timer.current)
		setDraft("")
		setQuery("")
	}

	return (
		<div className="flex items-center gap-3 bg-card p-3 rounded-2xl border border-border shadow-sm">
			<Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" aria-hidden="true" />
			<label htmlFor={inputId} className="sr-only">
				Buscar no hub
			</label>
			<Input
				id={inputId}
				type="search"
				placeholder="Buscar por módulo, assunto, Q35, SIAFI, Restos a Pagar..."
				className="h-auto w-full border-none bg-transparent p-0 text-sm text-muted-foreground shadow-none outline-none focus-visible:border-none focus-visible:ring-0 dark:bg-transparent"
				value={draft}
				onChange={(e) => onChange(e.target.value)}
			/>
			{draft !== "" && (
				<Button
					type="button"
					onClick={clear}
					aria-label="Limpar busca"
					variant="ghost"
					size="icon-xs"
					className="w-7 h-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<X className="w-3.5 h-3.5" />
				</Button>
			)}
		</div>
	)
}

/**
 * Status real do SSR, sondando a mesma rota `/health` que o ALB usa. Antes era um
 * texto fixo "OPERACIONAL", que por definição nunca informava nada.
 */
function SystemStatus() {
	const { data, isPending, isError } = useQuery({
		queryKey: ["sucont", "health"],
		queryFn: async () => {
			const res = await fetch("/health", { headers: { accept: "text/html" } })
			if (!res.ok) throw new Error(`health ${res.status}`)
			return true
		},
		// URL relativa não resolve no SSR: a sonda é só do browser.
		enabled: typeof window !== "undefined",
		refetchInterval: 60_000,
		retry: 1,
	})

	const state = isPending ? "checking" : isError || !data ? "down" : "up"
	const label = state === "checking" ? "VERIFICANDO" : state === "up" ? "OPERACIONAL" : "INSTÁVEL"
	const tone = state === "checking" ? "text-muted-foreground" : state === "up" ? "text-success" : "text-destructive"
	const dot = state === "checking" ? "bg-muted" : state === "up" ? "bg-success" : "bg-destructive"

	return (
		<div className="flex flex-col">
			<span className="text-label font-mono text-muted-foreground">Status do Sistema</span>
			<span className={`text-xs font-mono flex items-center gap-2 ${tone}`} aria-live="polite">
				<span className={`w-1.5 h-1.5 rounded-full ${dot} ${state === "checking" ? "animate-pulse" : ""}`} />
				{label}
			</span>
		</div>
	)
}

function UserBlock() {
	const router = useRouter()
	const queryClient = useQueryClient()
	const { data: auth } = useQuery(authQueryOptions())
	const email = auth?.user?.email ?? ""

	async function logout() {
		await authActions.signOut()
		queryClient.clear()
		await router.navigate({ to: "/auth" })
	}

	return (
		<div className="flex items-center justify-between gap-2 p-3 bg-card rounded-2xl border border-border">
			<div className="flex flex-col min-w-0">
				<span className="text-label text-muted-foreground">Sessão</span>
				<span className="text-hint text-muted-foreground truncate" title={email}>
					{email || "—"}
				</span>
			</div>
			<Button
				type="button"
				onClick={logout}
				aria-label="Sair da conta"
				variant="ghost"
				size="icon-sm"
				className="shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
			>
				<LogOut className="w-4 h-4" />
			</Button>
		</div>
	)
}
