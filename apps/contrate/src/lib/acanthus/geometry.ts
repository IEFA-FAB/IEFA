/**
 * Folha de acanto procedural — o símbolo do quadro de Intendência.
 *
 * A folha é modelada num plano 2D (x lateral, y ao longo da nervura central) como
 * união de componentes: um corpo estreito ao longo da nervura, pares de lobos
 * laterais e um lobo terminal. Cada lobo é um leque: uma "palma" presa à nervura
 * por um pedúnculo, que se abre em dedos pontudos e curvados para o ápice — o
 * desenho clássico do acanto coríntio. O ponto amostrado pertence ao componente
 * de maior margem, e é o dono quem decide o relevo (concha da palma, dedos
 * convexos, pontas enroladas para frente).
 *
 * Depois o plano é dobrado em 3D: a folha forma uma calha (laterais para frente),
 * a nervura faz um S suave e a ponta enrola para frente e por cima. Sem esse
 * relevo, a folha de perfil viraria uma linha durante a rotação.
 *
 * Tudo aqui é puro e roda uma vez: o resultado é uma nuvem densa de pontos com
 * normais, em arrays tipados, que o rasterizador só gira e projeta.
 */

export interface AcanthusGeometry {
	/** xyz intercalados, já centrados no eixo de rotação (eixo y). */
	positions: Float32Array
	/** Normais unitárias, xyz intercalados, na mesma ordem das posições. */
	normals: Float32Array
	count: number
	/** Maior distância de um ponto ao eixo de rotação — cabe em qualquer ângulo. */
	radius: number
	minY: number
	maxY: number
}

interface Lobe {
	/** Centro da palma. */
	cx: number
	cy: number
	/** Ponto da nervura onde o pedúnculo nasce. */
	baseY: number
	/** Direção do eixo do lobo: 0 = para cima, π/2 = para fora. */
	dir: number
	radius: number
	fingers: number
	/** Meia-abertura do leque de dedos, em radianos. */
	spread: number
	/** Fundo das incisões entre dedos, como fração do raio. */
	gap: number
	/** Quanto os dedos se curvam em direção ao ápice. */
	hook: number
	/** Quanto as pontas enrolam para frente (fração do raio). */
	curl: number
	/** Quanto o lobo inteiro se inclina para frente, saindo do plano. */
	lift: number
	/** -1 esquerda, 1 direita, 0 central. */
	side: number
	/** Círculo que contém o lobo inteiro (lado +x) — descarta amostras longe dele. */
	boundX: number
	boundY: number
	boundR2: number
}

interface LobeSpec {
	cx: number
	cy: number
	baseY: number
	dir: number
	radius: number
	fingers: number
	spread: number
	gap: number
	hook: number
	curl: number
	lift: number
}

const DEG = Math.PI / 180

// Quatro pares, diminuindo para o alto: os de baixo abertos para fora e caídos,
// os de cima cada vez mais erguidos. O lobo terminal fecha a folha no alto.
const LATERAL_LOBES: LobeSpec[] = [
	{ cx: 0.17, cy: 0.13, baseY: 0.03, dir: 82 * DEG, radius: 0.25, fingers: 5, spread: 76 * DEG, gap: 0.34, hook: 0.95, curl: 1.3, lift: 0.3 },
	{ cx: 0.18, cy: 0.41, baseY: 0.28, dir: 60 * DEG, radius: 0.235, fingers: 5, spread: 74 * DEG, gap: 0.34, hook: 0.9, curl: 1.25, lift: 0.28 },
	{ cx: 0.14, cy: 0.65, baseY: 0.54, dir: 42 * DEG, radius: 0.19, fingers: 4, spread: 70 * DEG, gap: 0.36, hook: 0.85, curl: 1.1, lift: 0.24 },
	{ cx: 0.09, cy: 0.83, baseY: 0.75, dir: 28 * DEG, radius: 0.135, fingers: 4, spread: 66 * DEG, gap: 0.38, hook: 0.75, curl: 0.95, lift: 0.2 },
]

const TERMINAL_LOBE: LobeSpec = {
	cx: 0,
	cy: 0.98,
	baseY: 0.88,
	// Tomba para o lado cheio (+x), com os dedos puxados para o mesmo lado.
	dir: 16 * DEG,
	radius: 0.2,
	fingers: 5,
	spread: 80 * DEG,
	gap: 0.5,
	hook: 0.35,
	curl: 0.5,
	lift: 0,
}

function withBounds(spec: LobeSpec, side: number): Lobe {
	// O dedo mais longo alcança R·alongamento a partir do centro; o pedúnculo vai
	// até a nervura. Folga de 10% cobre o envelope e a curvatura dos dedos.
	const reach = spec.radius * LOBE_ELONGATION * 1.1
	const stalk = Math.hypot(spec.cx, spec.cy - spec.baseY) + spec.radius * 0.2
	const boundR = Math.max(reach, stalk)
	return { ...spec, side, boundX: spec.cx, boundY: spec.cy, boundR2: boundR * boundR }
}

/**
 * O acanto heráldico não é simétrico: um lado é mais cheio e nasce mais baixo,
 * o outro é mais contido — e a ponta tomba para o lado cheio. Além de mais fiel,
 * é o que faz a volta inteira ser legível: numa folha espelhada, a vista a
 * 180°+θ repetiria a vista a θ.
 */
const SIDE_SHAPE = {
	right: { scale: 1.08, drop: 0.03, turn: 5 * DEG },
	left: { scale: 0.92, drop: -0.02, turn: -4 * DEG },
} as const

function shapeSide(spec: LobeSpec, side: 1 | -1): LobeSpec {
	const { scale, drop, turn } = side > 0 ? SIDE_SHAPE.right : SIDE_SHAPE.left
	return { ...spec, radius: spec.radius * scale, cx: spec.cx * scale, cy: spec.cy - drop, baseY: spec.baseY - drop, dir: spec.dir + turn }
}

function buildLobes(): Lobe[] {
	const lobes: Lobe[] = []
	for (const spec of LATERAL_LOBES) {
		lobes.push(withBounds(shapeSide(spec, 1), 1))
		lobes.push(withBounds(shapeSide(spec, -1), -1))
	}
	lobes.push(withBounds(TERMINAL_LOBE, 0))
	return lobes
}

function isNearLobe(lobe: Lobe, x: number, y: number): boolean {
	const dx = (lobe.side < 0 ? -x : x) - lobe.boundX
	const dy = y - lobe.boundY
	return dx * dx + dy * dy <= lobe.boundR2
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, v: number) => {
	const t = clamp01((v - a) / (b - a))
	return t * t * (3 - 2 * t)
}

/** Meia-largura do corpo central (a lâmina ao longo da nervura). */
function bodyHalfWidth(y: number): number {
	if (y < -0.12 || y > 1.02) return -1
	// Pecíolo estreito embaixo, alarga no meio, afina rumo ao lobo terminal.
	const t = clamp01((y + 0.12) / 1.14)
	return 0.018 + 0.07 * Math.sin(Math.PI * t ** 0.8) * smoothstep(0, 0.25, t)
}

/** Estado local de um ponto dentro de um lobo — o que o relevo precisa saber. */
interface LobeSample {
	margin: number
	/** Raio normalizado (0 no centro da palma, ~1 na ponta dos dedos). */
	rn: number
	/** Perfil do dente: 1 no eixo de um dedo, 0 no fundo da incisão. */
	tooth: number
	/** Ângulo efetivo normalizado pelo leque (-1..1 dentro do leque). */
	phiN: number
}

const LOBE_ELONGATION = 1.42

const scratch: LobeSample = { margin: 0, rn: 0, tooth: 0, phiN: 0 }

function sampleLobe(lobe: Lobe, x: number, y: number, out: LobeSample): LobeSample {
	// Lobos esquerdos são o espelho dos direitos: trabalha sempre do lado +x.
	const lx = lobe.side < 0 ? -x : x
	const dx = lx - lobe.cx
	const dy = y - lobe.cy
	const R = lobe.radius
	// Eixo do lobo u = (sin dir, cos dir); v = u girado 90° no sentido anti-horário
	// aponta para o lado de cima do lobo (rumo ao ápice).
	const ux = Math.sin(lobe.dir)
	const uy = Math.cos(lobe.dir)
	// Lobo alongado no próprio eixo: a palma é oval, não um disco.
	const pu = (dx * ux + dy * uy) / LOBE_ELONGATION
	const pv = -dx * uy + dy * ux
	const r = Math.sqrt(pu * pu + pv * pv)
	const rn = r / R
	// O dedo se curva para o ápice à medida que se afasta da palma.
	const phi = Math.atan2(pv, pu) - lobe.hook * rn * rn
	const phiN = phi / lobe.spread

	let rmax: number
	let tooth = 0
	if (phiN > -1 && phiN < 1) {
		const t = ((phiN + 1) / 2) * lobe.fingers
		const f = t - Math.floor(t)
		tooth = 1 - Math.abs(2 * f - 1)
		// Dedos do meio mais longos, os das bordas mais curtos; os de cima (rumo ao
		// ápice) um pouco maiores que os de baixo, como no desenho clássico.
		const envelope = 1 - 0.32 * phiN * phiN + 0.06 * phiN
		rmax = R * envelope * (lobe.gap + (1 - lobe.gap) * tooth ** 0.9)
	} else {
		// Fora do leque: o dorso arredondado da palma.
		const back = Math.abs(phiN) - 1
		rmax = R * lobe.gap * Math.max(0, 0.95 - 0.35 * back)
	}
	let margin = rmax - r

	// Pedúnculo: liga a palma à nervura. Segmento da nervura (0, baseY) até o
	// centro da palma, afinando em direção à nervura.
	const sx = lobe.cx
	const sy = lobe.cy - lobe.baseY
	const len2 = sx * sx + sy * sy
	if (len2 > 0) {
		const s = clamp01((lx * sx + (y - lobe.baseY) * sy) / len2)
		const qx = lx - s * sx
		const qy = y - lobe.baseY - s * sy
		const width = R * (0.2 + 0.25 * s)
		const stalk = width - Math.sqrt(qx * qx + qy * qy)
		if (stalk > margin) margin = stalk
	}

	out.margin = margin
	out.rn = rn
	out.tooth = tooth
	out.phiN = phiN
	return out
}

/**
 * Deslocamento para fora do plano (+z = para a frente), antes da dobra global.
 * `owner` é o índice do lobo dono do ponto, ou -1 para o corpo central.
 *
 * `bump` multiplica só o relevo fino (nervuras, concha da palma, quilha dos
 * dedos): a posição usa o relevo real, a normal usa o relevo exagerado. É o
 * que dá variação de tom dentro de cada lobo sem deformar a silhueta — sem
 * isso a sombra sai em faixas longas do mesmo glifo.
 */
function localRelief(lobes: Lobe[], owner: number, x: number, y: number, bump: number): number {
	// Nervura central saliente, e uma calha de cada lado dela.
	const ax = Math.abs(x)
	let detail = 0.016 * Math.exp(-((x / 0.012) ** 2)) - 0.012 * Math.exp(-(((ax - 0.04) / 0.025) ** 2))
	let shape = 0
	const lobe = owner < 0 ? undefined : lobes[owner]
	if (lobe) {
		const s = sampleLobe(lobe, x, y, scratch)
		const R = lobe.radius
		const rn = Math.min(s.rn, 1.4)
		// A palma é côncava (colher); cada dedo é convexo, com uma quilha no eixo e
		// sulcos junto às incisões.
		detail -= 0.1 * R * Math.max(0, 1 - rn * rn)
		detail += 0.1 * R * (s.tooth * s.tooth - 0.35) * smoothstep(0.2, 0.8, rn)
		// Pontas enrolando para frente, mais nos dedos de cima.
		const tip = Math.max(0, rn - 0.3)
		shape += lobe.curl * R * tip * tip * (1.1 + 0.3 * Math.max(-1, Math.min(1, s.phiN)))
		// O lobo todo se ergue para fora do plano conforme se afasta da nervura.
		shape += lobe.lift * R * rn
	}
	return shape + bump * detail
}

/** Exagero do relevo fino no cálculo das normais. */
const NORMAL_BUMP = 2.6

/** Tabela da nervura curvada no plano (y, z): posição e normal por y. */
interface Spine {
	y0: number
	step: number
	py: Float32Array
	pz: Float32Array
	ny: Float32Array
	nz: Float32Array
}

const SPINE_MIN_Y = -0.2
const SPINE_MAX_Y = 1.4
const SPINE_STEPS = 3000
const TIP_CURL_START = 0.84
const TIP_CURL_RADIUS = 0.15

/** Ângulo da nervura com a vertical: um S suave e a ponta enrolando para frente. */
function spineAngle(y: number): number {
	let a = -0.22 + 0.34 * clamp01(y / TIP_CURL_START)
	if (y > TIP_CURL_START) {
		const t = (y - TIP_CURL_START) / TIP_CURL_RADIUS
		a += t * (0.5 + 0.1 * t)
	}
	return a
}

function buildSpine(): Spine {
	const py = new Float32Array(SPINE_STEPS + 1)
	const pz = new Float32Array(SPINE_STEPS + 1)
	const ny = new Float32Array(SPINE_STEPS + 1)
	const nz = new Float32Array(SPINE_STEPS + 1)
	const step = (SPINE_MAX_Y - SPINE_MIN_Y) / SPINE_STEPS
	// Integra a curva a partir de y = 0 nos dois sentidos, para que a base fique
	// ancorada na origem.
	const zeroIndex = Math.round(-SPINE_MIN_Y / step)
	const setNormal = (i: number, a: number) => {
		// Tangente (cos a, sin a) no plano (y, z); normal = tangente girada 90°.
		ny[i] = -Math.sin(a)
		nz[i] = Math.cos(a)
	}
	py[zeroIndex] = 0
	pz[zeroIndex] = 0
	setNormal(zeroIndex, spineAngle(0))
	for (let i = zeroIndex + 1; i <= SPINE_STEPS; i++) {
		const a = spineAngle(SPINE_MIN_Y + (i - 0.5) * step)
		py[i] = (py[i - 1] ?? 0) + step * Math.cos(a)
		pz[i] = (pz[i - 1] ?? 0) + step * Math.sin(a)
		setNormal(i, spineAngle(SPINE_MIN_Y + i * step))
	}
	for (let i = zeroIndex - 1; i >= 0; i--) {
		const a = spineAngle(SPINE_MIN_Y + (i + 0.5) * step)
		py[i] = (py[i + 1] ?? 0) - step * Math.cos(a)
		pz[i] = (pz[i + 1] ?? 0) - step * Math.sin(a)
		setNormal(i, spineAngle(SPINE_MIN_Y + i * step))
	}
	return { y0: SPINE_MIN_Y, step, py, pz, ny, nz }
}

/** Calha: as laterais da folha avançam para frente. */
const CUP = 0.8

const TIP_LEAN_START = 0.4
const TIP_LEAN = 0.2

/** Mapeia (x, y) do plano, com o relevo local z, para o espaço 3D. */
function placeOnSpine(spine: Spine, x: number, y: number, z: number, out: Float64Array) {
	const f = (y - spine.y0) / spine.step
	const i = Math.max(0, Math.min(SPINE_STEPS - 1, Math.floor(f)))
	const t = Math.max(0, Math.min(1, f - i))
	const lerp = (arr: Float32Array) => (arr[i] ?? 0) * (1 - t) + (arr[i + 1] ?? 0) * t
	const zz = z + CUP * x * x
	// A metade de cima da folha se inclina para o lado cheio, cada vez mais rumo à ponta.
	const lean = y > TIP_LEAN_START ? TIP_LEAN * ((y - TIP_LEAN_START) / (SPINE_MAX_Y - TIP_LEAN_START)) ** 2 : 0
	out[0] = x + lean
	out[1] = lerp(spine.py) + zz * lerp(spine.ny)
	out[2] = lerp(spine.pz) + zz * lerp(spine.nz)
}

/** Hash determinístico em [0, 1) — jitter reprodutível da amostragem. */
function hash2(i: number, j: number): number {
	let h = Math.imul(i, 374761393) + Math.imul(j, 668265263)
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	h ^= h >>> 16
	return (h >>> 0) / 4294967296
}

export interface BuildOptions {
	/** Espaçamento da amostragem no plano da folha (unidades do modelo). */
	spacing?: number
}

export function buildAcanthus({ spacing = 0.0042 }: BuildOptions = {}): AcanthusGeometry {
	const lobes = buildLobes()
	const spine = buildSpine()
	const minX = -0.62
	const maxX = 0.62
	const minY = -0.14
	const maxY = 1.32
	const nx = Math.ceil((maxX - minX) / spacing)
	const ny = Math.ceil((maxY - minY) / spacing)

	// Primeiro passe: quem é dono de cada ponto amostrado.
	const xs: number[] = []
	const ys: number[] = []
	const owners: number[] = []
	const sample: LobeSample = { margin: 0, rn: 0, tooth: 0, phiN: 0 }
	for (let j = 0; j < ny; j++) {
		for (let i = 0; i < nx; i++) {
			const x = minX + (i + hash2(i, j)) * spacing
			const y = minY + (j + hash2(j + 7919, i)) * spacing
			let best = bodyHalfWidth(y) - Math.abs(x)
			let owner = -1
			for (let k = 0; k < lobes.length; k++) {
				const lobe = lobes[k]
				if (!lobe || !isNearLobe(lobe, x, y)) continue
				const m = sampleLobe(lobe, x, y, sample).margin
				if (m > best) {
					best = m
					owner = k
				}
			}
			if (best > 0) {
				xs.push(x)
				ys.push(y)
				owners.push(owner)
			}
		}
	}

	const count = xs.length
	const positions = new Float32Array(count * 3)
	const normals = new Float32Array(count * 3)
	const p = new Float64Array(3)
	const px = new Float64Array(3)
	const py = new Float64Array(3)
	const h = 1e-3
	const map = (owner: number, x: number, y: number, bump: number, out: Float64Array) => placeOnSpine(spine, x, y, localRelief(lobes, owner, x, y, bump), out)

	for (let n = 0; n < count; n++) {
		const x = xs[n] ?? 0
		const y = ys[n] ?? 0
		const owner = owners[n] ?? -1
		// Normal pelo relevo exagerado; a posição sai do relevo real, depois.
		map(owner, x, y, NORMAL_BUMP, p)
		map(owner, x + h, y, NORMAL_BUMP, px)
		map(owner, x, y + h, NORMAL_BUMP, py)
		// Normal = ∂M/∂x × ∂M/∂y; na folha plana isso aponta para +z (a frente).
		const ax = px[0] - p[0]
		const ay = px[1] - p[1]
		const az = px[2] - p[2]
		const bx = py[0] - p[0]
		const by = py[1] - p[1]
		const bz = py[2] - p[2]
		let cx = ay * bz - az * by
		let cy = az * bx - ax * bz
		let cz = ax * by - ay * bx
		const len = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1
		cx /= len
		cy /= len
		cz /= len
		map(owner, x, y, 1, p)
		positions[n * 3] = p[0] as number
		positions[n * 3 + 1] = p[1] as number
		positions[n * 3 + 2] = p[2] as number
		normals[n * 3] = cx
		normals[n * 3 + 1] = cy
		normals[n * 3 + 2] = cz
	}

	// Centra: eixo de rotação passa pelo meio da caixa em x e z; y centrado na altura.
	let loX = Infinity
	let hiX = -Infinity
	let loY = Infinity
	let hiY = -Infinity
	let loZ = Infinity
	let hiZ = -Infinity
	for (let n = 0; n < count; n++) {
		const x = positions[n * 3] ?? 0
		const y = positions[n * 3 + 1] ?? 0
		const z = positions[n * 3 + 2] ?? 0
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
	for (let n = 0; n < count; n++) {
		const x = (positions[n * 3] ?? 0) - offX
		const z = (positions[n * 3 + 2] ?? 0) - offZ
		positions[n * 3] = x
		positions[n * 3 + 1] = (positions[n * 3 + 1] ?? 0) - offY
		positions[n * 3 + 2] = z
		const r = Math.hypot(x, z)
		if (r > radius) radius = r
	}

	return { positions, normals, count, radius, minY: loY - offY, maxY: hiY - offY }
}
