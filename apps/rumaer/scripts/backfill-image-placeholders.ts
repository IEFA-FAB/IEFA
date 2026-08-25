#!/usr/bin/env bun
/**
 * Backfill dos LQIP (`blur_placeholder`) das ilustrações de uniforme.
 *
 * A geração automática só cobre imagem enviada DEPOIS da migration
 * `20260825120000_rumaer_image_blur_placeholder`. O catálogo já publicado precisa
 * deste passo, senão a prévia borrada existe só para uniforme novo e o acervo antigo
 * — que é a maior parte do que as pessoas abrem — continua com a caixa vazia.
 *
 * Idempotente: só toca linha com imagem e sem placeholder. Rodar de novo depois de
 * subir imagem nova é seguro e barato.
 *
 * Uso:
 *   VITE_RUMAER_SUPABASE_URL=… RUMAER_SUPABASE_SECRET_KEY=… \
 *     bun apps/rumaer/scripts/backfill-image-placeholders.ts [--dry-run] [--limit N]
 */

import { createServiceRoleClient } from "@iefa/supabase-kit"
import { isPlaceholderDataUrl } from "../src/lib/image-placeholder"

const BUCKET = "rumaer-uniforms"

const url = process.env.VITE_RUMAER_SUPABASE_URL
const secretKey = process.env.RUMAER_SUPABASE_SECRET_KEY
if (!url || !secretKey) {
	console.error("Faltam VITE_RUMAER_SUPABASE_URL e/ou RUMAER_SUPABASE_SECRET_KEY.")
	process.exit(1)
}

const dryRun = process.argv.includes("--dry-run")
const limitArg = process.argv.indexOf("--limit")
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : undefined
if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
	console.error("--limit precisa de um inteiro positivo.")
	process.exit(1)
}

const supabase = createServiceRoleClient({ url, secretKey, schema: "rumaer" })

type Pending = { table: "uniform_variant" | "uniform_variant_image"; id: string; imagePath: string }

async function pendingRows(): Promise<Pending[]> {
	const [base, looks] = await Promise.all([
		supabase.from("uniform_variant").select("id, image_path").not("image_path", "is", null).is("blur_placeholder", null),
		supabase.from("uniform_variant_image").select("id, image_path").not("image_path", "is", null).is("blur_placeholder", null),
	])
	if (base.error) throw new Error(`uniform_variant: ${base.error.message}`)
	if (looks.error) throw new Error(`uniform_variant_image: ${looks.error.message}`)

	const rows: Pending[] = [
		...(base.data ?? []).map((r) => ({ table: "uniform_variant" as const, id: r.id, imagePath: r.image_path as string })),
		...(looks.data ?? []).map((r) => ({ table: "uniform_variant_image" as const, id: r.id, imagePath: r.image_path as string })),
	]
	return limit ? rows.slice(0, limit) : rows
}

/**
 * Cache por caminho: variantes de círculos diferentes reaproveitam o mesmo arquivo, e
 * sem isto o backfill baixaria a mesma imagem várias vezes.
 */
const byPath = new Map<string, string | null>()

async function placeholderFor(imagePath: string): Promise<string | null> {
	const cached = byPath.get(imagePath)
	if (cached !== undefined) return cached

	let result: string | null = null
	try {
		const { data, error } = await supabase.storage.from(BUCKET).download(imagePath)
		if (error || !data) throw new Error(error?.message ?? "download sem corpo")
		const placeholder = await new Bun.Image(await data.arrayBuffer()).placeholder()
		result = isPlaceholderDataUrl(placeholder) ? placeholder : null
		if (!result) console.warn(`  ⚠ ${imagePath}: placeholder fora do formato esperado (${placeholder.length} chars)`)
	} catch (e) {
		const code = e && typeof e === "object" && "code" in e ? String(e.code) : undefined
		console.warn(`  ⚠ ${imagePath}: ${code ?? (e instanceof Error ? e.message : String(e))}`)
	}
	byPath.set(imagePath, result)
	return result
}

const rows = await pendingRows()
console.log(`${rows.length} linha(s) sem placeholder${dryRun ? " (dry-run)" : ""}.`)

let ok = 0
let falhou = 0
for (const [i, row] of rows.entries()) {
	const placeholder = await placeholderFor(row.imagePath)
	if (!placeholder) {
		falhou++
		continue
	}
	if (!dryRun) {
		const { error } = await supabase.from(row.table).update({ blur_placeholder: placeholder }).eq("id", row.id)
		if (error) {
			console.warn(`  ⚠ ${row.table}/${row.id}: ${error.message}`)
			falhou++
			continue
		}
	}
	ok++
	if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${rows.length}`)
}

console.log(`\n✅ ${ok} gerado(s)${dryRun ? " (nada gravado)" : ""} · ${falhou} sem placeholder · ${byPath.size} arquivo(s) baixado(s).`)
// Falha aqui não é erro de execução: linha sem placeholder cai no estado de carregamento
// antigo. Sair com 0 mantém o script utilizável em rotina sem virar alarme falso.
