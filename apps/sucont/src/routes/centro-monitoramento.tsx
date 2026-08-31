import { createFileRoute, Link } from "@tanstack/react-router"
import {
	ArrowLeft,
	ArrowRight,
	BarChart3,
	BookOpen,
	CheckCircle2,
	ExternalLink,
	FileSpreadsheet,
	Globe,
	Landmark,
	LayoutDashboard,
	Menu,
	Plane,
	Search,
	ShieldCheck,
	Star,
	TrendingUp,
	Users,
	X,
} from "lucide-react"
import { useMemo, useState } from "react"
import type { SectionId } from "#/lib/centro-monitoramento-data"
import { modulesData, routingKeywords } from "#/lib/centro-monitoramento-data"
import { cn } from "#/lib/utils"

export const Route = createFileRoute("/centro-monitoramento")({
	component: RouteComponent,
})

type ActiveTab = "home" | SectionId

interface ModuleItem {
	id: string
	name: string
	purpose: string
	examples: readonly string[]
	url?: string
	group: string
	highlighted?: boolean
}

function RouteComponent() {
	const [activeTab, setActiveTab] = useState<ActiveTab>("home")
	const [searchQuery, setSearchQuery] = useState("")
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

	const searchResults = useMemo(() => {
		if (!searchQuery.trim()) return null
		const query = searchQuery.toLowerCase()
		const results: (ModuleItem & { sectionId: string })[] = []

		const sections: SectionId[] = ["3.1", "3.2", "geral"]
		for (const sectionId of sections) {
			for (const item of modulesData[sectionId].items) {
				const matchName = item.name.toLowerCase().includes(query)
				const matchPurpose = item.purpose.toLowerCase().includes(query)
				const route = routingKeywords.find((r) => r.moduleId === item.id)
				const matchKeyword = route?.keywords.some((kw) => kw.toLowerCase().includes(query))

				if (matchName || matchPurpose || matchKeyword) {
					results.push({ ...(item as ModuleItem), sectionId })
				}
			}
		}
		return results
	}, [searchQuery])

	const handleTabChange = (tab: ActiveTab) => {
		setActiveTab(tab)
		setSearchQuery("")
		setIsMobileMenuOpen(false)
	}

	function ChevronRight({ className }: { className?: string }) {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
				className={className}
			>
				<title>Chevron right</title>
				<path d="m9 18 6-6-6-6" />
			</svg>
		)
	}

	function ModuleCard({ item, sectionId }: { item: ModuleItem; sectionId?: string }) {
		let badgeText = "SUCONT-3.1"
		let badgeColor = "bg-action/10 text-action border-action/30"

		if (sectionId === "3.2" || (!sectionId && modulesData["3.2"].items.some((i) => i.id === item.id))) {
			badgeText = "SUCONT-3.2"
			badgeColor = "bg-action/10 text-action border-action/30"
		} else if (sectionId === "geral" || (!sectionId && modulesData.geral.items.some((i) => i.id === item.id))) {
			badgeText = "ÂMBITO GERAL"
			badgeColor = "bg-success/10 text-success border-success/30"
		}

		return (
			<div
				className={cn(
					"bg-card rounded-xl shadow-sm border overflow-hidden flex flex-col hover:shadow-lg transition-all duration-300 group relative",
					item.highlighted ? "border-warning/30 ring-2 ring-warning/20" : "border-border hover:border-action/30"
				)}
			>
				{item.highlighted && <div className="absolute top-0 left-0 right-0 h-1 bg-warning z-20" />}
				<div className="p-5 flex-1">
					<div className="flex items-start justify-between gap-4 mb-3">
						<div className="flex flex-col gap-1">
							{item.highlighted && (
								<span className="text-[9px] font-black text-warning uppercase tracking-[0.2em] mb-1 flex items-center gap-1">
									<Star className="w-2.5 h-2.5 fill-warning" /> Destaque Operacional
								</span>
							)}
							<h3
								className={cn(
									"font-bold leading-tight transition-colors",
									item.highlighted ? "text-warning group-hover:text-warning/80" : "text-foreground group-hover:text-action"
								)}
							>
								{item.name}
							</h3>
						</div>
						<span className={cn("shrink-0 px-2.5 py-1 border text-[10px] font-bold uppercase tracking-wider rounded-md", badgeColor)}>{badgeText}</span>
					</div>
					<p className="text-sm text-muted-foreground mb-5 leading-relaxed">{item.purpose}</p>

					<div className={cn("space-y-2.5 p-3 rounded-lg border", item.highlighted ? "bg-warning/50 border-warning/30" : "bg-muted/50 border-border")}>
						<span
							className={cn(
								"text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5",
								item.highlighted ? "text-warning" : "text-muted-foreground"
							)}
						>
							<Search className="w-3 h-3" /> Exemplos de Consulta
						</span>
						<ul className="space-y-1.5">
							{item.examples.map((ex, i) => (
								<li key={i} className="text-xs text-muted-foreground flex items-start gap-2 font-medium">
									<ChevronRight className={cn("w-3 h-3 mt-0.5 shrink-0", item.highlighted ? "text-warning" : "text-action")} />
									{ex}
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className={cn("p-4 border-t", item.highlighted ? "bg-warning/30 border-warning/30" : "bg-card border-border")}>
					{item.url ? (
						<a
							href={item.url}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(
								"w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md",
								item.highlighted ? "bg-warning hover:bg-warning/80 text-white" : "bg-action hover:bg-action/80 text-white"
							)}
						>
							Acessar Ferramenta
							<ExternalLink className="w-4 h-4" />
						</a>
					) : (
						<button
							type="button"
							disabled
							className="w-full flex items-center justify-center gap-2 bg-muted text-muted-foreground px-4 py-2.5 rounded-lg text-sm font-semibold cursor-not-allowed"
						>
							Link Indisponível
						</button>
					)}
				</div>
			</div>
		)
	}

	const sectionTab = activeTab !== "home" ? (activeTab as SectionId) : null

	return (
		<div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row font-sans selection:bg-action/15 selection:text-action">
			{/* Mobile Header */}
			<div className="md:hidden bg-surface-inverted text-surface-inverted-foreground p-4 flex items-center justify-between sticky top-0 z-20 shadow-md border-b border-action/50">
				<div className="flex items-center gap-3 truncate pr-2">
					<div className="bg-action p-1.5 rounded-md shrink-0">
						<Plane className="w-5 h-5 text-white" />
					</div>
					<span className="font-bold text-sm sm:text-base tracking-tight truncate">Centro de Monitoramento Contábil da SUCONT-3</span>
				</div>
				<button type="button" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-muted-foreground hover:text-white">
					{isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
				</button>
			</div>

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed md:sticky top-0 left-0 h-screen w-72 bg-surface-inverted text-surface-inverted-muted flex flex-col transition-transform duration-300 z-30 border-r border-surface-inverted-border shadow-2xl md:shadow-none",
					isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
				)}
			>
				<div className="p-6 hidden md:flex flex-col gap-4 border-b border-surface-inverted-border relative overflow-hidden">
					<Plane className="absolute -right-4 -top-4 w-32 h-32 text-foreground/30 transform rotate-[-15deg] pointer-events-none" />

					{/* Back to Hub */}
					<Link to="/" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors relative z-10 w-fit">
						<ArrowLeft className="w-3.5 h-3.5" />
						Voltar ao Hub
					</Link>

					<div className="flex items-center gap-3 relative z-10">
						<div className="bg-action p-2.5 rounded-xl shadow-lg border border-action/20 shrink-0">
							<Landmark className="w-7 h-7 text-white" />
						</div>
						<div>
							<h1 className="font-extrabold text-white text-sm tracking-tight leading-tight">Centro de Monitoramento Contábil da SUCONT-3</h1>
							<span className="text-[10px] text-action font-bold uppercase tracking-widest mt-1 block">DIREF • COMAER</span>
						</div>
					</div>
				</div>

				<nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
					<button
						type="button"
						onClick={() => handleTabChange("home")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "home" && !searchQuery
								? "bg-action text-white shadow-md"
								: "text-surface-inverted-muted hover:bg-surface-inverted hover:text-surface-inverted-foreground"
						)}
					>
						<LayoutDashboard className={cn("w-5 h-5", activeTab === "home" && !searchQuery ? "text-action" : "")} />
						Visão Geral
					</button>

					<div className="pt-6 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Módulos Operacionais</div>

					<button
						type="button"
						onClick={() => handleTabChange("3.1")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "3.1" && !searchQuery
								? "bg-action text-white shadow-md"
								: "text-surface-inverted-muted hover:bg-surface-inverted hover:text-surface-inverted-foreground"
						)}
					>
						<BarChart3 className={cn("w-5 h-5", activeTab === "3.1" && !searchQuery ? "text-action" : "")} />
						Acompanhamento Contábil
					</button>

					<button
						type="button"
						onClick={() => handleTabChange("3.2")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "3.2" && !searchQuery
								? "bg-action text-white shadow-md"
								: "text-surface-inverted-muted hover:bg-surface-inverted hover:text-surface-inverted-foreground"
						)}
					>
						<Users className={cn("w-5 h-5", activeTab === "3.2" && !searchQuery ? "text-action" : "")} />
						Suporte ao Usuário
					</button>

					<button
						type="button"
						onClick={() => handleTabChange("geral")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "geral" && !searchQuery
								? "bg-action text-white shadow-md"
								: "text-surface-inverted-muted hover:bg-surface-inverted hover:text-surface-inverted-foreground"
						)}
					>
						<Globe className={cn("w-5 h-5", activeTab === "geral" && !searchQuery ? "text-action" : "")} />
						Sistemas e Guias
					</button>
				</nav>

				<div className="p-5 border-t border-surface-inverted-border bg-surface-inverted/50">
					<div className="bg-surface-inverted/80 border border-surface-inverted-border rounded-xl p-4 flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<ShieldCheck className="w-4 h-4 text-action" />
							<span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Uso Institucional</span>
						</div>
						<p className="text-[10px] text-muted-foreground leading-relaxed font-medium">
							Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel Int
							Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
							Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
						</p>
					</div>
				</div>
			</aside>

			{/* Mobile Overlay */}
			{isMobileMenuOpen && (
				<button
					type="button"
					aria-label="Fechar menu"
					className="fixed inset-0 bg-overlay/80 backdrop-blur-sm z-20 md:hidden w-full cursor-default"
					onClick={() => setIsMobileMenuOpen(false)}
				/>
			)}

			{/* Main Content */}
			<main className="flex-1 flex flex-col h-screen overflow-hidden bg-muted/50">
				{/* Topbar / Search */}
				<header className="bg-card border-b border-border/80 p-4 sm:px-8 flex items-center justify-between shrink-0 shadow-sm z-10">
					<div className="relative w-full max-w-2xl">
						<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
						<input
							type="text"
							placeholder="Buscar por módulo, assunto, Q35, SIAFI, Restos a Pagar..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full pl-12 pr-10 py-3 bg-muted/80 border-transparent focus:bg-card focus:border-action focus:ring-4 focus-visible:ring-ring/10 rounded-xl text-sm font-medium transition-all outline-none placeholder:text-muted-foreground text-foreground"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 p-1 rounded-full transition-colors"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
				</header>

				{/* Scrollable Content Area */}
				<div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-10">
					<div className="max-w-7xl mx-auto">
						{/* Search Results View */}
						{searchQuery.trim() ? (
							<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
								<div className="flex items-center justify-between border-b border-border pb-4">
									<h2 className="text-2xl font-extrabold text-foreground tracking-tight">Resultados da Busca</h2>
									<span className="px-3 py-1 bg-action/15 text-action rounded-full text-sm font-bold">{searchResults?.length} encontrado(s)</span>
								</div>

								{searchResults && searchResults.length > 0 ? (
									<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
										{searchResults.map((item, idx) => (
											<ModuleCard key={idx} item={item} sectionId={item.sectionId} />
										))}
									</div>
								) : (
									<div className="text-center py-24 bg-card rounded-2xl border border-border border-dashed shadow-sm">
										<div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
											<Search className="w-8 h-8 text-muted-foreground" />
										</div>
										<h3 className="text-xl font-bold text-foreground mb-2">Nenhum módulo encontrado</h3>
										<p className="text-muted-foreground max-w-md mx-auto">
											Não encontramos ferramentas correspondentes para "{searchQuery}". Tente buscar por outros termos ou siglas.
										</p>
									</div>
								)}
							</div>
						) : activeTab === "home" ? (
							/* Home View */
							<div className="space-y-8 animate-in fade-in duration-700">
								{/* Hero Section */}
								<div className="relative bg-surface-inverted rounded-3xl p-8 sm:p-12 text-surface-inverted-foreground shadow-2xl overflow-hidden border border-action/50">
									<div className="absolute top-0 right-0 w-[500px] h-[500px] bg-action/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
									<div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-action/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />
									<Plane className="absolute -right-10 top-10 w-96 h-96 text-surface-inverted-foreground/[0.03] transform rotate-[-30deg] pointer-events-none" />

									<div className="relative z-10 max-w-3xl">
										<div className="flex flex-wrap items-center gap-3 mb-6">
											<span className="px-3 py-1 bg-action/20 border border-action/30 rounded-full text-xs font-bold tracking-widest text-surface-inverted-accent uppercase backdrop-blur-sm flex items-center gap-1.5">
												<ShieldCheck className="w-3.5 h-3.5" /> Força Aérea Brasileira
											</span>
											<span className="px-3 py-1 bg-surface-inverted/50 border border-surface-inverted-border rounded-full text-xs font-bold tracking-widest text-surface-inverted-muted uppercase backdrop-blur-sm">
												DIREF • SUCONT
											</span>
										</div>

										<h2 className="text-4xl sm:text-5xl font-extrabold mb-5 tracking-tight leading-[1.1]">
											Centro de Monitoramento Contábil <br className="hidden sm:block" />
											<span className="text-surface-inverted-accent">da SUCONT-3</span>
										</h2>

										<p className="text-surface-inverted-muted text-lg sm:text-xl leading-relaxed mb-10 max-w-2xl font-medium">
											Plataforma centralizada para ferramentas de análise contábil e suporte ao usuário. Promovendo excelência, padronização e apoio à tomada de
											decisão no Comando da Aeronáutica.
										</p>

										<div className="flex flex-wrap gap-4">
											<button
												type="button"
												onClick={() => handleTabChange("3.1")}
												className="bg-action hover:bg-action/80 text-white px-7 py-3.5 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 group"
											>
												<BarChart3 className="w-5 h-5 text-action group-hover:text-white transition-colors" />
												Acompanhamento Contábil
											</button>
											<button
												type="button"
												onClick={() => handleTabChange("3.2")}
												className="bg-surface-inverted/80 hover:bg-surface-inverted-border text-surface-inverted-foreground border border-surface-inverted-border px-7 py-3.5 rounded-xl font-bold transition-all backdrop-blur-sm flex items-center gap-2 group"
											>
												<Users className="w-5 h-5 text-muted-foreground group-hover:text-white transition-colors" />
												Suporte ao Usuário
											</button>
											<button
												type="button"
												onClick={() => handleTabChange("geral")}
												className="bg-surface-inverted/80 hover:bg-surface-inverted-border text-surface-inverted-foreground border border-surface-inverted-border px-7 py-3.5 rounded-xl font-bold transition-all backdrop-blur-sm flex items-center gap-2 group"
											>
												<Globe className="w-5 h-5 text-muted-foreground group-hover:text-white transition-colors" />
												Sistemas e Guias
											</button>
										</div>
									</div>
								</div>

								{/* Value Proposition Cards */}
								<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
									<div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-start gap-4">
										<div className="bg-action/10 p-3 rounded-xl shrink-0">
											<TrendingUp className="w-6 h-6 text-action" />
										</div>
										<div>
											<h4 className="font-bold text-foreground mb-1">Eficiência Operacional</h4>
											<p className="text-sm text-muted-foreground leading-relaxed">
												Acesso unificado a todos os oráculos e ferramentas de cruzamento de dados.
											</p>
										</div>
									</div>
									<div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-start gap-4">
										<div className="bg-success/10 p-3 rounded-xl shrink-0">
											<CheckCircle2 className="w-6 h-6 text-success" />
										</div>
										<div>
											<h4 className="font-bold text-foreground mb-1">Conformidade e Controle</h4>
											<p className="text-sm text-muted-foreground leading-relaxed">
												Monitoramento rigoroso de saldos transitórios, alongados e contas genéricas.
											</p>
										</div>
									</div>
									<div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex items-start gap-4">
										<div className="bg-warning/10 p-3 rounded-xl shrink-0">
											<Landmark className="w-6 h-6 text-warning" />
										</div>
										<div>
											<h4 className="font-bold text-foreground mb-1">Governança DIREF</h4>
											<p className="text-sm text-muted-foreground leading-relaxed">
												Alinhamento total às diretrizes de contabilidade e gestão financeira do COMAER.
											</p>
										</div>
									</div>
								</div>

								{/* Quick Access Sections */}
								<div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
									<div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col group hover:border-action/30 transition-colors">
										<div className="w-14 h-14 bg-surface-inverted text-surface-inverted-foreground rounded-2xl flex items-center justify-center mb-6 shadow-md">
											<FileSpreadsheet className="w-7 h-7" />
										</div>
										<h3 className="text-2xl font-extrabold text-foreground mb-3">Acompanhamento Contábil</h3>
										<p className="text-muted-foreground mb-8 flex-1 leading-relaxed text-lg">
											Ferramentas analíticas avançadas para cruzamento de contas, monitoramento de saldos transitórios e verificação de conformidade contábil.
										</p>
										<button
											type="button"
											onClick={() => handleTabChange("3.1")}
											className="text-action font-bold hover:text-action/80 flex items-center gap-2 text-lg group-hover:translate-x-1 transition-transform w-fit"
										>
											Acessar Analistas <ArrowRight className="w-5 h-5" />
										</button>
									</div>

									<div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col group hover:border-action/30 transition-colors">
										<div className="w-14 h-14 bg-surface-inverted text-surface-inverted-foreground rounded-2xl flex items-center justify-center mb-6 shadow-md">
											<BookOpen className="w-7 h-7" />
										</div>
										<h3 className="text-2xl font-extrabold text-foreground mb-3">Suporte ao Usuário</h3>
										<p className="text-muted-foreground mb-8 flex-1 leading-relaxed text-lg">
											Oráculos especializados e interativos para suporte em SIAFI, execução orçamentária, folha de pagamento, suprimento de fundos e restos a
											pagar.
										</p>
										<button
											type="button"
											onClick={() => handleTabChange("3.2")}
											className="text-action font-bold hover:text-action/80 flex items-center gap-2 text-lg group-hover:translate-x-1 transition-transform w-fit"
										>
											Acessar Oráculos <ArrowRight className="w-5 h-5" />
										</button>
									</div>

									<div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col group hover:border-success/30 transition-colors">
										<div className="w-14 h-14 bg-surface-inverted text-surface-inverted-foreground rounded-2xl flex items-center justify-center mb-6 shadow-md">
											<Globe className="w-7 h-7" />
										</div>
										<h3 className="text-2xl font-extrabold text-foreground mb-3">Sistemas e Guias</h3>
										<p className="text-muted-foreground mb-8 flex-1 leading-relaxed text-lg">
											Acesso rápido aos sistemas oficiais do COMAER e Governo Federal, além de trilhas de estudo e guias para novos membros.
										</p>
										<button
											type="button"
											onClick={() => handleTabChange("geral")}
											className="text-success font-bold hover:text-success/80 flex items-center gap-2 text-lg group-hover:translate-x-1 transition-transform w-fit"
										>
											Acessar Sistemas <ArrowRight className="w-5 h-5" />
										</button>
									</div>
								</div>
							</div>
						) : sectionTab ? (
							/* Section View (3.1, 3.2 or geral) */
							<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
								<div className="bg-card p-8 rounded-3xl border border-border shadow-sm relative overflow-hidden">
									<div className="absolute top-0 right-0 w-64 h-64 bg-muted/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
									<div className="relative z-10">
										<div className="flex items-center gap-3 mb-3">
											<div className={cn("p-2 rounded-lg text-white", sectionTab === "3.1" ? "bg-action" : sectionTab === "3.2" ? "bg-action" : "bg-success")}>
												{sectionTab === "3.1" ? (
													<BarChart3 className="w-5 h-5" />
												) : sectionTab === "3.2" ? (
													<Users className="w-5 h-5" />
												) : (
													<Globe className="w-5 h-5" />
												)}
											</div>
											<span className="font-bold text-muted-foreground tracking-widest uppercase text-xs">DIREF • SUCONT</span>
										</div>
										<h2 className="text-3xl font-extrabold text-foreground mb-3 tracking-tight">{modulesData[sectionTab].title}</h2>
										<p className="text-muted-foreground text-lg max-w-3xl">
											Selecione um dos itens abaixo para acessar a ferramenta ou sistema correspondente.
										</p>
									</div>
								</div>

								{/* Grouped Items */}
								{Object.entries(
									(modulesData[sectionTab].items as readonly ModuleItem[]).reduce<Record<string, ModuleItem[]>>((acc, item) => {
										const group = item.group || "Geral"
										if (!acc[group]) acc[group] = []
										acc[group].push(item)
										return acc
									}, {})
								).map(([groupName, items]) => (
									<div key={groupName} className="space-y-4">
										{groupName !== "Geral" && <h3 className="text-xl font-bold text-foreground border-b border-border pb-2 mb-4">{groupName}</h3>}
										<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
											{items.map((item) => (
												<ModuleCard key={item.id} item={item} sectionId={sectionTab} />
											))}
										</div>
									</div>
								))}
							</div>
						) : null}
					</div>
				</div>
			</main>
		</div>
	)
}
