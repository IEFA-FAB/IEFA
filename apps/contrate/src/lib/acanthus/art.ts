/**
 * A folha de acanto do mantenedor (arte ASCII estática, `art/intendencia.txt`)
 * lida como grade: glifos, silhueta preenchida e distância até a borda.
 *
 * O desenho só tem contorno ('@' grosso) e veios ('.', ':', '~', '='): o miolo da
 * folha é espaço. Para girá-la em 3D sem ver através dela, é preciso saber o que
 * é DENTRO — a silhueta. Ela sai do próprio contorno: fecha-se as falhas do '@'
 * (fechamento morfológico), inunda-se o fundo a partir da borda da grade, e o
 * que a enchente não alcança é folha.
 *
 * Tudo aqui é puro (texto → arrays tipados) e testável sem DOM.
 */

export interface ArtGrid {
	cols: number
	rows: number
	/** Código do glifo em cada célula (charCode; 32 = espaço). */
	chars: Uint16Array
}

export function parseArt(text: string): ArtGrid {
	const lines = text.replace(/\r\n?/g, "\n").split("\n")
	while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "") lines.pop()
	while (lines.length > 0 && (lines[0] ?? "").trim() === "") lines.shift()
	const rows = lines.length
	let cols = 0
	for (const line of lines) cols = Math.max(cols, line.trimEnd().length)
	const chars = new Uint16Array(cols * rows).fill(32)
	for (let r = 0; r < rows; r++) {
		const line = lines[r] ?? ""
		const n = Math.min(line.length, cols)
		for (let c = 0; c < n; c++) {
			const code = line.charCodeAt(c)
			// Tab e outros brancos viram espaço: só glifo visível conta.
			chars[r * cols + c] = code <= 32 ? 32 : code
		}
	}
	return { cols, rows, chars }
}

const SPACE = 32

/** Dilata a máscara por um disco de raio `radius` (em células). */
function dilate(mask: Uint8Array, cols: number, rows: number, radius: number): Uint8Array {
	const out = new Uint8Array(mask.length)
	const r2 = radius * radius
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (!mask[r * cols + c]) continue
			for (let dr = -radius; dr <= radius; dr++) {
				const rr = r + dr
				if (rr < 0 || rr >= rows) continue
				for (let dc = -radius; dc <= radius; dc++) {
					if (dr * dr + dc * dc > r2) continue
					const cc = c + dc
					if (cc < 0 || cc >= cols) continue
					out[rr * cols + cc] = 1
				}
			}
		}
	}
	return out
}

/**
 * Silhueta preenchida: 1 = folha (contorno, veios e miolo), 0 = fundo.
 *
 * `closeRadius` fecha falhas do contorno de até ~2×raio células — o '@' do
 * desenho tem aberturas nas pontas dos lobos, e sem fechar a enchente entraria
 * na folha por elas.
 */
export function fillSilhouette(art: ArtGrid, closeRadius = 3): Uint8Array {
	const { cols, rows, chars } = art
	const ink = new Uint8Array(cols * rows)
	for (let i = 0; i < ink.length; i++) ink[i] = chars[i] === SPACE ? 0 : 1
	const walls = dilate(ink, cols, rows, closeRadius)

	// Enchente do fundo a partir da moldura, pelas células sem parede.
	const outside = new Uint8Array(cols * rows)
	const queue = new Int32Array(cols * rows)
	let head = 0
	let tail = 0
	const seed = (i: number) => {
		if (outside[i] || walls[i]) return
		outside[i] = 1
		queue[tail++] = i
	}
	for (let c = 0; c < cols; c++) {
		seed(c)
		seed((rows - 1) * cols + c)
	}
	for (let r = 0; r < rows; r++) {
		seed(r * cols)
		seed(r * cols + cols - 1)
	}
	while (head < tail) {
		const i = queue[head++] as number
		const r = (i / cols) | 0
		const c = i - r * cols
		if (c > 0) seed(i - 1)
		if (c < cols - 1) seed(i + 1)
		if (r > 0) seed(i - cols)
		if (r < rows - 1) seed(i + cols)
	}

	// O fundo avança de volta o que a dilatação comeu (fecha a operação), mas
	// nunca por cima de tinta: todo glifo desenhado continua no desenho, mesmo um
	// ponto solto fora do contorno — só o vazio em volta dele não vira folha.
	const grown = dilate(outside, cols, rows, closeRadius)
	const inside = new Uint8Array(cols * rows)
	for (let i = 0; i < inside.length; i++) inside[i] = ink[i] || !grown[i] ? 1 : 0
	return inside
}

/**
 * Distância (chanfro 3-4, em células) de cada célula da folha até o fundo mais
 * próximo; 0 fora da folha. Dá o "estofo" do relevo e a normal da borda.
 */
export function distanceToEdge(inside: Uint8Array, cols: number, rows: number): Float32Array {
	const BIG = 1e6
	const d = new Float32Array(cols * rows)
	for (let i = 0; i < d.length; i++) d[i] = inside[i] ? BIG : 0
	const at = (r: number, c: number) => (r < 0 || r >= rows || c < 0 || c >= cols ? 0 : (d[r * cols + c] as number))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const i = r * cols + c
			if (d[i] === 0) continue
			d[i] = Math.min(d[i] as number, at(r, c - 1) + 3, at(r - 1, c) + 3, at(r - 1, c - 1) + 4, at(r - 1, c + 1) + 4)
		}
	}
	for (let r = rows - 1; r >= 0; r--) {
		for (let c = cols - 1; c >= 0; c--) {
			const i = r * cols + c
			if (d[i] === 0) continue
			d[i] = Math.min(d[i] as number, at(r, c + 1) + 3, at(r + 1, c) + 3, at(r + 1, c + 1) + 4, at(r + 1, c - 1) + 4)
		}
	}
	for (let i = 0; i < d.length; i++) d[i] = (d[i] as number) / 3
	return d
}
