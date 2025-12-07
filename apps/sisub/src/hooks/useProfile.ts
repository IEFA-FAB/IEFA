import { useQuery } from "@tanstack/react-query";
import type { MilitaryDataRow, UserDataRow } from "@/types/domain";
import supabase from "@/utils/supabase";

export function useUserData(userId: string | undefined) {
	return useQuery({
		queryKey: ["user_data", userId],
		enabled: !!userId,
		queryFn: async (): Promise<UserDataRow | null> => {
			const { data, error } = await supabase
				.from("user_data")
				.select("id,email,nrOrdem")
				.eq("id", userId)
				.maybeSingle();

			if (error) throw error;
			return data
				? { id: data.id, email: data.email, nrOrdem: data.nrOrdem ?? null }
				: null;
		},
		staleTime: 5 * 60_000,
	});
}

export function useMilitaryData(nrOrdem: string | null | undefined) {
	return useQuery({
		queryKey: ["military", nrOrdem],
		enabled: !!nrOrdem && nrOrdem.trim().length > 0,
		queryFn: async (): Promise<MilitaryDataRow | null> => {
			const { data, error } = await supabase
				.from("user_military_data")
				.select(
					"nrOrdem, nrCpf, nmGuerra, nmPessoa, sgPosto, sgOrg, dataAtualizacao",
				)
				.eq("nrOrdem", nrOrdem)
				.order("dataAtualizacao", { ascending: false, nullsFirst: false })
				.limit(1)
				.maybeSingle();

			if (error) throw error;
			return data ?? null;
		},
		staleTime: 2 * 60_000,
	});
}
