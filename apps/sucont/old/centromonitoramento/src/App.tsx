import {
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
import { modulesData, routingKeywords } from "./data"
import { cn } from "./lib/utils"

export default function App() {
	const [activeTab, setActiveTab] = useState<"home" | "3.1" | "3.2" | "geral">("home")
	const [searchQuery, setSearchQuery] = useState("")
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

	const searchResults = useMemo(() => {
		if (!searchQuery.trim()) return null
		const query = searchQuery.toLowerCase()
		const results: any[] = []

		;["3.1", "3.2", "geral"].forEach((sectionId) => {
			modulesData[sectionId as "3.1" | "3.2" | "geral"].items.forEach((item) => {
				const matchName = item.name.toLowerCase().includes(query)
				const matchPurpose = item.purpose.toLowerCase().includes(query)
				const route = routingKeywords.find((r) => r.moduleId === item.id)
				const matchKeyword = route?.keywords.some((kw) => kw.toLowerCase().includes(query))

				if (matchName || matchPurpose || matchKeyword) {
					results.push({ ...item, sectionId })
				}
			})
		})
		return results
	}, [searchQuery])

	const handleTabChange = (tab: "home" | "3.1" | "3.2" | "geral") => {
		setActiveTab(tab)
		setSearchQuery("")
		setIsMobileMenuOpen(false)
	}

	const ModuleCard = ({ item, sectionId }: { item: any; sectionId?: string }) => {
		let badgeText = "SUCONT-3.1"
		let badgeColor = "bg-blue-50 text-blue-700 border-blue-100"

		if (sectionId === "3.2" || (!sectionId && modulesData["3.2"].items.some((i) => i.id === item.id))) {
			badgeText = "SUCONT-3.2"
			badgeColor = "bg-sky-50 text-sky-700 border-sky-100"
		} else if (sectionId === "geral" || (!sectionId && modulesData.geral.items.some((i) => i.id === item.id))) {
			badgeText = "ÂMBITO GERAL"
			badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-100"
		}

		return (
			<div
				className={cn(
					"bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col hover:shadow-lg transition-all duration-300 group relative",
					item.highlighted ? "border-amber-400 ring-2 ring-amber-400/20 shadow-amber-100/50" : "border-slate-200 hover:border-blue-300"
				)}
			>
				{item.highlighted && <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 z-20"></div>}
				<div className="p-5 flex-1">
					<div className="flex items-start justify-between gap-4 mb-3">
						<div className="flex flex-col gap-1">
							{item.highlighted && (
								<span className="text-[9px] font-black text-amber-600 uppercase tracking-[0.2em] mb-1 flex items-center gap-1">
									<Star className="w-2.5 h-2.5 fill-amber-500" /> Destaque Operacional
								</span>
							)}
							<h3
								className={cn(
									"font-bold leading-tight transition-colors",
									item.highlighted ? "text-amber-900 group-hover:text-amber-700" : "text-slate-800 group-hover:text-blue-700"
								)}
							>
								{item.name}
							</h3>
						</div>
						<span className={cn("shrink-0 px-2.5 py-1 border text-[10px] font-bold uppercase tracking-wider rounded-md", badgeColor)}>{badgeText}</span>
					</div>
					<p className="text-sm text-slate-600 mb-5 leading-relaxed">{item.purpose}</p>

					<div className={cn("space-y-2.5 p-3 rounded-lg border", item.highlighted ? "bg-amber-50/50 border-amber-100" : "bg-slate-50 border-slate-100")}>
						<span
							className={cn("text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5", item.highlighted ? "text-amber-600" : "text-slate-400")}
						>
							<Search className="w-3 h-3" /> Exemplos de Consulta
						</span>
						<ul className="space-y-1.5">
							{item.examples.map((ex: string, i: number) => (
								<li key={i} className="text-xs text-slate-600 flex items-start gap-2 font-medium">
									<ChevronRight className={cn("w-3 h-3 mt-0.5 shrink-0", item.highlighted ? "text-amber-500" : "text-blue-500")} />
									{ex}
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className={cn("p-4 border-t", item.highlighted ? "bg-amber-50/30 border-amber-100" : "bg-white border-slate-100")}>
					{item.url ? (
						<a
							href={item.url}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(
								"w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow-md",
								item.highlighted
									? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200/50"
									: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200/50"
							)}
						>
							Acessar Ferramenta
							<ExternalLink className="w-4 h-4" />
						</a>
					) : (
						<button
							disabled
							className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-400 px-4 py-2.5 rounded-lg text-sm font-semibold cursor-not-allowed"
						>
							Link Indisponível
						</button>
					)}
				</div>
			</div>
		)
	}

	// Helper component for the ChevronRight icon used in the ModuleCard
	const ChevronRight = ({ className }: { className?: string }) => (
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
			className={className}
		>
			<path d="m9 18 6-6-6-6" />
		</svg>
	)

	return (
		<div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row font-sans selection:bg-blue-200 selection:text-blue-900">
			{/* Mobile Header */}
			<div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-20 shadow-md border-b border-blue-900/50">
				<div className="flex items-center gap-3 truncate pr-2">
					<div className="bg-blue-600 p-1.5 rounded-md shrink-0">
						<Plane className="w-5 h-5 text-white" />
					</div>
					<span className="font-bold text-sm sm:text-base tracking-tight truncate">Centro de Monitoramento Contábil da SUCONT-3</span>
				</div>
				<button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-300 hover:text-white">
					{isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
				</button>
			</div>

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed md:sticky top-0 left-0 h-screen w-72 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 z-30 border-r border-slate-800 shadow-2xl md:shadow-none",
					isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
				)}
			>
				<div className="p-6 hidden md:flex flex-col gap-4 border-b border-slate-800 relative overflow-hidden">
					{/* Subtle background decoration */}
					<Plane className="absolute -right-4 -top-4 w-32 h-32 text-slate-800/30 transform rotate-[-15deg] pointer-events-none" />

					<div className="flex items-center gap-3 relative z-10">
						<div className="bg-gradient-to-br from-blue-500 to-blue-700 p-2.5 rounded-xl shadow-lg shadow-blue-900/20 border border-blue-400/20 shrink-0">
							<Landmark className="w-7 h-7 text-white" />
						</div>
						<div>
							<h1 className="font-extrabold text-white text-sm tracking-tight leading-tight">Centro de Monitoramento Contábil da SUCONT-3</h1>
							<span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1 block">DIREF • COMAER</span>
						</div>
					</div>
				</div>

				<nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
					<button
						onClick={() => handleTabChange("home")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "home" && !searchQuery
								? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
								: "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
						)}
					>
						<LayoutDashboard className={cn("w-5 h-5", activeTab === "home" && !searchQuery ? "text-blue-200" : "")} />
						Visão Geral
					</button>

					<div className="pt-6 pb-2 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Módulos Operacionais</div>

					<button
						onClick={() => handleTabChange("3.1")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "3.1" && !searchQuery
								? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
								: "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
						)}
					>
						<BarChart3 className={cn("w-5 h-5", activeTab === "3.1" && !searchQuery ? "text-blue-200" : "")} />
						Acompanhamento Contábil
					</button>

					<button
						onClick={() => handleTabChange("3.2")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "3.2" && !searchQuery
								? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
								: "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
						)}
					>
						<Users className={cn("w-5 h-5", activeTab === "3.2" && !searchQuery ? "text-blue-200" : "")} />
						Suporte ao Usuário
					</button>

					<button
						onClick={() => handleTabChange("geral")}
						className={cn(
							"w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
							activeTab === "geral" && !searchQuery
								? "bg-blue-600 text-white shadow-md shadow-blue-900/20"
								: "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
						)}
					>
						<Globe className={cn("w-5 h-5", activeTab === "geral" && !searchQuery ? "text-blue-200" : "")} />
						Sistemas e Guias
					</button>
				</nav>

				<div className="p-5 border-t border-slate-800 bg-slate-900/50">
					<div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<ShieldCheck className="w-4 h-4 text-blue-400" />
							<span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Uso Institucional</span>
						</div>
						<p className="text-[10px] text-slate-400 leading-relaxed font-medium">
							Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel Int
							Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
							Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
						</p>
					</div>
				</div>
			</aside>

			{/* Mobile Overlay */}
			{isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-20 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}

			{/* Main Content */}
			<main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50">
				{/* Topbar / Search */}
				<header className="bg-white border-b border-slate-200/80 p-4 sm:px-8 flex items-center justify-between shrink-0 shadow-sm z-10">
					<div className="relative w-full max-w-2xl">
						<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
						<input
							type="text"
							placeholder="Buscar por módulo, assunto, Q35, SIAFI, Restos a Pagar..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full pl-12 pr-10 py-3 bg-slate-100/80 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl text-sm font-medium transition-all outline-none placeholder:text-slate-400 text-slate-700"
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-slate-200 hover:bg-slate-300 p-1 rounded-full transition-colors"
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
								<div className="flex items-center justify-between border-b border-slate-200 pb-4">
									<h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Resultados da Busca</h2>
									<span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-bold">{searchResults?.length} encontrado(s)</span>
								</div>

								{searchResults && searchResults.length > 0 ? (
									<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
										{searchResults.map((item, idx) => (
											<ModuleCard key={idx} item={item} sectionId={item.sectionId} />
										))}
									</div>
								) : (
									<div className="text-center py-24 bg-white rounded-2xl border border-slate-200 border-dashed shadow-sm">
										<div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
											<Search className="w-8 h-8 text-slate-400" />
										</div>
										<h3 className="text-xl font-bold text-slate-800 mb-2">Nenhum módulo encontrado</h3>
										<p className="text-slate-500 max-w-md mx-auto">
											Não encontramos ferramentas correspondentes para "{searchQuery}". Tente buscar por outros termos ou siglas.
										</p>
									</div>
								)}
							</div>
						) : /* Home View */
						activeTab === "home" ? (
							<div className="space-y-8 animate-in fade-in duration-700">
								{/* Hero Section - FAB/DIREF Theme */}
								<div className="relative bg-gradient-to-br from-slate-900 via-[#0a192f] to-blue-950 rounded-3xl p-8 sm:p-12 text-white shadow-2xl overflow-hidden border border-blue-800/50">
									{/* Decorative Elements */}
									<div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
									<div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-sky-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none"></div>
									<Plane className="absolute -right-10 top-10 w-96 h-96 text-white/[0.03] transform rotate-[-30deg] pointer-events-none" />

									<div className="relative z-10 max-w-3xl">
										<div className="flex flex-wrap items-center gap-3 mb-6">
											<span className="px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-xs font-bold tracking-widest text-blue-200 uppercase backdrop-blur-sm flex items-center gap-1.5">
												<ShieldCheck className="w-3.5 h-3.5" /> Força Aérea Brasileira
											</span>
											<span className="px-3 py-1 bg-slate-800/50 border border-slate-700/50 rounded-full text-xs font-bold tracking-widest text-slate-300 uppercase backdrop-blur-sm">
												DIREF • SUCONT
											</span>
										</div>

										<h2 className="text-4xl sm:text-5xl font-extrabold mb-5 tracking-tight leading-[1.1]">
											Centro de Monitoramento Contábil <br className="hidden sm:block" />
											<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-300">da SUCONT-3</span>
										</h2>

										<p className="text-slate-300 text-lg sm:text-xl leading-relaxed mb-10 max-w-2xl font-medium">
											Plataforma centralizada para ferramentas de análise contábil e suporte ao usuário. Promovendo excelência, padronização e apoio à tomada de
											decisão no Comando da Aeronáutica.
										</p>

										<div className="flex flex-wrap gap-4">
											<button
												onClick={() => handleTabChange("3.1")}
												className="bg-blue-600 hover:bg-blue-500 text-white px-7 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/30 flex items-center gap-2 group"
											>
												<BarChart3 className="w-5 h-5 text-blue-200 group-hover:text-white transition-colors" />
												Acompanhamento Contábil
											</button>
											<button
												onClick={() => handleTabChange("3.2")}
												className="bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-600/50 px-7 py-3.5 rounded-xl font-bold transition-all backdrop-blur-sm flex items-center gap-2 group"
											>
												<Users className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
												Suporte ao Usuário
											</button>
											<button
												onClick={() => handleTabChange("geral")}
												className="bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-600/50 px-7 py-3.5 rounded-xl font-bold transition-all backdrop-blur-sm flex items-center gap-2 group"
											>
												<Globe className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
												Sistemas e Guias
											</button>
										</div>
									</div>
								</div>

								{/* Value Proposition Cards */}
								<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
									<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
										<div className="bg-blue-50 p-3 rounded-xl shrink-0">
											<TrendingUp className="w-6 h-6 text-blue-600" />
										</div>
										<div>
											<h4 className="font-bold text-slate-800 mb-1">Eficiência Operacional</h4>
											<p className="text-sm text-slate-500 leading-relaxed">Acesso unificado a todos os oráculos e ferramentas de cruzamento de dados.</p>
										</div>
									</div>
									<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
										<div className="bg-emerald-50 p-3 rounded-xl shrink-0">
											<CheckCircle2 className="w-6 h-6 text-emerald-600" />
										</div>
										<div>
											<h4 className="font-bold text-slate-800 mb-1">Conformidade e Controle</h4>
											<p className="text-sm text-slate-500 leading-relaxed">Monitoramento rigoroso de saldos transitórios, alongados e contas genéricas.</p>
										</div>
									</div>
									<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
										<div className="bg-amber-50 p-3 rounded-xl shrink-0">
											<Landmark className="w-6 h-6 text-amber-600" />
										</div>
										<div>
											<h4 className="font-bold text-slate-800 mb-1">Governança DIREF</h4>
											<p className="text-sm text-slate-500 leading-relaxed">Alinhamento total às diretrizes de contabilidade e gestão financeira do COMAER.</p>
										</div>
									</div>
								</div>

								{/* Quick Access Sections */}
								<div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
									<div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col group hover:border-blue-300 transition-colors">
										<div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center mb-6 shadow-md shadow-blue-500/20">
											<FileSpreadsheet className="w-7 h-7" />
										</div>
										<h3 className="text-2xl font-extrabold text-slate-800 mb-3">Acompanhamento Contábil</h3>
										<p className="text-slate-600 mb-8 flex-1 leading-relaxed text-lg">
											Ferramentas analíticas avançadas para cruzamento de contas, monitoramento de saldos transitórios e verificação de conformidade contábil.
										</p>
										<button
											onClick={() => handleTabChange("3.1")}
											className="text-blue-600 font-bold hover:text-blue-800 flex items-center gap-2 text-lg group-hover:translate-x-1 transition-transform w-fit"
										>
											Acessar Analistas <ArrowRight className="w-5 h-5" />
										</button>
									</div>

									<div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col group hover:border-sky-300 transition-colors">
										<div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-sky-700 text-white rounded-2xl flex items-center justify-center mb-6 shadow-md shadow-sky-500/20">
											<BookOpen className="w-7 h-7" />
										</div>
										<h3 className="text-2xl font-extrabold text-slate-800 mb-3">Suporte ao Usuário</h3>
										<p className="text-slate-600 mb-8 flex-1 leading-relaxed text-lg">
											Oráculos especializados e interativos para suporte em SIAFI, execução orçamentária, folha de pagamento, suprimento de fundos e restos a
											pagar.
										</p>
										<button
											onClick={() => handleTabChange("3.2")}
											className="text-sky-600 font-bold hover:text-sky-800 flex items-center gap-2 text-lg group-hover:translate-x-1 transition-transform w-fit"
										>
											Acessar Oráculos <ArrowRight className="w-5 h-5" />
										</button>
									</div>

									<div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col group hover:border-emerald-300 transition-colors">
										<div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-2xl flex items-center justify-center mb-6 shadow-md shadow-emerald-500/20">
											<Globe className="w-7 h-7" />
										</div>
										<h3 className="text-2xl font-extrabold text-slate-800 mb-3">Sistemas e Guias</h3>
										<p className="text-slate-600 mb-8 flex-1 leading-relaxed text-lg">
											Acesso rápido aos sistemas oficiais do COMAER e Governo Federal, além de trilhas de estudo e guias para novos membros.
										</p>
										<button
											onClick={() => handleTabChange("geral")}
											className="text-emerald-600 font-bold hover:text-emerald-800 flex items-center gap-2 text-lg group-hover:translate-x-1 transition-transform w-fit"
										>
											Acessar Sistemas <ArrowRight className="w-5 h-5" />
										</button>
									</div>
								</div>
							</div>
						) : (
							/* Section View (3.1, 3.2 or geral) */
							<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
								<div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
									<div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
									<div className="relative z-10">
										<div className="flex items-center gap-3 mb-3">
											<div
												className={cn("p-2 rounded-lg text-white", activeTab === "3.1" ? "bg-blue-600" : activeTab === "3.2" ? "bg-sky-600" : "bg-emerald-600")}
											>
												{activeTab === "3.1" ? (
													<BarChart3 className="w-5 h-5" />
												) : activeTab === "3.2" ? (
													<Users className="w-5 h-5" />
												) : (
													<Globe className="w-5 h-5" />
												)}
											</div>
											<span className="font-bold text-slate-500 tracking-widest uppercase text-xs">DIREF • SUCONT</span>
										</div>
										<h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">{modulesData[activeTab].title}</h2>
										<p className="text-slate-600 text-lg max-w-3xl">Selecione um dos itens abaixo para acessar a ferramenta ou sistema correspondente.</p>
									</div>
								</div>

								{/* Grouped Items */}
								{Object.entries(
									(modulesData[activeTab].items as any[]).reduce(
										(acc: Record<string, any[]>, item: any) => {
											const group = item.group || "Geral"
											if (!acc[group]) acc[group] = []
											acc[group].push(item)
											return acc
										},
										{} as Record<string, any[]>
									)
								).map(([groupName, items]) => (
									<div key={groupName} className="space-y-4">
										{groupName !== "Geral" && <h3 className="text-xl font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">{groupName}</h3>}
										<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
											{(items as any[]).map((item) => (
												<ModuleCard key={item.id} item={item} sectionId={activeTab} />
											))}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</main>
		</div>
	)
}
