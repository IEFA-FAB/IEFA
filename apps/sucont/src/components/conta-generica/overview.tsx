// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): seletor de
// visão, números do topo do resultado e aviso de relatório sem inconsistência.
import { Building2, CheckCircle, DollarSign, FileSpreadsheet, Landmark, Target, Wallet } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { StatTile } from "#/components/ui/stat-tile"
import { formatCurrency } from "#/lib/analista/types"

export type PanelView = "operacional" | "tatica" | "estrategica"

export function PanelViewControl({ activeView, onActiveViewChange }: { activeView: PanelView; onActiveViewChange: (view: PanelView) => void }) {
	return (
		<SegmentedControl
			label="Visão do painel"
			size="lg"
			value={activeView}
			onValueChange={onActiveViewChange}
			options={[
				{
					value: "estrategica",
					label: (
						<>
							<Landmark /> Estratégica
						</>
					),
				},
				{
					value: "tatica",
					label: (
						<>
							<Target /> Tática
						</>
					),
				},
				{
					value: "operacional",
					label: (
						<>
							<FileSpreadsheet /> Operacional
						</>
					),
				},
			]}
		/>
	)
}

export function SummaryTiles({ totalUGs, totalContas, totalSaldoGeral }: { totalUGs: number; totalContas: number; totalSaldoGeral: number }) {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
			<StatTile icon={<Building2 />} label="Unidades Gestoras" value={totalUGs} hint="com inconsistência" />
			<StatTile icon={<Wallet />} label="Contas genéricas" value={totalContas} hint="auditadas" />
			<StatTile icon={<DollarSign />} label="Volume financeiro" value={formatCurrency(totalSaldoGeral)} status="success" />
		</div>
	)
}

export function RiskStatTiles({
	totalInconsistencias,
	totalSaldoGeral,
	totalUGs,
}: {
	totalInconsistencias: number
	totalSaldoGeral: number
	totalUGs: number
}) {
	return (
		<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
			<StatTile label="Total de inconsistências" value={totalInconsistencias} />
			<StatTile label="Volume financeiro em risco" value={formatCurrency(totalSaldoGeral)} status="destructive" />
			<StatTile label="UGs com inconsistências" value={totalUGs} status="warning" />
			<StatTile label="Média de inconsistências / UG" value={(totalInconsistencias / (totalUGs || 1)).toFixed(1)} status="action" />
		</div>
	)
}

/**
 * Quantas linhas com saldo ficaram fora por a conta não ser genérica. Sem o aviso, um
 * relatório extraído com filtro diferente perderia linhas em silêncio.
 */
export function SkippedAccountsNote({ count }: { count: number }) {
	if (count === 0) return null
	const lines = count === 1 ? "1 linha com saldo em conta não genérica ficou" : `${count} linhas com saldo em contas não genéricas ficaram`
	return <p className="text-caption text-muted-foreground">{lines} fora da análise (só entram contas com final 99).</p>
}

export function NoInconsistencyAlert() {
	return (
		<Alert variant="success">
			<CheckCircle />
			<AlertTitle>Acompanhamento concluído</AlertTitle>
			<AlertDescription>Nenhuma inconsistência foi identificada no relatório analisado. A situação contábil está regular.</AlertDescription>
		</Alert>
	)
}
