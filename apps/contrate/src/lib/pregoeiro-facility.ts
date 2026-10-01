/**
 * Contrato das frases do pregoeiro (`iefa.facilities_pregoeiro`).
 *
 * Fora de `server/pregoeiro.fn.ts` para o teste conferir o contrato sem carregar o client
 * do Supabase (e o `env.server` junto).
 */

import { z } from "zod"

export const FacilityPayloadSchema = z.object({
	phase: z.string(),
	title: z.string(),
	content: z.string(),
	tags: z.array(z.string()).nullable(),
	// Ignorado: o dono vem sempre da sessão (`insertFacilityFn`). Aceito só para não recusar
	// cliente antigo que ainda o manda.
	owner_id: z.string().nullable().optional(),
	default: z.boolean().nullable().optional(),
})

/**
 * O que a EDIÇÃO de uma frase pode mudar: o conteúdo, e nada da autoria ou do alcance.
 *
 * O `update` gravava o payload inteiro. A criação já recusava `default: true`, mas a edição
 * não: o autor promovia a própria frase a padrão do sistema — exibida a todo mundo — e podia
 * trocar o `owner_id`, entregando a frase a outra pessoa ou tirando-a do próprio filtro de
 * dono. `owner_id` e `default` saem daqui; o `z.object` descarta a chave desconhecida, então
 * a tela que ainda os manda segue funcionando e eles nunca chegam ao banco.
 */
export const FacilityUpdateSchema = FacilityPayloadSchema.pick({ phase: true, title: true, content: true, tags: true })

export type FacilityUpdate = z.infer<typeof FacilityUpdateSchema>

/** Colunas lidas para a biblioteca pública; `owner_id` só para calcular `is_mine`. */
export const FACILITY_READ_COLUMNS = "id, created_at, phase, title, content, tags, default, owner_id"

/**
 * A biblioteca é pública (lida antes do login) e devolvia o `owner_id` de toda frase: o UUID
 * de cada autor, que liga a frase à conta. A tela só precisa saber se a frase é de quem está
 * vendo, para oferecer a edição — e isso o servidor responde com a sessão.
 */
export function toPublicFacility<T extends { owner_id: string | null }>(row: T, viewerId: string | null): Omit<T, "owner_id"> & { is_mine: boolean } {
	const { owner_id: ownerId, ...rest } = row
	return { ...rest, is_mine: viewerId !== null && ownerId === viewerId }
}
