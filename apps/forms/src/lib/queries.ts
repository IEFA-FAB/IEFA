import { queryOptions } from "@tanstack/react-query"
import { getEditorsFn, getMyResponseStateFn, getOmOptionsFn, getQuestionnaireFn, getViewersFn } from "@/server/forms.fn"

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

/**
 * Estado da resposta do usuário corrente para um questionário: rascunho em
 * andamento ou nada começado. Governa qual passo a tela de resposta abre, então
 * o loader semeia junto com o questionário — as duas leituras saem em paralelo.
 */
export const myResponseStateQueryOptions = (questionnaireId: string) =>
	queryOptions({
		queryKey: ["my-response-state", questionnaireId] as const,
		queryFn: () => getMyResponseStateFn({ data: { questionnaire_id: questionnaireId } }),
	})

/** Lista de OMs ativas. Usada pelo passo de metadados e pelo escopo de visualizadores. */
export const omOptionsQueryOptions = () =>
	queryOptions({
		queryKey: ["om-options"] as const,
		queryFn: () => getOmOptionsFn({ data: {} }),
	})
