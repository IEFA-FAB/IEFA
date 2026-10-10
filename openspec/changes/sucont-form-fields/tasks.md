# Tasks

## 1. Primitivos

- [ ] 1.1 [sucont] `Input` com `size` (`default`/`sm`) via `data-size`, omitindo o `size` nativo do tipo; verificar com `bun run typecheck` e um uso de cada size lado a lado com `SelectTrigger` de mesmo size (mesma altura no screenshot)
- [ ] 1.2 [sucont] Estado somente leitura (`read-only:`) em `Input` e `Textarea`; verificar no navegador que o campo `readOnly` aceita seleção e cópia, não aceita edição e se distingue de editável e de desabilitado, no claro e no escuro
- [ ] 1.3 [sucont] Portar `input-group.tsx` do sisub com os tokens do sucont e foco no grupo (`has-[:focus-visible]`); verificar por Tab que o anel aparece no contorno do grupo e que o botão interno recebe foco próprio
- [ ] 1.4 [sucont] `Combobox`: remover `inputClassName` e adicionar `size`; verificar que `bun run typecheck` aponta todos os usos de `inputClassName` (eles migram na 3.3)
- [ ] 1.5 [sucont] Registrar `size`, somente leitura e `InputGroup` no §4.2 do `STYLE_CONTRACT.md`; verificar que o contrato não cita mais `input-group` como inexistente no §8

## 2. Área `components/`

- [ ] 2.1 [sucont] Grupo de 4 campos da mensagem (`analista/ug-card`, `analista/consolidated-message-card`, `cruzamento/Report`): primitivo puro, `size` único na faixa; verificar mesma altura nos quatro campos por screenshot claro e escuro
- [ ] 2.2 [sucont] `admin/people-manager` e filtro de `cruzamento/Report`: primitivo puro e filtro com `Label`; verificar que nenhum foco usa `tech-cyan`/`action`
- [ ] 2.3 [sucont] Busca de `admin/permissions-manager`, `analista/chat-assistant` e `hub-layout` para `InputGroup`; verificar foco visível por Tab no cabeçalho do hub e valor digitado na cor do texto principal
- [ ] 2.4 [sucont] Baixar o baseline (`bun scripts/lint-tailwind.ts sucont --update`); verificar que `no-restyle` caiu e que `bun run lint:tailwind` passa

## 3. Área `routes/`

- [ ] 3.1 [sucont] `conta-generica` (`MessageControls`): trigger e inputs em `size="sm"`, sem `inputCls`; verificar mesma altura na faixa
- [ ] 3.2 [sucont] `workspace` e `reports`: formulário de criação com primitivo puro; `<textarea>` nativo para `Textarea`; select de rodapé em `size="sm"` com valor na cor do texto; verificar foco visível por Tab em todos os campos
- [ ] 3.3 [sucont] `subitens-genericos`: tirar o `font-mono` (ou trocar por `tabular-nums` onde o valor é número em coluna) e os `inputClassName` restantes; `documentacao`: `<textarea>` nativo para `Textarea`
- [ ] 3.4 [sucont] Baixar o baseline; verificar `bun run lint:tailwind`

## 4. Ferramentas portadas

- [ ] 4.1 [sucont] Modais (`ConsolidatedMessageModal`, `UgDetailsModal`, `SiafiMessageModal`): primitivo puro; nº atribuído com `readOnly`; prazo do `SiafiMessageModal` em `type="date"`; verificar que o valor salvo do prazo segue o formato que o modal já gravava
- [ ] 4.2 [sucont] Buscas do `OperationalPanel` e `UgDetailsModal` para `InputGroup`; verificar foco visível
- [ ] 4.3 [sucont] Filtros em pílula de `AnalyticalPanel`, `ManagerialPanel` e `OperationalPanel` para `Label` + seletor `size="sm"`; toolbar de `ChartWrapper` e `RankingList` para `size="sm"`; verificar foco visível e mesma altura na toolbar
- [ ] 4.4 [sucont] `AuthScreen`: ícone e "mostrar senha" com `InputGroup`; erro por `aria-invalid` em vez de `border-destructive`; verificar com leitor de tela (ou com o atributo no DOM) que o campo inválido é anunciado
- [ ] 4.5 [sucont] `AIAssistant`: campo de mensagem com `InputGroup` e botão de envio com `variant` do `Button` (sem `bg-tech-blue text-white`); verificar foco visível
- [ ] 4.6 [sucont] Baixar o baseline; verificar `bun run lint:tailwind`

## 5. Contrato e integração

- [ ] 5.1 [sucont] §8 do `STYLE_CONTRACT.md`: registrar a dívida zerada e a regra "campo não recebe aparência por `className`"; verificar que a contagem citada bate com o baseline
- [ ] 5.2 [sucont] Varredura final: zero `focus:`/`focus-visible:`, `bg-*` e `text-body`/`text-caption` em `className` de campo (`rg` nos usos); verificar que sobra só layout
- [ ] 5.3 [root] `bun run check`, `bun run lint --concurrency=2` e `bun run test --concurrency=2` verdes

## Workflow follow-up

- Abrir, separado e para o mantenedor, o PR de gate que torna `no-restyle` erro para os campos do sucont em `.oxlintrc.tailwind.jsonc`.
- Arquivar a change depois que os PRs de área entrarem.
