/**
 * Query options para dados de uniformes (loaders + componentes).
 */

import { queryOptions } from "@tanstack/react-query"
import { listAllVariantsFn } from "@/server/admin.fn"
import { getMyMilitaryProfileFn } from "@/server/military.fn"
import { listPieceItemsFn } from "@/server/pieceItems.fn"
import { listPiecesFn } from "@/server/pieces.fn"
import { getSignedImageUrlFn, getUniformPreviewImagesFn } from "@/server/storage.fn"
import { getUniformFn, listUniformsFn, type UniformListItem } from "@/server/uniforms.fn"

export type UniformFilters = {
	grupo?: UniformListItem["grupo"]
	categoria?: "oficiais" | "cadetes" | "suboficiais" | "sargentos" | "alunos_formacao" | "pracas"
}

export const uniformsQueryOptions = (filters: UniformFilters = {}) =>
	queryOptions({
		queryKey: ["rumaer", "uniforms", filters],
		queryFn: () => listUniformsFn({ data: filters }),
		staleTime: 1000 * 60 * 5,
	})

export const uniformQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["rumaer", "uniform", id],
		queryFn: () => getUniformFn({ data: { id } }),
		staleTime: 1000 * 60 * 5,
	})

export const allVariantsQueryOptions = () =>
	queryOptions({
		queryKey: ["rumaer", "all-variants"],
		queryFn: () => listAllVariantsFn(),
		staleTime: 1000 * 60 * 5,
	})

export const piecesQueryOptions = () =>
	queryOptions({
		queryKey: ["rumaer", "pieces"],
		queryFn: () => listPiecesFn(),
		staleTime: 1000 * 60 * 10,
	})

export const pieceItemsQueryOptions = (pieceId?: string) =>
	queryOptions({
		queryKey: ["rumaer", "piece-items", pieceId ?? null],
		queryFn: () => listPieceItemsFn({ data: { pieceId } }),
		staleTime: 1000 * 60 * 10,
	})

export const militaryProfileQueryOptions = () =>
	queryOptions({
		queryKey: ["rumaer", "military-profile"],
		queryFn: () => getMyMilitaryProfileFn(),
		staleTime: 1000 * 60 * 5,
	})

export const uniformPreviewImagesQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["rumaer", "uniform-preview-images", id],
		queryFn: () => getUniformPreviewImagesFn({ data: { id } }),
		staleTime: 1000 * 60 * 50, // < 1h (validade do signed URL)
	})

export const signedImageQueryOptions = (imagePath: string | null | undefined) =>
	queryOptions({
		queryKey: ["rumaer", "signed-image", imagePath],
		queryFn: () => (imagePath ? getSignedImageUrlFn({ data: { imagePath } }) : Promise.resolve(null)),
		enabled: !!imagePath,
		staleTime: 1000 * 60 * 50, // < 1h (validade do signed URL)
	})
