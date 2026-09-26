-- ============================================================================
-- A execução nunca trava: o que falta vira pendência registrada
-- ============================================================================
-- "O rancho é rápido e dinâmico; a falta de um trabalho deve impedir o mínimo
-- do outro, somente quando imprescindível." O planejamento (cardápio, ficha
-- técnica, anexo) segue exclusivo de quem planeja. Na EXECUÇÃO, o que faltou
-- não para o dia: entra registrado (quem, quando, motivo) e aparece como
-- pendência para quem corrige depois. Bloqueio só onde é imprescindível:
-- competência fechada, dupla baixa, dado que o fato não pode ter.
--
--  1. Inclusão de preparação no dia pelo turno (`kitchen.menu_items`).
--  2. Preparação provisória só com o nome (`kitchen.recipes`): funciona no dia,
--     não entra em cardápio-modelo (o anexo e a compra dependem da ficha).
--  3. Preparação congelada provisória da cozinha para a sobra
--     (`kitchen.frozen_preparation`), pendente de revisão da SDAB.
--  4. Saída tardia com a data real (`inventory.register_late_issue`), limitada
--     à competência aberta e recusada onde a contagem aprovada já acertou o saldo.
--  5. Fechamento automático do dia (`inventory.close_stale_issue_requests`,
--     pg_cron de hora em hora), com a pendência de justificativa no documento.
--  6. A aprovação da contagem não conta a tarefa já baixada pela produção e
--     aceita aprovar com ressalva registrada.
--
-- Compatível com o código da main: colunas novas são nulas, as funções
-- alteradas aceitam as chamadas de antes com o mesmo resultado (salvo a
-- aprovação, que deixa de recusar tarefa já baixada — só relaxa). Nenhuma
-- tabela nova: o guard default-deny do reset de treino não muda.
-- Funções novas nascem executáveis só por postgres e service_role
-- (20260920210000); nada aqui concede a cliente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Preparação incluída no dia pelo turno
-- ----------------------------------------------------------------------------
alter table kitchen.menu_items
  add column added_in_execution_at timestamptz,
  add column added_in_execution_by uuid references auth.users (id) on delete set null,
  add column execution_reason text,
  add column execution_reviewed_at timestamptz,
  add column execution_reviewed_by uuid references auth.users (id) on delete set null;

alter table kitchen.menu_items
  add constraint menu_items_execution_reason_required
    check (added_in_execution_at is null or nullif(btrim(execution_reason), '') is not null),
  add constraint menu_items_execution_review_needs_add
    check (execution_reviewed_at is null or added_in_execution_at is not null);

comment on column kitchen.menu_items.added_in_execution_at is
  'Incluída no dia pelo turno (Produção Cozinha), fora do planejamento. Nulo = veio do planejamento.';
comment on column kitchen.menu_items.execution_reason is
  'Motivo curto da inclusão pelo turno. Obrigatório quando added_in_execution_at está preenchido.';
comment on column kitchen.menu_items.execution_reviewed_at is
  'Quando a nutricionista revisou a inclusão feita pelo turno. Nulo com added_in_execution_at = pendência.';

create index menu_items_execution_pending_idx
  on kitchen.menu_items (added_in_execution_at)
  where added_in_execution_at is not null and execution_reviewed_at is null and deleted_at is null;

-- ----------------------------------------------------------------------------
-- 2. Preparação provisória (ficha pendente)
-- ----------------------------------------------------------------------------
-- A ficha "completa" é a próxima versão da linhagem: salvar a edição cria uma
-- linha nova sem `provisional_since`. A linha provisória fica como histórico;
-- a pendência é "provisória sem versão posterior", derivada dos dados.
alter table kitchen.recipes
  add column provisional_since timestamptz,
  add column provisional_by uuid references auth.users (id) on delete set null;

alter table kitchen.recipes
  add constraint recipes_provisional_is_local check (provisional_since is null or kitchen_id is not null);

comment on column kitchen.recipes.provisional_since is
  'Criada pelo turno só com o nome, para o dia. Não entra em cardápio-modelo nem em anexo até a ficha ser completada (nova versão).';

create index recipes_provisional_idx
  on kitchen.recipes (kitchen_id)
  where provisional_since is not null and deleted_at is null;

-- Cardápio-modelo alimenta o anexo quantitativo e a compra: preparação sem
-- ficha ali compra nada, em silêncio. É o único ponto em que a provisória é
-- recusada — e a recusa diz o que fazer.
create function kitchen.template_item_rejects_provisional_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.recipe_id is null then
    return new;
  end if;
  select r.name into v_name
    from kitchen.recipes r
   where r.id = new.recipe_id and r.provisional_since is not null;
  if found then
    raise exception 'A preparação "%" é provisória (criada no turno, sem ficha técnica). Complete a ficha técnica antes de usá-la num cardápio-modelo: o anexo e a compra dependem dela', v_name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger menu_template_items_no_provisional_recipe
  before insert or update of recipe_id on kitchen.menu_template_items
  for each row execute function kitchen.template_item_rejects_provisional_recipe();

-- ----------------------------------------------------------------------------
-- 3. Preparação congelada provisória da cozinha (sobra)
-- ----------------------------------------------------------------------------
-- O catálogo de congeladas é da SDAB (sem `kitchen_id`). A cozinha que sobrou
-- estrogonofe às 14h não espera o catálogo: cria a provisória, dela, e a SDAB
-- revisa depois. A coluna é `provisional_kitchen_id`, e não `kitchen_id`, de
-- propósito: a linha segue sendo do catálogo global depois de revisada.
alter table kitchen.frozen_preparation
  add column provisional_kitchen_id bigint references kitchen.kitchen (id),
  add column provisional_since timestamptz,
  add column provisional_by uuid references auth.users (id) on delete set null,
  add column provisional_reviewed_at timestamptz,
  add column provisional_reviewed_by uuid references auth.users (id) on delete set null;

alter table kitchen.frozen_preparation
  add constraint frozen_preparation_provisional_pair
    check ((provisional_since is null) = (provisional_kitchen_id is null)),
  add constraint frozen_preparation_review_needs_provisional
    check (provisional_reviewed_at is null or provisional_since is not null);

comment on column kitchen.frozen_preparation.provisional_kitchen_id is
  'Cozinha que criou a congelada provisória (sobra sem cadastro). Enquanto não revisada pela SDAB, só essa cozinha a vê.';

create index frozen_preparation_provisional_pending_idx
  on kitchen.frozen_preparation (provisional_kitchen_id)
  where provisional_since is not null and provisional_reviewed_at is null and deleted_at is null;

-- Cria (ou reaproveita) a provisória e registra a sobra na MESMA transação: em
-- dois passos, a falha do segundo deixava a congelada órfã, e o retry criava
-- outra com o mesmo nome.
create function inventory.register_leftover_provisional(
  p_kitchen_id bigint,
  p_description text,
  p_measure_unit text,
  p_shelf_life_days integer,
  p_lot_code text,
  p_production_date date,
  p_quantity numeric,
  p_task_id uuid,
  p_discard boolean,
  p_reason text,
  p_user uuid
) returns table (lot_id uuid, frozen_preparation_id uuid)
language plpgsql
-- sem `set search_path`: chama `register_leftover` e os gatilhos do ledger, que
-- resolvem nomes pelo caminho de quem chama (todos já qualificados, mas a
-- garantia não é desta função)
as $$
declare
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_prep uuid;
  v_shelf integer;
  v_task_kitchen bigint;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  if v_description is null or length(v_description) < 3 then
    raise exception 'Informe o nome da preparação congelada (mínimo 3 caracteres)';
  end if;
  if p_shelf_life_days is not null and p_shelf_life_days <= 0 then
    raise exception 'Validade em dias deve ser positiva';
  end if;
  select t.kitchen_id into v_task_kitchen from kitchen.production_task t where t.id = p_task_id;
  if v_task_kitchen is distinct from p_kitchen_id then
    raise exception 'Tarefa de produção não pertence a esta cozinha';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('provisional-frozen:' || p_kitchen_id || ':' || lower(v_description), 42));

  -- Nome que já existe no catálogo (ou provisória desta cozinha) é reaproveitado:
  -- a sobra de estrogonofe de hoje e a de sexta vão para a mesma preparação.
  select fp.id, fp.shelf_life_days into v_prep, v_shelf
    from kitchen.frozen_preparation fp
   where fp.deleted_at is null
     and lower(btrim(fp.description)) = lower(v_description)
     and (fp.provisional_kitchen_id is null or fp.provisional_kitchen_id = p_kitchen_id or fp.provisional_reviewed_at is not null)
   order by (fp.provisional_since is null) desc, fp.created_at
   limit 1;

  if v_prep is null then
    insert into kitchen.frozen_preparation
      (description, measure_unit, shelf_life_days, provisional_kitchen_id, provisional_since, provisional_by)
    values
      (v_description, nullif(btrim(coalesce(p_measure_unit, '')), ''), p_shelf_life_days, p_kitchen_id, now(), p_user)
    returning id, shelf_life_days into v_prep, v_shelf;
  end if;

  -- mesma regra de `leftoverExpiryDate` (production-issue.ts): data da produção + validade
  return query
    select r.lot_id, v_prep
      from inventory.register_leftover(
        p_kitchen_id, v_prep, p_lot_code,
        case when coalesce(v_shelf, 0) > 0 then p_production_date + v_shelf end,
        p_quantity, p_task_id, p_discard, p_reason, p_user
      ) r;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Saída tardia com a data real
-- ----------------------------------------------------------------------------
alter table inventory.stock_issue_request
  add column auto_closed_at timestamptz,
  add column explained_at timestamptz,
  add column explained_by uuid references auth.users (id) on delete set null,
  add column explanation text;

alter table inventory.stock_issue_request
  add constraint stock_issue_request_explanation_required
    check (explained_at is null or nullif(btrim(explanation), '') is not null);

comment on column inventory.stock_issue_request.auto_closed_at is
  'Fechada pelo job (inventory.close_stale_issue_requests), não por uma pessoa. Com status closed_unexplained, pede justificativa.';
comment on column inventory.stock_issue_request.explanation is
  'Justificativa registrada depois do fechamento automático sem explicação. Não reabre o dia nem muda a variância.';

-- O ledger só aceitava `occurred_at` do mesmo dia civil; o resto era "ajuste".
-- A saída tardia é o caso legítimo: o insumo saiu na terça sem requisição e o
-- almoxarife lança na quinta, com a data real e o motivo. Só a função da saída
-- tardia abre a exceção, e só com justificativa no movimento.
create or replace function inventory.stock_movement_occurred_at_guard()
returns trigger
language plpgsql
as $function$
begin
  if new.occurred_at > now() + interval '1 minute' then
    raise exception 'occurred_at no futuro não é permitido';
  end if;
  if (new.occurred_at at time zone 'America/Sao_Paulo')::date
     < (now() at time zone 'America/Sao_Paulo')::date then
    -- `inventory.register_late_issue` liga a flag na própria transação e grava
    -- o motivo no movimento. A competência fechada segue recusada pelo
    -- `stock_movement_period_lock`.
    if coalesce(current_setting('inventory.late_issue', true), '') = 'on'
       and new.type = 'production_issue'
       and nullif(btrim(coalesce(new.justification, '')), '') is not null then
      return new;
    end if;
    raise exception 'occurred_at retroativo só dentro do mesmo dia (Brasília) — use ajuste para corrigir dia anterior';
  end if;
  return new;
end;
$function$;

/**
 * Saída lançada depois, com a data em que de fato aconteceu.
 *
 * Liga-se ao DIA (a requisição da produção daquela data, se existir, em
 * qualquer status) e, opcionalmente, à PREPARAÇÃO (tarefa de produção). A
 * tarefa ligada passa a contar como baixada: é o lançamento tardio da baixa
 * dela, e `register_production_issue` recusa baixá-la de novo.
 *
 * Recusa só o imprescindível:
 *  - competência fechada (também recusada pelo trigger de período);
 *  - insumo contado DEPOIS da data numa contagem aprovada: o ajuste da
 *    contagem já tirou a falta do saldo, e a saída agora baixaria duas vezes.
 *
 * A alocação é a da emissão do dia (FEFO, pula quarentena), restrita aos lotes
 * que já existiam na data e não estavam vencidos nela. O que não couber em lote
 * vai sem lote, para a contagem regularizar — como na emissão do dia.
 */
create function inventory.register_late_issue(
  p_kitchen_id bigint,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_occurred_on date,
  p_reason text,
  p_user uuid,
  p_emission_id text,
  p_production_task_id uuid default null
) returns table (movements integer, without_lot numeric, request_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_occurred timestamptz;
  v_request_id uuid;
  v_task_kitchen bigint;
  v_lot record;
  v_remaining numeric(14,4);
  v_take numeric(14,4);
  v_count integer := 0;
  v_without_lot numeric(14,4) := 0;
  v_justification text;
  v_counted_on date;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  p_quantity := round(p_quantity, 4);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_emission_id is null or length(p_emission_id) < 8 then raise exception 'Emissão sem identificador'; end if;
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'Lançamento tardio exige o motivo (mínimo 5 caracteres)';
  end if;
  if p_occurred_on is null or p_occurred_on > v_today then
    raise exception 'A data real da saída não pode ser futura';
  end if;

  -- Retry da MESMA emissão devolve o que já foi feito (mesmo contrato de issue_stock).
  if exists (select 1 from inventory.stock_movement m where m.emission_id = p_emission_id) then
    if exists (
      select 1 from inventory.stock_movement m
       where m.emission_id = p_emission_id
         and (m.kitchen_id <> p_kitchen_id or m.ingredient_id is distinct from p_ingredient_id)
    ) or (select sum(m.quantity) from inventory.stock_movement m where m.emission_id = p_emission_id) <> p_quantity then
      raise exception 'Este identificador de emissão já foi usado para outra saída — recarregue a tela e lance de novo';
    end if;
    return query
      select count(*)::integer,
             coalesce(sum(case when m.lot_id is null then m.quantity else 0 end), 0),
             (array_agg(m.issue_request_id))[1]
        from inventory.stock_movement m where m.emission_id = p_emission_id;
    return;
  end if;

  if exists (
    select 1 from inventory.monthly_closing mc
     where mc.kitchen_id = p_kitchen_id and mc.competencia = date_trunc('month', p_occurred_on)::date
  ) then
    raise exception 'A competência % já foi fechada nesta cozinha: saída daquele mês se corrige com ajuste justificado no período aberto',
      to_char(p_occurred_on, 'MM/YYYY');
  end if;

  if p_production_task_id is not null then
    select t.kitchen_id into v_task_kitchen from kitchen.production_task t where t.id = p_production_task_id;
    if v_task_kitchen is distinct from p_kitchen_id then
      raise exception 'Tarefa de produção não pertence a esta cozinha';
    end if;
  end if;

  -- Hoje, o instante é agora. Dia anterior: meio-dia civil de Brasília — a hora
  -- exata ninguém sabe, e o meio do dia não empurra a saída para outro dia em fuso nenhum.
  v_occurred := case
    when p_occurred_on = v_today then now()
    else (p_occurred_on + time '12:00') at time zone 'America/Sao_Paulo'
  end;

  -- Dupla baixa: contagem APROVADA que viu este insumo depois da data real.
  select max((e.counted_at at time zone 'America/Sao_Paulo')::date) into v_counted_on
    from inventory.inventory_count c
    join inventory.inventory_count_entry e on e.count_id = c.id
    left join inventory.stock_lot l on l.id = e.lot_id
   where c.kitchen_id = p_kitchen_id
     and c.status = 'approved'
     and coalesce(e.ingredient_id, l.ingredient_id) = p_ingredient_id
     and e.counted_at > v_occurred;
  if v_counted_on is not null then
    raise exception 'Este insumo foi contado em % numa contagem já aprovada, depois da data informada: o ajuste da contagem já tirou do saldo o que faltava, e a saída agora baixaria duas vezes',
      to_char(v_counted_on, 'DD/MM/YYYY');
  end if;

  -- o dia: a requisição da produção daquela data, em qualquer status
  select r.id into v_request_id
    from inventory.stock_issue_request r
   where r.kitchen_id = p_kitchen_id and r.issue_date = p_occurred_on and r.origin = 'production'
   for update;

  v_justification := 'Lançamento tardio (saída em ' || to_char(p_occurred_on, 'DD/MM/YYYY') || '): ' || v_reason;
  perform set_config('inventory.late_issue', 'on', true);

  perform 1 from inventory.stock_lot l
    where l.kitchen_id = p_kitchen_id and l.ingredient_id is not distinct from p_ingredient_id
    order by l.id
    for update;

  v_remaining := p_quantity;
  for v_lot in
    select l.id,
           coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then m.quantity else -m.quantity end), 0) as balance
      from inventory.stock_lot l
      left join inventory.stock_movement m on m.lot_id = l.id
     where l.kitchen_id = p_kitchen_id
       and l.ingredient_id is not distinct from p_ingredient_id
       and l.quarantined_at is null
       and (l.expiry_date is null or l.expiry_date >= p_occurred_on)
       and (l.received_at is null or l.received_at <= v_occurred)
     group by l.id, l.use_first, l.expiry_date, l.received_at
    having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then m.quantity else -m.quantity end), 0) > 0
     order by l.use_first desc,
              coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date) asc,
              l.received_at asc,
              l.id asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.balance, v_remaining);
    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, lot_id, type, quantity, justification, issue_request_id, emission_id,
       production_task_id, created_by, occurred_at)
    values
      (p_kitchen_id, p_ingredient_id, v_lot.id, 'production_issue', v_take, v_justification, v_request_id, p_emission_id,
       p_production_task_id, p_user, v_occurred);
    v_count := v_count + 1;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, lot_id, type, quantity, justification, issue_request_id, emission_id,
       production_task_id, created_by, occurred_at)
    values
      (p_kitchen_id, p_ingredient_id, null, 'production_issue', v_remaining,
       v_justification || ' — sem saldo em lote, regularizar na contagem', v_request_id, p_emission_id,
       p_production_task_id, p_user, v_occurred);
    v_count := v_count + 1;
    v_without_lot := v_remaining;
  end if;

  perform set_config('inventory.late_issue', '', true);
  return query select v_count, v_without_lot, v_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Fechamento automático do dia
-- ----------------------------------------------------------------------------
/**
 * Fecha as requisições que ficaram abertas depois do dia delas.
 *
 * A requisição aberta indefinidamente travava a aprovação da contagem e deixava
 * a variância do dia sem julgamento. Fecha a partir das 03h do dia seguinte
 * (Brasília) — a ceia das 23h ainda sai do estoque depois da meia-noite:
 *  - `closed` quando nenhuma linha passa das DUAS tolerâncias sem motivo;
 *  - `closed_unexplained` quando alguma passa: a pendência fica no documento,
 *    visível, até alguém registrar a justificativa (`explanation`).
 *
 * A regra da tolerância é a de `evaluateVariance` (issue-variance.ts): desvio
 * acima do percentual (ou qualquer desvio contra sugestão zero) E acima do piso
 * em valor, só em linha que tem sugestão. O custo é o do último movimento da
 * requisição, senão o custo médio da cozinha — o mesmo retrato da tela.
 *
 * Trava na mesma ordem do fechamento manual (linhas, depois a requisição), e
 * reconfere o status sob a trava: quem fechou à mão no meio vence.
 */
create function inventory.close_stale_issue_requests(p_kitchen_id bigint default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_cutoff date := ((now() at time zone 'America/Sao_Paulo') - interval '3 hours')::date;
  v_request record;
  v_pct numeric;
  v_floor numeric;
  v_unexplained boolean;
  v_closed integer := 0;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  for v_request in
    select r.id, r.kitchen_id
      from inventory.stock_issue_request r
     where r.status = 'open'
       and r.issue_date < v_cutoff
       and (p_kitchen_id is null or r.kitchen_id = p_kitchen_id)
     order by r.id
  loop
    perform 1 from inventory.stock_issue_request_item i where i.request_id = v_request.id order by i.id for update;
    perform 1 from inventory.stock_issue_request r where r.id = v_request.id and r.status = 'open' for update;
    if not found then
      continue;
    end if;

    select coalesce(s.issue_tolerance_pct, 10), coalesce(s.issue_tolerance_floor_value, 20)
      into v_pct, v_floor
      from (select 1) one
      left join inventory.kitchen_stock_settings s on s.kitchen_id = v_request.kitchen_id;

    select exists (
      select 1
        from inventory.stock_issue_request_item i
        cross join lateral (
          select coalesce(sum(case when m.type = 'issue_return' then -m.quantity else m.quantity end), 0) as net,
                 (array_agg(m.unit_cost order by m.created_at desc) filter (where m.unit_cost is not null))[1] as last_cost
            from inventory.stock_movement m
           where m.issue_request_id = v_request.id and m.ingredient_id = i.ingredient_id
        ) mv
        left join inventory.stock_cost c
          on c.kitchen_id = v_request.kitchen_id and c.ingredient_id = i.ingredient_id and c.frozen_preparation_id is null
       where i.request_id = v_request.id
         and i.suggested_qty is not null
         and i.variance_reason is null
         and case
               when i.suggested_qty > 0 then round(abs(round(mv.net - i.suggested_qty, 4)) / i.suggested_qty * 100, 2) > v_pct
               else round(mv.net - i.suggested_qty, 4) <> 0
             end
         and round(abs(round(mv.net - i.suggested_qty, 4)) * coalesce(mv.last_cost, c.avg_unit_cost, 0), 2) > v_floor
    ) into v_unexplained;

    update inventory.stock_issue_request_item
       set suggested_frozen_at = now()
     where request_id = v_request.id and suggested_frozen_at is null;

    update inventory.stock_issue_request
       set status = case when v_unexplained then 'closed_unexplained' else 'closed' end,
           closed_at = now(),
           auto_closed_at = now()
     where id = v_request.id;

    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$$;

-- O job mora na migration, não no console (mesmo motivo do sucont-notification-tick,
-- 20260910190600). De hora em hora: se uma execução falhar, a próxima recupera, e a
-- função é idempotente.
do $$
begin
  perform cron.unschedule('inventory-close-stale-issue-days')
  where exists (select 1 from cron.job where jobname = 'inventory-close-stale-issue-days');

  perform cron.schedule('inventory-close-stale-issue-days', '5 * * * *', $cron$select inventory.close_stale_issue_requests()$cron$);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Aprovação da contagem: tarefa já baixada não trava; ressalva registrada
-- ----------------------------------------------------------------------------
alter table inventory.inventory_count
  add column pending_production_waiver text;

comment on column inventory.inventory_count.pending_production_waiver is
  'Ressalva registrada ao aprovar com produção concluída sem saída lançada (dia e motivo). Nulo = aprovada sem essa pendência.';

-- Corpo idêntico ao de 20260920180000, com duas mudanças no bloco da produção:
--  - a tarefa que já tem saída ligada a ela (Baixa por Produção ou lançamento
--    tardio) não conta: o que saiu já está no saldo, e era isso que a checagem
--    protegia;
--  - com a ressalva (`inventory.pending_production_waiver`, ligada por
--    `approve_inventory_count_with_waiver`), aprova e grava a ressalva.
create or replace function inventory.approve_inventory_count(p_count_id uuid, p_actor uuid, p_exception_reason text DEFAULT NULL::text)
 RETURNS TABLE(adjustment_id uuid, lines integer, difference_value numeric)
 LANGUAGE plpgsql
AS $function$
declare
  v_count inventory.inventory_count%rowtype;
  v_settings record;
  v_pending record;
  v_line record;
  v_lot record;
  v_adjustment_id uuid;
  v_lines int := 0;
  v_value numeric(14, 4) := 0;
  v_diff numeric(14, 4);
  v_remaining numeric(14, 4);
  v_take numeric(14, 4);
  v_counted_by_actor boolean;
  v_opened_by_actor boolean;
  v_first_opened timestamptz;
  v_chain uuid[];
  v_waiver text := nullif(btrim(coalesce(current_setting('inventory.pending_production_waiver', true), '')), '');
  v_waiver_note text;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  -- Só a coleta ENCERRADA se aprova. Aprovar em `counting` deixava lançamento
  -- chegando no meio cair numa contagem aprovada, fora do ajuste; e aprovar a
  -- rodada anterior, em `recount`, lançava o mesmo item duas vezes.
  if v_count.status <> 'review' then
    raise exception 'Contagem em "%" não está aguardando aprovação — encerre a coleta antes', v_count.status;
  end if;

  -- a cadeia de rodadas, desta até a primeira, travada na mesma ordem
  with recursive chain as (
    select c.id, c.parent_count_id from inventory.inventory_count c where c.id = p_count_id
    union all
    select c.id, c.parent_count_id from inventory.inventory_count c join chain ch on c.id = ch.parent_count_id
  )
  select array_agg(id) into v_chain from chain;
  perform 1 from inventory.inventory_count where id = any (v_chain) order by id for update;
  -- As rodadas ANTERIORES têm de estar esperando por esta (`recount`). Uma que
  -- venceu soltou o escopo dela: outra contagem pode ter pegado os itens, e
  -- aprovar aqui os ajustaria duas vezes — além de ressuscitar a vencida.
  if exists (
    select 1 from inventory.inventory_count c
     where c.id = any (v_chain) and c.id <> p_count_id and c.status <> 'recount'
  ) then
    raise exception 'Uma rodada anterior desta contagem não está mais aguardando (venceu ou foi encerrada): a cadeia não pode ser aprovada';
  end if;
  select min(created_at) into v_first_opened from inventory.inventory_count where id = any (v_chain);

  -- ── pré-condição: baixa de produção ainda não lançada ──────────────────────
  -- A data da abertura é a CIVIL de Brasília: `created_at::date` casta em UTC,
  -- e a contagem aberta depois das 21h pulava o dia anterior.
  -- Tarefa com saída ligada a ela (Baixa por Produção, lançamento tardio) já
  -- está no saldo: contá-la travava a contagem de quem baixa pela produção.
  select t.id, t.production_date into v_pending
    from kitchen.production_task t
   where t.kitchen_id = v_count.kitchen_id
     and t.status = 'DONE'
     and t.production_date >= (v_first_opened at time zone 'America/Sao_Paulo')::date - 1
     and not exists (
       select 1 from inventory.stock_issue_request r
        where r.kitchen_id = t.kitchen_id
          and r.issue_date = coalesce(t.issue_date, t.production_date)
          and r.origin = 'production'
          and r.status <> 'open'
     )
     and not exists (
       select 1 from inventory.stock_movement m
        where m.production_task_id = t.id and m.type = 'production_issue'
     )
   order by t.production_date
   limit 1;
  if found then
    if v_waiver is null then
      raise exception 'Há produção concluída em % sem a requisição do dia fechada: a contagem acusaria falta do que já saiu. Feche a requisição, lance a saída tardia, ou aprove com ressalva registrada',
        to_char(v_pending.production_date, 'DD/MM');
    end if;
    v_waiver_note := 'Produção de ' || to_char(v_pending.production_date, 'DD/MM/YYYY') || ' sem saída lançada: ' || v_waiver;
  end if;

  -- ── pré-condição: recebimento provisório ──────────────────────────────────
  select r.id into v_pending
    from inventory.goods_receipt r
   where r.kitchen_id = v_count.kitchen_id and r.status = 'provisional'
   limit 1;
  if found then
    raise exception 'Há recebimento provisório em aberto: o material está na prateleira e não no saldo. Efetive-o antes de aprovar';
  end if;

  -- ── segregação, sobre a cadeia inteira ─────────────────────────────────────
  v_settings := inventory.kitchen_settings(v_count.kitchen_id);
  select exists (
    select 1 from inventory.inventory_count_entry e where e.count_id = any (v_chain) and e.counted_by = p_actor
  ) into v_counted_by_actor;
  select exists (
    select 1 from inventory.inventory_count c where c.id = any (v_chain) and c.created_by = p_actor
  ) into v_opened_by_actor;

  if v_settings.segregation = 'strict' then
    if v_counted_by_actor or v_opened_by_actor then
      raise exception 'Segregação estrita nesta cozinha: quem abriu ou contou em qualquer rodada desta contagem não pode aprová-la. Peça a aprovação a outro nível 3 de estoque';
    end if;
  elsif v_opened_by_actor and p_exception_reason is null then
    raise exception 'Quem abriu a contagem não a aprova: a aprovação precisa de outra pessoa, ou de uma exceção registrada';
  end if;

  -- ── o ajuste derivado ─────────────────────────────────────────────────────
  -- O AUTOR é quem abriu a contagem: o documento sai dela. Com o aprovador
  -- como autor, `post_stock_adjustment` via autoaprovação em toda divergência
  -- acima da alçada, e ninguém conseguia aprovar.
  insert into inventory.stock_adjustment (kitchen_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.kitchen_id, p_count_id,
            'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' (' || v_count.type || ')',
            coalesce(v_count.created_by, p_actor), now())
    returning id into v_adjustment_id;

  for v_line in
    select * from inventory.count_lines(p_count_id) cl where cl.counted_qty is not null
  loop
    v_diff := v_line.counted_qty - v_line.ledger_qty;
    continue when v_diff = 0;

    if v_line.lot_id is not null then
      insert into inventory.stock_adjustment_item
        (adjustment_id, lot_id, direction, quantity, reason_code, note)
      values
        (v_adjustment_id, v_line.lot_id,
         case when v_diff > 0 then 'in' else 'out' end, abs(v_diff),
         case when v_diff > 0 then 'count_gain' else 'count_loss' end,
         'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
      v_lines := v_lines + 1;
    elsif v_diff > 0 then
      -- sobra sem lote: entra num lote novo, como o ajuste de entrada sem lote
      insert into inventory.stock_adjustment_item
        (adjustment_id, ingredient_id, frozen_preparation_id, direction, quantity, reason_code, note)
      values
        (v_adjustment_id, v_line.ingredient_id, v_line.frozen_preparation_id, 'in', v_diff, 'count_gain',
         'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
      v_lines := v_lines + 1;
    else
      -- Falta sem lote: sai dos lotes do item que a rodada NÃO contou por lote,
      -- o que vence antes primeiro. Saída de ajuste exige lote, e abortar a
      -- aprovação inteira por isso tornava inaprovável toda contagem de monte.
      v_remaining := -v_diff;
      -- Lote em QUARENTENA com saldo e não contado por lote: a falta não pode
      -- sair dele (o lançamento soltaria a quarentena) nem ser jogada nos lotes
      -- sadios (o suspeito ficaria com saldo que não existe). A quarentena já é
      -- separada na prateleira: conte-o por lote.
      select l.lot_code into v_pending
        from inventory.stock_lot l
       where l.kitchen_id = v_count.kitchen_id
         and l.ingredient_id is not distinct from v_line.ingredient_id
         and l.frozen_preparation_id is not distinct from v_line.frozen_preparation_id
         and l.quarantined_at is not null
         and not exists (
           select 1 from inventory.inventory_count_entry e
            where e.count_id = v_line.owner_count_id and e.lot_id = l.id
         )
         and (select coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                       then m.quantity else -m.quantity end), 0)
                from inventory.stock_movement m where m.lot_id = l.id) > 0
       limit 1;
      if found then
        raise exception 'O lote % está em quarentena e não foi contado por lote: conte-o por lote antes de aprovar a falta deste item', v_pending.lot_code;
      end if;
      for v_lot in
        select l.id,
               coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) as balance
          from inventory.stock_lot l
          left join inventory.stock_movement m on m.lot_id = l.id
         where l.kitchen_id = v_count.kitchen_id
           and l.ingredient_id is not distinct from v_line.ingredient_id
           and l.frozen_preparation_id is not distinct from v_line.frozen_preparation_id
           and not exists (
             select 1 from inventory.inventory_count_entry e
              where e.count_id = v_line.owner_count_id and e.lot_id = l.id
           )
           -- lote em quarentena não absorve falta: o lançamento do ajuste
           -- LIBERA a quarentena do lote que toca. Ele tem de ter sido contado
           -- por lote — a checagem logo acima recusa quando não foi.
           and l.quarantined_at is null
         group by l.id, l.expiry_date, l.received_at
        having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
         -- Compra que entrou DEPOIS do instante da contagem vai para o fim da
         -- fila: não estava na prateleira contada. Excluí-la de vez não serve —
         -- o lote aberto, porcionado ou descongelado depois da contagem também
         -- nasce depois, e o saldo dele ESTAVA na prateleira, dentro do lote de
         -- origem; sem ele a falta "não cabia" e a cadeia não se aprovava.
         order by (l.parent_lot_id is null and l.received_at > coalesce(v_line.counted_at, now())),
                  coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date), l.received_at, l.id
      loop
        exit when v_remaining <= 0;
        v_take := least(v_lot.balance, v_remaining);
        insert into inventory.stock_adjustment_item
          (adjustment_id, lot_id, direction, quantity, reason_code, note)
        values
          (v_adjustment_id, v_lot.id, 'out', v_take, 'count_loss',
           'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' — falta contada sem lote');
        v_lines := v_lines + 1;
        v_remaining := v_remaining - v_take;
      end loop;
      if v_remaining > 0 then
        raise exception 'A falta de % contada sem lote não cabe nos lotes que não foram contados por lote. Conte este item por lote',
          -v_diff;
      end if;
    end if;
  end loop;

  if v_lines = 0 then
    -- contagem sem diferença nenhuma não gera documento contábil vazio
    delete from inventory.stock_adjustment where id = v_adjustment_id;
    v_adjustment_id := null;
  else
    perform inventory.post_stock_adjustment(v_adjustment_id, p_actor, p_exception_reason);
    select coalesce(sum(posted_value), 0) into v_value
      from inventory.stock_adjustment where id = v_adjustment_id;
  end if;

  -- a rodada aprovada e as anteriores saem juntas: o ajuste é da cadeia
  update inventory.inventory_count
     set status = 'approved',
         approved_by = p_actor,
         approved_at = now(),
         adjustment_id = v_adjustment_id,
         confirmed_by = p_actor,
         confirmed_at = now()
   where id = any (v_chain);
  -- a marca vale para a CADEIA: quem contou numa rodada anterior e aprovou a
  -- última não pode aparecer como aprovação segregada naquela rodada
  update inventory.inventory_count
     set approved_by_own_entry = v_counted_by_actor
   where id = any (v_chain);
  update inventory.inventory_count
     set approval_exception_reason = p_exception_reason,
         pending_production_waiver = v_waiver_note
   where id = p_count_id;

  return query select v_adjustment_id, v_lines, v_value;
end;
$function$;

/**
 * Aprovação com ressalva: a produção de algum dia recente foi concluída sem
 * saída lançada, e a contagem precisa ser aprovada assim mesmo. A ressalva é
 * própria (não a exceção de segregação) e fica gravada na contagem.
 */
create function inventory.approve_inventory_count_with_waiver(
  p_count_id uuid,
  p_actor uuid,
  p_exception_reason text,
  p_pending_production_reason text
) returns table (adjustment_id uuid, lines integer, difference_value numeric)
language plpgsql
-- sem `set search_path`: o caminho vazio valeria também dentro de
-- `approve_inventory_count` e de `post_stock_adjustment`, que não o declaram
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_pending_production_reason, '')), '');
begin
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A ressalva exige o motivo (mínimo 5 caracteres)';
  end if;
  perform set_config('inventory.pending_production_waiver', v_reason, true);
  return query select * from inventory.approve_inventory_count(p_count_id, p_actor, p_exception_reason);
  perform set_config('inventory.pending_production_waiver', '', true);
end;
$$;

notify pgrst, 'reload schema';
