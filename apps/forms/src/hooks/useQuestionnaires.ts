import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { useTenant } from "@/lib/tenant"
import { getQuestionnairesFn } from "@/server/forms.fn"

export const questionnairesQueryOptions = (tags?: string[] | null) =>
	queryOptions({
		queryKey: ["questionnaires", tags ?? null],
		queryFn: () => getQuestionnairesFn({ data: { tags: tags ?? undefined } }),
	})

export function useQuestionnaires() {
	const { tagFilter } = useTenant()
	return useSuspenseQuery(questionnairesQueryOptions(tagFilter))
}
