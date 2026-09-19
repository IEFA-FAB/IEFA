-- ============================================================================
-- Um Nr. de Ordem vincula UMA conta
-- ============================================================================
-- Achado LGPD da auditoria de 2026-09-19 (rodada 2): o perfil deixava gravar
-- qualquer nrOrdem na própria conta, e `fetchMilitaryDataFn` devolvia CPF, nome
-- e posto de quem tinha aquele número — consulta de CPF por número de ordem.
--
-- O código já fecha (sisub-domain `syncUserNrOrdem`: write-once + exclusivo; a
-- fn devolve o CPF só mascarado). A exclusividade lá é leitura-antes-da-escrita,
-- e duas contas disputando o mesmo nrOrdem no mesmo instante passariam as duas.
-- Este índice fecha a corrida.
--
-- Condicional de propósito: se a base JÁ tem nrOrdem repetido entre contas, o
-- índice não sobe e a migration avisa (WARNING) em vez de travar o deploy —
-- duplicata existente é caso para o administrador decidir qual conta é a dona,
-- não para uma migration apagar. Liste com a consulta do fim e rode de novo.
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
