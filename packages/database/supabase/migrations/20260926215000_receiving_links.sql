-- ============================================================================
-- Recebimento sem NF-e, vínculos posteriores e designação conferível
-- (change `sisub-flexible-expense-execution`, tarefa 1.3; design D5, D6, D8)
-- ============================================================================
-- O rancho recebe antes de a papelada chegar: o pão vem todo dia com guia de
-- remessa e a NF-e é semanal; a carne chega antes de alguém importar a nota; o
-- depósito manda remessa sem nota de fornecedor. O banco já aceitava as origens
-- `delivery_note` e `ad_hoc` (20260917200000), mas nada as criava nem religava
-- a nota que chega depois. Esta migration dá o que o registro do fato e o
-- vínculo posterior exigem, sem reabrir a efetivação nem mexer no estoque:
--
-- 1. `goods_receipt`: fornecedor informado na entrega sem documento; guia com
--    número; se a entrega espera NF-e (remessa de depósito e apoio de outra OM
--    nunca terão nota de fornecedor); registro de quem efetivou com a SEFAZ
--    fora do ar (a liquidação continua exigindo a consulta — `invoice-gate.ts`);
--    quem vinculou depois.
-- 2. Uma NF-e cobre VÁRIAS entregas (a nota semanal do pão): o índice único da
--    nota passa a valer só para o recebimento criado DA nota (`source = 'nfe'`).
--    E a mesma nota não pode, ao mesmo tempo, gerar recebimento próprio e fechar
--    entregas já recebidas: seria estoque contado duas vezes.
-- 3. `receipt_must_be_open` deixa passar UMA escrita em recebimento efetivado:
--    ligar a linha ao item da NF-e (`nfe_item_id`), que não muda quantidade,
--    custo, lote nem estoque.
-- 4. `inventory.link_receipt_documents`: vincula NF-e (casando itens), OF e
--    empenho numa transação, com as regras de unidade e cozinha.
-- 5. `contract_designation`: ato exige referência (número do boletim/portaria);
--    a fonte `empenho` sai — a nota de empenho reserva dotação (Lei 4.320,
--    art. 58), não designa ninguém: fiscal e gestor são designados pela
--    autoridade (Lei 14.133, arts. 7º e 117). Nenhuma linha usava a fonte.
--    Ganha `acquisition_id` (designação da contratação de origem), e empenho,
--    ARP e contratação passam a RESTRICT: a designação é a prova do ato.
--    `inventory.designations_covering` é a regra única de escopo (empenho, ARPs
--    dos itens, contratação), usada por `find_designation` e pela pendência
--    "conferência sem fiscal designado". Os dois atos do recebimento de compras
--    continuam exigindo designação vigente (Lei 14.133, art. 140, II, a e b);
--    a conferência física da entrega não depende dela.
-- 6. `finance.v_physical_accounting_reconciliation` liga pela liquidação que
--    aponta o recebimento (`finance.liquidacao.goods_receipt_id`, N por
--    recebimento) em vez de `goods_receipt.liquidacao_id`, que não é mais
--    gravado desde a correção de unidade da liquidação: todo recebimento
--    aparecia "sem_liquidacao". A entrega que não terá NF-e (remessa, apoio)
--    fica de fora: ela nunca terá NS. Recusado fica de fora sem filtro próprio: desde
--    20260926205000 ele não tem `definitive_at` (CHECK
--    `goods_receipt_rejected_not_attested`).
--
-- Aditiva e compatível com o código da main: colunas anuláveis, CHECKs que as
-- linhas existentes satisfazem (conferido em 2026-09-26: nenhuma designação e
-- nenhum recebimento no banco), `create or replace` com as mesmas assinaturas.
-- Função nova só do servidor (service_role). Nenhuma tabela nova: o guard de
-- reset de treino não muda (a ordem do reset muda: designação antes do empenho).
-- DEPENDE de 20260926214000_acquisition_origin (outro PR do mesmo change):
-- aplicar aquela antes desta.
-- Edge cases: EST-REC-06..12 (estoque.md), GU-DES-01..03 e GU-EXE-04 (gestao-unidade.md).
-- TODO: regenerar tipos (`db:types`, `db:drizzle:pull`) após aplicar esta migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Recebimento: fornecedor, guia, SEFAZ indisponível, vínculo posterior
-- ----------------------------------------------------------------------------
alter table inventory.goods_receipt
  add column invoice_expected boolean not null default true,
  add column supplier_name text,
  add column supplier_document text,
  add column invoice_check_deferred_at timestamptz,
  add column invoice_check_deferred_by uuid references auth.users (id),
  add column invoice_check_deferred_reason text,
  add column documents_linked_at timestamptz,
  add column documents_linked_by uuid references auth.users (id);

alter table inventory.goods_receipt
  add constraint goods_receipt_supplier_document_digits
    check (supplier_document is null or supplier_document ~ '^([0-9]{11}|[0-9]{14})$'),
  -- guia de remessa sem número não é guia: é entrega sem documento (`ad_hoc`)
  add constraint goods_receipt_delivery_note_number
    check (source <> 'delivery_note' or nullif(btrim(delivery_note_number), '') is not null),
  add constraint goods_receipt_invoice_check_deferral
    check (invoice_check_deferred_at is null
           or (invoice_check_deferred_by is not null and nullif(btrim(invoice_check_deferred_reason), '') is not null));

comment on column inventory.goods_receipt.invoice_expected is
  'A entrega terá NF-e? Falso na remessa de depósito e no apoio de outra OM: sem isto, "aguardando a nota" ficaria aberto para sempre.';
comment on column inventory.goods_receipt.supplier_name is
  'Quem entregou, quando o recebimento não tem NF-e nem OF que o diga (entrega sem documento, remessa de depósito).';
comment on column inventory.goods_receipt.supplier_document is
  'CNPJ (14) ou CPF (11) de quem entregou, só dígitos. É por ele que a NF-e que chega depois é sugerida.';
comment on column inventory.goods_receipt.invoice_check_deferred_at is
  'Efetivado com a consulta de situação da NF-e pendente (SEFAZ indisponível). O estoque entra; a liquidação continua exigindo a consulta recente.';
comment on column inventory.goods_receipt.documents_linked_at is
  'Último vínculo posterior de NF-e, OF ou empenho (`inventory.link_receipt_documents`). Não reabre a efetivação.';

-- De onde veio o custo da linha: `invoice_link` = da linha da NF-e vinculada depois
-- (`link_receipt_documents`). É o que a troca de nota sabe desfazer: custo digitado
-- na conferência não se apaga.
alter table inventory.goods_receipt_item
  add column unit_cost_source text check (unit_cost_source in ('invoice_link'));

create index goods_receipt_invoice_check_deferred_by_fk_idx on inventory.goods_receipt (invoice_check_deferred_by)
  where invoice_check_deferred_by is not null;
create index goods_receipt_documents_linked_by_fk_idx on inventory.goods_receipt (documents_linked_by)
  where documents_linked_by is not null;

-- ----------------------------------------------------------------------------
-- 2. Uma NF-e, várias entregas — mas nunca as duas formas ao mesmo tempo
-- ----------------------------------------------------------------------------
drop index if exists inventory.goods_receipt_nfe_document_unique;
create unique index goods_receipt_nfe_document_unique
  on inventory.goods_receipt (nfe_document_id)
  where nfe_document_id is not null and status <> 'rejected' and source = 'nfe';

create function inventory.goods_receipt_nfe_single_use() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nfe_document_id is null or new.status = 'rejected' then
    return new;
  end if;
  -- duas transações vinculando a mesma nota por caminhos diferentes passariam
  -- as duas pela checagem sem a trava
  perform pg_advisory_xact_lock(hashtextextended(new.nfe_document_id::text, 0));
  if new.source = 'nfe' then
    if exists (
      select 1 from inventory.goods_receipt gr
       where gr.nfe_document_id = new.nfe_document_id and gr.id <> new.id
         and gr.status <> 'rejected' and gr.source <> 'nfe'
    ) then
      raise exception 'Esta NF-e já fecha entregas recebidas sem nota — não crie outro recebimento dela: o estoque seria contado duas vezes'
        using errcode = '23505';
    end if;
  elsif exists (
    select 1 from inventory.goods_receipt gr
     where gr.nfe_document_id = new.nfe_document_id and gr.id <> new.id
       and gr.status <> 'rejected' and gr.source = 'nfe'
  ) then
    raise exception 'Esta NF-e já tem recebimento próprio — vincular a outra entrega contaria o estoque duas vezes'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function inventory.goods_receipt_nfe_single_use() from public;
grant execute on function inventory.goods_receipt_nfe_single_use() to service_role;

create trigger goods_receipt_nfe_single_use
  before insert or update of nfe_document_id, source, status on inventory.goods_receipt
  for each row execute function inventory.goods_receipt_nfe_single_use();

-- ----------------------------------------------------------------------------
-- 3. Recebimento efetivado aceita só o vínculo da linha com o item da nota
-- ----------------------------------------------------------------------------
-- Recriada a partir do `pg_get_functiondef` de produção; a mudança é o bloco
-- marcado. Ligar `nfe_item_id` não muda quantidade, custo nem lote — o termo
-- assinado continua dizendo o que disse —, e é o que a NF-e semanal precisa
-- para casar os itens das entregas já efetivadas.
-- `search_path = ''` (regra de #468): todo objeto do corpo já é qualificado por schema.
create or replace function inventory.receipt_must_be_open() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_receipt_id uuid;
  v_status text;
  v_definitive timestamptz;
begin
  -- DELETE não tem NEW; INSERT não tem OLD. Escolher a linha ANTES de tocar em
  -- qualquer campo evita "record new is not assigned yet", e cada tabela tem um
  -- caminho próprio até o recebimento (a de lotes só conhece o ITEM).
  v_row := case when tg_op = 'DELETE' then old else new end;

  -- (20260926215000) vínculo posterior: só `nfe_item_id` mudou na linha
  if tg_table_name = 'goods_receipt_item' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'nfe_item_id') = (to_jsonb(old) - 'nfe_item_id') then
    return new;
  end if;

  if tg_table_name = 'goods_receipt_item_lot' then
    select gri.receipt_id into v_receipt_id
      from inventory.goods_receipt_item gri
      where gri.id = v_row.receipt_item_id;
  else
    v_receipt_id := v_row.receipt_id;
  end if;

  if v_receipt_id is null then return v_row; end if;

  select status, definitive_at into v_status, v_definitive
    from inventory.goods_receipt where id = v_receipt_id for share;

  if v_definitive is not null or v_status in ('definitive', 'divergent', 'rejected') then
    raise exception 'Recebimento já efetivado (%) — não aceita mais escrita', v_status;
  end if;
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Vincular depois: NF-e (com os itens), OF e empenho
-- ----------------------------------------------------------------------------
/**
 * Vincula documentos a um recebimento já registrado, numa transação.
 *
 * O CASAMENTO das linhas com os itens da nota é decidido no servidor
 * (`matchReceiptLinesToInvoice`, sisub-domain, testado) e chega pronto em
 * `p_item_links` ([{receipt_item_id, nfe_item_id}]); aqui ele é conferido e
 * aplicado. `p_line_costs` ([{receipt_item_id, unit_cost}]) só vale para
 * recebimento AINDA ABERTO: depois da efetivação o custo já está no estoque.
 *
 * Regras (as mesmas da criação):
 *  - NF-e da cozinha do recebimento, ou da unidade compradora sem cozinha (é
 *    assumida por esta cozinha); cancelada ou recusada não se vincula;
 *  - OF da mesma cozinha; se a OF tem empenho, é esse o empenho do recebimento,
 *    em TODO vínculo (não só quando a OF muda): OF de E1 não convive com E2;
 *  - empenho da unidade compradora, não anulado;
 *  - recebimento já liquidado não troca de NF-e, e o empenho dele só pode ser o
 *    que a NS debitou (Lei 4.320, art. 63) — inclusive quando estava sem empenho;
 *  - trocar a NF-e desliga as linhas que não casam com a nova e, com o
 *    recebimento aberto, tira o custo que tinha vindo da nota antiga.
 * O vínculo não reabre a efetivação nem movimenta estoque; ligar OF a entrega
 * já atestada recalcula o status da OF.
 */
create function inventory.link_receipt_documents(
  p_receipt_id uuid,
  p_user uuid,
  p_nfe_document_id uuid default null,
  p_supply_order_id uuid default null,
  p_empenho_id uuid default null,
  p_item_links jsonb default '[]'::jsonb,
  p_line_costs jsonb default '[]'::jsonb
) returns table (linked_items integer, costed_items integer)
language plpgsql
set search_path = ''
as $$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_unit bigint;
  v_liquidated boolean;
  v_liquidation_empenhos uuid[];
  v_switching_nfe boolean := false;
  v_order_empenho uuid;
  v_nfe record;
  v_order record;
  v_empenho record;
  v_nfe_id uuid;
  v_order_id uuid;
  v_empenho_id uuid;
  v_link jsonb;
  v_linked int := 0;
  v_costed int := 0;
  v_updated int;
begin
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;
  if v_receipt.status = 'rejected' then
    raise exception 'Recebimento recusado não recebe vínculo: a entrega não foi aceita';
  end if;

  select coalesce(k.purchase_unit_id, k.unit_id) into v_unit
    from kitchen.kitchen k where k.id = v_receipt.kitchen_id;

  -- a(s) NE(s) que as NS deste recebimento já debitaram
  select array_agg(distinct l.empenho_id) into v_liquidation_empenhos
    from finance.liquidacao l
   where l.goods_receipt_id = v_receipt.id or l.id = v_receipt.liquidacao_id;
  v_liquidated := v_liquidation_empenhos is not null;

  v_nfe_id := coalesce(p_nfe_document_id, v_receipt.nfe_document_id);
  v_order_id := coalesce(p_supply_order_id, v_receipt.supply_order_id);
  v_empenho_id := coalesce(p_empenho_id, v_receipt.empenho_id);

  -- NF-e ────────────────────────────────────────────────────────────────────
  if p_nfe_document_id is not null and p_nfe_document_id is distinct from v_receipt.nfe_document_id then
    if v_receipt.nfe_document_id is not null and v_receipt.source = 'nfe' then
      raise exception 'Recebimento criado da NF-e: os itens vieram dela, a nota não se troca';
    end if;
    if v_receipt.nfe_document_id is not null and v_liquidated then
      raise exception 'Recebimento já liquidado com outra NF-e: a NS se apoia nela e o vínculo não muda';
    end if;
    select id, kitchen_id, unit_id, status, situation_result into v_nfe
      from inventory.nfe_document where id = p_nfe_document_id for update;
    if not found then raise exception 'NF-e não encontrada'; end if;
    if v_nfe.kitchen_id is not null and v_nfe.kitchen_id <> v_receipt.kitchen_id then
      raise exception 'A NF-e pertence a outra cozinha';
    end if;
    if v_nfe.kitchen_id is null and v_nfe.unit_id is distinct from v_unit then
      raise exception 'A NF-e não foi enviada à unidade compradora desta cozinha';
    end if;
    if v_nfe.status in ('cancelled', 'refused') or v_nfe.situation_result = 'cancelled' then
      raise exception 'NF-e cancelada ou recusada não sustenta o recebimento — peça a nota correta ao fornecedor';
    end if;
    if v_nfe.kitchen_id is null then
      update inventory.nfe_document set kitchen_id = v_receipt.kitchen_id where id = p_nfe_document_id;
    end if;
    v_switching_nfe := v_receipt.nfe_document_id is not null;
  end if;

  -- OF ──────────────────────────────────────────────────────────────────────
  if p_supply_order_id is not null and p_supply_order_id is distinct from v_receipt.supply_order_id then
    select id, kitchen_id, empenho_id, status into v_order
      from procurement.supply_order where id = p_supply_order_id;
    if not found then raise exception 'OF não encontrada'; end if;
    if v_order.kitchen_id <> v_receipt.kitchen_id then
      raise exception 'A OF pertence a outra cozinha';
    end if;
    if v_order.status in ('draft', 'cancelled') then
      raise exception 'A OF está % — só OF enviada sustenta a entrega', case v_order.status when 'draft' then 'em rascunho' else 'cancelada' end;
    end if;
  end if;

  -- OF × empenho em TODO vínculo (a mesma regra de `resolveOrderAndEmpenho`): com OF
  -- de empenho, o empenho do recebimento é o dela.
  if v_order_id is not null then
    select so.empenho_id into v_order_empenho from procurement.supply_order so where so.id = v_order_id;
    if v_order_empenho is not null then
      if p_empenho_id is not null and p_empenho_id <> v_order_empenho then
        raise exception 'A OF desta entrega é de outro empenho — vincule a NE da OF, ou troque a OF antes';
      end if;
      v_empenho_id := v_order_empenho;
    end if;
  end if;

  -- Empenho ─────────────────────────────────────────────────────────────────
  if v_empenho_id is distinct from v_receipt.empenho_id then
    -- Liquidado, o empenho do recebimento só pode ser o que a NS debitou: com ele
    -- sem empenho, aceita essa NE; qualquer outra, recusa (ele diria E2 com a NS em E1).
    if v_liquidated and not (cardinality(v_liquidation_empenhos) = 1 and v_empenho_id = v_liquidation_empenhos[1]) then
      raise exception 'Recebimento já liquidado: a NS debitou a NE %. O empenho do recebimento só pode ser essa NE — para mudar, estorne a NS no SIAFI e registre a liquidação de novo',
        (select string_agg(e.numero_empenho, ', ' order by e.numero_empenho) from finance.empenho e where e.id = any(v_liquidation_empenhos));
    end if;
    select id, unit_id, status into v_empenho from finance.empenho where id = v_empenho_id;
    if not found then raise exception 'Empenho não encontrado'; end if;
    if v_empenho.unit_id is distinct from v_unit then
      raise exception 'O empenho não é da unidade compradora desta cozinha';
    end if;
    if v_empenho.status = 'anulado' then
      raise exception 'Empenho anulado não sustenta entrega — registre ou vincule a NE vigente';
    end if;
  end if;

  update inventory.goods_receipt
     set nfe_document_id = v_nfe_id,
         supply_order_id = v_order_id,
         empenho_id = v_empenho_id,
         documents_linked_at = now(),
         documents_linked_by = p_user
   where id = p_receipt_id;

  -- Linhas × itens da nota ──────────────────────────────────────────────────
  for v_link in select * from jsonb_array_elements(coalesce(p_item_links, '[]'::jsonb))
  loop
    if v_nfe_id is null then raise exception 'Casar itens exige a NF-e vinculada'; end if;
    if not exists (
      select 1 from inventory.nfe_item ni
       where ni.id = (v_link ->> 'nfe_item_id')::uuid and ni.nfe_document_id = v_nfe_id
    ) then
      raise exception 'Item da NF-e não pertence à nota vinculada';
    end if;
    update inventory.goods_receipt_item
       set nfe_item_id = (v_link ->> 'nfe_item_id')::uuid
     where id = (v_link ->> 'receipt_item_id')::uuid and receipt_id = p_receipt_id
       and nfe_item_id is distinct from (v_link ->> 'nfe_item_id')::uuid;
    get diagnostics v_updated = row_count;
    if v_updated = 0 and not exists (
      select 1 from inventory.goods_receipt_item where id = (v_link ->> 'receipt_item_id')::uuid and receipt_id = p_receipt_id
    ) then
      raise exception 'Linha não pertence a este recebimento';
    end if;
    v_linked := v_linked + v_updated;
  end loop;

  -- Troca de NF-e ───────────────────────────────────────────────────────────
  -- A linha que não casou com a nota nova não pode seguir apontando item da antiga
  -- (e passa a contar em "linhas sem item de nota"); aberto o recebimento, o custo que
  -- veio da antiga sai, e a nova o repõe onde casar (logo abaixo).
  if v_switching_nfe then
    update inventory.goods_receipt_item gri
       set nfe_item_id = null
     where gri.receipt_id = p_receipt_id and gri.nfe_item_id is not null
       and not exists (select 1 from inventory.nfe_item ni where ni.id = gri.nfe_item_id and ni.nfe_document_id = v_nfe_id);
    if v_receipt.definitive_at is null then
      update inventory.goods_receipt_item_lot l
         set unit_cost = null
        from inventory.goods_receipt_item gri
       where gri.id = l.receipt_item_id and gri.receipt_id = p_receipt_id
         and gri.unit_cost_source = 'invoice_link' and l.unit_cost is not distinct from gri.unit_cost;
      update inventory.goods_receipt_item
         set unit_cost = null, unit_cost_source = null
       where receipt_id = p_receipt_id and unit_cost_source = 'invoice_link';
    end if;
  end if;

  -- Custo das linhas sem custo, só com o recebimento aberto ─────────────────
  if v_receipt.definitive_at is null then
    for v_link in select * from jsonb_array_elements(coalesce(p_line_costs, '[]'::jsonb))
    loop
      update inventory.goods_receipt_item
         set unit_cost = (v_link ->> 'unit_cost')::numeric, unit_cost_source = 'invoice_link'
       where id = (v_link ->> 'receipt_item_id')::uuid and receipt_id = p_receipt_id and unit_cost is null;
      get diagnostics v_updated = row_count;
      if v_updated > 0 then
        update inventory.goods_receipt_item_lot
           set unit_cost = (v_link ->> 'unit_cost')::numeric
         where receipt_item_id = (v_link ->> 'receipt_item_id')::uuid and unit_cost is null;
      end if;
      v_costed := v_costed + v_updated;
    end loop;
  end if;

  -- Status da OF quando a entrega já foi atestada ───────────────────────────
  -- Mesma conta de `finalize_goods_receipt` (recusado não tem `definitive_at`).
  if v_receipt.definitive_at is not null and v_order_id is distinct from v_receipt.supply_order_id then
    update procurement.supply_order so
       set status = case
             when (select coalesce(sum(gri.received_qty_base), 0)
                     from inventory.goods_receipt gr
                     join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
                    where gr.supply_order_id = so.id and gr.definitive_at is not null)
                  >= (select coalesce(sum(ordered_qty), 0) from procurement.supply_order_item where supply_order_id = so.id)
               then 'received'
             when exists (select 1 from inventory.goods_receipt gr
                           where gr.supply_order_id = so.id and gr.definitive_at is not null)
               then 'partially_received'
             else 'sent' end,
           updated_at = now()
     where so.id in (v_order_id, v_receipt.supply_order_id)
       and so.status in ('sent', 'partially_received', 'received');
  end if;

  return query select v_linked, v_costed;
end;
$$;

revoke all on function inventory.link_receipt_documents(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb) from public;
grant execute on function inventory.link_receipt_documents(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Designação: o ato diz qual é; a NE não designa; a prova não some
-- ----------------------------------------------------------------------------
-- DEPENDE de 20260926214000_acquisition_origin (`procurement.acquisition`,
-- `finance.empenho.acquisition_id`, `finance.empenho_item`,
-- `procurement.procurement_arp.acquisition_id`), que roda antes desta.
alter table procurement.contract_designation drop constraint contract_designation_source_check;

alter table procurement.contract_designation
  add column acquisition_id uuid;

-- A designação é a prova do ato que sustenta o termo de recebimento: apagar a
-- ARP ou o empenho não pode levá-la junto (era CASCADE). O reset de treino a
-- apaga antes (`training.ts`).
alter table procurement.contract_designation
  drop constraint contract_designation_empenho_id_fkey,
  drop constraint contract_designation_arp_id_fkey,
  add constraint contract_designation_empenho_id_fkey
    foreign key (empenho_id) references finance.empenho (id) on delete restrict,
  add constraint contract_designation_arp_id_fkey
    foreign key (arp_id) references procurement.procurement_arp (id) on delete restrict,
  add constraint contract_designation_acquisition_id_fkey
    foreign key (acquisition_id) references procurement.acquisition (id) on delete restrict,
  add constraint contract_designation_source_check check (source in ('ato', 'permanente')),
  add constraint contract_designation_ato_reference
    check (source <> 'ato' or nullif(btrim(source_reference), '') is not null),
  -- uma designação vale para UM vínculo (contratação, ARP ou empenho) ou para a unidade
  add constraint contract_designation_single_scope check (num_nonnulls(empenho_id, arp_id, acquisition_id) <= 1);

comment on table procurement.contract_designation is
  'Designação de gestor, fiscal e comissão (Lei 14.133, arts. 7º, 117 e 140, II; Decreto 11.246/2022). `ato`: boletim/portaria, com a referência. `permanente`: ato da OM para recebimento de gêneros sem contrato. O vínculo (contratação, ARP ou empenho) é escopo; a nota de empenho não designa ninguém.';
comment on column procurement.contract_designation.source_reference is
  'Número do boletim interno ou da portaria que designou. Obrigatório quando a fonte é `ato`.';
comment on column procurement.contract_designation.acquisition_id is
  'Designação da contratação de origem: vale para todo empenho e toda ARP dela.';

create index if not exists contract_designation_arp_idx on procurement.contract_designation (arp_id) where arp_id is not null;
create index if not exists contract_designation_acquisition_idx on procurement.contract_designation (acquisition_id) where acquisition_id is not null;
create index if not exists contract_designation_created_by_fk_idx on procurement.contract_designation (created_by);

/**
 * Designações vigentes que cobrem um recebimento, de qualquer pessoa.
 *
 * Uma regra só para as duas perguntas: "esta pessoa pode receber?"
 * (`find_designation`) e "alguém pode receber isto?" (a pendência "conferência
 * sem fiscal designado"). O escopo sai do empenho do recebimento: a contratação
 * dele, as ARPs dos itens dele (e o `arp_item_id` antigo, enquanto existir) e a
 * contratação dessas ARPs. Designação sem vínculo vale para a unidade toda.
 * Antes, a designação por ARP valia para qualquer empenho: o filtro olhava só
 * `empenho_id`.
 */
create function inventory.designations_covering(
  p_unit_id bigint,
  p_empenho_id uuid,
  p_roles text[]
) returns table (
  designation_id uuid,
  person_id uuid,
  by_empenho boolean,
  by_arp boolean,
  by_acquisition boolean,
  is_substitute boolean,
  valid_from date
)
language sql stable
set search_path = ''
as $$
  with arps as (
    select ai.arp_id
      from finance.empenho e
      join procurement.procurement_arp_item ai
        on ai.id = e.arp_item_id
        or ai.id in (select ei.arp_item_id from finance.empenho_item ei where ei.empenho_id = e.id)
     where e.id = p_empenho_id
  ),
  acquisitions as (
    select e.acquisition_id from finance.empenho e where e.id = p_empenho_id and e.acquisition_id is not null
    union
    select a.acquisition_id from procurement.procurement_arp a
     where a.id in (select arp_id from arps) and a.acquisition_id is not null
  )
  select d.id, d.person_id, d.empenho_id is not null, d.arp_id is not null, d.acquisition_id is not null, d.is_substitute, d.valid_from
    from procurement.contract_designation d
   where d.unit_id = p_unit_id
     and d.role = any(p_roles)
     and d.valid_from <= (now() at time zone 'America/Sao_Paulo')::date
     and (d.valid_to is null or d.valid_to >= (now() at time zone 'America/Sao_Paulo')::date)
     and (d.empenho_id is null or d.empenho_id = p_empenho_id)
     and (d.arp_id is null or d.arp_id in (select arp_id from arps))
     and (d.acquisition_id is null or d.acquisition_id in (select acquisition_id from acquisitions));
$$;

revoke all on function inventory.designations_covering(bigint, uuid, text[]) from public;
grant execute on function inventory.designations_covering(bigint, uuid, text[]) to service_role;

-- Mesma assinatura e mesmo retorno; a busca passa pela regra única acima e
-- prefere a designação mais específica.
create or replace function inventory.find_designation(
  p_person uuid,
  p_unit_id bigint,
  p_empenho_id uuid,
  p_roles text[]
) returns uuid
language sql stable
set search_path = ''
as $$
  select c.designation_id
    from inventory.designations_covering(p_unit_id, p_empenho_id, p_roles) c
   where c.person_id = p_person
   order by c.by_empenho desc, c.by_arp desc, c.by_acquisition desc, c.is_substitute asc, c.valid_from desc
   limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 6. Físico × contábil pela liquidação que aponta o recebimento
-- ----------------------------------------------------------------------------
-- Substitui também a versão de 20260926210000 (que pode ou não estar aplicada
-- antes desta). Colunas, tipos e ordem iguais: `create or replace`.
-- N liquidações por recebimento (parcelas): soma os valores, lista as NS e
-- expõe a mais recente em `liquidacao_id`. `gr.liquidacao_id` continua lido,
-- para recebimento antigo ligado só por ele.
create or replace view finance.v_physical_accounting_reconciliation
with (security_invoker = true) as
with received as (
  select
    gr.id,
    gr.kitchen_id,
    gr.definitive_at,
    gr.liquidacao_id,
    coalesce(sum(gri.received_qty_base * coalesce(gri.unit_cost, 0::numeric)), 0::numeric) as valor_recebido
  from inventory.goods_receipt gr
  join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
  -- entrega atestada; o recusado não tem `definitive_at` (20260926205000). A remessa
  -- de depósito e o apoio de outra OM (`invoice_expected = false`) nunca terão NS:
  -- contá-los "sem liquidação" seria pendência sem solução.
  where gr.definitive_at is not null
    and gr.invoice_expected
  group by gr.id, gr.kitchen_id, gr.definitive_at, gr.liquidacao_id
),
liquidated as (
  select
    r.id as goods_receipt_id,
    (array_agg(l.id order by l.data desc, l.created_at desc))[1] as liquidacao_id,
    string_agg(l.numero_ns, ', ' order by l.data, l.numero_ns) as numero_ns,
    sum(l.valor)::numeric(14,2) as valor
  from received r
  join finance.liquidacao l on l.goods_receipt_id = r.id or l.id = r.liquidacao_id
  group by r.id
)
select
  r.id as goods_receipt_id,
  r.kitchen_id,
  r.definitive_at,
  r.valor_recebido,
  q.liquidacao_id,
  q.numero_ns,
  q.valor as valor_liquidado,
  case
    when q.liquidacao_id is null then 'sem_liquidacao'::text
    when abs(r.valor_recebido - q.valor) > 0.009 then 'valor_divergente'::text
    else 'conciliado'::text
  end as situacao,
  current_date - r.definitive_at::date as dias_desde_recebimento
from received r
left join liquidated q on q.goods_receipt_id = r.id;
