/**
 * Sentido único da diferença líquida no auditor: SIAFI − SILOMS, o da Nota Analítica
 * (`report.ts`), que é a saída oficial. Positivo: o SIAFI registra mais que o SILOMS;
 * negativo: o contrário. Sobra e falta se compensam, por isso ela nunca substitui a
 * soma dos módulos.
 *
 * O painel de composição dos gráficos usava SILOMS − SIAFI e mostrava o mesmo conjunto
 * com o sinal trocado em relação à nota. O pedido original no upstream (histórico de
 * prompts do SIAFI-x-SILOMS-Auditor) era SILOMS − SIAFI; se o mantenedor decidir por
 * ele, a troca é só aqui e nos rótulos que leem `NET_DIFFERENCE_LABEL`.
 */
export const NET_DIFFERENCE_LABEL = "Diferença líquida (SIAFI − SILOMS)"

export const computeNetDifference = (siafi: number, siloms: number): number => siafi - siloms
