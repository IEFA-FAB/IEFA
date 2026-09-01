-- ============================================================================
-- Atributos GPC + exigência do item de compra + cache de veredito por GTIN
-- ============================================================================
-- Objetivo: o fornecedor consegue saber, ANTES de carregar o caminhão, se o
-- GTIN que ele pretende entregar atende à especificação — e o mesmo motor
-- responde internamente "quais dos meus SKUs atendem este item de compra?".
--
-- Divisão de responsabilidade (decidida com a GS1 em tratativa):
--   • A verificação em si é da API da GS1. Aqui fica a PORTA, não o
--     algoritmo — mesmo desenho de @iefa/ai-provider: contrato estável,
--     implementação trocável. Com um stub, tudo que depende disso pode ser
--     construído antes de o contrato fechar.
--   • GTIN: cacheamos só o que é NOSSO. gs1_integration.gtin já é isso —
--     373 linhas vistas em nota, em item nosso ou digitadas. Não replicamos
--     a base da GS1.
--   • GPC: a taxonomia do recorte alimentar vale ter inteira. É pequena,
--     estável, e é o vocabulário com que o edital fala. O importador
--     (apps/api/src/workers/gs1-sync/gpc.ts) hoje descarta os atributos —
--     o cabeçalho dele diz "Attributes, ignorados". São eles que esta
--     migration passa a acomodar.
--
-- O que a verificação prova: que a DECLARAÇÃO do fornecedor bate com a
-- exigência. Não prova nada sobre o produto físico — quem confirma é a
-- conferência no recebimento. Ver a coluna `verdict` abaixo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Atributos da taxonomia GPC
-- ----------------------------------------------------------------------------
create table gs1_integration.gpc_attribute (
  attribute_code text primary key,
  attribute_title text not null,
  synced_at timestamptz not null default now()
);

comment on table gs1_integration.gpc_attribute is
  'Tipo de atributo GPC (ex.: "Estado de conservação", "Tipo de embalagem"). Importado da mesma publicação dos bricks — o parser já percorre a árvore inteira, só descartava este nível.';

create table gs1_integration.gpc_attribute_value (
  value_code text primary key,
  value_title text not null,
  attribute_code text not null references gs1_integration.gpc_attribute (attribute_code),
  synced_at timestamptz not null default now()
);

create index gpc_attribute_value_attribute_idx
  on gs1_integration.gpc_attribute_value (attribute_code);

-- Quais atributos são aplicáveis a cada brick. Sem FK dura para gpc_brick
-- pelo mesmo motivo que gtin.gpc_brick_code não tem: a publicação pode ser
-- importada em partes, e um atributo órfão é melhor que um import que aborta.
create table gs1_integration.gpc_brick_attribute (
  brick_code text not null,
  attribute_code text not null references gs1_integration.gpc_attribute (attribute_code),
  synced_at timestamptz not null default now(),
  primary key (brick_code, attribute_code)
);

create index gpc_brick_attribute_attribute_idx
  on gs1_integration.gpc_brick_attribute (attribute_code);

-- ----------------------------------------------------------------------------
-- Exigência do item de compra, no vocabulário GPC
-- ----------------------------------------------------------------------------
-- Um edital não diz "estado de conservação = congelado". Ele diz "congelado
-- OU resfriado". A exigência é um CONJUNTO de valores aceitos por atributo —
-- guardar um valor único tornaria inexprimível metade dos editais reais.
create table procurement.purchase_item_gpc_requirement (
  id uuid primary key default gen_random_uuid(),
  purchase_item_id uuid not null
    references procurement.purchase_item (id) on delete cascade,
  attribute_code text not null
    references gs1_integration.gpc_attribute (attribute_code),
  accepted_value_codes text[] not null
    check (cardinality(accepted_value_codes) > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_item_gpc_requirement_key unique (purchase_item_id, attribute_code)
);

comment on table procurement.purchase_item_gpc_requirement is
  'Exigência da especificação de compra no vocabulário GPC. accepted_value_codes é um CONJUNTO: "congelado ou resfriado" é uma exigência válida e comum. Conjunto vazio seria "nada atende" — proibido pelo check, ausência de linha já significa "não exijo nada neste atributo".';

create index purchase_item_gpc_requirement_item_idx
  on procurement.purchase_item_gpc_requirement (purchase_item_id);

-- ----------------------------------------------------------------------------
-- Declaração do GTIN no vocabulário GPC
-- ----------------------------------------------------------------------------
-- De onde vêm os atributos do GTIN: o Verified by GS1 publica descrição,
-- marca, conteúdo líquido e brick — NÃO publica os valores de atributo GPC.
-- Quem declara é o fornecedor. Esta tabela é essa declaração, e é o que o
-- verificador local compara enquanto a integração com a API não fecha.
--
-- `source` é o que permite, depois, distinguir o que veio da GS1 do que o
-- fornecedor afirmou por conta própria — sem isso, o veredito herda uma
-- confiança que a origem não sustenta.
create table gs1_integration.gtin_gpc_attribute (
  gtin text not null references gs1_integration.gtin (gtin) on delete cascade,
  attribute_code text not null references gs1_integration.gpc_attribute (attribute_code),
  value_code text not null references gs1_integration.gpc_attribute_value (value_code),
  source text not null default 'fornecedor'
    check (source in ('fornecedor', 'gs1_api', 'manual')),
  declared_at timestamptz not null default now(),
  declared_by uuid references auth.users (id),
  primary key (gtin, attribute_code)
);

comment on table gs1_integration.gtin_gpc_attribute is
  'Valores de atributo GPC declarados para um GTIN. Um valor por atributo: "este produto é congelado" não convive com "este produto é resfriado". A verificação compara ISTO com a exigência — é declaração, não medição.';

create index gtin_gpc_attribute_value_idx
  on gs1_integration.gtin_gpc_attribute (attribute_code, value_code);

-- ----------------------------------------------------------------------------
-- Veredito por (GTIN × item de compra)
-- ----------------------------------------------------------------------------
-- Guardamos o VEREDITO, não só o dado bruto. Razão: no recebimento, o
-- veredito é prova do que se sabia naquele momento. A GS1 pode responder
-- diferente daqui a seis meses; a nota fiscal de março não muda por isso.
create table gs1_integration.gtin_specification_check (
  id uuid primary key default gen_random_uuid(),
  gtin text not null check (gtin ~ '^[0-9]{14}$'),
  purchase_item_id uuid not null
    references procurement.purchase_item (id) on delete cascade,

  verdict text not null check (verdict in ('atende', 'nao_atende', 'indeterminado')),

  -- [{ attribute_code, attribute_title, accepted, declared }] — o que
  -- divergiu, na linguagem que o fornecedor lê.
  divergences jsonb not null default '[]'::jsonb,

  -- Quem decidiu. 'gs1_api' = a API respondeu; 'local' = comparação sobre
  -- declaração já em base (stub e modo degradado).
  source text not null check (source in ('gs1_api', 'local')),

  -- Impressão digital da exigência no momento da decisão. Sem isto, mudar a
  -- especificação deixaria vereditos velhos parecendo válidos — é a mesma
  -- classe de erro do snapshot de ATA que não congela o que publicou.
  spec_fingerprint text not null,

  raw_response jsonb,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users (id)
);

comment on table gs1_integration.gtin_specification_check is
  'Veredito de conformidade de um GTIN contra uma especificação de compra. ATENÇÃO: valida a DECLARAÇÃO do fornecedor, não o produto físico — quem confirma é a conferência no recebimento. Apresentar como garantia criaria confiança falsa.';
comment on column gs1_integration.gtin_specification_check.spec_fingerprint is
  'Hash da exigência vigente quando o veredito foi emitido. Veredito com fingerprint diferente do atual está VENCIDO e precisa ser refeito.';

create index gtin_specification_check_gtin_idx
  on gs1_integration.gtin_specification_check (gtin, purchase_item_id, checked_at desc);
create index gtin_specification_check_item_idx
  on gs1_integration.gtin_specification_check (purchase_item_id, verdict);

-- ----------------------------------------------------------------------------
-- RLS: referência e veredito são leitura para autenticado; escrita só service role
-- ----------------------------------------------------------------------------
alter table gs1_integration.gpc_attribute enable row level security;
alter table gs1_integration.gpc_attribute_value enable row level security;
alter table gs1_integration.gpc_brick_attribute enable row level security;
alter table gs1_integration.gtin_gpc_attribute enable row level security;
alter table gs1_integration.gtin_specification_check enable row level security;
alter table procurement.purchase_item_gpc_requirement enable row level security;

create policy gpc_attribute_read on gs1_integration.gpc_attribute
  for select to authenticated using (true);
create policy gpc_attribute_value_read on gs1_integration.gpc_attribute_value
  for select to authenticated using (true);
create policy gpc_brick_attribute_read on gs1_integration.gpc_brick_attribute
  for select to authenticated using (true);
create policy gtin_gpc_attribute_read on gs1_integration.gtin_gpc_attribute
  for select to authenticated using (true);
create policy gtin_specification_check_read on gs1_integration.gtin_specification_check
  for select to authenticated using (true);
create policy purchase_item_gpc_requirement_read on procurement.purchase_item_gpc_requirement
  for select to authenticated using (true);

grant select on gs1_integration.gpc_attribute, gs1_integration.gpc_attribute_value,
  gs1_integration.gpc_brick_attribute, gs1_integration.gtin_gpc_attribute,
  gs1_integration.gtin_specification_check to authenticated;
grant select on procurement.purchase_item_gpc_requirement to authenticated;

-- ----------------------------------------------------------------------------
-- Último veredito válido por (GTIN, item de compra)
-- ----------------------------------------------------------------------------
create view gs1_integration.v_gtin_specification_latest
  with (security_invoker = true) as
select distinct on (c.gtin, c.purchase_item_id)
  c.gtin, c.purchase_item_id, c.verdict, c.divergences, c.source,
  c.spec_fingerprint, c.checked_at
from gs1_integration.gtin_specification_check c
order by c.gtin, c.purchase_item_id, c.checked_at desc;

comment on view gs1_integration.v_gtin_specification_latest is
  'Veredito mais recente por par. Compare spec_fingerprint com o da exigência atual antes de confiar: igual = válido, diferente = vencido.';
