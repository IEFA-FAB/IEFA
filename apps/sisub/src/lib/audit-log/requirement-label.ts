/**
 * @module requirement-label
 * O que a coluna "Exigência" da tela de auditoria diz de cada linha.
 *
 * `sensitive_operation_log.assurance` só aceita `session` ou `fresh` (CHECK da coluna), e duas
 * origens gravam `session` sem que a operação exija elevação nenhuma:
 *
 *   - mudança de acesso do sisub classificada `"none"` no registro (revogar/apagar a própria
 *     chave MCP): a função SQL registra SEMPRE, e o grau mais baixo que a coluna aceita é
 *     `session` (`atomicAuditFor`);
 *   - forms, portal, rumaer, sucont, contrate e scripts: esses apps não têm registro de
 *     garantia nem piso de segundo fator — `session` lá quer dizer "havia uma sessão
 *     autenticada", e nada mais.
 *
 * Rotular essas linhas como "Exige sessão elevada" afirmaria uma exigência que não existe. Então
 * a frase sai do REGISTRO quando a operação é do sisub (a fonte única do que ela exige), e,
 * fora dele, `session` é só "sessão autenticada". Nenhum valor novo na coluna: a correção é de
 * leitura.
 *
 * Pura — o registro entra por injeção (`lookup`), para o teste não depender dele.
 */

export type RequirementTone = "warning" | "secondary" | "outline"

export type RequirementLabel = { label: string; tone: RequirementTone }

/** Grau que o registro de garantia do sisub declara para a operação, ou `null` fora dele. */
export type RegistryLookup = (operation: string) => "none" | "session" | "fresh" | null

const FRESH: RequirementLabel = { label: "Exige elevação recente", tone: "warning" }
const ELEVATED: RequirementLabel = { label: "Exige sessão elevada", tone: "secondary" }
const AUTHENTICATED: RequirementLabel = { label: "Sessão autenticada", tone: "outline" }
const SCRIPT: RequirementLabel = { label: "Script (sem sessão)", tone: "outline" }

export function describeRequirement(operation: string, recorded: string, lookup: RegistryLookup): RequirementLabel {
	// Scripts de manutenção rodam com a URL do banco e um `--actor` declarado: não houve sessão.
	if (operation.startsWith("script.")) return SCRIPT

	const classified = lookup(operation)
	if (classified !== null) {
		if (classified === "fresh") return FRESH
		if (classified === "session") return ELEVATED
		return AUTHENTICATED
	}

	// Fora do registro: `fresh` só é gravado por quem exigiu; `session` é só autenticação.
	return recorded === "fresh" ? FRESH : AUTHENTICATED
}
