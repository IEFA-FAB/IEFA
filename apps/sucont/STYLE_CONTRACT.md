# STYLE CONTRACT — sucont

## 1. Objetivo

Dar ao sucont a mesma fonte de verdade visual que o sisub já tem. O app nasceu da
portabilidade de nove ferramentas que existiam separadas, e cada uma trouxe a sua
linguagem: hoje convivem quatro sistemas visuais no mesmo produto. Este contrato
define qual deles é o sistema e classifica o resto como dívida — com número, para
que a migração seja verificável em vez de opinativa.

O sucont adota o sistema do **sisub**: flat design técnico-militar, cores sóbrias,
hierarquia por token semântico. Nunca o Pale Brutalism do portal.

## 2. Fonte de verdade

Mesma ordem de prioridade do sisub:

1. **Tokens** (`src/styles.css` via `@theme inline`)
2. **Primitives** (`src/components/ui/`)
3. **Patterns** (`src/components/ui/`)
4. **Wrappers semânticos** (`src/components/`)
5. **Feature-level overrides** (`src/routes/`, `src/<módulo>/components/`) via `className` puramente estrutural

## 3. Princípios operacionais

- A consistência sistêmica prevalece sobre a expressividade local. Uma ferramenta
  não é um app: nove temas dentro de um hub fazem o usuário achar que trocou de
  sistema ao clicar num card.
- Propriedades visuais (cores, shadows, radius) são consumidas via token
  semântico, nunca inventadas.
- **A tela nunca oferece o que a política nega.** Toda escrita do sucont é barrada
  por `requireSucontEditor` (nível 2) no servidor; a UI reflete isso com
  `useSucontAccess()` antes de renderizar a ação. Ver §7.
- **Estado vazio não pode mentir.** "Nenhum resultado", "carregando" e "a consulta
  falhou" são três telas. Ver §7.

## 4. Regras por camada

### 4.1 Tokens

- **Função:** única fonte permitida de valor bruto de estilo.
- **Deve** usar o mapeamento do Tailwind v4 (`--background`, `--primary`,
  `--muted`, `--destructive`, `--success`, `--warning`, `--border`, `--ring`).
- **Não deve** usar cor da paleta padrão do Tailwind direto
  (`bg-slate-50`, `text-emerald-600`, `border-blue-500`).
- **Exceção nomeada:** as famílias `tech-*` (identidade SUCONT-4) e `fab-*`
  (institucional FAB, incluindo a escala numérica `fab-50`…`fab-950`) são tokens
  legítimos, declarados no `@theme inline`. Usá-las é permitido; inventar cor
  fora delas, não.

### 4.2 Primitives

- Implementados com `class-variance-authority` (CVA) sobre **`@base-ui/react`**.
- **Nunca Radix UI.** `Button`, `Label` e `Select` estão em Base UI; a dependência
  `radix-ui` saiu do `package.json`. `Input` e `Label` são tag nativa, como no sisub:
  o Base UI não expõe primitivo para nenhum dos dois.
- **`<SelectValue />` não deriva o rótulo sozinho.** O Radix lia o texto do
  `<SelectItem>` correspondente; o Base UI renderiza o VALOR cru. Onde valor e
  rótulo diferem (`"COM_PRAZO"` exibido como "Ação com Prazo"), passar o mapa em
  `items` na Root. Onde são a mesma string (mês, UG, conferente), `<SelectValue />`
  puro está correto.
- **`value` é `null` para "sem seleção", nunca `""`.** String vazia é um valor para
  o Base UI, e o `placeholder` do trigger só aparece com `null`.
- **`onValueChange` entrega `string | null`.** Mapear o `null` para o sentinela de
  "sem filtro" da tela (`"TODOS"`, `"Geral"`, `"all"`), não para `""`.
- **Não deve** ser sobreposto no call site com `className` que substitua por
  completo sua cor ou formato. Se o visual se repete, muda-se o CVA.
- **Polimorfismo:** o Base UI usa a prop `render`, não `asChild`. Link com cara de
  botão é `<Button render={<Link to="…" />} nativeButton={false} />`. Proibido
  aninhar `<Link><Button/></Link>`.

### 4.3 Tipografia — hierarquia semântica

Sete níveis, definidos como `@utility` em `styles.css`. Idênticos aos do sisub.

| Nível | Classe | Tamanho | Peso | Tracking | Uso canônico |
|-------|--------|---------|------|----------|--------------|
| Display | `.text-display` | 1.375rem | 700 | −0.02em | Título de página |
| Heading | `.text-heading` | 1.125rem | 600 | −0.02em | Título de seção, título de card |
| Subheading | `.text-subheading` | 0.875rem | 500 | 0em | Título de modal, ênfase de dado em tabela |
| Body | `.text-body` | 0.875rem | 400 | 0em | Conteúdo principal |
| Label | `.text-label` | 0.75rem | 600 | +0.05em + uppercase | Rótulo de seção, `<th>`, badge |
| Caption | `.text-caption` | 0.75rem | 400 | 0em | Metadado, timestamp, descrição de item |
| Hint | `.text-hint` | 0.6875rem | 400 | 0em | Texto de ajuda abaixo de campo |

- **Cor é composicional, não embutida.** Nenhuma classe tipográfica define cor.
  Compor com `text-foreground` ou `text-muted-foreground`.
- **Pesos reconhecidos:** 400, 500, 600, 700. `font-extrabold` e `font-black`
  estão **fora do contrato** — não há nível semântico para eles.
- **Tamanho mínimo:** 0.6875rem (`.text-hint`, 11px). Valores arbitrários abaixo
  disso (`text-[8px]`, `text-[9px]`, `text-[10px]`) são proibidos: reprovam
  legibilidade e não existem no sistema.
- **Fronteira:** primitivos em `components/ui/` controlam a própria tipografia
  (`font-medium` interno é canônico). Features não usam `font-*`, `text-<tamanho>`,
  `tracking-*` ou `uppercase` direto.

### 4.4 Feature components

- `className` serve para ajuste **estrutural**: margin, padding, width, grid/flex,
  z-index. Nunca para cor, background de status ou shadow.
- Features montam peças prontas; quem decide cor e variante é o primitivo.

## 5. Convenções obrigatórias

- **Cores:** escala semântica (`background`, `foreground`, `primary`, `secondary`,
  `muted`, `destructive`, `success`, `warning`) mais as famílias nomeadas
  `tech-*` / `fab-*`.
- **Radius:** token único `--radius: 0.5rem`. Escala derivada:
  `sm = radius − 2px`, `md = radius`, `lg = radius + 4px`, `xl = radius + 8px`.
  Proibido valor arbitrário (`rounded-[40px]`, `rounded-[2rem]`, `rounded-3xl`).
- **Shadows:** sóbrias e vindas do token. Proibida sombra artificial solta
  (`shadow-2xl`, `shadow-lg shadow-blue-900/20`) para simular profundidade.
- **Foco:** semântica de `ring` — `focus-visible:ring-[3px] focus-visible:ring-ring/50`.
  Elemento revelado por hover (`opacity-0 group-hover:opacity-100`) **deve** ter
  `focus-visible:opacity-100`, senão é inalcançável pelo teclado.
- **Tooltips:** o atributo HTML `title` é proibido como tooltip em elemento
  interativo — não aparece em foco de teclado nem em touch, e reprova WCAG 1.4.13.
  Botão só-ícone exige `aria-label`.
- **`cn()`:** obrigatório para interpolação dinâmica de `className`. Proibida
  concatenação com template string.
- **Naming semântico:** o atributo relata intenção (`status="success"`), nunca
  aparência (`color="green"`).
- **Tema:** dark mode é a variante `dark:` sobre o token, sempre. Proibido prop
  `isDarkMode` atravessando a árvore, e proibido componente de rota mutar
  `document.documentElement.classList` — isso troca o tema do app inteiro a partir
  de uma tela.

## 6. Proibições explícitas

- **Proibido** classe de cor Tailwind crua (`bg-slate-50`, `text-emerald-600`,
  `ring-blue-500`). Usar token semântico ou família nomeada.
- **Proibido** *side-tab / side-stripe accent border*: `border-l`/`border-r`/
  `border-s`/`border-e` acima de `1px` como faixa colorida de acento em card, item
  de lista, callout ou alerta — inclusive o par `border-l-4 … rounded-r-*`.
  Distinguir por borda completa, tint de fundo (`bg-success/10`), ícone ou badge.
  Exceção: `border-l-2` em `<blockquote>` de markdown.
- **Proibido** *gradient text* (`bg-clip-text` sobre gradiente). Ênfase por peso
  ou tamanho, cor sólida.
- **Proibido** glassmorphism decorativo (`backdrop-blur` como enfeite). Aceito só
  onde há sobreposição real de conteúdo — overlay de modal, barra fixa.
- **Proibido** `animate-bounce` e easing elástico. Curvas de saída exponenciais
  (ease-out-quart/quint/expo), 150–250 ms.
- **Proibido** sequência coreografada de entrada de página. O usuário chega numa
  tarefa, não numa apresentação.
- **Proibido** `<button>` nativo quando o primitivo `Button` atende. Idem
  `<input>` e `Input`.
- **Proibido** reimplementar um primitivo à mão. `CustomSelect` existe porque
  alguém reescreveu um combobox sem `role="listbox"` a dois diretórios do
  `components/ui/select.tsx`.
- **Proibido** `font-black`, `font-extrabold` e tamanho de texto abaixo de
  0.6875rem.
- **Proibido** cor da paleta crua em texto sobre fundo colorido (`text-slate-400`
  sobre `bg-blue-600`): lava a cor e reprova contraste.

## 7. Estado e autorização — as duas regras que não são estéticas

Estas duas custaram bug em produção e valem como parte do contrato de interface.

### 7.1 Vazio, carregando e falha são três telas

Colapsar falha em `[]` faz uma consulta morta parecer catálogo vazio. Foi o que
`sac-dgc` fazia com `.catch(() => setRuns([]))`: o histórico sumia da tela sem
mensagem e o operador refazia ~69 chamadas ao modelo.

- Leitura remota vai por React Query, não `useState` + `.catch`.
- O componente de lista recebe os três estados separados e renderiza:
  **carregando** (esqueleto ou indicador), **falha** (mensagem + ação de repetir),
  **vazio real** (o zero state que ensina a tela).
- Referência: `src/sacdgc/components/DgcRunHistory.tsx`.

### 7.2 A tela não oferece o que a política nega

Toda escrita passa por `requireSucontEditor` no servidor. Renderizar a ação para
quem não tem o nível entrega um 403 depois do trabalho feito, sem mensagem.

- Rota com escrita chama `useSucontAccess()` e condiciona a ação a `canEdit`.
- Gatilho escondido não basta: o modal/formulário também fica atrás do `canEdit`.
- A negativa é explicada, não apenas ocultada — usar `<ReadOnlyNotice>`.
- Referência: `src/components/read-only-notice.tsx`, aplicado em `auditor.tsx`,
  `workspace.tsx` e `reports.tsx`.

## 8. Dívida registrada

Inventário medido em 2026-08-31, para que a migração tenha linha de base. Isto é
dívida conhecida, não exceção permitida: código novo segue o contrato.

| Item | Volume | Onde |
|------|--------|------|
| Classes de paleta Tailwind crua | **450** (de 2.743) | `blue` 203, `slate` 136, `indigo` 35, `emerald` 19 |
| `<button>` nativo | 170 | todas as rotas |
| `<input>` nativo | 73 | todas as rotas |
| Texto abaixo de 11px | 202 (`text-[8px]`…`[10px]`) | `auditor/components/`, `plataforma-doc/` |
| `font-black` / `font-extrabold` | 115 | diversos |
| Radius arbitrário | 38 (`rounded-[40px]`, `[32px]`, `rounded-3xl`) | `hub-layout`, `subitens-genericos` |
| `backdrop-blur` decorativo | 28 | diversos |
| `title=` como tooltip | 19 | diversos |
| Rotas fora do `HubLayout` | 4 | `auditor`, `centro-monitoramento`, `subitens-genericos`, `documentacao` — sem `LegalFooterLinks`, exigido pelo `LGPD.md` |
| Componentes-deus | 4 acima de 1.300 linhas | `subitens-genericos` 1.885, `conta-generica` 1.811, `analista-compatibilidade` 1.666, `monitoramento` 1.317 |
| `CustomSelect` reimplementado | 1 | `auditor/components/CustomSelect.tsx` |

Resolvido desde a primeira medição: a prop `isDarkMode` (226 ocorrências em 9
arquivos) e a rota que mutava `document.documentElement.classList` — o módulo do
auditor passou a ser temático por token, com a classe `dark` escopada ao próprio
container.

### As duas decisões que faltam para zerar a paleta

O que sobrou não é mecânico: são dois julgamentos de produto que a tabela do
codemod não pode tomar sozinha.

1. **O que `blue` significa** (203 ocorrências). No auditor `bg-blue-600` é a ação
   primária, `text-blue-600` é ênfase e `bg-blue-50` é destaque de seleção. O
   sistema do sisub manda ação primária para `bg-primary`, que aqui é quase preto
   — trocaria a identidade visual do módulo. As saídas honestas são: adotar
   `primary` e aceitar a mudança, ou declarar um token de ação próprio do sucont
   (a família `fab-*` já tem um azul real, `fab-500`) e mapear tudo para ele.
2. **Superfície invertida** (136 de `slate`, quase toda em painel escuro dentro de
   página clara — herói do hub, `centro-monitoramento`, `analista-compatibilidade`).
   Ali a escala roda invertida de propósito: `text-slate-300` sobre `bg-slate-900`
   é o texto legível. Tokenizar isso pede um par novo (`--surface-inverted` /
   `--surface-inverted-foreground`), não a reutilização de `card`/`foreground`.

Patterns que o sisub tem e o sucont ainda não: `field.tsx` (formulários) e
`item.tsx` (linhas de lista de entidade). Enquanto não existirem aqui, formulário
e lista seguem a composição atual — mas não se cria uma terceira convenção.

## 9. Política de uso de IA

- **Patch mínimo.** Não fazer redesign oportunista junto de outra tarefa.
- **Não inventar variant.** Se o CVA não tem, ajusta-se o CVA ou pergunta-se.
- **Não expandir o vocabulário visual.** Os tokens declarados esgotam o permitido:
  nada de gradiente exótico, borda esfumaçada ou sombra colorida local.
- **Traduzir valor absoluto para token** ao encostar num arquivo — `emerald-500`
  vira `success` na refatoração, não fica.
- **Preservar comportamento.** Wrapper que substitui um elemento mantém a
  assinatura (`onClick`, `type`, `ref`) idêntica e tipada.

## 10. Checklist de revisão

- [ ] Zero cor Tailwind crua nova (`bg-slate-*`, `text-emerald-*`, `ring-blue-*`)?
- [ ] Tipografia por classe semântica (`.text-display`…`.text-hint`), sem `font-*`
      nem `text-<tamanho>` solto em feature?
- [ ] Cor tipográfica composta por fora (`text-foreground` / `text-muted-foreground`)?
- [ ] Radius vindo do token, sem valor arbitrário?
- [ ] Zero side-stripe (`border-l-4` colorido de um lado só)?
- [ ] Zero gradient text, zero `backdrop-blur` decorativo, zero `animate-bounce`?
- [ ] Botão/input do primitivo, não tag nativa?
- [ ] Botão só-ícone com `aria-label`, e tooltip por primitivo em vez de `title`?
- [ ] Elemento revelado por hover tem `focus-visible:opacity-100`?
- [ ] Dark mode pela variante `dark:`, sem prop `isDarkMode` e sem mutar
      `documentElement` a partir da rota?
- [ ] Leitura remota distingue carregando / falha / vazio (§7.1)?
- [ ] Ação de escrita atrás de `canEdit`, com a negativa explicada (§7.2)?

## 11. Referências de implementação

- **Camada de servidor (modelo do repo):** `src/lib/auth.server.ts` e
  `src/server/auditor.fn.ts` — gate PBAC em toda escrita, cache request-scoped do
  `getUser()`, gravação idempotente por chave natural que devolve conflito em vez
  de sobrescrever calado.
- **Três estados de leitura:** `src/sacdgc/components/DgcRunHistory.tsx`.
- **Negativa de permissão explicada:** `src/components/read-only-notice.tsx`.
- **Guard de rota:** `src/routes/__root.tsx` — auth + PBAC nível 1, rotas legais
  isentas, `z.coerce` no `validateSearch`.
- **Contrato irmão:** `apps/sisub/docs/STYLE_CONTRACT.md`. Em caso de dúvida sobre
  um ponto não coberto aqui, ele é a referência.
