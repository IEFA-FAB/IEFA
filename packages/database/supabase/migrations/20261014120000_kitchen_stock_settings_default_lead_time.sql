-- Prazo de entrega padrão da cozinha (decisão do mantenedor, 2026-10-14).
--
-- A sugestão de reposição estimava o prazo de entrega pela mediana do histórico do fornecedor e,
-- sem histórico, caía em `stock_policy.coverage_days ?? 7`: dias de COBERTURA no lugar de prazo
-- de ENTREGA, e um 7 sem origem. Esse número decidia a urgência (cobertura abaixo do prazo) e,
-- com ela, o canal recomendado (Supermercado Virtual ou Contrata+Brasil).
--
-- O prazo padrão passa a ser parâmetro da cozinha, ao lado das tolerâncias e da alçada. Nulo é
-- "não configurado", e não tem default de propósito: sem histórico e sem o campo, a sugestão
-- mostra a pendência e marca a urgência como indeterminada, sem chutar valor nem travar a tela.
--
-- `inventory.kitchen_settings` monta a linha padrão (cozinha sem linha) com `row(...)`
-- posicional, que passaria a ter uma coluna a menos que o tipo e falharia em toda aprovação de
-- ajuste e de contagem. Ela é recriada aqui montando a linha por NOME: coluna nova fica nula
-- sem tocar a função. Mesma assinatura, `search_path` fixo; `create or replace` mantém os grants.

alter table inventory.kitchen_stock_settings
  add column default_lead_time_days integer
    check (default_lead_time_days is null or default_lead_time_days > 0);

comment on column inventory.kitchen_stock_settings.default_lead_time_days is
  'Prazo de entrega padrão, em dias, usado pela sugestão de reposição quando o fornecedor não tem histórico de entregas suficiente. Nulo = não configurado: a sugestão aponta a pendência e a urgência fica indeterminada (não há valor presumido).';

create or replace function inventory.kitchen_settings(p_kitchen_id bigint)
returns inventory.kitchen_stock_settings
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s from inventory.kitchen_stock_settings s where s.kitchen_id = p_kitchen_id),
    jsonb_populate_record(
      null::inventory.kitchen_stock_settings,
      jsonb_build_object(
        'kitchen_id', p_kitchen_id,
        'segregation', 'dual',
        'adjustment_approval_value', 500,
        'issue_tolerance_pct', 10,
        'issue_tolerance_floor_value', 20,
        'count_tolerance_pct', 5,
        'count_tolerance_value', 50,
        'updated_at', now()
      )
    )
  );
$$;
