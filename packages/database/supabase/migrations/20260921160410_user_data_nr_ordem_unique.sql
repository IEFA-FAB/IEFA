-- ============================================================================
-- Um Nr. de Ordem vincula UMA conta
-- ============================================================================
-- Achado LGPD da auditoria de 2026-09-19 (rodada 2): o perfil deixava gravar
-- qualquer nrOrdem na própria conta, e `fetchMilitaryDataFn` devolvia CPF, nome
-- e posto de quem tinha aquele número — consulta de CPF por número de ordem.
--
-- O código já fecha (sisub-domain `syncUserNrOrdem`: write-once + exclusivo, com
-- checagem e gravação numa transação serializada por `pg_advisory_xact_lock` do
-- nrOrdem; a fn devolve o CPF só mascarado). Este índice é a trava no banco para
-- qualquer outro caminho de escrita.
--
-- Condicional de propósito: se a base JÁ tem nrOrdem repetido entre contas, o
-- índice não sobe e a migration avisa (WARNING) em vez de travar o deploy —
-- duplicata existente é caso para o administrador decidir qual conta é a dona,
-- não para uma migration apagar.
--
-- ESTADO EM PRODUÇÃO (2026-09-19): aplicada com 3 duplicatas, então o índice NÃO
-- existe. Esta versão já está registrada — `db push` não a roda de novo. Depois de
-- resolver as duplicatas (consulta do fim), o índice sobe numa migration NOVA.
-- ============================================================================

do $$
begin
  if exists (
    select 1
      from core.user_data
     where "nrOrdem" is not null and btrim("nrOrdem") <> ''
     group by btrim("nrOrdem")
    having count(*) > 1
  ) then
    raise warning 'core.user_data tem nrOrdem repetido entre contas — índice user_data_nr_ordem_uniq NÃO criado. Resolva as duplicatas e reaplique.';
  else
    create unique index if not exists user_data_nr_ordem_uniq
      on core.user_data (btrim("nrOrdem"))
      where "nrOrdem" is not null and btrim("nrOrdem") <> '';
  end if;
end $$;

-- Duplicatas existentes:
-- select btrim("nrOrdem") as nr_ordem, array_agg(id) as contas
--   from core.user_data
--  where "nrOrdem" is not null and btrim("nrOrdem") <> ''
--  group by btrim("nrOrdem") having count(*) > 1;
