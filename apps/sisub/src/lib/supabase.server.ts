import type { Database } from "@iefa/database"
import { createServiceRoleClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"

import { envServer } from "@/lib/env.server"

/**
 * Schemas de domínio expostos via PostgREST que aceitam um service-role client.
 * Exclui a chave interna do tipo gerado (`__InternalSupabase`).
 *
 * Parte do split do schema `sisub` em schemas por domínio (core, kitchen,
 * procurement, finance, compras_gov_integration, ...). Conforme cada domínio é
 * migrado, os call sites supabase-js correspondentes passam a usar o client do
 * schema certo. A camada Drizzle (`getDb()`) acessa todos os schemas numa única
 * conexão e não depende desta factory.
 */
type DbSchema = Exclude<keyof Database, "__InternalSupabase">

/**
 * Client Supabase service-role do sisub, parametrizado por schema.
 * Use em server functions de dados (*.fn.ts). Nunca em código client-side.
 *
 * Os deadlines de fetch (auth 5 s / dados 10 s) vivem no @iefa/supabase-kit —
 * são a defesa contra o upstream degradado que virava 504/502 no ALB.
 */
export function getServerClient<S extends DbSchema>(schema: S) {
	return createServiceRoleClient({
		url: envServer.VITE_SISUB_SUPABASE_URL,
		secretKey: envServer.SISUB_SUPABASE_SECRET_KEY,
		schema,
	})
}

/** Helpers por domínio. */
export const getCoreClient = () => getServerClient("core")
export const getAccessControlClient = () => getServerClient("access_control")
export const getKitchenClient = () => getServerClient("kitchen")
export const getProcurementClient = () => getServerClient("procurement")
export const getFinanceClient = () => getServerClient("finance")
export const getComprasGovIntegrationClient = () => getServerClient("compras_gov_integration")

/**
 * Cliente service-role para as server functions que ainda leem do schema `sisub`.
 * Nunca importe em código client-side.
 */
export function getSupabaseServerClient() {
	return getServerClient("sisub")
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão do usuário — necessário para
 * auth.getUser() / auth.getSession() funcionarem no servidor.
 *
 * Use APENAS em auth.fn.ts. Para queries de dados, use getSupabaseServerClient().
 */
export function getSupabaseAuthClient() {
	// Publishable/anon key — NUNCA a service key: getUser() valida o JWT do cookie
	// no servidor Supabase de qualquer forma, e inicializar com a service role faria
	// qualquer query acidental por este client burlar a RLS. Guard: opengrep
	// `auth-client-secret-key` (.opengrep/rules/auth-client-key.yaml).
	return createSsrAuthClient({
		url: envServer.VITE_SISUB_SUPABASE_URL,
		key: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
		schema: "sisub",
	})
}
