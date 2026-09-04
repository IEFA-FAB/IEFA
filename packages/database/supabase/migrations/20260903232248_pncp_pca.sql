-- Plano de Contratações Anual (PCA) do PNCP.
--
-- Por que esta fonte e não as atas: varrendo a especificação inteira do PNCP existe UM único
-- endpoint de lote — `/v1/orgaos/{cnpj}/pca/{ano}/csv`. Ele devolve, em uma requisição de
-- ~2 s, os 21.392 itens do plano de contratações de TODA a FAB (35 UASGs), com UASG em 100%
-- das linhas e código CATMAT em 78% dos itens alimentares. Dos 678 CATMATs alimentares, 376
-- (55%) já existem em `procurement.purchase_item` — ou seja, o join é por CÓDIGO.
--
-- O caminho das atas foi medido e descartado: a `descricao` do item lá é o nome da CLASSE
-- CATMAT, não o produto (10 itens → 3 descrições, "Carne de ave in natura" repetida sete
-- vezes a quatro preços), o que torna o casamento com o catálogo indecidível. Ver
-- openspec/changes/sisub-pncp-integration/review.md.
--
-- Três coisas que este DDL existe para tornar possíveis:
--
--   1. RECONCILIAÇÃO, NÃO UPSERT-MERGE. O CSV é o plano COMPLETO do par órgão/ano. Upsert puro
--      nunca remove nada, então item retirado do plano ficaria aqui para sempre, inflando a
--      demanda planejada em silêncio. Daí `removed_at`: a ingestão marca o que sumiu do
--      arquivo. A remoção é lógica porque item planejado e depois retirado é sinal, não lixo.
--
--   2. INVALIDAÇÃO POR CONTEÚDO. A origem responde `Cache-Control: no-store` e NÃO envia
--      `ETag` nem `Last-Modified` — revalidação condicional é impossível. `pncp_pca_snapshot`
--      guarda o SHA-256 do último arquivo aplicado: medimos o CSV voltar byte a byte idêntico
--      entre coletas, e reaplicar custaria 21 mil escritas sem mudança de estado.
--
--   3. COBERTURA DERIVADA, NUNCA GRAVADA. Não existe coluna dizendo "este item já está no
--      catálogo". `purchase_item` muda conforme alguém cura o catálogo; uma flag gravada
--      diria "não coberto" para item que já tem insumo. A cobertura é join na leitura.
--
-- Acesso: RLS ligada SEM policy, igual às demais tabelas de integração. Nenhum cliente toca
-- direto; todo caminho passa por server fn com a service key.

begin;

-- ── Discriminador de origem no log de sync ───────────────────────────────────
-- `hasLiveSync` consulta `status = 'running'` SEM filtro de origem, `recoverStaleSyncs` marca
-- como erro qualquer linha `running` sem heartbeat, e `/sync/latest` é
-- `order by started_at limit 1` sobre a tabela toda — alimentando a tela de rotinas do
-- Compras.gov. Sem esta coluna, a ingestão do PCA bloquearia o sync semanal do CATMAT,
-- marcaria o sync alheio como falho e apareceria na tela errada. É pré-requisito, não
-- melhoria.
alter table compras_gov_integration.compras_sync_log
  add column if not exists source text not null default 'compras_gov';

update compras_gov_integration.compras_sync_log
   set source = 'compras_gov'
 where source is null;

create index if not exists idx_compras_sync_log_source_started
  on compras_gov_integration.compras_sync_log (source, started_at desc);

-- ── Estado de invalidação por par órgão/ano ──────────────────────────────────
create table if not exists compras_gov_integration.pncp_pca_snapshot (
	cnpj_orgao   text        not null,
	ano_pca      integer     not null,
	content_hash text        not null,          -- sha256 hex do CSV aplicado
	row_count    integer     not null,
	byte_size    integer     not null,
	applied_at   timestamptz not null default now(),
	primary key (cnpj_orgao, ano_pca)
);

comment on table compras_gov_integration.pncp_pca_snapshot is
	'Estado de invalidação do acervo do PCA. Hash do último CSV aplicado por órgão/ano: a origem não envia ETag nem Last-Modified, então a comparação de conteúdo é a única guarda contra reaplicar 21 mil linhas sem mudança.';

-- ── Itens do plano ───────────────────────────────────────────────────────────
-- Colunas espelham o CSV; `id_item_pca` é o "Id do item no PCA", estável entre coletas
-- (verificado: 21.392 ids, 0 sumiram e 0 novos entre duas coletas do mesmo arquivo).
create table if not exists compras_gov_integration.pncp_pca_item (
	id                       uuid primary key default gen_random_uuid(),

	-- chave natural
	cnpj_orgao               text    not null,
	ano_pca                  integer not null,
	id_item_pca              text    not null,

	-- unidade responsável
	uasg                     text    not null,
	nome_unidade             text,

	-- classificação
	categoria_item           text,
	identificador_contratacao text,
	nome_contratacao         text,
	catalogo                 text,
	classificacao_catalogo   text,
	codigo_classe            text,
	nome_classe              text,
	codigo_pdm               text,
	nome_pdm                 text,

	-- item
	codigo_item              text,               -- CATMAT; null em 22% dos itens alimentares
	descricao_item           text,
	unidade_fornecimento     text,
	quantidade_estimada      numeric(18, 4),
	valor_unitario_estimado  numeric(18, 4),
	valor_total_estimado     numeric(18, 4),
	valor_orcamentario       numeric(18, 4),
	data_desejada            date,

	-- controle
	collected_at             timestamptz not null default now(),
	removed_at               timestamptz,        -- item que sumiu do plano; nunca apagado

	unique (cnpj_orgao, ano_pca, id_item_pca)
);

comment on column compras_gov_integration.pncp_pca_item.removed_at is
	'Item presente numa coleta anterior e ausente do CSV mais recente do mesmo órgão/ano. Preenchido pela reconciliação de snapshot; a linha nunca é apagada porque "planejado e depois retirado" é informação.';
comment on column compras_gov_integration.pncp_pca_item.codigo_item is
	'CATMAT. Null em ~22% dos itens alimentares medidos — a leitura conta e exibe os dois grupos em vez de esconder o buraco.';

create index if not exists idx_pncp_pca_item_orgao_ano
	on compras_gov_integration.pncp_pca_item (cnpj_orgao, ano_pca);
create index if not exists idx_pncp_pca_item_codigo_item
	on compras_gov_integration.pncp_pca_item (codigo_item)
	where codigo_item is not null and removed_at is null;
create index if not exists idx_pncp_pca_item_uasg
	on compras_gov_integration.pncp_pca_item (uasg)
	where removed_at is null;
create index if not exists idx_pncp_pca_item_classe
	on compras_gov_integration.pncp_pca_item (codigo_classe)
	where removed_at is null;

alter table compras_gov_integration.pncp_pca_item     enable row level security;
alter table compras_gov_integration.pncp_pca_snapshot enable row level security;

commit;
