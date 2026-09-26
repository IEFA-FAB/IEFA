-- ============================================================================
-- Sync do Compras.gov: linha igual não é regravada
-- ============================================================================
-- O sync (apps/api/src/workers/compras-sync) faz upsert de todas as linhas de
-- cada página pelo PostgREST, o que vira `INSERT ... ON CONFLICT DO UPDATE`
-- mesmo sem mudança. Medido em 2026-09-26 (pg_stat_user_tables): 4,4 mi de
-- updates em 1,7 mi de características, 483 mil em 20 mil PDMs, 691 mil em 38
-- mil unidades de fornecimento. Cada update cria tupla morta, reescreve os
-- índices (inclusive o GIN trigram de 217 MB em
-- `compras_material_item.descricao_item`) e infla o WAL.
--
-- 1. Trigger BEFORE UPDATE nas 15 tabelas que o sync grava: iguala
--    `synced_at` ao valor antigo e, se a linha nova é idêntica à antiga
--    (IS NOT DISTINCT FROM, com a semântica de tipo do próprio banco), devolve
--    NULL: o Postgres descarta o update, sem tupla nova, sem índice, sem WAL,
--    e a linha não sai no RETURNING (o sync conta gravadas por ele). Se mudou,
--    `synced_at` vira now() e o update segue.
--    Vale também no ON CONFLICT DO UPDATE e para qualquer escritor (o sync
--    alimentício incluso). INSERT não passa por aqui.
--
--    Ordem: triggers BEFORE do mesmo evento disparam em ordem alfabética de
--    nome. `a_skip_unchanged_sync_row` vem antes de
--    `trg_compras_{material,servico}_item_deactivation`; quando ele devolve
--    NULL os seguintes nem disparam, o que é inócuo: numa linha idêntica o
--    `status_*` antigo e o novo coincidem, e esses triggers só mudam
--    `first_deactivation_detected_at` na transição true → false. Trigger BEFORE
--    UPDATE novo nestas tabelas precisa de nome que ordene depois deste.
--
-- 2. `synced_at` passa a significar "última gravação com mudança de conteúdo"
--    (ou a inserção), não "visto na última execução". Nenhum leitor dependia do
--    sentido antigo (conferido no código e nas funções/views do banco em
--    2026-09-26). Registrado no comentário de cada coluna.
--
-- 3. `integration_sync_step.records_processed`: linhas recebidas da API no
--    step, ao lado de `records_upserted` (as gravadas). Sem os dois, "sync
--    saudável sem mudanças" e "API devolveu vazio" aparecem iguais no painel
--    (0). Anulável: steps de outras origens e os antigos não o preenchem.
--
-- Deploy: aplicar esta migration ANTES de subir a API deste PR, que grava
-- `records_processed`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Função e triggers
-- ----------------------------------------------------------------------------
create or replace function compras_gov_integration.skip_unchanged_sync_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- `synced_at` é controle: o sync manda o relógio dele em toda linha, e isso
  -- sozinho não é mudança.
  new.synced_at := old.synced_at;
  if new is not distinct from old then
    return null;
  end if;
  new.synced_at := now();
  return new;
end;
$$;

comment on function compras_gov_integration.skip_unchanged_sync_row() is
  'Trigger BEFORE UPDATE das tabelas do sync do Compras.gov: descarta o update de linha idêntica (ignorando synced_at) e, se houve mudança, carimba synced_at = now().';

revoke all on function compras_gov_integration.skip_unchanged_sync_row() from public;
grant execute on function compras_gov_integration.skip_unchanged_sync_row() to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'compras_material_grupo',
    'compras_material_classe',
    'compras_material_pdm',
    'compras_material_item',
    'compras_material_natureza_despesa',
    'compras_material_unidade_fornecimento',
    'compras_material_caracteristica',
    'compras_servico_secao',
    'compras_servico_divisao',
    'compras_servico_grupo',
    'compras_servico_classe',
    'compras_servico_subclasse',
    'compras_servico_item',
    'compras_servico_unidade_medida',
    'compras_servico_natureza_despesa'
  ] loop
    execute format(
      'create trigger a_skip_unchanged_sync_row before update on compras_gov_integration.%I '
      'for each row execute function compras_gov_integration.skip_unchanged_sync_row()',
      v_table
    );
    execute format(
      'comment on column compras_gov_integration.%I.synced_at is %L',
      v_table,
      'Última gravação da linha pelo sync do Compras.gov: inserção ou mudança de conteúdo. '
        || 'Upsert com a linha idêntica não a regrava (trigger a_skip_unchanged_sync_row), '
        || 'então isto NÃO indica que a linha foi vista na última execução.'
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Processadas × gravadas por step
-- ----------------------------------------------------------------------------
alter table compras_gov_integration.integration_sync_step
  add column records_processed integer;

comment on column compras_gov_integration.integration_sync_step.records_processed is
  'Linhas recebidas da fonte no step (processadas). records_upserted conta só as gravadas (novas ou alteradas). NULL em steps que não distinguem as duas.';
comment on column compras_gov_integration.integration_sync_step.records_upserted is
  'Contagem do step definida por origem. No sync do Compras.gov: linhas efetivamente gravadas (novas ou alteradas); as recebidas ficam em records_processed.';
