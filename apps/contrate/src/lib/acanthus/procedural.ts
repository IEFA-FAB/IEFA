/**
 * Cena da folha procedural: a nuvem de `geometry.ts` sombreada pela rampa de
 * luminância, com o tom dado pela profundidade (o que está longe esmaece).
 */

import { type AcanthusGeometry, buildAcanthus } from "./geometry"
import { carveOcclusionEdges, createRaster, LUMINANCE_RAMP, type Raster, rampIndex, rasterize } from "./raster"
import { type AsciiScene, TONES } from "./scene"

/** Salto de profundidade (unidades do modelo) que conta como borda entre lobos. */
const OCCLUSION_GAP = 0.06
/** Faixa de profundidade do tom, como fração do raio: a folha raramente ocupa a profundidade toda. */
const TONE_DEPTH_SPAN = 0.7

// A geometria é imutável e igual para todas as instâncias: construída uma vez.
let shared: AcanthusGeometry | null = null

/** Altura da célula em px CSS: ~110 linhas na caixa, entre 7 e 9 px. */
export function cellHeightFor(boxHeight: number): number {
	return Math.min(9, Math.max(7, boxHeight / 110))
}

function sharedGeometry(): AcanthusGeometry {
	shared ??= buildAcanthus()
	return shared
}

export function createProceduralScene(geometry: AcanthusGeometry = sharedGeometry()): AsciiScene {
	let raster: Raster = createRaster(0, 0)
	return {
		alphabet: LUMINANCE_RAMP,
		bounds: geometry,
		pitch: 0.16,
		startYaw: -0.35,
		// Três quartos, com a ponta enrolada de lado.
		staticYaw: -0.62,
		cellHeight: cellHeightFor,
		resize(cols, rows) {
			raster = createRaster(cols, rows)
		},
		render(view, glyph, tone) {
			const covered = rasterize(geometry, raster, view)
			carveOcclusionEdges(raster, OCCLUSION_GAP)
			const { lum, depth } = raster
			// 1/z vai de 1/(d+r) (fundo) a 1/(d-r) (frente).
			const nearInv = 1 / (view.distance - geometry.radius * TONE_DEPTH_SPAN)
			const farInv = 1 / (view.distance + geometry.radius * TONE_DEPTH_SPAN)
			const toneScale = TONES / (nearInv - farInv)
			for (let i = 0; i < glyph.length; i++) {
				const l = lum[i] as number
				if (l < 0) {
					glyph[i] = 0
					continue
				}
				glyph[i] = rampIndex(l, LUMINANCE_RAMP.length)
				let t = (((depth[i] as number) - farInv) * toneScale) | 0
				if (t < 0) t = 0
				else if (t >= TONES) t = TONES - 1
				tone[i] = t
			}
			return covered
		},
	}
}
