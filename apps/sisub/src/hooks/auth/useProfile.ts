import { useQuery } from "@tanstack/react-query"
import { fetchMilitaryDataFn, fetchUserDataFn } from "@/server/user.fn"
import type { MilitaryDataRow, UserDataRow } from "@/types/domain/"
import { useAuth } from "./useAuth"

export function useProfile() {
	const { user } = useAuth()
	return useUserData(user?.id)
}

export function useUserData(userId: string | undefined) {
	return useQuery({
		queryKey: ["user_data", userId],
		enabled: !!userId,
		queryFn: (): Promise<UserDataRow | null> =>
			fetchUserDataFn({ data: { userId: userId! } }) as Promise<UserDataRow | null>,
		staleTime: 5 * 60_000,
	})
}

export function useMilitaryData(nrOrdem: string | null | undefined) {
	return useQuery({
		queryKey: ["military", nrOrdem],
		enabled: !!nrOrdem && nrOrdem.trim().length > 0,
		queryFn: (): Promise<MilitaryDataRow | null> =>
			fetchMilitaryDataFn({ data: { nrOrdem: nrOrdem! } }) as Promise<MilitaryDataRow | null>,
		staleTime: 2 * 60_000,
	})
}
