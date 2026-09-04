import type { LucideIcon } from "lucide-react"
import { formatCompactNumber } from "../services/dataProcessor"
import { Sparkline } from "./Sparkline"

interface StatCardProps {
	title: string
	value: number | string
	subtitle?: string
	icon: LucideIcon
	/** Classe de fundo do ícone. Ignorada quando `iconColor` é informado. */
	bgClass: string
	/**
	 * Cor literal do ícone, para quando o valor vem de uma rampa sequencial
	 * (ICC, risco) que não cabe nos tokens de estado.
	 */
	iconColor?: string
	/**
	 * Série da sparkline. Sem ela o card NÃO desenha tendência — antes havia um
	 * default `[10, 20, 15, 25, 20, 30]` que pintava uma curva inventada num painel
	 * de conciliação contábil.
	 */
	trendData?: number[]
	variation?: string
	isPositive?: boolean
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon: Icon, bgClass, iconColor, trendData, variation, isPositive = true }) => {
	const trendColor = isPositive ? "var(--success)" : "var(--destructive)"

	return (
		<div
			className={`rounded-lg shadow-lg border p-4 flex flex-col justify-between transition-all group overflow-hidden relative h-[140px]
      bg-card border-border hover:bg-muted/50
    `}
		>
			{trendData && trendData.length > 0 && (
				<div className="absolute bottom-2 left-4 right-4 h-8 opacity-40 pointer-events-none">
					<Sparkline data={trendData} color={trendColor} />
				</div>
			)}

			<div className="flex justify-between items-start relative z-10">
				<div className="flex-1">
					<p className={`text-label mb-0.5 text-muted-foreground`}>{title}</p>
					<div className="flex flex-col">
						{typeof value === "number" ? (
							<h3 className={`text-heading leading-tight text-foreground`}>R$ {formatCompactNumber(value)}</h3>
						) : (
							<h3 className={`text-heading leading-tight text-foreground`}>{value}</h3>
						)}

						{subtitle && (
							<p
								className={`text-label mt-0.5
                text-muted-foreground
              `}
							>
								{subtitle}
							</p>
						)}
					</div>
				</div>

				<div
					style={iconColor ? { backgroundColor: iconColor } : undefined}
					className={`w-10 h-10 rounded-lg ${iconColor ? "" : bgClass} shadow-lg shadow-black/20 flex items-center justify-center flex-shrink-0 ml-2`}
				>
					<Icon className="w-5 h-5 text-white" />
				</div>
			</div>

			<div className="flex justify-end items-end relative z-10 mt-auto">
				<span className={`text-hint ${isPositive ? "text-success" : "text-destructive"}`}>{variation}</span>
			</div>
		</div>
	)
}
