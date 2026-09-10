-- ============================================================================
-- Filtro de corpus DENTRO da RPC de recuperação.
--
-- `alpha.document` guarda dois corpora na mesma tabela: a legislação aeronáutica
-- (RADA-e e afins) e a federal de contratações. O `radaRetriever` já escolhia o
-- corpus, mas o filtro era aplicado POR FORA, pelo PostgREST, sobre o resultado
-- que estas funções já haviam ordenado e cortado com `limit match_count`. O
-- `set search_path = ''` impede o inlining, então não havia como o planejador
-- empurrar o predicado para dentro.
--
-- Consequência medida em 2026-09-10, com os dois corpora povoados (55% aeronáutico,
-- 45% federal): uma pergunta sobre o RADA buscava as 50 melhores linhas GLOBAIS e
-- ficava com 21 depois da poda. O melhor dispositivo aeronáutico além da posição 50
-- global era invisível — sem erro, sem sinal.
--
-- Com o parâmetro, o corte passa a ser sobre o corpus certo. `null` mantém o
-- comportamento antigo (todos os corpora), que é o que o verificador de
-- conformidade usa quando quer a legislação federal inteira.
--
-- DROP + CREATE em vez de `create or replace`: acrescentar parâmetro muda a
-- assinatura, e o `create or replace` criaria uma SOBRECARGA. O PostgREST resolve
-- função por nome e argumentos nomeados; com duas assinaturas ele fica ambíguo e
-- responde 300 (Multiple Choices) para a chamada sem o parâmetro novo.
-- ============================================================================

-- Derruba TODAS as assinaturas, inclusive a legada de 2 argumentos.
--
-- `20260811190000` criou a versão com `embedding_model_filter` por `create or replace`,
-- que com assinatura diferente NÃO substitui: cria sobrecarga. A de 2 argumentos ficou no
-- banco, sem o filtro de modelo — chamável, e devolvendo vetor de qualquer modelo. Era
-- justamente a "distância sem significado" que aquela migration foi escrita para impedir,
-- ainda alcançável por quem chamasse a RPC sem o terceiro argumento.
drop function if exists alpha.match_chunks_cosine(extensions.vector, int);
drop function if exists alpha.match_chunks_cosine(extensions.vector, int, text);
drop function if exists alpha.match_chunks_fts(text, int);

create function alpha.match_chunks_cosine(
	query_embedding extensions.vector(1024),
	match_count int default 10,
	embedding_model_filter text default null,
	document_types text[] default null
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
	  and (document_types is null or d.document_type = any(document_types))
	order by c.embedding operator(extensions.<=>) query_embedding
	limit match_count;
$$;

create function alpha.match_chunks_fts(
	query_text text,
	match_count int default 10,
	document_types text[] default null
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
	  and (document_types is null or d.document_type = any(document_types))
	order by rank desc
	limit match_count;
$$;

comment on function alpha.match_chunks_cosine(extensions.vector, int, text, text[]) is
	'Busca semantica. `document_types` escopa o corpus ANTES do limite; nulo = todos.';
comment on function alpha.match_chunks_fts(text, int, text[]) is
	'Busca full-text. `document_types` escopa o corpus ANTES do limite; nulo = todos.';

grant execute on function alpha.match_chunks_cosine(extensions.vector, int, text, text[]) to service_role;
grant execute on function alpha.match_chunks_fts(text, int, text[]) to service_role;
