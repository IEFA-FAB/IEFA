-- ============================================================================
-- Fase 7 (estoque): política de reposição por cozinha×ingrediente
-- ============================================================================
-- Ponto de pedido = consumo diário planejado × lead time estimado + estoque
-- mínimo. O limiar de urgência (default: lead time estimado) decide o
-- roteamento para o Supermercado Virtual; configurável por item aqui.
-- ============================================================================

create table inventory.stock_policy (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references core.kitchen (id),
  ingredient_id uuid not null references kitchen.ingredient (id) on delete cascade,
  min_stock numeric(14,4) not null default 0 check (min_stock >= 0),
  coverage_days integer not null default 7 check (coverage_days > 0),
  -- null = usa o lead time estimado como limiar (default do spec)
  urgency_threshold_days integer check (urgency_threshold_days is null or urgency_threshold_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_policy_kitchen_ingredient_key unique (kitchen_id, ingredient_id)
);

comment on table inventory.stock_policy is
  'Política de reposição (Fase 7): estoque mínimo, cobertura e limiar de urgência opcional (null = lead time estimado).';

alter table inventory.stock_policy enable row level security;
create policy stock_policy_read on inventory.stock_policy for select to authenticated using (true);
grant select on inventory.stock_policy to authenticated;
