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
	owner_id: z.string().nullable(),
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
