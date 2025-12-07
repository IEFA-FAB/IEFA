import type { User } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EvaluationResult } from "@/types/domain";
import supabase from "@/utils/supabase";

const QUERY_STALE_TIME = 5 * 60_000;
const QUERY_GC_TIME = 10 * 60_000;

export const evaluationKey = (userId: string | null | undefined) =>
	["evaluation", userId] as const;

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

export function useEvaluation(userId: string | null) {
	return useQuery({
		queryKey: evaluationKey(userId),
		queryFn: () => fetchEvaluationForUser(userId as string),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	});
}

export function useSubmitEvaluation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: {
			value: number;
			question: string;
			userId: string;
		}) => {
			const { error } = await supabase.from("opinions").insert([
				{
					value: payload.value,
					question: payload.question,
					userId: payload.userId,
				},
			]);
			if (error) throw error;
		},
		onError: (error) => console.error("Erro ao registrar voto:", error),
		onSuccess: (_, { userId }) => {
			queryClient.invalidateQueries({ queryKey: evaluationKey(userId) });
		},
	});
}
