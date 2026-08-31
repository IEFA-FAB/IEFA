import type { LucideIcon } from "lucide-react"
import { formatCompactNumber } from "../services/dataProcessor"
import { Sparkline } from "./Sparkline"

interface StatCardProps {
	title: string
	value: number | string
	subtitle?: string
	icon: LucideIcon
	bgClass: string
	trendData?: number[]
	variation?: string
	isPositive?: boolean
}

export const StatCard: React.FC<StatCardProps> = ({
	title,
	value,
	subtitle,
	icon: Icon,
	bgClass,
	trendData = [10, 20, 15, 25, 20, 30],
	variation = "+2.1% nos últimos 90 dias",
	isPositive = true,
}) => {
	const trendColor = isPositive ? "#10b981" : "#ef4444"

	return (
		<div
			className={`backdrop-blur-md rounded-lg shadow-lg border p-4 flex flex-col justify-between transition-all group overflow-hidden relative h-[140px]
      bg-card border-border hover:bg-muted/50
    `}
		>
			<div className="absolute bottom-2 left-4 right-4 h-8 opacity-40 pointer-events-none">
				<Sparkline data={trendData} color={trendColor} />
			</div>

			<div className="flex justify-between items-start relative z-10">
				<div className="flex-1">
					<p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 text-muted-foreground`}>{title}</p>
					<div className="flex flex-col">
						{typeof value === "number" ? (
							<h3
								className={`text-xl font-black tracking-tight leading-tight
                text-foreground
              `}
							>
								R$ {formatCompactNumber(value)}
							</h3>
						) : (
							<h3
								className={`text-xl font-black tracking-tight leading-tight
                text-foreground
              `}
							>
								{value}
							</h3>
						)}

						{subtitle && (
							<p
								className={`text-[9px] font-bold uppercase tracking-tight mt-0.5
                text-muted-foreground
              `}
							>
								{subtitle}
							</p>
						)}
					</div>
				</div>

				<div className={`w-10 h-10 rounded-lg ${bgClass} shadow-lg shadow-black/20 flex items-center justify-center flex-shrink-0 ml-2`}>
					<Icon className="w-5 h-5 text-white" />
				</div>
			</div>

			<div className="flex justify-end items-end relative z-10 mt-auto">
				<span className={`text-[9px] font-black ${isPositive ? "text-success dark:text-success" : "text-destructive dark:text-destructive"}`}>{variation}</span>
			</div>
		</div>
	)
}
