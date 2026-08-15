-- ============================================================================
-- ALPHA — identidade do modelo de embedding por chunk
-- ============================================================================
-- Vetores de modelos diferentes vivem em espaços diferentes. Compará-los não
-- dá erro: dá distância sem significado. A busca continua respondendo, só que
-- com resultado arbitrário — o pior tipo de falha para um verificador jurídico.
--
-- `embedding_model` grava quem gerou cada vetor, e a RPC semântica só considera
-- chunks do modelo em uso. Trocar de modelo passa a ser uma decisão explícita
-- que exige reingestão, em vez de degradar a busca em silêncio.
-- ============================================================================

alter table alpha.document_chunk add column if not exists embedding_model text;

comment on column alpha.document_chunk.embedding_model is
	'Provedor:modelo que gerou o vetor (ex.: bedrock:amazon.titan-embed-text-v2:0). Nulo = chunk sem vetor, recuperável só por full-text.';

create index if not exists document_chunk_embedding_model_ix
	on alpha.document_chunk (embedding_model)
	where embedding_model is not null;

-- A RPC semântica passa a exigir o modelo corrente.
create or replace function alpha.match_chunks_cosine(
	query_embedding extensions.vector(1024),
	match_count int default 10,
	embedding_model_filter text default null
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
	  and (embedding_model_filter is null or c.embedding_model = embedding_model_filter)
	order by c.embedding operator(extensions.<=>) query_embedding
	limit match_count;
$$;

grant execute on function alpha.match_chunks_cosine(extensions.vector, int, text) to service_role;
