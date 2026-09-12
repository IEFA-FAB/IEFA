/**
 * @module mfa-recovery.server
 * Consequência, sobre os códigos de recuperação, de uma conta VIRAR protegida.
 *
 * ## O que isto resolve
 *
 * Conta protegida não dispõe de códigos de recuperação (design.md D9): para ela, "senha +
 * folha de papel" voltaria a valer empenho. A regra é fácil de aplicar na EMISSÃO — e é
 * aplicada lá. O caso que escapa é o outro: o comensal que gerou dez códigos em março e, em
 * julho, recebe `unit` nível 2. A partir daquele instante ele alcança a execução
 * orçamentária, e os dez códigos de março continuariam valendo.
 *
 * Por isso toda concessão de permissão passa por aqui: se o alvo passou a ser conta
 * protegida, os códigos dele caem no mesmo ato.
 *
 * ## Por que a decisão mora no app, e não no domínio
 *
 * "Conta protegida" é derivada do REGISTRO DE CLASSIFICAÇÃO (`assuranceReachability()`), que
 * é do app — é ele que conhece as próprias server functions. O pacote de domínio não tem
 * como saber, e uma segunda lista lá dentro se contradiria com esta em silêncio.
 *
 * ## Por que não é best-effort silencioso, nem trava a concessão
 *
 * A falha PROPAGA para quem chama decidir. Nas server fns de permissão a chamada vem depois
 * do grant e o erro sobe: o administrador vê que a concessão foi feita mas os códigos não
 * caíram, e pode agir. O que NÃO acontece em nenhum caso é um código sobreviver sem
 * ninguém saber — e, mesmo que sobrevivesse, o consumo é barrado de novo em
 * `consumeRecoveryCodeFn`, que reavalia `isProtectedAccount` na hora de usar.
 *
 * @domain app
 */

import { isProtectedAccount } from "@iefa/pbac"
import { listEffectiveUserPermissions, revokeRecoveryCodes } from "@iefa/sisub-domain"
import type { UserPermission } from "@iefa/sisub-domain/types"
import { getDb } from "@/lib/db.server"
import { assuranceReachability } from "@/server/assurance-registry"

/**
 * Se o usuário passou a ser conta protegida, invalida os códigos de recuperação dele.
 *
 * Devolve quantos códigos caíram (`0` quando a conta não é protegida ou não tinha código).
 * As permissões são RELIDAS do banco, e não recebidas por parâmetro: o que decide é o estado
 * efetivo depois do grant — inclusive o que veio de política anexada, que o payload do grant
 * não conhece.
 */
export async function revokeRecoveryCodesIfProtected(userId: string): Promise<number> {
	const permissions = (await listEffectiveUserPermissions(getDb(), { userId })) as UserPermission[]
	if (!isProtectedAccount(permissions, assuranceReachability())) return 0
	return revokeRecoveryCodes(getDb(), userId)
}

/**
 * Versão best-effort, para chamar DEPOIS de uma concessão de permissão já confirmada.
 *
 * A revogação é higiene, não o gate: quem consome um código de recuperação tem a conta
 * REAVALIADA no momento do consumo e é recusado se tiver virado conta protegida. Deixar
 * esta limpeza derrubar a concessão seria trocar um risco contido por um concreto — a
 * concessão já foi gravada, então o erro subiria com a mutação aplicada e o administrador
 * repetiria a ação, criando grant duplicado.
 *
 * Devolve `null` quando não deu para limpar, para o chamador poder relatar sem falhar.
 */
export async function tryRevokeRecoveryCodesIfProtected(userId: string): Promise<number | null> {
	try {
		return await revokeRecoveryCodesIfProtected(userId)
	} catch {
		return null
	}
}
