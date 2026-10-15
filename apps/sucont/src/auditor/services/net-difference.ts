/**
 * Sentido único da diferença líquida no auditor: SILOMS − SIAFI, em gráfico, Nota
 * Analítica e prévia. Positivo: o SILOMS registra mais que o SIAFI; negativo: o
 * contrário. Sobra e falta se compensam, por isso ela nunca substitui a soma dos módulos.
 *
 * Decisão do mantenedor no PR #639: é a regra do pedido original no upstream ("APLIQUE
 * PARA TODAS AS DIFERENÇAS ESSE CALCULO: SILOMS - SIAFI (essa é a regra certa)",
 * histórico de prompts do lsantosnels/SIAFI-x-SILOMS-Auditor). Antes a nota usava
 * SIAFI − SILOMS e o painel o contrário: o mesmo conjunto aparecia com sinais opostos.
 */
export const NET_DIFFERENCE_LABEL = "Diferença líquida (SILOMS − SIAFI)"

export const computeNetDifference = (siafi: number, siloms: number): number => siloms - siafi
