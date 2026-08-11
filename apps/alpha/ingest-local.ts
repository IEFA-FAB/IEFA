#!/usr/bin/env bun
/**
 * Ingestão de um arquivo Markdown no corpus do α.
 *
 *   bun run ingest knowledge/RADA-2023.md
 *   bun run ingest:all                      # todos os .md de knowledge/
 *
 * Este é o **único** caminho de reconstrução do corpus do RADA. O projeto
 * Supabase antigo do α foi apagado em 2026-07-31 com o corpus indexado dentro,
 * e não há backup — o que estiver em `knowledge/` é o que existe.
 *
 * O script vivia em `plans/alpha/` e não no app, então `bun run ingest` estava
 * quebrado; foi trazido para cá justamente porque virou caminho crítico.
 */

import { ingestMarkdown } from "./src/ingest/markdown-ingest.ts"

const filePath = process.argv[2]

if (!filePath) {
	console.error("❌  Forneça o caminho do arquivo Markdown como argumento.")
	console.error("    Uso: bun run ingest <arquivo.md>")
	process.exit(1)
}

const start = Date.now()
console.info(`\n📄 Ingerindo: ${filePath}`)

try {
	const result = await ingestMarkdown(filePath)
	const elapsed = ((Date.now() - start) / 1000).toFixed(1)

	console.info(`✅ Concluído em ${elapsed}s`)
	console.info(`   chunks criados : ${result.chunks_created}`)
	console.info(`   chunks pulados : ${result.chunks_skipped}`)
} catch (error) {
	console.error("❌ Erro ao ingerir documento:")
	console.error(error)
	process.exit(1)
}
