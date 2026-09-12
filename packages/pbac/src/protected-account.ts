/**
 * Conta protegida — a conta que ALCANÇA alguma operação sensível.
 *
 * Por que isto não é "nível 3": a primeira versão do desenho amarrou fator reserva e
 * ausência de códigos de recuperação ao nível 3, e isso cegou para o dinheiro. A execução
 * orçamentária do sisub passa por `requireUnitScope(2, …)` — módulo `unit`, nível **2**.
 * Pelo recorte antigo, o operador que empenha teria códigos de recuperação, guardaria no
 * e-mail, e "senha + caixa de e-mail" voltaria a valer empenho: exatamente o que a mudança
 * diz fechar.
 *
 * Por que a entrada é uma LISTA e não um registro: a classificação por operação mora no
 * app (`apps/sisub/src/server/assurance-registry.ts`), que é quem conhece as suas server
 * functions. O pacote recebe a lista já DERIVADA dele e não guarda cópia nenhuma — duas
 * listas sobre o mesmo assunto se contradizem em silêncio, e a contradição só aparece
 * quando alguém é barrado (ou passa) sem explicação.
 */

import { hasPermission } from "./has-permission.ts"
import type { AppModule, UserPermission } from "./types.ts"

/**
 * Um par (módulo, nível mínimo) que alcança alguma operação classificada como
 * `"session"` ou `"fresh"`. É a projeção do registro de classificação do app, computada
 * por ele — nunca digitada aqui.
 */
export interface AssuranceReachability {
	module: AppModule
	/** Menor nível que já alcança alguma operação classificada neste módulo. */
	level: number
}

/**
 * `true` quando as permissões efetivas alcançam alguma operação classificada.
 *
 * A consulta é feita **sem escopo** de propósito: alcançar a operação em UMA unidade já
 * torna a conta capaz de empenhar, e o critério de fator reserva é sobre a conta, não
 * sobre o escopo. `hasPermission` sem escopo aceita qualquer escopo concedido — e continua
 * aplicando a precedência de deny, então um `level 0` sem escopo no módulo tira a conta da
 * lista, que é o resultado certo: ela não alcança mais nada ali.
 *
 * @param permissions - Permissões EFETIVAS do usuário (allows + denies), como em `hasPermission`
 * @param reachability - Pares (módulo, nível) derivados do registro de classificação do app
 */
export function isProtectedAccount(permissions: UserPermission[], reachability: readonly AssuranceReachability[]): boolean {
	return reachability.some((requirement) => hasPermission(permissions, requirement.module, requirement.level))
}
