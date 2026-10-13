# Proposal

## Why

Os campos de formulário do `sucont` (`Input`, `SelectTrigger`, `Combobox`, `Textarea`) carregam ~520
restilos por `className`. É a maior dívida isolada do lint de Tailwind (`no-restyle`) no app. Três
auditorias em paralelo, uma por área (`components/`, `routes/`, ferramentas portadas), mostraram que
quase nada disso é design. São receitas copiadas do upstream das ferramentas portadas, e elas
produzem defeitos que o usuário vê:

- **Foco invisível pelo teclado** em campo embutido em contêiner (busca do `HubLayout`, chat do
  `AIAssistant`, filtros em pílula dos painéis do auditor): o anel é zerado e o contêiner não tem
  `focus-within`. Falha no critério 2.4.7 da WCAG.
- **Três cores de foco** para o mesmo estado (`action`, `tech-cyan`, `tech-blue`, além do `ring` do
  primitivo), e anel aparecendo no clique do mouse (`focus:` em vez de `focus-visible:`).
- **Fundo "preenchido" que só existe no tema claro**: o `dark:bg-input/30` do primitivo vence o
  `bg-muted/50`/`bg-card` da receita.
- **Fonte de 14px no mobile** (`text-body`), que derruba os 16px do primitivo e faz o iOS dar zoom ao
  focar o campo.
- **Alturas desalinhadas na mesma faixa de controles**: trigger com `h-auto` (~26px) ao lado de
  `Input` `h-9` (36px); input com `py-1.5` e 35px ao lado de trigger com 36px.
- **Valor digitado ou selecionado com cara de placeholder** (`text-muted-foreground` no valor).
- **Erro de login sem semântica**: a borda vermelha vem por `className`, sem `aria-invalid`, e o
  leitor de tela não anuncia nada.
- **O mesmo grupo de 4 campos** (nº da mensagem, data, tipo, prazo) aparece em 5 telas, com 4
  receitas diferentes.

O que se repete de fato tem três formas, e nenhuma delas existe no primitivo. A primeira é
**densidade**: falta `size="sm"` no `Input`, e o trigger tem `sm`, mas ninguém usa. A segunda é
**ícone ou ação dentro do campo**: busca com lupa, senha com "mostrar", chat com "enviar". O
STYLE_CONTRACT registra `field.tsx`/`input-group` como inexistentes no app. A terceira é o **campo
somente leitura**, pintado à mão.

## What Changes

- `Input` ganha `size` (`default` e `sm`), espelhando o `SelectTrigger`, e um estado somente leitura
  visível (`read-only:`) no próprio primitivo.
- Entra `InputGroup` no sucont (`InputGroup`, `InputGroupAddon`, `InputGroupInput`,
  `InputGroupButton`, `InputGroupText`), portado do sisub, que já o usa. O foco do campo interno
  acende o contorno do grupo; o botão interno tem foco próprio.
- `Combobox` ganha `size` e texto de 16px no mobile. `inputClassName` sai junto com a migração dos
  três painéis que o usam. O caso "filtro em pílula" passa a ser `Label` + trigger padrão, como
  manda o §4.7 do contrato.
- Migração das receitas, sem receita nova no lugar:
  - formulário padrão (receitas de modal e de card) vira primitivo puro;
  - controles densos em linha (`MessageControls`, toolbar de gráfico e ranking, select de rodapé)
    viram `size="sm"`;
  - busca com ícone, login com ícone e senha, e chat viram `InputGroup`;
  - nº atribuído vira `readOnly`;
  - borda de erro vira `aria-invalid`.
- `<textarea>` nativo nas rotas (`workspace`, `reports`, `documentacao`) vira o primitivo `Textarea`.
- O prazo do `SiafiMessageModal` passa a `type="date"`, como nos outros dois modais que pedem o
  mesmo dado. O texto da mensagem continua citando a data em `DD/MM/AAAA`.
- O lint passa a ser o guarda: o baseline de `no-restyle` do sucont desce, e o STYLE_CONTRACT
  registra que campo do sucont não recebe aparência por `className`.

## Capabilities

### New Capabilities
- `sucont-form-fields`: como os campos de entrada do hub SUCONT se comportam para o usuário
  (foco visível e único, densidade, ícone e ação dentro do campo, somente leitura, erro anunciado,
  legibilidade no mobile e no tema escuro).

### Modified Capabilities
<!-- nenhuma: não há spec de UI do sucont em openspec/specs/ -->

## Não-objetivos

- **Não** redesenhar o visual do sucont nem trocar tokens de cor. A meta é que os campos sigam o
  primitivo que já existe.
- **Não** criar variante "preenchida" (`filled`) nem "sem borda" (`ghost`) de campo. As auditorias
  não acharam uso consistente: o fundo `muted` só aparece no tema claro, e o próprio contrato remove
  a "pílula sem borda".
- **Não** mexer nos campos do `sisub` nem de outro app, que têm design system próprio.
- **Não** mudar regra de negócio, validação ou dado dos formulários. A única exceção é o
  `type="date"` do prazo, que alinha a entrada ao que os outros modais já aceitam.
- **Não** afrouxar o lint de Tailwind para esses componentes.

## Impact

- **App:** `sucont` apenas.
- **Código:** `apps/sucont/src/components/ui/{input,select,combobox,textarea}.tsx`, novo
  `components/ui/input-group.tsx`, e ~60 pontos de uso em `components/`, `routes/`,
  `analistasaldoalongado/`, `auditor/`, `subitens/` e `auth/`.
- **Docs:** `apps/sucont/STYLE_CONTRACT.md` (§4.2, §4.7 e §8).
- **Lint:** `apps/sucont/tailwind-lint-baseline.json` desce. A meta é tirar de 400 a 450 dos ~520
  avisos de campo.
- **Sem banco, sem API, sem dependência nova:** o `InputGroup` usa só Base UI e `cva`, que já estão
  no app.
