-- ============================================================================
-- Fase 5 — Vencimentos: limite de alerta por item ou classe
-- ============================================================================
--
-- "Prestes a estragar" não é um número só. Três dias de antecedência é muito
-- para o feijão e é tarde demais para o leite pasteurizado. O limite é do item
-- quando a cozinha souber dizer, e da classe de conservação quando não souber.
--
-- Resolução, do mais específico para o mais geral:
--   1. política do INGREDIENTE nesta cozinha
--   2. política da CLASSE nesta cozinha
--   3. política do INGREDIENTE global
--   4. política da CLASSE global
--   5. default embutido (resfriado 3, congelado 15, demais 30)
--
-- O nível 3 não estava no desenho original: a tabela permitia a linha global
-- por ingrediente e a resolução a ignorava, o que é pior do que não permitir —
-- a nutricionista cadastraria "leite: 2 dias" para a Força inteira e o painel
-- seguiria usando 3 sem dizer por quê.
-- ============================================================================

create table inventory.expiry_alert_policy (
  id uuid primary key default gen_random_uuid(),
  -- null = vale para toda a Força
  kitchen_id bigint references kitchen.kitchen (id) on delete cascade,
  ingredient_id uuid references kitchen.ingredient (id) on delete cascade,
  conservation_class text check (conservation_class in ('seco', 'resfriado', 'congelado', 'climatizado', 'nao_aplicavel')),
  -- 0 = alerta só no dia do vencimento. Teto de 365 porque limite maior que a
  -- validade do próprio item deixa o painel permanentemente vermelho, e painel
  -- sempre vermelho é painel que ninguém lê.
  alert_days int not null check (alert_days >= 0 and alert_days <= 365),
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a linha aponta para UM alvo: ou o item, ou a classe
  constraint expiry_alert_policy_target check (
    (ingredient_id is not null and conservation_class is null)
    or (ingredient_id is null and conservation_class is not null)
  )
);

comment on table inventory.expiry_alert_policy is
  'Antecedência do alerta de validade, por ingrediente ou classe de conservação, na cozinha ou global. Sem linha valem os defaults da função inventory.expiry_alert_days.';

-- `coalesce` no índice porque NULL é distinto de NULL em índice único: sem ele
-- a mesma política global entraria duas vezes e a resolução escolheria uma
-- delas conforme o plano.
create unique index expiry_alert_policy_ingredient_key
  on inventory.expiry_alert_policy (coalesce(kitchen_id, 0), ingredient_id)
  where ingredient_id is not null;
create unique index expiry_alert_policy_class_key
  on inventory.expiry_alert_policy (coalesce(kitchen_id, 0), conservation_class)
  where conservation_class is not null;

alter table inventory.expiry_alert_policy enable row level security;
revoke all on inventory.expiry_alert_policy from anon, authenticated;

/**
 * Antecedência do alerta, em dias, para um lote.
 *
 * `stable` e não `volatile` para poder ser chamada dentro da view sem virar
 * uma chamada por linha que o planner não consegue reordenar.
 */
create function inventory.expiry_alert_days(
  p_kitchen_id bigint,
  p_ingredient_id uuid,
  p_conservation_class text
) returns int
language sql stable as $$
  select coalesce(
    (select alert_days from inventory.expiry_alert_policy
      where kitchen_id = p_kitchen_id and ingredient_id = p_ingredient_id),
    (select alert_days from inventory.expiry_alert_policy
      where kitchen_id = p_kitchen_id and conservation_class = p_conservation_class),
    (select alert_days from inventory.expiry_alert_policy
      where kitchen_id is null and ingredient_id = p_ingredient_id),
    (select alert_days from inventory.expiry_alert_policy
      where kitchen_id is null and conservation_class = p_conservation_class),
    case p_conservation_class
      when 'resfriado' then 3
      when 'congelado' then 15
      else 30
    end
  );
$$;

comment on function inventory.expiry_alert_days is
  'Resolve a antecedência do alerta: item na cozinha → classe na cozinha → item global → classe global → default (resfriado 3, congelado 15, demais 30).';

/**
 * Painel de vencimentos: um lote com saldo por linha, já classificado.
 *
 * Faixas, medidas na data civil de BRASÍLIA (o banco roda em UTC, e às 22h de
 * São Paulo o `current_date` já é o dia seguinte — o lote que vence hoje
 * apareceria como vencido):
 *   expired  — validade anterior a hoje
 *   critical — vence dentro do limite
 *   warning  — vence dentro do DOBRO do limite
 *   ok       — mais longe que isso
 *
 * Lote SEM validade não é vencido, e não some: quando a classe é resfriada ou
 * congelada ele vira `no_expiry`, que é um defeito de cadastro a corrigir, não
 * um item saudável. Frango sem validade na nota é o caso que mais aparece.
 *
 * A classe vem do lote e, quando ele não a tem, do insumo comprado — é o mesmo
 * encadeamento que `finalize_goods_receipt` usa para herdar a conservação.
 */
create view inventory.v_lot_expiry as
with lot_balance as (
  select
    l.id as lot_id,
    l.kitchen_id,
    l.ingredient_id,
    l.frozen_preparation_id,
    l.lot_code,
    l.short_code,
    l.expiry_date,
    l.location,
    l.use_first,
    l.quarantined_at,
    l.received_at,
    coalesce(l.conservation_class, pi.conservation_class) as conservation_class,
    coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                      then m.quantity else -m.quantity end), 0) as balance
  from inventory.stock_lot l
  left join inventory.stock_movement m on m.lot_id = l.id
  left join lateral (
    select p.conservation_class
      from procurement.purchase_item_ingredient pii
      join procurement.purchase_item p on p.id = pii.purchase_item_id
     where pii.ingredient_id = l.ingredient_id and pii.is_default
       and p.deleted_at is null and p.conservation_class is not null
     limit 1
  ) pi on true
  group by l.id, pi.conservation_class
  having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                           then m.quantity else -m.quantity end), 0) > 0
)
select
  b.lot_id,
  b.kitchen_id,
  b.ingredient_id,
  b.frozen_preparation_id,
  b.lot_code,
  b.short_code,
  b.location,
  b.use_first,
  b.quarantined_at,
  b.received_at,
  b.expiry_date,
  b.conservation_class,
  b.balance,
  round(b.balance * coalesce(c.avg_unit_cost, 0), 4) as balance_value,
  coalesce(c.avg_unit_cost, 0) as avg_unit_cost,
  inventory.expiry_alert_days(b.kitchen_id, b.ingredient_id, b.conservation_class) as alert_days,
  case when b.expiry_date is null then null
       else (b.expiry_date - (now() at time zone 'America/Sao_Paulo')::date)
  end as days_left,
  case
    when b.expiry_date is null then
      case when b.conservation_class in ('resfriado', 'congelado') then 'no_expiry' else 'ok' end
    when b.expiry_date < (now() at time zone 'America/Sao_Paulo')::date then 'expired'
    when b.expiry_date - (now() at time zone 'America/Sao_Paulo')::date
         <= inventory.expiry_alert_days(b.kitchen_id, b.ingredient_id, b.conservation_class) then 'critical'
    when b.expiry_date - (now() at time zone 'America/Sao_Paulo')::date
         <= inventory.expiry_alert_days(b.kitchen_id, b.ingredient_id, b.conservation_class) * 2 then 'warning'
    else 'ok'
  end as band
from lot_balance b
left join inventory.stock_cost c
  on c.kitchen_id = b.kitchen_id
 and c.ingredient_id is not distinct from b.ingredient_id
 and c.frozen_preparation_id is not distinct from b.frozen_preparation_id;

comment on view inventory.v_lot_expiry is
  'Lotes com saldo classificados por faixa de vencimento (expired/critical/warning/ok/no_expiry), no fuso de Brasília, com valor a custo médio.';

revoke all on inventory.v_lot_expiry from anon, authenticated;
