// hooks/useMealForecast.ts
// Uses centralized types from @/types/domain as per design system guidelines.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type {
	MealForecastHook,
	MessHallByDate,
	PendingChange,
	SelectionsByDate,
} from "@/types/domain";
import type { DayMeals } from "@/utils/RanchoUtils";
import supabase from "@/utils/supabase";

// Business timings
const DAYS_TO_SHOW = 30;
const AUTO_SAVE_DELAY = 1500;
const SUCCESS_MESSAGE_DURATION = 3000;

/**
 * Creates an empty DayMeals object with all meals set to false.
 * Used as the initial state for date selections.
 *
 * @returns DayMeals object with all meal flags set to false
 */
const createEmptyDayMeals = (): DayMeals => ({
	cafe: false,
	almoco: false,
	janta: false,
	ceia: false,
});

/**
 * Converts a Date object to YYYY-MM-DD format string in local timezone.
 *
 * @param date - Date to convert
 * @returns Date string in YYYY-MM-DD format
 */
const toYYYYMMDD = (date: Date): string => {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
};

/**
 * Generates an array of date strings starting from today.
 *
 * @param days - Number of days to generate (starting from today)
 * @returns Array of date strings in YYYY-MM-DD format
 */
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

/**
 * Custom hook for managing meal forecasts with optimistic updates and auto-save.
 *
 * @remarks
 * This hook manages the complete lifecycle of meal forecasts including:
 * - Loading existing forecasts from the database
 * - Local state management with optimistic updates
 * - Automatic batching and saving of changes
 * - Mess hall selection and persistence
 *
 * Data is automatically saved after a 1.5s delay when changes are made.
 * Success messages auto-clear after 3 seconds.
 *
 * @returns MealForecastHook object with state and control methods
 *
 * @example
 * ```tsx
 * const {
 *   selections,
 *   dayMessHalls,
 *   defaultMessHallId,
 *   isLoading,
 *   pendingChanges,
 *   setSelections,
 *   savePendingChanges,
 * } = useMealForecast();
 *
 * // Toggle a meal selection
 * const handleToggle = (date: string, meal: keyof DayMeals) => {
 *   setSelections(prev => ({
 *     ...prev,
 *     [date]: { ...prev[date], [meal]: !prev[date][meal] }
 *   }));
 * };
 * ```
 */
export const useMealForecast = (): MealForecastHook => {
	const { user } = useAuth();
	const queryClient = useQueryClient();

	const [isClient, setIsClient] = useState(false);

	const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
	const successTimerRef = useRef<NodeJS.Timeout | null>(null);
	const saveOperationRef = useRef<Promise<void> | null>(null);
	const hydratedOnceRef = useRef(false); // controla hidratação de forecasts/dayMessHalls

	const [success, setSuccessState] = useState<string>("");
	const [error, setError] = useState<string>("");
	const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
	const [isSavingBatch, setIsSavingBatch] = useState<boolean>(false);
	const [selections, setSelections] = useState<SelectionsByDate>({});
	const [dayMessHalls, setDayMessHalls] = useState<MessHallByDate>({});
	const [defaultMessHallId, setDefaultMessHallIdState] = useState<string>("");

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

	// Query 1: carrega forecasts + code do rancho (join)
	type ForecastRow = {
		date: string;
		meal: keyof DayMeals;
		will_eat: boolean | null;
		mess_halls?: { code?: string | null } | null;
	};

	const {
		data: forecasts,
		isPending, // initial load
		isFetching, // any refetch
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
				.select("date, meal, will_eat, mess_halls(code)")
				.eq("user_id", user!.id)
				.gte("date", dates[0])
				.lte("date", dates[dates.length - 1])
				.order("date", { ascending: true });

			if (supabaseError) throw supabaseError;
			return (data ?? []) as ForecastRow[];
		},
	});

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

	// Hidrata defaultMessHallId quando vier do banco (apenas quando local estiver vazio)
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

	// Hidrata selections e dayMessHalls com os dados do período
	useEffect(() => {
		if (!user?.id) return;
		if (!forecasts) return;

		const canOverwrite = pendingChanges.length === 0 && !isSavingBatch;
		if (!hydratedOnceRef.current || canOverwrite) {
			const initialSelections: SelectionsByDate = {};
			const initialMessHalls: MessHallByDate = {};

			dates.forEach((date) => {
				initialSelections[date] = createEmptyDayMeals();
				// deixe ""; a UI faz fallback para o default (convertido por useMessHalls)
				initialMessHalls[date] = "";
			});

			forecasts.forEach((p) => {
				const { date, meal, will_eat, mess_halls } = p;
				if (initialSelections[date] && meal in initialSelections[date]) {
					initialSelections[date][meal] = !!will_eat;
					const code = mess_halls?.code || undefined;
					if (code) initialMessHalls[date] = code;
				}
			});

			setSelections(initialSelections);
			setDayMessHalls(initialMessHalls);
			hydratedOnceRef.current = true;
		}
	}, [user?.id, forecasts, dates, pendingChanges.length, isSavingBatch]);

	// Setter local do default (sem persistir)
	const setDefaultMessHallIdLocal = useCallback((id: string) => {
		setDefaultMessHallIdState(id);
	}, []);

	// Persistência do default_mess_hall_id no user_data (upsert)
	const persistDefaultMessHallId = useCallback(async (): Promise<void> => {
		if (!user?.id) return;

		const idNum = Number(defaultMessHallId);
		if (!Number.isFinite(idNum) || idNum <= 0) {
			setErrorWithClear("Rancho padrão inválido. Selecione um rancho válido.");
			return;
		}

		const prev = userData?.default_mess_hall_id; // para reverter em caso de erro

		const { error } = await supabase.schema("sisub").from("user_data").upsert(
			{
				id: user.id,
				default_mess_hall_id: idNum,
				email: user.email,
			},
			{ onConflict: "id", ignoreDuplicates: false },
		);

		if (error) {
			// Reverter estado local para manter coerência com DB (fonte da verdade)
			if (prev != null) setDefaultMessHallIdState(String(prev));
			setErrorWithClear("Não foi possível salvar o rancho padrão.");
			return;
		}

		// Mantém cache coerente
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

	// Salva alterações pendentes (usa messHallId direto)
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
				const changesToSave = [...pendingChanges];

				// Dedup por date-meal
				const byKey = changesToSave.reduce(
					(acc, ch) => {
						acc[`${ch.date}-${ch.meal}`] = ch;
						return acc;
					},
					{} as Record<string, PendingChange>,
				);

				const results = await Promise.allSettled(
					Object.values(byKey).map(async (change) => {
						try {
							if (change.value) {
								const messHallIdNum = Number(change.messHallId);
								if (!Number.isFinite(messHallIdNum) || messHallIdNum <= 0) {
									throw new Error(
										`messHallId inválido: "${change.messHallId}" para ${change.date}-${change.meal}`,
									);
								}

								const { error: upsertError } = await supabase
									.schema("sisub")
									.from("meal_forecasts")
									.upsert(
										{
											date: change.date,
											user_id: user.id,
											meal: change.meal,
											will_eat: true,
											mess_hall_id: messHallIdNum,
										},
										{
											onConflict: "user_id,date,meal",
											ignoreDuplicates: false,
										},
									);

								if (upsertError) {
									// fallback: delete + insert
									await supabase
										.schema("sisub")
										.from("meal_forecasts")
										.delete()
										.eq("user_id", user.id)
										.eq("date", change.date)
										.eq("meal", change.meal);

									const { error: insertError } = await supabase
										.schema("sisub")
										.from("meal_forecasts")
										.insert({
											date: change.date,
											user_id: user.id,
											meal: change.meal,
											will_eat: true,
											mess_hall_id: messHallIdNum,
										});

									if (insertError) throw insertError;
								}
							} else {
								const { error: deleteError } = await supabase
									.schema("sisub")
									.from("meal_forecasts")
									.delete()
									.eq("user_id", user.id)
									.eq("date", change.date)
									.eq("meal", change.meal);

								if (
									deleteError &&
									!deleteError.message?.includes("No rows deleted")
								) {
									throw deleteError;
								}
							}

							return { success: true, change };
						} catch (err) {
							console.error(
								`Erro ao processar ${change.date}-${change.meal}:`,
								err,
							);
							return {
								success: false,
								change,
								error: err instanceof Error ? err.message : "Erro desconhecido",
							};
						}
					}),
				);

				const ok = results.filter(
					(r) => r.status === "fulfilled" && r.value.success,
				) as PromiseFulfilledResult<{
					success: boolean;
					change: PendingChange;
				}>[];

				const fail = results.filter(
					(r) =>
						r.status === "rejected" ||
						(r.status === "fulfilled" && !r.value.success),
				);

				if (fail.length === 0) {
					const n = changesToSave.length;
					setSuccess(`${n} ${labelAlteracao(n)} ${labelSalva(n)} com sucesso!`);
					setPendingChanges((prev) =>
						prev.filter(
							(c) =>
								!changesToSave.some(
									(s) =>
										s.date === c.date &&
										s.meal === c.meal &&
										s.value === c.value &&
										s.messHallId === c.messHallId,
								),
						),
					);
				} else if (ok.length > 0) {
					const nOk = ok.length;
					const nFail = fail.length;
					setSuccess(
						`${nOk} ${labelAlteracao(nOk)} ${labelSalva(nOk)}. ${nFail} ${labelAlteracao(
							nFail,
						)} ${labelFalhou(nFail)}.`,
					);
					const okChanges = ok.map((r) => r.value.change);
					setPendingChanges((prev) =>
						prev.filter(
							(c) =>
								!okChanges.some(
									(s) =>
										s.date === c.date &&
										s.meal === c.meal &&
										s.value === c.value &&
										s.messHallId === c.messHallId,
								),
						),
					);
					fail.forEach((r) => {
						if (r.status === "fulfilled") {
							console.error("Erro na operação:", r.value.error);
						} else {
							console.error("Promise rejeitada:", r.reason);
						}
					});
				} else {
					const msg = fail
						.map((r) =>
							r.status === "fulfilled"
								? (r.value as any).error
								: (r.reason?.message as string) || "Erro desconhecido",
						)
						.join(", ");
					const count = changesToSave.length;
					throw new Error(
						count === 1
							? `A ${labelOperacao(count)} ${labelFalhou(count)}: ${msg}`
							: `Todas as ${count} ${labelOperacao(count)} ${labelFalhou(count)}: ${msg}`,
					);
				}

				// refresh em background
				queryClient.invalidateQueries({ queryKey: forecastsQueryKey });
			} catch (err) {
				console.error("Erro crítico ao salvar mudanças:", err);
				setErrorWithClear(
					err instanceof Error
						? `Erro ao salvar ${labelAlteracao(1)}: ${err.message}`
						: "Erro ao salvar alterações. Tente novamente.",
				);
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

	// Client-side hydration
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

		// default mess hall controls
		setDefaultMessHallId: setDefaultMessHallIdLocal,
		persistDefaultMessHallId,

		loadExistingForecasts,
		savePendingChanges,
		clearMessages,
	};
};
