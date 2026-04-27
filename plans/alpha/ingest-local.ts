#!/usr/bin/env bun
/**
 * ingest-local.ts — Ingestão pontual de um arquivo Markdown
 *
 * Uso:
 *   bun run ingest-local.ts <caminho/para/arquivo.md>
 *
 * Exemplo:
 *   bun run ingest-local.ts knowledge/RADA-2023.md
 */

import { ingestMarkdown } from "../../apps/alpha/src/ingest/markdown-ingest.ts"

const filePath = process.argv[2]

if (!filePath) {
	console.error("❌  Forneça o caminho do arquivo Markdown como argumento.")
	console.error("    Uso: bun run ingest-local.ts <arquivo.md>")
	process.exit(1)
}

const start = Date.now()
console.log(`\n📄 Ingerindo: ${filePath}`)

try {
	const result = await ingestMarkdown(filePath)
	const elapsed = ((Date.now() - start) / 1000).toFixed(1)

	console.log(`✅ Concluído em ${elapsed}s`)
	console.log(`   chunks criados : ${result.chunks_created}`)
	console.log(`   chunks pulados : ${result.chunks_skipped}`)
} catch (err) {
	console.error("❌ Erro ao ingerir documento:")
	console.error(err)
	process.exit(1)
}
