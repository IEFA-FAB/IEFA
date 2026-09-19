/**
 * Para onde uma cozinha pode transferir estoque.
 *
 * A transferência é EMPURRADA: quem cede lança o par `transfer_out`/`transfer_in` de uma vez, e a
 * cozinha de destino não confirma nada — é o fluxo do produto (a cozinha que recebe o excedente
 * prestes a vencer não tem por que recusar), e redesenhá-lo com aceite fica fora deste escopo.
 *
 * O que NÃO pode é o destino ser qualquer id digitado: a tela pede "Cozinha de destino (id)" em
 * campo livre, e o guard só olhava a ORIGEM. Um almoxarife lançava entrada no livro de uma cozinha
 * de outra OM, com quem não tem relação nenhuma — o saldo dela mudava sem ninguém de lá saber.
 *
 * Regra: o destino existe e (a) é da mesma OM da origem — lotação ou unidade compradora em comum —
 * ou (b) quem transfere também opera o estoque do destino.
 */

export interface KitchenUnits {
	unitId: number | null
	purchaseUnitId: number | null
}

function unitsOf(kitchen: KitchenUnits): number[] {
	return [kitchen.unitId, kitchen.purchaseUnitId].filter((id): id is number => id != null)
}

/** Problema do destino, ou `null` quando a transferência pode seguir. */
export function transferDestinationProblem(input: {
	origin: KitchenUnits | null
	destination: KitchenUnits | null
	callerOperatesDestination: boolean
}): string | null {
	if (!input.destination) return "Cozinha de destino não encontrada"
	if (input.callerOperatesDestination) return null
	const originUnits = new Set(unitsOf(input.origin ?? { unitId: null, purchaseUnitId: null }))
	if (unitsOf(input.destination).some((unitId) => originUnits.has(unitId))) return null
	return "A cozinha de destino não é da mesma OM da origem — transfira só entre cozinhas da mesma unidade, ou peça a quem opera o estoque do destino"
}
