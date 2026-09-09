import { queryOptions } from "@tanstack/react-query"
import { getEditorsFn, getQuestionnaireFn, getViewersFn } from "@/server/forms.fn"

/**
 * Factories compartilhadas por loader e componente.
 *
 * Estas três eram declaradas localmente em cada rota que precisava delas —
 * `["questionnaire", id]` existia em três arquivos e `["viewers", id]` em dois,
 * todos escrevendo a mesma chave de cache a partir de objetos independentes. A
 * invalidação cruzada entre as rotas já contava com a chave ser a mesma, então
 * bastava alguém acrescentar `select` ou `staleTime` a uma das cópias para as
 * telas passarem a ler entradas diferentes, sem erro nenhum.
 */
export const questionnaireQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["questionnaire", id] as const,
		queryFn: () => getQuestionnaireFn({ data: { id } }),
	})

export const viewersQueryOptions = (questionnaireId: string) =>
	queryOptions({
		queryKey: ["viewers", questionnaireId] as const,
		queryFn: () => getViewersFn({ data: { questionnaire_id: questionnaireId } }),
	})

export const editorsQueryOptions = (questionnaireId: string) =>
	queryOptions({
		queryKey: ["editors", questionnaireId] as const,
		queryFn: () => getEditorsFn({ data: { questionnaire_id: questionnaireId } }),
	})
