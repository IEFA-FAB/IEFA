// Casos de teste de `.opengrep/rules/money-rounding.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/money-rounding.yaml .opengrep/rules/__fixtures__/money-rounding.ts
// No modo de teste o Opengrep ignora `paths`; que a regra alcança os arquivos certos (`apps/sisub/src/**`,
// `packages/sisub-domain/src/operations/**`) é o `opengrep-rules.contract.test.ts` do sisub que garante: todo
// `paths.include` precisa casar ao menos um arquivo versionado.

declare const total: number
declare const item: { quantity: number; unitCost: number }
declare const counts: { processado: number }
declare const committed: Map<string, number>
declare const delta: number
declare const suggested: number
declare function roundToCents(value: number): number

// ruleid: money-tofixed-rounding
export const suggestedValue = Number(total.toFixed(2))
// ruleid: money-tofixed-rounding
export const line = Number((item.quantity * item.unitCost).toFixed(2))

// `restos-a-pagar.fn.ts` e `acquisition.fn.ts` antes do #629.
// ruleid: money-tofixed-rounding
export const processado = Math.round(counts.processado * 100) / 100
// ruleid: money-tofixed-rounding
export const committedValue = Math.round((committed.get("id") ?? 0) * 100) / 100
// ruleid: money-tofixed-rounding
export const cents = (value: number) => Math.round(value * 100) / 100
// ruleid: money-tofixed-rounding
export const reversed = Math.round(100 * total) / 100
// `expense-execution.ts`: dentro de outra expressão.
// ruleid: money-tofixed-rounding
export const vigente = Math.max(0, Math.round(total * 100) / 100)
// `round2` do `nfe-cost.ts`: meio para longe do zero com EPSILON, mais uma semântica diferente.
// ruleid: money-tofixed-rounding
export const round2 = (value: number) => (Math.sign(value) * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100
// O `roundToCents` antigo, fora de `money.ts`.
// ruleid: money-tofixed-rounding
export const legacy = (value: number) => Math.round(Number((value * 100).toPrecision(12))) / 100

// ok: money-tofixed-rounding
export const rounded = roundToCents(total)
// ok: money-tofixed-rounding
export const message = `Valor: ${total.toFixed(2)}`
// ok: money-tofixed-rounding
export const fourPlaces = Number(total.toFixed(4))
// Percentual com duas casas não é dinheiro (`deltaPct` em `issue-variance.ts`).
// ok: money-tofixed-rounding
export const deltaPct = Number(((Math.abs(delta) / suggested) * 100).toFixed(2))
// Percentual inteiro.
// ok: money-tofixed-rounding
export const pct = Math.round((delta / suggested) * 100)
// Milésimos (quantidade em kg), não centavos.
// ok: money-tofixed-rounding
export const kg = Math.round(total * 1000) / 1000
