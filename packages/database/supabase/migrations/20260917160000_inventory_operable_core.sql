-- ============================================================================
-- Fase 2 de sisub-inventory-operations: núcleo operável
-- ============================================================================
-- O que entra aqui:
--   (1) configuração por cozinha (tolerâncias, alçada, segregação) — `stock_policy`
--       é por cozinha×ingrediente e não tem onde guardar isso;
--   (2) vocabulário novo do ledger: `issue_return` (devolução de saída),
--       `lot_split_in/out` (abrir/fracionar/descongelar) e `reason_code`
--       OBRIGATÓRIO em `waste` e `adjustment_*` — motivo em texto livre não
--       vira relatório de perdas nem evento contábil;
--   (3) escrita no ledger só pelas funções do módulo, exigida pelo banco;
--   (4) lote com código curto (etiqueta interna), local, quarentena,
--       "usar primeiro", derivação e data de entrada;
--   (5) ajuste como DOCUMENTO com alçada e segregação verificadas no SQL —
--       porque `auth.uid()` é nulo sob service role e o PBAC só existe em TS;
--   (6) `split_lot`: produto aberto, fracionado ou descongelado gera lote
--       derivado com validade própria (RDC ANVISA 216/2004, item 4.8.6).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Configuração por cozinha
-- ----------------------------------------------------------------------------
create table inventory.kitchen_stock_settings (
  kitchen_id bigint primary key references kitchen.kitchen (id) on delete cascade,
  -- `strict`: aprovador ≠ autor ≠ quem contou. `dual`: duas pessoas quaisquer.
  -- Cozinha com um almoxarife e um encarregado não cumpre `strict`, e travar a
  -- operação no sábado não é controle: é convite ao contorno. A exceção fica
  -- registrada e vira relatório.
  segregation text not null default 'dual' check (segregation in ('strict', 'dual')),
  -- acima deste valor (quantidade × custo médio) o ajuste precisa de aprovação
  adjustment_approval_value numeric(14,2) not null default 500 check (adjustment_approval_value >= 0),
  -- saída fora desta faixa exige motivo no fechamento do dia
  issue_tolerance_pct numeric(5,2) not null default 10 check (issue_tolerance_pct between 0 and 100),
  -- piso absoluto: 0,2 KG de sal fora do previsto não é variância, é ruído
  issue_tolerance_floor_value numeric(14,2) not null default 20 check (issue_tolerance_floor_value >= 0),
  count_tolerance_pct numeric(5,2) not null default 5 check (count_tolerance_pct between 0 and 100),
  count_tolerance_value numeric(14,2) not null default 50 check (count_tolerance_value >= 0),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

comment on table inventory.kitchen_stock_settings is
  'Tolerâncias, alçada e regime de segregação por cozinha. Sem linha, valem os defaults (a função inventory.kitchen_settings resolve).';

alter table inventory.kitchen_stock_settings enable row level security;
revoke all on inventory.kitchen_stock_settings from anon, authenticated;

-- Resolve as configurações com default, para o SQL não repetir coalesce
create function inventory.kitchen_settings(p_kitchen_id bigint)
returns inventory.kitchen_stock_settings
language sql stable as $$
  select coalesce(
    (select s from inventory.kitchen_stock_settings s where s.kitchen_id = p_kitchen_id),
    row(p_kitchen_id, 'dual', 500, 10, 20, 5, 50, null, now())::inventory.kitchen_stock_settings
  );
$$;

-- ----------------------------------------------------------------------------
-- (2) Vocabulário do ledger: tipos novos + motivo tipado
-- ----------------------------------------------------------------------------
alter table inventory.stock_movement drop constraint stock_movement_type_check;
alter table inventory.stock_movement add constraint stock_movement_type_check check (type in (
  'receipt', 'production_issue', 'issue_return', 'leftover_return', 'waste',
  'transfer_in', 'transfer_out', 'lot_split_in', 'lot_split_out',
  'adjustment_in', 'adjustment_out'));

alter table inventory.stock_movement add column reason_code text check (reason_code in (
  'expired', 'spoiled', 'damaged', 'cold_chain_failure', 'sanitary_recall',
  'lost', 'theft', 'quality_sample', 'supplier_return', 'donation',
  'entry_error_in', 'entry_error_out', 'count_gain', 'count_loss',
  'found_stock', 'opening_balance', 'production_leftover_discard'));

comment on column inventory.stock_movement.reason_code is
  'Motivo tipado. Obrigatório em waste e adjustment_*: texto livre não vira relatório de perdas nem evento contábil por natureza.';

-- movimento de ajuste e descarte SEM motivo tipado não existe
alter table inventory.stock_movement add constraint stock_movement_reason_required
  check (type not in ('waste', 'adjustment_in', 'adjustment_out') or reason_code is not null);

-- e o motivo tem direção fixa: `theft` não é entrada, `found_stock` não é saída
alter table inventory.stock_movement add constraint stock_movement_reason_direction
  check (
    reason_code is null
    or (reason_code in ('entry_error_in', 'count_gain', 'found_stock', 'opening_balance') and type = 'adjustment_in')
    or (reason_code in ('expired', 'spoiled', 'damaged', 'cold_chain_failure', 'sanitary_recall',
                        'lost', 'theft', 'quality_sample', 'supplier_return', 'donation',
                        'entry_error_out', 'count_loss') and type = 'adjustment_out')
    or (reason_code = 'production_leftover_discard' and type = 'waste')
  );

-- ----------------------------------------------------------------------------
-- (3) Escrita no ledger só pelas funções do módulo
-- ----------------------------------------------------------------------------
-- As server fns usam service role: RLS não barra nada, e um insert por
-- PostgREST pula alocação de lote sob trava, custo médio e competência
-- fechada. As funções do módulo marcam a transação; insert de service role sem
-- a marca é recusado. Conexão administrativa (migration, psql, teste de
-- integração) segue livre — é ela que faz carga e conserto.
create function inventory.stock_movement_require_module() returns trigger
language plpgsql as $$
begin
  if current_user = 'service_role' and coalesce(current_setting('inventory.via_rpc', true), '') <> 'on' then
    raise exception 'stock_movement só aceita escrita pelas funções do módulo (inventory.*) — use a RPC correspondente';
  end if;
  return new;
end;
$$;

create trigger stock_movement_require_module
  before insert on inventory.stock_movement
  for each row execute function inventory.stock_movement_require_module();

-- ----------------------------------------------------------------------------
-- (2b) Partição entrada/saída com os tipos novos
-- ----------------------------------------------------------------------------
create or replace function inventory.stock_movement_costing_before() returns trigger
language plpgsql as $$
declare
  v_avg numeric(12,4);
  v_qty numeric(14,4);
  v_last numeric(12,4);
begin
  insert into inventory.stock_cost (kitchen_id, ingredient_id, frozen_preparation_id)
    values (new.kitchen_id, new.ingredient_id, new.frozen_preparation_id)
    on conflict do nothing;

  select quantity, avg_unit_cost into v_qty, v_avg
    from inventory.stock_cost
    where kitchen_id = new.kitchen_id
      and ingredient_id is not distinct from new.ingredient_id
      and frozen_preparation_id is not distinct from new.frozen_preparation_id
    for update;

  if new.unit_cost is null then
    if new.type in ('production_issue', 'waste', 'transfer_out', 'lot_split_out', 'adjustment_out') then
      new.unit_cost := coalesce(v_avg, 0);
    elsif new.type = 'adjustment_in' then
      if coalesce(v_avg, 0) > 0 then
        new.unit_cost := v_avg;
      else
        select m.unit_cost into v_last
          from inventory.stock_movement m
          where m.kitchen_id = new.kitchen_id
            and m.ingredient_id is not distinct from new.ingredient_id
            and m.frozen_preparation_id is not distinct from new.frozen_preparation_id
            and m.type = 'receipt'
            and m.unit_cost is not null
            and m.unit_cost > 0
          order by m.occurred_at desc
          limit 1;
        if v_last is null then
          raise exception 'Entrada de ajuste sem custo e sem custo médio nem recebimento anterior — informe o custo unitário';
        end if;
        new.unit_cost := v_last;
      end if;
    end if;
  end if;

  new.total_cost := round(new.quantity * coalesce(new.unit_cost, 0), 4);
  return new;
end;
$$;

create or replace function inventory.stock_movement_costing_after() returns trigger
language plpgsql as $$
declare
  v_qty numeric(14,4);
  v_avg numeric(12,4);
  v_new_qty numeric(14,4);
begin
  select quantity, avg_unit_cost into v_qty, v_avg
    from inventory.stock_cost
    where kitchen_id = new.kitchen_id
      and ingredient_id is not distinct from new.ingredient_id
      and frozen_preparation_id is not distinct from new.frozen_preparation_id
    for update;

  if new.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in') then
    v_new_qty := v_qty + new.quantity;
    if v_qty <= 0 then
      v_avg := case when new.quantity > 0 then round(coalesce(new.total_cost, 0) / new.quantity, 4) else v_avg end;
    elsif v_new_qty > 0 then
      v_avg := round(((v_qty * v_avg) + coalesce(new.total_cost, 0)) / v_new_qty, 4);
    end if;
  else
    v_new_qty := v_qty - new.quantity;
  end if;

  update inventory.stock_cost
    set quantity = v_new_qty, avg_unit_cost = v_avg, updated_at = now()
    where kitchen_id = new.kitchen_id
      and ingredient_id is not distinct from new.ingredient_id
      and frozen_preparation_id is not distinct from new.frozen_preparation_id;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (4) Lote: etiqueta, local, quarentena, derivação
-- ----------------------------------------------------------------------------
-- Alfabeto de Crockford sem I, L, O e U: nenhuma etiqueta impressa é lida como
-- outra por confusão de 1/I ou 0/O.
create function inventory.lot_short_code() returns text
language plpgsql as $$
declare
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text;
begin
  loop
    v_code := 'LOT';
    for _ in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from inventory.stock_lot where short_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table inventory.stock_lot
  add column short_code text,
  add column location text check (length(location) <= 60),
  add column received_at timestamptz,
  add column use_first boolean not null default false,
  add column quarantined_at timestamptz,
  add column quarantined_by uuid references auth.users (id),
  add column quarantine_reason text,
  add column parent_lot_id uuid references inventory.stock_lot (id),
  add column derivation text check (derivation in ('opened', 'portioned', 'thawed')),
  add column opened_at timestamptz;

update inventory.stock_lot set received_at = created_at where received_at is null;
update inventory.stock_lot set short_code = inventory.lot_short_code() where short_code is null;

alter table inventory.stock_lot
  alter column received_at set default now(),
  alter column received_at set not null,
  alter column short_code set default inventory.lot_short_code(),
  alter column short_code set not null;

create unique index stock_lot_short_code_key on inventory.stock_lot (short_code);
create index stock_lot_quarantine_idx on inventory.stock_lot (kitchen_id) where quarantined_at is not null;
create index stock_lot_parent_idx on inventory.stock_lot (parent_lot_id) where parent_lot_id is not null;

comment on column inventory.stock_lot.short_code is
  'Código da etiqueta interna. É o que torna a leitura útil para produto de varejo (só tem EAN) e hortifrúti (não tem código).';
comment on column inventory.stock_lot.use_first is
  'Marcado no painel de vencimentos: a alocação prefere este lote antes do FEFO comum.';
comment on column inventory.stock_lot.quarantined_at is
  'Lote suspeito sai da alocação NA HORA, antes de o ajuste ser aprovado — senão o lote podre é sugerido no domingo.';

-- ----------------------------------------------------------------------------
-- (4b) Alocação passa a respeitar quarentena e "usar primeiro"
-- ----------------------------------------------------------------------------
create or replace function inventory.register_production_issue(
  p_task_id uuid,
  p_lines jsonb,
  p_user uuid
) returns table (movements int)
language plpgsql as $$
declare
  v_count int := 0;
  v_line record;
  v_lot record;
  v_remaining numeric(14,4);
  v_take numeric(14,4);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  perform pg_advisory_xact_lock(hashtextextended(p_task_id::text, 42));

  if exists (
    select 1 from inventory.stock_movement
    where production_task_id = p_task_id and type = 'production_issue'
  ) then
    raise exception 'Esta tarefa já teve baixa de estoque registrada';
  end if;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(
      kitchen_id bigint,
      ingredient_id uuid,
      quantity numeric,
      override_lot_id uuid,
      justification text
    )
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantidade deve ser positiva';
    end if;

    if v_line.override_lot_id is not null then
      perform 1 from inventory.stock_lot
        where id = v_line.override_lot_id
          and kitchen_id = v_line.kitchen_id
          and ingredient_id is not distinct from v_line.ingredient_id
        for update;
      if not found then
        raise exception 'Lote % não pertence à cozinha/ingrediente do movimento (override inválido)', v_line.override_lot_id;
      end if;
      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.kitchen_id, v_line.ingredient_id, v_line.override_lot_id, 'production_issue',
         v_line.quantity, v_line.justification, p_task_id, p_user);
      v_count := v_count + 1;
      continue;
    end if;

    v_remaining := v_line.quantity;

    perform 1 from inventory.stock_lot
      where kitchen_id = v_line.kitchen_id
        and ingredient_id is not distinct from v_line.ingredient_id
      order by id
      for update;

    -- ordem: "usar primeiro" (painel de vencimentos) → validade → entrada.
    -- Fora: lote vencido e lote em quarentena.
    for v_lot in
      select l.id,
             coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then m.quantity else -m.quantity end), 0) as balance
        from inventory.stock_lot l
        left join inventory.stock_movement m on m.lot_id = l.id
        where l.kitchen_id = v_line.kitchen_id
          and l.ingredient_id is not distinct from v_line.ingredient_id
          and l.quarantined_at is null
          and (l.expiry_date is null or l.expiry_date >= v_today)
        group by l.id, l.use_first, l.expiry_date, l.received_at
        having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
        order by l.use_first desc, l.expiry_date asc nulls last, l.received_at asc, l.id asc
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.balance, v_remaining);
      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.kitchen_id, v_line.ingredient_id, v_lot.id, 'production_issue',
         v_take, v_line.justification, p_task_id, p_user);
      v_count := v_count + 1;
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, lot_id, type, quantity, justification, production_task_id, created_by)
      values
        (v_line.kitchen_id, v_line.ingredient_id, null, 'production_issue', v_remaining,
         coalesce(v_line.justification, 'Consumo além do saldo em lotes (estoque negativo — regularizar na contagem)'),
         p_task_id, p_user);
      v_count := v_count + 1;
    end if;
  end loop;

  return query select v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- (5) Ajuste como documento
-- ----------------------------------------------------------------------------
create table inventory.stock_adjustment (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references kitchen.kitchen (id),
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'posted', 'rejected')),
  notes text,
  -- evidência pode chegar DEPOIS: recusar o lançamento de R$ 40 por falta de
  -- foto num desktop sem câmera é o que faz o operador não lançar nada
  evidence_status text not null default 'complete' check (evidence_status in ('complete', 'pending')),
  inventory_count_id uuid references inventory.inventory_count (id),
  approval_exception_reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  rejection_reason text,
  posted_value numeric(14,4)
);

comment on table inventory.stock_adjustment is
  'Documento de ajuste de estoque. O movimento só nasce em `posted`, atomicamente, com alçada e segregação verificadas no SQL.';

create index stock_adjustment_kitchen_idx on inventory.stock_adjustment (kitchen_id, created_at desc);
create index stock_adjustment_pending_idx on inventory.stock_adjustment (kitchen_id) where status = 'pending_approval';

create table inventory.stock_adjustment_item (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references inventory.stock_adjustment (id) on delete cascade,
  lot_id uuid references inventory.stock_lot (id),
  ingredient_id uuid references kitchen.ingredient (id),
  frozen_preparation_id uuid references kitchen.frozen_preparation (id),
  direction text not null check (direction in ('in', 'out')),
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(12,4),
  reason_code text not null check (reason_code in (
    'expired', 'spoiled', 'damaged', 'cold_chain_failure', 'sanitary_recall',
    'lost', 'theft', 'quality_sample', 'supplier_return', 'donation',
    'entry_error_in', 'entry_error_out', 'count_gain', 'count_loss',
    'found_stock', 'opening_balance')),
  note text,
  -- evidência referenciada, não anexada: número da parte, do BO, do processo,
  -- da NF-e de devolução, ou a temperatura medida
  evidence_kind text check (evidence_kind in ('photo', 'term', 'report', 'process', 'nfe_key', 'temperature', 'other')),
  evidence_reference text,
  measured_temperature_c numeric(5,2),
  corrected_movement_id uuid references inventory.stock_movement (id),
  investigation_reference text,
  movement_id uuid references inventory.stock_movement (id),
  constraint stock_adjustment_item_target check (num_nonnulls(lot_id, ingredient_id, frozen_preparation_id) >= 1),
  constraint stock_adjustment_item_direction_reason check (
    (direction = 'in' and reason_code in ('entry_error_in', 'count_gain', 'found_stock', 'opening_balance'))
    or (direction = 'out' and reason_code in ('expired', 'spoiled', 'damaged', 'cold_chain_failure',
        'sanitary_recall', 'lost', 'theft', 'quality_sample', 'supplier_return', 'donation',
        'entry_error_out', 'count_loss'))
  )
);

create index stock_adjustment_item_doc_idx on inventory.stock_adjustment_item (adjustment_id);

create table inventory.stock_adjustment_attachment (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references inventory.stock_adjustment (id) on delete cascade,
  storage_path text not null,
  content_type text,
  byte_size bigint,
  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default now()
);

comment on table inventory.stock_adjustment_attachment is
  'Anexo de evidência. O caminho é resolvido a partir do documento (kitchen_id), nunca do que o cliente manda: policy de Storage não avalia PBAC.';

alter table inventory.stock_adjustment enable row level security;
alter table inventory.stock_adjustment_item enable row level security;
alter table inventory.stock_adjustment_attachment enable row level security;
revoke all on inventory.stock_adjustment from anon, authenticated;
revoke all on inventory.stock_adjustment_item from anon, authenticated;
revoke all on inventory.stock_adjustment_attachment from anon, authenticated;

-- Motivos que SEMPRE precisam de aprovação, independente do valor
create function inventory.reason_always_requires_approval(p_reason text) returns boolean
language sql immutable as $$
  select p_reason in ('cold_chain_failure', 'sanitary_recall', 'lost', 'theft',
                      'supplier_return', 'donation', 'entry_error_in', 'entry_error_out', 'found_stock');
$$;

-- Valor do documento, para a alçada: quantidade × custo (médio quando não informado)
create function inventory.adjustment_value(p_adjustment_id uuid) returns numeric
language sql stable as $$
  select coalesce(sum(i.quantity * coalesce(i.unit_cost, c.avg_unit_cost, 0)), 0)
    from inventory.stock_adjustment_item i
    join inventory.stock_adjustment a on a.id = i.adjustment_id
    left join inventory.stock_lot l on l.id = i.lot_id
    left join inventory.stock_cost c
      on c.kitchen_id = a.kitchen_id
     and c.ingredient_id is not distinct from coalesce(i.ingredient_id, l.ingredient_id)
     and c.frozen_preparation_id is not distinct from coalesce(i.frozen_preparation_id, l.frozen_preparation_id)
   where i.adjustment_id = p_adjustment_id;
$$;

/**
 * Precisa de aprovação?
 *
 * Soma os ajustes do MESMO autor e item nas últimas 24 h: cinco ajustes de
 * R$ 180 não escapam de uma alçada de R$ 500 só por serem cinco documentos.
 */
create function inventory.adjustment_requires_approval(p_adjustment_id uuid) returns boolean
language plpgsql stable as $$
declare
  v_doc inventory.stock_adjustment%rowtype;
  v_settings inventory.kitchen_stock_settings;
  v_value numeric;
  v_window numeric;
begin
  select * into v_doc from inventory.stock_adjustment where id = p_adjustment_id;
  if not found then raise exception 'Ajuste não encontrado'; end if;
  v_settings := inventory.kitchen_settings(v_doc.kitchen_id);

  if exists (
    select 1 from inventory.stock_adjustment_item i
    where i.adjustment_id = p_adjustment_id
      and inventory.reason_always_requires_approval(i.reason_code)
  ) then
    return true;
  end if;

  v_value := inventory.adjustment_value(p_adjustment_id);

  select coalesce(sum(inventory.adjustment_value(a.id)), 0) into v_window
    from inventory.stock_adjustment a
    where a.kitchen_id = v_doc.kitchen_id
      and a.created_by is not distinct from v_doc.created_by
      and a.status = 'posted'
      and a.decided_at > now() - interval '24 hours';

  return (v_value + v_window) > v_settings.adjustment_approval_value;
end;
$$;

/**
 * Lança o ajuste: cria os movimentos numa transação, com os lotes travados.
 *
 * `p_actor` vem do servidor já autenticado — `auth.uid()` é nulo sob service
 * role, então a segregação é checada contra dado do banco (autoria), e "existe
 * outra pessoa elegível" é decisão do servidor, registrada em
 * `approval_exception_reason` quando não existe.
 */
create function inventory.post_stock_adjustment(
  p_adjustment_id uuid,
  p_actor uuid,
  p_approval_exception_reason text default null
) returns table (movements int, value numeric)
language plpgsql as $$
declare
  v_doc inventory.stock_adjustment%rowtype;
  v_settings inventory.kitchen_stock_settings;
  v_item record;
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_movement_id uuid;
  v_count int := 0;
  v_requires boolean;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_doc from inventory.stock_adjustment where id = p_adjustment_id for update;
  if not found then raise exception 'Ajuste não encontrado'; end if;
  if v_doc.status = 'posted' then raise exception 'Ajuste já lançado'; end if;
  if v_doc.status = 'rejected' then raise exception 'Ajuste rejeitado não pode ser lançado'; end if;
  if not exists (select 1 from inventory.stock_adjustment_item where adjustment_id = p_adjustment_id) then
    raise exception 'Ajuste sem itens';
  end if;

  v_settings := inventory.kitchen_settings(v_doc.kitchen_id);
  v_requires := inventory.adjustment_requires_approval(p_adjustment_id);

  if v_requires then
    if v_doc.created_by is not distinct from p_actor and p_approval_exception_reason is null then
      raise exception 'Ajuste acima da alçada (ou de motivo que sempre exige aprovação) precisa de aprovador diferente do autor';
    end if;
    if v_settings.segregation = 'strict'
       and v_doc.created_by is not distinct from p_actor
       and p_approval_exception_reason is null then
      raise exception 'Segregação estrita: o aprovador não pode ser o autor';
    end if;
  end if;

  for v_item in
    select * from inventory.stock_adjustment_item where adjustment_id = p_adjustment_id order by id
  loop
    if v_item.lot_id is not null then
      select * into v_lot from inventory.stock_lot where id = v_item.lot_id for update;
      if not found then raise exception 'Lote % não encontrado', v_item.lot_id; end if;
      if v_lot.kitchen_id <> v_doc.kitchen_id then
        raise exception 'Lote % não pertence à cozinha do ajuste', v_item.lot_id;
      end if;
    else
      -- entrada de item sem lote (achado, abertura): cria o lote aqui
      if v_item.direction = 'out' then raise exception 'Saída de ajuste exige lote'; end if;
      insert into inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, unit_cost)
        values (v_doc.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id,
                'SEM-LOTE-' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
                v_item.unit_cost)
        returning * into v_lot;
      update inventory.stock_adjustment_item set lot_id = v_lot.id where id = v_item.id;
    end if;

    if v_item.direction = 'out' then
      select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then quantity else -quantity end), 0)
        into v_balance
        from inventory.stock_movement where lot_id = v_lot.id;
      if v_balance < v_item.quantity then
        raise exception 'Saldo insuficiente no lote % (% disponível)', v_lot.lot_code, v_balance;
      end if;
    end if;

    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost,
       reason_code, justification, inventory_count_id, created_by)
    values
      (v_doc.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.id,
       case when v_item.direction = 'in' then 'adjustment_in' else 'adjustment_out' end,
       v_item.quantity, v_item.unit_cost, v_item.reason_code,
       coalesce(v_item.note, 'Ajuste ' || v_item.reason_code), v_doc.inventory_count_id, p_actor)
    returning id into v_movement_id;

    update inventory.stock_adjustment_item set movement_id = v_movement_id where id = v_item.id;
    v_count := v_count + 1;

    -- lote ajustado sai da quarentena: o que motivou a quarentena virou lançamento
    if v_lot.quarantined_at is not null then
      update inventory.stock_lot
        set quarantined_at = null, quarantined_by = null, quarantine_reason = null
        where id = v_lot.id;
    end if;
  end loop;

  update inventory.stock_adjustment
    set status = 'posted',
        decided_by = p_actor,
        decided_at = now(),
        approval_exception_reason = coalesce(p_approval_exception_reason, approval_exception_reason),
        posted_value = inventory.adjustment_value(p_adjustment_id)
    where id = p_adjustment_id;

  return query select v_count, inventory.adjustment_value(p_adjustment_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- (5b) Contagem passa a lançar pelo documento de ajuste
-- ----------------------------------------------------------------------------
create or replace function inventory.confirm_inventory_count(p_count_id uuid, p_user uuid)
returns table (adjustments int)
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_item record;
  v_balance numeric(14,4);
  v_adjustment_id uuid;
  v_adjustments int := 0;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status <> 'draft' then raise exception 'Contagem já confirmada'; end if;

  insert into inventory.stock_adjustment (kitchen_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.kitchen_id, p_count_id, 'Contagem física ' || p_count_id, v_count.created_by, now())
    returning id into v_adjustment_id;

  for v_item in
    select ci.lot_id, ci.counted_qty, l.kitchen_id, l.ingredient_id, l.frozen_preparation_id, l.lot_code
      from inventory.inventory_count_item ci
      join inventory.stock_lot l on l.id = ci.lot_id
      where ci.count_id = p_count_id
      for update of l
  loop
    if v_item.kitchen_id <> v_count.kitchen_id then
      raise exception 'Lote % pertence à cozinha %, não à cozinha da contagem (%)',
        v_item.lot_id, v_item.kitchen_id, v_count.kitchen_id;
    end if;

    select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                             then quantity else -quantity end), 0)
      into v_balance
      from inventory.stock_movement
      where lot_id = v_item.lot_id;

    update inventory.inventory_count_item
      set ledger_qty = v_balance
      where count_id = p_count_id and lot_id = v_item.lot_id;

    if v_item.counted_qty <> v_balance then
      insert into inventory.stock_adjustment_item
        (adjustment_id, lot_id, direction, quantity, reason_code, note, evidence_kind, evidence_reference)
      values
        (v_adjustment_id, v_item.lot_id,
         case when v_item.counted_qty > v_balance then 'in' else 'out' end,
         abs(v_item.counted_qty - v_balance),
         case when v_item.counted_qty > v_balance then 'count_gain' else 'count_loss' end,
         'Contagem física ' || p_count_id, 'report', p_count_id::text);
      v_adjustments := v_adjustments + 1;
    end if;
  end loop;

  if v_adjustments > 0 then
    -- a contagem é o ato de aprovação: quem confirma responde por ela
    perform inventory.post_stock_adjustment(v_adjustment_id, p_user, 'Ajuste derivado da contagem física confirmada');
  else
    update inventory.stock_adjustment set status = 'rejected', decided_by = p_user, decided_at = now(),
      rejection_reason = 'Contagem sem divergência — nenhum ajuste necessário'
      where id = v_adjustment_id;
  end if;

  update inventory.inventory_count
    set status = 'confirmed', confirmed_by = p_user, confirmed_at = now()
    where id = p_count_id;

  return query select v_adjustments;
end;
$$;

-- `adjust_stock` da Fase 0 dá lugar ao documento: um caminho só para ajuste
drop function if exists inventory.adjust_stock(bigint, text, numeric, text, uuid, uuid, uuid, uuid, text, date, numeric);

-- ----------------------------------------------------------------------------
-- (6) Produto aberto, fracionado ou descongelado
-- ----------------------------------------------------------------------------
-- RDC ANVISA 216/2004, item 4.8.6: produto fracionado ou manipulado precisa de
-- identificação com designação, data de manipulação e validade. Aqui isso deixa
-- de ser papel colado na bandeja e passa a ser lote derivado com etiqueta.
--
-- Não é transferência nem consumo: o saldo do item não muda e o custo médio não
-- se mexe (par lot_split_out/lot_split_in ao mesmo custo).
alter table kitchen.ingredient
  add column if not exists shelf_life_after_opening_days int check (shelf_life_after_opening_days > 0),
  add column if not exists shelf_life_after_thaw_days int check (shelf_life_after_thaw_days > 0),
  add column if not exists default_shelf_life_days int check (default_shelf_life_days > 0);

comment on column kitchen.ingredient.shelf_life_after_opening_days is
  'Prazo de consumo depois de aberto/fracionado (RDC 216). Alimenta a validade do lote derivado.';
comment on column kitchen.ingredient.default_shelf_life_days is
  'Validade presumida quando a nota não traz nenhuma — hortifrúti raramente traz.';

create function inventory.split_lot(
  p_lot_id uuid,
  p_quantity numeric,
  p_derivation text,
  p_user uuid,
  p_expiry_date date default null,
  p_location text default null
-- Os nomes de retorno são prefixados porque `lot_id`, `short_code` e
-- `expiry_date` também são COLUNAS das tabelas que a função consulta: em
-- plpgsql, o parâmetro de saída ganha do nome da coluna e a consulta estoura
-- com "column reference is ambiguous".
) returns table (new_lot_id uuid, new_short_code text, new_expiry_date date)
language plpgsql as $$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_days int;
  v_expiry date;
  v_new_lot inventory.stock_lot%rowtype;
  v_unit_cost numeric(12,4);
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_derivation not in ('opened', 'portioned', 'thawed') then
    raise exception 'Derivação inválida: %', p_derivation;
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.quarantined_at is not null then raise exception 'Lote em quarentena não pode ser fracionado'; end if;

  select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

  -- validade do derivado: a MENOR entre a original e agora + prazo do item
  if v_lot.ingredient_id is not null then
    select case p_derivation
             when 'thawed' then i.shelf_life_after_thaw_days
             else i.shelf_life_after_opening_days
           end
      into v_days
      from kitchen.ingredient i where i.id = v_lot.ingredient_id;
  end if;

  v_expiry := coalesce(
    p_expiry_date,
    case when v_days is not null
      then least(coalesce(v_lot.expiry_date, 'infinity'::date),
                 ((now() at time zone 'America/Sao_Paulo')::date + v_days))
      else v_lot.expiry_date
    end
  );
  if v_expiry = 'infinity'::date then v_expiry := null; end if;

  -- custo médio vigente vale para os dois movimentos: o par não pode mudar valor
  select avg_unit_cost into v_unit_cost
    from inventory.stock_cost
    where kitchen_id = v_lot.kitchen_id
      and ingredient_id is not distinct from v_lot.ingredient_id
      and frozen_preparation_id is not distinct from v_lot.frozen_preparation_id;

  insert into inventory.stock_lot
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date, unit_cost,
     location, parent_lot_id, derivation, opened_at, received_at)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id,
     v_lot.lot_code || '-' || upper(substr(p_derivation, 1, 1)), v_expiry, coalesce(v_unit_cost, v_lot.unit_cost),
     coalesce(p_location, v_lot.location), v_lot.id, p_derivation, now(), now())
  returning * into v_new_lot;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, justification, created_by)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.id, 'lot_split_out',
     p_quantity, coalesce(v_unit_cost, 0), 'Fracionamento (' || p_derivation || ') → ' || v_new_lot.short_code, p_user),
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_new_lot.id, 'lot_split_in',
     p_quantity, coalesce(v_unit_cost, 0), 'Fracionamento (' || p_derivation || ') ← ' || v_lot.short_code, p_user);

  return query select v_new_lot.id, v_new_lot.short_code, v_new_lot.expiry_date;
end;
$$;

-- ----------------------------------------------------------------------------
-- (7) Funções existentes marcam a transação
-- ----------------------------------------------------------------------------
-- Sem a marca, o trigger de (3) recusaria a escrita feita por elas via service
-- role. `create or replace` só para acrescentar o `set_config` — o corpo é o
-- mesmo das migrations anteriores.
create or replace function inventory.transfer_stock(
  p_lot_id uuid,
  p_to_kitchen bigint,
  p_quantity numeric,
  p_user uuid
) returns table (transfer_pair_id uuid)
language plpgsql as $$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_dest_lot_id uuid;
  v_pair uuid := gen_random_uuid();
  v_out_cost numeric(12,4);
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.kitchen_id = p_to_kitchen then raise exception 'Origem e destino são a mesma cozinha'; end if;
  if v_lot.quarantined_at is not null then raise exception 'Lote em quarentena não é transferível'; end if;

  select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

  select id into v_dest_lot_id
    from inventory.stock_lot
    where kitchen_id = p_to_kitchen
      and lot_code = v_lot.lot_code
      and (ingredient_id = v_lot.ingredient_id or frozen_preparation_id = v_lot.frozen_preparation_id)
      and expiry_date is not distinct from v_lot.expiry_date
    limit 1;
  if v_dest_lot_id is null then
    insert into inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date, unit_cost, received_at)
      values (p_to_kitchen, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.lot_code, v_lot.expiry_date, v_lot.unit_cost, now())
      returning id into v_dest_lot_id;
  end if;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, transfer_pair_id, created_by)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, p_lot_id, 'transfer_out', p_quantity, v_pair, p_user)
  returning unit_cost into v_out_cost;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, transfer_pair_id, created_by)
  values
    (p_to_kitchen, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_dest_lot_id, 'transfer_in', p_quantity, v_out_cost, v_pair, p_user);

  return query select v_pair;
end;
$$;

-- `finalize_goods_receipt` e `register_leftover`: a marca entra por wrapper
-- (o corpo delas é longo e não muda nesta fase).
create function inventory.mark_module_transaction() returns void
language sql as $$ select set_config('inventory.via_rpc', 'on', true) $$;

comment on function inventory.mark_module_transaction() is
  'Marca a transação como vinda do módulo. Chamada no início das funções que escrevem no ledger; o trigger stock_movement_require_module exige a marca quando o papel é service_role.';

-- ----------------------------------------------------------------------------
-- (7b) As duas funções restantes que escrevem no ledger
-- ----------------------------------------------------------------------------
-- Corpo idêntico ao das migrations anteriores, com duas mudanças:
--   • marcam a transação (exigência de (3));
--   • o descarte de sobra passa a gravar `reason_code =
--     'production_leftover_discard'` — o CHECK novo exige motivo tipado em
--     `waste`, e "sobra descartada" é consumo, não perda de estoque.

create or replace function inventory.register_leftover(p_kitchen_id bigint, p_frozen_preparation_id uuid, p_lot_code text, p_expiry_date date, p_quantity numeric, p_task_id uuid, p_discard boolean, p_reason text, p_user uuid)
 RETURNS TABLE(lot_id uuid)
 LANGUAGE plpgsql
AS $function$
declare
  v_lot_id uuid;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  if p_discard and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Descarte exige motivo';
  end if;

  -- a MESMA tarefa não registra sobra duas vezes (retry após sucesso parcial
  -- reaproveitava e duplicava o retorno)
  perform pg_advisory_xact_lock(hashtextextended('leftover:' || p_task_id::text, 42));
  if exists (
    select 1 from inventory.stock_movement
    where production_task_id = p_task_id and type = 'leftover_return'
  ) then
    raise exception 'Esta tarefa já teve sobra registrada';
  end if;

  select id into v_lot_id
    from inventory.stock_lot
    where kitchen_id = p_kitchen_id
      and frozen_preparation_id = p_frozen_preparation_id
      and lot_code = p_lot_code
      and expiry_date is not distinct from p_expiry_date
    limit 1;
  if v_lot_id is null then
    insert into inventory.stock_lot (kitchen_id, frozen_preparation_id, lot_code, expiry_date)
      values (p_kitchen_id, p_frozen_preparation_id, p_lot_code, p_expiry_date)
      returning id into v_lot_id;
  end if;

  insert into inventory.stock_movement
    (kitchen_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, production_task_id, created_by)
  values
    (p_kitchen_id, p_frozen_preparation_id, v_lot_id, 'leftover_return', p_quantity, 0, p_task_id, p_user);

  if p_discard then
    insert into inventory.stock_movement
      (kitchen_id, frozen_preparation_id, lot_id, type, quantity, reason_code, justification, production_task_id, created_by)
    values
      (p_kitchen_id, p_frozen_preparation_id, v_lot_id, 'waste', p_quantity,
       'production_leftover_discard', btrim(p_reason), p_task_id, p_user);
  end if;

  return query select v_lot_id;
end;
$function$;

create or replace function inventory.finalize_goods_receipt(p_receipt_id uuid, p_user uuid)
 RETURNS TABLE(movements integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_item record;
  v_lot record;
  v_lot_id uuid;
  v_movements int := 0;
  v_has_divergence boolean;
  v_lot_total numeric(14,4);
  v_conservation text;
  v_fallback_seq int;
  v_of_kitchen bigint;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;

  -- (20260730120000, guarda 1) Efetivação é única. Precede o gate de status:
  -- o recebimento divergente sai da efetivação com status que o gate aceita.
  if v_receipt.definitive_at is not null then
    raise exception 'Recebimento já efetivado em % — efetivação é única', v_receipt.definitive_at;
  end if;

  if v_receipt.status not in ('provisional', 'divergent') then
    raise exception 'Recebimento precisa estar provisório (ou divergente) para efetivar — status atual: %', v_receipt.status;
  end if;

  -- (20260730120000, guarda 2) A OF tem de ser da cozinha do recebimento.
  if v_receipt.supply_order_id is not null then
    select kitchen_id into v_of_kitchen from procurement.supply_order where id = v_receipt.supply_order_id;
    if v_of_kitchen is distinct from v_receipt.kitchen_id then
      raise exception 'OF pertence à cozinha %, não à cozinha do recebimento (%)', v_of_kitchen, v_receipt.kitchen_id;
    end if;
  end if;

  for v_item in
    select * from inventory.goods_receipt_item where receipt_id = p_receipt_id
  loop
    if v_item.received_qty_base <= 0 then continue; end if;

    -- A soma dos lotes tem de fechar com a quantidade conferida. A checagem é
    -- AQUI e não numa constraint: durante a conferência a soma fica
    -- legitimamente parcial enquanto o operador digita, e uma constraint
    -- rejeitaria o primeiro lote de uma entrega de três.
    select coalesce(sum(quantity_base), 0) into v_lot_total
      from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id;

    if v_lot_total = 0 then
      -- Nenhum lote informado: sintético com a quantidade inteira. Sufixo
      -- numérico porque duas linhas sem código na mesma entrega colidiriam no
      -- unique (receipt_item_id, lot_code) do mesmo dia.
      select count(*) + 1 into v_fallback_seq
        from inventory.goods_receipt_item_lot l
        join inventory.goods_receipt_item i on i.id = l.receipt_item_id
       where i.receipt_id = p_receipt_id and l.lot_code like 'SEM-LOTE-%';

      insert into inventory.goods_receipt_item_lot
        (receipt_item_id, lot_code, quantity_base, unit_cost)
      values
        (v_item.id, 'SEM-LOTE-' || to_char(now(), 'YYYY-MM-DD') || '-' || v_fallback_seq,
         v_item.received_qty_base, v_item.unit_cost);
    elsif v_lot_total <> v_item.received_qty_base then
      raise exception 'Soma dos lotes (%) difere da quantidade conferida (%) no item %',
        v_lot_total, v_item.received_qty_base, v_item.id;
    end if;

    -- Classe de conservação exigida pela especificação de compra da linha;
    -- sem purchase_item na linha, cai na especificação padrão do item.
    select pi.conservation_class into v_conservation
      from procurement.purchase_item pi
     where pi.id = v_item.purchase_item_id;

    if v_conservation is null and v_item.ingredient_id is not null then
      select pi.conservation_class into v_conservation
        from procurement.purchase_item_ingredient pii
        join procurement.purchase_item pi on pi.id = pii.purchase_item_id
       where pii.ingredient_id = v_item.ingredient_id and pii.is_default
         and pi.deleted_at is null
       limit 1;
    end if;

    for v_lot in
      select * from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id
    loop
      insert into inventory.stock_lot
        (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date,
         unit_cost, goods_receipt_item_id, goods_receipt_item_lot_id, conservation_class)
      values
        (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id,
         v_lot.lot_code, v_lot.expiry_date, coalesce(v_lot.unit_cost, v_item.unit_cost),
         v_item.id, v_lot.id, v_conservation)
      returning id into v_lot_id;

      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity,
         unit_cost, goods_receipt_item_id, created_by)
      values
        (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id, v_lot_id,
         'receipt', v_lot.quantity_base, coalesce(v_lot.unit_cost, v_item.unit_cost, 0),
         v_item.id, p_user);

      v_movements := v_movements + 1;
    end loop;
  end loop;

  -- Divergência nasce da linha do item OU do lote (temperatura fora da faixa).
  select exists (
    select 1 from inventory.goods_receipt_item gri
    left join inventory.goods_receipt_item_lot l on l.receipt_item_id = gri.id
    where gri.receipt_id = p_receipt_id
      and (gri.divergence_reason is not null or l.divergence_reason is not null)
  ) into v_has_divergence;

  update inventory.goods_receipt
    set status = case when v_has_divergence then 'divergent' else 'definitive' end,
        definitive_by = p_user,
        definitive_at = now()
    where id = p_receipt_id;

  if v_receipt.supply_order_id is not null then
    update procurement.supply_order so
      set status = case
        when (select coalesce(sum(gri.received_qty_base), 0)
                from inventory.goods_receipt gr
                join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
                where gr.supply_order_id = so.id and gr.definitive_at is not null)
             >= (select coalesce(sum(ordered_qty), 0) from procurement.supply_order_item where supply_order_id = so.id)
          then 'received' else 'partially_received' end,
          updated_at = now()
      where so.id = v_receipt.supply_order_id;
  end if;

  return query select v_movements;
end;
$function$;

-- ----------------------------------------------------------------------------
-- (8) Saldo e fechamento com os tipos novos
-- ----------------------------------------------------------------------------
-- Sem isto, `issue_return` (devolução) e `lot_split_in` (lote derivado) caem no
-- `else` da soma e entram como SAÍDA: a devolução de 2 KG tiraria mais 2 KG do
-- saldo, e o fracionamento zeraria o item ao fracioná-lo. O contrato
-- `sql-vocabulary.contract.test.ts` passa a exigir que estas listas sejam a
-- mesma do domínio — foi ele que encontrou a defasagem.
create or replace view inventory.v_stock_balance
  with (security_invoker = true) as
select
  m.kitchen_id,
  m.ingredient_id,
  m.frozen_preparation_id,
  m.lot_id,
  l.lot_code,
  l.expiry_date,
  sum(case when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in')
           then m.quantity else -m.quantity end) as balance,
  sum(case when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in')
           then coalesce(m.total_cost, 0) else -coalesce(m.total_cost, 0) end) as balance_value,
  max(m.occurred_at) as last_movement_at
from inventory.stock_movement m
left join inventory.stock_lot l on l.id = m.lot_id
group by m.kitchen_id, m.ingredient_id, m.frozen_preparation_id, m.lot_id, l.lot_code, l.expiry_date;

create or replace function inventory.close_month(p_kitchen_id bigint, p_competencia date, p_user uuid)
returns table (closing_id uuid, items int)
language plpgsql as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_start timestamptz := (v_competencia::timestamp) at time zone 'America/Sao_Paulo';
  v_next timestamptz := ((v_competencia + interval '1 month')::timestamp) at time zone 'America/Sao_Paulo';
  v_snapshot jsonb;
  v_items int;
  v_total_in numeric(14,4);
  v_total_out numeric(14,4);
  v_value_in numeric(14,4);
  v_value_out numeric(14,4);
  v_closing_value numeric(14,4);
  v_opening_value numeric(14,4);
  v_id uuid;
begin
  if v_competencia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date + interval '1 month' then
    raise exception 'Não é possível fechar competência futura';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inv_close:' || p_kitchen_id, 42));

  with balances as (
    select
      m.ingredient_id,
      m.frozen_preparation_id,
      sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
               then m.quantity else -m.quantity end) as quantity,
      sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
               then coalesce(m.total_cost, 0) else -coalesce(m.total_cost, 0) end) as value
    from inventory.stock_movement m
    where m.kitchen_id = p_kitchen_id and m.occurred_at < v_next
    group by m.ingredient_id, m.frozen_preparation_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ingredient_id', b.ingredient_id,
           'frozen_preparation_id', b.frozen_preparation_id,
           'quantity', b.quantity,
           'value', b.value)), '[]'::jsonb),
         count(*)::int,
         coalesce(sum(b.value), 0)
    into v_snapshot, v_items, v_closing_value
    from balances b
    where b.quantity <> 0 or b.value <> 0;

  select
    coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then quantity end), 0),
    coalesce(sum(case when type not in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then quantity end), 0),
    coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then coalesce(total_cost,0) end), 0),
    coalesce(sum(case when type not in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in') then coalesce(total_cost,0) end), 0)
    into v_total_in, v_total_out, v_value_in, v_value_out
    from inventory.stock_movement
    where kitchen_id = p_kitchen_id
      and occurred_at >= v_start and occurred_at < v_next;

  v_opening_value := v_closing_value - v_value_in + v_value_out;

  insert into inventory.monthly_closing
    (kitchen_id, competencia, balance_snapshot, total_in, total_out, value_in, value_out,
     opening_value, closing_value, closed_by)
  values
    (p_kitchen_id, v_competencia, v_snapshot, v_total_in, v_total_out, v_value_in, v_value_out,
     v_opening_value, v_closing_value, p_user)
  returning id into v_id;

  return query select v_id, v_items;
end;
$$;
