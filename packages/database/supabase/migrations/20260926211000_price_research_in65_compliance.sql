-- ============================================================================
-- Pesquisa de preços: justificativas e parâmetro do art. 5º (IN SEGES/ME 65/2021)
-- ============================================================================
-- A irregularidade da pesquisa não trava o uso do preço: vira não conformidade
-- registrada no item pesquisado (`non_compliance_reasons`), e a justificativa
-- correspondente a resolve. Estas colunas guardam a justificativa, no grão em
-- que a decisão é tomada: o item pesquisado (a pesquisa avulsa tem um item só; a
-- do worker da API tem vários, cada um com a sua amostra).
--
--   justification_low_sample        art. 6º, § 5º: preço estimado com menos de 3
--                                   preços (e o critério interno de 3 UASGs).
--   justification_method            art. 6º, § 1º: método diferente de média,
--                                   mediana ou menor valor (art. 6º, caput).
--   justification_outlier_criteria  art. 6º, § 3º, e art. 3º, VI: critério de
--                                   desconsideração de preços que não é o IQR
--                                   automático (seleção ou filtro manual).
--   justification_out_of_period     art. 5º, § 3º: preço fora do período de 1 ano
--                                   (janela maior, todo o histórico ou amostra
--                                   sem data de referência no cálculo).
--
-- Texto em português, nulo quando não há o que justificar. Tudo aditivo: coluna
-- nova nula, CHECK que nenhuma linha existente reprova (conferido por SELECT em
-- 2026-09-26: `reference_method` do item só tem 'mean' e 'median').
-- ============================================================================

alter table procurement.procurement_pesquisa_preco_item
  add column justification_low_sample text
    check (char_length(justification_low_sample) <= 4000),
  add column justification_method text
    check (char_length(justification_method) <= 4000),
  add column justification_outlier_criteria text
    check (char_length(justification_outlier_criteria) <= 4000),
  add column justification_out_of_period text
    check (char_length(justification_out_of_period) <= 4000);

comment on column procurement.procurement_pesquisa_preco_item.justification_low_sample is
  'Justificativa do preço estimado com menos de 3 preços (IN SEGES/ME 65/2021, art. 6º, § 5º) ou com menos de 3 UASGs (critério da unidade). Exige aprovação da autoridade competente.';
comment on column procurement.procurement_pesquisa_preco_item.justification_method is
  'Justificativa de método diferente de média, mediana ou menor valor (IN SEGES/ME 65/2021, art. 6º, § 1º). Exige aprovação da autoridade competente.';
comment on column procurement.procurement_pesquisa_preco_item.justification_outlier_criteria is
  'Critério fundamentado de desconsideração de valores inexequíveis, inconsistentes ou excessivos quando não é o IQR automático (IN SEGES/ME 65/2021, art. 6º, § 3º; art. 3º, VI).';
comment on column procurement.procurement_pesquisa_preco_item.justification_out_of_period is
  'Justificativa de preço fora do período de 1 ano ou sem data de referência (IN SEGES/ME 65/2021, art. 5º, § 3º).';

-- O cabeçalho já aceitava 'lowest' (art. 6º, caput: "o menor dos valores"); o
-- snapshot no item passa a ter o mesmo domínio.
alter table procurement.procurement_pesquisa_preco_item
  add constraint procurement_pesquisa_preco_item_reference_method_check
    check (reference_method in ('median', 'mean', 'lowest'));

-- Parâmetro do art. 5º de onde veio cada amostra, por participação na pesquisa.
-- O default 'I' vale porque a única fonte hoje é o módulo de pesquisa de preço do
-- Compras.gov.br (`/modulo-pesquisa-preco/1_consultarMaterial`), os dados do
-- Painel de Preços, que o inciso I cita como sistema oficial. Isso inclui as
-- linhas existentes e as que a `main` grava sem conhecer a coluna. Fonte nova
-- (cotação direta = IV, NF-e = V, mídia/sítios = III) grava o inciso explícito.
alter table procurement.procurement_pesquisa_preco_amostra
  add column art5_parameter text not null default 'I'
    check (art5_parameter in ('I', 'II', 'III', 'IV', 'V'));

comment on column procurement.procurement_pesquisa_preco_amostra.art5_parameter is
  'Parâmetro da IN SEGES/ME 65/2021, art. 5º, de que veio a amostra (I a V). Compras.gov.br / Painel de Preços = I.';

notify pgrst, 'reload schema';
