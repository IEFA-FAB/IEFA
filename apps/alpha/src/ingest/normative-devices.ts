/**
 * @module normative-devices
 * Marca o início de dispositivo no texto extraído, como heading markdown.
 *
 * ─── Por que isto existe ──────────────────────────────────────────────────────
 * `chunkByArticle` corta por dispositivo, mas só reconhece dispositivo em linha com
 * marcador markdown — e o `rada:build` nunca gerava nenhum. O efeito, medido em
 * produção, era o corpus RADA inteiro com `chapter`, `article` e `section` NULOS nos
 * 2440 chunks:
 *
 *   1. o corte por dispositivo não acontecia — todo manual caía na janela deslizante
 *      de 2048 caracteres, cortando dispositivo ao meio;
 *   2. os filtros `chapter`/`article` do `radaRetriever` existiam e nunca casavam nada;
 *   3. o prompt do grader rendia `[1] RADA-e Módulo G — , :` em toda evidência.
 *
 * ─── O que conta como dispositivo aqui ────────────────────────────────────────
 * O RADA-e é manual administrativo, e não código: a portaria do GABAER tem `Art. Nº`,
 * mas os quinze manuais numeram por decimal (`14.1`, `10.2.10.1.3`). Os dois são
 * dispositivo, e ignorar o segundo deixaria de fora quase todo o corpus.
 *
 * Módulo PURO, como `chunk-markdown.ts` e pelo mesmo motivo: é a parte que erra.
 */

/** `CAPÍTULO IV`, `Capítulo 2`. */
const CHAPTER = /^(cap[íi]tulo\s+(?:[IVXLCDM]+|\d+))\b/i

/** `SEÇÃO III`, `Seção 2`. */
const SECTION = /^(se[çc][ãa]o\s+(?:[IVXLCDM]+|\d+))\b/i

/**
 * `Art. 7º`, `Art 12`, `ART. 3o`.
 *
 * Sensível à caixa de propósito. A extração preserva uma linha por linha VISUAL, então
 * uma remissão que dobra de linha começa por `art. 15 da Portaria nº 1.234/GC3` — e com
 * `/i` isso abria um dispositivo, rotulando os chunks seguintes com norma alheia. Norma
 * abre artigo com maiúscula; minúscula no início da linha é continuação de frase.
 */
const ARTICLE = /^((?:Art|ART)\.?\s*\d+\s*[ºo°]?)/

/**
 * Numeração decimal no início da linha: `14.1`, `10.2.10.1.3 Os militares…`.
 *
 * Exige espaço e conteúdo depois da numeração — é o que separa dispositivo de valor
 * monetário no começo de linha de tabela (`1.234,56` não casa, porque depois do
 * `1.234` vem vírgula e não espaço).
 */
const DECIMAL = /^(\d+(?:\.\d+)+)[.)]?\s+(\S)/

/**
 * `1. CONSIDERAÇÕES INICIAIS` — dispositivo de primeiro nível, sem subdivisão.
 *
 * Duas exigências, e cada uma tapa um furo medido: o resto da linha em CAIXA ALTA separa
 * título de módulo de enumeração em minúscula (`1) Sim, quando…`), e o PONTO obrigatório
 * separa das duas formas que a caixa alta sozinha não alcança — quantidade no início da
 * linha (`12 UNIDADES ADMINISTRATIVAS`, `5 DIAS ÚTEIS`, comuns nas tabelas do SIAFI) e
 * enumeração em caixa alta (`2) SIM, QUANDO HOUVER`).
 *
 * O estrago que isso evita é o pior do módulo: título de primeiro nível ZERA seção e
 * artigo, então um falso positivo desses deixa todos os chunks seguintes rotulados com
 * norma que não é a deles.
 */
const TOP_LEVEL = /^\d{1,2}\.\s+\p{Lu}[^\p{Ll}]*$/u

/**
 * Separador de milhar disfarçado de numeração.
 *
 * `1.234 unidades` tem a forma de dispositivo de nível 2. Grupo de exatamente três
 * dígitos depois do primeiro ponto é milhar, não subdivisão: manual nenhum tem item
 * `234` dentro do item `1`.
 */
function isThousandsSeparator(numbering: string): boolean {
	return numbering
		.split(".")
		.slice(1)
		.some((segment) => segment.length === 3)
}

/**
 * Profundidade máxima de dispositivo.
 *
 * Cinco é empírico, não teórico: `10.2.10.1.3` é dispositivo de verdade e há 1285 deles
 * no acervo. Conta contábil de cinco segmentos (`4.5.1.1.2`) seria indistinguível pela
 * forma — mas não existe nenhuma no corpus, e baixar o limite para quatro sacrificaria
 * os 1285 por um caso que a medição não encontrou.
 */
const MAX_DEVICE_DEPTH = 5

/**
 * Conta contábil do SIAFI disfarçada de dispositivo.
 *
 * `4.5.1.1.2.02.00 - REPASSE RECEBIDO` aparece no corpo dos módulos de execução
 * orçamentária. Duas marcas a distinguem de numeração de item: profundidade acima de
 * cinco e segmento com zero à esquerda — norma não escreve o item `02` dentro do `2`.
 */
function isAccountCode(numbering: string): boolean {
	const segments = numbering.split(".")
	return segments.length > MAX_DEVICE_DEPTH || segments.slice(1).some((segment) => segment.length > 1 && segment.startsWith("0"))
}

/**
 * Profundidade da numeração decimal, e o nível de heading que ela vira.
 *
 * Nível 1 (`14`) é o módulo inteiro, 2 (`14.1`) é seção, 3 ou mais (`14.1.1`) é o
 * dispositivo propriamente dito. `chunkByArticle` lê essa profundidade de volta.
 */
function headingFor(depth: number): string {
	if (depth <= 1) return "##"
	if (depth === 2) return "###"
	return "####"
}

/**
 * Devolve o texto com `#` no início de cada linha que abre dispositivo.
 *
 * Não reescreve nem reordena nada: só prefixa. O conteúdo da linha continua inteiro
 * dentro do chunk, porque numeração e caput costumam vir na MESMA linha
 * (`10.2.10.1.3 Os militares, no gozo do primeiro período…`), e separá-los faria o
 * caput perder o número que o identifica na norma.
 */
export function markNormativeDevices(text: string): string {
	return text
		.split("\n")
		.map((line) => {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) return line

			if (CHAPTER.test(trimmed)) return `## ${trimmed}`
			if (SECTION.test(trimmed)) return `### ${trimmed}`
			if (ARTICLE.test(trimmed)) return `#### ${trimmed}`

			const decimal = DECIMAL.exec(trimmed)
			if (decimal && !isThousandsSeparator(decimal[1]) && !isAccountCode(decimal[1])) {
				return `${headingFor(decimal[1].split(".").length)} ${trimmed}`
			}

			if (TOP_LEVEL.test(trimmed)) return `## ${trimmed}`

			return line
		})
		.join("\n")
}
