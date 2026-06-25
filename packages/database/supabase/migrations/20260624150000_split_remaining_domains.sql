-- ============================================================================
-- Split do schema `sisub` — Fases 3-7: mover TODOS os domínios restantes
-- ============================================================================
-- Move as 62 tabelas restantes de `sisub` para os schemas de domínio:
--   finance (1), access_control (3), core (16), kitchen (27), procurement (15).
-- Move também as 4 views para seus domínios e recria as funções cujo CORPO
-- referencia tabelas movidas por nome qualificado `sisub.*` (o `set schema` não
-- reescreve corpo de função). FKs, triggers, sequences, publication (realtime) e
-- expressões de generated column seguem por OID — não precisam de ação.
-- Enums permanecem em `sisub` (referenciados por OID pelas colunas movidas).
--
-- IMPORTANTE (deploy): após aplicar, TODO o app deployado que aponta para
-- `sisub.<tabela>` quebra até o redeploy do código (este PR). Coordenar apply+deploy.
-- ============================================================================

-- ───────────────────────── finance ─────────────────────────
alter table sisub.empenho set schema finance;

-- ───────────────────────── access_control ─────────────────────────
alter table sisub.user_permissions set schema access_control;
alter table sisub.mcp_api_keys set schema access_control;
alter table sisub.profiles_admin set schema access_control;

-- ───────────────────────── core ─────────────────────────
alter table sisub.units set schema core;
alter table sisub.mess_halls set schema core;
alter table sisub.kitchen set schema core;
alter table sisub.user_data set schema core;
alter table sisub.user_military_data set schema core;
alter table sisub.changelog set schema core;
alter table sisub.super_admin_controller set schema core;
alter table sisub.opinions set schema core;
alter table sisub.analytics_chat_session set schema core;
alter table sisub.analytics_chat_message set schema core;
alter table sisub.module_chat_session set schema core;
alter table sisub.module_chat_message set schema core;
alter table sisub.migration_folder_lookup set schema core;
alter table sisub.migration_nutrient_lookup set schema core;
alter table sisub.migration_product_lookup set schema core;
alter table sisub.migration_recipe_lookup set schema core;

-- ───────────────────────── kitchen ─────────────────────────
alter table sisub.meal_type set schema kitchen;
alter table sisub.daily_menu set schema kitchen;
alter table sisub.menu_items set schema kitchen;
alter table sisub.menu_template set schema kitchen;
alter table sisub.menu_template_items set schema kitchen;
alter table sisub.recipes set schema kitchen;
alter table sisub.recipe_ingredients set schema kitchen;
alter table sisub.recipe_ingredient_alternatives set schema kitchen;
alter table sisub.production_task set schema kitchen;
alter table sisub.meal_forecasts set schema kitchen;
alter table sisub.meal_presences set schema kitchen;
alter table sisub.other_presences set schema kitchen;
alter table sisub.ingredient set schema kitchen;
alter table sisub.ingredient_item set schema kitchen;
alter table sisub.ingredient_nutrient set schema kitchen;
alter table sisub.nutrient set schema kitchen;
alter table sisub.ceafa set schema kitchen;
alter table sisub.folder set schema kitchen;
alter table sisub.ingredient_version set schema kitchen;
alter table sisub.ingredient_review set schema kitchen;
alter table sisub.step_template set schema kitchen;
alter table sisub.utensil set schema kitchen;
alter table sisub.step_template_utensil set schema kitchen;
alter table sisub.recipe_step set schema kitchen;
alter table sisub.recipe_step_input set schema kitchen;
alter table sisub.recipe_step_output set schema kitchen;
alter table sisub.recipe_step_utensil set schema kitchen;

-- ───────────────────────── procurement ─────────────────────────
alter table sisub.procurement_list set schema procurement;
alter table sisub.procurement_list_item set schema procurement;
alter table sisub.procurement_list_kitchen set schema procurement;
alter table sisub.procurement_list_selection set schema procurement;
alter table sisub.procurement_arp set schema procurement;
alter table sisub.procurement_arp_item set schema procurement;
alter table sisub.procurement_pesquisa_preco set schema procurement;
alter table sisub.procurement_pesquisa_preco_item set schema procurement;
alter table sisub.procurement_pesquisa_preco_amostra set schema procurement;
alter table sisub.kitchen_ata_draft set schema procurement;
alter table sisub.kitchen_ata_draft_selection set schema procurement;
alter table sisub.policy_rule set schema procurement;
alter table sisub.purchase_item set schema procurement;
alter table sisub.purchase_item_ingredient set schema procurement;
-- compras_amostra fica junto das pesquisa_preco (mesmo schema = embed PostgREST OK).
alter table sisub.compras_amostra set schema procurement;

-- ───────────────────────── views → domínios (refs seguem por OID) ─────────────────────────
alter view sisub.v_user_identity set schema core;
alter view sisub.v_meal_presences_with_user set schema kitchen;
alter view sisub.v_ingredient_kg_lt_items set schema kitchen;
alter view sisub.ingredient_last_review set schema kitchen;

-- ───────────────────────── funções: recriar corpos que citam sisub.<movida> ─────────────────────────
-- Triggers de touch_* permanecem ligados por OID; só o corpo precisa apontar p/ core.
create or replace function sisub.touch_chat_session_updated_at()
returns trigger language plpgsql as $$
begin
  update core.analytics_chat_session set updated_at = now() where id = new.session_id;
  return new;
end;
$$;

create or replace function sisub.touch_module_chat_session()
returns trigger language plpgsql as $$
begin
  update core.module_chat_session set updated_at = now() where id = new.session_id;
  return new;
end;
$$;

-- upsert_compras_amostras: compras_amostra foi p/ procurement → mover a função junto.
drop function if exists sisub.upsert_compras_amostras(jsonb);
create function procurement.upsert_compras_amostras(p_samples jsonb)
returns setof uuid
language plpgsql
security definer
set search_path to 'procurement', 'public'
as $$
declare
  r    jsonb;
  v_id uuid;
begin
  for r in select value from jsonb_array_elements(p_samples) loop
    insert into procurement.compras_amostra (
      id_compra, id_item_compra, descricao_item, preco_unitario,
      capacidade_unidade_fornecimento, sigla_unidade_fornecimento,
      sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg,
      municipio, estado, esfera, marca, normalized_price, reference_date
    )
    values (
      r->>'id_compra',
      (r->>'id_item_compra')::integer,
      r->>'descricao_item',
      (r->>'preco_unitario')::numeric,
      (r->>'capacidade_unidade_fornecimento')::numeric,
      r->>'sigla_unidade_fornecimento',
      r->>'sigla_unidade_medida',
      (r->>'quantidade')::numeric,
      r->>'codigo_uasg',
      r->>'nome_uasg',
      r->>'municipio',
      r->>'estado',
      r->>'esfera',
      r->>'marca',
      (r->>'normalized_price')::numeric,
      (r->>'reference_date')::date
    )
    on conflict (fingerprint) do update
      set id_compra = procurement.compras_amostra.id_compra
    returning id into v_id;

    return next v_id;
  end loop;
end;
$$;
grant execute on function procurement.upsert_compras_amostras(jsonb) to service_role;

-- execute_analytics_query: roda SQL gerado por LLM com nomes de tabela NÃO
-- qualificados; ampliar search_path p/ resolver as tabelas nos novos schemas.
create or replace function sisub.execute_analytics_query(query text)
returns jsonb
language plpgsql
security definer
set search_path to 'core', 'kitchen', 'procurement', 'finance', 'access_control', 'sisub', 'public'
as $$
declare
  result jsonb;
begin
  if query is null or btrim(query) = '' then
    raise exception 'Query vazia';
  end if;

  execute format(
    'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t',
    query
  )
  into result;

  return coalesce(result, '[]'::jsonb);
end;
$$;

-- Funções de trigger órfãs (sem trigger associado; views legadas já dropadas).
-- Re-qualificadas p/ não deixar referências quebradas a sisub.* inexistente.
create or replace function sisub.others_presence_ins()
returns trigger language plpgsql as $$
declare v_mess_hall_id bigint;
begin
  select id into v_mess_hall_id from core.mess_halls where code = new.unidade;
  if v_mess_hall_id is null then
    raise exception 'Unknown mess hall code: %', new.unidade using errcode = '23503';
  end if;
  insert into kitchen.other_presences (created_at, admin_id, date, meal, mess_hall_id)
  values (coalesce(new.created_at, now()), coalesce(new.admin_id, gen_random_uuid()), new.date, new.meal, v_mess_hall_id);
  return null;
end $$;

create or replace function sisub.others_presence_upd()
returns trigger language plpgsql as $$
declare v_mess_hall_id bigint;
begin
  if new.unidade is not null and new.unidade <> old.unidade then
    select id into v_mess_hall_id from core.mess_halls where code = new.unidade;
    if v_mess_hall_id is null then
      raise exception 'Unknown mess hall code: %', new.unidade using errcode = '23503';
    end if;
  else
    select mh.id into v_mess_hall_id
    from kitchen.other_presences op join core.mess_halls mh on mh.id = op.mess_hall_id
    where op.id = old.id;
  end if;
  update kitchen.other_presences
     set created_at = coalesce(new.created_at, old.created_at),
         admin_id = coalesce(new.admin_id, old.admin_id),
         date = coalesce(new.date, old.date),
         meal = coalesce(new.meal, old.meal),
         mess_hall_id = v_mess_hall_id
   where id = old.id;
  return null;
end $$;

create or replace function sisub.others_presence_del()
returns trigger language plpgsql as $$
begin
  delete from kitchen.other_presences where id = old.id;
  return null;
end $$;

create or replace function sisub.rancho_presencas_view_ins()
returns trigger language plpgsql as $$
declare v_mess_hall_id bigint;
begin
  select id into v_mess_hall_id from core.mess_halls where code = new.unidade;
  if v_mess_hall_id is null then
    raise exception 'Unknown mess hall code: %', new.unidade;
  end if;
  insert into kitchen.meal_presences (user_id, date, meal, mess_hall_id)
  values (new.user_id, new.date, new.meal, v_mess_hall_id);
  return new;
end $$;

create or replace function sisub.rancho_presencas_view_del()
returns trigger language plpgsql as $$
begin
  delete from kitchen.meal_presences where id = old.id;
  return old;
end $$;

-- ───────────────────────── realtime ─────────────────────────
-- As 3 tabelas (recipes, daily_menu, menu_items) seguem na publication
-- supabase_realtime por OID; suas ACLs (incl. supabase_realtime_admin=r) também.
-- Só falta dar USAGE do schema kitchen ao role de replicação.
grant usage on schema kitchen to supabase_realtime_admin;

notify pgrst, 'reload schema';
