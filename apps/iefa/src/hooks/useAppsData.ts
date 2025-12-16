// hooks/useAppsData.ts
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { DbApp } from "@/types/domain";

export const APPS_QUERY_KEY = "appsData";

export function useAppsData(limit = 50) {
	return useSuspenseQuery({
		queryKey: [APPS_QUERY_KEY, limit],
		queryFn: async (): Promise<DbApp[]> => {
			const { data, error } = await supabase
				.schema("iefa")
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
          contributors:app_contributors!app_contributors_app_id_fkey (
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
