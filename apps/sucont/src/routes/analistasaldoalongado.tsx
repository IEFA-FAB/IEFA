import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, BarChart3, BookOpen, CheckCircle2, LayoutDashboard, ListTodo, MessageSquare, Plane, RefreshCw, Search, ShieldAlert } from "lucide-react"
import { useState } from "react"
import { AnalyticalPanel } from "#/analistasaldoalongado/components/AnalyticalPanel"
import { FileUploader } from "#/analistasaldoalongado/components/FileUploader"
import { ManagerialPanel } from "#/analistasaldoalongado/components/ManagerialPanel"
import { OperationalPanel } from "#/analistasaldoalongado/components/OperationalPanel"
import { UgDetailsModal } from "#/analistasaldoalongado/components/UgDetailsModal"
import type { DashboardMetrics, UgConsolidated } from "#/analistasaldoalongado/utils/analytics"
import { consolidateData } from "#/analistasaldoalongado/utils/analytics"
import type { UgMessage } from "#/analistasaldoalongado/utils/generator"
import { generateMessages } from "#/analistasaldoalongado/utils/generator"
import { parseFile } from "#/analistasaldoalongado/utils/parser"
import { HubLayout } from "#/components/hub-layout"

export const Route = createFileRoute("/analistasaldoalongado")({
	component: AnalistaSaldoAlongado,
})

function AnalistaSaldoAlongado() {
	const [_messages, setMessages] = useState<UgMessage[] | null>(null)
	const [consolidatedData, setConsolidatedData] = useState<UgConsolidated[] | null>(null)
	const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedUg, setSelectedUg] = useState<UgConsolidated | null>(null)
	const [activeRacFilter, setActiveRacFilter] = useState<string | undefined>(undefined)
	const [activeTab, setActiveTab] = useState<"operacional" | "gerencial" | "analitico">("operacional")

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
		} catch (err) {
			const message = err instanceof Error ? err.message : "Ocorreu um erro ao processar o arquivo."
			setError(message)
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

	const handleReset = () => {
		setMessages(null)
		setConsolidatedData(null)
		setMetrics(null)
		setError(null)
		setActiveTab("operacional")
	}

	return (
		<HubLayout>
			{/* Back navigation + tool header */}
			<div className="flex items-center justify-between mb-8">
				<div className="flex items-center gap-4">
					<Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors text-sm font-medium">
						<ArrowLeft className="w-4 h-4" />
						Voltar ao Hub
					</Link>
					<div className="h-4 w-px bg-slate-200" />
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 bg-fab-600 rounded-lg flex items-center justify-center shadow-sm">
							<Plane className="w-4 h-4 text-white" />
						</div>
						<div>
							<h1 className="text-lg font-bold text-slate-900 leading-tight">Analista Saldo Alongado</h1>
							<p className="text-xs text-slate-500">Monitoramento de Saldos &gt;3 meses — COMAER</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3">
					{consolidatedData && (
						<button
							type="button"
							onClick={handleReset}
							className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
						>
							<RefreshCw className="w-3.5 h-3.5" />
							Nova Análise
						</button>
					)}
					<div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-fab-50 rounded-full border border-fab-100">
						<CheckCircle2 className="w-3.5 h-3.5 text-fab-600" />
						<span className="text-[10px] font-bold text-fab-800 uppercase tracking-widest">Setorial Contábil COMAER</span>
					</div>
				</div>
			</div>

			{/* Main Content */}
			{!consolidatedData ? (
				<div className="space-y-12 py-4">
					{/* Intro */}
					<div className="text-center max-w-3xl mx-auto space-y-6">
						<div className="inline-flex items-center gap-2 px-4 py-1.5 bg-fab-50 text-fab-700 rounded-full text-xs font-bold uppercase tracking-widest border border-fab-100">
							<ShieldAlert className="w-4 h-4" />
							Governança Contábil
						</div>
						<h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
							Painel de Acompanhamento <span className="text-fab-600">SUCONT-3</span>
						</h2>
						<p className="text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
							Plataforma estratégica para análise de saldos sem movimentação por <strong className="text-fab-700 font-bold">mais de 3 meses</strong>, garantindo
							a fidedignidade das demonstrações contábeis do COMAER.
						</p>
					</div>

					{/* Info Cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center text-center space-y-3 hover:shadow-md transition-shadow">
							<div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-sm">
								<Search className="w-6 h-6" />
							</div>
							<h3 className="font-bold text-slate-800">Análise de Saldos</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Identificação de saldos alongados em contas que exigem movimentação regular, prevenindo distorções patrimoniais.
							</p>
						</div>

						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center text-center space-y-3 hover:shadow-md transition-shadow">
							<div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shadow-sm">
								<BookOpen className="w-6 h-6" />
							</div>
							<h3 className="font-bold text-slate-800">Metodologia RAC</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Aplicação rigorosa do Roteiro de Acompanhamento Contábil para assegurar a conformidade com as normas da Setorial.
							</p>
						</div>

						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center text-center space-y-3 hover:shadow-md transition-shadow">
							<div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center shadow-sm">
								<MessageSquare className="w-6 h-6" />
							</div>
							<h3 className="font-bold text-slate-800">Notificação Ágil</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Geração de mensagens institucionais padronizadas, otimizando a comunicação entre a SUCONT e as Unidades Gestoras.
							</p>
						</div>
					</div>

					{/* Report Path */}
					<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-5xl mx-auto">
						<h3 className="font-bold text-slate-800 mb-5 flex items-center gap-3">
							<div className="p-2 bg-fab-50 rounded-lg">
								<BookOpen className="w-4 h-4 text-fab-600" />
							</div>
							Extração de Dados (Tesouro Gerencial)
						</h3>
						<div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 overflow-x-auto">
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
									<span key={index} className="flex items-center gap-3">
										<span
											className={`px-3 py-1.5 rounded-lg border transition-all ${
												index === array.length - 1 ? "bg-fab-600 text-white font-bold border-fab-700 shadow-sm" : "bg-white border-slate-200"
											}`}
										>
											{step}
										</span>
										{index < array.length - 1 && <span className="text-slate-400 font-bold">→</span>}
									</span>
								))}
							</div>
						</div>
					</div>

					{/* Upload */}
					<div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200 max-w-2xl mx-auto relative overflow-hidden">
						<div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-fab-400 via-fab-600 to-fab-800" />
						<FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} error={error} />
					</div>

					{/* Footer */}
					<div className="text-center max-w-4xl mx-auto px-6">
						<div className="h-px w-24 bg-slate-200 mx-auto mb-6" />
						<p className="text-[11px] text-slate-400 leading-relaxed font-medium uppercase tracking-wider">
							Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel Int
							Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
							Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
						</p>
					</div>
				</div>
			) : (
				<div className="space-y-8">
					{/* Tabs */}
					<div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit">
						<button
							type="button"
							onClick={() => setActiveTab("operacional")}
							className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
								activeTab === "operacional" ? "bg-fab-600 text-white shadow-md shadow-fab-600/20" : "text-slate-600 hover:bg-slate-100"
							}`}
						>
							<ListTodo className="w-4 h-4" />
							Operacional
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("gerencial")}
							className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
								activeTab === "gerencial" ? "bg-fab-600 text-white shadow-md shadow-fab-600/20" : "text-slate-600 hover:bg-slate-100"
							}`}
						>
							<LayoutDashboard className="w-4 h-4" />
							Estratégico
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("analitico")}
							className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
								activeTab === "analitico" ? "bg-fab-600 text-white shadow-md shadow-fab-600/20" : "text-slate-600 hover:bg-slate-100"
							}`}
						>
							<BarChart3 className="w-4 h-4" />
							Mapa de Risco
						</button>
					</div>

					{/* Panel Content */}
					<div className="pt-2">
						{metrics && activeTab === "operacional" && <OperationalPanel data={consolidatedData} metrics={metrics} onViewDetails={handleViewDetails} />}
						{metrics && activeTab === "gerencial" && <ManagerialPanel data={consolidatedData} metrics={metrics} />}
						{consolidatedData && activeTab === "analitico" && <AnalyticalPanel data={consolidatedData} />}
					</div>
				</div>
			)}

			{/* Modal */}
			{selectedUg && <UgDetailsModal ugData={selectedUg} onClose={handleCloseDetails} initialRacFilter={activeRacFilter} />}
		</HubLayout>
	)
}
