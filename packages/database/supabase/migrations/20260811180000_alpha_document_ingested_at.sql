-- ============================================================================
-- ALPHA — marca de ingestão concluída
-- ============================================================================
-- Bug encontrado na primeira ingestão real: `persist` grava documento, seções e
-- regras e só depois gera os embeddings. Sem transação (o cliente PostgREST não
-- oferece uma), uma falha na etapa de embedding deixava o documento gravado sem
-- nenhum chunk — e a execução seguinte, ao comparar `content_hash`, o via como
-- "sem mudança" e pulava. O documento ficava permanentemente meio-ingerido e
-- invisível para a busca.
--
-- `ingested_at` fecha isso: só documento com a marca conta como versão vigente.
-- O que estiver sem marca é lixo de execução interrompida e é apagado antes de
-- reingerir (as FKs em cascata levam seções, notas e chunks junto).
-- ============================================================================

alter table alpha.document add column if not exists ingested_at timestamptz;

-- Documentos já gravados por execução interrompida: sem chunk, sem marca.
update alpha.document
set ingested_at = created_at
where ingested_at is null
  and exists (select 1 from alpha.document_chunk c where c.document_id = alpha.document.id);

-- O índice de versão vigente passa a exigir ingestão concluída.
drop index if exists alpha.document_current_version_uk;
create unique index document_current_version_uk
	on alpha.document (source_id, external_id)
	where source_id is not null and superseded_at is null and ingested_at is not null;

comment on column alpha.document.ingested_at is
	'Marca de ingestão concluída. Nulo = execução interrompida; a linha é descartável e não conta como versão vigente.';
