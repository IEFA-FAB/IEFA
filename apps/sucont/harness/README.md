# Harness visual do auditor

Renderiza os componentes do módulo `auditor` com fixture determinística, nos dois
temas, fora do app.

Existe porque **nenhum check enxerga uma cor errada**: `tsgo`, `vite build` e a
suíte passam com um gráfico pintado de branco sobre branco. E a rota `/auditor`
não serve para verificação rápida — exige sessão, grant `sucont` nível 1 e uma
planilha carregada.

Foi este harness que encontrou o motivo de o tema escuro dos gráficos estar
quebrado: `@theme inline` emite `--color-card: var(--card)` no `:root`, e uma
custom property é computada no elemento onde é declarada — então `--color-card`
congela o valor do tema claro e todo descendente herda esse valor já resolvido,
inclusive dentro de `.dark`. Passar `var(--color-*)` para atributo SVG do recharts
prendia o gráfico inteiro no tema claro. O `auditor/theme.ts` usa as variáveis
base (`--card`, `--foreground`, `--series-*`) por causa disso.

```bash
bun run harness:build
bun run harness:serve      # em outro terminal
bun run harness:shot       # PNGs em /tmp, ou passe um diretório
```

O que não cobre: interação, dados reais, SSR e o resto do app. É verificação de
cor e layout dos componentes de gráfico, e só.
