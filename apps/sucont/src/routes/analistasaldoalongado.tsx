import { createFileRoute } from "@tanstack/react-router"
import { BarChart3, BookOpen, LayoutDashboard, ListTodo, MessageSquare, RefreshCw, Search } from "lucide-react"
import { useState } from "react"
import { AnalyticalPanel } from "#/analistasaldoalongado/components/AnalyticalPanel"
import { ManagerialPanel } from "#/analistasaldoalongado/components/ManagerialPanel"
import { OperationalPanel } from "#/analistasaldoalongado/components/OperationalPanel"
import { UgDetailsModal } from "#/analistasaldoalongado/components/UgDetailsModal"
import type { DashboardMetrics, UgConsolidated } from "#/analistasaldoalongado/utils/analytics"
import { consolidateData } from "#/analistasaldoalongado/utils/analytics"
import type { UgMessage } from "#/analistasaldoalongado/utils/generator"
import { generateMessages } from "#/analistasaldoalongado/utils/generator"
import { parseFile } from "#/analistasaldoalongado/utils/parser"
import { requireToolAccess } from "#/auth/pbac"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Button } from "#/components/ui/button"
import { FileDropzone, SPREADSHEET_ACCEPT } from "#/components/ui/file-dropzone"
import { SegmentedControl } from "#/components/ui/segmented-control"

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Search,
		title: "O que é analisado",
		text: "Saldos sem movimentação há mais de três meses em contas que exigem giro regular, contra as vinte questões do RAC no escopo.",
	},
	{
		icon: MessageSquare,
		title: "O que é gerado",
		text: "Mensagem institucional padronizada por UG, reunindo num só texto todas as contas alongadas daquela unidade.",
	},
	{
		icon: BookOpen,
		title: "Como o resultado é lido",
		text: "Três painéis do mesmo dado — operacional, gerencial e analítico —, com o detalhe por UG acessível de qualquer um deles.",
	},
] as const

export const Route = createFileRoute("/analistasaldoalongado")({
	// A divisão exigida sai do catálogo (`sucontTools`), pelo `internalPath`.
	beforeLoad: (opts) => requireToolAccess(opts, "/analistasaldoalongado"),
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

	const handleFiles = (files: File[]) => {
		const file = files[0]
		if (file) void handleFileSelect(file)
	}

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

	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					objective="Encontrar saldos parados há mais de três meses em contas que exigem movimentação regular, por UG e por questão do RAC."
					risk="Saldo alongado indica pendência não tratada — baixa não efetuada, conciliação em aberto ou registro esquecido —, e distorce a posição patrimonial."
					importance="O apontamento por competência mostra o que envelheceu desde o último ciclo e sustenta a cobrança junto à UG."
				/>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
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
				<AnalysisStart
					dropzone={
						<FileDropzone
							accept={SPREADSHEET_ACCEPT}
							onFiles={handleFiles}
							hint="Excel do Tesouro Gerencial (.xlsx, .xls) ou CSV"
							columns={["UG", "Conta Contábil", "Mês", "Saldo"]}
							isLoading={isLoading}
						/>
					}
					error={error}
				/>
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
