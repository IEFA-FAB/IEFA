alter table sisub.compras_material_unidade_fornecimento
  alter column capacidade_unidade_fornecimento type numeric(12,4)
  using capacidade_unidade_fornecimento::numeric(12,4);

alter table sisub.procurement_pesquisa_preco_amostra
  alter column capacidade_unidade_fornecimento type numeric(12,4)
  using capacidade_unidade_fornecimento::numeric(12,4);

comment on column sisub.compras_material_unidade_fornecimento.capacidade_unidade_fornecimento is
  'Capacidade da unidade de fornecimento retornada pelo Compras.gov.br; aceita valores fracionários.';

comment on column sisub.procurement_pesquisa_preco_amostra.capacidade_unidade_fornecimento is
  'Capacidade da unidade de fornecimento retornada pelo Compras.gov.br; aceita valores fracionários.';
