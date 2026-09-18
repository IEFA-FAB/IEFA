/**
 * Cena da folha do mantenedor: a arte ASCII de `art/intendencia.txt` girando em
 * 3D com os PRÓPRIOS glifos — o desenho continua sendo o dele, não uma
 * re-sombreação.
 *
 * Como ela ganha corpo:
 * - a silhueta preenchida (ver `art.ts`) vira uma placa estofada: a espessura
 *   cresce da borda para o miolo (raiz da distância à borda), com um mínimo que
 *   nunca deixa a placa virar papel;
 * - a placa é levemente curvada em torno do eixo vertical, como um brasão em
 *   relevo — de perfil ela é um arco espesso, não uma linha;
 * - frente e verso levam o mesmo desenho (o verso sai espelhado, como numa
 *   medalha), e a borda é extrudada com o '@' do contorno, virando a "espessura"
 *   visível quando a folha passa de lado;
 * - o miolo em branco do desenho também vira pontos, mas "mudos": escrevem no
 *   z-buffer sem glifo, e é isso que torna a folha opaca — sem eles, os veios do
 *   verso apareceriam através da frente.
 *
 * Reamostragem: vários pontos da arte caem na mesma célula da grade. Entre os da
 * superfície da frente vence o glifo mais significativo ('@' > símbolos > '=' >
 * '~' > ':' > '.'), para o contorno e os veios sobreviverem numa grade mais
 * grossa que a original. O tom (opacidade) vem da luz sobre o relevo e da
 * profundidade; o glifo, sempre do desenho.
 */

import { type ArtGrid, distanceToEdge, fillSilhouette, parseArt } from "./art"
import { UNDERSIDE, type View } from "./raster"
import { type AsciiScene, TONES } from "./scene"

export interface ArtCloud {
	/** Alfabeto da arte; índice 0 = vazio (ponto mudo que só ocupa profundidade). */
	alphabet: string
	/** xyz intercalados, centrados no eixo de rotação. */
	positions: Float32Array
	/** Normais unitárias, xyz intercalados. */
	normals: Float32Array
	/** Índice no alfabeto por ponto. */
	glyphs: Uint8Array
	/** Peso do glifo na reamostragem (0 = mudo). */
	ranks: Uint8Array
	/** Fração da luz que o ponto recebe (a parede da borda é mais apagada). */
	lights: Float32Array
	/** De que parte da placa é o ponto: 1 frente, -1 verso, 0 parede da borda. */
	sides: Int8Array
	count: number
	radius: number
	minY: number
	maxY: number
	/** Tamanho da arte, em células — para escolher a densidade da grade. */
	artRows: number
	artCols: number
}

/** Peso de um glifo na reamostragem: o traço mais grosso e raro ganha. */
export function glyphRank(ch: string): number {
	switch (ch) {
		case " ":
			return 0
		case ".":
			return 1
		case ":":
			return 2
		case "~":
			return 3
		case "=":
			return 4
		case "@":
			return 6
		default:
			return 5
	}
}

export interface ArtCloudOptions {
	/** Pontos por célula da arte, em cada eixo (supersample para grades finas). */
	subsample?: number
	/** Proporção largura/altura de uma célula da arte (fonte mono). */
	cellAspect?: number
}

// Dimensões em unidades do modelo: a arte ocupa altura 2 (y de -1 a 1).
const MODEL_HEIGHT = 2
/** Meia-espessura mínima da placa, na borda. */
const RIM_HALF = 0.035
/** Estofo adicional no miolo. */
const PUFF = 0.085
/** Distância (em células da arte) a partir da qual o estofo não cresce mais. */
const PUFF_REACH = 16
/** Raio da curvatura da placa em torno do eixo vertical. */
const BEND_RADIUS = 1.5
/** Quanto a ponta (alto) e a voluta (baixo) avançam para a frente. */
const TIP_FORWARD = 0.3
const SCROLL_FORWARD = 0.12
/**
 * Luz da parede da borda: ela é a espessura, superfície secundária — acesa
 * como as faces, a folha de perfil virava uma barra maciça de '@'.
 */
const WALL_LIGHT = 0.6

/**
 * Perfil vertical da placa (deslocamento em z por altura, v de -1 a 1): de lado
 * a folha é um crescente — ponta e voluta vindo para a frente — e não uma tábua.
 */
function profile(v: number): number {
	const tip = Math.max(0, (v - 0.1) / 0.9)
	const base = Math.max(0, (-v - 0.4) / 0.6)
	return TIP_FORWARD * tip * tip + SCROLL_FORWARD * base * base
}

const FRONT = 1
const BACK = -1
const WALL = 0

/** Hash determinístico em [0, 1) — jitter reprodutível do supersample. */
function hash2(i: number, j: number): number {
	let h = Math.imul(i, 374761393) + Math.imul(j, 668265263)
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	h ^= h >>> 16
	return (h >>> 0) / 4294967296
}

export function buildArtCloud(art: ArtGrid, { subsample = 1, cellAspect = 0.6 }: ArtCloudOptions = {}): ArtCloud {
	const { cols, rows, chars } = art
	const inside = fillSilhouette(art)
	const dist = distanceToEdge(inside, cols, rows)

	// Alfabeto: espaço primeiro, depois cada glifo da arte na ordem em que aparece.
	let alphabet = " "
	const indexOf = new Map<number, number>([[32, 0]])
	for (let i = 0; i < chars.length; i++) {
		const code = chars[i] as number
		if (!indexOf.has(code)) {
			indexOf.set(code, alphabet.length)
			alphabet += String.fromCharCode(code)
		}
	}
	const outline = indexOf.get(64) ?? 0

	// Caixa da silhueta: centra a arte e fixa a escala.
	let top = rows
	let bottom = -1
	let left = cols
	let right = -1
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (!inside[r * cols + c]) continue
			if (r < top) top = r
			if (r > bottom) bottom = r
			if (c < left) left = c
			if (c > right) right = c
		}
	}
	const sy = MODEL_HEIGHT / Math.max(1, bottom - top + 1)
	const sx = sy * cellAspect
	const midC = (left + right + 1) / 2
	const midR = (top + bottom + 1) / 2

	const halfThickness = (i: number) => RIM_HALF + PUFF * Math.sqrt(Math.min(1, (dist[i] as number) / PUFF_REACH))
	const thickAt = (r: number, c: number) => (r < 0 || r >= rows || c < 0 || c >= cols || !inside[r * cols + c] ? RIM_HALF : halfThickness(r * cols + c))
	const distAt = (r: number, c: number) => (r < 0 || r >= rows || c < 0 || c >= cols ? 0 : (dist[r * cols + c] as number))

	// Conta os pontos antes de alocar: frente + verso por subamostra, mais a parede da borda.
	const sub = Math.max(1, Math.round(subsample))
	const wallStep = sx * 0.9
	let count = 0
	const isEdge = (r: number, c: number) =>
		inside[r * cols + c] === 1 &&
		(c === 0 ||
			c === cols - 1 ||
			r === 0 ||
			r === rows - 1 ||
			!inside[r * cols + c - 1] ||
			!inside[r * cols + c + 1] ||
			!inside[(r - 1) * cols + c] ||
			!inside[(r + 1) * cols + c])
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const i = r * cols + c
			if (!inside[i]) continue
			count += 2 * sub * sub
			if (isEdge(r, c)) count += sub * Math.max(2, Math.ceil((2 * halfThickness(i)) / wallStep))
		}
	}

	const positions = new Float32Array(count * 3)
	const normals = new Float32Array(count * 3)
	const glyphs = new Uint8Array(count)
	const ranks = new Uint8Array(count)
	const lights = new Float32Array(count)
	const sides = new Int8Array(count)
	let n = 0

	// Coloca um ponto do plano (u, v) com deslocamento z e normal local (nx, ny, nz),
	// dobrando a placa em torno do eixo vertical.
	const emit = (u: number, v: number, z: number, nx: number, ny: number, nz: number, g: number, rank: number, light: number, side: number) => {
		const theta = u / BEND_RADIUS
		const s = Math.sin(theta)
		const co = Math.cos(theta)
		// Perfil vertical: a ponta tomba para a frente e a voluta de baixo também.
		const zv = profile(v)
		const slope = (profile(v + 0.01) - profile(v - 0.01)) / 0.02
		const ca = 1 / Math.sqrt(1 + slope * slope)
		const sa = slope * ca
		const o = n * 3
		positions[o] = (BEND_RADIUS + z) * s
		positions[o + 1] = v
		positions[o + 2] = (BEND_RADIUS + z) * co - BEND_RADIUS + zv
		// Traço de uma célula só não tem gradiente de borda: a normal cai para a frente.
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
		const ax = len > 1e-9 ? nx / len : 0
		const ay = len > 1e-9 ? ny / len : 0
		const az = len > 1e-9 ? nz / len : 1
		// Curvatura horizontal (giro em y), depois a inclinação do perfil (giro em x).
		const bx = ax * co + az * s
		const bz = -ax * s + az * co
		normals[o] = bx
		normals[o + 1] = ay * ca - bz * sa
		normals[o + 2] = ay * sa + bz * ca
		glyphs[n] = g
		ranks[n] = rank
		lights[n] = light
		sides[n] = side
		n++
	}

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const i = r * cols + c
			if (!inside[i]) continue
			const code = chars[i] as number
			const g = indexOf.get(code) ?? 0
			const rank = glyphRank(String.fromCharCode(code))
			const h = halfThickness(i)
			// Inclinação do estofo (em unidades do modelo) — dá a normal das faces.
			const dhdu = (thickAt(r, c + 1) - thickAt(r, c - 1)) / (2 * sx)
			const dhdv = (thickAt(r - 1, c) - thickAt(r + 1, c)) / (2 * sy)
			for (let a = 0; a < sub; a++) {
				for (let b = 0; b < sub; b++) {
					const jr = sub === 1 ? 0.5 : (a + hash2(i, a * 7 + b)) / sub
					const jc = sub === 1 ? 0.5 : (b + hash2(a * 13 + b, i)) / sub
					const u = (c + jc - midC) * sx
					const v = (midR - r - jr) * sy
					// Frente (+z) e verso (-z): o mesmo glifo, o verso lido espelhado. As
					// duas normais apontam para o MESMO lado (+z), como numa folha só: é
					// assim que a luz de dois lados reconhece o verso, visto de trás, e o
					// apaga — com a normal para fora, o verso passaria por frente.
					emit(u, v, h, -dhdu, -dhdv, 1, g, rank, 1, FRONT)
					emit(u, v, -h, dhdu, dhdv, 1, g, rank, 1, BACK)
				}
			}
			if (isEdge(r, c)) {
				// Parede da borda: a normal aponta para fora da silhueta (contra o
				// gradiente da distância), e o glifo é o do contorno.
				const gx = distAt(r, c + 1) - distAt(r, c - 1)
				const gy = distAt(r - 1, c) - distAt(r + 1, c)
				const wallGlyph = code === 32 ? outline : g
				const wallRank = code === 32 ? glyphRank("@") : rank
				const steps = Math.max(2, Math.ceil((2 * h) / wallStep))
				for (let a = 0; a < sub; a++) {
					const u = (c + (a + 0.5) / sub - midC) * sx
					const v = (midR - r - 0.5) * sy
					for (let k = 0; k < steps; k++) {
						const z = -h + (2 * h * (k + 0.5)) / steps
						emit(u, v, z, -gx, -gy, 0, wallGlyph, wallRank, WALL_LIGHT, WALL)
					}
				}
			}
		}
	}

	// Centra no eixo de rotação (caixa em x e z; y já centrado pela silhueta).
	let loX = Infinity
	let hiX = -Infinity
	let loY = Infinity
	let hiY = -Infinity
	let loZ = Infinity
	let hiZ = -Infinity
	for (let k = 0; k < n; k++) {
		const x = positions[k * 3] as number
		const y = positions[k * 3 + 1] as number
		const z = positions[k * 3 + 2] as number
		if (x < loX) loX = x
		if (x > hiX) hiX = x
		if (y < loY) loY = y
		if (y > hiY) hiY = y
		if (z < loZ) loZ = z
		if (z > hiZ) hiZ = z
	}
	const offX = (loX + hiX) / 2
	const offY = (loY + hiY) / 2
	const offZ = (loZ + hiZ) / 2
	let radius = 0
	for (let k = 0; k < n; k++) {
		const x = (positions[k * 3] as number) - offX
		const z = (positions[k * 3 + 2] as number) - offZ
		positions[k * 3] = x
		positions[k * 3 + 1] = (positions[k * 3 + 1] as number) - offY
		positions[k * 3 + 2] = z
		const rr = Math.sqrt(x * x + z * z)
		if (rr > radius) radius = rr
	}

	return {
		alphabet,
		positions,
		normals,
		glyphs,
		ranks,
		lights,
		sides,
		count: n,
		radius,
		minY: loY - offY,
		maxY: hiY - offY,
		artRows: bottom - top + 1,
		artCols: right - left + 1,
	}
}

/** Buffers de uma grade de glifos. */
export interface GlyphRaster {
	cols: number
	rows: number
	/** 1 / profundidade da superfície da frente; 0 = vazia. */
	depth: Float32Array
	/** Glifo vencedor (índice no alfabeto); 0 = vazio ou só ponto mudo. */
	glyph: Uint8Array
	rank: Uint8Array
	/** Luz 0..1 sobre o ponto vencedor. */
	shade: Float32Array
}

export function createGlyphRaster(cols: number, rows: number): GlyphRaster {
	const size = Math.max(0, cols * rows)
	return { cols, rows, depth: new Float32Array(size), glyph: new Uint8Array(size), rank: new Uint8Array(size), shade: new Float32Array(size) }
}

/**
 * Pontos até esta distância (unidades do modelo) atrás do mais próximo são a
 * mesma superfície e disputam a célula pelo peso do glifo. Menor que a
 * espessura mínima da placa (2 × RIM_HALF): o verso nunca vaza pela frente.
 */
const SURFACE_TOLERANCE = 0.025

const normalize = (x: number, y: number, z: number) => {
	const l = Math.sqrt(x * x + y * y + z * z)
	return [x / l, y / l, z / l] as const
}
const [LX, LY, LZ] = normalize(-0.45, 0.55, 0.72)

/** Gira, projeta e reamostra a nuvem na grade. Devolve as células com glifo. */
export function rasterizeArt(cloud: ArtCloud, raster: GlyphRaster, view: View): number {
	const { cols, rows, depth, glyph, rank, shade } = raster
	depth.fill(0)
	glyph.fill(0)
	rank.fill(0)
	const { positions, normals, glyphs, ranks, lights, count } = cloud
	const cy = Math.cos(view.yaw)
	const sy = Math.sin(view.yaw)
	const cp = Math.cos(view.pitch)
	const sp = Math.sin(view.pitch)
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
		const r = ranks[i] as number
		if (ooz > front + tolerance) {
			// Superfície nova, bem à frente: substitui tudo.
			depth[cell] = ooz
			rank[cell] = r
			glyph[cell] = glyphs[i] as number
		} else {
			// Mesma superfície: o glifo mais significativo fica com a célula.
			if (ooz > front) depth[cell] = ooz
			if (r <= (rank[cell] as number)) continue
			rank[cell] = r
			glyph[cell] = glyphs[i] as number
		}
		if (r === 0) continue
		// Luz só para quem venceu: iluminação de dois lados, câmera distante.
		const ax = normals[o] as number
		const ay = normals[o + 1] as number
		const az = normals[o + 2] as number
		let nx = m00 * ax + m02 * az
		let ny = m10 * ax + m11 * ay + m12 * az
		let nz = m20 * ax + m21 * ay + m22 * az
		// O avesso (a face do verso, lida espelhada) recebe menos luz: frente e
		// verso nunca saem com o mesmo tom.
		let lit = 1
		if (nz < 0) {
			nx = -nx
			ny = -ny
			nz = -nz
			lit = UNDERSIDE
		}
		const key = nx * LX + ny * LY + nz * LZ
		shade[cell] = lit * (lights[i] as number) * (0.25 + 0.75 * (key > 0 ? key : 0))
	}

	let covered = 0
	for (let i = 0; i < glyph.length; i++) if (glyph[i] !== 0) covered++
	return covered
}

/** Tom (0..TONES-1) de uma célula: luz sobre o relevo, e o longe esmaece. */
export function artTone(shade: number, nearness: number): number {
	const t = (0.65 * shade + 0.35 * nearness) * TONES
	return t <= 0 ? 0 : t >= TONES ? TONES - 1 : t | 0
}

// A nuvem é imutável e igual para todas as instâncias: construída uma vez por texto.
let cached: { text: string; cloud: ArtCloud } | null = null

/**
 * Linhas da grade por altura de caixa. Comparadas lado a lado: ~110 linhas
 * (célula de 7–9 px) mantêm o glifo legível e a folha continua sendo ARTE ASCII,
 * como a procedural; perto da densidade nativa (~250) ela vira uma gravura em
 * que o caractere some e o traço fica mais apagado.
 */
const TARGET_ROWS = 110

export function createIntendenciaScene(text: string): AsciiScene {
	if (cached?.text !== text) cached = { text, cloud: buildArtCloud(parseArt(text)) }
	const cloud = cached.cloud
	let raster = createGlyphRaster(0, 0)
	return {
		alphabet: cloud.alphabet,
		bounds: cloud,
		pitch: 0.08,
		// Começa de frente — o primeiro quadro é o desenho como ele foi feito.
		startYaw: 0,
		staticYaw: -0.3,
		cellHeight: (boxHeight) => Math.min(9, Math.max(6, boxHeight / TARGET_ROWS)),
		resize(cols, rows) {
			raster = createGlyphRaster(cols, rows)
		},
		render(view, glyph, tone) {
			const covered = rasterizeArt(cloud, raster, view)
			const nearInv = 1 / (view.distance - cloud.radius)
			const farInv = 1 / (view.distance + cloud.radius)
			const span = 1 / (nearInv - farInv)
			for (let i = 0; i < glyph.length; i++) {
				const g = raster.glyph[i] as number
				glyph[i] = g
				if (g !== 0) tone[i] = artTone(raster.shade[i] as number, ((raster.depth[i] as number) - farInv) * span)
			}
			return covered
		},
	}
}
