# Design: sisub-budget-execution

## Context

O que já existe: `finance.empenho` (unit_id, arp_item_id, numero_empenho, data_empenho, quantidade_empenhada, valor_unitario, valor_total, nota_lancamento, status ativo/anulado, created_by) — um registro manual simplificado, criado na tela da ATA; `inventory.goods_receipt` com recebimento provisório→definitivo; `procurement.supply_order`; e o schema **`siafi_integration` criado vazio** na migration `20260624120000` justamente para esta fase.

O que não existe: crédito/dotação, natureza de despesa, liquidação, pagamento, restos a pagar, e qualquer conciliação com o SIAFI.

Restrição dura do ambiente: **o SIAFI não oferece API pública de escrita**, e a leitura programática depende de Tesouro Gerencial com credencial institucional (fora do escopo desta fase). A decisão registrada é **importação de arquivo**: o gestor exporta o relatório no Tesouro Gerencial e sobe no sisub.

Decisão de navegação registrada: as páginas vivem **dentro do módulo `unit`** (Gestão Unidade), reusando o PBAC `unit` — sem módulo novo.

## Goals / Non-Goals

**Goals**

- Responder, na tela: *tenho crédito?*, *quanto deste empenho já foi liquidado/pago?*, *o fornecedor recebeu?*
- Ligar o recebimento definitivo (físico, MCASP) à liquidação (contábil, art. 63 da Lei 4.320).
- Espelhar o SIAFI por arquivo e **mostrar divergências** em vez de assumir que o sisub está certo.
- Manter tudo auditável: arquivo bruto preservado, origem por documento, histórico de reforço/anulação.

**Non-Goals**: ver "Não-objetivos" no proposal (sem escrita no SIAFI, sem integração online nesta fase, sem contabilidade de partida dobrada).

## Decisions

### D1 — Dois schemas com papéis distintos: `siafi_integration` (bruto) e `finance` (domínio)

`siafi_integration.import_batch` guarda o arquivo importado (nome, hash, tipo de relatório, competência, quem subiu, contagens) e `import_row` guarda **cada linha crua em jsonb** com o resultado do parse e da conciliação. O domínio (`finance.*`) recebe só o dado normalizado. Alternativa rejeitada: parsear direto para o domínio — perderia a rastreabilidade "de onde veio este número", que é o ponto do módulo. Espelha o que já fizemos com `inventory.nfe_document` (XML íntegro preservado).

Deduplicação por `content_hash` do arquivo: reimportar o mesmo relatório é no-op idempotente; reimportar uma versão *mais nova* da mesma competência **substitui** os snapshots (crédito) e faz upsert por número de documento (NE/NS/OB).

### D2 — Crédito é SNAPSHOT datado, não saldo vivo

`finance.budget_credit` guarda, por `(unit_id, ug, nd, ptres, fonte, competencia)`: `dotacao`, `empenhado_siafi`, `saldo_siafi`, `snapshot_at`, `import_batch_id`. O sisub **não recalcula** o saldo do SIAFI — ele exibe o snapshot e, ao lado, o **comprometimento local** (empenhos do sisub após o snapshot), exatamente o padrão de duas grandezas que o painel de ARP já usa (achado do review: nunca somar/confundir oficial com local). A checagem antes de emitir empenho é **alerta**, nunca bloqueio: o dado pode estar defasado e a decisão é do ordenador.

### D3 — Empenho vira documento com valores DERIVADOS

`finance.empenho` ganha: `tipo` (ordinario|estimativo|global), `favorecido_cnpj`/`favorecido_nome`, `nd` (natureza de despesa, ex. 33903007), `ptres`, `fonte`, `ug_emitente`, `exercicio`, `origem` (manual|siafi), `siafi_synced_at`.

Reforço e anulação **não editam** o valor: entram em `finance.empenho_event` (`tipo` reforco|anulacao|cancelamento, valor, data, documento, justificativa). O valor vigente é `valor_original + Σ eventos` — mesma filosofia append-only do ledger de estoque (correção por evento, não por UPDATE). Views derivam `valor_liquidado` (Σ liquidações), `valor_pago` (Σ pagamentos) e `saldo_a_liquidar`.

**Invariante de cadeia** (validada em trigger): `pago ≤ liquidado ≤ empenhado_vigente`.

### D4 — Liquidação é o elo físico↔contábil

`finance.liquidacao`: `numero_ns`, `data`, `valor`, `empenho_id`, `goods_receipt_id` (opcional mas fortemente sugerido), `nfe_document_id`, `competencia`, `origem`. Quando o recebimento definitivo é efetivado, a tela **sugere** a liquidação pré-preenchida (valor = Σ `received_qty_base × unit_cost` dos itens) — o número da NS vem do SIAFI, digitado ou importado. Divergência entre valor recebido e valor liquidado é sinalizada, nunca corrigida silenciosamente.

Alternativa rejeitada: gerar liquidação automaticamente no recebimento definitivo — liquidar é ato do ordenador, e a NS nasce no SIAFI.

### D5 — Restos a pagar por evento de virada de exercício

`finance.empenho` ganha `rp_inscrito` (boolean), `rp_tipo` (processado|nao_processado), `rp_exercicio`. A inscrição acontece por ação explícita no encerramento (empenho com saldo a liquidar → RP não-processado; liquidado e não pago → RP processado), registrada como evento. Sem job automático: virada de exercício é decisão com data, não cron.

### D6 — Parser no `apps/api`, tolerante ao layout do Tesouro Gerencial

Endpoint admin `POST /api/admin/siafi/import` recebendo o arquivo + `report_type` (credito|ne|ns|ob). O Tesouro Gerencial exporta com cabeçalhos variáveis conforme o relatório montado pelo usuário — o parser normaliza por **mapa de sinônimos de coluna** (ex.: "Nota de Empenho"/"NE"/"Documento" → `numero_ne`), com guard "zero linhas reconhecidas = layout mudou" (padrão dos importadores TACO/IBGE/USDA). CSV e XLSX (a lib `xlsx` já é dependência do api).

Valores monetários vêm em formato pt-BR (`1.234,56`) — normalização explícita e testada, é a classe de bug mais provável aqui.

### D7 — Conciliação mostra divergência, não decide

View `finance.v_siafi_reconciliation` cruza por número de documento e expõe: documento existe só no sisub, só no SIAFI, ou em ambos com valor divergente. A tela lista por severidade. Nada é auto-corrigido: o operador escolhe "adotar o SIAFI" (atualiza o registro, marcando `origem=siafi`) ou "manter e justificar".

### D8 — Guard escopado por unidade, espelhando o do estoque

Novo `requireUnitScope(level, unitId)` em `apps/sisub/src/lib/unit-auth.server.ts`, irmão do `requireStorageForKitchen` — o review do épico de estoque mostrou que guard sem escopo aceita permissão de outra unidade (service role não tem RLS). Níveis: 1 leitura, 2 lançar documentos, 3 conciliar e encerrar exercício. Tabelas novas: RLS deny-all para anon/authenticated.

### D9 — Integração com o estoque sem acoplar

`inventory.goods_receipt` ganha `liquidacao_id` (FK opcional, ON DELETE SET NULL). O módulo de estoque continua funcionando sem nenhuma liquidação; o de finanças enxerga o recebimento. Nenhuma função do ledger passa a depender de `finance`.

## Risks / Trade-offs

- [Layout do Tesouro Gerencial muda / cada unidade monta o relatório diferente] → mapa de sinônimos + guard de zero linhas + a linha crua fica em `import_row` para reprocessar sem novo upload.
- [Snapshot de crédito defasado leva a empenho sem lastro] → o painel mostra idade do snapshot com destaque e a checagem é alerta com data ("crédito de 3 dias atrás"); nunca bloqueio.
- [Dupla verdade sisub × SIAFI] → mitigado pelo mesmo padrão do ARP (duas colunas explícitas, nunca somadas) + tela de conciliação; `origem` gravada por documento.
- [Valores monetários pt-BR e arredondamento] → `numeric(14,2)` no banco, normalização testada com casos reais, e conferência de totalizador do arquivo quando presente.
- [Usuário sobe o relatório errado (NS no slot de NE)] → `report_type` explícito + validação de colunas obrigatórias por tipo; erro claro antes de persistir qualquer linha.
- [Escopo cresce para "sistema orçamentário"] → limitado por design: sem razão contábil, sem partida dobrada, sem outras NDs além de subsistência.

## Migration Plan

Uma migration por fase, aditiva:

1. `siafi_integration.import_batch` + `import_row` (+ RLS).
2. `finance.budget_credit` (+ índices por unidade/competência).
3. Colunas novas em `finance.empenho` + `finance.empenho_event` + views de saldo derivado (backfill: empenhos existentes viram `origem=manual`, `exercicio` derivado de `data_empenho`).
4. `finance.liquidacao` + `finance.pagamento` + trigger da invariante `pago ≤ liquidado ≤ empenhado`.
5. `inventory.goods_receipt.liquidacao_id` + view de conciliação.

Após cada migration: `db:types`, `bun run check`, e o gate transacional de integração (o padrão `begin`+savepoints+rollback contra o banco real, como no ciclo de estoque).

## Open Questions

- **Layout real**: preciso de um export de exemplo do Tesouro Gerencial (crédito e NE) para fixar o mapa de colunas — sem isso o parser nasce com sinônimos supostos. Fica como fixture pendente na task de parser.
- **ND de subsistência**: confirmar as naturezas usadas (33.90.30.07 gêneros; há 33.90.39 para serviços?) para o filtro default das telas.
- **Competência do crédito**: o relatório de crédito é mensal ou posição instantânea? Muda se `budget_credit` é série temporal ou snapshot substituível.
