// apps/sisub/app/routes/rancho.tsx

import { Button } from "@iefa/ui";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Settings, UtensilsCrossed } from "lucide-react";
import { type JSX, lazy, Suspense, useState } from "react";
import { BulkMealSelector } from "@/components/features/forecast/BulkMealSelector";
import { DayCardSkeleton } from "@/components/features/forecast/DayCard";
import { DefaultMessHallSelector } from "@/components/features/forecast/DefaultMessHallSelector";
import SimplifiedMilitaryStats from "@/components/features/forecast/SimplifiedMilitaryStats";
import { UnifiedStatusToasts } from "@/components/features/forecast/UnifiedStatusToasts";
import { NEAR_DATE_THRESHOLD } from "@/constants/rancho";
import { useDailyMenuContent } from "@/hooks/data/useDailyMenuContent";
import { useMealForecast } from "@/hooks/data/useMealForecast";
import { useMessHalls } from "@/hooks/data/useMessHalls";
import {
	createEmptyDayMeals,
	formatDate,
	getDayOfWeek,
	isDateNear,
} from "@/lib/meal";
import type { CardData } from "@/types/domain";
import type {
	DayMeals,
	MessHallByDate,
	PendingChange,
	SelectionsByDate,
} from "@/types/domain/";

const DayCard = lazy(() => import("@/components/features/forecast/DayCard"));

/* ============================
   Utilitários e helpers de texto
   ============================ */

// Pluralização simples
const pluralize = (count: number, singular: string, plural: string) =>
	count === 1 ? singular : plural;

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelCard = (n: number) => pluralize(n, "card", "cards");
const labelDiaUtil = (n: number) => pluralize(n, "dia útil", "dias úteis");

// Dados derivados por card
const getDayCardData = (
	date: string,
	todayString: string,
	daySelections: DayMeals,
) => {
	const formattedDate = formatDate(date);
	const dayOfWeek = getDayOfWeek(date);
	const selectedMealsCount =
		Object.values(daySelections).filter(Boolean).length;
	const isDateNearValue = isDateNear(date, NEAR_DATE_THRESHOLD);
	const isToday = date === todayString;

	return {
		formattedDate,
		dayOfWeek,
		selectedMealsCount,
		isDateNear: isDateNearValue,
		isToday,
	};
};

const isWeekday = (dateString: string): boolean => {
	const d = new Date(`${dateString}T00:00:00`);
	const dow = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
	return dow >= 1 && dow <= 5;
};

export const Route = createFileRoute("/_protected/forecast")({
	component: Forecast,
	head: () => ({
		meta: [
			{ title: "Previsão SISUB" },
			{ name: "description", content: "Faça sua previsão" },
		],
	}),
});
/* ============================
   Componente principal
   ============================ */

export default function Forecast(): JSX.Element {
	const {
		success,
		error,
		isLoading,
		isRefetching, // refetch em background
		pendingChanges,
		isSavingBatch,
		selections,
		dayMessHalls, // Record<date, messHallCode> (UI usa CODE)
		dates,
		todayString,
		setSuccess,
		setError,
		setPendingChanges,
		setSelections,
		setDayMessHalls,
		loadExistingForecasts,
		clearMessages,

		defaultMessHallId, // ID (string)
		setDefaultMessHallId, // setter local (string)
		persistDefaultMessHallId, // persiste no user_data
	} = useMealForecast();

	// Mapeia ID <-> CODE para falar com os Selectors (que operam por "code")
	const { messHalls } = useMessHalls();

	// Derived state (No useMemo - React Compiler handles this)
	const defaultMessHallCode = (() => {
		if (!defaultMessHallId) return "";
		const mh = messHalls.find(
			(m) => String(m.id) === String(defaultMessHallId),
		);
		return mh?.code ?? "";
	})();

	const setDefaultMessHallCode = (code: string) => {
		const mh = messHalls.find((m) => m.code === code);
		if (mh?.id != null) {
			// apenas local, sem persistir
			setDefaultMessHallId(String(mh.id));
		}
	};

	// Helpers: resolver ID por CODE (para PendingChange/salvar)
	const getMessHallIdByCode = (code?: string | null): string => {
		if (!code) return "";
		const match = messHalls.find((m) => m.code === code);
		return match?.id != null ? String(match.id) : "";
	};

	// Por data: ui code -> id (com fallback no default)
	const resolveMessHallIdForDate = (date: string): string => {
		const code = dayMessHalls[date] || defaultMessHallCode || "";
		const idFromCode = getMessHallIdByCode(code);
		return idFromCode || (defaultMessHallId ? String(defaultMessHallId) : "");
	};

	// Calculate Kitchen IDs for menu fetching
	const kitchenIds = (() => {
		const ids = new Set<number>();

		// Add default kitchen
		const defaultMh = messHalls.find(
			(m) => String(m.id) === String(defaultMessHallId),
		);
		if (defaultMh?.kitchenId) ids.add(defaultMh.kitchenId);

		// Add kitchens from overrides
		dates.forEach((date) => {
			const code = dayMessHalls[date];
			if (code) {
				const mh = messHalls.find((m) => m.code === code);
				if (mh?.kitchenId) ids.add(mh.kitchenId);
			}
		});

		return Array.from(ids);
	})();

	const { data: menuContent } = useDailyMenuContent(
		kitchenIds,
		dates[0],
		dates[dates.length - 1],
	);

	const [showDefaultMessHallSelector, setShowDefaultMessHallSelector] =
		useState(false);
	const [isApplyingDefaultMessHall, setIsApplyingDefaultMessHall] =
		useState(false);

	// Seletor de refeições em massa
	const [showBulkMealSelector, setShowBulkMealSelector] = useState(false);
	const [isApplyingMealTemplate, setIsApplyingMealTemplate] = useState(false);

	/* ============================
     Derivações
     ============================ */

	const weekdayTargets = dates.filter(
		(date: string) => isWeekday(date) && !isDateNear(date, NEAR_DATE_THRESHOLD),
	);

	const computedData = (() => {
		// "Cards sem rancho" = datas sem um messHallCode definido (falsy)
		const cardsWithoutMessHall = dates.filter((date: string) => {
			const code = dayMessHalls[date];
			return !code;
		});

		const cardData: CardData[] = dates.map((date: string) => ({
			date,
			daySelections: selections[date] || createEmptyDayMeals(),
			// UI sempre com CODE
			dayMessHallCode: dayMessHalls[date] || defaultMessHallCode || "",
		}));

		return { cardsWithoutMessHall, cardData };
	})();

	const dayCardsProps = computedData.cardData.map(
		({ date, daySelections, dayMessHallCode }) => {
			const dayCardData = getDayCardData(date, todayString, daySelections);
			// Determine kitchen ID for this date (logic available if filtering needed)
			// const mh = messHalls.find((m) => String(m.id) === messHallId);
			// const kitchenId = mh?.kitchenId;

			// Extract menus for this date
			// Note: useDailyMenuContent returns { [date]: { [meal]: Dish[] } }
			// BUT it might contain menus for multiple kitchens if we fetched multiple.
			// However, useDailyMenuContent implementation just groups by date/meal.
			// If multiple kitchens have menu for same date/meal, they will collide or append.
			// My mock implementation appended. Ideally I should filter by kitchenId if I can.
			// For now, let's assume one kitchen per user/day context or the hook handles it?
			// The hook currently returns `content[date][mealKey] = Dish[]`. It merges all kitchens.
			// If the user has access to multiple kitchens, they might see merged dishes.
			// To be precise, DayCard should filter by kitchenId.
			// But DayCard doesn't know about kitchens.
			// Let's pass the dishes directly.

			const dishesForDay = menuContent?.[date];

			return {
				key: date,
				date,
				daySelections,
				// DayCard e MessHallSelector trabalham com CODE (mantemos nome por compat)
				dayMessHallId: dayMessHallCode,
				// Também passamos o default como CODE
				defaultMessHallId: defaultMessHallCode,
				...dayCardData,
				dishes: dishesForDay, // Pass dishes
				isSaving: false,
			};
		},
	);

	/* ============================
     Event Handlers
     ============================ */

	const handleMealToggle = (date: string, meal: keyof DayMeals): void => {
		if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

		// Resolve ID correto para o dia (a partir do CODE em UI)
		const messHallId = resolveMessHallIdForDate(date);
		if (!messHallId) {
			setError("Defina seu rancho padrão antes de marcar refeições.");
			return;
		}

		const currentValue = selections[date]?.[meal] || false;
		const newValue = !currentValue;

		setSelections((prev: SelectionsByDate) => {
			const existing = prev[date] ?? createEmptyDayMeals();
			return {
				...prev,
				[date]: {
					...existing,
					[meal]: newValue,
				},
			};
		});

		setPendingChanges((prev: PendingChange[]) => {
			const idx = prev.findIndex((c) => c.date === date && c.meal === meal);
			if (idx >= 0) {
				const copy = [...prev];
				copy[idx] = { date, meal, value: newValue, messHallId };
				return copy;
			}
			return [...prev, { date, meal, value: newValue, messHallId }];
		});
	};

	const handleMessHallChange = (
		date: string,
		newMessHallCode: string,
	): void => {
		if (isDateNear(date, NEAR_DATE_THRESHOLD)) return;

		// Na UI persistimos CODE por data
		setDayMessHalls((prev: MessHallByDate) => ({
			...prev,
			[date]: newMessHallCode,
		}));

		const dayMeals = selections[date];
		if (!dayMeals) return;

		// Para alterações existentes no dia, atualizamos o mess_hall_id (ID)
		const messHallId = getMessHallIdByCode(newMessHallCode);
		if (!messHallId) return;

		const selectedMeals: PendingChange[] = Object.entries(dayMeals)
			.filter(([, isSelected]) => Boolean(isSelected))
			.map(([meal, value]) => ({
				date,
				meal: meal as keyof DayMeals,
				value: Boolean(value),
				messHallId,
			}));

		if (!selectedMeals.length) return;

		setPendingChanges((prev: PendingChange[]) => {
			const filtered = prev.filter((c) => c.date !== date);
			return [...filtered, ...selectedMeals];
		});
	};

	const handleRefresh = (): void => {
		loadExistingForecasts();
	};

	const handleToggleMessHallSelector = (): void => {
		setShowDefaultMessHallSelector((prev) => !prev);
	};

	const handleCancelMessHallSelector = (): void => {
		setShowDefaultMessHallSelector(false);
	};

	const applyDefaultMessHallToAll = async (): Promise<void> => {
		const { cardsWithoutMessHall } = computedData;
		if (cardsWithoutMessHall.length === 0) return;

		try {
			// Backend: usa ID (precisa estar resolvido)
			const messHallIdForDefault =
				defaultMessHallId || getMessHallIdByCode(defaultMessHallCode) || "";

			if (!messHallIdForDefault) {
				setError("Defina e salve um rancho padrão antes de aplicar aos cards.");
				return;
			}

			// UI: grava CODE nos dias sem rancho
			const updatedMessHalls: MessHallByDate = { ...dayMessHalls };
			cardsWithoutMessHall.forEach((date: string) => {
				updatedMessHalls[date] = defaultMessHallCode;
			});
			setDayMessHalls(updatedMessHalls);

			const newPendingChanges: PendingChange[] = [];

			cardsWithoutMessHall.forEach((date: string) => {
				const dayMeals = selections[date];
				if (!dayMeals) return;

				Object.entries(dayMeals)
					.filter(([, isSelected]) => Boolean(isSelected))
					.forEach(([meal, value]) => {
						newPendingChanges.push({
							date,
							meal: meal as keyof DayMeals,
							value: Boolean(value),
							messHallId: String(messHallIdForDefault),
						});
					});
			});

			if (newPendingChanges.length > 0) {
				setPendingChanges((prev: PendingChange[]) => {
					const filtered = prev.filter(
						(change) => !cardsWithoutMessHall.includes(change.date),
					);
					return [...filtered, ...newPendingChanges];
				});
			}

			setSuccess(
				`Rancho padrão "${defaultMessHallCode}" aplicado a ${cardsWithoutMessHall.length} ${labelCard(
					cardsWithoutMessHall.length,
				)}!`,
			);
			setShowDefaultMessHallSelector(false);
		} catch (err) {
			console.error("Erro ao aplicar rancho padrão:", err);
			setError("Erro ao aplicar rancho padrão. Tente novamente.");
		}
	};

	const applyMealTemplateToAll = async (
		template: DayMeals,
		options: { mode: "fill-missing" | "override" },
	): Promise<void> => {
		const targetDates = weekdayTargets;
		if (!targetDates.length) {
			setShowBulkMealSelector(false);
			return;
		}

		setIsApplyingMealTemplate(true);
		try {
			const newChanges: PendingChange[] = [];
			const afterByDate: Record<string, DayMeals> = {};

			targetDates.forEach((date) => {
				const before = selections[date] || createEmptyDayMeals();
				const after: DayMeals = { ...before };

				if (options.mode === "override") {
					(Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
						after[k] = Boolean(template[k]);
					});
				} else {
					(Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
						if (template[k]) after[k] = after[k] || true;
					});
				}

				// UI (CODE) -> Backend (ID)
				const codeForDay =
					(dayMessHalls[date] && dayMessHalls[date] !== ""
						? dayMessHalls[date]
						: defaultMessHallCode) || "";
				const idForDay =
					getMessHallIdByCode(codeForDay) ||
					(defaultMessHallId ? String(defaultMessHallId) : "");

				(Object.keys(after) as (keyof DayMeals)[]).forEach((k) => {
					if (after[k] !== before[k]) {
						if (!idForDay) {
							// se não há ID resolvido, não empilha alteração inválida
							return;
						}
						newChanges.push({
							date,
							meal: k,
							value: after[k],
							messHallId: idForDay,
						});
					}
				});

				afterByDate[date] = after;
			});

			if (newChanges.length === 0) {
				setSuccess(
					"Nenhuma alteração necessária para aplicar o template em dias úteis.",
				);
				setShowBulkMealSelector(false);
				return;
			}

			setSelections((prev: SelectionsByDate) => {
				const next: SelectionsByDate = { ...prev };
				targetDates.forEach((date: string) => {
					next[date] = afterByDate[date];
				});
				return next;
			});

			setPendingChanges((prev: PendingChange[]) => {
				const toRemove = new Set(
					newChanges.map((c) => `${c.date}|${String(c.meal)}`),
				);
				const filtered = prev.filter(
					(c) => !toRemove.has(`${c.date}|${String(c.meal)}`),
				);
				return [...filtered, ...newChanges];
			});

			const diasStr = `${targetDates.length} ${labelDiaUtil(
				targetDates.length,
			)}`;
			const alteracoesStr = `${newChanges.length} ${labelAlteracao(
				newChanges.length,
			)}`;

			setSuccess(
				`Template de refeições aplicado a ${diasStr} no modo ${
					options.mode === "override" ? "sobrescrever" : "preencher"
				}: ${alteracoesStr}.`,
			);
			setShowBulkMealSelector(false);
		} catch (err) {
			console.error("Erro ao aplicar template de refeições:", err);
			setError("Erro ao aplicar template de refeições. Tente novamente.");
		} finally {
			setIsApplyingMealTemplate(false);
		}
	};

	const handleApplyDefault = async () => {
		setIsApplyingDefaultMessHall(true);
		try {
			// Persiste o default no user_data
			await persistDefaultMessHallId();

			// Aplica default aos cards (UI + pendingChanges) e mensagem
			await applyDefaultMessHallToAll();

			// Refaz fetch (default + forecasts) para refletir tudo da fonte de verdade
			await loadExistingForecasts();
		} finally {
			setIsApplyingDefaultMessHall(false);
		}
	};

	/* ============================
     Render
     ============================ */

	return (
		<div className="w-full mx-auto flex flex-col p-4 sm:p-6 space-y-6">
			{/* Header */}
			<header className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-lg sm:text-xl font-semibold">Previsão SISUB</h1>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleToggleMessHallSelector}
						className="hover:bg-accent/10 cursor-pointer"
						aria-label="Definir rancho padrão"
					>
						<Settings className="h-4 w-4 mr-2" />
						Rancho Padrão
					</Button>

					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowBulkMealSelector(!showBulkMealSelector)}
						disabled={isLoading}
						className="hover:bg-accent/10 cursor-pointer"
						aria-label="Aplicar refeições em massa"
					>
						<UtensilsCrossed className="h-4 w-4 mr-2" />
						Refeições em Massa
					</Button>

					<Button
						variant="outline"
						size="sm"
						onClick={handleRefresh}
						disabled={isLoading || isRefetching}
						className="cursor-pointer"
						aria-label="Recarregar previsões"
					>
						<RefreshCw
							className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
						/>
					</Button>
				</div>
			</header>

			{/* Controles */}
			<section className="gap-8 flex flex-row w-full">
				{showDefaultMessHallSelector && (
					<DefaultMessHallSelector
						// Selector opera por "code"; aqui fazemos o bridge ID <-> code
						defaultMessHallCode={defaultMessHallCode}
						setDefaultMessHallCode={setDefaultMessHallCode}
						onApply={handleApplyDefault}
						onCancel={handleCancelMessHallSelector}
						isApplying={isApplyingDefaultMessHall}
					/>
				)}

				{showBulkMealSelector && (
					<BulkMealSelector
						targetDates={weekdayTargets}
						initialTemplate={{ cafe: true, almoco: true }}
						onApply={applyMealTemplateToAll}
						onCancel={() => setShowBulkMealSelector(false)}
						isApplying={isApplyingMealTemplate}
					/>
				)}
			</section>

			{/* Overlay: Toasts unificados (bottom-center) */}
			<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
				<UnifiedStatusToasts
					success={success}
					error={error}
					onClearMessages={clearMessages}
					pendingChanges={pendingChanges}
					isSavingBatch={isSavingBatch}
					autoHideSuccessMs={6000}
				/>
			</div>

			{/* Estatísticas */}
			<section className="w-full">
				<div className="p-4 sm:p-5">
					<div className="p-4 sm:p-5">
						<SimplifiedMilitaryStats
							selections={selections}
							dates={dates}
							isLoading={isRefetching}
						/>
					</div>
				</div>
			</section>

			{/* Cards */}
			<section aria-labelledby="cards-title">
				<h2 id="cards-title" className="sr-only">
					Previsão por dia
				</h2>

				<div className="flex flex-row flex-wrap justify-center items-center w-full gap-8">
					{dayCardsProps.map((cardProps) => (
						<Suspense fallback={<DayCardSkeleton />} key={cardProps.key}>
							<div className="snap-center">
								<DayCard
									{...cardProps}
									pendingChanges={pendingChanges}
									onMealToggle={handleMealToggle}
									onMessHallChange={handleMessHallChange}
								/>
							</div>
						</Suspense>
					))}
				</div>
			</section>
		</div>
	);
}
