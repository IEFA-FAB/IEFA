#!/usr/bin/env bash
# ============================================================================
# migrate-alpha-corpus.sh — migração única do corpus do Projeto α, do projeto
# Supabase antigo para o schema `alpha` do projeto do sisub.
#
# Por que existe: o corpus do RADA já indexado (documentos + chunks + embeddings)
# NÃO é reingerível — o acesso ao RADA está indisponível. É a única razão pela
# qual o projeto antigo ainda precisa ser aberto uma vez.
#
# Depois desta migração o projeto antigo é **descontinuado**: o α passa a usar
# exclusivamente o projeto do sisub, com os mesmos secrets
# (ver .github/workflows/sync-secrets.yml).
#
# Uso:
#   ALPHA_LEGACY_DATABASE_URL=postgresql://...  # projeto antigo (fjnysdiusivrffprcdus)
#   ALPHA_TARGET_DATABASE_URL=postgresql://...  # projeto do sisub (jgigqdpdjgnnuwajtayh)
#   bash scripts/migrate-alpha-corpus.sh preflight   # só inspeciona, não escreve
#   bash scripts/migrate-alpha-corpus.sh migrate     # migra e confere
#
# Pré-requisito: a migration 20260730120000_create_alpha_schema.sql já aplicada
# no destino. Nenhuma escrita pode ocorrer no projeto antigo durante a migração —
# o que entrar nele depois deste ponto se perde.
# ============================================================================
set -euo pipefail

MODE="${1:-preflight}"

: "${ALPHA_LEGACY_DATABASE_URL:?defina ALPHA_LEGACY_DATABASE_URL}"
: "${ALPHA_TARGET_DATABASE_URL:?defina ALPHA_TARGET_DATABASE_URL}"

# Listas de colunas. CONFERIR contra a saída do preflight antes de rodar `copy`:
# o schema antigo foi aplicado à mão e pode divergir do que está aqui.
DOC_COLS="id,title,document_type,source,year,raw_content,created_at"
CHUNK_COLS="id,document_id,content,chapter,article,section,chunk_index,token_count,metadata,embedding"
LOG_COLS="id,session_id,user_id,original_query,reformulated_query,intent,termination_reason,retrieval_iterations,grading_retries,cited_documents,latency_ms,langsmith_run_id,created_at"

count() { psql "$1" -tAc "select count(*) from $2"; }

preflight() {
	echo "── Schema do projeto antigo ──────────────────────────────────────────"
	psql "$ALPHA_LEGACY_DATABASE_URL" -c "\d public.documents"
	psql "$ALPHA_LEGACY_DATABASE_URL" -c "\d public.document_chunks"
	psql "$ALPHA_LEGACY_DATABASE_URL" -c "\d public.query_logs"

	echo ""
	echo "── Contagens na origem ───────────────────────────────────────────────"
	echo "documents       : $(count "$ALPHA_LEGACY_DATABASE_URL" public.documents)"
	echo "document_chunks : $(count "$ALPHA_LEGACY_DATABASE_URL" public.document_chunks)"
	echo "query_logs      : $(count "$ALPHA_LEGACY_DATABASE_URL" public.query_logs)"
	echo "chunks sem embedding: $(psql "$ALPHA_LEGACY_DATABASE_URL" -tAc 'select count(*) from public.document_chunks where embedding is null')"

	echo ""
	echo "── Contagens no destino (esperado: zero antes da primeira cópia) ─────"
	echo "alpha.document       : $(count "$ALPHA_TARGET_DATABASE_URL" alpha.document)"
	echo "alpha.document_chunk : $(count "$ALPHA_TARGET_DATABASE_URL" alpha.document_chunk)"
	echo "alpha.query_log      : $(count "$ALPHA_TARGET_DATABASE_URL" alpha.query_log)"

	echo ""
	echo "Confira as listas de coluna no topo deste script contra os \\d acima."
	echo "Se baterem, rode: bash scripts/migrate-alpha-corpus.sh migrate"
}

copy_table() {
	local src_table="$1" src_cols="$2" dst_table="$3" dst_cols="$4"
	echo "→ $src_table → $dst_table"
	psql "$ALPHA_LEGACY_DATABASE_URL" \
		-c "\copy (select $src_cols from $src_table) to stdout with (format csv)" \
	| psql "$ALPHA_TARGET_DATABASE_URL" \
		-c "\copy $dst_table ($dst_cols) from stdin with (format csv)"
}

do_copy() {
	local src_docs src_chunks src_logs dst_docs dst_chunks dst_logs

	src_docs=$(count "$ALPHA_LEGACY_DATABASE_URL" public.documents)
	src_chunks=$(count "$ALPHA_LEGACY_DATABASE_URL" public.document_chunks)
	src_logs=$(count "$ALPHA_LEGACY_DATABASE_URL" public.query_logs)

	# document antes de document_chunk — FK. O trigger BEFORE INSERT do destino
	# preenche is_current a partir de document.superseded_at (nulo no legado).
	copy_table public.documents       "$DOC_COLS"   alpha.document       "$DOC_COLS"
	copy_table public.document_chunks "$CHUNK_COLS" alpha.document_chunk "$CHUNK_COLS"
	copy_table public.query_logs      "$LOG_COLS"   alpha.query_log      "$LOG_COLS"

	dst_docs=$(count "$ALPHA_TARGET_DATABASE_URL" alpha.document)
	dst_chunks=$(count "$ALPHA_TARGET_DATABASE_URL" alpha.document_chunk)
	dst_logs=$(count "$ALPHA_TARGET_DATABASE_URL" alpha.query_log)

	echo ""
	echo "── Conferência ───────────────────────────────────────────────────────"
	printf "document       origem=%s destino=%s\n" "$src_docs"   "$dst_docs"
	printf "document_chunk origem=%s destino=%s\n" "$src_chunks" "$dst_chunks"
	printf "query_log      origem=%s destino=%s\n" "$src_logs"   "$dst_logs"

	if [[ "$src_docs" != "$dst_docs" || "$src_chunks" != "$dst_chunks" ]]; then
		echo "❌ contagem divergente — NÃO trocar os secrets do deploy nem desativar o projeto antigo"
		exit 1
	fi

	local null_emb
	null_emb=$(psql "$ALPHA_TARGET_DATABASE_URL" -tAc 'select count(*) from alpha.document_chunk where embedding is null')
	echo "chunks sem embedding no destino: $null_emb"

	local not_current
	not_current=$(psql "$ALPHA_TARGET_DATABASE_URL" -tAc 'select count(*) from alpha.document_chunk where not is_current')
	if [[ "$not_current" != "0" ]]; then
		echo "❌ há chunks com is_current = false após a carga — trigger não aplicou"
		exit 1
	fi

	echo "✅ corpus migrado e conferido"
	echo "   Próximo passo: sincronizar os secrets do alpha (que agora herdam os do"
	echo "   sisub) e, confirmado o α no ar, desativar o projeto Supabase antigo."
}

case "$MODE" in
	preflight) preflight ;;
	migrate)   do_copy ;;
	*) echo "uso: $0 [preflight|migrate]"; exit 1 ;;
esac
