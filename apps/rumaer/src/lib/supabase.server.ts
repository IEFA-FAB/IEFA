import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"
import { envServer } from "./env.server"

const url = () => envServer.VITE_RUMAER_SUPABASE_URL
const secretKey = () => envServer.RUMAER_SUPABASE_SECRET_KEY

/**
 * Cliente Supabase com service role para operações de dados no schema rumaer.
 * Bypass de RLS — use apenas em server functions (*.fn.ts).
 * Nunca importe em código client-side.
 */
export function getRumaerServerClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "rumaer" })
}

/**
 * Cliente service role apontando para o schema `access_control` — tabela
 * `user_permissions` compartilhada entre os apps do ERP (sisub, rumaer).
 * Bypass de RLS; use apenas em server functions. A autorização por módulo/nível
 * é aplicada na camada de app (@iefa/pbac), não por RLS.
 */
export function getAccessControlClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "access_control" })
}

/**
 * Cliente service role apontando para o schema `core` — usado apenas para LER
 * o perfil militar do usuário (user_data / user_military_data, movidos de sisub
 * para core no split de schemas por domínio). Read-only.
 */
export function getCoreReadClient() {
	return createServiceRoleClient({ url: url(), secretKey: secretKey(), schema: "core" })
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão — necessário para auth.getUser() no servidor.
 * Use APENAS em auth.fn.ts. Para queries de dados, use getRumaerServerClient().
 */
export function getRumaerAuthClient() {
	return createSsrAuthClient({ url: url(), key: envServer.RUMAER_SUPABASE_SECRET_KEY })
}
