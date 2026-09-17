/**
 * Code 39 — codificação para a etiqueta interna de lote.
 *
 * Mora fora do componente por um motivo concreto: a primeira versão desenhava
 * as barras alternando por POSIÇÃO em vez de agrupar módulos iguais, e o
 * resultado era um código que nenhum leitor decodifica. Erro assim não aparece
 * na tela — a etiqueta "parece" um código de barras. Aqui ele é testável.
 *
 * Cada caractere são 12 MÓDULOS: `1` é módulo de barra, `0` de espaço. Barra
 * larga é `11`; caracteres são separados por um módulo de espaço.
 */

const CODE39: Record<string, string> = {
	"0": "101001101101",
	"1": "110100101011",
	"2": "101100101011",
	"3": "110110010101",
	"4": "101001101011",
	"5": "110100110101",
	"6": "101100110101",
	"7": "101001011011",
	"8": "110100101101",
	"9": "101100101101",
	A: "110101001011",
	B: "101101001011",
	C: "110110100101",
	D: "101011001011",
	E: "110101100101",
	F: "101101100101",
	G: "101010011011",
	H: "110101001101",
	I: "101101001101",
	J: "101011001101",
	K: "110101010011",
	L: "101101010011",
	M: "110110101001",
	N: "101011010011",
	O: "110101101001",
	P: "101101101001",
	Q: "101010110011",
	R: "110101011001",
	S: "101101011001",
	T: "101011011001",
	U: "110010101011",
	V: "100110101011",
	W: "110011010101",
	X: "100101101011",
	Y: "110010110101",
	Z: "100110110101",
	"*": "100101101101",
}

export interface Code39Bars {
	/** Retângulos negros: posição em módulos e largura em módulos. */
	rects: Array<{ x: number; width: number }>
	/** Largura total em módulos — é o viewBox do SVG. */
	total: number
}

/** Sequência de módulos de `*VALOR*`, ou null se algum caractere não existe na tabela. */
export function code39Modules(value: string): string | null {
	const chars = [...`*${value.toUpperCase()}*`]
	const pattern: string[] = []
	for (const char of chars) {
		const bits = CODE39[char]
		// caractere fora da tabela não pode ser ignorado em silêncio: a etiqueta
		// sairia com um caractere a menos e o leitor devolveria outro código
		if (!bits) return null
		pattern.push(bits)
	}
	return pattern.join("0")
}

/** Agrupa módulos iguais em retângulos. */
export function encodeCode39(value: string): Code39Bars | null {
	const bits = code39Modules(value)
	if (!bits) return null
	const rects: Array<{ x: number; width: number }> = []
	let index = 0
	while (index < bits.length) {
		let run = 1
		while (index + run < bits.length && bits[index + run] === bits[index]) run += 1
		if (bits[index] === "1") rects.push({ x: index, width: run })
		index += run
	}
	return { rects, total: bits.length }
}
