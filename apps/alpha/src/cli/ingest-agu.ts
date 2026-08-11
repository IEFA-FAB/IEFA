#!/usr/bin/env bun
/**
 * Ingestão dos modelos da AGU.
 *
 *   bun run ingest:agu              # dry-run: mostra o que aconteceria
 *   bun run ingest:agu --apply      # grava
 *   bun run ingest:agu --limit 3    # útil para calibrar sem baixar tudo
 *
 * Dry-run é o padrão de propósito: a ingestão marca versões como superseded, e
 * uma mudança de estrutura no site da AGU seria destrutiva se aplicada às cegas.
 */

import { embedDocuments } from "../sources/embeddings.ts"
import { ingestSource } from "../sources/pipeline.ts"
import { getSource, resolveAdapter } from "../sources/registry.ts"

const SOURCE_ID = "agu-modelos-14133"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const limitIndex = args.indexOf("--limit")
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : undefined
const skipEmbeddings = args.includes("--skip-embeddings")

const source = await getSource(SOURCE_ID)
if (!source) {
	console.error(`❌ fonte '${SOURCE_ID}' não existe em alpha.normative_source`)
	process.exit(1)
}

console.info(`📚 ${source.id} — ${source.base_url}`)
console.info(apply ? "   modo: APLICANDO alterações" : "   modo: dry-run (use --apply para gravar)")
if (skipEmbeddings) {
	console.warn("   ⚠️  --skip-embeddings: estrutura sem chunk. Os modelos NÃO ficam pesquisáveis.")
}
if (!source.enabled && apply) {
	console.warn("   ⚠️  fonte está com enabled = false no registry")
}

const report = await ingestSource({
	sourceId: source.id,
	adapter: resolveAdapter(source),
	embed: embedDocuments,
	apply,
	limit,
	skipEmbeddings,
})

const byOutcome = {
	created: report.items.filter((item) => item.outcome === "created").length,
	superseded: report.items.filter((item) => item.outcome === "superseded").length,
	unchanged: report.items.filter((item) => item.outcome === "unchanged").length,
	failed: report.items.filter((item) => item.outcome === "failed").length,
}

console.info(`\n🔎 descobertos: ${report.discovered} | processados: ${report.items.length}`)
for (const item of report.items) {
	const icon = { created: "🆕", superseded: "🔁", unchanged: "⏭️ ", failed: "❌" }[item.outcome]
	console.info(`${icon} [${item.version_label}] ${item.title}`)
	console.info(`     seções=${item.nodes} notas=${item.notes} regras=${item.seeded_rules} chunks=${item.chunks}${item.error ? ` erro=${item.error}` : ""}`)
}

console.info(`\n✅ novos=${byOutcome.created} atualizados=${byOutcome.superseded} sem mudança=${byOutcome.unchanged} com erro=${byOutcome.failed}`)

if (byOutcome.failed > 0) process.exit(1)
