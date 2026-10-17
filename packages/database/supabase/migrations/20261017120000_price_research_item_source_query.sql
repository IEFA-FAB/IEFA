-- ============================================================================
-- Pesquisa de preços: os parâmetros exatos da consulta à fonte (IN SEGES/ME 65/2021, art. 3º, III)
-- ============================================================================
-- A série e o relatório montam a URL de cada consulta para quem quiser repeti-la. A consulta do
-- sisub é só o CATMAT, mas a rota admin da API também envia `dataResultado=true` e, quando pedidos,
-- os filtros de estado, UASG e município. Sem os parâmetros gravados, o documento descreveria uma
-- consulta diferente da que foi feita.
--
--   source_query   parâmetros enviados à fonte, sem `pagina`, no formato de query string
--                  (`tipo=codigoItemCatalogo&codigo=…&tamanhoPagina=500[&…]`).
--
-- Aditiva: coluna nova nula (pesquisas anteriores não a registraram).
-- ============================================================================

alter table procurement.price_research_item
  add column source_query text check (char_length(source_query) <= 1000);

comment on column procurement.price_research_item.source_query is
  'Parâmetros da consulta ao Compras.gov.br, sem pagina, como foram enviados (query string).';
