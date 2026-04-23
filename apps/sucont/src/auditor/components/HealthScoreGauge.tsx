interface HealthScoreGaugeProps {
	score: number
	isDarkMode: boolean
}

export const HealthScoreGauge: React.FC<HealthScoreGaugeProps> = ({ score, isDarkMode }) => {
	const normalizedScore = Math.min(100, Math.max(0, score))

	const size = 160
	const strokeWidth = 18
	const radius = (size - strokeWidth) / 2 - 5
	const centerX = size / 2
	const centerY = size / 2 + 20

	const circumference = Math.PI * radius
	const offset = circumference - (normalizedScore / 100) * circumference

	const getStatusText = (val: number) => {
		if (val >= 98) return "Excelência Máxima"
		if (val >= 90) return "Nível Excelente"
		if (val >= 80) return "Nível Operacional"
		if (val >= 70) return "Divergência Moderada"
		return "Necessita Saneamento"
	}

	const getStatusColor = (val: number) => {
		if (val >= 98) return "#10b981"
		if (val >= 90) return "#22c55e"
		if (val >= 80) return "#f59e0b"
		if (val >= 70) return "#f97316"
		return "#ef4444"
	}

	return (
		<div className="w-full h-[100px] relative flex flex-col items-center justify-center overflow-hidden">
			<svg width="100%" height="100%" viewBox={`0 0 ${size} ${size - 40}`} aria-labelledby="health-score-title">
				<title id="health-score-title">Indicador de saúde ICC: {normalizedScore.toFixed(1)}%</title>
				<defs>
					<linearGradient id="iccGradient" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor="#ef4444" />
						<stop offset="50%" stopColor="#f59e0b" />
						<stop offset="100%" stopColor="#10b981" />
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
					stroke={isDarkMode ? "#1e293b" : "#e2e8f0"}
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
					<span className="text-xl font-black font-mono tracking-tighter drop-shadow-sm" style={{ color: getStatusColor(score) }}>
						{score.toFixed(1)}%
					</span>
					<div className={`h-px w-8 my-0.5 ${isDarkMode ? "bg-slate-700" : "bg-slate-200"}`} />
					<span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest text-center px-2">{getStatusText(score)}</span>
				</div>
			</div>
		</div>
	)
}
