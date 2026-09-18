/**
 * Contrato entre uma folha (a procedural ou a do mantenedor) e o pintor.
 *
 * A cena sabe transformar um ângulo em grade: para cada célula, QUAL glifo do
 * seu alfabeto (0 = vazio) e em que tom (0..TONES-1, do mais apagado ao mais
 * forte). O pintor não sabe nada de geometria — só desenha a grade.
 */

import type { View } from "./raster"

/** Níveis de tom por glifo no atlas. */
export const TONES = 4

export interface SceneBounds {
	/** Maior distância de um ponto ao eixo de rotação (eixo y). */
	radius: number
	minY: number
	maxY: number
}

export interface AsciiScene {
	/** Glifos que a cena usa; o índice 0 é a célula vazia. */
	alphabet: string
	bounds: SceneBounds
	/** Inclinação fixa da câmera, radianos. */
	pitch: number
	/** Ângulo do primeiro quadro, e o do quadro único com movimento reduzido. */
	startYaw: number
	staticYaw: number
	/** Altura da célula em px CSS para uma caixa desta altura. */
	cellHeight(boxHeight: number): number
	/** Realoca os buffers internos para a grade nova. */
	resize(cols: number, rows: number): void
	/** Preenche `glyph` e `tone` (um por célula). Devolve quantas células ficaram cobertas. */
	render(view: View, glyph: Uint8Array, tone: Uint8Array): number
}
