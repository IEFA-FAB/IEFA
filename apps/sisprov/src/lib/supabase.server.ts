import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"
import { envServer } from "./env.server"

const url = () => envServer.VITE_SISPROV_SUPABASE_URL
const secretKey = () => envServer.SISPROV_SUPABASE_SECRET_KEY

// Não há schema `sisprov`: o estoque de toda classe vive em `inventory`, o item em `core.item` e o
// perfil de cada classe no schema dela. O schema próprio de uma classe nova (fardamento) nasce com a
// primeira tabela, no change do catálogo (`openspec/changes/sisprov-foundation`, D13).

/**
 * Cliente service role apontando para o schema `access_control`: tabela `user_permissions`
 * compartilhada entre os apps do ERP. A autorização por módulo, nível e escopo é aplicada na
 * camada de app (`@iefa/pbac`), não por RLS. Use apenas em server functions (`*.fn.ts`).
 */
export function getAccessControlClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "access_control" })
}

/**
 * Cliente service role apontando para o schema `core`: unidades (OM, hierarquia de apoio) e a
 * identidade militar (`military_identity`, sem CPF nem nome completo). Leitura.
 */
export function getCoreReadClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "core" })
}

/**
 * Cliente Supabase SSR para autenticação: lê e escreve cookies de sessão, necessário para
 * `auth.getUser()` no servidor. Use APENAS em `auth.fn.ts` e nos gates.
 */
export function getSisprovAuthClient() {
	// Publishable key, NUNCA a service key: getUser() valida o JWT do cookie de qualquer forma,
	// e a service role faria uma query acidental por este client burlar a RLS.
	return createSsrAuthClient({ url: url(), key: envServer.VITE_SISPROV_SUPABASE_PUBLISHABLE_KEY })
}
