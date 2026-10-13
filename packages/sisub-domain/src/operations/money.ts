/**
 * Arredondamento de dinheiro: o ÚNICO jeito de fechar um valor em centavos no sisub.
 *
 * Havia cinco versões com semânticas diferentes (`toFixed(2)`, `Math.round(v * 100) / 100`, meio
 * centavo longe do zero com `EPSILON`…), e cada uma errava um caso diferente. Ver
 * `.opengrep/rules/money-rounding.yaml`.
 */

/**
 * Arredonda para centavo, meio centavo longe do zero — e NÃO com `toFixed(2)`, que era o que
 * estava em produção.
 *
 * `(1.005).toFixed(2)` devolve "1.00": 1,005 em binário é 1,00499…, então o meio-centavo cai
 * para baixo. `Math.round(1.005 * 100) / 100` erra igual (100,49999… → 100). Num valor só é um
 * centavo; numa NS que soma dezenas de itens, é um centavo por item sempre no mesmo sentido, e a
 * diferença aparece na conciliação contra o SIAFI sem ninguém saber de onde veio.
 *
 * `toPrecision(12)` normaliza o erro de representação ANTES do arredondamento, então
 * 100,49999999999999 volta a ser 100,5 e sobe para 101 centavos.
 *
 * Negativo é simétrico: `roundToCents(-x) === -roundToCents(x)`. `Math.round` sozinho leva o meio
 * para +∞ (-1000,5 → -1000), e aí uma nota e a sua anulação, ou o delta SIAFI − sisub e o
 * sisub − SIAFI, fechavam em centavos diferentes. Zero sai sempre `0`, nunca `-0`.
 */
export function roundToCents(value: number): number {
	if (!Number.isFinite(value)) return 0
	const cents = Math.round(Number((Math.abs(value) * 100).toPrecision(12)))
	if (cents === 0) return 0
	return (Math.sign(value) * cents) / 100
}
