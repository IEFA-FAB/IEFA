-- ============================================================================
-- Split do schema `sisub` — Fase 2: mover `compras_gov_integration`
-- ============================================================================
-- Move as 17 tabelas de staging/sync do Compras.gov (CATMAT/CATSER) de `sisub`
-- para `compras_gov_integration`. É o domínio mais isolado:
--   - nenhum embed PostgREST cruza para essas tabelas (worker faz só upsert
--     single-table; CATMAT search no app usa Drizzle, conexão direta);
--   - única FK inbound de fora do grupo: sisub.purchase_item.catmat_item_codigo
--     -> compras_material_item (vira FK cross-schema; o `set schema` reaponta
--     o constraint automaticamente — FKs seguem por OID);
--   - `compras_amostra` e `compras_amostra_fingerprint()` NÃO se movem (são
--     dados de amostra de preço consumidos pelo domínio procurement).
--
-- ACLs de tabela são preservadas pelo `set schema` (não é cópia). RLS continua
-- habilitado; não há policies (service-role-only), nada a recriar.
--
-- IMPORTANTE (deploy): após aplicar, o código deployado que aponta para
-- `sisub.compras_*` (worker compras-sync e o Drizzle export do CATMAT search)
-- precisa ser redeployado para `compras_gov_integration`. Coordenar com o
-- deploy do PR que acompanha esta migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Mover as 17 tabelas. FKs internas e a inbound (purchase_item) acompanham.
--    Triggers BEFORE INSERT/UPDATE de deactivation seguem suas tabelas.
-- ----------------------------------------------------------------------------
alter table sisub.compras_material_grupo                  set schema compras_gov_integration;
alter table sisub.compras_material_classe                 set schema compras_gov_integration;
alter table sisub.compras_material_pdm                    set schema compras_gov_integration;
alter table sisub.compras_material_item                   set schema compras_gov_integration;
alter table sisub.compras_material_natureza_despesa       set schema compras_gov_integration;
alter table sisub.compras_material_unidade_fornecimento   set schema compras_gov_integration;
alter table sisub.compras_material_caracteristica         set schema compras_gov_integration;
alter table sisub.compras_servico_secao                   set schema compras_gov_integration;
alter table sisub.compras_servico_divisao                 set schema compras_gov_integration;
alter table sisub.compras_servico_grupo                   set schema compras_gov_integration;
alter table sisub.compras_servico_classe                  set schema compras_gov_integration;
alter table sisub.compras_servico_subclasse               set schema compras_gov_integration;
alter table sisub.compras_servico_item                    set schema compras_gov_integration;
alter table sisub.compras_servico_unidade_medida          set schema compras_gov_integration;
alter table sisub.compras_servico_natureza_despesa        set schema compras_gov_integration;
alter table sisub.compras_sync_log                        set schema compras_gov_integration;
alter table sisub.compras_sync_step                       set schema compras_gov_integration;

-- ----------------------------------------------------------------------------
-- 2) Mover as 4 funções de trigger (corpo só usa NEW/OLD — schema-agnóstico).
--    Os triggers referenciam a função por OID, então continuam válidos.
-- ----------------------------------------------------------------------------
alter function sisub.compras_material_item_preserve_deactivation()        set schema compras_gov_integration;
alter function sisub.compras_material_item_set_deactivation_on_insert()    set schema compras_gov_integration;
alter function sisub.compras_servico_item_preserve_deactivation()         set schema compras_gov_integration;
alter function sisub.compras_servico_item_set_deactivation_on_insert()     set schema compras_gov_integration;

-- ----------------------------------------------------------------------------
-- 3) Recriar as 2 funções de incremento atômico no schema novo. O corpo
--    hardcoda `sisub.compras_sync_log` (que não existe mais), então DROP+CREATE
--    apontando para `compras_gov_integration.compras_sync_log`.
--    O worker chama via `.rpc()` com `db.schema = compras_gov_integration`.
-- ----------------------------------------------------------------------------
drop function if exists sisub.compras_sync_step_success(bigint, integer);
drop function if exists sisub.compras_sync_step_failure(bigint);

create function compras_gov_integration.compras_sync_step_success(p_sync_id bigint, p_upserted integer)
returns void language sql as $$
  update compras_gov_integration.compras_sync_log
  set
    completed_steps  = completed_steps + 1,
    successful_steps = successful_steps + 1,
    total_upserted   = total_upserted + p_upserted
  where id = p_sync_id;
$$;

create function compras_gov_integration.compras_sync_step_failure(p_sync_id bigint)
returns void language sql as $$
  update compras_gov_integration.compras_sync_log
  set
    completed_steps = completed_steps + 1,
    failed_steps    = failed_steps + 1
  where id = p_sync_id;
$$;

grant execute on function
  compras_gov_integration.compras_sync_step_success(bigint, integer),
  compras_gov_integration.compras_sync_step_failure(bigint)
  to service_role;

-- ----------------------------------------------------------------------------
-- 4) Recarregar o cache de schema do PostgREST.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
