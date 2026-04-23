import { BarChart3, BookOpen, CheckCircle2, LayoutDashboard, ListTodo, MessageSquare, Plane, Search, ShieldAlert } from "lucide-react"
import React, { useEffect, useState } from "react"
import { AnalyticalPanel } from "./components/AnalyticalPanel"
import { FileUploader } from "./components/FileUploader"
import { ManagerialPanel } from "./components/ManagerialPanel"
import { OperationalPanel } from "./components/OperationalPanel"
import { UgDetailsModal } from "./components/UgDetailsModal"
import { consolidateData, type DashboardMetrics, type UgConsolidated } from "./utils/analytics"
import { generateMessages, type UgMessage } from "./utils/generator"
import { parseFile } from "./utils/parser"

export default function App() {
	const [_messages, setMessages] = useState<UgMessage[] | null>(null)
	const [consolidatedData, setConsolidatedData] = useState<UgConsolidated[] | null>(null)
	const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedUg, setSelectedUg] = useState<UgConsolidated | null>(null)
	const [activeRacFilter, setActiveRacFilter] = useState<string | undefined>(undefined)
	const [activeTab, setActiveTab] = useState<"operacional" | "gerencial" | "analitico">("operacional")

	useEffect(() => {
		document.documentElement.classList.remove("dark")
		localStorage.removeItem("theme")
	}, [])

	const handleFileSelect = async (file: File) => {
		setIsLoading(true)
		setError(null)
		setMessages(null)
		setConsolidatedData(null)
		setMetrics(null)

		try {
			const parsedRows = await parseFile(file)
			const generatedMessages = generateMessages(parsedRows)
			const { consolidated, metrics: newMetrics } = consolidateData(parsedRows)

			setMessages(generatedMessages)
			setConsolidatedData(consolidated)
			setMetrics(newMetrics)
		} catch (err: any) {
			setError(err.message || "Ocorreu um erro ao processar o arquivo.")
		} finally {
			setIsLoading(false)
		}
	}

	const handleViewDetails = (ug: UgConsolidated, racFilter?: string) => {
		setSelectedUg(ug)
		setActiveRacFilter(racFilter)
	}

	const handleCloseDetails = () => {
		setSelectedUg(null)
		setActiveRacFilter(undefined)
	}

	return (
		<div className="min-h-screen bg-white font-sans text-slate-900 flex flex-col transition-colors duration-300">
			{/* Header */}
			<header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
				<div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 bg-fab-600 rounded-xl flex items-center justify-center shadow-sm border border-fab-700">
							<Plane className="w-6 h-6 text-white" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 tracking-tight">Analista SUCONT</h1>
							<p className="text-sm font-medium text-slate-500">Monitoramento de Saldos Alongados no COMAER</p>
						</div>
					</div>

					<div className="flex items-center gap-4">
						<div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-fab-50 rounded-full border border-fab-100 backdrop-blur-sm">
							<CheckCircle2 className="w-4 h-4 text-fab-600" />
							<span className="text-[10px] font-bold text-fab-800 uppercase tracking-widest">Setorial Contábil COMAER</span>
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
				{!consolidatedData ? (
					<div className="space-y-12 py-12">
						{/* Intro Section */}
						<div className="text-center max-w-3xl mx-auto space-y-6">
							<div className="inline-flex items-center gap-2 px-4 py-1.5 bg-fab-50 text-fab-700 rounded-full text-xs font-bold uppercase tracking-widest border border-fab-100">
								<ShieldAlert className="w-4 h-4" />
								Governança Contábil
							</div>
							<h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">
								Painel de Acompanhamento <span className="text-fab-600">SUCONT-3</span>
							</h2>
							<p className="text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
								Plataforma estratégica para análise de saldos sem movimentação por <strong className="text-fab-700 font-bold">mais de 3 meses</strong>,
								garantindo a fidedignidade das demonstrações contábeis do COMAER.
							</p>
						</div>

						{/* Info Cards */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
							<div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center text-center space-y-4 hover:shadow-md transition-shadow">
								<div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
									<Search className="w-7 h-7" />
								</div>
								<h3 className="font-bold text-slate-800 text-lg">Análise de Saldos</h3>
								<p className="text-sm text-slate-600 leading-relaxed">
									Identificação de saldos alongados em contas que exigem movimentação regular, prevenindo distorções patrimoniais.
								</p>
							</div>

							<div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center text-center space-y-4 hover:shadow-md transition-shadow">
								<div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
									<BookOpen className="w-7 h-7" />
								</div>
								<h3 className="font-bold text-slate-800 text-lg">Metodologia RAC</h3>
								<p className="text-sm text-slate-600 leading-relaxed">
									Aplicação rigorosa do Roteiro de Acompanhamento Contábil para assegurar a conformidade com as normas da Setorial.
								</p>
							</div>

							<div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center text-center space-y-4 hover:shadow-md transition-shadow">
								<div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-2 shadow-sm">
									<MessageSquare className="w-7 h-7" />
								</div>
								<h3 className="font-bold text-slate-800 text-lg">Notificação Ágil</h3>
								<p className="text-sm text-slate-600 leading-relaxed">
									Geração de mensagens institucionais padronizadas, otimizando a comunicação entre a SUCONT e as Unidades Gestoras.
								</p>
							</div>
						</div>

						{/* Report Path Section */}
						<div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-6xl mx-auto">
							<h3 className="font-bold text-slate-800 mb-6 flex items-center gap-3 text-lg">
								<div className="p-2 bg-fab-50 rounded-lg">
									<BookOpen className="w-5 h-5 text-fab-600" />
								</div>
								Extração de Dados (Tesouro Gerencial)
							</h3>
							<div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-sm text-slate-700 overflow-x-auto">
								<div className="flex items-center gap-3 whitespace-nowrap min-w-max">
									{[
										"TESOURO GERENCIAL",
										"Relatórios Compartilhados",
										"Consultas Gerenciais",
										"Relatórios de Bancada dos Órgãos Superiores",
										"52000 - Ministério da Defesa",
										"52111 - Comando da Aeronáutica",
										"SEFA",
										"DIREF",
										"SUCONT-3 - ACOMPANHAMENTO",
										"ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1",
									].map((step, index, array) => (
										<React.Fragment key={index}>
											<span
												className={`px-4 py-2 rounded-xl border transition-all ${
													index === array.length - 1 ? "bg-fab-600 text-white font-bold border-fab-700 shadow-sm" : "bg-white border-slate-200"
												}`}
											>
												{step}
											</span>
											{index < array.length - 1 && <span className="text-slate-400 font-bold">→</span>}
										</React.Fragment>
									))}
								</div>
							</div>
						</div>

						{/* Upload Section */}
						<div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-200 max-w-3xl mx-auto relative overflow-hidden">
							<div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-fab-400 via-fab-600 to-fab-800"></div>
							<FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} error={error} />
						</div>

						{/* Identificação Institucional */}
						<div className="mt-16 text-center max-w-4xl mx-auto px-6">
							<div className="h-px w-24 bg-slate-200 mx-auto mb-8"></div>
							<p className="text-[11px] text-slate-400 leading-relaxed font-medium uppercase tracking-wider">
								Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel
								Int Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
								Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
							</p>
						</div>
					</div>
				) : (
					<div className="space-y-8">
						{/* Tabs */}
						<div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit">
							<button
								onClick={() => setActiveTab("operacional")}
								className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
									activeTab === "operacional" ? "bg-fab-600 text-white shadow-md shadow-fab-600/20" : "text-slate-600 hover:bg-slate-100"
								}`}
							>
								<ListTodo className="w-4 h-4" />
								Operacional
							</button>
							<button
								onClick={() => setActiveTab("gerencial")}
								className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
									activeTab === "gerencial" ? "bg-fab-600 text-white shadow-md shadow-fab-600/20" : "text-slate-600 hover:bg-slate-100"
								}`}
							>
								<LayoutDashboard className="w-4 h-4" />
								Estratégico
							</button>
							<button
								onClick={() => setActiveTab("analitico")}
								className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
									activeTab === "analitico" ? "bg-fab-600 text-white shadow-md shadow-fab-600/20" : "text-slate-600 hover:bg-slate-100"
								}`}
							>
								<BarChart3 className="w-4 h-4" />
								Mapa de Risco
							</button>
						</div>

						{/* Main Content */}
						<div className="pt-2">
							{metrics && activeTab === "operacional" && <OperationalPanel data={consolidatedData} metrics={metrics} onViewDetails={handleViewDetails} />}
							{metrics && activeTab === "gerencial" && <ManagerialPanel data={consolidatedData} metrics={metrics} />}
							{consolidatedData && activeTab === "analitico" && <AnalyticalPanel data={consolidatedData} />}
						</div>
					</div>
				)}
			</main>

			{/* Modals */}
			{selectedUg && <UgDetailsModal ugData={selectedUg} onClose={handleCloseDetails} initialRacFilter={activeRacFilter} />}
		</div>
	)
}
