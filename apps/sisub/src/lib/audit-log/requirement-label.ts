/**
 * @module requirement-label
 * O que a coluna "Exigência" da tela de auditoria diz de cada linha.
 *
 * ## O valor GRAVADO é o fato
 *
 * `sensitive_operation_log.assurance` registra o grau que valia QUANDO a operação rodou. A
 * classificação no registro de garantia (`assurance-registry.ts`) muda com o tempo — uma
 * operação pode subir de `none` para `fresh` amanhã —, e ler a frase do registro de HOJE
 * reescreveria a história das linhas antigas. Então:
 *
 *   - `fresh` gravado → "Exige elevação recente". É o único grau que afirma elevação;
 *   - `session` gravado → NUNCA afirma elevação. A coluna só aceita `session`/`fresh` (CHECK), e
 *     `session` é também o que gravam as operações que não exigem nada: revogar/apagar a própria
 *     chave MCP (classificadas `"none"`, registradas assim por `atomicAuditFor`) e toda linha de
 *     forms, portal, rumaer, sucont e contrate, que não têm piso de segundo fator. O que
 *     `session` garante é que havia uma sessão autenticada — e é isso que a tela diz;
 *   - o nome da operação só REFINA `session` (script de manutenção não tem sessão), nunca o
 *     promove. O registro de garantia não é consultado: nenhuma frase aqui depende do que ele diz
 *     hoje.
 */

export type RequirementTone = "warning" | "outline"

export type RequirementLabel = { label: string; tone: RequirementTone }

const FRESH: RequirementLabel = { label: "Exige elevação recente", tone: "warning" }
const AUTHENTICATED: RequirementLabel = { label: "Sessão autenticada", tone: "outline" }
const SCRIPT: RequirementLabel = { label: "Script (sem sessão)", tone: "outline" }

export function describeRequirement(operation: string, recorded: string): RequirementLabel {
	if (recorded === "fresh") return FRESH
	// Scripts de manutenção rodam com a URL do banco e um `--actor` declarado: não houve sessão.
	if (operation.startsWith("script.")) return SCRIPT
	return AUTHENTICATED
}
