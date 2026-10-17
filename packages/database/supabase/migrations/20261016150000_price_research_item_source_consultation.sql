-- ============================================================================
-- Pesquisa de preços: quando e quanto da fonte oficial foi lido (IN SEGES/ME 65/2021, art. 3º, III e IV)
-- ============================================================================
-- O relatório e a série precisam dizer QUANDO a consulta ao Compras.gov.br foi feita e se ela
-- leu tudo o que a janela pedia. A API não devolve hora da consulta (só totalRegistros,
-- totalPaginas e paginasRestantes); a hora é a do servidor do sisub ao receber a página 1.
--
--   source_consulted_at    hora em que o servidor do sisub recebeu a página 1 da consulta.
--   source_total_records   totalRegistros informado pela fonte para o CATMAT.
--   source_total_pages     totalPaginas informado pela fonte, no tamanho de página usado.
--   source_pages_fetched   páginas efetivamente lidas.
--   source_coverage        'window': a fonte ordena por data do resultado, da mais nova para a
--                          mais antiga, e a coleta parou na primeira página que passou do início
--                          da janela (a janela inteira foi lida);
--                          'complete': todas as páginas foram lidas;
--                          'truncated': a coleta parou no teto de páginas antes de cobrir a janela
--                          (amostra parcial: refazer a pesquisa).
--
-- Tudo aditivo: colunas novas nulas (pesquisas anteriores não registraram a consulta) e CHECK
-- que nenhuma linha existente reprova (todas nulas).
-- ============================================================================

alter table procurement.price_research_item
  add column source_consulted_at timestamptz,
  add column source_total_records integer check (source_total_records >= 0),
  add column source_total_pages integer check (source_total_pages >= 0),
  add column source_pages_fetched integer check (source_pages_fetched >= 0),
  add column source_coverage text check (source_coverage in ('window', 'complete', 'truncated'));

comment on column procurement.price_research_item.source_consulted_at is
  'Hora em que o servidor do sisub recebeu a página 1 da consulta ao Compras.gov.br (a API não informa a hora da consulta).';
comment on column procurement.price_research_item.source_total_records is
  'totalRegistros informado pelo Compras.gov.br para o CATMAT consultado.';
comment on column procurement.price_research_item.source_total_pages is
  'totalPaginas informado pelo Compras.gov.br, no tamanho de página da consulta.';
comment on column procurement.price_research_item.source_pages_fetched is
  'Páginas da consulta efetivamente lidas.';
comment on column procurement.price_research_item.source_coverage is
  'window = a janela inteira foi lida (a fonte ordena por data do resultado, decrescente); complete = todas as páginas; truncated = parou no teto antes de cobrir a janela.';
