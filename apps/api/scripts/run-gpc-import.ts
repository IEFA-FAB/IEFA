/**
 * Import da publicação GPC via CLI: `bun run sync:gpc [url]`.
 * Sem argumento, usa GS1_GPC_PUBLICATION_URL.
 */
import { createClient } from "@supabase/supabase-js"
import { importGpc } from "../src/workers/gs1-sync/gpc.ts"

const url = process.argv[2] ?? process.env.GS1_GPC_PUBLICATION_URL
if (!url) {
	console.error("Uso: bun run sync:gpc <url-da-publicacao-json>  (ou defina GS1_GPC_PUBLICATION_URL)")
	process.exit(1)
}

const supabaseUrl = process.env.API_SUPABASE_URL
const serviceKey = process.env.API_SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
	console.error("API_SUPABASE_URL e API_SUPABASE_SERVICE_ROLE_KEY são obrigatórios")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
	db: { schema: "gs1_integration" },
	auth: { persistSession: false },
})

const bricks = await importGpc(supabase, url)
console.log(`GPC import concluído: ${bricks} bricks`)
