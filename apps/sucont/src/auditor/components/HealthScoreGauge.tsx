import { chartChrome, ICC_RAMP, iccColor, iccLabel } from "../theme"

interface HealthScoreGaugeProps {
	score: number
}

export const HealthScoreGauge: React.FC<HealthScoreGaugeProps> = ({ score }) => {
	const normalizedScore = Math.min(100, Math.max(0, score))

	const size = 160
	const strokeWidth = 18
	const radius = (size - strokeWidth) / 2 - 5
	const centerX = size / 2
	const centerY = size / 2 + 20

	const circumference = Math.PI * radius
	const offset = circumference - (normalizedScore / 100) * circumference

	return (
		<div className="w-full h-[100px] relative flex flex-col items-center justify-center overflow-hidden">
			<svg width="100%" height="100%" viewBox={`0 0 ${size} ${size - 40}`} aria-labelledby="health-score-title">
				<title id="health-score-title">Indicador de saúde ICC: {normalizedScore.toFixed(1)}%</title>
				<defs>
					<linearGradient id="iccGradient" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor={ICC_RAMP[ICC_RAMP.length - 1].color} />
						<stop offset="50%" stopColor={ICC_RAMP[2].color} />
						<stop offset="100%" stopColor={ICC_RAMP[0].color} />
					</linearGradient>

					<filter id="arcShadow" x="-20%" y="-20%" width="140%" height="140%">
						<feGaussianBlur in="SourceAlpha" stdDeviation="2" />
						<feOffset dx="0" dy="2" result="offsetblur" />
						<feComponentTransfer>
							<feFuncA type="linear" slope="0.3" />
						</feComponentTransfer>
						<feMerge>
							<feMergeNode />
							<feMergeNode in="SourceGraphic" />
						</feMerge>
					</filter>
				</defs>

				<path
					d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
					fill="none"
					stroke={chartChrome.grid}
					strokeWidth={strokeWidth}
					strokeLinecap="butt"
				/>

				<path
					d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
					fill="none"
					stroke="url(#iccGradient)"
					strokeWidth={strokeWidth}
					strokeLinecap="butt"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					filter="url(#arcShadow)"
					className="transition-all duration-1000 ease-out"
				/>
			</svg>

			<div className="absolute inset-0 flex flex-col items-center justify-center pt-8">
				<div className="flex flex-col items-center">
					<span className="text-heading font-mono" style={{ color: iccColor(score) }}>
						{score.toFixed(1)}%
					</span>
					<div className="h-px w-8 my-0.5 bg-border" />
					{/* `.text-hint`, não `.text-label`: o rótulo cabe dentro do arco, e o
					    letter-spacing do label o fazia transbordar sobre o traçado. */}
					<span className="text-hint text-muted-foreground text-center px-2 leading-tight">{iccLabel(score)}</span>
				</div>
			</div>
		</div>
	)
}
