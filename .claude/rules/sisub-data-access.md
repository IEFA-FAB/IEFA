---
paths:
  - "apps/sisub/src/server/**"
  - "apps/sisub/src/lib/**/*.server.ts"
  - "packages/sisub-domain/src/operations/**"
---

# Acesso a dados no sisub: qual caminho usar

O sisub fala com o banco por três caminhos. Não há um "certo" único (unificar é decisão em aberto
do mantenedor); há critério, e é o que o código já segue. Em 2026-10-03: 89 server fns, 50 com
`getDb()` (Drizzle), 33 com `getServerClient` (supabase-js tipado), 38 delegando a operation do
domínio por `requireAuthThenRun`.

| Caminho | Quando | Onde |
|---|---|---|
| **Operation do `@iefa/sisub-domain`** (Drizzle) | regra de negócio que mais de uma superfície usa (tela, chat do módulo, MCP), ou escrita com guard de escopo | `packages/sisub-domain/src/operations/`; a fn só repassa com `requireAuthThenRun(op)` |
| **Função SQL** (`rpc`) | atomicidade que o banco garante sob trava: ledger de estoque (`stock_movement`/`stock_lot`/`stock_cost`), mudança de acesso auditada, numeração, fechamento | migration + `getServerClient(schema).rpc(...)` (ou `rpcWithNulls` quando o parâmetro sem default vai nulo) |
| **supabase-js tipado** | leitura e escrita simples de tela, de um módulo só, sem regra compartilhada | `getServerClient(schema)` dentro do `.handler()` |

## Regras que valem nos três

- **Leitura lança.** `const { data, error } = await …` e `if (error) throw new Error(\`Erro ao …:
  ${publicDbMessage(error)}\`)`. Queda de propósito lê o `error` e registra. A regra
  `postgrest-read-error-discarded` cobra (proposta no #577); a escrita, `postgrest-write-error-discarded`.
- **Lista que pode passar de 1000 linhas pagina; `.in()` com ids vindos de outra leitura fatia:**
  `readAllPages`/`readAllPagesIn` (`lib/read-all-pages.ts`), com `.order()` por chave única. O
  PostgREST corta calado em 1000 e recusa URL longa.
- **Linha vem do `select`**, não de anotação à mão: o cliente tipado infere. Coluna de view sai
  nulável no tipo gerado; normalize (pule a linha, estreite o vocabulário) em vez de `as`.
- **Não há cliente sem tipo.** `getLooseServerClient` saiu em #576.
- **Ledger de estoque só por função SQL** (`inventory-ledger-writes` no opengrep).
- **Mudança de acesso só por função auditada** (ver `database.md`).

## Sinal de que o caminho está errado

- Server fn com a mesma regra que uma tool do chat ou do MCP reimplementa: vira operation.
- Duas escritas em sequência que precisam ser uma (a segunda falha e a primeira fica): vira função
  SQL, ou transação Drizzle na operation.
- Operation do domínio importando supabase-js: o domínio é Drizzle (a única exceção hoje é
  `operations/user.ts`).
