#!/usr/bin/env bash
# ingest-all.sh — Ingere todos os arquivos .md da pasta knowledge/
#
# Uso:
#   bash ingest-all.sh
#   bash ingest-all.sh knowledge/outro-diretorio   # pasta alternativa
set -euo pipefail

KNOWLEDGE_DIR="${1:-$(dirname "$0")/knowledge}"
SCRIPT_DIR="$(dirname "$0")"

if [[ ! -d "$KNOWLEDGE_DIR" ]]; then
  echo "❌  Pasta não encontrada: $KNOWLEDGE_DIR"
  exit 1
fi

mapfile -t FILES < <(find "$KNOWLEDGE_DIR" -name "*.md" | sort)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "⚠️  Nenhum arquivo .md encontrado em: $KNOWLEDGE_DIR"
  exit 0
fi

echo ""
echo "📚 Ingestão em lote — ${#FILES[@]} arquivo(s) encontrado(s)"
echo "   Pasta: $KNOWLEDGE_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_CREATED=0
TOTAL_SKIPPED=0
FAILED=0

for FILE in "${FILES[@]}"; do
  echo ""
  echo "📄 $(basename "$FILE")"

  # Captura stdout do bun para extrair os números
  OUTPUT=$(bun run "$SCRIPT_DIR/ingest-local.ts" "$FILE" 2>&1)
  EXIT_CODE=$?

  echo "$OUTPUT"

  if [[ $EXIT_CODE -ne 0 ]]; then
    FAILED=$((FAILED + 1))
    continue
  fi

  CREATED=$(echo "$OUTPUT" | grep "chunks criados" | grep -oP '\d+' || echo 0)
  SKIPPED=$(echo "$OUTPUT" | grep "chunks pulados" | grep -oP '\d+' || echo 0)
  TOTAL_CREATED=$((TOTAL_CREATED + CREATED))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + SKIPPED))
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Resumo final"
echo "   chunks criados  : $TOTAL_CREATED"
echo "   chunks pulados  : $TOTAL_SKIPPED"
[[ $FAILED -gt 0 ]] && echo "   ❌ com erro      : $FAILED"
echo ""
