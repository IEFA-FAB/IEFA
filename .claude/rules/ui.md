---
paths:
  - "apps/**/*.tsx"
  - "apps/**/*.css"
---

# UI: design systems e proibições globais

`sisub` e `portal` têm design systems incompatíveis. Nunca copiar padrão visual entre os dois.

| App | Sistema | Radius | Referência |
|-----|---------|--------|------------|
| `sisub` | Flat design | `0.5rem` genérico; `<Card>` usa `rounded-xl` (0.75rem) | `apps/sisub/docs/STYLE_CONTRACT.md` |
| `portal` | Pale Brutalism 2026 | Zero (`--radius: 0rem`); nenhum `rounded-*` exceto pílulas explícitas | `apps/portal/STYLE_CONTRACT.md` |
| `sucont` | Sistema do `sisub` (flat técnico), com contrato próprio pela dívida das 9 ferramentas portadas | `0.5rem` | `apps/sucont/STYLE_CONTRACT.md` |
| `contrate` | Pale Brutalism do `portal`, sem variação. O contrato é cópia: mudança se faz nos dois | Zero | `apps/contrate/STYLE_CONTRACT.md` |
| `rumaer` | Institucional Aeronáutico (navy do RCA 35-2 + dourado ≤10%, sombra macia). Não segue mais o portal | `0.625rem` | `apps/rumaer/STYLE_CONTRACT.md` |

Leia o `STYLE_CONTRACT.md` do app antes de mudar UI nele.

## Componentes

- Base UI, nunca Radix. Lista longa (a partir de ~25 itens) usa o combobox pesquisável do app, nunca
  `<select>`/`<option>` nativo.
- Combobox do Base UI: sem `autoHighlight` o Enter não escolhe nada; o corte de itens é `limit`,
  nunca `.slice()` em `items`.
- Select: `value={x ?? null}` e `<SelectValue>` com label. Button com `render` exige
  `nativeButton={false}`. `MenuItem` usa `onClick`, não `onSelect`.

## Proibições globais (todos os apps)

- **`cursor: pointer` é regra de `@layer base`, não utilitária.** O preflight do Tailwind v4 não dá
  ponteiro a `button`, e os gatilhos do Base UI são `div` com `role`. Cada `apps/<app>/src/styles.css`
  carrega a mesma regra `:where(...)` (button, summary, select, checkbox/radio/file, `label` que
  embrulha um deles, `role` clicáveis; `:disabled`, `[aria-disabled="true"]` e `[data-disabled]` de
  fora; `[role="combobox"]` excluindo campo editável). A especificidade zero deixa `cursor-*` no
  elemento vencer. Não espalhar `cursor-pointer` em clicável novo: se faltou ponteiro, corrija a regra
  base. O inverso é legítimo: elemento com `role` clicável sem ação de clique escreve
  `cursor-default`. Exceção conhecida: `apps/docs/src/styles/app.css` tem uma variante antiga, sem
  `:where()` nem guarda de desabilitado; é dívida, não padrão.
- **Faixa de acento lateral é proibida.** Nada de `border-l`/`border-r`/`border-s`/`border-e` acima de
  `1px` como acento colorido em card, item de lista, callout ou alerta, inclusive o par
  `border-l-4 … rounded-r-*`. Distinga grupo/status/severidade por borda completa, tint de fundo
  (`bg-*/5`…`/10`), ícone/número/badge à esquerda, ou nada. Borda uniforme de `1px` e blockquote
  editorial (`border-l-2` em citação) não são atingidos.
