-- ============================================================================
-- Fase 3A de sisub-inventory-operations: autenticidade da NF-e e CNPJ da unidade
-- ============================================================================
-- Três buracos que esta migration fecha:
--
--  (1) A chave de acesso era validada com `^[0-9]{44}$`. Desde a NT 2025.001 o
--      CNPJ dentro da chave pode ter LETRAS (CNPJ alfanumérico), e o emitente
--      pode ser CPF (produtor rural). O CHECK recusava nota boa.
--  (2) Nada guardava o resultado da verificação de autenticidade — o parser
--      nem a fazia. Um `<cStat>100</cStat>` digitado à mão virava base de valor
--      de lote e de liquidação. Agora o resultado fica gravado na nota, com o
--      protocolo, e a nota não autorizada nem chega a ser persistida.
--  (3) `core.units` não tinha CNPJ, então não havia como saber se a nota é da
--      unidade. O destinatário casa com a unidade, e a nota fica visível às
--      cozinhas cuja unidade de compra é a destinatária.
--
-- Também entram aqui os campos que o custo de aquisição exige (MCASP): frete,
-- seguro, tributos não recuperáveis e desconto por item, mais `uTrib`/`qTrib`
-- (sem eles, conferir caixa contra unidade dá erro de 12×).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) CNPJ da unidade
-- ----------------------------------------------------------------------------
alter table core.units add column cnpj char(14);

comment on column core.units.cnpj is
  'CNPJ da OM, 14 caracteres. Alfanumérico desde a NT 2025.001: 12 alfanuméricos + 2 dígitos verificadores. A raiz (8 primeiros) é a mesma para o COMAER inteiro.';

-- formato aqui; o dígito verificador é validado no domínio (`isValidCnpj`),
-- como já acontece com o GTIN
alter table core.units add constraint units_cnpj_format check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');
create unique index units_cnpj_key on core.units (cnpj) where cnpj is not null;

-- ----------------------------------------------------------------------------
-- (2) Chave de acesso alfanumérica
-- ----------------------------------------------------------------------------
alter table inventory.nfe_document drop constraint nfe_document_access_key_check;
alter table inventory.nfe_document add constraint nfe_document_access_key_check
  check (access_key ~ '^[0-9A-Z]{44}$');

-- ----------------------------------------------------------------------------
-- (3) Autenticidade, destinatário e ciclo de vida
-- ----------------------------------------------------------------------------
alter table inventory.nfe_document
  add column unit_id bigint references core.units (id),
  add column destination_confirmed boolean not null default false,
  add column supplier_cpf text,
  add column dest_cpf text,
  add column purpose text,
  add column referenced_keys text[] not null default '{}',
  add column protocol_number text,
  add column authenticity jsonb,
  -- consulta de situação na SEFAZ, feita fora e registrada aqui: sem DF-e, é o
  -- que garante que a nota não foi cancelada entre a importação e a liquidação
  add column situation_checked_at timestamptz,
  add column situation_checked_by uuid references auth.users (id),
  add column situation_result text check (situation_result in ('authorized', 'cancelled', 'unknown')),
  add column cancelled_reason text;

comment on column inventory.nfe_document.unit_id is
  'Unidade destinatária resolvida pelo CNPJ. A nota aparece para as cozinhas cuja unidade de compra é esta; sem unidade, fica em triagem do nível 3 global.';
comment on column inventory.nfe_document.authenticity is
  'Resultado da verificação: protocolo, cStat, ambiente, modelo, correspondência de chave e digest da assinatura. Gravado para auditoria — "autorizada" deixou de ser presunção.';
comment on column inventory.nfe_document.referenced_keys is
  'Chaves referenciadas (refNFe). É por aqui que a nota de DEVOLUÇÃO (finNFe=4) se liga à original, e é o que fecha a pendência fiscal de recebimento a menor.';

create index nfe_document_unit_idx on inventory.nfe_document (unit_id, created_at desc);

-- ciclo de vida: `announced` (chave lida do DANFE, sem XML) e `refused` (recusa
-- total no recebimento) passam a existir; `imported`/`matched` continuam
-- válidos para o que já está gravado
alter table inventory.nfe_document drop constraint nfe_document_status_check;
alter table inventory.nfe_document add constraint nfe_document_status_check
  check (status in ('announced', 'imported', 'available', 'matched', 'received', 'divergent', 'cancelled', 'refused'));

-- nota anunciada pela chave ainda não tem itens nem XML
alter table inventory.nfe_document alter column xml drop not null;

-- ----------------------------------------------------------------------------
-- (4) Componentes de valor e unidade tributável por item
-- ----------------------------------------------------------------------------
alter table inventory.nfe_item
  add column taxable_unit text,
  add column taxable_qty numeric(14,4),
  add column product_value numeric(14,2),
  add column discount_value numeric(14,2),
  add column freight_value numeric(14,2),
  add column insurance_value numeric(14,2),
  add column other_expenses_value numeric(14,2),
  add column ipi_value numeric(14,2),
  add column icms_st_value numeric(14,2),
  add column fcp_st_value numeric(14,2),
  -- custo de aquisição do item já com o rateio (MCASP/NBC TSP 04)
  add column acquisition_cost numeric(14,2);

comment on column inventory.nfe_item.taxable_qty is
  'Quantidade na unidade TRIBUTÁVEL. A nota vende 10 CX e tributa 120 UN: conferir caixa contra unidade sem este par dá erro de 12×.';
comment on column inventory.nfe_item.acquisition_cost is
  'Custo do item com frete, seguro, IPI e ICMS-ST rateados, menos desconto. `qCom × vUnCom` subvaloriza o estoque exatamente na parte do frete.';
