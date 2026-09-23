@AGENTS.md

## Claude Code neste repo

<!-- O conteúdo compartilhado com outros agentes está em AGENTS.md (importado acima). Aqui fica só
o que depende do harness do Claude Code. -->

- **Regras por área** ficam em `.claude/rules/` com `paths:` no frontmatter; carregam quando você lê
  um arquivo daquela área. Regra nova de área vai para lá, não para este arquivo.
- **Hooks do projeto** (`.claude/settings.json`, scripts em `.claude/hooks/`):
  - `guard.ts` recusa editar arquivo gerado, push na `main`, commit com `--no-verify`, vitest da
    raiz, `supabase db reset` remoto e `migration repair --status reverted`. Se ele recusar, siga o
    caminho que a mensagem indica, sem contornar.
  - `format.ts` formata e organiza os imports do arquivo editado. O lint continua sendo
    `bun run lint`.
  - `session-start.ts` avisa quando falta `node_modules` ou a sessão está na `main`.
- **Skills do projeto:** `ship-pr` (do diff verde ao PR revisado), `openspec-*` (propostas de
  mudança), `impeccable` (UI), `sucont-upstream`, `split-commits`.
- **Revisão:** `/code-review` antes de pedir merge; na revisão, reporte tudo o que achar e filtre
  depois, em vez de pedir só achados graves.
- **MCP:** o servidor `supabase` aponta para o banco compartilhado (produção + treino). Leitura é
  livre; `apply_migration`/`execute_sql` com escrita segue a ordem declara → aplica → mergeia e só
  roda com pedido explícito.
