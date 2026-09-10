import { useMemo } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { chartChrome, chartSeries } from "#/auditor/theme"
import { AccountGroup, type FinancialRecord } from "#/auditor/types"
import { formatCompactNumber, formatCurrency } from "../services/dataProcessor"

interface CompositionDonutsProps {
	data: FinancialRecord[]
}

/** Fatia com rótulo, valor e cor já resolvida em token. */
interface Slice {
	name: string
	value: number
	color: string
}

const tooltipStyle = {
	backgroundColor: chartChrome.surface,
	borderColor: chartChrome.grid,
	color: chartChrome.label,
	borderRadius: "0.5rem",
	fontSize: "0.75rem",
}

function Donut({ slices, center, caption }: { slices: Slice[]; center: React.ReactNode; caption: string }) {
	const total = slices.reduce((acc, s) => acc + s.value, 0)

	return (
		<div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-4">
			<h4 className="text-label text-muted-foreground">{caption}</h4>
			<div className="relative min-h-0 flex-1">
				{total > 0 ? (
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie data={slices} cx="50%" cy="50%" innerRadius="66%" outerRadius="82%" paddingAngle={4} dataKey="value" stroke="none" isAnimationActive={false}>
								{slices.map((slice) => (
									<Cell key={slice.name} fill={slice.color} />
								))}
							</Pie>
							{/* O formatter do recharts entrega `ValueType | undefined`; a fatia é sempre numérica, mas o contrato não sabe disso. */}
							<Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} contentStyle={tooltipStyle} />
						</PieChart>
					</ResponsiveContainer>
				) : (
					// Donut de total zero desenha um anel vazio que se lê como "sem dado
					// carregado". Aqui o zero é resultado, e a tela precisa dizer qual dos dois é.
					<div className="flex h-full items-center justify-center text-center">
						<p className="text-body text-muted-foreground">Nenhuma divergência na competência — nada a compor.</p>
					</div>
				)}

				{total > 0 && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">{center}</div>}
			</div>

			<div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
				{slices.map((slice) => (
					<div key={slice.name} className="flex items-center gap-1.5">
						<span className="size-2 rounded-full" style={{ backgroundColor: slice.color }} />
						<span className="text-label text-muted-foreground">{slice.name}</span>
					</div>
				))}
			</div>
		</div>
	)
}

/**
 * Composição da competência em dois anéis.
 *
 * **Conciliado × divergente** e **divergência por natureza de bem**. Os dois são
 * parte-de-um-todo de verdade, que é o que uma rosca representa.
 *
 * O primeiro anel da versão de origem era "COMPOSIÇÃO SIAFI × SILOMS (%)", com as
 * duas fatias somando o saldo dos dois sistemas. SIAFI e SILOMS são duas MEDIDAS
 * do mesmo patrimônio, não duas partes dele: somá-los produz um denominador que
 * não existe, e o "51% / 49%" resultante move-se com o tamanho da base em vez de
 * medir conciliação. A leitura que aquele anel tentava dar é a do ICC, que o app
 * já calcula — então é ela que está aqui, sobre a base do SIAFI.
 */
export function CompositionDonuts({ data }: CompositionDonutsProps) {
	const stats = useMemo(() => {
		let siafi = 0
		let difference = 0
		const byGroup: Record<string, number> = { [AccountGroup.BMP]: 0, [AccountGroup.CONSUMO]: 0, [AccountGroup.INTANGIVEL]: 0 }

		for (const record of data) {
			siafi += record.siafiValue
			difference += Math.abs(record.difference)
			byGroup[record.group] = (byGroup[record.group] ?? 0) + Math.abs(record.difference)
		}

		// A divergência pode passar do saldo SIAFI (registro só no SILOMS). Sem o
		// piso em zero a fatia "conciliado" ficaria negativa e o recharts a desenharia
		// como um arco ao contrário.
		const conciliated = Math.max(0, siafi - difference)
		const base = conciliated + difference

		return {
			conciliation: [
				{ name: "Conciliado", value: conciliated, color: chartSeries.icc },
				{ name: "Divergente", value: difference, color: chartSeries.diff },
			] satisfies Slice[],
			groups: [
				{ name: "BMP", value: byGroup[AccountGroup.BMP], color: chartSeries.bmp },
				{ name: "Consumo", value: byGroup[AccountGroup.CONSUMO], color: chartSeries.consumo },
				{ name: "Intangível", value: byGroup[AccountGroup.INTANGIVEL], color: chartSeries.intangivel },
			] satisfies Slice[],
			difference,
			conciliatedPct: base > 0 ? (conciliated / base) * 100 : 0,
		}
	}, [data])

	return (
		<div className="flex h-full flex-col gap-4">
			<Donut
				caption="Conciliado × divergente (base SIAFI)"
				slices={stats.conciliation}
				center={
					<>
						<span className="text-display text-foreground">{stats.conciliatedPct.toFixed(1)}%</span>
						<span className="text-label text-muted-foreground">Conciliado</span>
					</>
				}
			/>
			<Donut
				caption="Divergência por natureza de bem"
				slices={stats.groups}
				center={
					// Compacto, e não o valor por extenso: o furo do anel tem a largura do
					// raio interno, e "R$ 42.631.936,01" sai por baixo do arco. O valor
					// exato continua na dica de cada fatia.
					<>
						<span className="text-heading text-foreground">R$ {formatCompactNumber(stats.difference)}</span>
						<span className="text-label text-muted-foreground">Total</span>
					</>
				}
			/>
		</div>
	)
}
