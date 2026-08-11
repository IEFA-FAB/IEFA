-- ============================================================================
-- ALPHA — fontes de legislação federal: URLs reais
-- ============================================================================
-- O seed inicial registrou as normas por URN LexML, seguindo o desenho que
-- previa o LexML/SRU como fonte primária de texto articulado.
--
-- Ao rodar contra o servidor real, `lexml.gov.br/busca/SRU` responde com uma
-- página de verificação de segurança do Senado em vez de XML — não é
-- consumível a partir de servidor. O que responde:
--
--   * Planalto  (planalto.gov.br) — texto compilado de lei e decreto
--   * DOU       (in.gov.br)       — instruções normativas
--
-- Esta migration troca as URLs e registra as normas do corpus mínimo. As
-- fontes seguem `enabled = false` até a primeira coleta conferida.
-- ============================================================================

update alpha.normative_source
set base_url  = 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm',
    authority = 'PLANALTO'
where id = 'lei-14133';

update alpha.normative_source
set base_url = 'https://www.in.gov.br/en/web/dou/-/instrucao-normativa-seges-/me-n-65-de-7-de-julho-de-2021-330673635'
where id = 'in-seges-65-2021';

-- Decretos regulamentadores citados pelas notas explicativas dos modelos AGU.
-- Só entram os que já foram verificados respondendo no Planalto.
insert into alpha.normative_source (id, authority, kind, base_url, cadence, enabled) values
	('decreto-11246-2022', 'PLANALTO', 'REGULAMENTO', 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/decreto/D11246.htm', 'weekly', false),
	('decreto-11462-2023', 'PLANALTO', 'REGULAMENTO', 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/D11462.htm', 'weekly', false)
on conflict (id) do nothing;

comment on table alpha.normative_source is
	'Registry de fontes normativas externas. base_url é a URL efetivamente coletada — LexML/SRU não é utilizável a partir de servidor (verificação anti-bot do Senado).';
