-- Schema explícito desde 2026-09-26. Até então o arquivo dizia só `procurement_list_item`, que
-- em produção resolveu porque rodou com `sisub` no search_path; num banco novo o papel
-- `postgres` tem `"$user", public, extensions`, e o replay parava aqui com "relation does not
-- exist". Nesta altura a tabela é `sisub.procurement_list_item` (renomeada em 20260512); ela só
-- vai para o schema `procurement` depois. O efeito em produção não muda: a coluna já existe.
alter table sisub.procurement_list_item
  add column if not exists item_description text;
