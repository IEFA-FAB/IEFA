# react-doctor no sisub

Config: `doctor.config.json`. Catraca: `react-doctor-baseline.json`, conferida por
`scripts/lint-react-doctor.ts` dentro do `bun run lint` do app.

```bash
bun ../../scripts/lint-react-doctor.ts sisub            # confere a catraca (~20 s, todos os núcleos)
bun ../../scripts/lint-react-doctor.ts sisub --update   # regrava depois de corrigir
bunx react-doctor . --verbose                           # relatório completo, consultivo
```

## Regras na catraca

`react-hooks-js/todo`, `react-hooks-js/set-state-in-effect`, `react-hooks-js/refs` e
`react-doctor/query-mutation-missing-invalidation` ficaram desligadas de jun/2026 a out/2026 (commit
`f7f95e08`, sem motivo registrado). Voltaram ligadas, com a contagem de hoje como teto que só desce:
achado novo falha o lint, e corrigir sem baixar o número também.

Falso positivo não entra no baseline: leva supressão pontual com o motivo, na linha de cima do achado.

```ts
// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- invalida em FolderForm
```

O que ficou no baseline, e por quê:

- **`todo` (89):** construção que o React Compiler ainda não compila — quase tudo `try/finally`
  (66), mais `throw` dentro de `try`, `import()` e variável capturada alterada em closure. Não é
  bug: o componente só deixa de ser memoizado automaticamente. Reescrever `finally` duplicando a
  limpeza em dois ramos piora o código; a contagem cai sozinha quando o compiler suportar a
  construção. A catraca impede que entrem novas.
- **`set-state-in-effect` (30):** a maioria é leitura de API do navegador depois da hidratação
  (`localStorage`, `sessionStorage`, WebGL, data local) ou diálogo que sempre fica
  montado e zera o formulário ao abrir. Trocar cada um por estado derivado ou por `key` no diálogo
  mexe em fluxo de edição; vão sendo resolvidos quando o arquivo for tocado.
- **`refs` (3):** `OccasionMenuEditor` compara `contentSignature` com `savedSignatureRef.current`
  no render para o indicador de pendência. O ref é gravado em efeito e em callbacks sem render
  próprio, então o indicador pode ficar um render atrasado. Passar a assinatura gravada para estado
  acrescentaria um `setState` no efeito de carga e mexeria no autosave; o guarda de saída e o
  autosave leem o ref fora do render e estão certos.

## Padrões para não voltar a cair nas regras

- Valor corrente dentro de efeito (listener ou timer montado uma vez): `useEffectEvent` do React
  (ver `useGlobalBarcodeCapture`, `useRealtimeSubscription`, `CameraScanDialog`).
- Valor corrente fora de efeito (callback estável passado a filho memoizado, timer armado em
  handler, guarda de saída): `useLatest` (`src/hooks/ui/useLatest.ts`). Nunca
  `ref.current = valor` no corpo do componente, nem `useRef` + `useEffect` à mão para isso.
- "Só no cliente" (portal, consulta fora do SSR): `useHydrated` do `@tanstack/react-router`, não
  `useEffect(() => setMounted(true), [])`.
- Estado que zera quando uma prop muda: zere no render ao ver a prop nova (ver `DashboardCard`),
  ou no handler que muda a origem (ver `MenuFindBar`). Num efeito, sai um render com a combinação
  velha.
- Mutation sem invalidação no hook: só quando quem chama invalida (com `await`, porque a ordem
  importa) ou quando a mutation não grava nada lido por consulta; a supressão diz qual dos dois.

## O que continua desligado

- `ignore.files`: saída de build e arquivo gerado (`*.gen.ts`). Não é código do app.
- `react-doctor/no-adjust-state-on-prop-change` em `usePersistentState.ts` e `useChatSession.ts`:
  - `usePersistentState` lê o `sessionStorage` depois da montagem de propósito: ler no render
    diverge do HTML do servidor na hidratação. O valor padrão por um render é o custo aceito.
  - `useChatSession` empurra para o `useChat` (estado externo, do TanStack AI) as mensagens que
    chegam do banco; não há como derivar no render o estado de outra biblioteca.
