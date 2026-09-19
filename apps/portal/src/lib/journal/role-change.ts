/**
 * Troca de PAPEL no journal (`journal.user_profiles.role`) — regras puras.
 *
 * `editor` administra o corpo editorial inteiro (inclusive o papel dos outros); `reviewer`
 * recebe parecer às cegas. Trocar o papel é conceder ou retirar acesso, e por isso passa pela
 * função SQL auditada `journal.change_user_role` (migration 20260921130000): a troca e a linha
 * de `access_control.sensitive_operation_log` entram na MESMA transação, com o ator da SESSÃO.
 * Desde 20260921130100 o banco recusa troca de papel fora dela.
 *
 * Perfil e papel são UMA gravação (`journal.save_user_profile`): os campos do perfil e a troca
 * de papel entram juntos ou nada entra. Antes o portal gravava os campos e depois trocava o
 * papel — uma troca recusada deixava o nome já gravado. E a autorização da troca é decidida
 * ANTES de qualquer escrita (`planProfileSave` + `assertJournalRoleChangeAllowed`).
 *
 * Quem pode trocar papel: só editor (`assertRoleChangeAllowed`, em `auth.server.ts`). O editor
 * é administrador GLOBAL do journal: pode dar a si mesmo qualquer papel que já tem, mas NINGUÉM
 * retira a própria função de editor — trancaria o ator fora da administração (e, sendo o
 * último, todo mundo, com conserto só por SQL). É o `assertGrantable` do @iefa/pbac.
 */

import { assertGrantable } from "@iefa/pbac"
import type { UserRole } from "./types"

export const JOURNAL_ROLES = ["author", "reviewer", "editor"] as const satisfies readonly UserRole[]

function isJournalRole(value: unknown): value is UserRole {
	return typeof value === "string" && (JOURNAL_ROLES as readonly string[]).includes(value)
}

/**
 * Separa o papel do resto do payload do perfil. `role` ausente = não mexe no papel. Valor fora
 * dos três papéis é recusado AQUI, com frase, em vez de virar o 23514 do CHECK da coluna.
 */
export function splitRoleFromProfilePayload<T extends Record<string, unknown>>(payload: T): { role: UserRole | undefined; rest: Omit<T, "role"> } {
	const { role, ...rest } = payload
	if (role === undefined) return { role: undefined, rest }
	if (!isJournalRole(role)) throw new Error("Papel inválido: use author, reviewer ou editor.")
	return { role, rest }
}

/**
 * O que gravar: os campos do perfil (sem `id` — o alvo sai da sessão ou do parâmetro checado —
 * e sem `role`) e a troca de papel, SÓ se o papel pedido for diferente do atual. O formulário
 * de perfil reenvia o papel que a pessoa já tem a cada gravação; tratar isso como troca exigia
 * papel de editor de quem só editava a própria bio. Perfil inexistente conta como `author` —
 * é o papel com que ele nasce.
 */
export function planProfileSave(
	payload: Record<string, unknown>,
	currentRole: UserRole | null
): { fields: Record<string, unknown>; role: UserRole | undefined } {
	const { role, rest } = splitRoleFromProfilePayload(payload)
	const { id: _id, ...fields } = rest
	const effectiveCurrent = currentRole ?? "author"
	return { fields, role: role !== undefined && role !== effectiveCurrent ? role : undefined }
}

/**
 * Recusa (GrantNotAllowedError) o editor que retira a própria função de editor. Trocar o
 * papel de OUTRA pessoa, ou manter o próprio `editor`, passa.
 */
export function assertJournalRoleChangeAllowed(actorId: string, targetUserId: string, role: UserRole): void {
	assertGrantable({ actorId, coverage: "all" }, { userId: targetUserId, unitId: null, revokesAdministration: role !== "editor" })
}

/** Frases para a tela, pelos tokens estáveis da função SQL. */
const ROLE_ERROR_MESSAGES: Record<string, string> = {
	PROFILE_NOT_FOUND: "Perfil do journal não encontrado.",
	PROFILE_ALREADY_EXISTS: "O perfil já existe — edite-o em vez de criar outro.",
	PROFILE_FIELD_INVALID: "Campo de perfil ausente ou inválido.",
	ACCESS_ACTOR_NOT_FOUND: "Sua conta não foi encontrada no cadastro de usuários; a alteração não foi feita.",
	ACCESS_CHANGE_INVALID: "Papel inválido.",
}

export function toJournalRoleError(error: { message?: string; code?: string }): Error {
	return new Error(ROLE_ERROR_MESSAGES[error.message ?? ""] ?? "Falha ao salvar o perfil. Confira os dados antes de tentar de novo.", { cause: error })
}
