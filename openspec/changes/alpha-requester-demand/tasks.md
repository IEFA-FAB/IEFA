## 1. Domínio

- [x] [alpha-client] Schema da demanda (VFT, solução, itens, cotações, riscos, planejamento)
- [x] [alpha-client] Enquadramento (art. 75 I/II com limites 2025/2026, art. 74 I, licitação)
- [x] [alpha-client] Pesquisa de preços (média/mediana por CV, dependentes, vencidas)
- [x] [alpha-client] Conferências (VFT, Lei nº 14.133, lições dos processos reais)
- [x] [alpha-client] Peças campo a campo (DFD, ETP Digital, MR, TR, memória, pesquisa) e guia HTML
- [x] [alpha-client] Testes com a demanda das janelas do E-102

## 2. Banco e α

- [x] [database] Migration `alpha.demand` e `submission.demand_id`; declaração no guard do reset
- [x] [alpha] Rotas `/api/v1/demands` (lista, cria, lê, grava com 409, apaga, envia)
- [x] [alpha] `.docx` a partir dos blocos da peça, com teste de ida e volta pelo leitor
- [x] [alpha] `decideDemandEdit` com teste
- [ ] [database] Aplicar a migration e regenerar os tipos (`db:types`, `db:drizzle:pull`)

## 3. Contrate

- [x] [contrate] Lista de demandas e criação
- [x] [contrate] Editor em nove passos com gravação automática e conflito
- [x] [contrate] Revisão: enquadramento, pendências, peças com Copiar, guia, envio com extração e verificação
- [x] [contrate] Aba "Demanda de origem" no processo
- [ ] [contrate] Conferência visual do editor no ambiente com a migration aplicada

## 4. Fechamento

- [x] [root] Catálogo de edge cases (`contrate-demanda.md`)
- [ ] [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
