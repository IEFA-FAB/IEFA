# STYLE CONTRACT

## 1. Objetivo
Criar uma fonte de verdade operacional e técnica para o design system do sisub. Este contrato define as regras de desenvolvimento do frontend para erradicar decisões visuais locais, abolir configurações hardcoded e garantir consistência técnica e estética baseada na hierarquia de tokens.

## 2. Fonte de verdade
A arquitetura visual deve seguir estritamente a sequência de prioridade abaixo:
1. **Tokens** (`styles.css` via `@theme inline`)
2. **Primitives** (`src/components/ui/`)
3. **Patterns** (`src/components/ui/`)
4. **Wrappers semânticos** (`src/components/layout/` e `src/components/features/`)
5. **Feature-level overrides** (`src/components/features/` via `className` puramente estrutural)

## 3. Princípios operacionais
- A consistência sistêmica prevalece sobre a expressividade ou necessidade local.
- Propriedades visuais (cores, shadows, radius) são consumidas via tokens semânticos, nunca inventadas.
- Abstrações superiores (patterns e wrappers) são geradas apenas por repetição de funcionalidade e domínio, não apenas por conveniência de sintaxe.
- O estilo base técnico-militar do projeto (flat design, cores sóbrias) deve ser mantido e preservado. Modificações que injetam profundidade ou cantos excessivamente curvos não alinhados aos tokens atuais são inválidas.

## 4. Regras por camada

### 4.1 Tokens
- **Função:** Única fonte permitida de valores brutos de estilo (cores, tipografia, bordas, sombras).
- **Regras:**
  - **Deve** usar o mapeamento de variáveis do Tailwind v4 (`--background`, `--primary`, `--success`, etc.).
  - **Não deve** utilizar cores da paleta padrão do Tailwind diretamente (ex.: `bg-blue-500`, `text-green-600`).
- **Decisão:** Quando uma cor externa for necessária, usar alias semântico em `styles.css` (como `--success` e `--warning`) e mapear no `@theme inline`, em vez de recorrer à paleta primária.

### 4.2 Primitives
- **Função:** Blocos de construção agnósticos de interface, implementados com `class-variance-authority` (CVA) e `shadcn`/`@base-ui`.
- **Regras:**
  - **Deve** expor e utilizar apenas as variants mapeadas nativamente em seus arquivos.
  - **Não deve** ser sobreposto no contexto de uso com classes que substituam por completo sua cor ou formato, sob a capa do `className` da props.
- **Decisão:** Se precisar de um visual recorrente que o primitivo exige muito `className`, alterar o CVA interno em vez de forçar o estilo por fora.

### 4.3 Patterns
- **Função:** Combinação base arquitetural de primitivos interligados para resolver comportamentos específicos.
- **Regras:**
  - **Deve** adotar as APIs propostas. Padrão indiscutível: Formulários devem importar a API do `field.tsx`. Listas de entidades devem usar o padrão `item.tsx`.
  - **Não deve** montar lógicas repetitivas (como `grid` de `Label` + `Input` + Erro) espalhadas nos componentes de features.
  - **Não deve** substituir linhas de lista por `div.flex.items-center.gap-*.p-*.rounded-*.border` quando `<Item>` atende o caso.
- **Decisão:** Existindo um pattern consolidado (`field.tsx`, `item.tsx`), é proibido implementar a solução customizada "na mão".

#### Pattern `item.tsx` — Linhas de lista semânticas
- **`ItemGroup`** — container `role="list"` com espaçamento automático por tamanho (`gap-4` default, `gap-2.5` sm, `gap-2` xs).
- **`Item`** — linha polimórfica via prop `render` (pode ser `<Link>`, `<button>`, `<a>`). Variantes: `default` (borda transparente), `outline` (borda `border-border`), `muted` (fundo `bg-muted/50`). Tamanhos: `default`, `sm`, `xs`.
- **`ItemMedia`** — slot para ícone ou imagem (variantes: `default`, `icon`, `image`). Usar `variant="image"` apenas quando não houver elementos absolutamente posicionados sobrepostos.
- **`ItemContent`** — coluna flex para título e descrição.
- **`ItemTitle`** / **`ItemDescription`** — slots semânticos de texto; `ItemDescription` aceita `className="text-xs"` para ajuste de escala sem quebrar o contrato.
- **`ItemActions`** — agrupamento de botões/ícones à direita.
- **`ItemHeader`** / **`ItemFooter`** — linhas `basis-full` para conteúdo que ocupa a largura total do item (ex: botão de ação na base).
- **Casos de uso obrigatórios:** pessoas em lista, itens de lixeira, resultados de busca/combobox, linhas de preview, qualquer entidade repetível com ícone + texto + ação.
- **Distinção obrigatória com `Card`:** `<Card>` encapsula uma **seção** de domínio; `<Item>` representa uma **entidade** dentro de uma lista. Nunca usar `<Card>` para linhas de lista, nunca usar `<Item>` como container de seção.

### 4.4 Wrappers semânticos
- **Função:** Encapsular primitives visando uma regra de negócio específica altamente reutilizada do sistema.
- **Regras:**
  - **Deve** ter nomes claros do domínio e esconder os estilos técnicos repetidos.
  - **Não deve** ser construído prematuramente se a composição aparecer menos de três vezes no sistema.
- **Decisão:** Para agrupar domínios específicos (ex: `SimplifiedMilitaryStats`), extraia para um wrapper (ex: `StatCard`) caso necessite padronizar as cores, a borda e o status visual na aplicação inteira.

### 4.5 Feature components
- **Função:** Estruturação da hierarquia das views finais para o usuário, orquestrando fluxos e chamando os componentes inferiores.
- **Regras:**
  - **Deve** usar o escape hatch de `className` exclusivamente para ajustes estruturais: `margin`, `padding`, `width`, `grid-area`, flex/grid layouts e `z-index`.
  - **Não deve** conter declarações focadas na essência gráfica (como mudança de cor textual, background de status, ou shadows).
- **Decisão:** Elementos de feature devem se comportar como "montadores" de peças prontas, delegando controle de cor e variantes aos wrappers ou primitives contidos.

### 4.6 Tipografia — Hierarquia semântica

- **Função:** Estabelecer 7 níveis tipográficos com vetores distintos (tamanho, peso, tracking), eliminando decisões ad-hoc de `font-*` / `text-*` nos componentes de feature.
- **Tokens de tracking** (definidos em `styles.css` `:root`): `--tracking-tight: -0.02em` · `--tracking-normal: 0em` · `--tracking-label: 0.05em`
- **Pesos reconhecidos:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold). Cada peso tem um papel fixo no sistema — ver tabela abaixo.
- **Classes utilitárias** (definidas em `@layer utilities` de `styles.css`):

| Nível | Classe | Tamanho | Peso | Tracking | Uso canônico |
|-------|--------|---------|------|---------|--------------|
| Display | `.text-display` | 1.375rem | 700 | −0.02em | PageHeader — título de página |
| Heading | `.text-heading` | 1.125rem | 600 | −0.02em | CardTitle, títulos de seção |
| Subheading | `.text-subheading` | 0.875rem | 500 | 0em | Títulos de dialog/drawer, section headers menores, ênfase de dados em tabelas |
| Body | `.text-body` | 0.875rem | 400 | 0em | Conteúdo principal, ItemTitle |
| Label | `.text-label` | 0.75rem | 600 | +0.05em + uppercase | Rótulos de seção, `<th>` com uppercase, badges de categoria |
| Caption | `.text-caption` | 0.75rem | 400 | 0em | ItemDescription, metadados, timestamps |
| Hint | `.text-hint` | 0.6875rem | 400 | 0em | FieldDescription, helper text |

- **Cor é composicional, não embutida.** Nenhuma classe tipográfica define cor. Compor com tokens de cor semânticos:
  - `text-foreground` — padrão para display, heading, subheading, body, label
  - `text-muted-foreground` — padrão para caption e hint (aplicar via classe Tailwind, não embutido na tipográfica)
- **Regras de composição obrigatórias:**
  - Peso 600+ → sempre `text-foreground` — nunca `text-muted-foreground` (peso alto + cor fraca = ilegível)
  - `.text-label` é o único nível uppercase com tracking positivo — não criar equivalentes locais
  - `caption` e `label` têm o mesmo tamanho (0.75rem) mas diferem em peso e tracking: distinção intencional
  - `subheading` e `body` têm o mesmo tamanho (0.875rem) mas diferem em peso: 500 vs 400
- **Fronteira primitivo/feature:**
  - **Primitivos UI (`src/components/ui/`)** controlam seus próprios pesos internamente (`font-medium` em Button, Badge, Label, CardTitle, etc.). Isso é canônico — não alterar.
  - **Feature components** não devem usar `font-medium`, `font-semibold`, `font-bold`, `text-xs`, `text-sm`, `text-base`, `text-lg`, `tracking-*` ou `uppercase` diretamente. Mapear a um nível semântico da tabela acima.

## 5. Convenções obrigatórias
- **Cores:** Obrigatório usar a escala lógica (`background`, `foreground`, `primary`, `secondary`, `muted`, `destructive`, `success`, `warning`).
- **Tipografia:** Usar as classes utilitárias semânticas (`.text-display`, `.text-heading`, `.text-subheading`, `.text-body`, `.text-label`, `.text-caption`, `.text-hint`) em vez de combinações ad-hoc de `text-*` + `font-*`. Cor tipográfica é composicional — compor com `text-foreground` ou `text-muted-foreground` separadamente. Ver seção 4.6.
- **Radius:** Guiado através do token padrão global (`0.5rem` = `rounded-lg`). Proibido estampar classes predefinidas soltas (ex. `rounded-lg`, `rounded-xl`) fora do componente base. **Exceção estrutural:** elementos que cobrem fisicamente um primitive (ex: overlay `<Link>` absoluto sobre `<Card>`) devem usar o radius do primitive que revestem — `rounded-xl` para `<Card>`, `rounded-lg` para demais shapes. Essa correspondência é estrutural, não estética. **Nota sistêmica:** o primitivo `<Card>` usa `rounded-xl` (0.75rem) como seu radius canônico e estabelecido. O token `0.5rem` orienta elementos genéricos; quando um primitive define seu próprio radius, esse valor é a referência para tudo que o compõe ou reveste.
- **Hierarquia de superfície:** Dois padrões são reconhecidos e mutuamente exclusivos por nível:
  - **Nível 1 — Contêiner de seção** (grupo lógico com título, descrição e conteúdo relacionado): obrigatório usar o primitivo `<Card>`. Proibido reimplementar com `div.rounded-* border bg-card`. `<Card>` pode ser usado sem `CardHeader` interno quando o título do grupo está imediatamente fora do Card no mesmo bloco visual coeso (ex: seção com `<h2>` externo + `<Card>` como container de lista). Proibido usar `<Card>` sem `CardHeader` como substituto de `div.rounded-md border` em wrappers de tabelas sem título.
  - **Nível 2 — Contêiner de tabela inline** (wrapper direto de `<Table>` sem título próprio): aceito o padrão `div.rounded-md border` sem fundo explícito. Proibido usar `<Card>` apenas para envolver uma `<Table>` sem `CardHeader`.
- **Shadows:** Mantidas inerentes aos tokens. O sistema usa `opacity: 0` indicando intencionalmente estética de *flat design*. Proibido forçar sombras artificiais soltas.
- **Spacing/Size:** Aceito e documentado o tamanho `size="sm"` como escala predominante nos componentes UI interativos.
- **Variants:** Só devem ser consumidas mediante tipagem restrita do CVA do componente. Invenções como `variant="floating"` são proibidas.
- **States (Hover/Focus/Active/Disabled):** Requer padrão consistente. Obrigatório usar a semântica de `ring` (ex: `focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2`) via CVA. O uso de `focus-visible:outline-*` — mesmo quando emprega o token `outline-ring` — é proibido como substituto do `ring`.
- **Formulários:** Uso exclusivo e incontornável do padrão `field.tsx` (`FieldGroup`, `Field`, `FieldLabel`, `FieldError`). Redes de formulário em grids soltos são depreciadas. Para texto de dica abaixo de um campo (hint), usar obrigatoriamente `<FieldDescription>` de `field.tsx`. Proibido usar `<p className="text-xs text-muted-foreground">` como substituto de `FieldDescription` dentro de um `<Field>`.
- **Listas de entidades:** Para linhas repetitivas de entidades (pessoas, receitas, itens de lixeira, resultados de busca, previews de mapeamento), usar obrigatoriamente o padrão `item.tsx` (`ItemGroup`, `Item`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`, `ItemHeader`, `ItemFooter`). O `<Item>` é polimórfico via `render` — usar `render={<Link>}` para linhas navegáveis. Variante `outline` para listas com destaque de borda; `muted` para listas em contexto de sheet/drawer; `default` para listas em containers já delimitados.
- **Acessibilidade:** Elementos interativos não devem ocultar seus anéis de foco. Containers que usam `opacity-0` para efeito hover **devem** incluir `focus-within:opacity-100` para garantir visibilidade ao teclado (ex: `opacity-0 group-hover:opacity-100 focus-within:opacity-100`).
- **Tooltips:** O atributo HTML `title` é proibido como mecanismo de tooltip em elementos interativos. Usar obrigatoriamente o primitivo `<Tooltip>/<TooltipTrigger asChild>/<TooltipContent>` de `@/components/ui/tooltip`. Razão: `title` não é exibido em foco de teclado nem em touch, falha WCAG 1.4.13, e não respeita o tema do design system. Para botões exclusivamente de ícone, complementar com `aria-label` além do `<Tooltip>`.
- **Navegação Polimórfica:** Para exibir links com aparência de botões, use a prop `render` (ou equivalente `asChild`) do primitivo `Button` encapsulando o `Link` (ex: `<Button render={<Link to="/rota">...</Link>} />`). Jamais aninhe tags iterativas quebrando a semântica de acessibilidade HTML nativa. **Distinção obrigatória:** `render={<Link>}` é exigido quando o destino é uma URL fixa navegável (usuário pode abrir em nova aba, copiar link). `onClick={() => navigate(...)}` é aceito para navegação imperativa contextual — cancel de formulário, redirect pós-ação assíncrona, ou quando a rota depende de lógica de estado em execução.
- **`className`:** Passado como prop para organizar localmente a interface estrutural, jamais para reespecificar a intenção do componente.
- **HTML cru:** Uso de native interativo tag (`<button>`) é proibido para montar UI local se houver um primitivo `Button` apto a atender, exceto em integrações profundas onde o primitive causa bugs inadiáveis.
- **`cn()`:** Exigido globalmente para interpolações dinâmicas de estados com `className`.
- **Naming semântico:** Declaradores e atributos deverão relatar o estado de intenção (ex: `status="success"`) e nunca a aparência literal (`color="green"`).
- **Formatação de nomes para exibição:** Strings provenientes de campos de banco armazenados em caixa alta (ex: `nmGuerra`, `full_name`) devem ser normalizadas para Title Case via `toNameCase()` de `@/lib/utils` antes de qualquer renderização. Não aplicar a siglas e abreviaturas (ex: `sgPosto` — `"CAP"`, `"TEN"`).

## 6. Proibições explícitas

### 6.1 Regras estruturais (todas as camadas)
- **Proibido** usar classes de cor Tailwind diretamente (ex: `bg-green-500`, `ring-purple-500`). Usar tokens semânticos.
- **Proibido** enviar propriedades de variant não estabelecidas no construtor CVA (ex: `variant="floating"`).
- **Proibido** concatenação nativa de strings para classes dinâmicas. Usar `cn()`.
- **Proibido** aninhar tags HTML interativas (ex: `<Link><Button>...</Button></Link>`). Usar `render` ou `asChild`.
- **Proibido** reimplementar patterns existentes: `div.flex.border.rounded` para listas → usar `<Item>`; `<Label>` + tag de erro solta → usar `field.tsx`; `<p className="text-xs ...">` como hint → usar `<FieldDescription>`.
- **Proibido** usar o atributo `title` como tooltip. Usar o primitivo `<Tooltip>`.

### 6.2 Fronteira tipográfica — a regra única

**Em feature components (`routes/`, `components/features/`, `components/layout/`):**

Proibido usar classes tipográficas brutas do Tailwind. Toda tipografia deve ser expressa via classe semântica (`.text-display` a `.text-hint`). Isso inclui:

| Proibido em features | Por quê | Usar |
|---------------------|---------|------|
| `font-medium`, `font-semibold`, `font-bold` | Peso sem nível semântico | `.text-subheading` (500), `.text-heading` (600), `.text-display` (700) |
| `text-xs`, `text-sm`, `text-base`, `text-lg` | Tamanho sem nível semântico | Classe semântica correspondente ao uso |
| `tracking-tight`, `tracking-wide`, `tracking-widest` | Tracking é interno às classes semânticas | `.text-label` (tracking-label), `.text-heading`/`.text-display` (tracking-tight) |
| `uppercase` | Reservado a `.text-label` | `.text-label` |
| `opacity-50`/`60`/`70` em texto | Simula muted sem semântica | `text-muted-foreground` ou `.text-caption`/`.text-hint` |
| `text-foreground/50`, `/60`, `/70` | Opacidade fracionada em cor | `text-muted-foreground` |
| `font-extrabold`, `font-black` | Fora do contrato (pesos: 400, 500, 600, 700) | Não existe nível semântico — reprojetar |

**Em primitivos UI (`components/ui/`):** pesos, tracking e tamanhos diretos são válidos — primitivos controlam sua própria tipografia internamente.

**Exceção estrutural:** `opacity-50` em estados `disabled`/`aria-disabled` é comportamento de componente, não simulação de muted. Primitivos controlam isso via CVA ou data-attributes.

## 7. Critérios de decisão

- **"Devo criar variant?"**
  - A variação impacta múltiplos domínios e faz sentido no nível do sistema? **Sim:** Adicione a variant via CVA no primitive.
  - A variação soluciona apenas um layout específico de tela? **Não:** Use `className` (se for espaçamento/layout) ou um wrapper (caso as cores se repitam).

- **"Devo criar wrapper semântico?"**
  - O conjunto de componentes (icone + texto + background) repete 3 ou mais vezes com a mesma área de negócio? **Sim:** Criar Wrapper em `layout/` (se de layout global) ou `features/` (se de domínio específico).
  - É de uso único? **Não:** Mantenha na pasta feature.

- **"Devo usar config hardcoded ou token semântico?"**
  - **Sempre o token.** Caso falte semântica para um alerta/status, adicione um alias global (ex: `--success` no CSS) e não `bg-green-500` na view.

- **"Devo usar primitive ou elemento HTML cru?"**
  - **Sempre o primitivo.** O `<button>` puro é autorizado apenas caso o primitive traga colisão restritiva (ex: renderização customizada interna muito crua, menu headless), contudo o estilo de foco continua sendo semântico.

- **"Essa mudança é local ou sistêmica?"**
  - O botão na view X precisa ficar mais longe da margem? **Local** (`className`).
  - O botão na view X precisa ser amarelo claro para indicar "atenção"? **Sistêmica** (`variant="warning"` no Primitive).

## 8. Política de uso de IA
Ao executar manutenções automáticas, refatorações contextuais ou aditamentos baseados em prompt, a Inteligência Artificial deve atuar da seguinte forma:
- **Priorizar patch mínimo:** Manter alterações focadas. Não realizar redesigns oportunistas que alterem o token ou primitivo base sem ordem explícita.
- **Não fazer redesign:** Respeitar o perfil de tema "flat" com raio curto (0.5rem), contornos enxutos e fundos sóbrios.
- **Não inventar variants:** É vetado tentar conjecturar saídas criando props arbitrárias que o compilador TS ou o CVA desconhece. Se não existe a variant, ajuste o nível interno ou proponha explícito.
- **Não expandir vocabulário visual:** As propriedades e cores listadas no token system esgotam a visualidade permitida. A IA não está apta a propor bordas esfumaçadas ou gradientes exóticos locais.
- **Alinhar ao estilo base/puro:** Traduzir imediatamente qualquer valor absoluto (`emerald-500`) em refatorações para seu equivalente semântico daquele momento.
- **Preservar comportamento:** Se um botão precisava receber onClick, Type e Refs, a abstração wrapper ou primitiva que o substitui deve manter o signature de API de forma idêntica e tipada.

## 9. Checklist de revisão
- [ ] O código utiliza apenas tokens semânticos (zero `bg-red-500`, `text-blue-600` puros)?
- [ ] As variants chamadas existem formalmente no componente importado?
- [ ] Condicionais de CSS utilizam `cn()` ao invés de interpolações literais de strings com condições lógicas brutas?
- [ ] Tipografia em features usa exclusivamente classes semânticas (`.text-display` a `.text-hint`)? Zero `font-medium`/`font-semibold`/`text-xs`/`text-sm` direto?
- [ ] Cor tipográfica composta separadamente (`text-foreground`, `text-muted-foreground`) — não embutida na classe semântica?
- [ ] O componente está acessível e mantém indicadores de foco (focus-visible)?
- [ ] Tooltips em elementos interativos usam o primitivo `<Tooltip>` (não o atributo `title`)?
- [ ] Formulários adotaram as instâncias do `field.tsx` (`FieldGroup`, `Field`, `FieldLabel`, `FieldDescription` para hints)?
- [ ] Listas de entidades usam `ItemGroup` + `Item` + slots semânticos em vez de `div.border.rounded-md.p-3`?
- [ ] Foi verificado se a mudança justifica uma abstração de primitive `CVA` ou apenas um `className` de espaçamento de feature/tela?

## 10. Referências de implementação
- **Wrappers semânticos de referência:** `AppShell.tsx` e `PageHeader.tsx` (em `src/components/layout/`) — alta coesão, baixo acoplamento. Usar como modelo ao extrair novos wrappers.
- **Formulário de referência:** `AddUserDialog.tsx` — uso correto de `FieldGroup`, `Field`, `FieldLabel`, `FieldError` com TanStack Form + Zod. Para hints de campo, ver `ProductItemForm.tsx` — uso correto de `FieldDescription`.
- **Lista de entidades de referência:** `TrashDrawer.tsx` — uso correto de `ItemGroup`, `Item variant="muted"`, `ItemHeader`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemFooter` em drawer. `PresenceTable.tsx` — uso correto de `Item variant="outline"` com `ItemMedia` + `ItemContent` para cards de pessoa com cor dinâmica via `className`. `ApplyTemplateDialog.tsx` — uso correto de `Item size="xs" variant="default"` para linhas de preview dentro de container scrollável.
- **Tooltip de referência:** `weekly-menus/$weeklyMenuId.tsx` — uso correto de `<Tooltip>/<TooltipTrigger asChild>/<TooltipContent>` em botões de ação.
- **Card clicável com overlay de referência:** `hub.tsx` — uso correto de overlay `<Link>` absoluto sobre `<Card>` com `rounded-xl` correspondente ao primitive, `focus-visible:ring-[3px]`, `overflow-visible`, e `hover:ring-2` com token semântico de cor via `CARD_HOVER_CLASSES`.
