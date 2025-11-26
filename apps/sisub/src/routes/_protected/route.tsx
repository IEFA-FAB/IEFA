import { SidebarProvider } from "@iefa/ui";
import type { User } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import supabase from "@/utils/supabase";

/* ========= Utils ========= */
export const QUERY_STALE_TIME = 5 * 60_000;
export const QUERY_GC_TIME = 10 * 60_000;

export const queryKeys = {
	userNrOrdem: (userId: string | null | undefined) =>
		["user", userId, "nrOrdem"] as const,
	evaluation: (userId: string | null | undefined) =>
		["evaluation", userId] as const,
};

export function cn(...values: Array<string | null | false | undefined>) {
	return values.filter(Boolean).join(" ");
}

/* ========= Data functions ========= */
type EvaluationResult = {
	shouldAsk: boolean;
	question: string | null;
};

export async function syncIdEmail(user: User) {
	const { error } = await supabase
		.from("user_data")
		.upsert({ id: user.id, email: user.email }, { onConflict: "id" });
	if (error) throw error;
}

export async function syncIdNrOrdem(user: User, nrOrdem: string) {
	const { error } = await supabase
		.from("user_data")
		.upsert({ id: user.id, email: user.email, nrOrdem }, { onConflict: "id" });
	if (error) throw error;
}

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

export async function fetchEvaluationForUser(
	userId: User["id"],
): Promise<EvaluationResult> {
	const { data: config, error: configError } = await supabase
		.from("super_admin_controller")
		.select("key, active, value")
		.eq("key", "evaluation")
		.maybeSingle();
	if (configError) throw configError;

	const isActive = !!config?.active;
	const question = (config?.value ?? "") as string;
	if (!isActive || !question) {
		return { shouldAsk: false, question: question || null };
	}

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

import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_protected")({
	component: () => (
		<SidebarProvider>
			<AppShell />
		</SidebarProvider>
	),
});
