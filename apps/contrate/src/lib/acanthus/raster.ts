/**
 * Pipeline ASCII 3D à moda do donut.c: gira a nuvem de pontos, projeta em
 * perspectiva numa grade de células, resolve visibilidade com z-buffer e
 * sombreia (Lambert + ambiente + um pouco de borda) cada célula pelo ponto mais
 * próximo. Nada aqui aloca por quadro: os buffers vêm prontos em `Raster`.
 */

import type { AcanthusGeometry } from "./geometry"

/** Rampa de luminância, do vazio ao mais denso. O índice 0 é a célula vazia. */
export const LUMINANCE_RAMP = " .,:;=+*#%@"

export interface Raster {
	cols: number
	rows: number
	/** Luminância 0..1 da superfície vista em cada célula; -1 = vazia. */
	lum: Float32Array
	/** 1 / profundidade da superfície visível (z-buffer); 0 = vazia. */
	depth: Float32Array
	/** Quantos pontos da superfície da frente caíram na célula (a média do tom). */
	hits: Uint16Array
}

export function createRaster(cols: number, rows: number): Raster {
	const size = Math.max(0, cols * rows)
	return { cols, rows, lum: new Float32Array(size).fill(-1), depth: new Float32Array(size), hits: new Uint16Array(size) }
}

/**
 * Pontos até esta distância (unidades do modelo) atrás do mais próximo contam
 * como a mesma superfície e entram na média do tom da célula. É um antisserrilhado:
 * sem ele, o tom é o de UM ponto sorteado pela amostragem, o glifo vira ruído
 * sal-e-pimenta e cintila a cada passo da rotação.
 */
const SURFACE_TOLERANCE = 0.02

export interface View {
	/** Giro em torno do eixo vertical, radianos. */
	yaw: number
	/** Inclinação fixa da câmera (positiva = vista de cima), radianos. */
	pitch: number
	/** Tamanho da célula em px. */
	cellW: number
	cellH: number
	/** Centro da folha na tela, px. */
	centerX: number
	centerY: number
	/** px por unidade do modelo, no plano do eixo. */
	scale: number
	/** Distância da câmera ao eixo, em unidades do modelo. */
	distance: number
}

const normalize = (x: number, y: number, z: number) => {
	const l = Math.sqrt(x * x + y * y + z * z)
	return [x / l, y / l, z / l] as const
}

// Luzes no espaço da câmera. A principal vem de cima, da esquerda e bem de
// frente — de lado demais, os lobos do lado da sombra somem no fundo. A de
// preenchimento, fraca, vem da direita e de baixo.
const [LX, LY, LZ] = normalize(-0.45, 0.55, 0.72)
const [FX, FY, FZ] = normalize(0.7, -0.25, 0.65)

// Meio-vetor da luz principal com a câmera (vista ~ +z): brilho especular.
const [HX, HY, HZ] = normalize(LX, LY, LZ + 1)

const AMBIENT = 0.1
const KEY = 0.62
const FILL = 0.18
const RIM = 0.2
const SPECULAR = 0.35
/** Fração da luz que chega ao avesso da folha (a borda continua acesa). */
export const UNDERSIDE = 0.55

/**
 * Enquadra a folha na caixa: cabe inteira em qualquer ângulo de giro, com a
 * margem dada (fração de cada lado).
 */
export function fitView(
	geometry: Pick<AcanthusGeometry, "radius" | "minY" | "maxY">,
	width: number,
	height: number,
	margin = 0.03
): Pick<View, "centerX" | "centerY" | "scale" | "distance"> {
	const distance = 4.2
	// Pior caso de perspectiva: o ponto mais próximo da câmera fica a (d - r).
	const persp = distance / (distance - geometry.radius)
	const spanY = Math.max(Math.abs(geometry.minY), Math.abs(geometry.maxY)) * 2 * persp
	const spanX = geometry.radius * 2 * persp
	const usableW = width * (1 - 2 * margin)
	const usableH = height * (1 - 2 * margin)
	const scale = Math.max(0, Math.min(usableW / spanX, usableH / spanY))
	return { centerX: width / 2, centerY: height / 2, scale, distance }
}

/** Limpa os buffers e desenha a nuvem de pontos. Devolve quantas células ficaram cobertas. */
export function rasterize(geometry: AcanthusGeometry, raster: Raster, view: View): number {
	const { cols, rows, lum, depth, hits } = raster
	lum.fill(0)
	depth.fill(0)
	hits.fill(0)
	const { positions, normals, count } = geometry
	const cy = Math.cos(view.yaw)
	const sy = Math.sin(view.yaw)
	const cp = Math.cos(view.pitch)
	const sp = Math.sin(view.pitch)
	// Matriz = pitch(x) · yaw(y), linha a linha.
	const m00 = cy
	const m02 = sy
	const m10 = sy * sp
	const m11 = cp
	const m12 = -cy * sp
	const m20 = -sy * cp
	const m21 = sp
	const m22 = cy * cp
	const d = view.distance
	const k = view.scale * d
	const invW = 1 / view.cellW
	const invH = 1 / view.cellH
	const ox = view.centerX
	const oy = view.centerY
	// Tolerância em 1/z: Δ(1/z) ≈ Δz / d² perto do eixo.
	const tolerance = SURFACE_TOLERANCE / (d * d)

	for (let i = 0, o = 0; i < count; i++, o += 3) {
		const x = positions[o] as number
		const y = positions[o + 1] as number
		const z = positions[o + 2] as number
		const vx = m00 * x + m02 * z
		const vy = m10 * x + m11 * y + m12 * z
		const vz = m20 * x + m21 * y + m22 * z
		const ooz = 1 / (d - vz)
		const col = ((ox + k * vx * ooz) * invW) | 0
		const row = ((oy - k * vy * ooz) * invH) | 0
		if (col < 0 || col >= cols || row < 0 || row >= rows) continue
		const cell = row * cols + col
		const front = depth[cell] as number
		if (ooz < front - tolerance) continue

		const ax = normals[o] as number
		const ay = normals[o + 1] as number
		const az = normals[o + 2] as number
		let nx = m00 * ax + m02 * az
		let ny = m10 * ax + m11 * ay + m12 * az
		let nz = m20 * ax + m21 * ay + m22 * az
		// Iluminação de dois lados: a face vista é a que conta. Para o sombreamento a
		// câmera conta como distante (vista = +z) — a folha ocupa poucos graus do
		// campo de visão, e isso poupa uma raiz por ponto. O avesso recebe menos
		// luz: sem isso, a folha a 180°+θ sai igual à folha a θ e a segunda metade
		// da volta parece a primeira repetida.
		let facing = nz
		let lit = 1
		if (facing < 0) {
			nx = -nx
			ny = -ny
			nz = -nz
			facing = -facing
			lit = UNDERSIDE
		}
		const key = nx * LX + ny * LY + nz * LZ
		const fill = nx * FX + ny * FY + nz * FZ
		const rim = 1 - facing
		let spec = nx * HX + ny * HY + nz * HZ
		if (spec > 0) {
			// spec^32 por quadraturas: o brilho só aparece nas quilhas bem orientadas.
			spec *= spec
			spec *= spec
			spec *= spec
			spec *= spec
			spec *= spec
		} else spec = 0
		let shade = AMBIENT + lit * (KEY * (key > 0 ? key : 0) + FILL * (fill > 0 ? fill : 0) + SPECULAR * spec) + RIM * rim * rim
		if (shade > 1) shade = 1

		if (ooz > front + tolerance) {
			// Superfície nova, bem à frente da que estava: recomeça a média.
			depth[cell] = ooz
			lum[cell] = shade
			hits[cell] = 1
		} else {
			if (ooz > front) depth[cell] = ooz
			lum[cell] = (lum[cell] as number) + shade
			hits[cell] = (hits[cell] as number) + 1
		}
	}

	let covered = 0
	for (let i = 0; i < lum.length; i++) {
		const n = hits[i] as number
		if (n === 0) {
			lum[i] = -1
		} else {
			lum[i] = (lum[i] as number) / n
			covered++
		}
	}
	return covered
}

/**
 * Contorno em negativo: a célula que fica logo atrás de uma borda de oclusão
 * (algum vizinho está bem mais perto da câmera) vira vazia. É o que separa um
 * lobo do outro quando se sobrepõem — sem isso a folha vira uma mancha só.
 * `gap` é a diferença mínima de profundidade, em unidades do modelo.
 */
export function carveOcclusionEdges(raster: Raster, gap: number): void {
	const { cols, rows, lum, depth } = raster
	for (let row = 0, i = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++, i++) {
			const own = depth[i] as number
			if (own === 0) continue
			// Compara profundidades (d - z), não 1/z: o limiar fica em unidades do modelo.
			const limit = 1 / own - gap
			if (
				(col > 0 && 1 / (depth[i - 1] as number) < limit) ||
				(col < cols - 1 && 1 / (depth[i + 1] as number) < limit) ||
				(row > 0 && 1 / (depth[i - cols] as number) < limit) ||
				(row < rows - 1 && 1 / (depth[i + cols] as number) < limit)
			) {
				lum[i] = -1
			}
		}
	}
}

/** Índice na rampa para uma luminância; célula coberta nunca vira espaço. */
export function rampIndex(luminance: number, rampLength = LUMINANCE_RAMP.length): number {
	if (!(luminance >= 0)) return 0
	const top = rampLength - 1
	const i = 1 + Math.floor(luminance * top)
	return i > top ? top : i
}

/** Grade inteira em texto — para o preview no terminal e para os testes. */
export function rasterToText(raster: Raster, ramp = LUMINANCE_RAMP): string {
	const lines: string[] = []
	for (let r = 0; r < raster.rows; r++) {
		let line = ""
		for (let c = 0; c < raster.cols; c++) line += ramp[rampIndex(raster.lum[r * raster.cols + c] ?? -1, ramp.length)]
		lines.push(line.trimEnd())
	}
	return lines.join("\n")
}
