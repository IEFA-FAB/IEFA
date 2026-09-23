---
name: ship-pr
description: Leva uma mudança pronta até um PR que o mantenedor só precisa aprovar — branch, gates locais iguais aos do CI, commit, PR com evidência, /code-review com os achados no PR e conferência dos checks. Use quando o pedido for "abre o PR", "manda pra revisão", "finaliza e sobe", "faz o PR e o merge" ou quando uma tarefa de código terminar e for hora de entregar.
argument-hint: "[merge]"
---

# Ship PR

Objetivo: o mantenedor abre o PR e encontra tudo de que precisa para decidir o merge sem rodar
nada. Cada passo abaixo existe porque, sem ele, a verificação voltava para o mantenedor.

## 1. Branch e escopo

- Se estiver na `main`, crie a branch (`<tipo>/<assunto-curto>`) antes de qualquer commit.
- `git status` e `git diff --stat`: o diff tem só o que a tarefa pede? Mudança alheia ao escopo
  vira outro PR.

## 2. Gates locais (os mesmos do CI)

Rode, a partir da raiz, e só avance com tudo verde:

```bash
bun run format:check
bun run lint --concurrency=2
bun run typecheck --concurrency=2
bun run test --concurrency=2
```

Se o diff tocar `Dockerfile`/manifesto/package.json de workspace: `bun run check:deploy`.
Se tocar `packages/database/supabase/migrations`: `bun --filter @iefa/database audit:rls` e a
ordem declara → aplica → mergeia de `.claude/rules/database.md`. Não aplique migration sem pedido.
Se tocar UI: rode o app e confira a tela alterada no navegador (skill `run`), com screenshot.

Falha que não é do seu diff (flake conhecido, teste que bate em produção): registre no PR com a
evidência em vez de ignorar em silêncio.

## 3. Commit

Conventional Commits em inglês, escopo válido (`database`, não `db`). Um commit por intenção; o
merge é squash, então o título do PR é o que fica na `main`.

## 4. PR

`gh pr create --base main` com título no mesmo formato do commit e corpo com:

- **O quê e por quê** (2–5 linhas).
- **Como verifiquei**: os comandos do passo 2 e o resultado; screenshot se for UI.
- **Risco e rollback**: migration? mudança de permissão? deploy de quais apps (paths-filter)?
- **Pendências para o mantenedor**: só o que exige humano (aplicar migration, segredo, decisão de
  produto). Se não houver, diga "nenhuma".

## 5. Revisão

Rode `/code-review` sobre o PR e publique os achados como comentário. Corrija os achados que o
próprio PR introduziu; para os demais, registre por que ficam (critério em AGENTS.md > Workflow).
Rodada seguinte revisa só a diferença entre os heads, não o PR inteiro.

## 6. Checks

Espere os workflows do PR registrarem e terminarem (`gh pr checks <n> --watch`). `cancelled` no
gate de integração costuma ser disputa da fila global, não reprovação: confira com
`gh run list --workflow "sisub integration (real db)" --limit 10` e reexecute.

## 7. Merge (só com `merge` no argumento ou pedido explícito)

`gh pr merge <n> --squash --delete-branch --admin`, e depois confira o run do `CI/CD` na `main`
pelo SHA: deploy `skipped` é check vermelho.
