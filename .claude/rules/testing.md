---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/vitest.config.ts"
  - "**/src/test/**"
  - "TESTING.md"
---

# Testes

Referência completa: `TESTING.md` na raiz.

- Runners: `bun test` em 13 workspaces (script já passa `--no-env-file`); vitest em `sisub` e
  `assignment-selection`. Não rodar `bunx vitest run` da raiz: o alias `@/` não resolve e dá ~32
  falsos positivos.
- **`.env` no disco não entra na suíte, e a trava tem de continuar assim.** O `loadEnv` do
  `vitest.config.ts` só entrega credencial com `*_RUN_INTEGRATION=true`; as credenciais são lidas num
  lugar só (`src/test/supabase.ts`). Não importar `@/server/*` de teste unitário: extraia a função
  pura para `src/lib/` e teste ali.
- **Integração roda contra o banco real** (Supabase de produção), com `sql.begin` + savepoints +
  sentinel de rollback. Não propor Postgres efêmero como substituto. Sem
  `SISUB_RUN_INTEGRATION`/`SISUB_DATABASE_URL` os testes ficam em skip, o que é esperado. Desconfie de
  run de integração rápido demais: "N skipped" parece verde.
- Teste de integração pesado declara o próprio timeout (`test("…", fn, 60_000)`); o global de 15 s é
  calibrado para unit.
- Tempo retroativo em integração usa fração do dia civil de Brasília, nunca `now() - interval '5
  hours'` nem `current_date - 1`: quebram entre 00h e 05h de Brasília.
- `mock.module` do bun:test vale para o processo inteiro. Mock declara todos os exports do módulo real;
  ao adicionar export a um módulo mockado, procure os mocks
  (`grep -rn 'mock.module(".*<modulo>' --include='*.test.ts'`). Falha de ordem reproduz com
  `bun test --no-env-file --randomize`.
- No bun:test, `expect(p).rejects` gira o event loop na hora. Com relógio manual, capture antes
  (`const outcome = p.then(() => null, (e) => e)`), avance o relógio e só então faça o `expect`.
