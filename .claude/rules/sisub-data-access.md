---
paths:
  - "apps/sisub/src/server/**"
  - "apps/sisub/src/lib/**/*.server.ts"
  - "apps/sisub/src/lib/analytics-sql.ts"
  - "packages/sisub-domain/src/operations/**"
---

# Acesso a dados no sisub: qual caminho usar

O sisub fala com o banco por quatro caminhos. Não há um "certo" único (unificar numa camada é
decisão em aberto do mantenedor); há critério, e é o que o código já segue.

| Caminho | Quando | Como |
|---|---|---|
| **Operation do `@iefa/sisub-domain`** (Drizzle) | regra de negócio que mais de uma superfície usa (tela, chat do módulo, MCP), ou escrita com guard de escopo | `packages/sisub-domain/src/operations/`, guard dentro da operation; a fn só repassa com `requireAuthThenRun(op)` |
| **Drizzle na fn** (`getDb()`) | leitura agregada ou consulta de tela que o PostgREST faz mal (join, agregação), sem outra superfície | guard explícito na fn (`requireAuthWithPermission` / `requireStorageForKitchen`) antes da consulta; erro por `handleDomainError` |
| **Função SQL** (`rpc`) | atomicidade que o banco garante sob trava: ledger de estoque, mudança de acesso auditada, numeração, fechamento | migration (na ordem declara → aplica → mergeia de `database.md`) + `getServerClient(schema).rpc(...)`, ou `rpcWithNulls` quando o parâmetro sem default vai nulo |
| **supabase-js tipado** | leitura e escrita simples de tela, de um módulo só, sem regra compartilhada | `getServerClient(schema)` dentro do `.handler()`; `getKitchenClient()` e afins são o mesmo cliente. `getSupabaseServerClient()` é o legado preso ao schema `sisub` |

## Regras por camada

**PostgREST** (supabase-js e `rpc`, nas fns e em `lib/*.server.ts`):

- **Leitura lança.** `const { data, error } = await …` e `if (error) throw new Error(\`Erro ao …:
  ${publicDbMessage(error)}\`)`. Queda de propósito lê o `error` e registra. Escrita sem ler o
  `error` é acusada por `postgrest-write-error-discarded`; leitura, pela regra proposta no #577
  (`postgrest-read-error-discarded`), ainda não ativa.
- **Lista que pode passar de 1000 linhas pagina; `.in()` com ids vindos de outra leitura fatia:**
  `readAllPages`/`readAllPagesIn` (`apps/sisub/src/lib/read-all-pages.ts`), com `.order()` por chave
  única. O PostgREST corta calado em 1000 e recusa URL longa.
- **Linha vem do `select`**, não de anotação à mão. Coluna de view sai nulável no tipo gerado;
  normalize (pule a linha, estreite o vocabulário) em vez de `as`. Não há mais cliente sem tipo
  (`getLooseServerClient` saiu em #576).

**Drizzle** (operations do domínio e fns com `getDb()`):

- Erro do driver lança sozinho; na operation, `runQuery`/`DomainError` dão a mensagem de negócio, e a
  fn o traduz com `handleDomainError`. Sem teto de 1000 linhas, mas lista sem `limit` exposta a modelo
  segue a regra de `ai-tools.md` (`limit` e `total`).
- Operation do domínio não importa supabase-js nem código de `apps/`.

**Os quatro:**

- **Ledger de estoque** (`stock_movement`, `stock_lot`, `stock_cost`) só muda por função SQL. A regra
  `inventory-ledger-write-outside-rpc` (`.opengrep/rules/inventory-ledger-writes.yaml`) cobra a escrita
  por PostgREST em `apps/sisub/src/server/**` e `apps/api/src/**`; escrita por Drizzle numa operation
  não é pega por ela, e também não pode.
- **Mudança de acesso** só por função auditada (`database.md`).

## Sinal de que o caminho está errado

- Fn com a mesma regra que uma tool do chat ou do MCP reimplementa: vira operation.
- Duas escritas em sequência que precisam ser uma (a segunda falha e a primeira fica): vira função
  SQL, ou transação Drizzle na operation (exceto ledger, que é sempre função SQL).
