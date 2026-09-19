/**
 * Conceder e revogar grant inline COM auditoria — atômico, numa transação do banco.
 *
 * Chama `access_control.change_module_permission` (migrations 20260918130335 e
 * 20260919005526), que grava o grant (ou apaga a partição da chave) e a linha de `access_control.sensitive_operation_log` na MESMA
 * transação: ou os dois entram, ou nenhum. Gravar o log pelo app depois da escrita deixava
 * duas janelas — o log falhar com o grant já confirmado, e o beneficiário usar o acesso
 * antes de uma compensação que também podia falhar. Ver o cabeçalho da migration.
 *
 * Agnóstico de app: o contrate é o primeiro consumidor, e sisub, sucont e rumaer migram para
 * cá no PR seguinte (as funções não auditadas de `module-permissions.ts` ficam até lá).
 *
 * ## O ator sai da SESSÃO — sempre
 *
 * `actorId` é o `userId` do contexto que o guard de administração acabou de autorizar
 * (`requireLevel`/`requireAlphaAdmin`/...). NUNCA um campo do corpo da requisição: a função
 * SQL é SECURITY INVOKER da service role e grava o ator que receber — aceitar o id do
 * chamador deixaria qualquer administrador registrar a concessão em nome de outro, e o log
 * deixaria de responder "quem fez". O validator da server function não deve nem TER campo
 * de ator (o contrate tem teste de contrato para isso).
 *
 * ## Semântica
 *
 * A mesma de `grantModulePermission`/`revokeModulePermission`:
 *   - `grant` com `level > 0` só toca a linha de ALLOW da chave; com `level <= 0`, só a de
 *     DENY. Os dois coexistem por desenho (dois índices únicos parciais);
 *   - `grant` substitui o prazo (`expiresAt` nulo = sem prazo): conceder é acesso vivo;
 *   - `revoke` apaga só a PARTIÇÃO pedida (`partition`): `allow`, `deny` ou `all` (as duas,
 *     o default). Revogar o allow nunca leva junto o deny da mesma chave — era assim que um
 *     bloqueio sumia sem ninguém ter decidido retirá-lo. Partição sem linha é
 *     `PermissionChangeError("NOT_FOUND")`, e NADA é registrado — revogar o que não existia
 *     não é algo que aconteceu;
 *   - o `grant` devolve `denyPresent`: há um deny VIVO na mesma chave depois da concessão.
 *     Deny vence (`hasPermission`), então o allow recém-gravado não vale enquanto ele
 *     existir — a tela tem de dizer isso, e não só "concedido".
 *
 * Quem pode conceder o quê (`assertGrantable`, níveis válidos por módulo) continua no app,
 * ANTES desta chamada — inclusive quem mexe em deny (`touchesDenyPartition`).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AppModule } from "./types.ts"

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
type AnySupabaseClient = SupabaseClient<any, any>

export type PermissionChangeAction = "grant" | "revoke"

/**
 * A partição da chave: `allow` (`level > 0`), `deny` (`level <= 0`) ou as duas (`all`). As
 * duas linhas coexistem na mesma chave por desenho (dois índices únicos parciais).
 */
export type PermissionPartition = "allow" | "deny" | "all"

/** A partição de uma linha, pelo sinal do nível — a mesma fronteira dos índices parciais. */
export function partitionOfLevel(level: number): Exclude<PermissionPartition, "all"> {
	return level > 0 ? "allow" : "deny"
}

export interface ChangeModulePermissionInput {
	/** Usuário da SESSÃO, do guard de administração. Nunca do input. */
	actorId: string
	/** Prefixo da operação no log: `${app}.permission.${action}`. Minúsculas, dígitos e hífen. */
	app: string
	action: PermissionChangeAction
	targetUserId: string
	module: AppModule
	/** Obrigatório no `grant` (`> 0` allow, `<= 0` deny); ausente no `revoke`. */
	level?: number | null
	unitId?: number | null
	kitchenId?: number | null
	messHallId?: number | null
	/** Só no `grant`. ISO 8601; `null`/ausente = sem prazo. */
	expiresAt?: string | null
	/**
	 * Só no `revoke`: qual partição da chave sai. Default `all` (allow e deny). No `grant` a
	 * partição sai do sinal do nível, e este campo é ignorado.
	 */
	partition?: PermissionPartition
	/** Grau de garantia exigido na execução, como no resto do log. Default `session`. */
	assurance?: "session" | "fresh"
}

export interface PermissionChangeResult {
	/** A linha gravada em `sensitive_operation_log`. */
	logId: string
	action: PermissionChangeAction
	/** A partição tocada: a do nível (`grant`) ou a pedida (`revoke`). */
	partition: PermissionPartition
	/** A linha concedida (`grant`); `null` no `revoke`. */
	permissionId: string | null
	/** Nível anterior na mesma partição (`grant`) ou o removido (`revoke`); `null` se não havia. */
	previousLevel: number | null
	/** Linhas removidas no `revoke` (allow e/ou deny); `0` no `grant`. */
	removed: number
	/**
	 * `grant`: há deny VIVO na mesma chave depois da concessão — o allow concedido não vale
	 * enquanto ele existir. `null` no `revoke` (não é calculado).
	 */
	denyPresent: boolean | null
}

export type PermissionChangeErrorCode = "INVALID" | "NOT_FOUND" | "REFERENCE_NOT_FOUND" | "ACTOR_NOT_FOUND" | "CONFLICT" | "FAILED"

const ERROR_MESSAGE: Record<PermissionChangeErrorCode, string> = {
	INVALID: "Alteração de acesso inválida.",
	NOT_FOUND: "Não há acesso concedido nesta chave para revogar — acesso por política anexada se retira desanexando a política.",
	REFERENCE_NOT_FOUND: "Usuário ou escopo (OM, cozinha, refeitório) inexistente.",
	ACTOR_NOT_FOUND: "Sua conta não foi encontrada no cadastro de usuários; a alteração não foi feita.",
	CONFLICT: "Outra alteração no mesmo acesso aconteceu ao mesmo tempo. Tente de novo.",
	FAILED: "Falha ao alterar o acesso. Confira a lista antes de tentar de novo.",
}

/**
 * Falha da alteração de acesso. `message` já é a frase para o usuário; `code` é estável para
 * o app decidir o status HTTP. O SQL cru nunca chega à tela — fica em `cause`, para o log.
 */
export class PermissionChangeError extends Error {
	constructor(
		public readonly code: PermissionChangeErrorCode,
		cause?: unknown
	) {
		super(ERROR_MESSAGE[code], { cause })
		this.name = "PermissionChangeError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/**
 * A alteração cria, altera ou remove uma linha de DENY? Um `grant` com `level <= 0`, ou um
 * `revoke` que não se restringe ao allow. Puro — é o que o app passa a `assertGrantable`
 * (`touchesDeny`): mexer em bloqueio é só do administrador global.
 */
export function touchesDenyPartition(change: Pick<ChangeModulePermissionInput, "action" | "level" | "partition">): boolean {
	if (change.action === "grant") return change.level !== null && change.level !== undefined && change.level <= 0
	return (change.partition ?? "all") !== "allow"
}

/**
 * Argumentos nomeados da RPC. Puro — é o mapeamento que o teste fixa.
 *
 * `p_partition` só vai no `revoke`: no `grant` a função a tira do nível, e omitir o argumento
 * mantém a concessão compatível com a assinatura anterior à 20260919005526.
 */
export function toPermissionChangeArgs(input: ChangeModulePermissionInput): Record<string, string | number | null> {
	const args: Record<string, string | number | null> = {
		p_actor: input.actorId,
		p_app: input.app,
		p_action: input.action,
		p_user: input.targetUserId,
		p_module: input.module,
		p_level: input.action === "grant" ? (input.level ?? null) : null,
		p_unit_id: input.unitId ?? null,
		p_kitchen_id: input.kitchenId ?? null,
		p_mess_hall_id: input.messHallId ?? null,
		p_expires_at: input.action === "grant" ? (input.expiresAt ?? null) : null,
		p_assurance: input.assurance ?? "session",
	}
	if (input.action === "revoke") args.p_partition = input.partition ?? "all"
	return args
}

/** Traduz o erro do PostgREST pela mensagem estável que a função levanta. Puro. */
export function toPermissionChangeError(error: { message?: string; code?: string }): PermissionChangeError {
	const message = error.message ?? ""
	if (message.includes("PERMISSION_CHANGE_INVALID")) return new PermissionChangeError("INVALID", error)
	if (message.includes("PERMISSION_NOT_FOUND")) return new PermissionChangeError("NOT_FOUND", error)
	if (message.includes("PERMISSION_ACTOR_NOT_FOUND")) return new PermissionChangeError("ACTOR_NOT_FOUND", error)
	if (message.includes("PERMISSION_REFERENCE_NOT_FOUND")) return new PermissionChangeError("REFERENCE_NOT_FOUND", error)
	if (message.includes("PERMISSION_CONFLICT")) return new PermissionChangeError("CONFLICT", error)
	return new PermissionChangeError("FAILED", error)
}

type RpcResult = {
	log_id: string
	action: PermissionChangeAction
	partition?: PermissionPartition
	permission_id: string | null
	previous_level: number | null
	removed: number
	deny_present?: boolean | null
}

/**
 * Concede ou revoga um grant inline e registra a operação, atomicamente. Recebe qualquer
 * cliente service role (o schema é fixado aqui). Lança `PermissionChangeError`.
 */
export async function changeModulePermission(client: AnySupabaseClient, input: ChangeModulePermissionInput): Promise<PermissionChangeResult> {
	const { data, error } = await client.schema("access_control").rpc("change_module_permission", toPermissionChangeArgs(input))
	if (error) throw toPermissionChangeError(error)

	const row = data as RpcResult | null
	// Sem corpo e sem erro não é "feito": não há `log_id` que prove a gravação.
	if (!row?.log_id) throw new PermissionChangeError("FAILED", new Error("change_module_permission sem retorno"))
	return {
		logId: row.log_id,
		action: row.action,
		// Sem `partition` no corpo só a versão anterior à 20260919005526, que revogava a chave inteira.
		partition: row.partition ?? (input.action === "revoke" ? "all" : partitionOfLevel(input.level ?? 0)),
		permissionId: row.permission_id ?? null,
		previousLevel: row.previous_level ?? null,
		removed: row.removed ?? 0,
		denyPresent: row.deny_present ?? null,
	}
}
