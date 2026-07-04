import { useEffect, useRef, useState } from "react"
import { constants, drawPath, stateCode } from "./constants"

export interface BrazilMapProps {
	/** Estado destacado (nome, ex.: "Rio de Janeiro"). */
	selected?: string | null
	size?: number
	mapColor?: string
	strokeColor?: string
	strokeWidth?: number
	selectColor?: string
	className?: string
}

/**
 * Mapa do Brasil (SVG) — apresentacional, read-only.
 *
 * Reescrita declarativa do fork imperativo do @react-map/brazil: o fill de cada
 * UF é derivado de `selected`, sem `document.getElementById` nem mutação de
 * `path.style.fill`. O único uso de ref é medir o viewBox via getBBox no
 * cliente (layout, não pintura).
 */
export function BrazilMap({
	selected = null,
	size = constants.WIDTH,
	mapColor = constants.MAPCOLOR,
	strokeColor = constants.STROKE_COLOR,
	strokeWidth = constants.STROKE_WIDTH,
	selectColor = constants.SELECTED_COLOR,
	className,
}: BrazilMapProps) {
	const svgRef = useRef<SVGSVGElement>(null)
	const [viewBox, setViewBox] = useState("0 0 600 600")

	// Mede a bounding box real dos paths para enquadrar o mapa (só no cliente).
	useEffect(() => {
		const svg = svgRef.current
		if (!svg) return
		const bbox = svg.getBBox()
		if (bbox.width && bbox.height) {
			setViewBox(`${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)
		}
	}, [])

	return (
		<svg ref={svgRef} className={className} role="img" aria-label="Mapa do Brasil" width={size} viewBox={viewBox} style={{ stroke: strokeColor, strokeWidth }}>
			{stateCode.map((code) => (
				<path
					key={code}
					d={drawPath[code as keyof typeof drawPath]}
					fill={selected === code ? selectColor : mapColor}
					style={{ transition: "fill 150ms ease-out" }}
				/>
			))}
		</svg>
	)
}
