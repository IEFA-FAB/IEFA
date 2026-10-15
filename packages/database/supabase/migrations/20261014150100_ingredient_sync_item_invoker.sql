-- ============================================================================
-- kitchen.ingredient_sync_item passa a SECURITY INVOKER e falha alto
-- ============================================================================
-- A função (`20260901120000_core_item_nucleus.sql`) é só a dos triggers
-- `ingredient_sync_item_ins` (BEFORE INSERT) e `ingredient_sync_item_upd` (AFTER UPDATE) de
-- `kitchen.ingredient`: mantém `core.item` igual ao insumo. Nasceu SECURITY DEFINER sem motivo
-- escrito, e o DEFINER não compra nada para quem escreve no insumo hoje: todo papel com
-- INSERT/UPDATE em `kitchen.ingredient` (conferido em 2026-10-15) também tem escrita e SELECT em
-- `core.item` e leitura em `kitchen.folder` e `core.measure_unit`, e ignora RLS (BYPASSRLS ou
-- superusuário). Os escritores do repo são o Drizzle do sisub (`postgres`) e o supabase-js do
-- servidor (`service_role`); nenhuma função DEFINER escreve no insumo.
--
-- ## Por que o corpo muda
--
-- Como INVOKER, o trigger obedece à RLS de quem escreve. `core.item`, `kitchen.folder` e
-- `core.measure_unit` têm RLS ligada, e `core.item` não tem policy. Um papel com grant e sem
-- bypass não falharia: o `update core.item … where id = new.id` afetaria 0 linhas e as leituras
-- de pasta e unidade voltariam vazias, e o núcleo deixaria de acompanhar o insumo em silêncio.
-- Por isso a função agora cobra a premissa:
--
--   * na entrada, recusa (42501 INGREDIENT_SYNC_NEEDS_BYPASSRLS) papel sem BYPASSRLS nem
--     superusuário — cobre também as duas leituras, que não teriam como distinguir "sem linha"
--     de "escondida pela RLS";
--   * depois do UPDATE, recusa (P0002 INGREDIENT_ITEM_MISSING) se nenhuma linha mudou: o item
--     sempre existe, porque o BEFORE INSERT o cria e a FK `ingredient_is_item` o exige;
--   * depois do INSERT, o `on conflict do nothing` legitimamente não insere quando o item já
--     existe, então a conferência é de existência, não de `found`.
--
-- Papel sem grant em `core.item` já falhava alto pelo privilégio. Com as duas recusas, papel com
-- grant e sem bypass também falha alto, em vez de escrever no núcleo com o privilégio do dono
-- (DEFINER) ou de não escrever nada (INVOKER sem a conferência).
--
-- `create or replace` preserva dono (`postgres`) e ACL (EXECUTE só de `postgres` e
-- `service_role`, conferido em 2026-10-15); os grants são reafirmados abaixo. O
-- `set search_path = ''` é obrigatório aqui: `create or replace` sem a cláusula apagaria o que a
-- função tem desde 20260901120000. Fora as duas recusas, o corpo é o de 20260901120000.
--
-- O par citado junto na revisão, `procurement.upsert_compras_amostras` (DEFINER com
-- `search_path = procurement, public`, de `20260926200000`), já foi resolvido: o lote 3
-- (`20260927060000`) criou `procurement.upsert_price_samples` como INVOKER com
-- `search_path = ''`, e o contract (`20260927070000`) derrubou a antiga. Produção conferida em
-- 2026-10-14: a antiga não existe e a nova é INVOKER, executável só por `postgres`/`service_role`.
-- ============================================================================

create or replace function kitchen.ingredient_sync_item() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_scope text;
begin
  if not exists (
    select 1 from pg_catalog.pg_roles r
     where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)
  ) then
    raise exception 'INGREDIENT_SYNC_NEEDS_BYPASSRLS: o papel % escreve em kitchen.ingredient sem BYPASSRLS; core.item não acompanharia o insumo', current_user
      using errcode = '42501';
  end if;

  select f.catalog_scope into v_scope from kitchen.folder f where f.id = new.folder_id;

  if tg_op = 'INSERT' then
    insert into core.item (id, kind, description, catalog_scope, measure_unit, created_at, deleted_at)
    values (
      new.id,
      'insumo',
      coalesce(nullif(btrim(new.description), ''), '(sem descrição — id ' || left(new.id::text, 8) || ')'),
      coalesce(v_scope, 'alimentacao'),
      (select mu.code from core.measure_unit mu where mu.code = upper(btrim(new.measure_unit))),
      new.created_at,
      new.deleted_at
    )
    on conflict (id) do nothing;

    if not exists (select 1 from core.item i where i.id = new.id) then
      raise exception 'INGREDIENT_ITEM_MISSING: core.item % não existe depois da sincronia do insumo', new.id
        using errcode = 'P0002';
    end if;
    return new;
  end if;

  update core.item set
    description = coalesce(nullif(btrim(new.description), ''), description),
    catalog_scope = coalesce(v_scope, catalog_scope),
    measure_unit = (select mu.code from core.measure_unit mu where mu.code = upper(btrim(new.measure_unit))),
    deleted_at = new.deleted_at,
    updated_at = now()
  where id = new.id;

  if not found then
    raise exception 'INGREDIENT_ITEM_MISSING: core.item % não foi atualizado pela sincronia do insumo', new.id
      using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke all on function kitchen.ingredient_sync_item() from public, anon, authenticated;
grant execute on function kitchen.ingredient_sync_item() to service_role;

comment on function kitchen.ingredient_sync_item() is
	'Trigger de kitchen.ingredient (ingredient_sync_item_ins/_upd): mantém core.item igual ao insumo. SECURITY INVOKER desde 20261014150100: quem escreve no insumo precisa de escrita em core.item e de BYPASSRLS (ou superusuário); sem isso a função recusa em vez de deixar o núcleo para trás.';
