#!/usr/bin/env bun
/**
 * Preenche o vetor dos chunks que estão sem embedding.
 *
 *   bun run embed:backfill            # dry-run: conta o que falta
 *   bun run embed:backfill --apply    # gera e grava
 *
 * Existe porque a ingestão grava o chunk mesmo quando o embedder está fora do
 * ar — a busca por palavra-chave segue valendo e o corpus não fica pela metade.
 * Quando o embedder volta, isto completa o que faltou sem reingerir, o que
 * importa porque documento referenciado por um parecer não pode ser apagado
 * (a FK de `compliance_run` impede, de propósito).
 *
 * Só toca em chunk sem vetor **ou** com vetor de outro modelo: trocar de modelo
 * de embedding invalida os vetores antigos, já que espaços vetoriais diferentes
 * não são comparáveis.
 */

import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"
import { embeddingError, embeddingModelId, getEmbeddings } from "../lib/embeddings.ts"

const apply = process.argv.includes("--apply")
const modelId = embeddingModelId()

const { count, error: countError } = await supabase
	.from("document_chunk")
	.select("id", { count: "exact", head: true })
	.or(`embedding.is.null,embedding_model.neq.${modelId}`)

if (countError) {
	console.error("❌ consulta falhou:", countError.message)
	process.exit(1)
}

console.info(`\n🔢 modelo corrente: ${modelId}`)
console.info(`   chunks a preencher: ${count ?? 0}`)

if (!apply) {
	console.info("   modo: dry-run (use --apply para gravar)\n")
	process.exit(0)
}

const embeddings = getEmbeddings()
let processed = 0
let failed = 0

while (true) {
	const { data: batch, error } = await supabase
		.from("document_chunk")
		.select("id, content")
		.or(`embedding.is.null,embedding_model.neq.${modelId}`)
		.limit(env.EMB_BATCH_SIZE)

	if (error) {
		console.error("❌ leitura falhou:", error.message)
		break
	}
	if (!batch || batch.length === 0) break

	try {
		const vectors = await embeddings.embedDocuments(batch.map((chunk: { content: string }) => chunk.content))

		for (const [index, chunk] of (batch as Array<{ id: string }>).entries()) {
			const { error: updateError } = await supabase.from("document_chunk").update({ embedding: vectors[index], embedding_model: modelId }).eq("id", chunk.id)

			if (updateError) {
				failed += 1
				console.error(`   ❌ chunk ${chunk.id}: ${updateError.message}`)
			} else {
				processed += 1
			}
		}

		console.info(`   ${processed} preenchidos…`)
	} catch (error) {
		console.error(`❌ ${embeddingError(error).message}`)
		process.exit(1)
	}
}

console.info(`\n✅ ${processed} chunk(s) com vetor${failed > 0 ? `, ${failed} com erro` : ""}\n`)
