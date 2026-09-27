// Casos de teste de `.opengrep/rules/money-rounding.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/money-rounding.yaml .opengrep/rules/__fixtures__/money-rounding.ts
// No modo de teste o Opengrep ignora `paths`; que a regra alcança os arquivos certos (`liquidacao.fn.ts`,
// `liquidacao-math.ts`...) é o `opengrep-rules.contract.test.ts` do sisub que garante: todo
// `paths.include` precisa casar ao menos um arquivo versionado.

declare const total: number
declare const item: { quantity: number; unitCost: number }
declare function roundToCents(value: number): number

// ruleid: money-tofixed-rounding
export const suggested = Number(total.toFixed(2))
// ruleid: money-tofixed-rounding
export const line = Number((item.quantity * item.unitCost).toFixed(2))

// ok: money-tofixed-rounding
export const rounded = roundToCents(total)
// ok: money-tofixed-rounding
export const message = `Valor: ${total.toFixed(2)}`
// ok: money-tofixed-rounding
export const fourPlaces = Number(total.toFixed(4))
