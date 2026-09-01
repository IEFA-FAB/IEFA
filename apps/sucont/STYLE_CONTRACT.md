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
4. **Wrappers semânticos** (`src/components/`) — entre eles a **casca**, `hub-layout.tsx`
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
- **Toda tela de ferramenta monta o `HubLayout`.** Casca própria — cabeçalho,
  barra lateral, busca ou rodapé desenhados na rota — é proibida. Ver §4.5.

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
- **`fab-*` é MARCA, não folha de estilo.** Permitido não é o mesmo que coerente:
  três telas (`subitens-genericos`, `conta-generica`, `analista-compatibilidade`)
  pintavam TUDO com ela — texto de corpo, borda de painel, fundo de ícone, anel de
  foco, 468 classes ao todo — enquanto as outras nove usavam a escala semântica.
  Era isso que fazia essas três parecerem outro produto. Cromo (texto, superfície,
  borda, foco, hover) sai da escala semântica; `fab-*` fica onde é identidade
  institucional de verdade: o ofício A4 (`plataforma-doc/fab-document.tsx`) e as
  rampas de dado declaradas. Cor de marca também não tem contrapartida no tema
  escuro — `--fab-blue` sumia contra o card escuro.
- **Token que participa de fundo ou texto tem valor nos DOIS temas.** `--tech-bg`
  era hex fixo do tema claro sem contrapartida no `.dark`: no escuro a casca
  ficava cinza-clara enquanto `--foreground` virava quase branco, e título e
  cabeçalho de grupo sumiam. Cor de marca (`--tech-blue`) pode ser constante;
  fundo e texto, não. O override do `.dark` precisa vir **depois** do `:root` que
  define o valor claro — as duas regras têm a mesma especificidade, então quem
  aparece por último vence.
- **Regra de elemento no `styles.css` mora dentro de `@layer`.** Regra fora de
  camada vence QUALQUER utilitária do Tailwind, independente de especificidade.
  Um `a { color: … }` solto fazia todo `text-*` em link ser ignorado no app
  inteiro — os botões do banner antigo traziam `text-white` e saíam
  azul-petróleo sobre fundo escuro, ilegíveis. Verificado por captura no harness
  (`harness/hub.tsx`); nenhum linter enxerga isto.

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

### 4.5 A casca — `HubLayout`

O `HubLayout` é o único dono de cabeçalho, navegação, largura e rodapé. Uma rota
que monte a própria casca vira um app dentro do app: era assim que `auditor`,
`documentacao`, `subitens-genericos` e `centro-monitoramento` funcionavam — quatro
cascas paralelas, duas delas com **barra lateral própria** competindo com a do hub,
e uma com busca própria ao lado da busca do hub.

O que a casca já dá, e a ferramenta portanto **não** repete:

| Elemento | Onde mora | Consequência de repetir |
|----------|-----------|-------------------------|
| `h1` da tela | Trilha do cabeçalho (`Catálogo › Etapa › Ferramenta`) | Dois títulos para a mesma página |
| Voltar ao hub | A própria trilha | Seis "Voltar ao Hub" com seis aparências |
| Escopo (questões do RAC) | Pílula ao lado da trilha | O número no título, fora do dado |
| Uma linha de descrição | `description`, com padrão vindo do catálogo | A promessa do card e a da tela divergem |
| Busca `?q=` | `searchable` | Dois campos de busca na mesma tela |
| Rodapé legal | Rodapé da casca | O `LGPD.md` exigia um rodapé avulso em cada rota órfã |
| Troca de tema | Botão único do cabeçalho | Uma rota escurecendo só a si mesma |

- **Ação de tela vai na prop `actions`**, à direita do cabeçalho fixo — "Nova
  análise", "Importar Excel", "Imprimir". Cada ferramenta desenhava uma barra de
  título só para pendurar dois botões, e não havia duas iguais.
- **Filtro NÃO vai em `actions`.** Filtro é do conteúdo e mora no corpo, com
  rótulo. O cabeçalho é navegação e ação; misturar os dois foi o defeito que a
  barra lateral do hub já tinha corrigido em 2026-08.
- **`width="wide"` só por dado denso** — tela cuja unidade de leitura é tabela ou
  matriz (`auditor`, `monitoramento`, `analista-compatibilidade`, `documentacao`).
  Nunca por preferência.
- **Segmento de escolha é `Tabs`**, nunca `<button>` pintado à mão: os quatro que
  existiam não tinham `role="tab"` e nenhum navegava por seta do teclado.

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
- **A escolha de tema mora em UM lugar: `services/theme.tsx`**, persistida em
  cookie e lida pelo servidor, de forma que o `<html>` já sai pintado do SSR (o
  mesmo padrão do `themeService.tsx` do sisub). O único controle é o botão do
  cabeçalho do `HubLayout`. Antes disto o escuro existia só DENTRO do auditor, por
  `useState(true)` e uma classe `dark` numa `<div>` de rota: entrar na ferramenta
  escurecia a tela, sair a clareava, e as outras onze telas não alcançavam o tema
  escuro apesar de todos os tokens `.dark` já estarem escritos.
- **Sem cookie, o padrão é o claro, escrito explicitamente.** O sisub segue a
  preferência do SO, mas isso exige repetir o bloco inteiro de tokens escuros
  dentro de uma `@media (prefers-color-scheme: dark)`. Aqui `.dark` é a única
  declaração dos tokens escuros — duplicá-la criaria duas fontes para a mesma
  decisão, livres para divergir sem ninguém notar.
- **`readThemePreference` vive em `services/theme-preference.ts`, separado do
  provider.** `@tanstack/react-start/server` puxa `node:async_hooks`; enquanto a
  leitura morava junto do `ThemeProvider`, todo componente que chamasse
  `useTheme()` arrastava o módulo de servidor para a árvore, e o harness visual
  parava de compilar.

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
- **Proibida classe do Tailwind montada por interpolação** — `text-${color}-600`,
  `bg-${color}/10`, `border-${color}-600`. O Tailwind varre o CÓDIGO-FONTE por
  string literal: uma classe montada em tempo de execução nunca chega a existir no
  CSS. Não é questão de estilo, é elemento sem regra nenhuma — foi assim que a aba
  ativa do `monitoramento` e os três ícones de destaque do `conta-generica`
  ficaram sem cor desde que foram escritos, sem nenhum check enxergar. Usar mapa
  de classes literais.
- **Proibido campo de cor livre no dado** (`iconColor: "bg-fab-blue"` no
  catálogo). Cor que não distingue nada só faz a grade parecer sete produtos — e
  cor de MARCA (`--fab-blue`) não tem contrapartida escura, então sumia no card do
  tema escuro.

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

Inventário de 2026-09-01, depois da força-tarefa de unificação da casca.

A força-tarefa de 2026-08-31 quitou a dívida de **cor**; esta quitou a de
**casca, superfície e tipografia** — o que restava fazendo cada ferramenta
parecer um produto diferente por dentro.

**Zerados em 2026-08-31:** classes de paleta Tailwind crua (eram 2.743), cores hex
arbitrárias em classe (114), texto abaixo de 11px (202),
`font-black`/`font-extrabold` (115), `title=` como tooltip (19), radius arbitrário
(37 de 38), `Select` em Radix.

**Zerados em 2026-09-01:**

| O que era | Volume | Onde foi parar |
|-----------|--------|----------------|
| Rotas com casca própria | 4 (`auditor`, `documentacao`, `subitens-genericos`, `centro-monitoramento`) | Todas montam `HubLayout` |
| Barras laterais concorrentes | 2 | A do hub |
| Campos de busca concorrentes | 1 | `?q=` do hub (`searchable`) |
| Cabeçalhos de ferramenta desenhados à mão | 10 | Trilha + `actions` do `HubLayout` |
| "Voltar ao Hub" avulsos | 6 | A trilha |
| `rounded-2xl` (1rem fixo, fora da escala de `--radius`) | 134 | `rounded-xl`, ou o primitivo `Card` |
| `text-<tamanho>` cru em feature | 570 | `.text-display`…`.text-hint` |
| `tracking-*` / `uppercase` cru em feature | 188 | Embutidos no nível semântico |
| `text-[Npx]` arbitrário | 17 | `.text-hint` / `.text-caption` / `.text-body` |
| `text-md` — classe que NÃO EXISTE no Tailwind | 5 | `.text-heading` (nunca tiveram tamanho) |
| Classes montadas por interpolação (sem regra no CSS) | 4 sítios | Mapa de classes literais |
| `font-serif italic` (dialeto do `subitens-genericos`) | 30 | Removido |
| Cores de ícone no dado (`iconColor`) | 7 valores distintos | Uma superfície só |
| Tema por rota (`useState(true)` no auditor) | 1 | Cookie + botão único do cabeçalho |
| `LegalFooter` avulso | 4 rotas | Rodapé da casca |
| Paleta institucional FAB usada como cromo | 468 classes | Escala semântica (§4.1) |
| Capas de ferramenta (disco com avião/escudo, título com filete dourado, lema entre bússolas, marca-d'água) | 3 telas | Removidas — a descrição sob a trilha já diz o que a ferramenta faz |
| Zonas de envio com forma própria | 4 | A mesma do `DgcUpload` |
| Nomes de ferramenta longos demais para a barra | 12 (máx. 39 caracteres) | Máx. 25; a questão do RAC saiu do nome (já é pílula) |

**Primitivos criados** (portados do sisub, o contrato irmão): `card`, `badge`,
`tabs`, `alert`, `empty`. A ausência deles era a CAUSA da divergência de
superfície — sem destino, cada ferramenta desenhava o próprio painel, e o raio
saía de onde o autor estava naquele dia.

**Cabeçalho de tabela** (16 tabelas, 5 escalas de padding: `px-3`, `px-4`, `px-5`,
`px-6`, `px-10`) foi normalizado NO LUGAR: todo `<thead>` carrega
`bg-muted/50 border-b border-border text-label text-muted-foreground` e todo `<th>`
usa `px-4 py-3`, com alinhamento e largura por cima. Não se criou um primitivo
`Table` porque as 16 tabelas têm ordenação, `colSpan` e células compostas: a troca
mecânica de tags seria um rewrite que nenhum check verifica e que não dá para
conferir na tela sem sessão. Ver "Continua em aberto".

Verificação: `scripts/migrate-typography.mjs` é idempotente — rodá-lo de novo na
árvore migrada não muda nada. O `bun run harness:shot` confirma a casca nos dois
temas.

### Exceções permitidas, com o motivo

O que sobrou **não é dívida**: são casos em que a regra geral não se aplica. Estão
listados para que ninguém os "corrija" de novo.

| Caso | Onde | Por quê |
|------|------|---------|
| `<input type="file">` nativo | dropzones de upload | O primitivo `Input` é text-like; o campo é `hidden` e o alvo de clique é o `<label>` |
| `<input type="checkbox">` nativo | "Lembrar e-mail" no login | Mesma razão — o primitivo não cobre |
| 12 `<input>` nativos | `plataforma-doc/fab-document.tsx` | Campos inline dentro de um ofício A4 (`w-[210mm]`, tamanho em `pt`, sem borda). O primitivo traz `h-9`, borda e sombra: transformaria o ofício num formulário. Todos têm `focus-visible:ring-ring` |
| 3 `<input>` nativos | cabeçalho de `subitens-genericos` | Design de sublinhado (`bg-transparent border-b`, sem padding). Já têm `focus:border-fab-gold` |
| `<button>` nativo | tabs/segmentos, cards clicáveis inteiros, véus `inset-0` de clique-fora, `motion.button` | O primitivo brigaria com o layout, ou (no caso do Framer Motion) com o encadeamento de ref/animação. **Todos receberam `focus-visible:ring-[3px] focus-visible:ring-ring/50`** |
| `backdrop-blur` | véu de modal, barra fixa/sticky, tooltip de gráfico | Há sobreposição real de conteúdo — é o caso que §6 admite |
| `rounded-[2px]` | seta do `Tooltip` | Detalhe de forma de uma seta de 10px, não radius de superfície |
| Hex explícito | `ODS_SOLID_COLORS` (Charts), `COLORS` (subitens), `ICC_RAMP`, `RISK_RAMP` | **Escala de visualização**, não cor de interface. Paleta categórica e rampa sequencial existem para distinguir dados; forçá-las em tokens semânticos destruiria a distinção. Declaradas uma vez, num só lugar |

### Regra que a força-tarefa deixou

**Cromo de gráfico é token; paleta de dado é explícita.** Eixo, grade, cursor,
superfície de tooltip e borda saem de `lib/chart-theme.ts` (`chartChrome`) e
acompanham o tema. Série e categoria saem de token nomeado pelo DADO
(`--series-siafi`, `--series-bmp`) ou de rampa declarada. O que não pode existir é
a mesma cor escrita em dois lugares: antes, o marcador da legenda usava
`bg-[#1e40af]` e a barra usava `fill="#1e40af"` — duas fontes para a mesma
decisão, livres para divergir sem ninguém notar.

`chartChrome` vive em `src/lib/`, e não em `auditor/`, porque o auditor não é o
único consumidor: os painéis do analista de saldo alongado plotavam o mesmo cromo
com hex literal.

### Continua em aberto

| Item | Volume | Nota |
|------|--------|------|
| Componentes-deus | 4 acima de 1.300 linhas | `subitens-genericos`, `conta-generica`, `analista-compatibilidade`, `monitoramento`. Dividir é refatoração de arquitetura, não de estilo |
| `font-medium`/`semibold`/`bold` SEM tamanho na mesma `className` | 150 | Ênfase em linha, herdando o tamanho do pai. Mapeá-las mecanicamente para um nível semântico MUDARIA o tamanho — `.text-subheading` é 0.875rem, e várias vivem dentro de blocos `.text-caption`. Cada uma exige decidir se é `<strong>`, `.text-subheading` ou nada |
| Painéis ainda montados à mão | ~40 | `bg-card … rounded-xl border border-border` escrito no lugar de `<Card>`. Já têm a MESMA aparência que o primitivo; a migração é de forma, não de pixel |
| Primitivo `Table` | 16 tabelas cruas | O cabeçalho já está normalizado (linha acima), então a divergência VISÍVEL foi fechada; falta a estrutural. Migrar exige lidar com ordenação, `colSpan` e célula composta, uma a uma e com a tela na frente |
| Patterns `field.tsx` / `item.tsx` | inexistentes | O sisub os tem; enquanto não existirem aqui, formulário e lista seguem a composição atual — mas não se cria uma terceira convenção |

O que NÃO é dívida na coluna acima: os 22 `font-*`, 9 `uppercase` e 4 `tracking-*`
do `plataforma-doc/fab-document.tsx`. É um ofício A4 com tamanhos em `pt` — a
exceção já registrada na tabela anterior.

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
- [ ] A rota monta o `HubLayout`, sem cabeçalho, barra, busca ou rodapé próprios (§4.5)?
- [ ] Ação da tela em `actions`, e filtro no corpo — não o contrário (§4.5)?
- [ ] Zero classe do Tailwind montada por interpolação (`bg-${x}`) (§6)?
- [ ] Superfície via `<Card>`, aviso via `<Alert>`, pílula via `<Badge>`, segmento
      via `<SegmentedControl>` (filtro) ou `<Tabs>` (com painel)?
- [ ] Zero `fab-*` como cromo — só como marca institucional (§4.1)?
- [ ] A tela abre pela TAREFA, sem capa que repita a descrição da trilha (§4.5)?

## 11. Referências de implementação

- **Camada de servidor (modelo do repo):** `src/lib/auth.server.ts` e
  `src/server/auditor.fn.ts` — gate PBAC em toda escrita, cache request-scoped do
  `getUser()`, gravação idempotente por chave natural que devolve conflito em vez
  de sobrescrever calado.
- **Três estados de leitura:** `src/sacdgc/components/DgcRunHistory.tsx`.
- **Negativa de permissão explicada:** `src/components/read-only-notice.tsx`.
- **Guard de rota:** `src/routes/__root.tsx` — auth + PBAC nível 1, rotas legais
  isentas, `z.coerce` no `validateSearch`, e o tema resolvido antes do primeiro byte.
- **Casca:** `src/components/hub-layout.tsx` — trilha, `actions`, `width`,
  descrição herdada do catálogo, rodapé legal e o botão de tema.
- **Tema:** `src/services/theme.tsx` (provider) e `theme-preference.ts` (leitura
  isomórfica, separada de propósito — ver §5).
- **Contrato irmão:** `apps/sisub/docs/STYLE_CONTRACT.md`. Em caso de dúvida sobre
  um ponto não coberto aqui, ele é a referência.
