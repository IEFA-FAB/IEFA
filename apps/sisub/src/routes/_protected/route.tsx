// UI Components (from @iefa/ui)
import { SidebarProvider } from "@iefa/ui";
// Auth & Types
import type { User } from "@supabase/supabase-js";
// Routing
import { createFileRoute } from "@tanstack/react-router";
// Layout Components
import { AppShell } from "@/components/layout/AppShell";
// Utils & Services
import supabase from "@/utils/supabase";

/* ========================================================================
   QUERY CONFIGURATION
   ======================================================================== */

/**
 * Tempo que os dados ficam "frescos" no cache (5 minutos)
 * Após este período, uma nova requisição acionará um refetch em background
 */
export const QUERY_STALE_TIME = 5 * 60_000;

/**
 * Tempo de garbage collection do cache (10 minutos)
 * Após este período sem uso, os dados são removidos da memória
 */
export const QUERY_GC_TIME = 10 * 60_000;

/**
 * Query Keys centralizadas para TanStack Query
 * Seguindo padrão de arrays de dependências para invalidação granular
 */
export const queryKeys = {
	userNrOrdem: (userId: string | null | undefined) =>
		["user", userId, "nrOrdem"] as const,
	evaluation: (userId: string | null | undefined) =>
		["evaluation", userId] as const,
};

/* ========================================================================
   UTILITY FUNCTIONS
   ======================================================================== */

/**
 * Função utilitária para combinar classes CSS condicionalmente
 * @param values - Array de classes CSS (pode incluir null/false/undefined)
 * @returns String com classes válidas concatenadas
 */
export function cn(...values: Array<string | null | false | undefined>) {
	return values.filter(Boolean).join(" ");
}

/* ========================================================================
   TYPES
   ======================================================================== */

/**
 * Resultado da verificação de avaliação pendente
 */
type EvaluationResult = {
	/** Se o usuário deve responder a avaliação */
	shouldAsk: boolean;
	/** Texto da pergunta (se houver) */
	question: string | null;
};

/* ========================================================================
   USER DATA SYNC FUNCTIONS
   ======================================================================== */

/**
 * Sincroniza ID e email do usuário na tabela user_data
 * @param user - Objeto do usuário autenticado
 * @throws Error se a operação falhar
 */
export async function syncIdEmail(user: User) {
	const { error } = await supabase
		.from("user_data")
		.upsert({ id: user.id, email: user.email }, { onConflict: "id" });
	if (error) throw error;
}

/**
 * Sincroniza ID, email e número de ordem do usuário
 * @param user - Objeto do usuário autenticado
 * @param nrOrdem - Número de ordem militar
 * @throws Error se a operação falhar
 */
export async function syncIdNrOrdem(user: User, nrOrdem: string) {
	const { error } = await supabase
		.from("user_data")
		.upsert({ id: user.id, email: user.email, nrOrdem }, { onConflict: "id" });
	if (error) throw error;
}

/**
 * Busca o número de ordem do usuário
 * @param userId - ID do usuário
 * @returns Número de ordem (string) ou null se não existir
 * @throws Error se a consulta falhar
 */
export async function fetchUserNrOrdem(
	userId: User["id"],
): Promise<string | null> {
	const { data, error } = await supabase
		.from("user_data")
		.select("nrOrdem")
		.eq("id", userId)
		.maybeSingle();
	if (error) throw error;
	const value = data?.nrOrdem as string | number | null | undefined;
	const asString = value != null ? String(value) : null;
	return asString && asString.trim().length > 0 ? asString : null;
}

/* ========================================================================
   EVALUATION FUNCTIONS
   ======================================================================== */

/**
 * Verifica se há avaliação pendente para o usuário
 * 1. Verifica se a avaliação está ativa no super_admin_controller
 * 2. Verifica se o usuário já respondeu esta pergunta
 * @param userId - ID do usuário
 * @returns Objeto indicando se deve perguntar e qual a pergunta
 * @throws Error se alguma consulta falhar
 */
export async function fetchEvaluationForUser(
	userId: User["id"],
): Promise<EvaluationResult> {
	// Busca configuração da avaliação
	const { data: config, error: configError } = await supabase
		.from("super_admin_controller")
		.select("key, active, value")
		.eq("key", "evaluation")
		.maybeSingle();
	if (configError) throw configError;

	const isActive = !!config?.active;
	const question = (config?.value ?? "") as string;

	// Se não estiver ativa ou não houver pergunta, não pergunte
	if (!isActive || !question) {
		return { shouldAsk: false, question: question || null };
	}

	// Verifica se o usuário já respondeu esta pergunta
	const { data: opinion, error: opinionError } = await supabase
		.from("opinions")
		.select("id")
		.eq("question", question)
		.eq("userId", userId)
		.maybeSingle();
	if (opinionError) throw opinionError;

	const alreadyAnswered = !!opinion;
	return { shouldAsk: !alreadyAnswered, question };
}

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

/**
 * Layout para rotas protegidas (requer autenticação)
 * Envolve todo o conteúdo no SidebarProvider e renderiza o AppShell
 */
export const Route = createFileRoute("/_protected")({
	component: () => (
		<SidebarProvider>
			<AppShell />
		</SidebarProvider>
	),
});
