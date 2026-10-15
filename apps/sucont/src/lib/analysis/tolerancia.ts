/**
 * @module lib/analysis/tolerancia
 * Tolerância única de comparação de saldos.
 *
 * Antes cada ferramenta usava a sua: a de compatibilidade comparava com
 * `> 0.001`, a de cruzamento arredondava para duas casas e exigia diferença
 * exatamente zero, e o auditor comparava valores brutos. Três respostas
 * diferentes para a mesma diferença de centavos.
 *
 * Isto é tolerância de ARREDONDAMENTO, não piso de materialidade: saldo contábil
 * tem duas casas, e o que fica abaixo de meio centavo é ruído do parse de moeda
 * (`1.234,56`, `R$`, ponto flutuante). Decisão sobre valor irrelevante para
 * cobrança é outra coisa e não mora aqui.
 */

/** Meio centavo — abaixo disso a diferença não é representável em saldo contábil. */
export const TOLERANCIA_SALDO = 0.005

/**
 * Arredonda para centavos, eliminando o resíduo binário do parse.
 *
 * Mesma técnica do `roundToCents` do sisub (`@iefa/sisub-domain`, `operations/money.ts`):
 * normalizar a representação com `toPrecision` ANTES de arredondar. `toFixed(2)` puro
 * derruba o meio-centavo para baixo — `(1.005).toFixed(2)` devolve "1.00", porque em
 * binário 1,005 é 1,00499…. Num item é um centavo; numa soma de dezenas de linhas o
 * viés é sistemático e reaparece na conciliação como diferença sem origem.
 *
 * Meio-centavo vai para longe do zero, simétrico no negativo: `Math.round` sozinho
 * leva -10,005 a -10,00, e aí o débito e o crédito do mesmo lançamento fechariam em
 * centavos diferentes (o par inter-OM deixaria resíduo de um centavo). A precisão é
 * 12 dígitos, que absorve o erro acumulado de somas longas, e cresce com a magnitude
 * acima de R$ 1 bilhão para não cortar o centavo. Zero sai `0`, nunca `-0`.
 *
 * Duplicado em vez de importado de propósito: `@iefa/sisub-domain` é o domínio do
 * sisub, e o sucont não deve depender dele para somar dinheiro. Mudou lá, muda aqui.
 */
export function arredondarCentavos(valor: number): number {
	if (!Number.isFinite(valor)) return 0
	const escalado = Math.abs(valor) * 100
	const digitosInteiros = Math.trunc(escalado).toFixed(0).length
	const centavos = Math.round(Number(escalado.toPrecision(Math.min(100, Math.max(12, digitosInteiros + 3)))))
	if (centavos === 0) return 0
	return (Math.sign(valor) * centavos) / 100
}

/** `true` quando os dois saldos diferem além do ruído de arredondamento. */
export function saldosDivergem(a: number, b: number): boolean {
	return Math.abs(a - b) > TOLERANCIA_SALDO
}

/** `true` quando o saldo é zero dentro da tolerância. */
export function saldoZerado(valor: number): boolean {
	return Math.abs(valor) <= TOLERANCIA_SALDO
}
