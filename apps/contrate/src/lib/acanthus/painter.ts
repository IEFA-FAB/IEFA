/**
 * Pinta num <canvas> 2D a grade que uma `AsciiScene` produz.
 *
 * Os glifos são pré-renderizados UMA vez num atlas (alfabeto da cena × tons),
 * com célula de tamanho inteiro em pixels do dispositivo — cada quadro é só
 * `drawImage` de retângulos inteiros, sem layout de texto. E só se redesenha a
 * célula que mudou desde o quadro anterior: com a rotação lenta, a maior parte
 * da grade fica igual de um quadro para o outro.
 *
 * Nada aqui toca `window`/`document` na carga do módulo; o atlas nasce do
 * `ownerDocument` do canvas recebido.
 */

import { fitView, type View } from "./raster"
import { type AsciiScene, TONES } from "./scene"

/** Opacidade de cada tom: o mais apagado ainda lê, o mais forte é a cor cheia. */
const TONE_ALPHA = [0.5, 0.68, 0.85, 1] as const

export interface PainterStyle {
	/** Cor dos glifos (qualquer cor CSS que o canvas aceite). */
	color: string
	/** Família da fonte monoespaçada. */
	fontFamily: string
}

export interface PainterLayout {
	/** Tamanho da caixa em px CSS. */
	width: number
	height: number
	/** devicePixelRatio já limitado. */
	dpr: number
}

export interface AcanthusPainter {
	/** Reconfigura backing store, grade e atlas. Devolve falso se a caixa está vazia. */
	layout(next: PainterLayout): boolean
	setStyle(next: PainterStyle): void
	/** Desenha a folha no ângulo dado. Devolve quantas células ficaram cobertas. */
	render(yaw: number): number
	readonly cols: number
	readonly rows: number
}

/** Proporção da célula (largura / altura) — a de uma fonte mono comum. */
const CELL_ASPECT = 0.6

export function createAcanthusPainter(canvas: HTMLCanvasElement, scene: AsciiScene): AcanthusPainter | null {
	const ctx = canvas.getContext("2d", { alpha: true })
	if (!ctx) return null
	const atlas = canvas.ownerDocument.createElement("canvas")
	const atlasCtx = atlas.getContext("2d")
	if (!atlasCtx) return null
	const glyphCount = scene.alphabet.length
	// O código da célula (tom × alfabeto + glifo) cabe num byte.
	if (glyphCount * TONES > 255) return null

	let cols = 0
	let rows = 0
	let cellW = 0
	let cellH = 0
	let glyph = new Uint8Array(0)
	let tone = new Uint8Array(0)
	let shown = new Uint8Array(0)
	// Reaproveitado a cada quadro: o laço não aloca nada.
	const view: View = { yaw: 0, pitch: scene.pitch, cellW: 0, cellH: 0, ...fitView(scene.bounds, 0, 0) }
	let style: PainterStyle | null = null
	let dirty = true

	const buildAtlas = () => {
		if (!style || cellW === 0) return
		atlas.width = cellW * glyphCount
		atlas.height = cellH * TONES
		atlasCtx.clearRect(0, 0, atlas.width, atlas.height)
		atlasCtx.font = `500 ${Math.round(cellH * 0.95)}px ${style.fontFamily}`
		atlasCtx.textAlign = "center"
		atlasCtx.textBaseline = "middle"
		atlasCtx.fillStyle = style.color
		for (let t = 0; t < TONES; t++) {
			atlasCtx.globalAlpha = TONE_ALPHA[t] ?? 1
			for (let g = 1; g < glyphCount; g++) {
				atlasCtx.save()
				atlasCtx.beginPath()
				atlasCtx.rect(g * cellW, t * cellH, cellW, cellH)
				atlasCtx.clip()
				atlasCtx.fillText(scene.alphabet[g] ?? " ", g * cellW + cellW / 2, t * cellH + cellH / 2 + cellH * 0.04)
				atlasCtx.restore()
			}
		}
		atlasCtx.globalAlpha = 1
		dirty = true
	}

	return {
		get cols() {
			return cols
		},
		get rows() {
			return rows
		},
		layout({ width, height, dpr }) {
			if (!(width > 0 && height > 0)) return false
			cellH = Math.max(3, Math.round(scene.cellHeight(height) * dpr))
			cellW = Math.max(2, Math.round(cellH * CELL_ASPECT))
			canvas.width = Math.round(width * dpr)
			canvas.height = Math.round(height * dpr)
			cols = Math.floor(canvas.width / cellW)
			rows = Math.floor(canvas.height / cellH)
			glyph = new Uint8Array(cols * rows)
			tone = new Uint8Array(cols * rows)
			shown = new Uint8Array(cols * rows)
			scene.resize(cols, rows)
			Object.assign(view, fitView(scene.bounds, cols * cellW, rows * cellH), { cellW, cellH })
			buildAtlas()
			return cols > 0 && rows > 0
		},
		setStyle(next) {
			if (style && next.color === style.color && next.fontFamily === style.fontFamily) return
			style = next
			buildAtlas()
		},
		render(yaw) {
			if (!style || cols === 0 || rows === 0) return 0
			view.yaw = yaw
			const covered = scene.render(view, glyph, tone)

			if (dirty) {
				ctx.clearRect(0, 0, canvas.width, canvas.height)
				shown.fill(0)
				dirty = false
			}
			for (let row = 0, i = 0; row < rows; row++) {
				const y = row * cellH
				for (let col = 0; col < cols; col++, i++) {
					const g = glyph[i] as number
					const code = g === 0 ? 0 : (tone[i] as number) * glyphCount + g
					if (code === shown[i]) continue
					const x = col * cellW
					if (shown[i] !== 0) ctx.clearRect(x, y, cellW, cellH)
					if (code !== 0) ctx.drawImage(atlas, g * cellW, (tone[i] as number) * cellH, cellW, cellH, x, y, cellW, cellH)
					shown[i] = code
				}
			}
			return covered
		},
	}
}
