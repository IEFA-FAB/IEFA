import type { Database } from "@iefa/database"
import { createServiceRoleClient } from "@iefa/supabase-kit"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Credenciais do projeto Supabase. Cada app usa nomes de env diferentes
 * (`VITE_SISUB_*`, `VITE_IEFA_*`, `VITE_RUMAER_*`…) apontando para o MESMO
 * projeto — por isso o package recebe os valores, não os lê do `process.env`.
 */
export type LegalConnection = {
	url: string
	secretKey: string
}

export type LegalClient = SupabaseClient<Database, "iefa">

/**
 * Client service-role no schema `iefa`, onde vivem `legal_documents` e
 * `user_legal_acceptances`.
 *
 * Service role porque as duas tabelas têm RLS habilitada e nenhuma policy: sem
 * bypass, a leitura do documento público voltaria vazia e a página renderizaria
 * "documento não encontrado" — um estado vazio que mente sobre falha. A
 * autorização de escrita é feita aqui na camada de app (o `userId` vem sempre da
 * sessão validada no servidor, nunca do input do cliente).
 */
export function createLegalClient({ url, secretKey }: LegalConnection): LegalClient {
	return createServiceRoleClient({ url, secretKey, schema: "iefa" })
}
