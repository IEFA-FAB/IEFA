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

// Máximo de rostos por linha antes de quebrar para uma nova linha (mostra todos).
const MAX_PER_ROW = 6
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
	"Minas Gerais": { dx: 18, dy: -12 },
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
		<svg
			ref={svgRef}
			className={className}
			role="img"
			aria-label="Mapa do Brasil"
			viewBox={viewBox}
			style={{ width: "100%", height: "100%", maxWidth: size, stroke: strokeColor, strokeWidth }}
		>
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
				const step = AVATAR_R * 0.82
				const rowStep = AVATAR_R * 1.8
				const nRows = Math.ceil(people.length / MAX_PER_ROW)
				const startY = c.cy - ((nRows - 1) * rowStep) / 2

				const oms = Array.from(new Set(people.map((p) => p.om).filter((o): o is string => !!o)))
				const badge = oms.length === 1 ? oms[0] : `${oms.length} unidades`
				const badgeW = badge.length * 7.3 + 12
				const badgeY = startY + (nRows - 1) * rowStep + AVATAR_R + 4

				return (
					<g key={estado} style={{ pointerEvents: "none" }}>
						{people.map((p, i) => {
							const r = Math.floor(i / MAX_PER_ROW)
							const rowLen = Math.min(MAX_PER_ROW, people.length - r * MAX_PER_ROW)
							const col = i % MAX_PER_ROW
							const rowW = 2 * AVATAR_R + (rowLen - 1) * step
							const x = c.cx - rowW / 2 + AVATAR_R + col * step
							const y = startY + r * rowStep
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
