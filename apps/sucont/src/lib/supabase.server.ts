import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"
import { envServer } from "#/lib/env.server"

const url = () => envServer.VITE_SUCONT_SUPABASE_URL
const secretKey = () => envServer.SUCONT_SUPABASE_SECRET_KEY

/**
 * Cliente Supabase com service role para operações de dados no schema `sucont`.
 * Bypass de RLS — use apenas em server functions (*.fn.ts). A autorização é
 * aplicada na camada de app (@iefa/pbac), não por RLS. Nunca importe no cliente.
 */
export function getSucontServerClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "sucont" })
}

/**
 * Cliente service role apontando para o schema `access_control` — tabela
 * `user_permissions` compartilhada entre os apps do ERP (sisub, rumaer, sucont).
 * Bypass de RLS; use apenas em server functions.
 */
export function getAccessControlClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "access_control" })
}

/**
 * Cliente service role apontando para o schema `core` — cadastro de pessoas do
 * ERP (`user_data`). Dois usos, os dois restritos:
 *   - LER na busca por e-mail da gestão de acessos;
 *   - GRAVAR a linha do PRÓPRIO usuário no login (`syncSucontIdentityFn`), que é
 *     o que faz alguém do sucont existir para aquela busca.
 * Nunca escrever a linha de outra pessoa por aqui.
 */
export function getCoreClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "core" })
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão — necessário para auth.getUser() no servidor.
 * Use APENAS em auth.fn.ts / auth.server.ts. Para dados, use getSucontServerClient().
 */
export function getSucontAuthClient() {
	// Chave anon/publishable (não a service role): getUser() valida o JWT do cookie
	// no servidor Supabase e o nível de acesso vem do próprio JWT. Inicializar com a
	// service role faria qualquer query acidental por este client burlar a RLS.
	return createSsrAuthClient({ url: url(), key: envServer.VITE_SUCONT_SUPABASE_PUBLISHABLE_KEY })
}
