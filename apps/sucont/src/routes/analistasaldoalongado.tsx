import { createFileRoute } from "@tanstack/react-router"
import { BarChart3, BookOpen, LayoutDashboard, ListTodo, MessageSquare, RefreshCw, Search } from "lucide-react"
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
import { Card } from "#/components/ui/card"
import { SegmentedControl } from "#/components/ui/segmented-control"

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
		<HubLayout
			actions={
				consolidatedData && (
					<Button type="button" onClick={handleReset} variant="outline" size="sm">
						<RefreshCw className="w-3.5 h-3.5" />
						Nova análise
					</Button>
				)
			}
		>
			{/* Main Content */}
			{!consolidatedData ? (
				<div className="space-y-10">
					{/* A capa que existia aqui repetia, em três parágrafos, a mesma frase que
					    o `HubLayout` já mostra sob a trilha. */}
					{/* Info Cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
						<Card className="items-center p-6 text-center">
							<div className="w-12 h-12 bg-action/10 text-action rounded-xl flex items-center justify-center shadow-sm">
								<Search className="w-6 h-6" />
							</div>
							<h3 className="text-heading text-foreground">Análise de Saldos</h3>
							<p className="text-body text-muted-foreground leading-relaxed">
								Identificação de saldos alongados em contas que exigem movimentação regular, prevenindo distorções patrimoniais.
							</p>
						</Card>

						<Card className="items-center p-6 text-center">
							<div className="w-12 h-12 bg-success/10 text-success rounded-xl flex items-center justify-center shadow-sm">
								<BookOpen className="w-6 h-6" />
							</div>
							<h3 className="text-heading text-foreground">Metodologia RAC</h3>
							<p className="text-body text-muted-foreground leading-relaxed">
								Aplicação rigorosa do Roteiro de Acompanhamento Contábil para assegurar a conformidade com as normas da Setorial.
							</p>
						</Card>

						<Card className="items-center p-6 text-center">
							<div className="w-12 h-12 bg-action/10 text-action rounded-xl flex items-center justify-center shadow-sm">
								<MessageSquare className="w-6 h-6" />
							</div>
							<h3 className="text-heading text-foreground">Notificação Ágil</h3>
							<p className="text-body text-muted-foreground leading-relaxed">
								Geração de mensagens institucionais padronizadas, otimizando a comunicação entre a SUCONT e as Unidades Gestoras.
							</p>
						</Card>
					</div>

					{/* Report Path */}
					<div className="bg-card p-6 rounded-xl shadow-sm border border-border max-w-5xl mx-auto">
						<h3 className="font-bold text-foreground mb-5 flex items-center gap-3">
							<div className="p-2 bg-muted/50 rounded-lg">
								<BookOpen className="w-4 h-4 text-action" />
							</div>
							Extração de Dados (Tesouro Gerencial)
						</h3>
						<div className="bg-muted/50 p-4 rounded-xl border border-border text-body text-foreground overflow-x-auto">
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
												index === array.length - 1 ? "bg-action text-white font-bold border-action shadow-sm" : "bg-card border-border"
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

					{/* O `FileUploader` já é a superfície tracejada; envolvê-lo num card dava
					    duas bordas concêntricas, e a faixa de gradiente no topo do card não
					    existe em nenhuma outra tela. */}
					<div className="mx-auto max-w-2xl">
						<FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} error={error} />
					</div>
				</div>
			) : (
				<div className="space-y-8">
					<SegmentedControl
						label="Visão do painel"
						size="lg"
						value={activeTab}
						onValueChange={setActiveTab}
						className="mb-2"
						options={[
							{
								value: "operacional",
								label: (
									<>
										<ListTodo />
										Operacional
									</>
								),
							},
							{
								value: "gerencial",
								label: (
									<>
										<LayoutDashboard />
										Estratégico
									</>
								),
							},
							{
								value: "analitico",
								label: (
									<>
										<BarChart3 />
										Mapa de risco
									</>
								),
							},
						]}
					/>

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
