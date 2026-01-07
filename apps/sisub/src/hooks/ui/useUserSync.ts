import type { User } from "@supabase/supabase-js";
import { useMutation } from "@tanstack/react-query";
import supabase from "@/lib/supabase";

export async function syncIdEmail(user: User) {
	const { error } = await supabase
		.from("user_data")
		.upsert({ id: user.id, email: user.email }, { onConflict: "id" });
	if (error) throw error;
}

export function useSyncUserEmail() {
	return useMutation({
		mutationFn: syncIdEmail,
		onError: (error) => console.error("Erro ao sincronizar email:", error),
	});
}
