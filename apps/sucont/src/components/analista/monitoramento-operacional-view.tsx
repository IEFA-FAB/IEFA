// Extraído de routes/monitoramento.tsx (port do Analistasaldoimproprio): a visão operacional
// (visão geral, filtro por tipo, cobranças por UG, exceções e contas fora do escopo).
import { AlertCircle, AlertTriangle, BarChart3, Building2, CheckCircle2, DollarSign, FileText } from "lucide-react"
import { ConsolidatedMessageCard } from "#/components/analista/consolidated-message-card"
import { UGCard } from "#/components/analista/ug-card"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { StatTile } from "#/components/ui/stat-tile"
import type { DashboardData } from "#/lib/analista/monitoramento-panels"
import { formatCurrency, type ProcessedRow } from "#/lib/analista/types"

export type OperacionalTab = "ALL" | "COBRANCAS" | "EXCECOES" | "FORA_ESCOPO"

export type UgMesGroup = { ug: string; mes: string; rows: ProcessedRow[] }

/** "Todas as ocorrências" mostra todas as seções; as demais, só a própria. */
function isTabVisible(activeTab: OperacionalTab, tab: Exclude<OperacionalTab, "ALL">): boolean {
	return activeTab === "ALL" || activeTab === tab
}

function OperacionalOverview({ dashboardData }: { dashboardData: DashboardData }) {
	return (
		<div className="space-y-6 mb-8">
			<SectionHeader icon={<BarChart3 />} title="Visão geral" />
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<StatTile icon={<FileText />} label="Registros analisados" value={dashboardData.totalRegistros} />
				<StatTile icon={<AlertTriangle />} label="Ocorrências de cobrança" value={dashboardData.totalCobrancas} status="destructive" />
				<StatTile icon={<Building2 />} label="UGs com inconsistências" value={dashboardData.ugsComInconsistencia} status="action" />
				<StatTile icon={<CheckCircle2 />} label="Exceções identificadas" value={dashboardData.totalExcecoes} status="success" />
				<StatTile icon={<AlertCircle />} label="Ocorrências fora do escopo" value={dashboardData.totalForaEscopo} status="warning" />
				<StatTile icon={<DollarSign />} label="Valor total das inconsistências" value={formatCurrency(dashboardData.volumeFinanceiro)} />
			</div>
		</div>
	)
}

function CobrancasSection({
	filteredData,
	groupedData,
	activeRacFilter,
}: {
	filteredData: ProcessedRow[]
	groupedData: Record<string, UgMesGroup>
	activeRacFilter: string
}) {
	return (
		<div className="space-y-6 mb-8">
			{activeRacFilter !== "TODOS" && <ConsolidatedMessageCard rows={filteredData} activeRacFilter={activeRacFilter} />}
			<SectionHeader icon={<AlertTriangle />} title="Inconsistências por UG" className="mt-12" />
			{Object.values(groupedData).map((group) => (
				<UGCard key={`${group.ug}-${group.mes}`} group={group} type="INCONSISTENCIA" activeRacFilter={activeRacFilter} />
			))}
		</div>
	)
}

function ExcecoesSection({ excecoesData }: { excecoesData: ProcessedRow[] }) {
	return (
		<div className="space-y-6 mb-8">
			<SectionHeader icon={<CheckCircle2 />} title="Exceções do RAC" className="mt-12" />
			<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
				<div className="p-6">
					<p className="text-body text-muted-foreground mb-4">
						As ocorrências abaixo foram detectadas, mas estão previstas nas exceções do RAC. Nenhuma cobrança será gerada.
					</p>
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-border">
							<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
								<tr>
									{["UG", "Conta", "Descrição", "Saldo", "Fundamento da exceção"].map((h) => (
										<th key={h} className="px-4 py-3 text-left">
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{excecoesData.map((c, i) => (
									<tr key={i} className="hover:bg-muted/50">
										<td className="px-3 py-2 whitespace-nowrap text-subheading text-foreground">{c.ug}</td>
										<td className="px-3 py-2 whitespace-nowrap text-body font-mono text-foreground">{c.conta}</td>
										<td className="px-3 py-2 text-body text-muted-foreground">{c.descricao}</td>
										<td className="px-3 py-2 whitespace-nowrap text-subheading text-right text-foreground">{formatCurrency(c.saldo)}</td>
										<td className="px-3 py-2 text-body text-muted-foreground italic">{c.observacao || "Exceção expressamente prevista no RAC"}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	)
}

function ForaEscopoSection({ groupedData, activeRacFilter }: { groupedData: Record<string, UgMesGroup>; activeRacFilter: string }) {
	return (
		<div className="space-y-6 mb-8">
			<SectionHeader icon={<AlertCircle />} title="Contas fora do escopo do RAC" className="mt-12" />
			<Alert variant="warning">
				<AlertTriangle />
				<AlertTitle>Possível inconsistência contábil — conta não parametrizada no RAC</AlertTitle>
				<AlertDescription>As contas abaixo não foram encontradas na matriz normativa e requerem revisão manual pela equipe da SUCONT-3.</AlertDescription>
			</Alert>
			{Object.values(groupedData).map((group) => (
				<UGCard key={`fora-${group.ug}-${group.mes}`} group={group} type="FORA_ESCOPO" activeRacFilter={activeRacFilter} />
			))}
		</div>
	)
}

interface MonitoramentoOperacionalViewProps {
	data: ProcessedRow[]
	filteredData: ProcessedRow[]
	groupedData: Record<string, UgMesGroup>
	excecoesData: ProcessedRow[]
	outOfScopeData: ProcessedRow[]
	dashboardData: DashboardData | null
	activeTab: OperacionalTab
	setActiveTab: (value: OperacionalTab) => void
	activeRacFilter: string
}

/**
 * O trecho da visão operacional que vem depois dos painéis das outras visões.
 * Devolve um fragmento: os blocos continuam irmãos diretos do contêiner da página.
 */
export function MonitoramentoOperacionalView({
	data,
	filteredData,
	groupedData,
	excecoesData,
	outOfScopeData,
	dashboardData,
	activeTab,
	setActiveTab,
	activeRacFilter,
}: MonitoramentoOperacionalViewProps) {
	return (
		<>
			{dashboardData && <OperacionalOverview dashboardData={dashboardData} />}

			{data.length > 0 && (
				<div className="mb-8">
					<span className="text-label text-muted-foreground block mb-2">Filtrar visão</span>
					<SegmentedControl
						label="Filtrar visão"
						value={activeTab}
						onValueChange={setActiveTab}
						options={[
							{ value: "ALL", label: "Todas as ocorrências" },
							{ value: "COBRANCAS", label: "Cobranças (RAC)" },
							{ value: "EXCECOES", label: "Exceções (RAC)" },
							{ value: "FORA_ESCOPO", label: "Fora do escopo" },
						]}
					/>
				</div>
			)}

			{isTabVisible(activeTab, "COBRANCAS") && dashboardData && dashboardData.totalCobrancas > 0 && (
				<CobrancasSection filteredData={filteredData} groupedData={groupedData} activeRacFilter={activeRacFilter} />
			)}

			{isTabVisible(activeTab, "EXCECOES") && excecoesData.length > 0 && <ExcecoesSection excecoesData={excecoesData} />}

			{isTabVisible(activeTab, "FORA_ESCOPO") && outOfScopeData.length > 0 && <ForaEscopoSection groupedData={groupedData} activeRacFilter={activeRacFilter} />}

			{data.length > 0 && dashboardData?.totalCobrancas === 0 && outOfScopeData.length === 0 && (
				<Alert variant="success">
					<CheckCircle2 />
					<AlertTitle>Nenhuma cobrança necessária</AlertTitle>
					<AlertDescription>Todas as ocorrências processadas são exceções previstas na matriz normativa.</AlertDescription>
				</Alert>
			)}
		</>
	)
}
