-- ============================================================================
-- Fase 6 — Inventário: contagem com escopo, cegueira, rodadas e aprovação
-- ============================================================================
--
-- A contagem que existia era uma folha plana: `inventory_count` com status
-- `draft`/`confirmed` e uma linha por lote. Faltava tudo o que faz um
-- inventário ser inventário — escopo, cegueira, mais de uma pessoa contando,
-- recontagem da divergência grande, e a aprovação por quem não contou.
--
-- A tabela tem 0 linhas em produção, então o modelo é reformado no lugar em
-- vez de conviver com o antigo. Duas formas de contar a mesma coisa é como um
-- controle vira folclore: ninguém sabe qual das duas vale.
--
-- ## O que o desenho protege
--
-- **A cozinha não para para contar.** O saldo de referência de cada linha é o
-- do ledger no INSTANTE do lançamento (`occurred_at`), não o de agora: o lote
-- contado às 09:00 com 50 KG que perde 10 KG às 10:00 tem diferença ZERO na
-- revisão das 11:00, e saldo final 40. Travar o estoque durante a contagem
-- seria pedir que a cozinha não almoçasse.
--
-- **Duas contagens abertas não podem disputar o mesmo item.** Se disputassem,
-- cada uma apuraria a diferença contra um saldo que a outra está mexendo. Quem
-- garante é índice único no banco, não checagem na aplicação.
--
-- **Cegueira é do servidor.** Esconder o saldo só no React é esconder de quem
-- não quer ver: a folha continua trazendo o número na resposta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) A contagem ganha tipo, escopo, cegueira, rodada e aprovação
-- ----------------------------------------------------------------------------

-- As colunas entram em comandos SEPARADOS, e não num `alter table` só, de
-- propósito: `inventory.stock_adjustment` já referencia `inventory_count`, e
-- acrescentar no MESMO comando a referência de volta (`adjustment_id`) fazia o
-- Postgres pegar os cadeados das duas tabelas em ordens diferentes dentro do
-- próprio comando — deadlock detectado com uma única sessão conectada, que é
-- um erro difícil de ler quando aparece num deploy.
alter table inventory.inventory_count
  -- `annual` e `responsibility_transfer` seguem comissão designada, sem exceção
  add column type text not null default 'eventual'
    check (type in ('annual', 'responsibility_transfer', 'eventual', 'rotating')),
  add column scope text not null default 'full'
    check (scope in ('full', 'conservation_class', 'location', 'item_list', 'menu_cycle')),
  -- parâmetros do escopo: classe, local, lista de ingredientes, dias do ciclo
  add column scope_params jsonb not null default '{}'::jsonb,
  -- cega por padrão: contar sabendo o esperado é conferir, não contar
  add column blind boolean not null default true,
  add column blind_waiver_reason text,
  add column round int not null default 1 check (round >= 1),
  -- contagem esquecida aberta trava o escopo dela para sempre
  add column expires_at timestamptz not null default (now() + interval '7 days'),
  add column approved_at timestamptz,
  add column approval_exception_reason text,
  -- a competência é a data CIVIL de Brasília: contagem encerrada às 22h do dia
  -- 31 é do dia 31, não do dia 1º do mês seguinte
  add column competencia date not null default (now() at time zone 'America/Sao_Paulo')::date;

alter table inventory.inventory_count add column parent_count_id uuid;
alter table inventory.inventory_count add constraint inventory_count_parent_fkey
  foreign key (parent_count_id) references inventory.inventory_count (id);

alter table inventory.inventory_count add column approved_by uuid;
alter table inventory.inventory_count add constraint inventory_count_approved_by_fkey
  foreign key (approved_by) references auth.users (id);

alter table inventory.inventory_count add column adjustment_id uuid;
alter table inventory.inventory_count add constraint inventory_count_adjustment_fkey
  foreign key (adjustment_id) references inventory.stock_adjustment (id);

alter table inventory.inventory_count drop constraint inventory_count_status_check;
alter table inventory.inventory_count add constraint inventory_count_status_check
  -- `confirmed` é do caminho antigo, que ainda existe (ver nota da seção 3)
  check (status in ('draft', 'counting', 'review', 'recount', 'approved', 'rejected', 'expired', 'confirmed'));

comment on column inventory.inventory_count.blind is
  'Contagem cega: nível 2 não vê saldo, diferença nem valor dos itens do escopo enquanto ela está em counting. Desligar é decisão de nível 3 e fica registrada em blind_waiver_reason.';
comment on column inventory.inventory_count.round is
  'Rodada. A recontagem da divergência grande é uma contagem NOVA com parent_count_id apontando para a anterior; a rodada mais recente é a que vale.';
comment on column inventory.inventory_count.expires_at is
  'Contagem aberta trava o escopo dela contra outras contagens. Sem prazo, uma folha esquecida impediria inventário na cozinha até alguém lembrar dela.';

-- rodada de recontagem não pode apontar para contagem de outra cozinha
create or replace function inventory.count_round_same_kitchen() returns trigger
language plpgsql as $$
declare
  v_parent inventory.inventory_count%rowtype;
begin
  if new.parent_count_id is null then return new; end if;
  select * into v_parent from inventory.inventory_count where id = new.parent_count_id;
  if not found then raise exception 'Contagem anterior não encontrada'; end if;
  if v_parent.kitchen_id <> new.kitchen_id then
    raise exception 'Recontagem tem de ser da mesma cozinha da contagem anterior';
  end if;
  if new.round <= v_parent.round then
    raise exception 'Recontagem tem de ter rodada maior que a anterior (% <= %)', new.round, v_parent.round;
  end if;
  return new;
end;
$$;

create trigger count_round_same_kitchen
  before insert or update of parent_count_id, round on inventory.inventory_count
  for each row execute function inventory.count_round_same_kitchen();

-- ----------------------------------------------------------------------------
-- (2) Escopo materializado na abertura
-- ----------------------------------------------------------------------------
--
-- Materializar, e não recalcular a cada leitura, porque o escopo é o CONTRATO
-- da contagem: "estes itens, nesta cozinha, a partir deste instante". Um
-- escopo calculado na leitura mudaria sozinho quando um item novo entrasse no
-- estoque no meio da contagem, e a folha do operador deixaria de bater com a
-- que ele imprimiu.
create table inventory.count_scope_item (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references inventory.inventory_count (id) on delete cascade,
  -- desnormalizado do documento porque o índice de sobreposição é por cozinha
  kitchen_id bigint not null references kitchen.kitchen (id),
  ingredient_id uuid references kitchen.ingredient (id),
  frozen_preparation_id uuid references kitchen.frozen_preparation (id),
  -- "achado": item que não estava na folha e apareceu na prateleira
  found boolean not null default false,
  -- item do escopo que ninguém contou só é zerado com marcação EXPLÍCITA:
  -- tratar não-contado como zero transforma esquecimento em baixa de estoque
  not_counted_accepted boolean not null default false,
  -- espelha o status do documento; é o que o índice parcial de sobreposição lê
  open boolean not null default true,
  created_at timestamptz not null default now(),
  constraint count_scope_item_target check (
    (ingredient_id is not null and frozen_preparation_id is null)
    or (ingredient_id is null and frozen_preparation_id is not null)
  )
);

comment on table inventory.count_scope_item is
  'Itens do escopo, materializados na abertura. Duas contagens ABERTAS da mesma cozinha não podem conter o mesmo item — índice único, não checagem na aplicação.';

create unique index count_scope_item_key on inventory.count_scope_item (count_id, coalesce(ingredient_id, frozen_preparation_id));

-- A sobreposição é impedida AQUI. `coalesce` porque o alvo é um dos dois, e
-- NULL é distinto de NULL em índice único: sem ele duas contagens abertas do
-- mesmo item passariam sempre que o alvo fosse preparação congelada.
create unique index count_scope_item_open_key
  on inventory.count_scope_item (kitchen_id, coalesce(ingredient_id, frozen_preparation_id))
  where open;

create index count_scope_item_count_idx on inventory.count_scope_item (count_id);

alter table inventory.count_scope_item enable row level security;
revoke all on inventory.count_scope_item from anon, authenticated;

/**
 * Fecha o escopo quando o documento sai do ar.
 *
 * Sem isto, `open` mentiria: a contagem aprovada continuaria segurando os
 * itens dela e a cozinha não conseguiria abrir a próxima.
 */
create or replace function inventory.sync_count_scope_open() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    update inventory.count_scope_item
       set open = new.status in ('draft', 'counting', 'review', 'recount')
     where count_id = new.id;
  end if;
  return new;
end;
$$;

create trigger sync_count_scope_open
  after update of status on inventory.inventory_count
  for each row execute function inventory.sync_count_scope_open();

-- ----------------------------------------------------------------------------
-- (3) Lançamentos
-- ----------------------------------------------------------------------------
--
-- A linha antiga (`inventory_count_item`, um lote por linha, sobrescrita) não
-- comporta duas pessoas na mesma câmara: quem lançasse por último apagaria o
-- do outro. Agora cada leitura é um LANÇAMENTO, com autor, e a linha é a soma.
create table inventory.inventory_count_entry (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references inventory.inventory_count (id) on delete cascade,
  -- lote quando se sabe; item quando a contagem é do monte na prateleira
  lot_id uuid references inventory.stock_lot (id),
  ingredient_id uuid references kitchen.ingredient (id),
  frozen_preparation_id uuid references kitchen.frozen_preparation (id),
  quantity numeric(14, 4) not null check (quantity >= 0),
  -- Identificador gerado no CLIENTE. É o que faz o reenvio da fila offline não
  -- contar duas vezes: sem ele, 15 leituras reenviadas viram 30.
  client_event_id text not null,
  -- instante que VALE para a diferença. Online é o do servidor; offline é o do
  -- dispositivo corrigido pelo desvio e limitado pela janela de sincronização
  counted_at timestamptz not null default now(),
  device_at timestamptz,
  clock_skew_ms int,
  -- lançamento de sobrescrita anula os anteriores da mesma linha: é a saída
  -- para o operador que contou errado e não quer somar mais um lançamento
  overwrite boolean not null default false,
  counted_by uuid references auth.users (id),
  note text,
  created_at timestamptz not null default now(),
  constraint count_entry_target check (
    (lot_id is not null)::int + (ingredient_id is not null)::int + (frozen_preparation_id is not null)::int = 1
  )
);

comment on table inventory.inventory_count_entry is
  'Um lançamento por leitura, com autor e instante. A linha da folha é a SOMA dos lançamentos — duas pessoas contando a mesma prateleira somam em vez de se sobrescrever.';
comment on column inventory.inventory_count_entry.client_event_id is
  'Gerado no cliente. Sem ele o reenvio da fila offline conta duas vezes: 15 leituras viram 30.';
comment on column inventory.inventory_count_entry.counted_at is
  'Instante que vale para a diferença. A referência é o saldo do ledger com occurred_at até aqui, e não o saldo de agora: a cozinha continua movimentando durante a contagem.';

create unique index count_entry_client_key on inventory.inventory_count_entry (count_id, client_event_id);
create index count_entry_count_idx on inventory.inventory_count_entry (count_id);

alter table inventory.inventory_count_entry enable row level security;
revoke all on inventory.inventory_count_entry from anon, authenticated;

-- lançamento só entra em contagem que está sendo contada
create or replace function inventory.count_entry_requires_counting() returns trigger
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
begin
  select * into v_count from inventory.inventory_count where id = coalesce(new.count_id, old.count_id);
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status not in ('draft', 'counting', 'recount') then
    raise exception 'Contagem em "%" não aceita lançamento', v_count.status;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger count_entry_requires_counting
  before insert or update or delete on inventory.inventory_count_entry
  for each row execute function inventory.count_entry_requires_counting();

-- A folha plana (`inventory_count_item`) e `confirm_inventory_count` seguem
-- existindo AQUI, e são removidas num PR seguinte. Não é indecisão: é a única
-- ordem em que a `main` fica verde o tempo todo.
--
-- Esta migration é aplicada ao banco COMPARTILHADO antes do PR que a usa
-- mergear. Se ela derrubasse a tabela, toda branch aberta de qualquer app com
-- teste que a referencia passaria a falhar no mesmo instante — e foi assim,
-- quatro vezes num dia, que migration aplicada adiantado quebrou o trabalho
-- alheio. Expandir primeiro, contrair depois, quando nada mais apontar para o
-- que vai sair.
--
-- Por isso `confirmed` continua no CHECK de status abaixo: é o estado que o
-- caminho antigo grava.
--
-- O que NÃO fica: duas formas de contar em uso ao mesmo tempo. O código do
-- app migra inteiro para o caminho novo no PR desta fase; o antigo fica órfão
-- no banco até a migration de limpeza.

-- ----------------------------------------------------------------------------
-- (4) Saldo do ledger num instante
-- ----------------------------------------------------------------------------

/**
 * Saldo de um lote — ou de um item somando os lotes — até um instante.
 *
 * Lê `occurred_at`, e não `created_at`: o movimento lançado às 23h com data de
 * ontem pertence a ontem, e é justamente o caso que a contagem precisa acertar.
 */
create function inventory.balance_at(
  p_kitchen_id bigint,
  p_lot_id uuid,
  p_ingredient_id uuid,
  p_frozen_preparation_id uuid,
  p_instant timestamptz
) returns numeric
language sql stable as $$
  select coalesce(sum(
    case when m.type in ('receipt', 'issue_return', 'leftover_return', 'transfer_in', 'lot_split_in', 'adjustment_in')
         then m.quantity else -m.quantity end
  ), 0)
    from inventory.stock_movement m
   where m.kitchen_id = p_kitchen_id
     and m.occurred_at <= p_instant
     and (p_lot_id is null or m.lot_id = p_lot_id)
     and (p_lot_id is not null or (
           m.ingredient_id is not distinct from p_ingredient_id
       and m.frozen_preparation_id is not distinct from p_frozen_preparation_id
     ));
$$;

comment on function inventory.balance_at is
  'Saldo por occurred_at até o instante. É a referência da diferença de cada linha da contagem: o lote contado às 09:00 que perde 10 KG às 10:00 tem diferença zero, não 10 de falta.';

-- ----------------------------------------------------------------------------
-- (5) Abertura
-- ----------------------------------------------------------------------------

/**
 * Abre a contagem e materializa o escopo.
 *
 * A sobreposição é recusada pelo índice único; aqui a mensagem é traduzida
 * para dizer QUAL contagem conflita — "duplicate key" não ajuda ninguém na
 * porta da câmara fria.
 */
create function inventory.open_inventory_count(
  p_kitchen_id bigint,
  p_type text,
  p_scope text,
  p_scope_params jsonb,
  p_blind boolean,
  p_blind_waiver_reason text,
  p_user uuid
) returns table (count_id uuid, scope_items int)
language plpgsql as $$
declare
  v_id uuid;
  v_items int := 0;
  v_conflict record;
  v_class text := p_scope_params->>'conservation_class';
  v_location text := p_scope_params->>'location';
  v_days int := coalesce((p_scope_params->>'days')::int, 7);
begin
  if p_blind is false and p_blind_waiver_reason is null then
    raise exception 'Contagem não cega exige o motivo registrado';
  end if;

  -- contagem vencida deixa de segurar o escopo dela
  update inventory.inventory_count
     set status = 'expired'
   where kitchen_id = p_kitchen_id
     and status in ('draft', 'counting', 'review', 'recount')
     and expires_at < now();

  insert into inventory.inventory_count (kitchen_id, status, type, scope, scope_params, blind, blind_waiver_reason, created_by)
    values (p_kitchen_id, 'counting', p_type, p_scope, coalesce(p_scope_params, '{}'::jsonb), p_blind, p_blind_waiver_reason, p_user)
    returning id into v_id;

  -- Itens da cozinha: os que têm lote, e os que já se moveram alguma vez. O
  -- segundo conjunto importa porque item com saldo ZERO também se conta — é
  -- assim que a sobra esquecida na prateleira aparece.
  with candidatos as (
    select distinct l.ingredient_id, l.frozen_preparation_id, l.conservation_class, l.location
      from inventory.stock_lot l
     where l.kitchen_id = p_kitchen_id
    union
    select distinct m.ingredient_id, m.frozen_preparation_id, null::text, null::text
      from inventory.stock_movement m
     where m.kitchen_id = p_kitchen_id
  ),
  filtrados as (
    select c.ingredient_id, c.frozen_preparation_id
      from candidatos c
     where case p_scope
             when 'full' then true
             when 'conservation_class' then c.conservation_class is not distinct from v_class
             when 'location' then c.location is not distinct from v_location
             when 'item_list' then c.ingredient_id::text = any (
               select jsonb_array_elements_text(coalesce(p_scope_params->'ingredient_ids', '[]'::jsonb))
             )
             when 'menu_cycle' then c.ingredient_id in (
               -- ingredientes dos cardápios dos próximos N dias, lidos do
               -- snapshot da receita gravado no item de cardápio
               select (ing->>'ingredient_id')::uuid
                 from kitchen.production_task t
                 join kitchen.menu_items mi on mi.id = t.menu_item_id,
                      -- `menu_items.recipe` é `json`, não `jsonb`: sem o cast o
                      -- `coalesce` não tipa, e o erro aparece mesmo quando o
                      -- escopo escolhido nem é `menu_cycle` — o planner checa
                      -- todos os ramos do `case`
                      lateral jsonb_array_elements(coalesce(mi.recipe::jsonb->'ingredients', '[]'::jsonb)) ing
                where t.kitchen_id = p_kitchen_id
                  and t.production_date between (now() at time zone 'America/Sao_Paulo')::date
                                            and (now() at time zone 'America/Sao_Paulo')::date + v_days
                  and (ing->>'ingredient_id') is not null
             )
             else false
           end
       and (c.ingredient_id is not null or c.frozen_preparation_id is not null)
  )
  insert into inventory.count_scope_item (count_id, kitchen_id, ingredient_id, frozen_preparation_id)
    select v_id, p_kitchen_id, f.ingredient_id, f.frozen_preparation_id from filtrados f;
  get diagnostics v_items = row_count;

  if v_items = 0 then
    raise exception 'O escopo escolhido não tem nenhum item nesta cozinha';
  end if;

  return query select v_id, v_items;
exception
  when unique_violation then
    -- traduz o índice de sobreposição no nome da contagem que conflita
    select c.id, c.type, c.scope, c.created_at into v_conflict
      from inventory.inventory_count c
      join inventory.count_scope_item s on s.count_id = c.id
     where c.kitchen_id = p_kitchen_id and s.open and c.id <> v_id
     limit 1;
    if found then
      raise exception 'Já existe contagem aberta nesta cozinha com itens em comum (% de %, escopo %). Encerre-a antes de abrir outra',
        v_conflict.type, to_char(v_conflict.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), v_conflict.scope;
    end if;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (6) Aprovação
-- ----------------------------------------------------------------------------

/**
 * Aprova a contagem e lança o ajuste derivado.
 *
 * Pré-condições recusam a aprovação enquanto o ledger estiver ATRASADO em
 * relação à realidade — e essa é a parte que salva o inventário de acusar
 * falta onde só houve baixa não lançada:
 *   • tarefa de produção concluída sem requisição do dia fechada;
 *   • recebimento ainda `provisional`.
 *
 * A segregação é a da cozinha (`strict`/`dual`), e quem aprova não pode ter
 * lançado — em `strict`, sem exceção.
 */
create function inventory.approve_inventory_count(
  p_count_id uuid,
  p_actor uuid,
  p_exception_reason text default null
) returns table (adjustment_id uuid, lines int, difference_value numeric)
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_settings record;
  v_pending record;
  v_line record;
  v_adjustment_id uuid;
  v_lines int := 0;
  v_value numeric(14, 4) := 0;
  v_counted_by_actor boolean;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status not in ('counting', 'review', 'recount') then
    raise exception 'Contagem em "%" não está aguardando aprovação', v_count.status;
  end if;

  -- ── pré-condição: baixa de produção ainda não lançada ──────────────────────
  select t.id, t.production_date into v_pending
    from kitchen.production_task t
   where t.kitchen_id = v_count.kitchen_id
     and t.status = 'DONE'
     and t.production_date >= v_count.created_at::date - 1
     and not exists (
       select 1 from inventory.stock_issue_request r
        where r.kitchen_id = t.kitchen_id
          and r.issue_date = coalesce(t.issue_date, t.production_date)
          and r.status <> 'open'
     )
   limit 1;
  if found then
    raise exception 'Há produção concluída em % sem a requisição do dia fechada: a contagem acusaria falta do que já saiu. Feche a requisição antes de aprovar',
      to_char(v_pending.production_date, 'DD/MM');
  end if;

  -- ── pré-condição: recebimento provisório ──────────────────────────────────
  select r.id into v_pending
    from inventory.goods_receipt r
   where r.kitchen_id = v_count.kitchen_id and r.status = 'provisional'
   limit 1;
  if found then
    raise exception 'Há recebimento provisório em aberto: o material está na prateleira e não no saldo. Efetive-o antes de aprovar';
  end if;

  -- ── segregação ────────────────────────────────────────────────────────────
  v_settings := inventory.kitchen_settings(v_count.kitchen_id);
  select exists (
    select 1 from inventory.inventory_count_entry e where e.count_id = p_count_id and e.counted_by = p_actor
  ) into v_counted_by_actor;

  -- Os dois regimes pedem coisas diferentes, e a diferença é deliberada:
  --
  --  • `strict` — quem aprova não abriu a contagem NEM lançou nela, e não há
  --    caminho de exceção. É o regime de quem tem gente suficiente;
  --  • `dual` — quem aprova apenas não é quem abriu. Contar é trabalho de
  --    braço, e numa cozinha pequena todo mundo conta: desqualificar todo
  --    autor de lançamento aqui deixaria `dual` sem ninguém elegível e
  --    transformaria a exceção, que devia ser rara, na regra. A exceção segue
  --    existindo para o caso em que só há uma pessoa, e fica registrada.
  if v_settings.segregation = 'strict' then
    if v_counted_by_actor or v_count.created_by is not distinct from p_actor then
      raise exception 'Segregação estrita nesta cozinha: quem abriu a contagem ou lançou nela não pode aprová-la. Peça a aprovação a outro nível 3 de estoque';
    end if;
  elsif v_count.created_by is not distinct from p_actor and p_exception_reason is null then
    raise exception 'Quem abriu a contagem não a aprova: a aprovação precisa de outra pessoa, ou de uma exceção registrada';
  end if;

  -- ── o ajuste derivado ─────────────────────────────────────────────────────
  insert into inventory.stock_adjustment (kitchen_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.kitchen_id, p_count_id,
            'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' (' || v_count.type || ')',
            p_actor, now())
    returning id into v_adjustment_id;

  -- Uma linha por diferença. O item do escopo que ninguém contou NÃO vira
  -- linha: zerá-lo por omissão transformaria esquecimento em baixa de estoque.
  -- Ele só entra quando alguém marcou `not_counted_accepted`.
  for v_line in
    with lancado as (
      select e.lot_id,
             coalesce(e.ingredient_id, l.ingredient_id) as ingredient_id,
             coalesce(e.frozen_preparation_id, l.frozen_preparation_id) as frozen_preparation_id,
             max(e.counted_at) as counted_at,
             -- sobrescrita anula o que veio antes dela
             sum(e.quantity) filter (
               where e.counted_at >= coalesce(
                 (select max(o.counted_at) from inventory.inventory_count_entry o
                   where o.count_id = e.count_id and o.overwrite
                     and o.lot_id is not distinct from e.lot_id
                     and o.ingredient_id is not distinct from e.ingredient_id
                     and o.frozen_preparation_id is not distinct from e.frozen_preparation_id),
                 '-infinity'::timestamptz)
             ) as counted_qty
        from inventory.inventory_count_entry e
        left join inventory.stock_lot l on l.id = e.lot_id
       where e.count_id = p_count_id
       group by e.count_id, e.lot_id, coalesce(e.ingredient_id, l.ingredient_id), coalesce(e.frozen_preparation_id, l.frozen_preparation_id)
    )
    select c.lot_id, c.ingredient_id, c.frozen_preparation_id, c.counted_qty,
           inventory.balance_at(v_count.kitchen_id, c.lot_id, c.ingredient_id, c.frozen_preparation_id, c.counted_at) as ledger_qty
      from lancado c
     where c.counted_qty is not null
  loop
    continue when v_line.counted_qty = v_line.ledger_qty;

    insert into inventory.stock_adjustment_item
      (adjustment_id, lot_id, ingredient_id, frozen_preparation_id, direction, quantity, reason_code, note)
    values
      (v_adjustment_id, v_line.lot_id,
       case when v_line.lot_id is null then v_line.ingredient_id end,
       case when v_line.lot_id is null then v_line.frozen_preparation_id end,
       case when v_line.counted_qty > v_line.ledger_qty then 'in' else 'out' end,
       abs(v_line.counted_qty - v_line.ledger_qty),
       case when v_line.counted_qty > v_line.ledger_qty then 'count_gain' else 'count_loss' end,
       'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
    v_lines := v_lines + 1;
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

  update inventory.inventory_count
     set status = 'approved',
         approved_by = p_actor,
         approved_at = now(),
         approval_exception_reason = p_exception_reason,
         adjustment_id = v_adjustment_id,
         confirmed_by = p_actor,
         confirmed_at = now()
   where id = p_count_id;

  return query select v_adjustment_id, v_lines, v_value;
end;
$$;

revoke all on function inventory.balance_at(bigint, uuid, uuid, uuid, timestamptz) from anon, authenticated;
revoke all on function inventory.open_inventory_count(bigint, text, text, jsonb, boolean, text, uuid) from anon, authenticated;
revoke all on function inventory.approve_inventory_count(uuid, uuid, text) from anon, authenticated;
