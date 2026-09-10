import { useId } from "react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

interface SparklineProps {
	data: number[]
	color: string
}

export const Sparkline: React.FC<SparklineProps> = ({ data, color }) => {
	const chartData = data.map((val, i) => ({ value: val, index: i }))

	/**
	 * O id do gradiente vem do `useId`, e NÃO da cor.
	 *
	 * `gradient-${color}` gerava `gradient-var(--success)`, e a referência saía
	 * `url(#gradient-var(--success))`: os parênteses fecham o `url(` antes da
	 * hora, o navegador descarta a referência e o `fill` cai para o preto padrão
	 * — era a faixa cinza que aparecia atrás do texto de variação nos cards, e
	 * não um gradiente. Pela cor os ids ainda colidiam entre cards com a mesma
	 * variação, que é o segundo motivo para não usá-la.
	 *
	 * O `useId` do React 19 devolve `«r0»`; os delimitadores são removidos porque
	 * caractere não-ASCII em fragmento de URL não é referência confiável.
	 */
	const gradientId = `sparkline-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`

	return (
		<div className="w-full h-10 mt-2">
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={chartData}>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor={color} stopOpacity={0.3} />
							<stop offset="95%" stopColor={color} stopOpacity={0} />
						</linearGradient>
					</defs>
					<Area
						type="monotone"
						dataKey="value"
						stroke={color}
						strokeWidth={2}
						fillOpacity={1}
						fill={`url(#${gradientId})`}
						dot={false}
						isAnimationActive={false}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	)
}
