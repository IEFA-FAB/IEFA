import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import { z } from "zod";

export const localMealForecastSchema = z.object({
	id: z.string(), // "YYYY-MM-DD-mealType"
	server_id: z.string().uuid().optional(), // UUID do banco
	date: z.string(), // "YYYY-MM-DD"
	meal: z.enum(["cafe", "almoco", "janta", "ceia"]),
	willEat: z.boolean(),
	messHallId: z.number(),
	userId: z.string(),
	synced: z.boolean(),
});

export type LocalMealForecast = z.infer<typeof localMealForecastSchema>;

export const mealForecastsCollection = createCollection(
	localStorageCollectionOptions({
		id: "meal-forecasts",
		storageKey: "sisub-meal-forecasts",
		getKey: (item) => item.id,
		schema: localMealForecastSchema,
	}),
);
