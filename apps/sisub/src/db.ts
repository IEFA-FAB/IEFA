import { Collection, Database } from "@tanstack/react-db";

export interface MealForecast {
	id: string; // date-meal
	date: string;
	meal: string;
	willEat: boolean;
	messHallId: string;
	userId: string;
	synced: boolean;
}

export const mealForecastsCollection = new Collection<MealForecast>({
	name: "mealForecasts",
	primaryKey: "id",
});

export const db = new Database({
	databaseName: "sisub-db",
	collections: [mealForecastsCollection],
});
