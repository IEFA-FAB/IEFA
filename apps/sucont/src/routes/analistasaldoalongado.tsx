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
import { Button } from "#/components/ui/button"

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
					<Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
						<ArrowLeft className="w-4 h-4" />
						Voltar ao Hub
					</Link>
					<div className="h-4 w-px bg-border" />
					<div className="flex items-center gap-3">
						<div className="w-8 h-8 bg-fab-600 rounded-lg flex items-center justify-center shadow-sm">
							<Plane className="w-4 h-4 text-white" />
						</div>
						<div>
							<h1 className="text-lg font-bold text-foreground leading-tight">Analista Saldo Alongado</h1>
							<p className="text-xs text-muted-foreground">Monitoramento de Saldos &gt;3 meses — COMAER</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-3">
					{consolidatedData && (
						<Button
							type="button"
							onClick={handleReset}
							variant="outline"
							size="sm"
							className="gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 hover:bg-muted/80 border-border rounded-lg transition-colors"
						>
							<RefreshCw className="w-3.5 h-3.5" />
							Nova Análise
						</Button>
					)}
					<div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-fab-50 rounded-full border border-fab-100">
						<CheckCircle2 className="w-3.5 h-3.5 text-fab-600" />
						<span className="text-label text-fab-800">Setorial Contábil COMAER</span>
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
						<h2 className="text-display text-foreground">
							Painel de Acompanhamento <span className="text-fab-600">SUCONT-3</span>
						</h2>
						<p className="text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
							Plataforma estratégica para análise de saldos sem movimentação por <strong className="text-fab-700 font-bold">mais de 3 meses</strong>, garantindo
							a fidedignidade das demonstrações contábeis do COMAER.
						</p>
					</div>

					{/* Info Cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
						<div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex flex-col items-center text-center space-y-3 hover:shadow-md transition-shadow">
							<div className="w-12 h-12 bg-action/10 text-action rounded-xl flex items-center justify-center shadow-sm">
								<Search className="w-6 h-6" />
							</div>
							<h3 className="font-bold text-foreground">Análise de Saldos</h3>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Identificação de saldos alongados em contas que exigem movimentação regular, prevenindo distorções patrimoniais.
							</p>
						</div>

						<div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex flex-col items-center text-center space-y-3 hover:shadow-md transition-shadow">
							<div className="w-12 h-12 bg-success/10 text-success rounded-xl flex items-center justify-center shadow-sm">
								<BookOpen className="w-6 h-6" />
							</div>
							<h3 className="font-bold text-foreground">Metodologia RAC</h3>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Aplicação rigorosa do Roteiro de Acompanhamento Contábil para assegurar a conformidade com as normas da Setorial.
							</p>
						</div>

						<div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex flex-col items-center text-center space-y-3 hover:shadow-md transition-shadow">
							<div className="w-12 h-12 bg-action/10 text-action rounded-xl flex items-center justify-center shadow-sm">
								<MessageSquare className="w-6 h-6" />
							</div>
							<h3 className="font-bold text-foreground">Notificação Ágil</h3>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Geração de mensagens institucionais padronizadas, otimizando a comunicação entre a SUCONT e as Unidades Gestoras.
							</p>
						</div>
					</div>

					{/* Report Path */}
					<div className="bg-card p-6 rounded-2xl shadow-sm border border-border max-w-5xl mx-auto">
						<h3 className="font-bold text-foreground mb-5 flex items-center gap-3">
							<div className="p-2 bg-fab-50 rounded-lg">
								<BookOpen className="w-4 h-4 text-fab-600" />
							</div>
							Extração de Dados (Tesouro Gerencial)
						</h3>
						<div className="bg-muted/50 p-4 rounded-xl border border-border text-sm text-foreground overflow-x-auto">
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
												index === array.length - 1 ? "bg-fab-600 text-white font-bold border-fab-700 shadow-sm" : "bg-card border-border"
											}`}
										>
											{step}
										</span>
										{index < array.length - 1 && <span className="text-muted-foreground font-bold">→</span>}
									</span>
								))}
							</div>
						</div>
					</div>

					{/* Upload */}
					<div className="bg-card p-8 rounded-xl shadow-xl border border-border max-w-2xl mx-auto relative overflow-hidden">
						<div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-fab-400 via-fab-600 to-fab-800" />
						<FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} error={error} />
					</div>

					{/* Footer */}
					<div className="text-center max-w-4xl mx-auto px-6">
						<div className="h-px w-24 bg-muted mx-auto mb-6" />
					</div>
				</div>
			) : (
				<div className="space-y-8">
					{/* Tabs */}
					<div className="flex items-center gap-2 bg-card p-1.5 rounded-2xl border border-border shadow-sm w-fit">
						<Button
							type="button"
							onClick={() => setActiveTab("operacional")}
							variant="ghost"
							className={`gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:bg-muted ${
								activeTab === "operacional" ? "bg-fab-600 text-white shadow-md hover:bg-fab-600" : "text-muted-foreground"
							}`}
						>
							<ListTodo className="w-4 h-4" />
							Operacional
						</Button>
						<Button
							type="button"
							onClick={() => setActiveTab("gerencial")}
							variant="ghost"
							className={`gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:bg-muted ${
								activeTab === "gerencial" ? "bg-fab-600 text-white shadow-md hover:bg-fab-600" : "text-muted-foreground"
							}`}
						>
							<LayoutDashboard className="w-4 h-4" />
							Estratégico
						</Button>
						<Button
							type="button"
							onClick={() => setActiveTab("analitico")}
							variant="ghost"
							className={`gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:bg-muted ${
								activeTab === "analitico" ? "bg-fab-600 text-white shadow-md hover:bg-fab-600" : "text-muted-foreground"
							}`}
						>
							<BarChart3 className="w-4 h-4" />
							Mapa de Risco
						</Button>
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
