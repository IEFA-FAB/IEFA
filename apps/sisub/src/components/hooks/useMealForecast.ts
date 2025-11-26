// hooks/useMealForecast.ts

import { queryOptions } from "@tanstack/query-db-collection";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessHalls } from "@/components/hooks/useMessHalls";
import { db, type MealForecast } from "@/db";
import { useAuth } from "@/hooks/useAuth";
import type { DayMeals } from "@/utils/RanchoUtils";
import supabase from "@/utils/supabase";

// Business timings
const DAYS_TO_SHOW = 30;
const AUTO_SAVE_DELAY = 1500;
const SUCCESS_MESSAGE_DURATION = 3000;

// Tipos expostos
export interface SelectionsByDate {
	[date: string]: DayMeals;
}

export interface MessHallByDate {
	[date: string]: string; // code
}

export interface PendingChange {
	date: string;
	meal: keyof DayMeals;
	value: boolean;
	messHallId: string; // ID (string) -> sisub.mess_halls.id
}

export interface MealForecastHook {
	success: string;
	error: string;
	isLoading: boolean; // initial load
	isRefetching: boolean; // background refetch
	pendingChanges: PendingChange[];
	isSavingBatch: boolean;
	selections: SelectionsByDate;
	dayMessHalls: MessHallByDate; // CODE por data
	defaultMessHallId: string; // ID preferido do usuário (string)
	dates: string[];
	todayString: string;
	setSuccess: (msg: string) => void;
	setError: (msg: string) => void;
	setPendingChanges: React.Dispatch<React.SetStateAction<PendingChange[]>>;
	setSelections: React.Dispatch<React.SetStateAction<SelectionsByDate>>;
	setDayMessHalls: React.Dispatch<React.SetStateAction<MessHallByDate>>;
	setDefaultMessHallId: (id: string) => void; // setter local
	persistDefaultMessHallId: () => Promise<void>; // persiste no banco
	loadExistingForecasts: () => Promise<void>;
	savePendingChanges: () => Promise<void>;
	clearMessages: () => void;
	updateLocalForecast: (
		date: string,
		meal: keyof DayMeals,
		value: boolean,
		messHallId: string,
	) => Promise<void>;
}

const createEmptyDayMeals = (): DayMeals => ({
	cafe: false,
	almoco: false,
	janta: false,
	ceia: false,
});

// YYYY-MM-DD local
const toYYYYMMDD = (date: Date): string => {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
};

const generateDates = (days: number): string[] => {
	const out: string[] = [];
	const today = new Date();
	for (let i = 0; i < days; i++) {
		const dt = new Date(today);
		dt.setDate(today.getDate() + i);
		out.push(toYYYYMMDD(dt));
	}
	return out;
};

// Helpers (labels PT)
const pluralize = (n: number, s: string, p: string) => (n === 1 ? s : p);
const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelSalva = (n: number) => pluralize(n, "salva", "salvas");
const labelFalhou = (n: number) => pluralize(n, "falhou", "falharam");
const labelOperacao = (n: number) => pluralize(n, "operação", "operações");

export const useMealForecast = (): MealForecastHook => {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { messHalls } = useMessHalls();
	
	const [isClient, setIsClient] = useState(false);

	const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
	const successTimerRef = useRef<NodeJS.Timeout | null>(null);
	const saveOperationRef = useRef<Promise<void> | null>(null);

	const [success, setSuccessState] = useState<string>("");
	const [error, setError] = useState<string>("");
	const [isSavingBatch, setIsSavingBatch] = useState<boolean>(false);
	const [defaultMessHallId, setDefaultMessHallIdState] = useState<string>("");
	const [dayMessHalls, setDayMessHalls] = useState<MessHallByDate>({});

	// Datas/keys estáveis
	const dates = useMemo(() => generateDates(DAYS_TO_SHOW), []);
	const todayString = useMemo(() => toYYYYMMDD(new Date()), []);
	const forecastsQueryKey = useMemo(
		() => ["mealForecasts", user?.id, dates[0], dates[dates.length - 1]],
		[user?.id, dates],
	);
	const userDataQueryKey = useMemo(() => ["userData", user?.id], [user?.id]);

	// Mensagens
	const clearMessages = useCallback(() => {
		setSuccessState("");
		setError("");
	}, []);

	const setSuccess = useCallback((msg: string) => {
		setSuccessState(msg);
		setError("");
		if (successTimerRef.current) clearTimeout(successTimerRef.current);
		if (msg) {
			successTimerRef.current = setTimeout(
				() => setSuccessState(""),
				SUCCESS_MESSAGE_DURATION,
			);
		}
	}, []);

	const setErrorWithClear = useCallback((msg: string) => {
		setError(msg);
		setSuccessState("");
	}, []);

	// --- TANSTACK DB INTEGRATION ---

	// 1. Live Query from Local DB
	const { data: localForecasts } = useQuery(
		queryOptions(db, (db) =>
			db.collections.mealForecasts.findMany({
				filter: (item) => item.userId === user?.id,
			}),
		),
	);

	// Transform localForecasts to selections and pendingChanges
	const { selections, pendingChanges } = useMemo(() => {
		const sels: SelectionsByDate = {};
		const pending: PendingChange[] = [];

		// Initialize with empty
		dates.forEach((date) => {
			sels[date] = createEmptyDayMeals();
		});

		if (localForecasts) {
			localForecasts.forEach((f) => {
				if (sels[f.date] && f.meal in sels[f.date]) {
					sels[f.date][f.meal as keyof DayMeals] = f.willEat;
				}

				if (!f.synced) {
					pending.push({
						date: f.date,
						meal: f.meal as keyof DayMeals,
						value: f.willEat,
						messHallId: f.messHallId,
					});
				}
			});
		}

		return { selections: sels, pendingChanges: pending };
	}, [localForecasts, dates]);

	// Sync DB -> dayMessHalls (using messHalls for ID->Code mapping)
	useEffect(() => {
		if (localForecasts && messHalls.length > 0) {
			setDayMessHalls((prev) => {
				const next = { ...prev };
				let changed = false;
				localForecasts.forEach((f) => {
					if (f.messHallId) {
						const mh = messHalls.find((m) => String(m.id) === f.messHallId);
						if (mh && next[f.date] !== mh.code) {
							next[f.date] = mh.code;
							changed = true;
						}
					}
				});
				return changed ? next : prev;
			});
		}
	}, [localForecasts, messHalls]);

	// 2. Fetch from Supabase (Server State)
	type ForecastRow = {
		date: string;
		meal: keyof DayMeals;
		will_eat: boolean | null;
		mess_halls?: { id: number; code?: string | null } | null;
	};

	const {
		data: serverForecasts,
		isPending,
		isFetching,
		refetch: refetchForecasts,
	} = useQuery({
		queryKey: forecastsQueryKey,
		enabled: isClient && !!user?.id,
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		queryFn: async () => {
			const { data, error: supabaseError } = await supabase
				.schema("sisub")
				.from("meal_forecasts")
				.select("date, meal, will_eat, mess_halls(id, code)")
				.eq("user_id", user!.id)
				.gte("date", dates[0])
				.lte("date", dates[dates.length - 1])
				.order("date", { ascending: true });

			if (supabaseError) throw supabaseError;
			return (data ?? []) as ForecastRow[];
		},
	});

	// 3. Sync Server -> Local (Hydration)
	useEffect(() => {
		if (!serverForecasts || !user?.id) return;

		const syncServerToLocal = async () => {
			for (const f of serverForecasts) {
				const id = `${f.date}-${f.meal}`;
				const existing = await db.collections.mealForecasts.findById(id);

				// Only overwrite if local is synced (no pending changes)
				if (!existing || existing.synced) {
					await db.collections.mealForecasts.upsert({
						id,
						date: f.date,
						meal: f.meal,
						willEat: !!f.will_eat,
						messHallId: String(f.mess_halls?.id || ""),
						userId: user.id,
						synced: true,
					});
				}
			}
		};

		syncServerToLocal();
	}, [serverForecasts, user?.id]);

	// Query 2: carrega default_mess_hall_id de user_data
	type UserDataRow = {
		default_mess_hall_id: number | null;
	};

	const {
		data: userData,
		isFetching: isFetchingUserData,
		refetch: refetchUserData,
	} = useQuery({
		queryKey: userDataQueryKey,
		enabled: isClient && !!user?.id,
		staleTime: 5 * 60_000,
		gcTime: 10 * 60_000,
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		queryFn: async () => {
			const { data, error } = await supabase
				.schema("sisub")
				.from("user_data")
				.select("default_mess_hall_id")
				.eq("id", user!.id)
				.maybeSingle();

			if (error) throw error;
			return (data ?? null) as UserDataRow | null;
		},
	});

	// Hidrata defaultMessHallId
	useEffect(() => {
		if (!user?.id) return;
		if (isFetchingUserData) return;
		const id = userData?.default_mess_hall_id ?? null;
		if (id && !defaultMessHallId) {
			setDefaultMessHallIdState(String(id));
		}
	}, [
		user?.id,
		userData?.default_mess_hall_id,
		isFetchingUserData,
		defaultMessHallId,
	]);

	// Setter local do default
	const setDefaultMessHallIdLocal = useCallback((id: string) => {
		setDefaultMessHallIdState(id);
	}, []);

	// Persistência do default_mess_hall_id
	const persistDefaultMessHallId = useCallback(async (): Promise<void> => {
		if (!user?.id) return;
		const idNum = Number(defaultMessHallId);
		if (!Number.isFinite(idNum) || idNum <= 0) {
			setErrorWithClear("Rancho padrão inválido.");
			return;
		}
		const prev = userData?.default_mess_hall_id;
		const { error } = await supabase.schema("sisub").from("user_data").upsert(
			{
				id: user.id,
				default_mess_hall_id: idNum,
				email: user.email,
			},
			{ onConflict: "id", ignoreDuplicates: false },
		);

		if (error) {
			if (prev != null) setDefaultMessHallIdState(String(prev));
			setErrorWithClear("Não foi possível salvar o rancho padrão.");
			return;
		}
		queryClient.invalidateQueries({ queryKey: userDataQueryKey });
	}, [
		user?.id,
		user?.email,
		defaultMessHallId,
		userData?.default_mess_hall_id,
		queryClient,
		userDataQueryKey,
		setErrorWithClear,
	]);

	// --- OPTIMISTIC MUTATIONS (via DB) ---

	const updateLocalForecast = useCallback(
		async (
			date: string,
			meal: keyof DayMeals,
			value: boolean,
			messHallId: string,
		) => {
			if (!user?.id) return;
			const id = `${date}-${meal}`;
			await db.collections.mealForecasts.upsert({
				id,
				date,
				meal,
				willEat: value,
				messHallId,
				userId: user.id,
				synced: false,
			});
		},
		[user?.id],
	);

	// Deprecated setters
	const setSelections = useCallback(
		(action: React.SetStateAction<SelectionsByDate>) => {
			console.warn(
				"setSelections is deprecated with TanStack DB. Use updateLocalForecast.",
			);
		},
		[],
	);

	const setPendingChanges = useCallback(
		(action: React.SetStateAction<PendingChange[]>) => {
			console.warn("setPendingChanges is deprecated with TanStack DB.");
		},
		[],
	);

	// 4. Sync Local -> Server (Push)
	const savePendingChanges = useCallback(async (): Promise<void> => {
		if (!user?.id || pendingChanges.length === 0) return;
		if (saveOperationRef.current) {
			await saveOperationRef.current;
			return;
		}

		const saveOperation = async () => {
			setIsSavingBatch(true);
			setErrorWithClear("");

			try {
				const unsynced = await db.collections.mealForecasts.findMany({
					filter: (item) => item.userId === user.id && !item.synced,
				});

				if (unsynced.length === 0) return;

				const results = await Promise.allSettled(
					unsynced.map(async (item) => {
						try {
							const messHallIdNum = Number(item.messHallId);

							if (item.willEat) {
								if (!Number.isFinite(messHallIdNum) || messHallIdNum <= 0) {
									throw new Error(
										`messHallId inválido para ${item.date}-${item.meal}`,
									);
								}

								const { error: upsertError } = await supabase
									.schema("sisub")
									.from("meal_forecasts")
									.upsert(
										{
											date: item.date,
											user_id: user.id,
											meal: item.meal,
											will_eat: true,
											mess_hall_id: messHallIdNum,
										},
										{
											onConflict: "user_id,date,meal",
											ignoreDuplicates: false,
										},
									);
								if (upsertError) throw upsertError;
							} else {
								const { error: deleteError } = await supabase
									.schema("sisub")
									.from("meal_forecasts")
									.delete()
									.eq("user_id", user.id)
									.eq("date", item.date)
									.eq("meal", item.meal);
								if (
									deleteError &&
									!deleteError.message?.includes("No rows deleted")
								) {
									throw deleteError;
								}
							}

							await db.collections.mealForecasts.upsert({
								...item,
								synced: true,
							});

							return { success: true, item };
						} catch (err) {
							return {
								success: false,
								item,
								error: err instanceof Error ? err.message : "Erro desconhecido",
							};
						}
					}),
				);

				const fail = results.filter(
					(r) =>
						r.status === "rejected" ||
						(r.status === "fulfilled" && !r.value.success),
				);

				if (fail.length === 0) {
					const n = unsynced.length;
					setSuccess(`${n} ${labelAlteracao(n)} ${labelSalva(n)} com sucesso!`);
				} else {
					setErrorWithClear("Algumas alterações não puderam ser salvas.");
				}

				queryClient.invalidateQueries({ queryKey: forecastsQueryKey });
			} catch (err) {
				console.error("Erro crítico ao salvar:", err);
				setErrorWithClear("Erro ao salvar alterações.");
			} finally {
				setIsSavingBatch(false);
				saveOperationRef.current = null;
			}
		};

		saveOperationRef.current = saveOperation();
		return saveOperationRef.current;
	}, [
		user?.id,
		pendingChanges,
		queryClient,
		forecastsQueryKey,
		setErrorWithClear,
		setSuccess,
	]);

	// Auto-save
	useEffect(() => {
		if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
		if (pendingChanges.length === 0) return;
		autoSaveTimerRef.current = setTimeout(() => {
			savePendingChanges();
		}, AUTO_SAVE_DELAY);
		return () => {
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
		};
	}, [pendingChanges, savePendingChanges]);

	// Client hydration
	useEffect(() => setIsClient(true), []);

	// Cleanup
	useEffect(() => {
		return () => {
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
			if (successTimerRef.current) clearTimeout(successTimerRef.current);
		};
	}, []);

	const loadExistingForecasts = useCallback(async (): Promise<void> => {
		await Promise.all([refetchForecasts(), refetchUserData()]);
	}, [refetchForecasts, refetchUserData]);

	return {
		success,
		error,
		isLoading: isPending,
		isRefetching: isFetching || isFetchingUserData,
		pendingChanges,
		isSavingBatch,
		selections,
		dayMessHalls,
		defaultMessHallId,
		dates,
		todayString,

		setSuccess,
		setError: setErrorWithClear,
		setPendingChanges,
		setSelections,
		setDayMessHalls,

		setDefaultMessHallId: setDefaultMessHallIdLocal,
		persistDefaultMessHallId,

		loadExistingForecasts,
		savePendingChanges,
		clearMessages,
		updateLocalForecast,
	} as unknown as MealForecastHook;
};
