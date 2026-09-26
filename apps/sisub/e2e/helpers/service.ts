import { createServiceRoleClient } from "@iefa/supabase-kit"

/**
 * Cliente com a chave de SERVIÇO, só para preparar e limpar o que uma spec que escreve precisa
 * (cardápios de apoio/evento de teste na cozinha sentinela). A ação que se está testando é
 * sempre feita pela UI; isto só monta o cenário e desmonta depois. Mesmo factory dos apps
 * (`@iefa/supabase-kit`), com os deadlines de fetch.
 */
export function createE2EServiceClient() {
	const url = process.env.VITE_SISUB_SUPABASE_URL
	const secretKey = process.env.SISUB_SUPABASE_SECRET_KEY
	if (!url || !secretKey) throw new Error("E2E de escrita precisa de VITE_SISUB_SUPABASE_URL e SISUB_SUPABASE_SECRET_KEY (bun run env:pull sisub)")
	return createServiceRoleClient({ url, secretKey, schema: "kitchen" })
}

/** yyyy-MM-dd no fuso de Brasília — o "hoje" que a cozinha vê. */
export function isoDate(offsetDays = 0): string {
	const now = new Date(Date.now() + offsetDays * 86_400_000)
	return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now)
}
