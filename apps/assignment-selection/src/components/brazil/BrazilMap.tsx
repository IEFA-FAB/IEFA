import { useEffect, useId, useMemo, useRef, useState } from "react"
import { constants, drawPath, stateCode } from "./constants"

export interface StateMarker {
	estado: string
	people: { id: number; classificacao: number; nome: string; om: string | null }[]
}

export interface BrazilMapProps {
	/** Estado destacado (nome, ex.: "Rio de Janeiro"). */
	selected?: string | null
	/** Militares já confirmados, agrupados por estado. */
	markers?: StateMarker[]
	size?: number
	mapColor?: string
	strokeColor?: string
	strokeWidth?: number
	selectColor?: string
	className?: string
}

// Nº máximo de rostos empilhados por estado antes do "+N".
const MAX_AVATARS = 3
// Raio do avatar em unidades do SVG (viewBox ~600 de largura).
const AVATAR_R = 18

// Margem extra no viewBox (unidades SVG) — cria "oceano" para acomodar os
// clusters dos estados costeiros/pequenos sem recortar.
const PAD = { l: 12, t: 16, r: 82, b: 28 }

// Deslocamentos manuais das âncoras de estados pequenos/aglomerados do sudeste,
// para os rostos e badges não colidirem (o centroide da bbox fica apertado ali).
const CENTROID_OFFSETS: Record<string, { dx: number; dy: number }> = {
	Goiás: { dx: -34, dy: -22 },
	"Distrito Federal": { dx: 16, dy: -42 },
	"Minas Gerais": { dx: 6, dy: 30 },
	"Espírito Santo": { dx: 50, dy: 2 },
}

/**
 * Mapa do Brasil (SVG) — apresentacional. O fill de cada UF deriva de `selected`;
 * sobre cada estado escolhido, empilha os rostos dos militares confirmados
 * (`markers`) com um badge da OM. Novos rostos entram com um "pop" sutil (o <g>
 * do avatar é montado só quando a pessoa confirma, disparando a animação CSS).
 * Sem manipulação imperativa de DOM: o único uso de ref é medir os centroides
 * das UFs via getBBox no cliente.
 */
export function BrazilMap({
	selected = null,
	markers = [],
	size = constants.WIDTH,
	mapColor = constants.MAPCOLOR,
	strokeColor = constants.STROKE_COLOR,
	strokeWidth = constants.STROKE_WIDTH,
	selectColor = constants.SELECTED_COLOR,
	className,
}: BrazilMapProps) {
	const instanceId = useId().replace(/:/g, "")
	const svgRef = useRef<SVGSVGElement>(null)
	const pathRefs = useRef<Record<string, SVGPathElement | null>>({})
	const [viewBox, setViewBox] = useState("0 0 600 600")
	const [centroids, setCentroids] = useState<Record<string, { cx: number; cy: number }>>({})

	useEffect(() => {
		const svg = svgRef.current
		if (!svg) return
		const bbox = svg.getBBox()
		if (bbox.width && bbox.height) {
			setViewBox(`${bbox.x - PAD.l} ${bbox.y - PAD.t} ${bbox.width + PAD.l + PAD.r} ${bbox.height + PAD.t + PAD.b}`)
		}

		const next: Record<string, { cx: number; cy: number }> = {}
		for (const code of stateCode) {
			const el = pathRefs.current[code]
			if (!el) continue
			const b = el.getBBox()
			const off = CENTROID_OFFSETS[code]
			next[code] = { cx: b.x + b.width / 2 + (off?.dx ?? 0), cy: b.y + b.height / 2 + (off?.dy ?? 0) }
		}
		setCentroids(next)
	}, [])

	const activeMarkers = useMemo(() => markers.filter((m) => m.people.length > 0 && centroids[m.estado]), [markers, centroids])

	return (
		<svg ref={svgRef} className={className} role="img" aria-label="Mapa do Brasil" width={size} viewBox={viewBox} style={{ stroke: strokeColor, strokeWidth }}>
			<title>Escolha de vagas por estado</title>
			{stateCode.map((code) => (
				<path
					key={code}
					ref={(el) => {
						pathRefs.current[code] = el
					}}
					d={drawPath[code as keyof typeof drawPath]}
					fill={selected === code ? selectColor : mapColor}
					style={{ transition: "fill 150ms ease-out" }}
				/>
			))}

			{activeMarkers.map(({ estado, people }) => {
				const c = centroids[estado]
				const shown = people.slice(0, MAX_AVATARS)
				const extra = people.length - shown.length
				const step = AVATAR_R * 0.95
				const slots = shown.length + (extra > 0 ? 1 : 0)
				const totalW = 2 * AVATAR_R + (slots - 1) * step
				const startX = c.cx - totalW / 2 + AVATAR_R

				const oms = Array.from(new Set(people.map((p) => p.om).filter((o): o is string => !!o)))
				const badge = oms.length === 1 ? oms[0] : `${oms.length} unidades`
				const badgeW = badge.length * 7.3 + 12
				const badgeY = c.cy + AVATAR_R + 4

				return (
					<g key={estado} style={{ pointerEvents: "none" }}>
						{shown.map((p, i) => {
							const x = startX + i * step
							const y = c.cy
							const clip = `av-${instanceId}-${p.id}`
							return (
								<g key={p.id} className="map-avatar-pop" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
									<clipPath id={clip}>
										<circle cx={x} cy={y} r={AVATAR_R} />
									</clipPath>
									<circle cx={x} cy={y} r={AVATAR_R + 1.6} fill="#0b1226" stroke="none" />
									<image
										href={`/pessoas/${p.classificacao}.jpg`}
										x={x - AVATAR_R}
										y={y - AVATAR_R}
										width={AVATAR_R * 2}
										height={AVATAR_R * 2}
										clipPath={`url(#${clip})`}
										preserveAspectRatio="xMidYMid slice"
									/>
									<circle cx={x} cy={y} r={AVATAR_R} fill="none" stroke="#ffffff" strokeWidth={1.6} />
								</g>
							)
						})}
						{extra > 0 && (
							<g>
								<circle cx={startX + shown.length * step} cy={c.cy} r={AVATAR_R} fill="#1e293b" stroke="#ffffff" strokeWidth={1.6} />
								<text
									x={startX + shown.length * step}
									y={c.cy}
									fill="#ffffff"
									fontSize={AVATAR_R * 0.9}
									fontWeight={700}
									textAnchor="middle"
									dominantBaseline="central"
								>
									+{extra}
								</text>
							</g>
						)}
						<g>
							<rect x={c.cx - badgeW / 2} y={badgeY} width={badgeW} height={17} rx={8.5} fill="#0b1226" opacity={0.92} />
							<text
								x={c.cx}
								y={badgeY + 8.8}
								fill="#ffffff"
								fontSize={11}
								fontWeight={600}
								textAnchor="middle"
								dominantBaseline="central"
								style={{ stroke: "none" }}
							>
								{badge}
							</text>
						</g>
					</g>
				)
			})}
		</svg>
	)
}
