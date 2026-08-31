/**
 * Harness visual do módulo auditor — NÃO faz parte do app.
 *
 * Existe porque typecheck, build e testes não enxergam um gráfico pintado na cor
 * errada, e `/auditor` exige sessão, grant nível 1 e uma planilha carregada. Aqui
 * os componentes reais recebem a fixture real, pelo pipeline real, com a folha de
 * estilo real — o que muda é só a origem dos dados e a ausência de auth.
 */
import { AlertTriangle, Database, Layers, LayoutDashboard } from "lucide-react"
import { createRoot } from "react-dom/client"
import { ComparisonChart, EvolutionChart } from "#/auditor/components/Charts"
import { ChartWrapper } from "#/auditor/components/ChartWrapper"
import { HealthScoreGauge } from "#/auditor/components/HealthScoreGauge"
import { RankingList } from "#/auditor/components/RankingList"
import { StatCard } from "#/auditor/components/StatCard"
import { TemporalHeatmap } from "#/auditor/components/TemporalHeatmap"
import { applyRiskClassification, normalizeData, recalculateDeltas } from "#/auditor/services/dataProcessor"
import { iccColor, iccLabel } from "#/auditor/theme"
import type { RawInputRow } from "#/auditor/types"
import "./harness.css"

const UGS = [
	{ cod: "120001", ug: "BASE AEREA DE SANTOS" },
	{ cod: "120002", ug: "BASE AEREA DE ANAPOLIS" },
	{ cod: "120003", ug: "GRUPAMENTO DE APOIO DE BRASILIA" },
	{ cod: "120004", ug: "PARQUE DE MATERIAL AERONAUTICO" },
	{ cod: "120005", ug: "HOSPITAL DE FORCA AEREA" },
]
const MONTHS = ["JANEIRO/2025", "FEVEREIRO/2025", "MARÇO/2025", "ABRIL/2025", "MAIO/2025", "JUNHO/2025"]
const GROUPS = ["CONSUMO", "BMP", "INTANGIVEL"] as const

// Série determinística: o harness precisa render igual a cada execução para que
// duas capturas sejam comparáveis.
let seed = 42
function rnd() {
	seed = (seed * 1103515245 + 12345) % 2147483648
	return seed / 2147483648
}

// A linha crua é "wide": os três grupos de conta vivem na MESMA linha, com
// prefixo g1/g2/g3 — é o formato que sai do Tesouro Gerencial.
const rows: RawInputRow[] = []
for (const [mi, data] of MONTHS.entries()) {
	for (const { cod, ug } of UGS) {
		const grp = (i: number) => {
			const siafi = 500_000 + rnd() * 4_000_000
			const drift = (rnd() - 0.35) * 900_000 * (1 + mi * 2.5)
			return { name: GROUPS[i], siafi, siloms: siafi + drift, diff: -drift }
		}
		const [a, b, c] = [grp(0), grp(1), grp(2)]
		rows.push({
			data,
			cod,
			ug,
			g1_name: a.name,
			g1_siafi: a.siafi,
			g1_siloms: a.siloms,
			g1_diff: a.diff,
			g2_name: b.name,
			g2_siafi: b.siafi,
			g2_siloms: b.siloms,
			g2_diff: b.diff,
			g3_name: c.name,
			g3_siafi: c.siafi,
			g3_siloms: c.siloms,
			g3_diff: c.diff,
		})
	}
}

const data = applyRiskClassification(recalculateDeltas(normalizeData(rows), "MENSAL"))
const months = [...new Set(data.map((d) => d.date))]
const latest = months[months.length - 1]
const totalDiff = data.filter((d) => d.date === latest).reduce((a, c) => a + Math.abs(c.difference), 0)
const icc = 87.4

function Panel({ title, children, tall = false }: { title: string; children: React.ReactNode; tall?: boolean }) {
	return (
		<section className="mb-10" data-panel={title}>
			<h2 className="text-heading text-foreground mb-3">{title}</h2>
			<div className={tall ? "h-[520px]" : ""}>{children}</div>
		</section>
	)
}

function Harness({ dark }: { dark: boolean }) {
	return (
		<div className={`${dark ? "dark" : ""} min-h-screen bg-background text-foreground p-8`} data-theme={dark ? "dark" : "light"}>
			<h1 className="text-display mb-8">Auditor — {dark ? "tema escuro" : "tema claro"}</h1>

			<Panel title="StatCard">
				<div className="grid grid-cols-4 gap-4">
					<StatCard
						title="Divergência Total"
						value={totalDiff}
						subtitle="Diferença Absoluta"
						icon={AlertTriangle}
						bgClass="bg-destructive"
						trendData={[3, 5, 4, 8, 6, 9]}
						variation="12,4% vs período anterior"
						isPositive={false}
					/>
					<StatCard
						title="Saldo SIAFI"
						value={9_120_334}
						subtitle="Contábil"
						icon={LayoutDashboard}
						bgClass="bg-surface-inverted"
						trendData={[5, 5, 6, 6, 7, 8]}
						variation="3,1% vs período anterior"
					/>
					<StatCard
						title="Maior Divergência"
						value="BASE AEREA DE SANTOS"
						subtitle="R$ 1.204.330,10"
						icon={Database}
						bgClass=""
						iconColor={iccColor(icc)}
						variation={iccLabel(icc)}
						isPositive={icc >= 80}
					/>
					<StatCard title="Sem série" value={42} subtitle="sparkline ausente" icon={Layers} bgClass="bg-action" />
				</div>
			</Panel>

			<Panel title="HealthScoreGauge (rampa ICC, 5 faixas)">
				<div className="grid grid-cols-5 gap-4 bg-card border border-border rounded-lg p-4">
					{[99, 93, 84, 74, 55].map((v) => (
						<HealthScoreGauge key={v} score={v} />
					))}
				</div>
			</Panel>

			<Panel title="ComparisonChart (séries SIAFI x SILOMS)" tall>
				<ChartWrapper
					title="Comparativo"
					allData={data}
					availableMonths={months}
					availableUGs={UGS.map((u) => u.ug)}
					defaultMonth={latest}
					hierarchyLevel="UG"
					hierarchyFilter={["TODOS"]}
					className="h-[500px]"
				>
					{(scoped) => <ComparisonChart data={scoped} selectedMonth={latest} hierarchyLevel="UG" hierarchyFilter={["TODOS"]} />}
				</ChartWrapper>
			</Panel>

			<Panel title="EvolutionChart" tall>
				<ChartWrapper
					title="Evolução"
					allData={data}
					availableMonths={months}
					availableUGs={UGS.map((u) => u.ug)}
					hideMonthFilter
					hierarchyLevel="UG"
					hierarchyFilter={["TODOS"]}
					className="h-[500px]"
				>
					{(scoped) => <EvolutionChart data={scoped} selectedMonth={latest} timeFilter="MENSAL" />}
				</ChartWrapper>
			</Panel>

			<Panel title="TemporalHeatmap (rampa por célula, no CSS)">
				<TemporalHeatmap data={data} availableMonths={months} onSendMessage={() => {}} />
			</Panel>

			<Panel title="RankingList">
				<RankingList data={data.filter((d) => d.date === latest)} historicalData={data} comparisonLabel="vs mês anterior" onSendMessage={() => {}} />
			</Panel>
		</div>
	)
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<>
		<Harness dark={false} />
		<Harness dark />
	</>
)
