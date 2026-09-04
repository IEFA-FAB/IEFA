# Harness visual

Renderiza componentes reais fora do app, nos dois temas: o módulo `auditor` com
fixture determinística (`main.tsx`, servido em `/`) e a casca do hub com o
catálogo (`hub.tsx`, em `/hub.html`).

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

## A casca do hub (`/hub.html`)

A barra lateral, o cabeçalho e o bloco da conta só aparecem com sessão, e o app
divide o projeto Supabase com produção — criar usuário de teste lá só para olhar
um layout não se justifica. Aqui a sessão vem semeada no cache do react-query, o
router é de memória e as duas server functions do caminho (`auth.fn`,
`legal.fn`) são stubadas em `stubs/`, porque exigiriam o pipeline do TanStack
Start. As variáveis do Supabase vêm fictícias pelo `define` do Vite: o harness
não fala com o banco, então credencial real aqui seria risco sem contrapartida.

Esta tela encontrou dois defeitos que typecheck, build e suíte não viam:

- as regras `a { color: … }` do `styles.css` estavam **fora de camada**, e regra
  sem camada vence qualquer utilitária do Tailwind. Todo `text-*` em `<a>` era
  ignorado — era por isso que os botões do antigo banner, com `text-white`
  escrito no elemento, saíam azul-petróleo sobre fundo escuro;
- `--tech-bg`, o fundo da casca, não tinha valor para o tema escuro. No escuro o
  fundo continuava cinza-claro enquanto o texto virava branco.

O que não cobre: interação, dados reais, SSR e o resto do app. É verificação de
cor e layout, e só.
