import { queryOptions } from "@tanstack/react-query";
import type { MealKey } from "@/types/domain";
import supabase from "@/utils/supabase";

export const QUERY_KEYS = {
	messHall: (code: string) => ["messHall", code] as const,
	mealForecast: (
		userId: string,
		date: string,
		meal: MealKey,
		messHallId: number,
	) => ["mealForecast", userId, date, meal, messHallId] as const,
} as const;

/* essa é a estrutura de mess_halls no banco
create table sisub.mess_halls (
  id bigserial not null,
  unit_id bigint not null,
  code text not null,
  display_name text null,
  constraint mess_halls_pkey primary key (id),
  constraint mess_halls_code_key unique (code),
  constraint mess_halls_unit_fk foreign KEY (unit_id) references sisub.units (id),
  constraint mess_halls_unit_id_fkey foreign KEY (unit_id) references sisub.units (id) on delete RESTRICT
) TABLESPACE pg_default;

create index IF not exists mess_halls_unit_id_idx on sisub.mess_halls using btree (unit_id) TABLESPACE pg_default;
*/

export async function fetchMessHallByCode(code: string) {
	const { data, error } = await supabase
		.schema("sisub")
		.from("mess_halls")
		.select("id, unit_id, code, display_name")
		.eq("code", code)
		.maybeSingle();

	if (error) throw error;
	return data; // Returns MessHall or null
}

export const messHallByCodeQueryOptions = (code: string | undefined) =>
	queryOptions({
		queryKey: QUERY_KEYS.messHall(code ?? ""),
		queryFn: async () => {
			if (!code) return null;
			return fetchMessHallByCode(code);
		},
		enabled: !!code,
		staleTime: 60 * 60 * 1000, // 1 hour (mess halls change rarely)
	});

export async function fetchUserMealForecast(
	userId: string,
	date: string,
	meal: MealKey,
	messHallId: number,
) {
	const { data, error } = await supabase
		.schema("sisub")
		.from("meal_forecasts")
		.select("will_eat")
		.eq("user_id", userId)
		.eq("date", date)
		.eq("meal", meal)
		.eq("mess_hall_id", messHallId)
		.maybeSingle();

	if (error) throw error;
	return data; // { will_eat: boolean } or null
}

export const userMealForecastQueryOptions = (
	userId: string | undefined,
	date: string,
	meal: MealKey,
	messHallId: number | null | undefined,
) =>
	queryOptions({
		queryKey: QUERY_KEYS.mealForecast(
			userId ?? "",
			date,
			meal,
			messHallId ?? 0,
		),
		queryFn: async () => {
			if (!userId || !messHallId) return null;
			return fetchUserMealForecast(userId, date, meal, messHallId);
		},
		enabled: !!userId && !!messHallId,
	});
