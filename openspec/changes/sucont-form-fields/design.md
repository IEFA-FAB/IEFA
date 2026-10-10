# Design

## Context

O sucont usa o sistema visual do sisub ("flat técnico"), mas tem os próprios primitivos em
`apps/sucont/src/components/ui/`. Estado atual dos campos:

- `Input`: `h-9 rounded-md border-input bg-transparent dark:bg-input/30 px-3 text-base md:text-sm`,
  com foco em `focus-visible:ring-3 ring-ring/50` e erro por `aria-invalid`. **Sem `size`.**
- `SelectTrigger`: o mesmo desenho, com `size` `default` (h-9) ou `sm` (h-8) via `data-size`. As
  receitas encolhem o trigger com `data-[size=default]:h-auto` em vez de usar `size="sm"`.
- `Combobox`: expõe `inputClassName`, cujo comentário admite que existe para o caso "sem borda".
- `Textarea`: existe, mas as rotas usam `<textarea>` nativo.
- `--border` e `--input` têm o mesmo valor nos dois temas, então `border border-border` em campo é
  sempre redundante.
- O sisub já tem `input-group.tsx`. O STYLE_CONTRACT do sucont (§8, "Continua em aberto") registra que
  `field.tsx`/`input-group` faltam e proíbe criar uma terceira convenção.

As auditorias (uma por área) classificaram as ~60 receitas assim: maioria **redundante ou deriva**
(deveria ser o primitivo puro), um bloco de **densidade** (pede `size="sm"`), um de **limitação do
primitivo** (ícone ou ação dentro do campo, somente leitura) e nenhum caso de variante visual nova
com uso consistente. Motivação e defeitos: ver proposal.md, seção "Why".

## Goals / Non-Goals

**Goals:**
- Cada requisito de `specs/sucont-form-fields/spec.md` passa a ser garantido pelo **primitivo**. O
  ponto de uso não precisa lembrar de nada.
- Depois da migração, nenhum campo do sucont recebe classe de aparência por `className`. Só passa
  layout: largura, margem, `flex-1`.

**Non-Goals:**
- Unificar os primitivos do sucont com os do sisub num pacote compartilhado: os dois apps evoluem em
  ritmos diferentes, e o contrato do sucont tem dívida própria.
- Trocar Base UI por outra base ou mudar o comportamento de `Select`/`Combobox`.

## Decisions

### 1. `size` no `Input` por `data-size`, igual ao `SelectTrigger`
`Input` ganha `size?: "default" | "sm"`, exposto em `data-size`, com
`data-[size=default]:h-9 data-[size=sm]:h-8`. O `px` do `sm` cai para `px-2.5`. A tipografia
continua `text-base md:text-sm` nos dois sizes, e é isso que impede o zoom do iOS (spec: "Legível no
mobile").
- *Alternativa:* `cva` com `size` como variante. Fica descartada porque o `SelectTrigger` já usa
  `data-size`, e o mesmo mecanismo nos dois deixa a regra "campo e seletor da mesma faixa usam o
  mesmo `size`" óbvia na leitura.
- *Conflito com o atributo HTML `size` do `<input>`:* o atributo nativo (largura em caracteres) não
  é usado no app. O tipo omite `size` de `ComponentProps<"input">`.

### 2. Somente leitura no primitivo, por `read-only:`
`Input` e `Textarea` ganham `read-only:bg-muted read-only:cursor-default read-only:focus-visible:ring-0`,
mais a borda tracejada `read-only:border-dashed`. Fica distinguível de editável sem parecer
desabilitado: continua selecionável e copiável, sem `opacity`.
- *Alternativa:* prop `variant="readonly"`. Fica descartada porque duplicaria o atributo `readOnly`,
  que já é a fonte da verdade e o que a tecnologia assistiva lê.

### 3. `InputGroup` portado do sisub
Copiar `apps/sisub/src/components/ui/input-group.tsx` para o sucont e trocar os tokens de raio e
altura pelos do sucont (`rounded-md`, `h-9`/`h-8` acompanhando o `size`). O grupo é que desenha
borda, fundo e foco (`has-[:focus-visible]:ring-3 ring-ring/50`). O `InputGroupInput` interno não
tem borda nem anel. Isso resolve de uma vez busca com lupa, senha com "mostrar", chat com "enviar" e
os filtros em pílula, que são os casos de foco invisível.
- *Alternativa:* `startIcon`/`endIcon` como props do `Input`. Fica descartada porque não cobre ação
  clicável (mostrar senha, enviar) nem `Textarea`, e criaria uma terceira convenção, que o contrato
  proíbe.

### 4. `Combobox` sem `inputClassName`, com `size`
A prop sai. O caso "filtro em pílula" dos painéis do auditor (receita C) passa a ser `Label` +
`Combobox`/`Select` padrão em `size="sm"`, como o §4.7 já manda para filtro de conteúdo.
- *Alternativa:* manter a pílula com um `variant="inline"`. Fica descartada porque o contrato lista
  a pílula sem borda entre o que foi removido, e ela é a origem do foco invisível.

### 5. Foco: só o do primitivo
Todo `focus:*` e `focus-visible:*` de ponto de uso sai, e a cor única é `ring`. As receitas com
`tech-cyan`/`tech-blue`/`action` no foco não viram token novo, porque `action` é cor de ação, não de
foco (spec: "Uma única cor de foco").

### 6. Fundo: nenhum no ponto de uso
`bg-card`, `bg-muted/50` e `dark:bg-card` saem. O primitivo é transparente sobre a superfície no
claro e `input/30` no escuro, o que cumpre "mesma aparência nos dois temas". Superfície tingida em
volta do campo continua sendo decisão do contêiner, não do campo.

### 7. Migração por área, guardada pelo lint
Cada área migra num PR e baixa o baseline de `no-restyle` do sucont. Os primitivos e o
`InputGroup` vão primeiro, sozinhos, porque as áreas dependem deles. Ao final, uma override em
`.oxlintrc.tailwind.jsonc` pode tornar `no-restyle` **erro** para `Input|SelectTrigger|Combobox|Textarea|InputGroup*`
no sucont. Como é definição de gate, essa parte espera o mantenedor.

## Risks / Trade-offs

- **[Mudança visual nas ferramentas portadas]**: campos ficam 1–10px mais altos ou mais baixos,
  perdem o fundo tingido no claro e o texto sobe para 16px no mobile → screenshot antes e depois de
  cada tela tocada, claro e escuro, no PR da área.
- **[Diff maior contra o upstream das ferramentas]**: o `sucont-upstream` compara repositórios de
  origem → o skill confere lógica, não classe. O registro no contrato (§8) explica que o upstream
  nunca é copiado com a receita de `className`.
- **[`read-only:` pega mais do que o pretendido]**: `:read-only` também casa `<input type="checkbox">`
  e similares → o `Input` do sucont não é usado para esses tipos (conferido nas auditorias). Se
  passar a ser, o seletor vira `read-only:not-[type=checkbox]`.
- **[Densidade some onde era desejada]**: a receita R1 tinha ~26px de altura, e o `sm` tem 32px →
  é a menor altura com alvo de toque aceitável. Fica registrado como decisão, sem `xs`.

## Migration Plan

1. PR de primitivos: `Input` com `size` e read-only, `Textarea` com read-only, `InputGroup`,
   `Combobox` com `size`. Sem migração de uso, com screenshot de um uso de cada.
2. PRs de área, um para cada: `components/`, `routes/` (inclui `<textarea>` nativo e `type="date"`
   do prazo) e as ferramentas portadas (`analistasaldoalongado/`, `auditor/`, `subitens/`, `auth/`).
   Cada um baixa o baseline.
3. PR de contrato: §4.2 e §8 do STYLE_CONTRACT, com a regra "campo não recebe aparência por
   `className`". O PR de gate da override do lint vai separado, para o mantenedor.

Rollback: cada PR reverte sozinho. Os PRs de área só dependem do de primitivos.

## Open Questions

- Erro de formulário além do login: as auditorias só acharam `border-destructive` manual no
  `AuthScreen`. Outros formulários podem não validar no cliente. Isso não muda a abordagem
  (`aria-invalid` no primitivo); entra em cada PR de área se aparecer.
