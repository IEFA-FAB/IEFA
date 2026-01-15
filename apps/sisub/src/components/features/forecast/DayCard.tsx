// components/DayCard.tsx

import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	Skeleton,
} from "@iefa/ui";
import { Calendar, Clock, Loader2 } from "lucide-react";
import { MealButton } from "@/components/features/forecast/MealButton";
import { MessHallSelector } from "@/components/features/forecast/MessHallSelector";
import { MEAL_TYPES } from "@/constants/rancho";
import type { DishDetails } from "@/hooks/data/useDailyMenuContent";
import { cn } from "@/lib/cn";
import type { DayMeals, PendingChange } from "@/types/domain/meal";

interface DayCardProps {
	date: string;
	daySelections: DayMeals;
	dayMessHallId: string;
	defaultMessHallId: string;
	onMealToggle: (date: string, meal: keyof DayMeals) => void;
	onMessHallChange: (date: string, newMessHallId: string) => void;
	formattedDate: string;
	dayOfWeek: string;
	isToday: boolean;
	isDateNear: boolean;
	pendingChanges: PendingChange[];
	isSaving?: boolean;
	selectedMealsCount?: number;
	isLoading?: boolean;
	dishes?: { [mealKey: string]: DishDetails[] };
}

const countSelectedMeals = (daySelections: DayMeals): number => {
	return Object.values(daySelections).filter(Boolean).length;
};

// Skeleton using shadcn/ui tokens
export function DayCardSkeleton() {
	return (
		<Card className="w-80 shrink-0 bg-card text-card-foreground border border-border">
			<CardHeader className="pb-3">
				<div className="grid grid-cols-[1fr_auto] gap-4 items-start">
					{/* Left header */}
					<div className="flex items-center space-x-2">
						<Skeleton className="h-4 w-4" />
						<div className="space-y-1">
							<Skeleton className="h-5 w-20" />
							<Skeleton className="h-4 w-16" />
						</div>
					</div>

					{/* Right header */}
					<div className="flex items-center space-x-1">
						<Skeleton className="h-6 w-12 rounded-full" />
					</div>
				</div>

				{/* Progress bar skeleton */}
				<div className="h-12 flex items-center">
					<div className="w-full bg-muted/50 rounded-lg p-2 border border-border">
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-24" />
							<div className="flex space-x-1">
								{[...Array(4)].map((_, i) => (
									<Skeleton key={i} className="w-2 h-2 rounded-full" />
								))}
							</div>
						</div>
					</div>
				</div>
			</CardHeader>

			<CardContent>
				<div className="grid grid-rows-[auto_1fr_auto] gap-3 min-h-50">
					{/* Mess hall selector skeleton */}
					<div className="bg-muted/30 rounded-lg p-3 border border-border">
						<Skeleton className="h-8 w-full" />
					</div>

					{/* Meals grid skeleton */}
					<div className="grid grid-cols-2 gap-2">
						{[...Array(4)].map((_, i) => (
							<Skeleton key={i} className="h-12 rounded-lg" />
						))}
					</div>

					{/* Action buttons skeleton */}
					<div className="h-9 flex items-center">
						<div className="flex gap-2 w-full">
							<Skeleton className="flex-1 h-7" />
							<Skeleton className="flex-1 h-7" />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function DayCard({
	date,
	daySelections,
	dayMessHallId,
	defaultMessHallId,
	onMealToggle,
	onMessHallChange,
	formattedDate,
	dayOfWeek,
	isToday,
	isDateNear,
	pendingChanges,
	isSaving = false,
	selectedMealsCount,
	dishes,
}: DayCardProps) {
	const hasPendingChanges = pendingChanges.some(
		(change) => change.date === date,
	);
	const selectedCount = selectedMealsCount ?? countSelectedMeals(daySelections);

	const isUsingNonDefaultMessHall =
		dayMessHallId && dayMessHallId !== defaultMessHallId;

	const cardState = {
		hasPendingChanges,
		selectedCount,
		isUsingNonDefaultMessHall,
		isEmpty: selectedCount === 0,
		isFull: selectedCount === 4,
		hasPartialSelection: selectedCount > 0 && selectedCount < 4,
	};

	const cardClasses = cn(
		// Base card with tokens
		"w-80 flex-shrink-0 transition-all duration-200 hover:shadow-md relative",
		"bg-card text-card-foreground border border-border",
		{
			// Main visual states
			"ring-2 ring-primary shadow-lg bg-primary/5": isToday,
			"ring-1 ring-accent bg-accent/10":
				cardState.hasPendingChanges && !isToday,
			"opacity-75 grayscale-[0.3]": isDateNear && !isToday,

			// Fill states
			"bg-primary/10 border-primary/40": cardState.isFull && !isToday,
			"bg-secondary/10 border-secondary/40":
				cardState.hasPartialSelection &&
				!isToday &&
				!cardState.hasPendingChanges,
			"bg-muted/30 border-border":
				cardState.isEmpty && !isToday && !cardState.hasPendingChanges,
		},
	);

	const handleMealToggle = (meal: keyof DayMeals) => {
		onMealToggle(date, meal);
	};

	const handleMessHallChange = (newMessHallId: string) => {
		onMessHallChange(date, newMessHallId);
	};

	const isDisabled = isSaving || isDateNear;

	return (
		<Card className={cardClasses}>
			<CardHeader className="pb-3">
				{/* Header with fixed grid */}
				<div className="grid grid-cols-[1fr_auto] gap-4 items-start">
					{/* Left section */}
					<div className="flex items-center space-x-2 min-w-0">
						<Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
						<div className="min-w-0">
							<h3 className="font-semibold text-foreground truncate">
								{formattedDate}
							</h3>
							<p className="text-sm text-muted-foreground capitalize truncate">
								{dayOfWeek}
							</p>
						</div>
					</div>

					{/* Right section - badges/indicators */}
					<div className="flex items-center space-x-1 shrink-0">
						{isSaving && (
							<Loader2 className="h-4 w-4 animate-spin text-primary" />
						)}
						{isDateNear && <Clock className="h-4 w-4 text-accent" />}
						{isToday && (
							<Badge variant="default" className="text-xs px-2 py-0">
								Hoje
							</Badge>
						)}
						{cardState.hasPendingChanges && (
							<Badge
								variant="outline"
								className="text-xs px-2 py-0 border-accent text-accent"
							>
								Saving
							</Badge>
						)}
					</div>
				</div>

				{/* Progress bar - fixed height */}
				<div className="h-12 flex items-center">
					{cardState.selectedCount > 0 && (
						<div className="w-full bg-background/80 backdrop-blur-sm rounded-lg p-2 border border-border">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-foreground">
									{cardState.selectedCount}/4 meals
								</span>
								<div className="flex space-x-1">
									{MEAL_TYPES.map((meal) => {
										const mealKey = meal.value as keyof DayMeals; // aligns to DB: cafe/almoco/janta/ceia
										const isSelected = daySelections[mealKey];
										return (
											<div
												key={meal.value}
												className={cn(
													"w-2 h-2 rounded-full transition-all duration-200",
													isSelected
														? "bg-primary scale-110"
														: "bg-muted-foreground/30",
												)}
												title={`${meal.label}: ${
													isSelected ? "Confirmed" : "Not going"
												}`}
											/>
										);
									})}
								</div>
							</div>
						</div>
					)}
				</div>
			</CardHeader>

			<CardContent>
				{/* Main grid with fixed min height */}
				<div className="grid grid-rows-[auto_1fr_auto] gap-3 min-h-50">
					{/* Mess hall selector */}
					<div className="bg-accent/10 backdrop-blur-sm rounded-lg p-3 border border-accent/30">
						<MessHallSelector
							value={dayMessHallId}
							onChange={handleMessHallChange}
							disabled={isDisabled}
							hasDefaultMessHall={false}
						/>
					</div>

					{/* Meals grid 2x2 */}
					<div className="grid grid-cols-2 gap-2">
						{MEAL_TYPES.map((meal) => {
							const mealKey = meal.value as keyof DayMeals; // cafe/almoco/janta/ceia
							const mealDishes = dishes?.[mealKey];

							return (
								<MealButton
									key={meal.value}
									meal={meal}
									isSelected={daySelections[mealKey]}
									onToggle={() => handleMealToggle(mealKey)}
									disabled={isDisabled}
									compact={true}
									dishes={mealDishes}
								/>
							);
						})}
					</div>

					{/* Action buttons */}
					<div className="h-9 flex items-center">
						{!isDisabled && (
							<div className="flex gap-2 w-full">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										MEAL_TYPES.forEach((meal) => {
											const mealKey = meal.value as keyof DayMeals;
											if (!daySelections[mealKey]) {
												handleMealToggle(mealKey);
											}
										});
									}}
									className="flex-1 text-xs h-7"
								>
									Todas
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										MEAL_TYPES.forEach((meal) => {
											const mealKey = meal.value as keyof DayMeals;
											if (daySelections[mealKey]) {
												handleMealToggle(mealKey);
											}
										});
									}}
									className="flex-1 text-xs h-7"
								>
									Limpar
								</Button>
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

// Hooks unchanged in behavior (strings already in English)
export const useDayCardData = (
	date: string,
	todayString: string,
	isDateNear: (date: string) => boolean,
	formatDate: (date: string) => string,
	getDayOfWeek: (date: string) => string,
	daySelections: DayMeals,
	pendingChanges: PendingChange[],
) => {
	const selectedMealsCount = countSelectedMeals(daySelections);
	const hasPendingChanges = pendingChanges.some(
		(change) => change.date === date,
	);

	return {
		formattedDate: formatDate(date),
		dayOfWeek: getDayOfWeek(date),
		selectedMealsCount,
		isDateNear: isDateNear(date),
		isToday: date === todayString,
		hasPendingChanges,
		isEmpty: selectedMealsCount === 0,
		isFull: selectedMealsCount === 4,
		hasPartialSelection: selectedMealsCount > 0 && selectedMealsCount < 4,
	};
};

export const useDayCardOptimization = (
	dates: string[],
	selections: Record<string, DayMeals>,
) => {
	const optimizedData: Record<
		string,
		{ selectedCount: number; isEmpty: boolean; isFull: boolean }
	> = {};

	dates.forEach((date) => {
		const daySelections = selections[date];
		const selectedCount = daySelections ? countSelectedMeals(daySelections) : 0;

		optimizedData[date] = {
			selectedCount,
			isEmpty: selectedCount === 0,
			isFull: selectedCount === 4,
		};
	});

	return optimizedData;
};

export default DayCard;
