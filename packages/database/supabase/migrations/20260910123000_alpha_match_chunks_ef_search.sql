-- ============================================================================
-- `ef_search` alto na busca semântica, para o filtro de corpus não zerar o resultado.
--
-- Com `order by embedding <=> $1 limit N` MAIS um predicado, o HNSW colhe os candidatos do
-- `ef_search` (40, por padrão) e SÓ ENTÃO aplica o filtro. Corpus pequeno desaparece: os
-- 459 chunks de LEI/DECRETO/IN_SEGES são ~10% da base, não entram entre os 40 primeiros
-- globais, e a função devolvia ZERO linha — sem erro e sem sinal, que é o pior desfecho.
--
-- Medido nesta base: com o padrão, `document_types => array['LEI','DECRETO','IN_SEGES']`
-- devolvia 0; com 400 devolve 10, e até `array['IN_SEGES']` (15 chunks, 0,3% da base)
-- devolve 10.
--
-- Por que `plpgsql` e `set_config` em vez da cláusula `SET` da função: o papel do Supabase
-- não tem permissão para definir `hnsw.*` na cláusula `SET` nem em `alter role`
-- (`42501: permission denied to set parameter`), mas `set_config(..., is_local => true)`
-- passa. `is_local` limita o efeito à transação corrente.
--
-- O remédio melhor seria `hnsw.iterative_scan = 'relaxed_order'` (pgvector 0.8), que faz o
-- índice seguir entregando candidatos até satisfazer o limite — barrado pela mesma falta de
-- permissão. Com ~4,4 mil chunks o `ef_search` largo é quase exaustivo e custa pouco; se o
-- corpus crescer uma ordem de grandeza, reavaliar. Sintoma a vigiar: busca filtrada
-- devolvendo menos linhas que o `match_count` pedido.
-- ============================================================================

drop function if exists alpha.match_chunks_cosine(extensions.vector, int, text, text[]);

create function alpha.match_chunks_cosine(
	query_embedding extensions.vector(1024),
	match_count int default 10,
	embedding_model_filter text default null,
	document_types text[] default null
)
returns table (
	id uuid, document_id uuid, content text, chapter text, article text, section text,
	document_type text, source text, year int, similarity double precision
)
language plpgsql stable
set search_path = ''
as $$
begin
	perform set_config('hnsw.ef_search', '400', true);

	return query
	select c.id, c.document_id, c.content, c.chapter, c.article, c.section,
		d.document_type, d.source, d.year,
		1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
	from alpha.document_chunk c
	join alpha.document d on d.id = c.document_id
	where c.is_current
	  and c.embedding is not null
	  and (embedding_model_filter is null or c.embedding_model = embedding_model_filter)
	  and (document_types is null or d.document_type = any(document_types))
	order by c.embedding operator(extensions.<=>) query_embedding
	limit match_count;
end;
$$;

comment on function alpha.match_chunks_cosine(extensions.vector, int, text, text[]) is
	'Busca semantica. `document_types` escopa o corpus ANTES do limite; nulo = todos. `ef_search` alto no corpo para corpus pequeno nao sumir atras do filtro.';

grant execute on function alpha.match_chunks_cosine(extensions.vector, int, text, text[]) to service_role;
