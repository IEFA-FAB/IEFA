// hooks/useAppsData.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type DbContributor = {
	label: string;
	url: string | null;
	icon_key: string | null;
};

export type DbApp = {
	title: string;
	description: string;
	to_path: string | null;
	href: string | null;
	icon_key: string | null;
	external: boolean | null;
	badges: string[] | null;
	contributors: DbContributor[] | null;
};

export const APPS_QUERY_KEY = "appsData";

export function useAppsData(limit = 6) {
	return useQuery({
		queryKey: [APPS_QUERY_KEY, limit],
		queryFn: async (): Promise<DbApp[]> => {
			const { data, error } = await supabase
				.from("apps")
				.select(
					`
          title,
          description,
          to_path,
          href,
          icon_key,
          external,
          badges,
          contributors:app_contributors (
            label,
            url,
            icon_key
          )
        `,
				)
				.order("title", { ascending: true })
				.limit(limit);

			if (error) {
				throw new Error(error.message);
			}
			return (data ?? []) as DbApp[];
		},
		staleTime: 1000 * 60 * 10, // 10 minutos
	});
}
