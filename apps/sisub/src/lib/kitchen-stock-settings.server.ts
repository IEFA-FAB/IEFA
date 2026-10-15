import { publicDbMessage } from "@/lib/db-error-message"
import { getServerClient } from "@/lib/supabase.server"

/**
 * Configuração de estoque da cozinha, já com os defaults resolvidos pelo banco.
 *
 * Lê `inventory.kitchen_settings()`, a mesma função que as regras SQL usam (aprovação de
 * ajuste, segregação). Antes cada fn lia a tabela e repetia os defaults em TS (`?? 500`,
 * `?? 10`…): uma cópia a mais que, mudada sem as outras, fazia a tela mostrar um limite e o
 * banco aplicar outro. Sem linha para a cozinha, a função devolve os defaults.
 *
 * Leitura que FALHA lança: cair num default aqui trocaria a regra da cozinha pela de fábrica
 * em silêncio.
 */
export async function readKitchenStockSettings(kitchenId: number) {
	const { data, error } = await getServerClient("inventory").rpc("kitchen_settings", { p_kitchen_id: kitchenId })
	if (error) throw new Error(`Erro ao carregar a configuração de estoque da cozinha: ${publicDbMessage(error)}`)
	if (!data) throw new Error("Erro ao carregar a configuração de estoque da cozinha: resposta vazia")
	return data
}
