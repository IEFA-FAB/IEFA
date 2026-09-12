/**
 * @module guards/require-assurance
 * Piso de GARANTIA DE IDENTIDADE dentro das operations do domínio.
 *
 * ## Por que o domínio também avalia, se o app já avalia
 *
 * A operation é o último ponto antes da escrita, e é o único que TODOS os chamadores
 * atravessam: a server function do sisub, o servidor MCP e a suíte de integração chamam
 * `createUserPermission` — não o `createUserPermissionFn`. Um piso que morasse só na camada de
 * transporte protegeria uma porta e deixaria as outras abertas. É a mesma razão pela qual os
 * guards de permissão vivem aqui e não no `beforeLoad`: foi assim que as 18 escritas de
 * domínio sem autorização existiram.
 *
 * ## A EXIGÊNCIA vem de fora; o domínio só a aplica
 *
 * A classificação por operação mora numa fonte única, no app
 * (`apps/sisub/src/server/assurance-registry.ts`), porque é ele que conhece as suas server
 * functions e é dele que a auditoria e o cálculo de conta protegida derivam. Repetir os graus
 * aqui criaria a segunda lista que o desenho proíbe — e duas listas sobre o mesmo assunto se
 * contradizem em silêncio, aparecendo só quando alguém é barrado (ou passa) sem explicação.
 *
 * Por isso a exigência CHEGA como parâmetro, com `{ require: "none" }` de default. O valor do
 * guard não é escolher o piso: é aplicá-lo no lugar certo — depois do gate de permissão e
 * antes de qualquer escrita.
 *
 * ## Ordem: permissão primeiro, garantia depois
 *
 * Toda operation classificada chama o seu `requirePermission(...)` ANTES desta função. Quem
 * não tem a permissão recebe negativa de permissão; inverter faria alguém sem acesso nenhum
 * receber um pedido de segundo fator — e ainda revelaria que a operação existe.
 */

import { type AssuranceRequirement, assertAssurance, NO_ASSURANCE } from "@iefa/pbac"
import type { UserContext } from "../types/context.ts"

export { type AssuranceRequirement, NO_ASSURANCE }

/**
 * Aplica o piso de garantia da operação.
 *
 * @param ctx         - Contexto JÁ aprovado pelo gate de módulo/nível da operation
 * @param requirement - Exigência vinda do registro de classificação do app. Default: nenhuma.
 * @throws {AssuranceRequiredError} de `@iefa/pbac`, com `code: "MFA_REQUIRED"` e o `nextStep`
 * que diz à UI qual das três telas abrir. O erro NÃO entra na hierarquia `DomainError` de
 * propósito: `handleDomainError` o mapeia num ramo próprio, para não achatar "prove quem você
 * é" em "acesso negado" — que é a leitura errada, numa operação que a pessoa pode fazer.
 */
export function requireAssurance(ctx: UserContext, requirement: AssuranceRequirement = NO_ASSURANCE): void {
	assertAssurance(ctx, requirement)
}
