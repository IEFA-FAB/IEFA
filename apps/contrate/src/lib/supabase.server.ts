import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"
import { envServer } from "./env.server"

const url = () => envServer.VITE_IEFA_SUPABASE_URL
const secretKey = () => envServer.IEFA_SUPABASE_SECRET_KEY

/**
 * Service role no schema `iefa` — frases e preferências do pregoeiro.
 * Bypass de RLS: só em server functions, e o dono vem sempre da sessão.
 */
export function getIefaServerClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "iefa" })
}

/**
 * Service role no schema `access_control` — resolução do PBAC e gestão dos grants dos
 * papéis do α (`alpha-requester`, `alpha-procurement`, `alpha-aci`, `alpha-admin`). Toda
 * escrita aqui passa por `changeModulePermission` (grant + auditoria numa transação) e é
 * restrita a esses quatro módulos.
 */
export function getAccessControlClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "access_control" })
}

/**
 * Service role no schema `core` — LEITURA do cadastro de pessoas (`user_data`) para a
 * busca por e-mail e a identificação da lista de acessos. Nunca gravar por aqui.
 */
export function getCoreReadClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "core" })
}

/**
 * Cliente SSR de autenticação (cookies da sessão).
 *
 * Publishable key — NUNCA a service key: getUser() valida o JWT do cookie no
 * servidor Supabase de qualquer forma, e inicializar com a service role faria
 * qualquer query acidental por este client burlar a RLS. Guard: opengrep
 * `auth-client-secret-key` (.opengrep/rules/auth-client-key.yaml).
 */
export function getIefaAuthClient() {
	return createSsrAuthClient({ url: url(), key: envServer.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY })
}
