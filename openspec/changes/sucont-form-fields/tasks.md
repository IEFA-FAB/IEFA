# Tasks

## 1. Primitivos

- [ ] 1.1 [sucont] `Input` com `size` (`default`/`sm`) via `data-size`, omitindo o `size` nativo do tipo; verificar com `bun run typecheck` e um uso de cada size lado a lado com `SelectTrigger` de mesmo size (mesma altura no screenshot)
- [ ] 1.2 [sucont] Estado somente leitura (`read-only:not-disabled:`) em `Input` e `Textarea`, mantendo o anel de foco; verificar no navegador que o campo `readOnly` aceita seleção e cópia, não aceita edição, mostra o anel pelo Tab e se distingue de editável e de desabilitado (o `Input disabled` do SARAM em `military-record.tsx` não fica tracejado), no claro e no escuro
- [ ] 1.3 [sucont] Portar `input-group.tsx` do sisub com os tokens do sucont e o seletor de foco do sisub (`has-[[data-slot=input-group-control]:focus-visible]`); verificar por Tab que o anel aparece no contorno do grupo quando o foco está no campo, e só no botão (sem anel no grupo) quando está no botão interno
- [ ] 1.4 [sucont] `Combobox`: adicionar `size` e trocar o campo de busca para `text-base md:text-sm` (`inputClassName` continua até a 4.3); verificar `bun run typecheck` e, no celular ou no emulador, que focar a busca não dá zoom
- [ ] 1.5 [sucont] Registrar `size`, somente leitura e `InputGroup` no §4.2 do `STYLE_CONTRACT.md`, e no §8 ("Continua em aberto") registrar que o `InputGroup` veio do sisub e que `field.tsx`/`item.tsx` seguem faltando; verificar que o §8 não contradiz o §4.2

## 2. Área `components/`

- [ ] 2.1 [sucont] Grupo de 4 campos da mensagem (`analista/ug-card`, `analista/consolidated-message-card`, `cruzamento/Report`): primitivo puro em `size="sm"` (design, decisão 6); verificar mesma altura nos quatro campos por screenshot claro e escuro
- [ ] 2.2 [sucont] `admin/people-manager` e filtro de `cruzamento/Report`: primitivo puro e filtro com `Label`; verificar que nenhum foco usa `tech-cyan`/`action`
- [ ] 2.3 [sucont] Busca de `admin/permissions-manager`, `analista/chat-assistant` e `hub-layout` para `InputGroup`; verificar foco visível por Tab no cabeçalho do hub e valor digitado na cor do texto principal
- [ ] 2.4 [sucont] Baixar o baseline (`bun scripts/lint-tailwind.ts sucont --update`); verificar que `no-restyle` caiu e que `bun run lint:tailwind` passa

## 3. Área `routes/`

- [ ] 3.1 [sucont] `conta-generica` (`MessageControls`): trigger e inputs em `size="sm"`, sem `inputCls`; verificar mesma altura na faixa
- [ ] 3.2 [sucont] `workspace` e `reports`: formulário de criação com primitivo puro; `<textarea>` nativo para `Textarea`; select de rodapé em `size="sm"` com valor na cor do texto; verificar foco visível por Tab em todos os campos
- [ ] 3.3 [sucont] `subitens-genericos`: tirar o `font-mono` (ou trocar por `tabular-nums` onde o valor é número em coluna); `documentacao`: `<textarea>` nativo para `Textarea`; verificar foco visível nos campos tocados
- [ ] 3.4 [sucont] Baixar o baseline; verificar `bun run lint:tailwind`

## 4. Ferramentas portadas

- [ ] 4.1 [sucont] Modais (`ConsolidatedMessageModal`, `UgDetailsModal`, `SiafiMessageModal`): grupo da mensagem em `size="sm"`; nº atribuído com `readOnly`; prazo do `SiafiMessageModal` em `type="date"`, com o estado em ISO e o `generateMessage` formatando `DD/MM/AAAA` (design, decisão 7); verificar com teste que o padrão inicial aparece preenchido e que o texto da mensagem cita `DD/MM/AAAA`
- [ ] 4.2 [sucont] Buscas do `OperationalPanel` e `UgDetailsModal` para `InputGroup`; verificar foco visível
- [ ] 4.3 [sucont] Filtros em pílula de `AnalyticalPanel`, `ManagerialPanel` e `OperationalPanel` para `Label` + seletor `size="sm"`, e remover `inputClassName` do `Combobox` no mesmo PR; toolbar de `ChartWrapper` e `RankingList` para `size="sm"`; verificar `bun run typecheck`, foco visível e mesma altura na toolbar
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
