import { Link, useRouterState } from "@tanstack/react-router"
import { Activity, FileText, LayoutGrid, MessageSquare, Monitor, Search, ShieldCheck, Zap } from "lucide-react"
import type React from "react"
import { SidebarRailItem } from "#/components/sidebar-rail-item"
import { externalSystems, iaTools, reportTools } from "#/lib/data"
import { setActiveCategory, setSearchQuery, useActiveCategory, useSearchQuery } from "#/lib/hub-store"

const NAV_CATEGORIES = [
	{ id: "Visão Geral", icon: LayoutGrid },
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

export function HubLayout({ children }: { children: React.ReactNode }) {
	const searchQuery = useSearchQuery()
	const activeCategory = useActiveCategory()
	const pathname = useRouterState({ select: (s) => s.location.pathname })

	return (
		<div className="min-h-screen bg-tech-bg selection:bg-tech-cyan/10 selection:text-tech-cyan flex">
			{/* ── Left Sidebar ─────────────────────────────────── */}
			<aside className="w-64 hidden lg:flex flex-col p-6 fixed top-0 left-0 h-screen bg-white border-r border-slate-100 z-20">
				<div className="flex items-center gap-3 mb-10">
					<div className="w-10 h-10 bg-tech-blue rounded-xl flex items-center justify-center text-white shadow-lg">
						<Monitor className="w-6 h-6" />
					</div>
					<div className="flex flex-col">
						<h2 className="text-sm font-bold text-slate-800 leading-tight">Centro de Monitoramento</h2>
						<span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">DIREF • COMAER</span>
					</div>
				</div>

				<nav className="flex flex-col gap-2">
					{NAV_CATEGORIES.map((cat) => {
						const Icon = cat.icon
						const isActive = activeCategory === cat.id
						return (
							<button
								key={cat.id}
								type="button"
								onClick={() => {
									setActiveCategory(cat.id)
									// Navigate to dashboard when switching category
									if (pathname !== "/") {
										window.location.href = "/"
									}
								}}
								className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
									isActive ? "bg-tech-blue text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
								}`}
							>
								<Icon className="w-4 h-4" />
								<span className="text-xs font-bold">{cat.id}</span>
							</button>
						)
					})}
				</nav>

				<div className="mt-auto p-4 bg-slate-50 rounded-2xl border border-slate-100">
					<div className="flex items-center gap-2 mb-2">
						<ShieldCheck className="w-3 h-3 text-tech-blue" />
						<span className="text-[10px] font-bold text-slate-600 uppercase">Uso Institucional</span>
					</div>
					<p className="text-[9px] text-slate-400 leading-relaxed">Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF).</p>
				</div>
			</aside>

			{/* ── Main Area ─────────────────────────────────────── */}
			<div className="flex-grow lg:ml-64 lg:mr-16 relative z-10">
				{/* Header */}
				<header className="pt-12 pb-10 px-8 max-w-6xl mx-auto">
					<div className="relative bg-slate-900 rounded-[2rem] p-12 overflow-hidden mb-12 shadow-2xl">
						{/* decorative */}
						<div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
							<svg viewBox="0 0 100 100" className="w-full h-full text-white fill-current" aria-hidden="true">
								<path d="M50 10 L90 90 L50 70 L10 90 Z" />
							</svg>
						</div>

						<div className="relative z-10">
							<div className="flex gap-2 mb-6">
								<span className="text-[10px] font-bold text-white/60 bg-white/10 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
									Força Aérea Brasileira
								</span>
								<span className="text-[10px] font-bold text-white/60 bg-white/10 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
									DIREF • SUCONT
								</span>
							</div>

							<h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-4 leading-tight">
								SUCONT-4 <span className="text-tech-cyan">HUB</span>
							</h1>

							<p className="text-white/60 max-w-2xl text-sm leading-relaxed mb-10">
								Plataforma centralizada para ferramentas de análise contábil e suporte ao usuário. Promovendo excelência, padronização e apoio à tomada de
								decisão no Comando da Aeronáutica.
							</p>

							<div className="flex flex-wrap gap-4">
								{NAV_TABS.map((tab) => (
									<Link
										key={tab.to}
										to={tab.to}
										className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
											pathname === tab.to ? "bg-tech-blue text-white shadow-lg" : "bg-white/5 text-white hover:bg-white/10"
										}`}
									>
										{tab.label}
									</Link>
								))}
							</div>
						</div>
					</div>

					{/* Search bar */}
					<div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
						<Search className="w-4 h-4 text-slate-400 ml-2" />
						<input
							type="text"
							placeholder="Buscar por módulo, assunto, Q35, SIAFI, Restos a Pagar..."
							className="bg-transparent border-none outline-none text-sm text-slate-600 w-full"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</header>

				{/* Page content */}
				<main className="px-8 pb-24 max-w-6xl mx-auto">{children}</main>

				{/* Footer */}
				<footer className="px-8 pb-12 max-w-6xl mx-auto mt-4 pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6">
					<div className="flex gap-8">
						<div className="flex flex-col">
							<span className="text-[10px] font-mono uppercase text-slate-400">Status do Sistema</span>
							<span className="text-xs font-mono text-emerald-600 flex items-center gap-2">
								<span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
								OPERACIONAL
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-[10px] font-mono uppercase text-slate-400">Versão Hub</span>
							<span className="text-xs font-mono text-slate-500">v4.0.0-START</span>
						</div>
					</div>
					<div className="text-[10px] font-mono text-slate-400 text-center md:text-right">
						© {new Date().getFullYear()} SUCONT-4 | DIREF | FAB
						<br />
						ACESSO RESTRITO
					</div>
				</footer>
			</div>

			{/* ── Right Sidebar Rail ────────────────────────────── */}
			<aside className="fixed right-0 top-0 h-screen w-16 bg-white border-l border-slate-200 z-30 flex flex-col items-center py-6 gap-4 overflow-y-auto">
				<div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 mb-4 shrink-0">
					<LayoutGrid className="w-4 h-4" />
				</div>

				<div className="flex flex-col gap-3 shrink-0">
					{externalSystems.map((tool, i) => (
						<SidebarRailItem key={tool.id} tool={tool} index={i} side="right" />
					))}
				</div>

				<div className="w-8 h-[1px] bg-slate-100 my-1 shrink-0" />

				<div className="flex flex-col gap-3 shrink-0">
					{iaTools.map((tool, i) => (
						<SidebarRailItem key={tool.id} tool={tool} index={i} side="right" />
					))}
				</div>

				<div className="w-8 h-[1px] bg-slate-100 my-1 shrink-0" />

				<div className="flex flex-col gap-3 shrink-0">
					{reportTools.map((tool, i) => (
						<SidebarRailItem key={tool.id} tool={tool} index={i} side="right" />
					))}
				</div>
			</aside>
		</div>
	)
}
