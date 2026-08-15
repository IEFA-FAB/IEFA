import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"
import type { SupabaseClient } from "@supabase/supabase-js"
import { envServer } from "./env.server"

const url = () => envServer.VITE_IEFA_SUPABASE_URL
const secretKey = () => envServer.IEFA_SUPABASE_SECRET_KEY

/**
 * DÍVIDA: os clients do portal são devolvidos SEM os tipos do `Database`, como
 * eram antes de passarem pelo kit. As server functions do journal
 * (`journal-data.fn.ts`, `journal.fn.ts`) foram escritas contra um client `any` e
 * acendem ~25 erros de shape reais assim que o tipo aparece — inserts com
 * `Record<string, unknown>`, colunas que faltam, retorno `unknown` vazando para as
 * rotas. Corrigir isso é trabalho do domínio do journal, não deste refactor de
 * infraestrutura; tipar aqui sem corrigir lá só trocaria o `any` por `as any`
 * espalhado. Ao mexer no journal, remova este cast primeiro e siga os erros.
 */
type UntypedClient = SupabaseClient

/**
 * Cliente Supabase com service role para o schema "journal" (submissões,
 * pareceres e fluxo editorial). Bypass de RLS — use apenas em server functions
 * (*.fn.ts). Nunca importe em código client-side.
 */
export function getJournalServerClient(): UntypedClient {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "journal" }) as unknown as UntypedClient
}

/**
 * Cliente Supabase com service role para o schema "iefa" (apps da suíte,
 * facilidades e favoritos do portal).
 */
export function getPortalServerClient(): UntypedClient {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "iefa" }) as unknown as UntypedClient
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão do usuário — necessário para
 * auth.getUser() / auth.getSession() funcionarem no servidor.
 *
 * Use APENAS em auth.fn.ts. Para queries de dados, use getJournalServerClient().
 */
export function getIefaAuthClient() {
	return createSsrAuthClient({ url: url(), key: envServer.IEFA_SUPABASE_SECRET_KEY })
}
