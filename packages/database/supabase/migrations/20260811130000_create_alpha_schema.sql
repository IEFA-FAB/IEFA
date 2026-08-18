-- ============================================================================
-- ALPHA — Projeto α: RAG jurídico, fontes normativas federais e conformidade
-- ============================================================================
-- Consolida o Projeto α neste projeto Supabase, sob o schema `alpha`. Até aqui
-- o alpha vivia num projeto separado com schema aplicado à mão (sem migration
-- no repo). O corpus existente (RADA indexado) é copiado por script à parte —
-- reingerir não é opção, o acesso ao RADA está indisponível.
--
-- Modelo: fontes normativas versionadas (AGU/legislação) -> documento com
-- vigência -> chunks (embedding + FTS) e árvore de seções -> regras de
-- conformidade -> submissão do usuário -> extração -> execução -> achados.
--
-- Invariantes:
--   - embedding = vector(1024) (baai/bge-m3), NÃO 3072
--   - versionamento é aditivo: nova versão insere linha e marca a anterior com
--     `superseded_at`; nada é sobrescrito
--   - `document_chunk.is_current` espelha `document.superseded_at is null` via
--     trigger, para permitir índice HNSW parcial
--
-- RLS: negação por padrão. Todo acesso passa pelo serviço `alpha` (Hono) com
-- service_role, que bypassa RLS. anon/authenticated não têm grant nem policy —
-- submissões carregam documentos de contratação em elaboração.
-- ============================================================================

create schema if not exists alpha;

create extension if not exists vector with schema extensions;
create extension if not exists ltree  with schema extensions;

grant usage on schema alpha to service_role;

-- ----------------------------------------------------------------------------
-- Trigger helper: updated_at
-- ----------------------------------------------------------------------------
create or replace function alpha.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- normative_source — registry de fontes externas
-- ----------------------------------------------------------------------------
create table alpha.normative_source (
	id              text primary key,           -- 'agu-modelos-14133', 'lei-14133'
	authority       text not null,
	kind            text not null,
	base_url        text not null,
	cadence         text not null default 'weekly',
	enabled         boolean not null default false,
	last_checked_at timestamptz,
	last_error      text,
	created_at      timestamptz not null default now(),
	updated_at      timestamptz not null default now(),
	constraint normative_source_authority_check check (authority in ('AGU', 'PLANALTO', 'SEGES', 'SENADO', 'FAB')),
	constraint normative_source_kind_check      check (kind in ('MODELO', 'LEI', 'REGULAMENTO')),
	constraint normative_source_cadence_check   check (cadence in ('daily', 'weekly', 'monthly'))
);

create trigger normative_source_set_updated_at
	before update on alpha.normative_source
	for each row execute function alpha.set_updated_at();

-- ----------------------------------------------------------------------------
-- document — corpus versionado (RADA e demais docs FAB + fontes federais)
-- ----------------------------------------------------------------------------
create table alpha.document (
	id             uuid primary key default gen_random_uuid(),
	title          text not null,
	document_type  text not null,
	source         text,
	year           int,
	raw_content    text,                        -- markdown/texto original ingerido
	-- versionamento (nulo para o corpus legado da FAB, ingerido por markdown)
	source_id      text references alpha.normative_source(id) on delete set null,
	external_id    text,                        -- URL canônica ou URN LexML
	version_label  text,                        -- 'mai-26', '2021-04-01'
	effective_from date,
	superseded_at  timestamptz,
	content_hash   text,
	created_at     timestamptz not null default now(),
	updated_at     timestamptz not null default now(),
	constraint document_type_check check (document_type in (
		'RADA', 'RBHA', 'ICA', 'MCA', 'NSCA',
		'LEI', 'DECRETO', 'IN_SEGES', 'MODELO_AGU'
	))
);

-- idempotência da ingestão: mesma fonte + mesmo item + mesmo conteúdo = uma linha
create unique index document_source_content_uk
	on alpha.document (source_id, external_id, content_hash)
	where source_id is not null;

-- no máximo uma versão vigente por item de fonte
create unique index document_current_version_uk
	on alpha.document (source_id, external_id)
	where source_id is not null and superseded_at is null;

create index document_type_ix on alpha.document (document_type);

create trigger document_set_updated_at
	before update on alpha.document
	for each row execute function alpha.set_updated_at();

-- ----------------------------------------------------------------------------
-- document_chunk — busca híbrida (semântica + FTS)
-- ----------------------------------------------------------------------------
create table alpha.document_chunk (
	id          uuid primary key default gen_random_uuid(),
	document_id uuid not null references alpha.document(id) on delete cascade,
	content     text not null,
	chapter     text,
	article     text,
	section     text,
	chunk_index int not null,
	token_count int,
	metadata    jsonb not null default '{}'::jsonb,
	embedding   extensions.vector(1024),
	-- espelha document.superseded_at is null; mantido por trigger para viabilizar
	-- índice HNSW parcial (pgvector não indexa através de join)
	is_current  boolean not null default true,
	fts         tsvector generated always as (to_tsvector('portuguese', content)) stored,
	created_at  timestamptz not null default now(),
	unique (document_id, chunk_index)
);

create index document_chunk_embedding_ix on alpha.document_chunk
	using hnsw (embedding extensions.vector_cosine_ops)
	with (m = 16, ef_construction = 64)
	where is_current;

create index document_chunk_fts_ix on alpha.document_chunk using gin (fts) where is_current;
create index document_chunk_document_ix on alpha.document_chunk (document_id);

-- ----------------------------------------------------------------------------
-- Sincronização de is_current
-- ----------------------------------------------------------------------------
create or replace function alpha.sync_chunk_is_current()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.superseded_at is distinct from old.superseded_at then
		update alpha.document_chunk
		set is_current = (new.superseded_at is null)
		where document_id = new.id;
	end if;
	return new;
end;
$$;

create trigger document_sync_chunk_is_current
	after update of superseded_at on alpha.document
	for each row execute function alpha.sync_chunk_is_current();

create or replace function alpha.set_chunk_is_current()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	v_superseded timestamptz;
begin
	select d.superseded_at into v_superseded from alpha.document d where d.id = new.document_id;
	new.is_current := (v_superseded is null);
	return new;
end;
$$;

create trigger document_chunk_set_is_current
	before insert on alpha.document_chunk
	for each row execute function alpha.set_chunk_is_current();

-- ----------------------------------------------------------------------------
-- structure_node — árvore de seções (modelo AGU) / dispositivos (norma)
-- ----------------------------------------------------------------------------
create table alpha.structure_node (
	id              uuid primary key default gen_random_uuid(),
	document_id     uuid not null references alpha.document(id) on delete cascade,
	path            extensions.ltree not null,
	ordinal         int not null,
	level           int not null,
	title           text not null,
	title_norm      text not null,              -- sem acento, sem numeração, minúsculo
	title_embedding extensions.vector(1024),
	ref_label       text,                       -- 'Art. 6º, XXIII, a' quando norma
	is_required     boolean not null default true,
	body            text,
	created_at      timestamptz not null default now(),
	unique (document_id, path)
);

create index structure_node_document_ix  on alpha.structure_node (document_id, ordinal);
create index structure_node_path_ix      on alpha.structure_node using gist (path extensions.gist_ltree_ops);
create index structure_node_ref_label_ix on alpha.structure_node (document_id, ref_label) where ref_label is not null;

-- ----------------------------------------------------------------------------
-- explanatory_note — notas explicativas dos modelos AGU (semente de regra)
-- ----------------------------------------------------------------------------
create table alpha.explanatory_note (
	id         uuid primary key default gen_random_uuid(),
	node_id    uuid not null references alpha.structure_node(id) on delete cascade,
	content    text not null,
	cited_refs jsonb not null default '[]'::jsonb,  -- [{norma, dispositivo}]
	created_at timestamptz not null default now()
);

create index explanatory_note_node_ix on alpha.explanatory_note (node_id);

-- ----------------------------------------------------------------------------
-- placeholder — campos de preenchimento do modelo (insumo da Fase 2)
-- ----------------------------------------------------------------------------
create table alpha.placeholder (
	id      uuid primary key default gen_random_uuid(),
	node_id uuid not null references alpha.structure_node(id) on delete cascade,
	token   text not null,                      -- '[INSERIR O OBJETO]'
	hint    text
);

create index placeholder_node_ix on alpha.placeholder (node_id);

-- ----------------------------------------------------------------------------
-- checklist_rule — regras de conformidade
-- ----------------------------------------------------------------------------
create table alpha.checklist_rule (
	id                 uuid primary key default gen_random_uuid(),
	code               text not null unique,
	kind               text not null,
	severity           text not null,
	status             text not null default 'draft',
	origin             text not null,
	origin_document_id uuid references alpha.document(id) on delete set null,
	origin_note_id     uuid references alpha.explanatory_note(id) on delete set null,
	legal_ref          jsonb not null default '[]'::jsonb,
	applicability      jsonb not null default '{}'::jsonb,  -- {modalidade:[], objeto:[]}
	target_field       text,
	statement          text not null,
	prompt             text,
	created_at         timestamptz not null default now(),
	updated_at         timestamptz not null default now(),
	constraint checklist_rule_kind_check     check (kind in ('ESTRUTURAL', 'CONTEUDO', 'CRUZADA')),
	constraint checklist_rule_severity_check check (severity in ('BLOQUEANTE', 'GRAVE', 'MEDIA', 'INFORMATIVA')),
	constraint checklist_rule_status_check   check (status in ('draft', 'active', 'needs_review', 'retired')),
	constraint checklist_rule_origin_check   check (origin in ('agu_note', 'manual', 'norma'))
);

create index checklist_rule_active_ix on alpha.checklist_rule (kind) where status = 'active';
create index checklist_rule_status_ix on alpha.checklist_rule (status);

create trigger checklist_rule_set_updated_at
	before update on alpha.checklist_rule
	for each row execute function alpha.set_updated_at();

-- ----------------------------------------------------------------------------
-- submission — ETP/TR enviado pelo usuário
-- ----------------------------------------------------------------------------
create table alpha.submission (
	id           uuid primary key default gen_random_uuid(),
	user_id      uuid not null,
	filename     text not null,
	mime_type    text not null,
	storage_path text not null,
	doc_kind     text not null,
	modalidade   text,
	objeto       text,
	created_at   timestamptz not null default now(),
	constraint submission_doc_kind_check check (doc_kind in ('ETP', 'TR', 'EDITAL')),
	constraint submission_objeto_check   check (objeto is null or objeto in ('COMPRAS', 'SERVICOS', 'OBRAS', 'TIC'))
);

create index submission_user_ix on alpha.submission (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- extraction — JSON canônico + spans de origem
-- ----------------------------------------------------------------------------
create table alpha.extraction (
	id            uuid primary key default gen_random_uuid(),
	submission_id uuid not null references alpha.submission(id) on delete cascade,
	payload       jsonb not null,
	spans         jsonb not null default '{}'::jsonb,   -- {campo: {start,end,page}}
	model         text not null,
	created_at    timestamptz not null default now()
);

create index extraction_submission_ix on alpha.extraction (submission_id, created_at desc);

-- ----------------------------------------------------------------------------
-- compliance_run — execução auditável (grava as versões usadas)
-- ----------------------------------------------------------------------------
create table alpha.compliance_run (
	id                 uuid primary key default gen_random_uuid(),
	submission_id      uuid not null references alpha.submission(id) on delete cascade,
	extraction_id      uuid not null references alpha.extraction(id) on delete restrict,
	model_document_id  uuid references alpha.document(id) on delete restrict,
	law_document_ids   uuid[] not null default '{}',
	status             text not null default 'running',
	rules_applied      int not null default 0,
	rules_not_assessed int not null default 0,
	discarded_findings int not null default 0,
	started_at         timestamptz not null default now(),
	finished_at        timestamptz,
	constraint compliance_run_status_check check (status in ('running', 'succeeded', 'failed'))
);

create index compliance_run_submission_ix on alpha.compliance_run (submission_id, started_at desc);

-- ----------------------------------------------------------------------------
-- compliance_finding — achado acionável
-- ----------------------------------------------------------------------------
create table alpha.compliance_finding (
	id            uuid primary key default gen_random_uuid(),
	run_id        uuid not null references alpha.compliance_run(id) on delete cascade,
	rule_id       uuid references alpha.checklist_rule(id) on delete set null,
	category      text not null,
	status        text not null,
	severity      text not null,
	section_path  text,
	message       text not null,
	legal_ref     jsonb not null default '[]'::jsonb,
	suggestion    text,
	evidence_span jsonb,
	confidence    numeric(4, 3),
	created_at    timestamptz not null default now(),
	constraint compliance_finding_category_check check (category in ('ESTRUTURAL', 'CONTEUDO', 'CRUZADA')),
	constraint compliance_finding_status_check   check (status in ('MISSING', 'EXTRA', 'OUT_OF_ORDER', 'RENAMED', 'INCONFORME')),
	constraint compliance_finding_severity_check check (severity in ('BLOQUEANTE', 'GRAVE', 'MEDIA', 'INFORMATIVA'))
);

create index compliance_finding_run_ix on alpha.compliance_finding (run_id, severity);

-- ----------------------------------------------------------------------------
-- query_log — telemetria das consultas do grafo
-- ----------------------------------------------------------------------------
create table alpha.query_log (
	id                   uuid primary key default gen_random_uuid(),
	session_id           uuid not null,
	user_id              uuid,
	original_query       text not null,
	reformulated_query   text,
	intent               text,
	termination_reason   text not null,
	retrieval_iterations int not null default 0,
	grading_retries      int not null default 0,
	cited_documents      uuid[] not null default '{}',
	latency_ms           int,
	langsmith_run_id     text,
	created_at           timestamptz not null default now()
);

create index query_log_session_ix on alpha.query_log (session_id, created_at desc);
create index query_log_user_ix    on alpha.query_log (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RPCs de busca híbrida — só versão vigente
-- ----------------------------------------------------------------------------
create or replace function alpha.match_chunks_cosine(
	query_embedding extensions.vector(1024),
	match_count int default 10
)
returns table (
	id uuid,
	document_id uuid,
	content text,
	chapter text,
	article text,
	section text,
	document_type text,
	source text,
	year int,
	similarity double precision
)
language sql
stable
set search_path = ''
as $$
	select
		c.id,
		c.document_id,
		c.content,
		c.chapter,
		c.article,
		c.section,
		d.document_type,
		d.source,
		d.year,
		1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
	from alpha.document_chunk c
	join alpha.document d on d.id = c.document_id
	where c.is_current
	  and c.embedding is not null
	order by c.embedding operator(extensions.<=>) query_embedding
	limit match_count;
$$;

create or replace function alpha.match_chunks_fts(
	query_text text,
	match_count int default 10
)
returns table (
	id uuid,
	document_id uuid,
	content text,
	chapter text,
	article text,
	section text,
	document_type text,
	source text,
	year int,
	rank double precision
)
language sql
stable
set search_path = ''
as $$
	select
		c.id,
		c.document_id,
		c.content,
		c.chapter,
		c.article,
		c.section,
		d.document_type,
		d.source,
		d.year,
		ts_rank(c.fts, websearch_to_tsquery('portuguese', query_text))::double precision as rank
	from alpha.document_chunk c
	join alpha.document d on d.id = c.document_id
	where c.is_current
	  and c.fts @@ websearch_to_tsquery('portuguese', query_text)
	order by rank desc
	limit match_count;
$$;

-- ----------------------------------------------------------------------------
-- RLS — negação por padrão; só service_role acessa (e bypassa RLS)
-- ----------------------------------------------------------------------------
alter table alpha.normative_source   enable row level security;
alter table alpha.document           enable row level security;
alter table alpha.document_chunk     enable row level security;
alter table alpha.structure_node     enable row level security;
alter table alpha.explanatory_note   enable row level security;
alter table alpha.placeholder        enable row level security;
alter table alpha.checklist_rule     enable row level security;
alter table alpha.submission         enable row level security;
alter table alpha.extraction         enable row level security;
alter table alpha.compliance_run     enable row level security;
alter table alpha.compliance_finding enable row level security;
alter table alpha.query_log          enable row level security;

grant all on all tables in schema alpha to service_role;
grant usage, select on all sequences in schema alpha to service_role;
grant execute on all functions in schema alpha to service_role;

alter default privileges in schema alpha grant all on tables to service_role;
alter default privileges in schema alpha grant usage, select on sequences to service_role;
alter default privileges in schema alpha grant execute on functions to service_role;

-- ----------------------------------------------------------------------------
-- Seed do registry — fontes desabilitadas até a validação de cada adapter
-- ----------------------------------------------------------------------------
-- Só as fontes com URL confirmada entram aqui. Decretos regulamentadores e as
-- demais INs SEGES entram na PR D, depois de conferida a URN de cada uma.
insert into alpha.normative_source (id, authority, kind, base_url, cadence, enabled) values
	('agu-modelos-14133', 'AGU',      'MODELO',      'https://www.gov.br/agu/pt-br/composicao/cgu/cgu/modelos/licitacoesecontratos/14133', 'monthly', false),
	('lei-14133',         'SENADO',   'LEI',         'urn:lex:br:federal:lei:2021-04-01;14133',                                            'weekly',  false),
	('in-seges-65-2021',  'SEGES',    'REGULAMENTO', 'urn:lex:br:ministerio.economia:instrucao.normativa:2021-07-07;65',                   'weekly',  false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- PostgREST — expor o schema novo e recarregar
-- ----------------------------------------------------------------------------
alter role authenticator set pgrst.db_schemas to 'public, graphql_public, sisub, iefa, journal, forms, rumaer, core, access_control, kitchen, procurement, finance, compras_gov_integration, inventory, siafi_integration, gs1_integration, nutrition_reference, assignment_selection, sucont, alpha';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
